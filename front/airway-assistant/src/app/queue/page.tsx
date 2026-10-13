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
} from "@/lib/db/database";

import {
  syncCase,
} from "@/lib/api/sync-case";

import type {
  AirwayCase,
} from "@/lib/domain/types";

function isPendingCase(
  airwayCase:
    AirwayCase,
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
      return "در انتظار ارسال";

    case "syncing":
      return "در حال ارسال";

    case "synced":
      return "ارسال شده";

    case "failed":
      return "نیاز به تلاش مجدد";
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
      async (
        showLoading =
          false,
      ) => {
        if (
          showLoading
        ) {
          setLoading(
            true,
          );
        }

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
                  first,
                  second,
                ) =>
                  new Date(
                    second.updatedAt,
                  ).getTime() -
                  new Date(
                    first.updatedAt,
                  ).getTime(),
              );

          setQueuedCases(
            pending,
          );
        } catch (
          error
        ) {
          console.error(
            "Failed to load queue:",
            error,
          );

          setMessage(
            "نمایش صف ارسال انجام نشد.",
          );
        } finally {
          if (
            showLoading
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [],
    );

  useEffect(() => {
    void loadQueue(
      true,
    );

    /*
     * فقط UI Queue را refresh می‌کند.
     *
     * ارسال واقعی توسط AutoSyncManager
     * انجام می‌شود.
     */
    const intervalId =
      window.setInterval(
        () => {
          void loadQueue();
        },
        2_000,
      );

    const handleStateChange =
      () => {
        void loadQueue();

        void refreshConnectivity();
      };

    window.addEventListener(
      "focus",
      handleStateChange,
    );

    window.addEventListener(
      "online",
      handleStateChange,
    );

    window.addEventListener(
      "offline",
      handleStateChange,
    );

    return () => {
      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "focus",
        handleStateChange,
      );

      window.removeEventListener(
        "online",
        handleStateChange,
      );

      window.removeEventListener(
        "offline",
        handleStateChange,
      );
    };
  }, [
    loadQueue,
    refreshConnectivity,
  ]);

  /*
   * فقط fallback برای Caseهایی که
   * وارد failed شده‌اند.
   *
   * queuedها خودکار ارسال می‌شوند.
   */
  async function retryFailedCase(
    caseId:
      string,
  ) {
    if (
      sendingId
    ) {
      return;
    }

    setMessage(
      null,
    );

    const latest =
      await refreshConnectivity();

    if (
      !latest.canUpload
    ) {
      setMessage(
        "ارسال فعلاً ممکن نیست. برنامه دوباره به‌صورت خودکار تلاش می‌کند.",
      );

      return;
    }

    try {
      setSendingId(
        caseId,
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
        "Retry failed:",
        error,
      );

      setMessage(
        "ارسال کامل نشد. اطلاعات محفوظ است و می‌توانید بعداً دوباره تلاش کنید.",
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
    setMessage(
      null,
    );

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
            صف ارسال
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            ارسال اطلاعات
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-slate-500
            "
          >
            موارد موجود در این صفحه
            به‌صورت خودکار ارسال می‌شوند.
          </p>
        </div>

        <NetworkPill />
      </header>

      {/* Connection / send status */}

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
          </div>
        </div>
      )}

      {connectivity.canUpload && (
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
              ارسال خودکار فعال است
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-emerald-800
              "
            >
              موارد در انتظار به‌صورت
              خودکار ارسال خواهند شد.
            </p>
          </div>
        </div>
      )}

      {connectivity.mode !==
        "checking" &&
        !connectivity.canUpload &&
        connectivity.internetReachable && (
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
          <RefreshCw
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
              ارسال موقتاً در دسترس نیست
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-amber-800
              "
            >
              نیاز به کاری نیست؛ برنامه
              دوباره به‌صورت خودکار بررسی
              می‌کند.
            </p>
          </div>
        </div>
      )}

      {connectivity.mode !==
        "checking" &&
        !connectivity.internetReachable && (
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
              اینترنت قطع است
            </p>

            <p
              className="
                mt-1
                text-xs
                leading-6
                text-amber-800
              "
            >
              پس از برگشت اینترنت،
              ارسال به‌صورت خودکار ادامه
              پیدا می‌کند.
            </p>
          </div>
        </div>
      )}

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
          {
            message
          }
        </div>
      )}

      {/* Queue header */}

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
          aria-label="بروزرسانی"
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
              موردی در انتظار ارسال نیست.
            </p>
          </div>
        )}

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
                    .fullName
                    ?.trim() ||
                  "نام بیمار ثبت نشده";

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
                          Boolean(
                            sendingId,
                          )
                        }
                        onClick={() =>
                          void retryFailedCase(
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
                          <RefreshCw
                            size={16}
                          />
                        )}

                        تلاش مجدد
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
                      "
                    >
                      مشاهده ارزیابی
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

