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
  RefreshCw,
  UploadCloud,
  WifiOff,
} from "lucide-react";

import { NetworkPill } from "@/components/app-shell/network-pill";

import {
  getQueuedCases,
} from "@/lib/db/database";

import type {
  AirwayCase,
} from "@/lib/domain/types";

export default function QueuePage() {
  const [
    queuedCases,
    setQueuedCases,
  ] = useState<
    AirwayCase[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const loadQueue =
    useCallback(async () => {
      setLoading(true);

      try {
        const result =
          await getQueuedCases();

        setQueuedCases(
          result.sort(
            (a, b) =>
              new Date(
                b.updatedAt,
              ).getTime() -
              new Date(
                a.updatedAt,
              ).getTime(),
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadQueue();

    window.addEventListener(
      "online",
      loadQueue,
    );

    window.addEventListener(
      "focus",
      loadQueue,
    );

    return () => {
      window.removeEventListener(
        "online",
        loadQueue,
      );

      window.removeEventListener(
        "focus",
        loadQueue,
      );
    };
  }, [loadQueue]);

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
            صف تحلیل
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-slate-500
            "
          >
            Caseهایی که تصاویر
            آن‌ها آماده ارسال به
            سرویس AI است.
          </p>
        </div>

        <NetworkPill />
      </header>

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
        <WifiOff
          className="
            mt-0.5
            shrink-0
            text-sky-700
          "
          size={20}
        />

        <div>
          <p
            className="
              text-sm
              font-bold
              text-sky-900
            "
          >
            اتصال AI هنوز فعال
            نشده است
          </p>

          <p
            className="
              mt-1
              text-xs
              leading-6
              text-sky-800
            "
          >
            در این مرحله Caseها
            فقط به صورت امن در صف
            محلی قرار می‌گیرند.
            وقتی API هوش مصنوعی
            مشخص شد همین Queue را
            به Upload واقعی وصل
            می‌کنیم.
          </p>
        </div>
      </div>

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
            className="text-slate-700"
          />

          <h2
            className="
              text-sm
              font-bold
              text-slate-900
            "
          >
            در انتظار ارسال
          </h2>
        </div>

        <button
          type="button"
          onClick={
            loadQueue
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
          "
        >
          <RefreshCw
            size={16}
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
                className="text-emerald-600"
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
              Case آماده‌ی تحلیلی
              وجود ندارد.
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
              (airwayCase) => (
                <div
                  key={
                    airwayCase.id
                  }
                  className="
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white
                    p-4
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
                    <div>
                      <p
                        className="
                          text-sm
                          font-bold
                          text-slate-900
                        "
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
                      className="
                        rounded-full
                        bg-amber-50
                        px-3
                        py-1.5
                        text-[11px]
                        font-bold
                        text-amber-700
                      "
                    >
                      در صف
                    </span>
                  </div>

                  <Link
                    href={`/cases/${airwayCase.id}/capture`}
                    className="
                      mt-4
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
                    مشاهده Case
                  </Link>
                </div>
              ),
            )}
          </div>
        )}
    </div>
  );}