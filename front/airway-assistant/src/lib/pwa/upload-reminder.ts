import {
  ensureOperatorRegistered,
  getOperatorProfile,
} from "@/lib/profile/operator-profile";

export const UPLOAD_REMINDER_SYNC_TAG =
  "airway-upload-reminder-v1";

export const UPLOAD_REMINDER_NOTIFICATION_TAG =
  "airway-upload-reminder";

interface SyncManagerLike {
  register(tag: string): Promise<void>;
  getTags?(): Promise<string[]>;
}


type RegistrationWithSync =
  ServiceWorkerRegistration & {
    sync?: SyncManagerLike;
  };

interface PushConfig {
  enabled?: boolean;
  public_key?: string | null;
}

interface PushTestResponse {
  sent?: number;
  failed?: number;
  active_subscriptions?: number;
  code?: string;
  detail?: string;
}

export type PushSetupResult =
  | "active"
  | "offline"
  | "not-configured"
  | "unsupported"
  | "pending"
  | "device-error";

export interface RealPushTestResult {
  ok: boolean;
  message: string;
  sent: number;
  failed: number;
}

type ConfigResult =
  | { state: "ready"; key: string }
  | { state: "disabled" }
  | { state: "unavailable" };

const BIND_RECHECK_MS =
  12 * 60 * 60 * 1000;

const SERVICE_WORKER_WAIT_MS = 5000;

let cachedConfig: ConfigResult | null = null;

let lastBoundToken: string | null = null;
let lastBoundEndpoint: string | null = null;
let lastBoundKey: string | null = null;
let lastBoundAt = 0;

let setupTask:
  Promise<PushSetupResult> | null = null;

function browserAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined"
  );
}

