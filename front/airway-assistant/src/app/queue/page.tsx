"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  CheckCircle2,
  Clock3,
  CloudOff,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  UploadCloud,
  Wifi,
} from "lucide-react";

import {
  NetworkPill,
} from "@/components/app-shell/network-pill";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";

import {
  getAllCases,
  updateCaseStatus,
} from "@/lib/db/database";

import {
  syncCase,
} from "@/lib/api/sync-case";

import {
  checkConnectivity,
} from "@/lib/network/connectivity";

import type {
  AirwayCase,
} from "@/lib/domain/types";

 
function isPendingCase(
  airwayCase: AirwayCase,
) {
  return (
    airwayCase.syncStatus ===
      "queued" ||
    airwayCase.syncStatus ===
      "syncing" ||
    airwayCase.syncStatus ===
      "failed"
  );
}

function getStatusLabel(
  status:
    AirwayCase["syncStatus"],
) {
  switch (status) {
    case "draft":
      return "پیش‌نویس";

    case "queued":
      return "در صف";

    case "syncing":
      return "در حال ارسال";

    case "synced":
      return "ارسال شده";

    case "failed":
      return "خطای ارسال";
  }
}

function getStatusClass(
  status:
    AirwayCase["syncStatus"],
) {
  switch (status) {
    case "syncing":
      return `
        bg-sky-50
        text-sky-700
      `;

    case "failed":
      return `
        bg-red-50
        text-red-700
      `;

    case "synced":
      return `
        bg-emerald-50
        text-emerald-700
      `;

    default:
      return `
        bg-amber-50
        text-amber-700
      `;
  }
}

 
export default function QueuePage() {
  const {
    connectivity,
    refresh:
      refreshConnectivity,
  } =
    useConnectivity();

  const [
    queuedCases,
    setQueuedCases,
  ] =
    useState<
      AirwayCase[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    sendingId,
    setSendingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(null);
 


  const loadQueue =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        try {
          const cases =
            await getAllCases();

          const pending =
            cases
              .filter(
                isPendingCase,
              )
              .sort(
                (
                  a,
                  b,
                ) =>
                  new Date(
                    b.updatedAt,
                  ).getTime() -
                  new Date(
                    a.updatedAt,
                  ).getTime(),
              );

          setQueuedCases(
            pending,
          );
        } catch (
          error
        ) {
          console.error(
            "Failed to load upload queue:",
            error,
          );

          setMessage(
            "خواندن صف ارسال انجام نشد.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );


    
  useEffect(() => {
    void loadQueue();

    const handleFocus =
      () => {
        void loadQueue();

        void refreshConnectivity();
      };

    const handleOnline =
      () => {
        void loadQueue();

        void refreshConnectivity();
      };

    const handleOffline =
      () => {
        void loadQueue();

        void refreshConnectivity();
      };


      

    const intervalId =
      window.setInterval(
        () => {
          void loadQueue();
        },
        5000,
      );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "offline",
      handleOffline,
    );

    return () => {
      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "offline",
        handleOffline,
      );
    };
  }, [
    loadQueue,
    refreshConnectivity,
  ]);


  
  async function retryCase(
    caseId: string,
  ) {
    if (sendingId) {
      return;
    }

    setMessage(null);


    

    const latestConnectivity =
      await checkConnectivity();

    if (
      !latestConnectivity.canUpload
    ) {
      await refreshConnectivity();

      setMessage(
        latestConnectivity.mode ===
          "local-only"
          ? "اینترنت برقرار است، اما Backend هنوز متصل نشده است. اطلاعات در صف محلی باقی می‌ماند."
          : "اتصال برای ارسال تصاویر مناسب نیست. اطلاعات در صف باقی می‌ماند و بعداً دوباره ارسال می‌شود.",
      );

      return;
    }

    try {
      setSendingId(
        caseId,
      );

 
      
      await updateCaseStatus(
        caseId,
        "queued",
      );

      await syncCase(
        caseId,
      );

      setMessage(
        "ارسال با موفقیت انجام شد.",
      );
    } catch (
      error
    ) {
      console.error(
        "Manual sync failed:",
        error,
      );

      setMessage(
        "ارسال انجام نشد. اطلاعات و تصاویر روی دستگاه محفوظ هستند و در صف ارسال باقی می‌مانند.",
      );
    } finally {
      setSendingId(
        null,
      );

      await loadQueue();

      await refreshConnectivity();
    }
  }

  

  async function handleRefresh() {
    setMessage(null);

    await Promise.all([
      loadQueue(),
      refreshConnectivity(),
    ]);
  }


  
  return (
    <div
      className="
        px-4
        pb-8
        pt-5
      "
    >
  
  

      <header
        className="
          flex
          items-start
          justify-between
          gap-4
        "
      >
        <div>
          <p
            className="
              text-xs
              font-semibold
              text-sky-700
            "
          >
            Upload Queue
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            صف ارسال
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-slate-500
            "
          >
            تصاویر و اطلاعاتی که
            هنوز ارسال نشده‌اند روی
            همین دستگاه نگهداری
            می‌شوند.
          </p>
        </div>

        <NetworkPill />
      </header>


      {connectivity.mode ===
        "checking" && (
        <div
          className="
            mt-6
            flex
            items-center
            gap-3
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-4
          "
        >
          <LoaderCircle
            size={20}
            className="
              shrink-0
              animate-spin
              text-slate-500
            "
          />

          <div>
            <p
              className="
                text-sm
                font-bold
                text-slate-900
              "
            >
              در حال بررسی اتصال
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-slate-500
              "
            >
              وضعیت شبکه و امکان ارسال
              بررسی می‌شود.
            </p>
          </div>
        </div>
      )}

    


      {connectivity.mode ===
        "online" && (
        <div
          className="
            mt-6
            flex
            gap-3
            rounded-2xl
            border
            border-emerald-100
            bg-emerald-50
            p-4
          "
        >
          <Wifi
            size={20}
            className="
              mt-0.5
              shrink-0
              text-emerald-700
            "
          />

          <div>
            <p
              className="
                text-sm
                font-bold
                text-emerald-900
              "
            >
              اتصال مناسب برای ارسال
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-emerald-800
              "
            >
              اینترنت و سرویس مقصد در
              دسترس هستند. موارد موجود
              در صف به‌صورت خودکار برای
              ارسال تلاش می‌شوند.
            </p>

            {connectivity.probeLatencyMs !==
              undefined && (
              <p
                className="
                  mt-2
                  text-[11px]
                  text-emerald-700
                "
              >
                زمان پاسخ اتصال:{" "}
                {
                  connectivity.probeLatencyMs
                }{" "}
                ms
              </p>
            )}
          </div>
        </div>
      )}

      {(connectivity.mode ===
        "offline" ||
        connectivity.mode ===
          "weak") && (
        <div
          className="
            mt-6
            flex
            gap-3
            rounded-2xl
            border
            border-amber-100
            bg-amber-50
            p-4
          "
        >
          <CloudOff
            size={20}
            className="
              mt-0.5
              shrink-0
              text-amber-700
            "
          />

          <div>
            <p
              className="
                text-sm
                font-bold
                text-amber-900
              "
            >
              حالت آفلاین
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-amber-800
              "
            >
              اتصال قطع است یا برای
              ارسال تصاویر مناسب نیست.
              می‌توانید تصویربرداری را
              ادامه دهید؛ تصاویر روی
              دستگاه ذخیره می‌شوند و
              در صف باقی می‌مانند.
            </p>

            {connectivity.mode ===
              "weak" && (
              <p
                className="
                  mt-2
                  text-[11px]
                  font-medium
                  text-amber-700
                "
              >
                اتصال شناسایی شده اما
                برای Upload مطمئن کافی
                نیست.
              </p>
            )}
          </div>
        </div>
      )}

      {connectivity.mode ===
        "local-only" && (
        <div
          className="
            mt-6
            flex
            gap-3
            rounded-2xl
            border
            border-sky-100
            bg-sky-50
            p-4
          "
        >
          <HardDrive
            size={20}
            className="
              mt-0.5
              shrink-0
              text-sky-700
            "
          />

          <div>
            <p
              className="
                text-sm
                font-bold
                text-sky-900
              "
            >
              ذخیره محلی فعال است
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-sky-800
              "
            >
              اینترنت برقرار است اما
              Backend هنوز به برنامه
              متصل نشده است. تصاویر و
              اطلاعات روی دستگاه باقی
              می‌مانند تا اتصال Backend
              فعال شود.
            </p>
          </div>
        </div>
      )}

      {/* Message */}

      {message && (
        <div
          role="status"
          className="
            mt-4
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-3
            text-xs
            leading-6
            text-slate-700
          "
        >
          {message}
        </div>
      )}

      {/* Queue title */}

      <div
        className="
          mt-5
          flex
          items-center
          justify-between
        "
      >
        <div
          className="
            flex
            items-center
            gap-2
          "
        >
          <UploadCloud
            size={20}
            className="
              text-slate-700
            "
          />

          <h2
            className="
              text-sm
              font-bold
              text-slate-900
            "
          >
            در انتظار ارسال

            {!loading &&
              queuedCases.length >
                0 && (
                <span
                  className="
                    mr-2
                    rounded-full
                    bg-slate-100
                    px-2
                    py-0.5
                    text-[11px]
                    text-slate-600
                  "
                >
                  {
                    queuedCases.length
                  }
                </span>
              )}
          </h2>
        </div>

        <button
          type="button"
          aria-label="بروزرسانی صف"
          onClick={() =>
            void handleRefresh()
          }
          disabled={
            loading
          }
          className="
            flex
            size-9
            items-center
            justify-center
            rounded-xl
            border
            border-slate-200
            bg-white
            text-slate-600
            transition
            active:scale-95
            disabled:opacity-50
          "
        >
          <RefreshCw
            size={16}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />
        </button>
      </div>

      {/* Loading */}

      {loading && (
        <div
          className="
            mt-4
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-5
            text-center
            text-sm
            text-slate-500
          "
        >
          در حال خواندن صف...
        </div>
      )}

      {/* Empty */}

      {!loading &&
        queuedCases.length ===
          0 && (
        <div
          className="
            mt-4
            rounded-3xl
            border
            border-dashed
            border-slate-300
            bg-white
            px-6
            py-10
            text-center
          "
        >
          <div
            className="
              mx-auto
              flex
              size-14
              items-center
              justify-center
              rounded-full
              bg-emerald-50
            "
          >
            <CheckCircle2
              size={26}
              className="
                text-emerald-600
              "
            />
          </div>

          <p
            className="
              mt-4
              text-sm
              font-bold
              text-slate-900
            "
          >
            صف خالی است
          </p>

          <p
            className="
              mt-2
              text-xs
              leading-6
              text-slate-500
            "
          >
            موردی در انتظار ارسال
            وجود ندارد.
          </p>
        </div>
      )}

      {/* Queue */}

      {!loading &&
        queuedCases.length >
          0 && (
        <div
          className="
            mt-4
            space-y-3
          "
        >
          {queuedCases.map(
            (
              airwayCase,
            ) => {
              const patientName =
                airwayCase
                  .clinical
                  .fullName ??
                airwayCase.caseCode;

              const isSending =
                sendingId ===
                airwayCase.id;

              return (
                <article
                  key={
                    airwayCase.id
                  }
                  className="
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white
                    p-4
                    shadow-sm
                  "
                >
                  <div
                    className="
                      flex
                      items-start
                      justify-between
                      gap-4
                    "
                  >
                    <div
                      className="
                        min-w-0
                      "
                    >
                      <p
                        className="
                          truncate
                          text-sm
                          font-bold
                          text-slate-900
                        "
                      >
                        {
                          patientName
                        }
                      </p>

                      <p
                        className="
                          mt-1
                          text-[11px]
                          font-medium
                          text-slate-400
                        "
                        dir="ltr"
                      >
                        {
                          airwayCase.caseCode
                        }
                      </p>

                      <div
                        className="
                          mt-2
                          flex
                          items-center
                          gap-1.5
                          text-xs
                          text-slate-500
                        "
                      >
                        <Clock3
                          size={14}
                        />

                        {new Intl.DateTimeFormat(
                          "fa-IR",
                          {
                            dateStyle:
                              "medium",

                            timeStyle:
                              "short",
                          },
                        ).format(
                          new Date(
                            airwayCase.updatedAt,
                          ),
                        )}
                      </div>
                    </div>

                    <span
                      className={`
                        inline-flex
                        shrink-0
                        items-center
                        gap-1
                        rounded-full
                        px-3
                        py-1.5
                        text-[11px]
                        font-bold
                        ${getStatusClass(
                          airwayCase.syncStatus,
                        )}
                      `}
                    >
                      {airwayCase.syncStatus ===
                        "syncing" && (
                        <LoaderCircle
                          size={12}
                          className="
                            animate-spin
                          "
                        />
                      )}

                      {getStatusLabel(
                        airwayCase.syncStatus,
                      )}
                    </span>
                  </div>

                  {airwayCase.syncStatus ===
                    "failed" && (
                    <button
                      type="button"
                      disabled={
                        isSending
                      }
                      onClick={() =>
                        void retryCase(
                          airwayCase.id,
                        )
                      }
                      className="
                        mt-4
                        flex
                        min-h-11
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-sky-700
                        px-4
                        text-xs
                        font-bold
                        text-white
                        transition
                        active:scale-[0.99]
                        disabled:opacity-60
                      "
                    >
                      {isSending ? (
                        <LoaderCircle
                          size={16}
                          className="
                            animate-spin
                          "
                        />
                      ) : (
                        <UploadCloud
                          size={16}
                        />
                      )}

                      تلاش مجدد برای ارسال
                    </button>
                  )}

                  <Link
                    href={`/cases/${airwayCase.id}/capture`}
                    className="
                      mt-3
                      flex
                      min-h-11
                      w-full
                      items-center
                      justify-center
                      rounded-xl
                      border
                      border-slate-200
                      text-xs
                      font-bold
                      text-slate-700
                      transition
                      active:bg-slate-50
                    "
                  >
                    مشاهده Case
                  </Link>
                </article>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}