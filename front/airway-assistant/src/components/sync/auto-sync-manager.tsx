"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  getAllCases,
  updateCaseStatus,
} from "@/lib/db/database";

import {
  syncCase,
} from "@/lib/api/sync-case";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";

const AUTO_SYNC_INTERVAL_MS =
  15_000;

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
        if (
          runningRef.current ||
          !connectivity.canUpload
        ) {
          return;
        }

        runningRef.current =
          true;

        try {
          const cases =
            await getAllCases();

          /*
           * syncing ممکن است از session قبلی
           * باقی مانده باشد؛ دوباره queued می‌شود.
           */
          const interrupted =
            cases.filter(
              (airwayCase) =>
                airwayCase.studyStatus ===
                  "outcome_complete" &&
                airwayCase.syncStatus ===
                  "syncing",
            );

          for (
            const airwayCase of
            interrupted
          ) {
            await updateCaseStatus(
              airwayCase.id,
              "queued",
            );
          }

          const refreshedCases =
            interrupted.length >
            0
              ? await getAllCases()
              : cases;

          const queued =
            refreshedCases
              .filter(
                (
                  airwayCase,
                ) =>
                  airwayCase.studyStatus ===
                    "outcome_complete" &&
                  airwayCase.syncStatus ===
                    "queued",
              )
              .sort(
                (
                  a,
                  b,
                ) =>
                  new Date(
                    a.updatedAt,
                  ).getTime() -
                  new Date(
                    b.updatedAt,
                  ).getTime(),
              );

          for (
            const airwayCase of
            queued
          ) {
            /*
             * قبل از هر upload دوباره وضعیت
             * اتصال بررسی می‌شود.
             */
            await refresh();

            if (
              !navigator.onLine
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
               * اگر اولین مورد ارسال نشد،
               * روی شبکه بد چند upload پشت‌سرهم
               * انجام نمی‌دهیم.
               */
              break;
            }
          }
        } finally {
          runningRef.current =
            false;
        }
      },
      [
        connectivity.canUpload,
        refresh,
      ],
    );

  useEffect(() => {
    if (
      !connectivity.canUpload
    ) {
      return;
    }

    void processQueue();

    const interval =
      window.setInterval(
        () => {
          void processQueue();
        },
        AUTO_SYNC_INTERVAL_MS,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    connectivity.canUpload,
    processQueue,
  ]);

  return null;
}