export function notificationsAvailable(): boolean {
  return (
    browserAvailable() &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!notificationsAvailable()) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestNotificationPermission():
  Promise<NotificationPermission | "unsupported"> {
  if (!notificationsAvailable()) {
    return "unsupported";
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export const requestUploadReminderPermission =
  requestNotificationPermission;

/* -------------------------------------------------------------------------- */
/* Service Worker                                                             */
/* -------------------------------------------------------------------------- */

export async function getReadyServiceWorkerRegistration():
  Promise<ServiceWorkerRegistration | null> {
  if (!notificationsAvailable()) {
    return null;
  }

  try {
    const registration =
      await navigator.serviceWorker.getRegistration("/");

    if (!registration) {
      return null;
    }

    if (registration.active) {
      return registration;
    }

    let timeoutId:
      ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(
        () => resolve(null),
        SERVICE_WORKER_WAIT_MS,
      );
    });

    try {
      return await Promise.race([
        navigator.serviceWorker.ready.then(
          (ready) => ready.active ? ready : null,
        ),
        timeout,
      ]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Background Sync                                                            */
/* -------------------------------------------------------------------------- */

export async function backgroundSyncAvailable():
  Promise<boolean> {
  const registration =
    await getReadyServiceWorkerRegistration();

  return (
    typeof (
      registration as RegistrationWithSync | null
    )?.sync?.register === "function"
  );
}

export async function registerUploadReminderSync():
  Promise<boolean> {
  const registration =
    await getReadyServiceWorkerRegistration();

  if (!registration) {
    return false;
  }

  const withSync =
    registration as RegistrationWithSync;

  if (!withSync.sync?.register) {
    return false;
  }

  try {
    const tags = withSync.sync.getTags
      ? await withSync.sync.getTags()
      : [];

    if (
      !tags.includes(UPLOAD_REMINDER_SYNC_TAG)
    ) {
      await withSync.sync.register(
        UPLOAD_REMINDER_SYNC_TAG,
      );
    }

    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Local notification test                                                    */
/* -------------------------------------------------------------------------- */

export async function showLocalTestNotification():
  Promise<boolean> {
  if (
    !notificationsAvailable() ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  const registration =
    await getReadyServiceWorkerRegistration();

  if (!registration) {
    return false;
  }

  try {
    await registration.showNotification(
      "اعلان آزمایشی محلی",
      {
        body:
          "این پیام فقط روی همین دستگاه ساخته شده است.",
        tag: "airway-local-test",
        data: {
          url: "/queue",
        },
      },
    );

    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Backend VAPID configuration                                                */
/* -------------------------------------------------------------------------- */

async function loadPushConfig():
  Promise<ConfigResult> {
  if (
    !browserAvailable() ||
    navigator.onLine === false
  ) {
    return {
      state: "unavailable",
    };
  }

  if (cachedConfig?.state === "ready") {
    return cachedConfig;
  }

  try {
    const response = await fetch(
      "/api/push/config",
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {
        state: "unavailable",
      };
    }

    const data =
      (await response.json()) as PushConfig;

    if (data.enabled === false) {
      return {
        state: "disabled",
      };
    }

    if (
      data.enabled !== true ||
      typeof data.public_key !== "string" ||
      !data.public_key.trim()
    ) {
      return {
        state: "unavailable",
      };
    }

    cachedConfig = {
      state: "ready",
      key: data.public_key.trim(),
    };

    return cachedConfig;
  } catch {
    return {
      state: "unavailable",
    };
  }
}

export async function preloadPushConfiguration():
  Promise<void> {
  await loadPushConfig();
}



function vapidKeyToArrayBuffer(
  key: string,
): ArrayBuffer {
  const base64 = key
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    "=",
  );

  const binary = atob(padded);

  const buffer = new ArrayBuffer(
    binary.length,
  );

  const bytes = new Uint8Array(buffer);

  for (
    let index = 0;
    index < binary.length;
    index++
  ) {
    bytes[index] =
      binary.charCodeAt(index);
  }

  return buffer;
}

function samePublicKey(
  subscription: PushSubscription,
  key: ArrayBuffer,
): boolean {
  const saved =
    subscription.options.applicationServerKey;

  if (!saved) {
    return true;
  }

  if (typeof saved === "string") {
    return false;
  }

  const previous = ArrayBuffer.isView(saved)
    ? new Uint8Array(
        saved.buffer,
        saved.byteOffset,
        saved.byteLength,
      )
    : new Uint8Array(saved);

  const current = new Uint8Array(key);

  if (previous.length !== current.length) {
    return false;
  }

  return previous.every(
    (value, index) =>
      value === current[index],
  );
}

async function setupPushInternal():
  Promise<PushSetupResult> {
  if (!notificationsAvailable()) {
    return "unsupported";
  }

  if (
    Notification.permission !== "granted"
  ) {
    return "pending";
  }

  if (navigator.onLine === false) {
    return "offline";
  }

  const config = await loadPushConfig();

  if (config.state === "disabled") {
    return "not-configured";
  }

  if (config.state !== "ready") {
    return "pending";
  }

  const registration =
    await getReadyServiceWorkerRegistration();

  if (!registration) {
    return "pending";
  }

  if (!("pushManager" in registration)) {
    return "unsupported";
  }

  try {
    /*
     * Construct a real ArrayBuffer.
     * This fixes the TypeScript build error.
     */
    const keyBuffer =
      vapidKeyToArrayBuffer(config.key);

    let subscription =
      await registration.pushManager.getSubscription();

    /*
     * Existing subscription must use the
     * currently configured VAPID public key.
     */
    if (
      subscription &&
      !samePublicKey(
        subscription,
        keyBuffer,
      )
    ) {
      const unsubscribed =
        await subscription.unsubscribe();

      if (!unsubscribed) {
        return "pending";
      }

      subscription = null;

      lastBoundToken = null;
      lastBoundEndpoint = null;
      lastBoundKey = null;
      lastBoundAt = 0;
    }

    if (!subscription) {
      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,

          /*
           * ArrayBuffer is a valid BufferSource.
           */
          applicationServerKey: keyBuffer,
        });
    }

    /*
     * Never create a different installation UUID.
     */
    if (!getOperatorProfile()) {
      return "device-error";
    }

    const profile =
      await ensureOperatorRegistered();

    const token = profile.deviceToken;

    if (!token) {
      return "device-error";
    }

    const alreadyBound =
      lastBoundToken === token &&
      lastBoundEndpoint === subscription.endpoint &&
      lastBoundKey === config.key &&
      Date.now() - lastBoundAt <
        BIND_RECHECK_MS;

    if (alreadyBound) {
      return "active";
    }

    /*
     * Next.js proxies this request to Django.
     */
    const response = await fetch(
      "/api/push/subscriptions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": token,
        },

        body: JSON.stringify(
          subscription.toJSON(),
        ),

        cache: "no-store",
      },
    );

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 409
    ) {
      return "device-error";
    }

    if (!response.ok) {
      return "pending";
    }

    /*
     * Mark active only after successful
     * registration in Django.
     */
    lastBoundToken = token;
    lastBoundEndpoint =
      subscription.endpoint;

    lastBoundKey = config.key;
    lastBoundAt = Date.now();

    return "active";
  } catch (error) {
    console.warn(
      "Web Push subscription setup failed:",
      error instanceof Error
        ? error.name
        : "UNKNOWN_ERROR",
    );

    return "pending";
  }
}

export async function ensureWebPushSubscription():
  Promise<PushSetupResult> {
  if (setupTask) {
    return setupTask;
  }

  const task = setupPushInternal();

  setupTask = task;

  try {
    return await task;
  } finally {
    if (setupTask === task) {
      setupTask = null;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Real Push test                                                             */
/* -------------------------------------------------------------------------- */

export async function sendRealPushTest():
  Promise<RealPushTestResult> {
  if (!notificationsAvailable()) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      message:
        "این مرورگر یا آدرس از Web Push پشتیبانی نمی‌کند.",
    };
  }

  if (
    Notification.permission !== "granted"
  ) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      message:
        "ابتدا اجازه اعلان‌ها را فعال کنید.",
    };
  }

  const state =
    await ensureWebPushSubscription();

  if (state !== "active") {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      message:
        "اشتراک Push هنوز آماده نیست. " +
        "ابتدا اتصال اعلان‌ها به سرور را تکمیل کنید.",
    };
  }

  const token =
    getOperatorProfile()?.deviceToken;

  if (!token) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      message:
        "Device Token موجود نیست.",
    };
  }

  try {
    const response = await fetch(
      "/api/push/test",
      {
        method: "POST",

        headers: {
          "X-Device-Token": token,
          Accept: "application/json",
        },

        cache: "no-store",
      },
    );

    const data =
      (await response.json()) as PushTestResponse;

    const sent =
      typeof data.sent === "number"
        ? data.sent
        : 0;

    const failed =
      typeof data.failed === "number"
        ? data.failed
        : 0;

    if (!response.ok || sent === 0) {
      return {
        ok: false,
        sent,
        failed,

        message:
          response.status === 401
            ? "اتصال Device معتبر نیست. وضعیت ثبت دستگاه را بررسی کنید."
            : response.status === 409
              ? "هیچ اشتراک Push فعالی در Django پیدا نشد."
              : data.detail ??
                "سرور نتوانست اعلان آزمایشی را ارسال کند.",
      };
    }

    return {
      ok: true,
      sent,
      failed,

      message:
        "سرویس Push درخواست ارسال را پذیرفت. " +
        "اکنون دریافت اعلان روی گوشی را بررسی کنید.",
    };
  } catch {
    return {
      ok: false,
      sent: 0,
      failed: 0,

      message:
        "ارتباط با سرور برای تست اعلان برقرار نشد.",
    };
  }
}

