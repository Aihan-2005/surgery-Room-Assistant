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
  getNotificationPermission,
  notificationsAvailable,
  registerUploadReminderSync,
  requestNotificationPermission,
  showLocalTestNotification,
} from "@/lib/pwa/upload-reminder";


type PermissionState =
  | "checking"
  | "unsupported"
  | "default"
  | "granted"
  | "denied";


export function SyncReminderPermission() {
  const [
    permission,
    setPermission,
  ] =
    useState<PermissionState>(
      "checking",
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);


  useEffect(() => {
    if (
      !notificationsAvailable()
    ) {
      setPermission(
        "unsupported",
      );

      return;
    }

    const current =
      getNotificationPermission();

    if (
      current ===
      "unsupported"
    ) {
      setPermission(
        "unsupported",
      );

      return;
    }

    setPermission(
      current,
    );
  }, []);


  async function handleEnable() {
    if (
      loading
    ) {
      return;
    }

    try {
      setLoading(
        true,
      );

      /*
       * مهم:
       * این فراخوانی مستقیماً از click
       * کاربر انجام می‌شود.
       */
      const result =
        await requestNotificationPermission();

      if (
        result ===
        "unsupported"
      ) {
        setPermission(
          "unsupported",
        );

        return;
      }

      setPermission(
        result,
      );

      if (
        result !==
        "granted"
      ) {
        return;
      }

      /*
       * در مرورگرهایی که Background Sync
       * دارند، reminder هم ثبت می‌شود.
       */
      await registerUploadReminderSync();

      /*
       * یک نوتیفیکیشن تستی نشان می‌دهیم
       * تا کاربر مطمئن شود اجازه فعال شده.
       */
      await showLocalTestNotification();
    } catch (
      error
    ) {
      console.warn(
        "Unable to enable notifications:",
        error,
      );
    } finally {
      setLoading(
        false,
      );
    }
  }


  if (
    permission ===
      "checking" ||
    permission ===
      "unsupported"
  ) {
    return null;
  }


  if (
    permission ===
    "granted"
  ) {
    return (
      <section
        className="
          mt-4
          flex
          items-center
          gap-3
          rounded-2xl
          border
          border-emerald-100
          bg-emerald-50
          p-4
        "
      >
        <div
          className="
            flex
            size-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            bg-white
            text-emerald-700
          "
        >
          <CheckCircle2
            size={20}
          />
        </div>

        <div>
          <p
            className="
              text-sm
              font-bold
              text-emerald-900
            "
          >
            یادآوری‌ها فعال هستند
          </p>

          <p
            className="
              mt-1
              text-xs
              leading-6
              text-emerald-800
            "
          >
            در صورت نیاز، برنامه می‌تواند
            برای ارسال موارد در انتظار
            به شما یادآوری کند.
          </p>
        </div>
      </section>
    );
  }


  if (
    permission ===
    "denied"
  ) {
    return null;
  }


  return (
    <section
      className="
        mt-4
        rounded-2xl
        border
        border-sky-100
        bg-sky-50
        p-4
      "
    >
      <div
        className="
          flex
          items-start
          gap-3
        "
      >
        <div
          className="
            flex
            size-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            bg-white
            text-sky-700
          "
        >
          <BellRing
            size={20}
          />
        </div>

        <div
          className="
            min-w-0
            flex-1
          "
        >
          <p
            className="
              text-sm
              font-bold
              text-slate-900
            "
          >
            فعال‌سازی یادآوری
          </p>

          <p
            className="
              mt-1
              text-xs
              leading-6
              text-slate-600
            "
          >
            با فعال‌کردن اعلان‌ها،
            در صورت وجود موارد در انتظار
            ارسال می‌توانیم به شما
            یادآوری کنیم.
          </p>

          <button
            type="button"
            disabled={
              loading
            }
            onClick={() =>
              void handleEnable()
            }
            className="
              mt-3
              flex
              min-h-10
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-sky-700
              px-4
              text-xs
              font-bold
              text-white
              disabled:opacity-60
            "
          >
            {loading && (
              <LoaderCircle
                size={15}
                className="
                  animate-spin
                "
              />
            )}

            اجازه اعلان‌ها
          </button>
        </div>
      </div>
    </section>
  );
}

