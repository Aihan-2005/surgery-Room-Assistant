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
          runningRef.current
        ) {
          return;
        }

        runningRef.current =
          true;

        try {
          if (
            typeof navigator ===
              "undefined" ||
            !navigator.onLine
          ) {
            return;
          }

          const profile =
            getOperatorProfile();

          if (!profile) {
            return;
          }

          let latest =
            await checkConnectivity();


          /*
           * اینترنت و Backend داریم،
           * ولی Device هنوز register نشده.
           */
          if (
            latest.backendReachable &&
            latest.databaseReady &&
            (
              !profile.deviceToken ||
              latest.reason ===
                "device_unauthorized"
            )
          ) {
            try {
              await ensureOperatorRegistered({
                force:
                  latest.reason ===
                  "device_unauthorized",
              });
            } catch (
              error
            ) {
              console.warn(
                "Background device registration failed:",
                error,
              );

              await refresh();

              return;
            }

            await refresh();

            latest =
              await checkConnectivity();
          }


          if (
            !latest.canUpload
          ) {
            return;
          }


          /*
           * اگر اپ وسط upload بسته شده بود،
           * syncing قبلی را recover کن.
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
        refresh,
      ],
    );


  useEffect(() => {
    void processQueue();

    const interval =
      window.setInterval(
        () => {
          void processQueue();
        },
        AUTO_SYNC_INTERVAL_MS,
      );


    const handleOnline =
      () => {
        void processQueue();
      };


    window.addEventListener(
      "online",
      handleOnline,
    );


    return () => {
      window.clearInterval(
        interval,
      );

      window.removeEventListener(
        "online",
        handleOnline,
      );
    };
  }, [
    processQueue,
    connectivity.mode,
    connectivity.reason,
  ]);


  return null;
}