"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  BellRing,
  CheckCircle2,
  LoaderCircle,
  Send,
} from "lucide-react";

import {
  ensureWebPushSubscription,
  enableWebPushFromGesture,
  getNotificationPermission,
  getNotificationSupport,
  preloadPushConfiguration,
  registerUploadReminderSync,
  sendRealPushTest,
  type PushSetupResult,
  type NotificationSupport,
} from "@/lib/pwa/upload-reminder";

type PermissionState =
  | "checking"
  | "unsupported"
  | "default"
  | "denied"
  | "granted";

export function SyncReminderPermission() {
  const [permission, setPermission] =
    useState<PermissionState>("checking");

  const [pushState, setPushState] =
    useState<PushSetupResult | null>(null);
  const [support, setSupport] = useState<NotificationSupport>("unsupported");

  const [loading, setLoading] =
    useState(false);

  const [testing, setTesting] =
    useState(false);

  const [feedback, setFeedback] =
    useState<string | null>(null);

  const [testSucceeded, setTestSucceeded] =
    useState(false);

  useEffect(() => {
    let active = true;

    async function updateExistingPermission() {
      const current = getNotificationPermission();

      if (!active) return;

      setPermission(current);
      setSupport(getNotificationSupport());

      if (current !== "granted") {
        setPushState(null);
        return;
      }

      /*
       * A previously granted permission does not
       * require another user permission prompt.
       */
      const result =
        await ensureWebPushSubscription();

      if (active) {
        setPushState(result);
      }
    }

    void preloadPushConfiguration();
    void updateExistingPermission();

    const onOnline = () => {
      void preloadPushConfiguration();
      void updateExistingPermission();
    };

    const onControllerChange = () => {
      void preloadPushConfiguration();
      void updateExistingPermission();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    const onVisibility = () => {
      if (document.visibilityState === "visible") onOnline();
    };
    document.addEventListener("visibilitychange", onVisibility);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
      );
    }

    return () => {
      active = false;

      window.removeEventListener(
        "online",
        onOnline,
      );
      window.removeEventListener("focus", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
    };
  }, []);

  async function handleEnable() {
    if (loading) return;

    setLoading(true);
    setFeedback(null);
    setTestSucceeded(false);

    try {
      const setup = await enableWebPushFromGesture();
      setPermission(getNotificationPermission());
      setSupport(getNotificationSupport());

      setPushState(setup);
      if (setup === "pending") {
        setFeedback("آماده‌سازی اعلان انجام شد. برای تکمیل، دوباره دکمه فعال‌سازی را بزنید.");
      }

      /*
       * Background Sync is an optional reminder
       * mechanism, not a condition for photo uploads.
       */
      await registerUploadReminderSync();
    } catch {
      setPushState("pending");

      setFeedback(
        "فعال‌سازی کامل نشد. دوباره تلاش کنید.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRealTest() {
    if (testing) return;

    setTesting(true);
    setFeedback(null);
    setTestSucceeded(false);

    try {
      const result = await sendRealPushTest();

      setTestSucceeded(result.ok);
      setFeedback(result.message);
    } finally {
      setTesting(false);
    }
  }

  if (permission === "checking") {
    return null;
  }

  if (permission === "unsupported") {
    return (
      <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-900">
          {support === "insecure"
            ? "اعلان‌ها به اتصال امن نیاز دارند"
            : support === "ios-install-required"
              ? "اعلان‌ها را از نسخه نصب‌شده فعال کنید"
              : "این مرورگر از اعلان‌های Push پشتیبانی نمی‌کند"}
        </p>

        <p className="mt-2 text-xs leading-6 text-amber-800">
          {support === "insecure"
            ? "آدرس فعلی اتصال امن ندارد. برنامه را با آدرس HTTPS و گواهی معتبر باز کنید. فعال‌سازی اعلان در این آدرس ممکن نیست."
            : support === "ios-install-required"
              ? "در Safari، از منوی اشتراک‌گذاری گزینه افزودن به صفحه اصلی (Add to Home Screen) را انتخاب کنید. سپس برنامه را از آیکون صفحه اصلی باز کرده و اجازه اعلان بدهید."
              : "مرورگر و سیستم‌عامل را به‌روز کنید. اگر روی آیفون از آیکون صفحه اصلی وارد شده‌اید، پشتیبانی اعلان‌های سیستم‌عامل را بررسی کنید."}
          {" "}ثبت بیمار، ذخیره عکس و صف ارسال به اجازه اعلان وابسته نیستند.
        </p>
      </section>
    );
  }

  if (permission === "denied") {
    return (
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-900">
          اجازه اعلان‌ها مسدود شده است
        </p>

        <p className="mt-2 text-xs leading-6 text-slate-600">
          اجازه Notification را در تنظیمات مرورگر
          یا گوشی فعال کنید. برنامه بدون اعلان هم
          می‌تواند عکس‌ها را ارسال کند.
        </p>
      </section>
    );
  }

  const activated =
    permission === "granted" &&
    pushState === "active";

  function description() {
    if (permission === "default" && (!pushState || pushState === "pending")) {
      return (
        "برای دریافت یادآوری ارسال، اجازه اعلان‌ها را " +
        "فعال کنید. این مجوز اختیاری است."
      );
    }

    switch (pushState) {
      case "active":
        return (
          "اشتراک این دستگاه در Django ثبت شده است. " +
          "برای تأیید ارسال واقعی، دکمه تست را بزنید."
        );

      case "offline":
        return (
          "مجوز اعلان صادر شده است. بعد از وصل شدن " +
          "اینترنت، ثبت اشتراک تکمیل می‌شود."
        );

      case "not-configured":
        return (
          "مجوز اعلان صادر شده، ولی کلیدهای VAPID " +
          "هنوز روی Backend تنظیم نشده‌اند."
        );

      case "device-error":
        return (
          "ثبت اعلان با خطای اتصال Device مواجه شد. " +
          "ابتدا باید اتصال همین نصب به سرور بررسی شود."
        );

      case "unsupported":
        return (
          "این مرورگر از Push API پشتیبانی نمی‌کند " +
          "یا برنامه هنوز به‌درستی نصب نشده است."
        );

      case "server-unavailable":
        return "سرویس اعلان سرور پاسخ معتبر نداد. اتصال اینترنت و تنظیمات اعلان سرور باید بررسی شوند؛ سپس دوباره تلاش کنید.";

      case "worker-unavailable":
        return "آماده‌سازی برنامه برای اعلان هنوز کامل نشده است. برنامه را آنلاین ببندید و دوباره از آیکون صفحه اصلی باز کنید.";

      case "subscription-error":
        return "مرورگر نتوانست به سرویس Push متصل شود. اتصال شبکه را بررسی کنید و دوباره دکمه فعال‌سازی را بزنید.";

      default:
        return (
          "مجوز اعلان صادر شده، اما اتصال آن به " +
          "سرور کامل نیست. دوباره تلاش کنید."
        );
    }
  }

  return (
    <section
      className={`mt-4 rounded-2xl border p-4 ${
        activated
          ? "border-emerald-200 bg-emerald-50"
          : "border-sky-200 bg-sky-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700">
          {activated ? (
            <CheckCircle2 size={21} />
          ) : (
            <BellRing size={21} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">
            {activated
              ? "Web Push دستگاه فعال است"
              : permission === "granted"
                ? "تکمیل اتصال اعلان‌ها"
                : "فعال‌سازی اعلان‌های ارسال"}
          </h3>

          <p className="mt-2 text-xs leading-6 text-slate-600">
            {description()}
          </p>

          {!activated && (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={loading}
              className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-bold text-white disabled:opacity-60"
            >
              {loading && (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
              )}

              {permission === "granted"
                ? "تکمیل اتصال به سرور"
                : "اجازه دادن به اعلان‌ها"}
            </button>
          )}

          {activated && (
            <button
              type="button"
              onClick={() => void handleRealTest()}
              disabled={testing}
              className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white disabled:opacity-60"
            >
              {testing ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <Send size={16} />
              )}

              ارسال اعلان آزمایشی واقعی
            </button>
          )}

          {feedback && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-3 text-xs leading-6 ${
                testSucceeded
                  ? "text-emerald-800"
                  : "text-amber-800"
              }`}
            >
              {feedback}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}


