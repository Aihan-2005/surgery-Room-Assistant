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
  isCaseSyncInFlight,
  syncCase,
} from "@/lib/api/sync-case";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";

const AUTO_SYNC_INTERVAL_MS =
  10_000;

function browserIsOnline() {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  return (
    navigator.onLine !==
    false
  );
}

export function AutoSyncManager() {
  const {
    refresh,
  } =
    useConnectivity();

  const runningRef =
    useRef(false);

  const processQueue =
    useCallback(
      async () => {
        if (
          runningRef.current
        ) {
          return;
        }

        if (
          !browserIsOnline()
        ) {
          return;
        }

        runningRef.current =
          true;

        try {
          /*
           * اگر برنامه در وسط sync بسته شده بود،
           * Caseهای syncing قدیمی دوباره queued شوند.
           */
          const allCases =
            await getAllCases();

          for (
            const airwayCase of
            allCases
          ) {
            if (
              airwayCase.syncStatus ===
                "syncing" &&
              !isCaseSyncInFlight(
                airwayCase.id,
              )
            ) {
              await updateCaseStatus(
                airwayCase.id,
                "queued",
              );
            }
          }

          /*
           * فقط Caseهای queued برای
           * AutoSync انتخاب می‌شوند.
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

          if (
            queuedCases.length ===
            0
          ) {
            return;
          }

          if (
            !browserIsOnline()
          ) {
            return;
          }

          /*
           * وضعیت ارسال را بررسی کن و
           * همزمان UI را هم refresh کن.
           */
          const connectivity =
            await refresh();

          if (
            !connectivity.canUpload
          ) {
            return;
          }

          for (
            const airwayCase of
            queuedCases
          ) {
            if (
              !browserIsOnline()
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
                "Automatic sync paused:",
                error,
              );

              /*
               * اگر همین Case مشکل داشت،
               * پشت سر هم request نفرست.
               *
               * ده ثانیه بعد دوباره Queue
               * بررسی خواهد شد.
               */
              break;
            }
          }

          await refresh();
        } catch (
          error
        ) {
          console.warn(
            "Automatic queue processing failed:",
            error,
          );
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
     * هنگام باز شدن برنامه.
     */
    void processQueue();

    /*
     * هر 10 ثانیه.
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
     * همان لحظه تلاش شود.
     */
    const handleOnline =
      () => {
        void processQueue();
      };

    /*
     * برگشت کاربر به برنامه.
     */
    const handleFocus =
      () => {
        void processQueue();
      };

    /*
     * PWA / mobile.
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

    const handlePageShow =
      () => {
        void processQueue();
      };

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    window.addEventListener(
      "pageshow",
      handlePageShow,
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

      window.removeEventListener(
        "pageshow",
        handlePageShow,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [
    processQueue,
  ]);

  return null;
}

