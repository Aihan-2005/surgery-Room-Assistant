"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  LoaderCircle,
  Send,
} from "lucide-react";
import {
  enableWebPushFromGesture,
  ensureWebPushSubscription,
  getNotificationPermission,
  getNotificationSupport,
  preloadPushConfiguration,
  registerUploadReminderSync,
  sendRealPushTest,
  type NotificationSupport,
  type PushSetupResult,
} from "@/lib/pwa/upload-reminder";

type PermissionState = NotificationPermission | "unsupported" | "checking";

function supportDescription(support: NotificationSupport): string {
  switch (support) {
    case "ios-install-required":
      return (
        "روی آیفون یا آیپد، برای دریافت اعلان ابتدا برنامه را با گزینه «Add to Home Screen» " +
        "به صفحه اصلی اضافه کنید و از آیکون برنامه باز کنید. استفاده از سایر امکانات بدون اعلان ادامه دارد."
      );
    case "insecure":
      return "اعلان‌های مرورگر به HTTPS نیاز دارند. ثبت پرونده و ذخیره آفلاین همچنان کار می‌کند.";
    case "permission-only":
      return "می‌توانید مجوز اعلان را فعال کنید، اما این مرورگر در حال حاضر Web Push سروری ندارد.";
    case "unsupported":
      return "اعلان سیستمی در این مرورگر در دسترس نیست. ثبت عکس و ارسال پرونده‌ها مستقل از اعلان انجام می‌شود.";
    default:
      return "مجوز اعلان اختیاری است و بر ثبت یا ارسال پرونده تأثیری ندارد.";
  }
}

function pushDescription(state: PushSetupResult | null): string {
  switch (state) {
    case "active":
      return "اتصال Web Push این دستگاه به سرور برقرار است. دریافت نهایی را می‌توانید با اعلان آزمایشی بررسی کنید.";
    case "offline":
      return "مجوز اعلان فعال است. وقتی اینترنت برقرار باشد، اتصال Push قابل بررسی است.";
    case "not-configured":
      return "مجوز اعلان فعال است. در حال حاضر سرور برای ارسال Web Push آماده نیست؛ برنامه بدون مشکل ادامه می‌دهد.";
    case "unsupported":
      return "مجوز اعلان فعال است، ولی ارسال Push از سرور در این مرورگر پشتیبانی نمی‌شود.";
    case "server-unavailable":
    case "worker-unavailable":
    case "subscription-error":
    case "device-error":
      return "مجوز اعلان فعال است. ارسال Push از سرور فعلاً برای این دستگاه آماده نیست؛ می‌توانید بعداً دوباره تلاش کنید.";
    case "pending":
      return "مجوز اعلان فعال است. اگر دستگاه پشتیبانی کند، با لمس «بررسی اتصال Push» می‌توانید ثبت اشتراک را تکمیل کنید.";
    default:
      return "مجوز اعلان فعال است. در صورت پشتیبانی دستگاه و سرور، Push نیز قابل فعال‌سازی است.";
  }
}

export function SyncReminderPermission() {
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [support, setSupport] = useState<NotificationSupport>("unsupported");
  const [pushState, setPushState] = useState<PushSetupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function inspectExistingPermission() {
      const nextSupport = getNotificationSupport();
      const nextPermission = getNotificationPermission();
      if (!active) return;

      setSupport(nextSupport);
      setPermission(nextPermission);

      if (nextPermission !== "granted" || nextSupport !== "available") {
        setPushState(null);
        return;
      }

      // Rebind an existing subscription only; no permission prompt on mount.
      const result = await ensureWebPushSubscription();
      if (active) setPushState(result);
    }

    void preloadPushConfiguration();
    void inspectExistingPermission();

    const onReturn = () => {
      void preloadPushConfiguration();
      void inspectExistingPermission();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onReturn();
    };

    window.addEventListener("online", onReturn);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onVisible);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onReturn);
    }

    return () => {
      active = false;
      window.removeEventListener("online", onReturn);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onVisible);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onReturn);
      }
    };
  }, []);

  async function handleEnable() {
    if (loading) return;
    setLoading(true);
    setFeedback(null);

    try {
      // IMPORTANT: start subscribe()/requestPermission() in this click,
      // before the first await. This matters for iOS Home Screen apps.
      const activation = enableWebPushFromGesture();
      const result = await activation;
      const currentPermission = getNotificationPermission();

      setSupport(getNotificationSupport());
      setPermission(currentPermission);
      setPushState(result);

      if (currentPermission === "granted") {
        // Optional: only registers a reminder when unsent cases exist.
        await registerUploadReminderSync();
      }
    } catch {
      // Notification setup is optional; never block patient capture or sync.
      setPermission(getNotificationPermission());
      setPushState("pending");
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    if (testing) return;
    setTesting(true);
    setFeedback(null);
    try {
      const result = await sendRealPushTest();
      setFeedback(result.message);
    } catch {
      setFeedback("اعلان آزمایشی در حال حاضر در دسترس نیست.");
    } finally {
      setTesting(false);
    }
  }

  if (permission === "checking") return null;

  const canAskPermission =
    (support === "available" || support === "permission-only") &&
    permission === "default";

  const canRetryPush =
    support === "available" &&
    permission === "granted" &&
    pushState !== "active";

  const pushActive =
    permission === "granted" && pushState === "active";

  let title: string;
  let description: string;

  if (permission === "denied") {
    title = "اعلان‌ها غیرفعال هستند";
    description =
      "اگر بعداً مایل بودید، می‌توانید مجوز اعلان را از تنظیمات مرورگر یا گوشی تغییر دهید. ثبت و ارسال پرونده‌ها ادامه دارد.";
  } else if (permission === "granted") {
    title = pushActive ? "اعلان‌های سروری فعال هستند" : "مجوز اعلان فعال است";
    description =
      support === "permission-only"
        ? supportDescription(support)
        : pushDescription(pushState);
  } else if (canAskPermission) {
    title = "اعلان‌های یادآوری ارسال";
    description = "اگر مایلید، اجازه اعلان را فعال کنید. این قابلیت اختیاری است.";
  } else {
    title = "اعلان‌ها اختیاری هستند";
    description = supportDescription(support);
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          {permission === "granted" ? (
            <CheckCircle2 size={21} />
          ) : (
            <BellRing size={21} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-2 text-xs leading-6 text-slate-600">
            {description}
          </p>

          {(canAskPermission || canRetryPush) && (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={loading}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-bold text-white disabled:opacity-60"
            >
              {loading && <LoaderCircle size={16} className="animate-spin" />}
              {canAskPermission ? "اجازه دادن به اعلان‌ها" : "بررسی اتصال Push"}
            </button>
          )}

          {pushActive && (
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 px-4 text-xs font-bold text-sky-700 disabled:opacity-60"
            >
              {testing ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              تست اختیاری اعلان سروری
            </button>
          )}

          {feedback && (
            <p role="status" aria-live="polite" className="mt-3 text-xs leading-6 text-slate-600">
              {feedback}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
