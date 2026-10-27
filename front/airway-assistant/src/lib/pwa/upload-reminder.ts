import {
  ensureOperatorRegistered,
  getOperatorProfile,
  OperatorDeviceError,
} from "@/lib/profile/operator-profile";
import { getAllCases } from "@/lib/db/database";
import { deviceFetch } from "@/lib/api/device-fetch";

export const UPLOAD_REMINDER_SYNC_TAG = "airway-upload-reminder-v1";
export const UPLOAD_REMINDER_NOTIFICATION_TAG = "airway-upload-reminder";

interface SyncManagerLike {
  register(tag: string): Promise<void>;
  getTags?(): Promise<string[]>;
}

type RegistrationWithSync = ServiceWorkerRegistration & {
  sync?: SyncManagerLike;
};

interface PushConfig {
  enabled?: boolean;
  public_key?: string | null;
}

interface PushTestResponse {
  sent?: number;
  failed?: number;
  code?: string;
  detail?: string;
}

export type NotificationSupport =
  | "available"
  | "permission-only"
  | "ios-install-required"
  | "insecure"
  | "unsupported";

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

const SERVICE_WORKER_WAIT_MS = 5_000;
const BIND_RECHECK_MS = 12 * 60 * 60 * 1_000;

let cachedConfig: ConfigResult | null = null;
let preparedPush: {
  registration: ServiceWorkerRegistration;
  key: ArrayBuffer;
  needsRenewal: boolean;
} | null = null;
let setupTask: Promise<PushSetupResult> | null = null;
let lastBoundToken: string | null = null;
let lastBoundEndpoint: string | null = null;
let lastBoundKey: string | null = null;
let lastBoundAt = 0;

function browserAvailable(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isIosDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Notification permission and Web Push are different browser capabilities. */
export function getNotificationSupport(): NotificationSupport {
  if (!browserAvailable()) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (isIosDevice() && !isStandalone()) return "ios-install-required";
  if (
    !("Notification" in window) ||
    typeof Notification.requestPermission !== "function"
  ) {
    return "unsupported";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "permission-only";
  }
  return "available";
}

/** Web Push support, not merely permission-dialog support. */
export function notificationsAvailable(): boolean {
  return getNotificationSupport() === "available";
}

export function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  const support = getNotificationSupport();
  if (support !== "available" && support !== "permission-only") {
    return "unsupported";
  }
  return Notification.permission;
}

/** Call from a user gesture. Never turn an exception into a fake denial. */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  const before = getNotificationPermission();
  if (before === "unsupported" || before !== "default") return before;
  try {
    return await Notification.requestPermission();
  } catch {
    return getNotificationPermission();
  }
}

export const requestUploadReminderPermission = requestNotificationPermission;

export async function getReadyServiceWorkerRegistration(): Promise<
  ServiceWorkerRegistration | null
> {
  if (!browserAvailable() || !window.isSecureContext || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return null;
    if (registration.active) return registration;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        navigator.serviceWorker.ready.then((ready) =>
          ready.active ? ready : null,
        ),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), SERVICE_WORKER_WAIT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export async function backgroundSyncAvailable(): Promise<boolean> {
  const registration = await getReadyServiceWorkerRegistration();
  return typeof (registration as RegistrationWithSync | null)?.sync?.register === "function";
}

export async function registerUploadReminderSync(): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;
  try {
    const cases = await getAllCases();
    if (!cases.some((item) =>
      ["queued", "syncing", "failed"].includes(item.syncStatus),
    )) return false;
    const registration = (await getReadyServiceWorkerRegistration()) as RegistrationWithSync | null;
    if (!registration?.sync?.register) return false;
    const tags = registration.sync.getTags ? await registration.sync.getTags() : [];
    if (!tags.includes(UPLOAD_REMINDER_SYNC_TAG)) {
      await registration.sync.register(UPLOAD_REMINDER_SYNC_TAG);
    }
    return true;
  } catch {
    return false;
  }
}

export async function showLocalTestNotification(): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;
  const registration = await getReadyServiceWorkerRegistration();
  if (!registration) return false;
  try {
    await registration.showNotification("اعلان آزمایشی محلی", {
      body: "این پیام فقط روی همین دستگاه ساخته شده است.",
      tag: "airway-local-test",
      data: { url: "/queue" },
    });
    return true;
  } catch {
    return false;
  }
}

