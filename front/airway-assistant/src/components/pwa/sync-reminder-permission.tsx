"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  BellRing,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";

import {
  ensureWebPushSubscription,
  getNotificationPermission,
  notificationsAvailable,
  preloadPushConfiguration,
  registerUploadReminderSync,
  requestNotificationPermission,
  showLocalTestNotification,
  type PushSetupResult,
} from "@/lib/pwa/upload-reminder";

type PermissionState =
  | "checking"
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function SyncReminderPermission() {
  const [permission, setPermission] =
    useState<PermissionState>("checking");

  const [pushState, setPushState] =
    useState<PushSetupResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    const current = getNotificationPermission();

    setPermission(
      current === "unsupported"
        ? "unsupported"
        : current,
    );

    if (notificationsAvailable()) {
      void preloadPushConfiguration();
    }
  }, []);

  async function handleEnable() {
    if (loading) return;

    setLoading(true);

    try {
      /*
       * Permission must be requested as a direct
       * result of the user's click.
       */
      const result =
        await requestNotificationPermission();

      setPermission(result);

      if (result !== "granted") {
        return;
      }

      await registerUploadReminderSync();

      const setup =
        await ensureWebPushSubscription();

      setPushState(setup);

      await showLocalTestNotification();
    } catch (error) {
      console.warn(
        "Unable to enable reminders:",
        error,
      );

      setPushState("pending");
    } finally {
      setLoading(false);
    }
  }

  if (permission === "checking") {
    return null;
  }

  if (permission === "unsupported") {
    return (
      <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-900">
          اعلان‌ها در این محیط فعال نیستند
        </p>
        <p className="mt-2 text-xs leading-6 text-amber-800">
          برای استفاده از اعلان و قابلیت آفلاین PWA،
          برنامه را با HTTPS باز کنید. در آیفون،
          برنامه باید به صفحه اصلی گوشی اضافه شده باشد.
          ثبت اطلاعات و قرار گرفتن عکس‌ها در صف
          به اجازه اعلان وابسته نیست.
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
          برای فعال‌سازی دوباره، اجازه Notification
          را از تنظیمات مرورگر یا گوشی تغییر دهید.
          ارسال عکس‌ها بدون این اجازه همچنان انجام می‌شود.
        </p>
      </section>
    );
  }

  const fullyActive =
    permission === "granted" &&
    pushState === "active";

  const description =
    permission === "granted"
      ? pushState === "offline"
        ? "اجازه اعلان صادر شده است. اتصال آن به سرور پس از آنلاین شدن تکمیل می‌شود."
        : pushState === "not-configured"
          ? "اجازه اعلان صادر شده، اما تنظیمات VAPID در Backend هنوز کامل نیست."
          : pushState === "pending"
            ? "اجازه اعلان صادر شده، ولی ثبت اشتراک روی سرور تکمیل نشده است."
            : "اجازه اعلان صادر شده است. برای فعال‌سازی اتصال Push می‌توانید دکمه زیر را بزنید."
      : "با اجازه دادن به اعلان‌ها، مرورگرهای پشتیبانی‌کننده می‌توانند برای موارد در صف ارسال، یادآوری نمایش دهند.";

  return (
    <section
      className={`mt-4 rounded-2xl border p-4 ${
        fullyActive
          ? "border-emerald-200 bg-emerald-50"
          : "border-sky-200 bg-sky-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700">
          {fullyActive ? (
            <CheckCircle2 size={21} />
          ) : (
            <BellRing size={21} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">
            {fullyActive
              ? "یادآوری‌ها و Web Push فعال هستند"
              : permission === "granted"
                ? "اجازه اعلان‌ها صادر شده است"
                : "فعال‌سازی یادآوری ارسال"}
          </p>

          {!fullyActive && (
            <p className="mt-2 text-xs leading-6 text-slate-600">
              {description}
            </p>
          )}

          {fullyActive && (
            <p className="mt-2 text-xs leading-6 text-emerald-800">
              این دستگاه برای دریافت Push در Backend
              ثبت شده است. زمان‌بندی ارسال یادآوری‌ها
              به قابلیت مرورگر و تنظیمات سرور وابسته است.
            </p>
          )}

          {!fullyActive && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleEnable()}
              className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-bold text-white disabled:opacity-60"
            >
              {loading && (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
              )}

              {permission === "granted"
                ? "تکمیل فعال‌سازی یادآوری"
                : "اجازه اعلان‌ها"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}