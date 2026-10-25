import {
  ensureOperatorRegistered,
  getOperatorProfile,
  OperatorDeviceError,
} from "@/lib/profile/operator-profile";
import { getAllCases } from "@/lib/db/database";
import { deviceFetch } from "@/lib/api/device-fetch";

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
  | "server-unavailable"
  | "worker-unavailable"
  | "subscription-error"
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

let preparedPush: {
  registration: ServiceWorkerRegistration;
  key: ArrayBuffer;
} | null = null;

function browserAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined"
  );
}

export type NotificationSupport = "available" | "insecure" | "ios-install-required" | "unsupported";

export function getNotificationSupport(): NotificationSupport {
  if (!browserAvailable()) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-install-required";
  if (!("Notification" in window) || !("serviceWorker" in navigator) ||
    !("PushManager" in window)) return "unsupported";
  return "available";
}

export function notificationsAvailable(): boolean {
  return getNotificationSupport() === "available";
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
  if (getNotificationPermission() !== "granted") return false;
  // Enabling notifications alone must never schedule an upload reminder.
  try {
    const cases = await getAllCases();
    if (!cases.some((item) => ["queued", "syncing", "failed"].includes(item.syncStatus))) {
      return false;
    }
  } catch {
    return false;
  }
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
        signal: AbortSignal.timeout(10_000),
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
  preparedPush = null;
  const config = await loadPushConfig();
  if (config.state !== "ready") return;
  const registration = await getReadyServiceWorkerRegistration();
  if (!registration || !("pushManager" in registration)) return;
  try {
    const key = vapidKeyToArrayBuffer(config.key);
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && !samePublicKey(subscription, key)) {
      if (!(await subscription.unsubscribe())) return;
      lastBoundAt = 0;
    }
    preparedPush = { registration, key };
  } catch {
    // The enable button can retry preparation without requesting permission.
  }
}

/** Invoke directly from a click. Safari requires subscribe before any await. */
export async function enableWebPushFromGesture(): Promise<PushSetupResult> {
  if (!notificationsAvailable()) return "unsupported";
  if (navigator.onLine === false) return "offline";
  if (!preparedPush) {
    await preloadPushConfiguration();
    const config = await loadPushConfig();
    if (config.state === "disabled") return "not-configured";
    if (config.state !== "ready") return "server-unavailable";
    return preparedPush ? "pending" : "worker-unavailable";
  }
  try {
    // subscribe() also requests notification permission, using this user gesture.
    const subscription = preparedPush.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: preparedPush.key,
    });
    await subscription;
    if (setupTask) await setupTask;
    lastBoundAt = 0;
    return await ensureWebPushSubscription();
  } catch {
    return "subscription-error";
  }
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
    return "server-unavailable";
  }

  const registration =
    await getReadyServiceWorkerRegistration();

  if (!registration) {
    return "worker-unavailable";
  }

  if (!("pushManager" in registration)) {
    return "unsupported";
  }

  let failureState: PushSetupResult = "subscription-error";
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

    // Automatic reconnects may bind an existing subscription. Only a direct
    // user gesture may create one, including when permission is already granted.
    if (!subscription) return "pending";

    /*
     * Never create a different installation UUID.
     */
    if (!getOperatorProfile()) {
      return "device-error";
    }

    failureState = "device-error";
    const profile =
      await ensureOperatorRegistered();

    let token = profile.deviceToken;

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
    failureState = "server-unavailable";
    const response = await deviceFetch(
      "/api/push/subscriptions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
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
      return "server-unavailable";
    }

    token = getOperatorProfile()?.deviceToken;
    if (!token) return "device-error";

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

    return error instanceof OperatorDeviceError
      ? "device-error"
      : failureState;
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

  // A previous test may have deactivated an expired endpoint on the server.
  // Rebind before testing instead of trusting the in-memory 12-hour cache.
  lastBoundAt = 0;
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
    const response = await deviceFetch(
      "/api/push/test",
      {
        method: "POST",

        headers: {
          Accept: "application/json",
        },

        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );

    let data: PushTestResponse;
    try {
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_RESPONSE");
      data = payload as PushTestResponse;
    } catch {
      return { ok: false, sent: 0, failed: 0, message: "پاسخ معتبر از سرویس اعلان دریافت نشد. دوباره تلاش کنید." };
    }

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

        message: ({
          PUSH_SERVICE_UNREACHABLE: "سرور به سرویس اعلان گوشی دسترسی ندارد. اتصال خروجی سرور باید بررسی شود.",
          PUSH_SERVICE_TIMEOUT: "سرویس اعلان گوشی در زمان مقرر پاسخ نداد. اتصال خروجی سرور باید بررسی شود.",
          PUSH_SUBSCRIPTION_EXPIRED: "اشتراک اعلان منقضی شده است. اعلان‌ها را دوباره فعال کنید.",
          PUSH_SERVICE_REJECTED: "سرویس اعلان گوشی درخواست را نپذیرفت. تنظیمات اعلان سرور باید بررسی شود.",
          PUSH_TEST_TIMEOUT: "مهلت انتظار برای پاسخ سرویس اعلان تمام شد. دوباره تلاش کنید.",
        } as Record<string, string>)[data.code ?? ""] ?? (
          response.status === 401
            ? "اتصال Device معتبر نیست. وضعیت ثبت دستگاه را بررسی کنید."
            : response.status === 409
              ? "هیچ اشتراک Push فعالی در Django پیدا نشد."
              : data.detail ??
                "سرور نتوانست اعلان آزمایشی را ارسال کند."),
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
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return {
      ok: false,
      sent: 0,
      failed: 0,

      message: timedOut
        ? "مهلت انتظار برای پاسخ سرویس اعلان تمام شد. دوباره تلاش کنید."
        : "ارتباط با سرور برای تست اعلان برقرار نشد.",
    };
  }
}