async function loadPushConfig(): Promise<ConfigResult> {
  if (!browserAvailable() || navigator.onLine === false) {
    return { state: "unavailable" };
  }
  if (cachedConfig?.state === "ready") return cachedConfig;
  try {
    const response = await fetch("/api/push/config", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { state: "unavailable" };
    const config = (await response.json()) as PushConfig;
    if (config.enabled === false) return { state: "disabled" };
    if (config.enabled !== true || typeof config.public_key !== "string" || !config.public_key.trim()) {
      return { state: "unavailable" };
    }
    cachedConfig = { state: "ready", key: config.public_key.trim() };
    return cachedConfig;
  } catch {
    return { state: "unavailable" };
  }
}

function vapidKeyToArrayBuffer(key: string): ArrayBuffer {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

function samePublicKey(subscription: PushSubscription, key: ArrayBuffer): boolean {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return true;
  if (typeof existing === "string") return false;
  const previous = ArrayBuffer.isView(existing)
    ? new Uint8Array(existing.buffer, existing.byteOffset, existing.byteLength)
    : new Uint8Array(existing);
  const current = new Uint8Array(key);
  return previous.length === current.length &&
    previous.every((value, index) => value === current[index]);
}

/** Preparation never asks for notification permission. */
export async function preloadPushConfiguration(): Promise<void> {
  if (!notificationsAvailable()) return;
  const config = await loadPushConfig();
  if (config.state !== "ready") {
    preparedPush = null;
    return;
  }
  const registration = await getReadyServiceWorkerRegistration();
  if (!registration || !("pushManager" in registration)) {
    preparedPush = null;
    return;
  }
  try {
    const key = vapidKeyToArrayBuffer(config.key);
    const existing = await registration.pushManager.getSubscription();
    // A rotated VAPID key needs a new subscription. Do not modify the
    // existing subscription while merely visiting the page.
    preparedPush = {
      registration,
      key,
      needsRenewal: Boolean(existing && !samePublicKey(existing, key)),
    };
  } catch {
    preparedPush = null;
  }
}

/**
 * Call DIRECTLY from a click handler (before any awaited operation).
 * Safari requires subscribe() to begin while the gesture is still active.
 * When Web Push is not ready, try permission alone where supported.
 */
export async function enableWebPushFromGesture(): Promise<PushSetupResult> {
  const support = getNotificationSupport();
  if (support === "permission-only") {
    await requestNotificationPermission();
    return "unsupported";
  }
  if (support !== "available") return "unsupported";
  if (getNotificationPermission() === "denied") return "pending";

  // Key rotation is rare. Remove only the obsolete push subscription
  // after an explicit tap; ask for a second tap to create the new one.
  if (navigator.onLine !== false && preparedPush?.needsRenewal) {
    try {
      const previous = await preparedPush.registration.pushManager.getSubscription();
      if (previous && !samePublicKey(previous, preparedPush.key)) {
        if (!(await previous.unsubscribe())) return "pending";
      }
      lastBoundAt = 0;
      preparedPush.needsRenewal = false;
      return "pending";
    } catch {
      return "subscription-error";
    }
  }

  // No awaits before subscribe(), for iOS Home Screen and gesture-gated browsers.
  if (navigator.onLine !== false && preparedPush) {
    try {
      const subscription = preparedPush.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: preparedPush.key,
      });
      await subscription;
      lastBoundAt = 0;
      return await ensureWebPushSubscription();
    } catch {
      return "subscription-error";
    }
  }

  // With a missing VAPID key, offline backend or unready service worker,
  // the permission prompt is still useful. It must happen in this gesture.
  const permissionRequest = requestNotificationPermission();
  const permission = await permissionRequest;
  if (permission !== "granted") return "pending";
  if (navigator.onLine === false) return "offline";

  await preloadPushConfiguration();
  const config = await loadPushConfig();
  if (config.state === "disabled") return "not-configured";
  if (config.state !== "ready") return "server-unavailable";
  // After preloading, another gesture may be needed to create a subscription.
  return preparedPush ? "pending" : "worker-unavailable";
}

