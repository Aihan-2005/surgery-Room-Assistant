import {
  ensureOperatorRegistered,
  getOperatorProfile,
} from "@/lib/profile/operator-profile";

export const UPLOAD_REMINDER_SYNC_TAG =
  "airway-upload-reminder-v1";

export const UPLOAD_REMINDER_NOTIFICATION_TAG =
  "airway-upload-reminder";

interface SyncManagerLike {
  register: (tag: string) => Promise<void>;
  getTags?: () => Promise<string[]>;
}

type RegistrationWithSync =
  ServiceWorkerRegistration & {
    sync?: SyncManagerLike;
  };

interface PushConfig {
  enabled?: boolean;
  public_key?: string | null;
}

export type PushSetupResult =
  | "active"
  | "offline"
  | "not-configured"
  | "unsupported"
  | "pending";

let lastBoundToken: string | null = null;
let lastBoundEndpoint: string | null = null;

let pushSetupTask:
  | Promise<PushSetupResult>
  | null = null;

let cachedPushConfig: PushConfig | null = null;

function browserAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined"
  );
}

export function notificationsAvailable() {
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
    // Call directly from the user's button click.
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export const requestUploadReminderPermission =
  requestNotificationPermission;

/*
 * Never wait indefinitely for serviceWorker.ready.
 * Local case saving and queuing must work even
 * when the Service Worker is unavailable.
 */
export async function getReadyServiceWorkerRegistration():
  Promise<ServiceWorkerRegistration | null> {
  if (
    !browserAvailable() ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  try {
    const registration =
      await navigator.serviceWorker.getRegistration(
        "/",
      );

    return registration?.active
      ? registration
      : null;
  } catch {
    return null;
  }
}

export async function backgroundSyncAvailable() {
  const registration =
    await getReadyServiceWorkerRegistration();

  return Boolean(
    (
      registration as
        RegistrationWithSync | null
    )?.sync?.register,
  );
}

export async function registerUploadReminderSync() {
  const registration =
    await getReadyServiceWorkerRegistration();

  if (!registration) return false;

  const withSync =
    registration as RegistrationWithSync;

  if (
    typeof withSync.sync?.register !==
    "function"
  ) {
    return false;
  }

  try {
    const tags =
      typeof withSync.sync.getTags === "function"
        ? await withSync.sync.getTags()
        : [];

    if (
      !tags.includes(
        UPLOAD_REMINDER_SYNC_TAG,
      )
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

export async function showLocalTestNotification() {
  if (
    !notificationsAvailable() ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  const registration =
    await getReadyServiceWorkerRegistration();

  if (!registration) return false;

  try {
    await registration.showNotification(
      "یادآوری فعال شد",
      {
        body:
          "اعلان‌های مربوط به موارد در انتظار ارسال مجاز شدند.",
        tag: "airway-notification-enabled",
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

async function loadPushConfig():
  Promise<PushConfig | null> {
  if (!browserAvailable()) return null;

  if (navigator.onLine === false) {
    return null;
  }

  if (cachedPushConfig?.enabled) {
    return cachedPushConfig;
  }

  try {
    const response = await fetch(
      "/api/push/config",
      {
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    const data =
      (await response.json()) as PushConfig;

    if (
      data.enabled === true &&
      typeof data.public_key === "string" &&
      data.public_key.length > 0
    ) {
      cachedPushConfig = data;
      return data;
    }

    return null;
  } catch {
    return null;
  }
}

/*
 * Load VAPID configuration before the user clicks.
 * The actual permission request still happens only
 * when the user explicitly chooses to enable it.
 */
export async function preloadPushConfiguration() {
  await loadPushConfig();
}

function vapidKeyToBytes(key: string) {
  const base64 = key
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      "=",
    );

  const binary = atob(padded);
  const result = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    result[index] = binary.charCodeAt(index);
  }

  return result;
}

async function setupPushInternal():
  Promise<PushSetupResult> {
  if (
    !notificationsAvailable() ||
    Notification.permission !== "granted"
  ) {
    return "unsupported";
  }

  if (navigator.onLine === false) {
    return "offline";
  }

  const registration =
    await getReadyServiceWorkerRegistration();

  if (
    !registration ||
    !("pushManager" in registration)
  ) {
    return "unsupported";
  }

  const config = await loadPushConfig();

  if (!config?.public_key) {
    return "not-configured";
  }

  try {
    let subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            vapidKeyToBytes(config.public_key),
        });
    }

    /*
     * Register the existing installation only.
     * Never create a new UUID here.
     */
    let profile = getOperatorProfile();

    if (!profile) {
      return "pending";
    }

    if (!profile.deviceToken) {
      profile = await ensureOperatorRegistered();
    }

    if (!profile.deviceToken) {
      return "pending";
    }

    if (
      lastBoundToken === profile.deviceToken &&
      lastBoundEndpoint === subscription.endpoint
    ) {
      return "active";
    }

    const response = await fetch(
      "/api/push/subscriptions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": profile.deviceToken,
        },
        body: JSON.stringify(
          subscription.toJSON(),
        ),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return "pending";
    }

    lastBoundToken = profile.deviceToken;
    lastBoundEndpoint = subscription.endpoint;

    return "active";
  } catch (error) {
    console.warn(
      "Web Push setup could not finish:",
      error,
    );

    return "pending";
  }
}

export async function ensureWebPushSubscription():
  Promise<PushSetupResult> {
  if (pushSetupTask) return pushSetupTask;

  const task = setupPushInternal();
  pushSetupTask = task;

  try {
    return await task;
  } finally {
    if (pushSetupTask === task) {
      pushSetupTask = null;
    }
  }
}



