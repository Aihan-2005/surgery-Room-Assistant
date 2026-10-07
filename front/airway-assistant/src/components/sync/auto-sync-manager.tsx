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

          const queued =
            (
              await getQueuedCases()
            ).sort(
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
            const latest =
              await checkConnectivity();

            if (
              !latest.canUpload
            ) {
              await refresh();

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

              break;
            }
          }

          await refresh();
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

    return () =>
      window.clearInterval(
        interval,
      );
  }, [
    connectivity.canUpload,
    processQueue,
  ]);

  return null;
}