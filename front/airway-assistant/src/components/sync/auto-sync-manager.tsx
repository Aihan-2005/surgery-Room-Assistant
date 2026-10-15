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
  ensureWebPushSubscription,
  getNotificationPermission,
  registerUploadReminderSync,
} from "@/lib/pwa/upload-reminder";

const AUTO_SYNC_INTERVAL_MS = 10_000;

function browserIsOnline(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine !== false
  );
}

export function AutoSyncManager() {
  const { refresh } = useConnectivity();

  const runningRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;

    try {

      
      const allCases = await getAllCases();

      for (const airwayCase of allCases) {
        if (
          airwayCase.syncStatus === "syncing" &&
          !isCaseSyncInFlight(airwayCase.id)
        ) {
          await updateCaseStatus(
            airwayCase.id,
            "queued",
          );
        }
      }

      const queuedCases = (
        await getQueuedCases()
      ).sort(
        (first, second) =>
          new Date(first.updatedAt).getTime() -
          new Date(second.updatedAt).getTime(),
      );

      /*
       * Sending cases is independent from
       * notification permission.
       */
      if (queuedCases.length > 0) {
        /*
         * Optional Background Sync reminder.
         * Failure must not block local cases.
         */
        await registerUploadReminderSync();

        if (browserIsOnline()) {
          const connectivity = await refresh();

          if (connectivity.canUpload) {
            for (const airwayCase of queuedCases) {
              if (!browserIsOnline()) {
                break;
              }

              try {
                await syncCase(airwayCase.id);
              } catch (error) {
                console.warn(
                  "Automatic sync paused:",
                  error,
                );

                await registerUploadReminderSync();

                // Avoid repeated requests after a failure.
                break;
              }
            }

            await refresh();
          }
        }
      }

      /*
       * Web Push subscription is independent
       * from the number of queued cases.
       *
       * Never request notification permission
       * automatically. Only reconnect when the
       * user has already granted permission.
       */
      if (
        browserIsOnline() &&
        getNotificationPermission() === "granted"
      ) {
        await ensureWebPushSubscription();
      }
    } catch (error) {
      console.warn(
        "Automatic queue processing failed:",
        error,
      );
    } finally {
      runningRef.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    void processQueue();

    /*
     * Periodically check while the app is visible.
     */
    const intervalId = window.setInterval(() => {
      if (
        document.visibilityState === "visible"
      ) {
        void processQueue();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    const handleOnline = () => {
      void processQueue();
    };

    const handleFocus = () => {
      void processQueue();
    };

    const handlePageShow = () => {
      void processQueue();
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible"
      ) {
        void processQueue();
      }
    };

    const handleControllerChange = () => {
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

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );
    }

    return () => {
      window.clearInterval(intervalId);

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

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      }
    };
  }, [processQueue]);

  return null;
}