async function setupPushInternal(): Promise<PushSetupResult> {
  if (!notificationsAvailable()) return "unsupported";
  if (getNotificationPermission() !== "granted") return "pending";
  if (navigator.onLine === false) return "offline";

  const config = await loadPushConfig();
  if (config.state === "disabled") return "not-configured";
  if (config.state !== "ready") return "server-unavailable";

  const registration = await getReadyServiceWorkerRegistration();
  if (!registration) return "worker-unavailable";
  if (!("pushManager" in registration)) return "unsupported";

  let failureState: PushSetupResult = "subscription-error";
  try {
    const key = vapidKeyToArrayBuffer(config.key);
    const subscription = await registration.pushManager.getSubscription();
    // Background checks can rebind an existing subscription, never create one.
    if (!subscription || !samePublicKey(subscription, key)) return "pending";
    if (!getOperatorProfile()) return "device-error";

    failureState = "device-error";
    const profile = await ensureOperatorRegistered();
    let token = profile.deviceToken;
    if (!token) return "device-error";

    if (
      token === lastBoundToken &&
      subscription.endpoint === lastBoundEndpoint &&
      config.key === lastBoundKey &&
      Date.now() - lastBoundAt < BIND_RECHECK_MS
    ) return "active";

    failureState = "server-unavailable";
    const response = await deviceFetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
      cache: "no-store",
    });

    if ([401, 403, 409].includes(response.status)) return "device-error";
    if (!response.ok) return "server-unavailable";
    token = getOperatorProfile()?.deviceToken;
    if (!token) return "device-error";

    lastBoundToken = token;
    lastBoundEndpoint = subscription.endpoint;
    lastBoundKey = config.key;
    lastBoundAt = Date.now();
    return "active";
  } catch (error) {
    console.warn("Web Push registration deferred:", error instanceof Error ? error.name : "unknown");
    return error instanceof OperatorDeviceError ? "device-error" : failureState;
  }
}

export async function ensureWebPushSubscription(): Promise<PushSetupResult> {
  if (setupTask) return setupTask;
  const task = setupPushInternal();
  setupTask = task;
  try {
    return await task;
  } finally {
    if (setupTask === task) setupTask = null;
  }
}

export async function sendRealPushTest(): Promise<RealPushTestResult> {
  const failure = (message: string, sent = 0, failed = 0): RealPushTestResult => ({
    ok: false, message, sent, failed,
  });
  if (!notificationsAvailable() || getNotificationPermission() !== "granted") {
    return failure("اعلان آزمایشی برای این دستگاه در دسترس نیست.");
  }

  // Force a server rebind in case the previous endpoint was deactivated.
  lastBoundAt = 0;
  if ((await ensureWebPushSubscription()) !== "active") {
    return failure("اتصال اعلان سرور هنوز فعال نیست.");
  }
  if (!getOperatorProfile()?.deviceToken) {
    return failure("اطلاعات اتصال این دستگاه کامل نیست.");
  }

  try {
    const response = await deviceFetch("/api/push/test", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    let data: PushTestResponse;
    try {
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("INVALID_RESPONSE");
      }
      data = payload as PushTestResponse;
    } catch {
      return failure("پاسخ سرویس اعلان قابل بررسی نبود.");
    }

    const sent = typeof data.sent === "number" ? data.sent : 0;
    const failed = typeof data.failed === "number" ? data.failed : 0;
    if (!response.ok || sent === 0) {
      const messages: Record<string, string> = {
        PUSH_SERVICE_UNREACHABLE: "سرویس Push این دستگاه از سرور قابل دسترسی نیست.",
        PUSH_SERVICE_TIMEOUT: "سرویس Push در زمان مقرر پاسخ نداد.",
        PUSH_SUBSCRIPTION_EXPIRED: "اشتراک Push این دستگاه منقضی شده است.",
        PUSH_SERVICE_REJECTED: "سرویس Push درخواست را نپذیرفت.",
      };
      return failure(
        messages[data.code ?? ""] ?? data.detail ?? "اعلان آزمایشی ارسال نشد.",
        sent,
        failed,
      );
    }
    return {
      ok: true, sent, failed,
      message: "سرویس Push درخواست را پذیرفت. دریافت اعلان را روی دستگاه بررسی کنید.",
    };
  } catch {
    return failure("ارتباط آزمایشی با سرویس اعلان برقرار نشد.");
  }
}
