"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  getAllCases,
  getQueuedCases,
  updateCaseStatus,
} from "@/lib/db/database";

import {
  syncCase,
} from "@/lib/api/sync-case";

import {
  checkConnectivity,
} from "@/lib/network/connectivity";

import {
  ensureOperatorRegistered,
  getOperatorProfile,
} from "@/lib/profile/operator-profile";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";

const AUTO_SYNC_INTERVAL_MS =
  12_000;

export function AutoSyncManager() {
  const {
    connectivity,
    refresh,
  } =
    useConnectivity();

  const runningRef =
    useRef(false);

  const processQueue =
    useCallback(
      async () => {
        /*
         * جلوگیری از اجرای همزمان چند sync.
         */
        if (
          runningRef.current
        ) {
          return;
        }

        runningRef.current =
          true;

        try {
          /*
           * این component فقط سمت Browser اجرا می‌شود،
           * اما باز هم برای اطمینان check می‌کنیم.
           */
          if (
            typeof navigator ===
              "undefined"
          ) {
            return;
          }

          /*
           * اگر Browser صراحتاً offline است،
           * هیچ درخواست شبکه‌ای نمی‌زنیم.
           */
          if (
            navigator.onLine ===
            false
          ) {
            return;
          }

          /*
           * تا وقتی نام پزشک روی دستگاه ثبت نشده،
           * چیزی برای register/sync نداریم.
           */
          const profile =
            getOperatorProfile();

          if (!profile) {
            return;
          }

          /*
           * وضعیت واقعی Backend را بررسی می‌کنیم.
           */
          let latest =
            await checkConnectivity();

          /*
           * اگر Backend در دسترس است ولی Device
           * هنوز token ندارد، در پس‌زمینه register شود.
           *
           * همچنین اگر token قبلی دیگر معتبر نیست،
           * Device ID جدید ساخته و دوباره register می‌شود.
           */
          if (
            latest.backendReachable &&
            (
              !profile.deviceToken ||
              latest.reason ===
                "device_unauthorized"
            )
          ) {
            try {
              await ensureOperatorRegistered(
                {
                  force:
                    latest.reason ===
                    "device_unauthorized",
                },
              );
            } catch (
              error
            ) {
              console.warn(
                "Automatic device registration failed:",
                error,
              );

              await refresh();

              return;
            }

            /*
             * بعد از registration وضعیت اتصال
             * باید دوباره بررسی شود چون حالا token داریم.
             */
            await refresh();

            latest =
              await checkConnectivity();
          }

          /*
           * فقط وقتی واقعاً امکان Upload داریم
           * وارد Queue می‌شویم.
           */
          if (
            !latest.canUpload
          ) {
            return;
          }

          /*
           * اگر اپ در upload قبلی بسته شده باشد،
           * ممکن است Case روی syncing باقی مانده باشد.
           *
           * آن‌ها را دوباره queued می‌کنیم.
           */
          const allCases =
            await getAllCases();

          for (
            const airwayCase of
            allCases
          ) {
            if (
              airwayCase.syncStatus ===
              "syncing"
            ) {
              await updateCaseStatus(
                airwayCase.id,
                "queued",
              );
            }
          }

          /*
           * تمام Caseهای در صف را از IndexedDB بخوان.
           */
          const queuedCases =
            (
              await getQueuedCases()
            ).sort(
              (
                first,
                second,
              ) =>
                new Date(
                  first.updatedAt,
                ).getTime() -
                new Date(
                  second.updatedAt,
                ).getTime(),
            );

          /*
           * Caseها یکی‌یکی ارسال می‌شوند.
           *
           * این مهم است چون نمی‌خواهیم چند Case
           * با تصاویر زیاد همزمان upload شوند.
           */
          for (
            const airwayCase of
            queuedCases
          ) {
            /*
             * قبل از هر Case دوباره وضعیت شبکه
             * را بررسی می‌کنیم.
             */
            const beforeUpload =
              await checkConnectivity();

            if (
              !beforeUpload.canUpload
            ) {
              break;
            }

            try {
              await syncCase(
                airwayCase.id,
              );
            } catch (
              error
            ) {
              console.warn(
                "Automatic case sync paused:",
                error,
              );

              /*
               * اگر اولین upload شکست خورد،
               * روی همین اتصال بقیه Queue را
               * پشت سر هم fail نمی‌کنیم.
               */
              break;
            }
          }

          /*
           * بعد از sync وضعیت Online/Offline
           * و Authentication دوباره refresh شود.
           */
          await refresh();
        } finally {
          runningRef.current =
            false;
        }
      },
      [
        refresh,
      ],
    );

  useEffect(() => {
    /*
     * بلافاصله بعد از mount یک بار تلاش می‌کنیم.
     */
    void processQueue();

    /*
     * حتی اگر event شبکه‌ای نیاید،
     * هر 12 ثانیه Queue بررسی می‌شود.
     */
    const intervalId =
      window.setInterval(
        () => {
          void processQueue();
        },
        AUTO_SYNC_INTERVAL_MS,
      );

    /*
     * اینترنت برگشت:
     * فوراً Queue بررسی شود.
     */
    const handleOnline =
      () => {
        void processQueue();
      };

    /*
     * کاربر دوباره برگشت داخل برنامه:
     * Queue دوباره بررسی شود.
     */
    const handleFocus =
      () => {
        void processQueue();
      };

    /*
     * مخصوص PWA / موبایل:
     * وقتی برنامه دوباره visible شد،
     * sync بررسی شود.
     */
    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void processQueue();
        }
      };

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [
    processQueue,
    connectivity.mode,
    connectivity.reason,
  ]);

  /*
   * Manager فقط behavior دارد و UI ندارد.
   */
  return null;
}

