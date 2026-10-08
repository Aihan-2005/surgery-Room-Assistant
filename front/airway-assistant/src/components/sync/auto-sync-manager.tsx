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
  checkConnectivity,
} from "@/lib/network/connectivity";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";


const FALLBACK_SYNC_INTERVAL_MS =
  45_000;


/*
 * مهم:
 *
 * تمام بررسی‌های navigator.onLine فقط
 * از طریق این تابع انجام می‌شوند.
 *
 * این کار مشکل TypeScript narrowing
 * و خطای TS2367 را برطرف می‌کند.
 */
function canTryNetwork():
  boolean {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  return Boolean(
    navigator.onLine,
  );
}


export function AutoSyncManager() {
  const {
    refresh,
  } =
    useConnectivity();

  /*
   * جلوگیری از اجرای همزمان
   * چند processQueue.
   */
  const runningRef =
    useRef(false);


  const processQueue =
    useCallback(
      async () => {
        /*
         * قبلاً یک Queue processor
         * در حال اجراست.
         */
        if (
          runningRef.current
        ) {
          return;
        }

        /*
         * اگر Browser offline است،
         * هیچ درخواست شبکه‌ای ارسال نکن.
         */
        if (
          !canTryNetwork()
        ) {
          return;
        }

        runningRef.current =
          true;

        try {
          /*
           * اول فقط IndexedDB محلی
           * بررسی می‌شود.
           *
           * هیچ request شبکه‌ای اینجا نداریم.
           */
          const allCases =
            await getAllCases();


          /*
           * اگر برنامه وسط upload بسته شده
           * باشد ممکن است Case روی syncing
           * باقی مانده باشد.
           *
           * اگر همین الان upload واقعی برایش
           * در حال اجرا نیست، دوباره queued شود.
           */
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
           * Queue واقعی را از IndexedDB
           * دریافت می‌کنیم.
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
           * خیلی مهم:
           *
           * Queue خالی است؟
           * هیچ request به Backend نزن.
           */
          if (
            queuedCases.length ===
            0
          ) {
            return;
          }


          /*
           * ممکن است از زمان شروع تابع
           * اینترنت قطع شده باشد.
           */
          if (
            !canTryNetwork()
          ) {
            return;
          }


          /*
           * فقط حالا که واقعاً Case
           * برای ارسال داریم، Backend
           * را بررسی می‌کنیم.
           */
          const connectivity =
            await checkConnectivity();


          if (
            !connectivity.canUpload
          ) {
            return;
          }


          /*
           * Caseها یکی‌یکی ارسال می‌شوند.
           *
           * عمداً parallel upload نداریم
           * تا فشار سرور و مصرف RAM کمتر باشد.
           */
          for (
            const airwayCase of
            queuedCases
          ) {
            /*
             * قبل از هر Case دوباره فقط
             * وضعیت Browser را بررسی می‌کنیم.
             */
            if (
              !canTryNetwork()
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
               * اگر یک upload شکست خورد،
               * بقیه Queue را روی همان اتصال
               * خراب پشت سر هم ارسال نکن.
               */
              break;
            }
          }


          /*
           * بعد از عملیات وضعیت UI
           * یک بار refresh شود.
           */
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
     * هنگام باز شدن برنامه:
     *
     * Queue محلی بررسی می‌شود.
     * اگر Queue خالی باشد هیچ درخواست
     * Backend ارسال نمی‌شود.
     */
    void processQueue();


    /*
     * fallback timer.
     *
     * event online معمولاً خیلی زودتر
     * عملیات sync را اجرا می‌کند.
     */
    const intervalId =
      window.setInterval(
        () => {
          void processQueue();
        },
        FALLBACK_SYNC_INTERVAL_MS,
      );


    /*
     * اینترنت برگشت:
     * همان لحظه Queue بررسی شود.
     */
    const handleOnline =
      () => {
        void processQueue();
      };


    /*
     * کاربر برگشت داخل برنامه:
     * Queue بررسی شود.
     */
    const handleFocus =
      () => {
        void processQueue();
      };


    /*
     * برای PWA / موبایل:
     *
     * وقتی برنامه دوباره visible شد،
     * Queue بررسی شود.
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
  ]);


  return null;
}