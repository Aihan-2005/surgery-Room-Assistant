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

import {
  registerUploadReminderSync,
} from "@/lib/pwa/upload-reminder";


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

        runningRef.current =
          true;

        try {
          /*
           * Caseهایی که برنامه وسط sync
           * بسته شده بود دوباره queued شوند.
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
           * Queue خالی است.
           */
          if (
            queuedCases.length ===
            0
          ) {
            return;
          }


          /*
           * حتی اگر Offline باشیم،
           * Background Sync reminder
           * ثبت شود.
           */
          await registerUploadReminderSync();


          /*
           * هنوز اینترنت نداریم.
           *
           * هیچ request ارسال نشود.
           */
          if (
            !browserIsOnline()
          ) {
            return;
          }


          /*
           * Backend + DB check.
           */
          const connectivity =
            await refresh();

          if (
            !connectivity.canUpload
          ) {
            return;
          }


          /*
           * Queue یکی‌یکی ارسال شود.
           */
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
               * اگر ارسال شکست خورد،
               * reminder همچنان ثبت باشد.
               */
              await registerUploadReminderSync();

              /*
               * روی یک اتصال خراب پشت‌سرهم
               * تمام Queue را ارسال نکن.
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
     * هنگام بازشدن برنامه.
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
     * لحظه برگشت اینترنت.
     */
    const handleOnline =
      () => {
        void processQueue();
      };


    /*
     * برگشت focus.
     */
    const handleFocus =
      () => {
        void processQueue();
      };


    /*
     * PWA دوباره visible شد.
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