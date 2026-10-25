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
  releaseSyncedCaseBlobs,
} from "@/lib/api/synced-photos";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";

import {
  ensureWebPushSubscription,
  getNotificationPermission,
  getReadyServiceWorkerRegistration,
  registerUploadReminderSync,
} from "@/lib/pwa/upload-reminder";

const AUTO_SYNC_INTERVAL_MS = 10_000;
const CLEANUP_RETRY_MS = 3 * 60_000;

const REMINDER_MESSAGE =
  "AIRWAY_CHECK_PENDING_REMINDER";

function browserIsOnline(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine !== false
  );
}

async function requestPendingReminder():
  Promise<void> {
  if (
    !browserIsOnline() ||
    document.visibilityState === "visible" ||
    getNotificationPermission() !== "granted"
  ) {
    return;
  }

  const stillPending = (
    await getAllCases()
  ).some(
    (item) =>
      ["queued", "syncing", "failed"].includes(
        item.syncStatus,
      ),
  );

  if (!stillPending) return;

  const registration =
    await getReadyServiceWorkerRegistration();

  registration?.active?.postMessage({
    type: REMINDER_MESSAGE,
  });
}

export function AutoSyncManager() {
  const { refresh } = useConnectivity();

  const runningRef = useRef(false);

  const cleanedOrChecked =
    useRef(new Set<string>());

  const retryAfter =
    useRef(new Map<string, number>());

  const processQueue = useCallback(async () => {
    if (runningRef.current) return;

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


      if (queuedCases.length > 0) {
        await registerUploadReminderSync();

        if (browserIsOnline()) {
          const connectivity = await refresh();

          if (connectivity.canUpload) {
            for (const airwayCase of queuedCases) {
              if (!browserIsOnline()) break;

              try {
                await syncCase(airwayCase.id);
              } catch (error) {
                console.warn(
                  "Automatic sync paused:",
                  error,
                );

                await registerUploadReminderSync();

                break;
              }
            }

            await refresh();
          }
        }
      }

      await requestPendingReminder();


      if (
        browserIsOnline() &&
        getNotificationPermission() === "granted"
      ) {
        await ensureWebPushSubscription();
      }



      if (
        browserIsOnline() &&
        document.visibilityState === "visible"
      ) {
        const latestCases = await getAllCases();
        const now = Date.now();

        for (const item of latestCases) {
          if (item.syncStatus !== "synced") {
            continue;
          }

          if (
            cleanedOrChecked.current.has(item.id)
          ) {
            continue;
          }

          if (
            (retryAfter.current.get(item.id) ?? 0) >
            now
          ) {
            continue;
          }

          try {
            const bytes =
              await releaseSyncedCaseBlobs(item.id);

            cleanedOrChecked.current.add(item.id);
            retryAfter.current.delete(item.id);

            if (bytes > 0) {
              console.info(
                "Verified synced photo storage released",
                bytes,
              );
            }
          } catch (error) {
            retryAfter.current.set(
              item.id,
              now + CLEANUP_RETRY_MS,
            );

            console.warn(
              "Synced-photo cleanup deferred:",
              error,
            );
          }

           break;
        }
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

    const intervalId = window.setInterval(() => {
      if (
        document.visibilityState === "visible"
      ) {
        void processQueue();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    const onOnline = () => void processQueue();
    const onFocus = () => void processQueue();
    const onPageShow = () => void processQueue();

    const onVisible = () => {
      if (
        document.visibilityState === "visible"
      ) {
        void processQueue();
      }
    };

    const onControllerChange = () =>
      void processQueue();

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    document.addEventListener(
      "visibilitychange",
      onVisible,
    );

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
      );
    }

    return () => {
      window.clearInterval(intervalId);

      window.removeEventListener(
        "online",
        onOnline,
      );

      window.removeEventListener(
        "focus",
        onFocus,
      );

      window.removeEventListener(
        "pageshow",
        onPageShow,
      );

      document.removeEventListener(
        "visibilitychange",
        onVisible,
      );

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
    };
  }, [processQueue]);

  return null;
}
