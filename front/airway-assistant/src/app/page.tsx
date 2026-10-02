"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowLeft,
  Camera,
  ClipboardPlus,
  Clock3,
  ShieldCheck,
} from "lucide-react";

import { NetworkPill } from "@/components/app-shell/network-pill";

import {
  getAllCases,
} from "@/lib/db/database";

import type {
  AirwayCase,
} from "@/lib/domain/types";

function getStatusLabel(
  status:
    AirwayCase["syncStatus"],
) {
  switch (status) {
    case "draft":
      return "پیش‌نویس";

    case "queued":
      return "در صف ارسال";

    case "syncing":
      return "در حال ارسال";

    case "synced":
      return "ارسال شده";

    case "failed":
      return "خطای ارسال";
  }
}

export default function HomePage() {
  const [cases, setCases] =
    useState<AirwayCase[]>(
      [],
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const loadCases =
    useCallback(async () => {
      try {
        const result =
          await getAllCases();

        setCases(result);
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadCases();

    const handleFocus = () => {
      loadCases();
    };

    window.addEventListener(
      "focus",
      handleFocus,
    );

    return () => {
      window.removeEventListener(
        "focus",
        handleFocus,
      );
    };
  }, [loadCases]);

  return (
    <div className="px-4 pb-8 pt-5">
      <header
        className="
          flex
          items-center
          justify-between
          gap-4
        "
      >
        <div>
          <p
            className="
              text-xs
              font-medium
              text-sky-700
            "
          >
            Airway Assistant
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              tracking-tight
              text-slate-950
            "
          >
            ارزیابی راه هوایی
          </h1>
        </div>

        <NetworkPill />
      </header>

      <section
        className="
          mt-6
          overflow-hidden
          rounded-3xl
          bg-sky-700
          p-5
          text-white
          shadow-sm
        "
      >
        <div
          className="
            flex
            size-12
            items-center
            justify-center
            rounded-2xl
            bg-white/15
          "
        >
          <Camera size={25} />
        </div>

        <h2
          className="
            mt-6
            text-xl
            font-bold
          "
        >
          ارزیابی جدید
        </h2>

        <p
          className="
            mt-2
            text-sm
            leading-7
            text-sky-100
          "
        >
          اطلاعات اولیه را وارد
          کنید و تصاویر استاندارد
          بیمار را ثبت کنید.
        </p>

        <Link
          href="/cases/new"
          className="
            mt-5
            flex
            min-h-13
            items-center
            justify-center
            gap-2
            rounded-2xl
            bg-white
            px-4
            font-bold
            text-sky-700
            transition
            active:scale-[0.98]
          "
        >
          <ClipboardPlus
            size={20}
          />

          شروع ارزیابی

          <ArrowLeft
            size={18}
          />
        </Link>
      </section>

      <section
        className="
          mt-4
          grid
          grid-cols-2
          gap-3
        "
      >
        <div
          className="
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-4
          "
        >
          <ShieldCheck
            className="text-emerald-600"
            size={22}
          />

          <p
            className="
              mt-4
              text-sm
              font-bold
              text-slate-900
            "
          >
            ذخیره محلی
          </p>

          <p
            className="
              mt-1
              text-xs
              leading-6
              text-slate-500
            "
          >
            تصاویر ابتدا روی
            دستگاه ذخیره می‌شوند.
          </p>
        </div>

        <div
          className="
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-4
          "
        >
          <Clock3
            className="text-sky-600"
            size={22}
          />

          <p
            className="
              mt-4
              text-sm
              font-bold
              text-slate-900
            "
          >
            Offline-first
          </p>

          <p
            className="
              mt-1
              text-xs
              leading-6
              text-slate-500
            "
          >
            قطع اینترنت مانع ثبت
            اطلاعات نمی‌شود.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div
          className="
            flex
            items-center
            justify-between
          "
        >
          <h2
            className="
              text-base
              font-bold
              text-slate-950
            "
          >
            آخرین ارزیابی‌ها
          </h2>

          <Link
            href="/queue"
            className="
              text-xs
              font-semibold
              text-sky-700
            "
          >
            مشاهده صف
          </Link>
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
            در حال بارگذاری...
          </div>
        )}

        {!loading &&
          cases.length === 0 && (
            <div
              className="
                mt-4
                rounded-2xl
                border
                border-dashed
                border-slate-300
                bg-white
                p-6
                text-center
              "
            >
              <p
                className="
                  text-sm
                  font-semibold
                  text-slate-800
                "
              >
                هنوز ارزیابی‌ای
                ثبت نشده است.
              </p>

              <p
                className="
                  mt-2
                  text-xs
                  leading-6
                  text-slate-500
                "
              >
                اولین Case را ایجاد
                کنید و تصاویر بیمار
                را ثبت کنید.
              </p>
            </div>
          )}

        {!loading &&
          cases.length > 0 && (
            <div
              className="
                mt-4
                space-y-3
              "
            >
              {cases
                .slice(0, 5)
                .map(
                  (airwayCase) => (
                    <Link
                      key={
                        airwayCase.id
                      }
                      href={`/cases/${airwayCase.id}/capture`}
                      className="
                        block
                        rounded-2xl
                        border
                        border-slate-200
                        bg-white
                        p-4
                        transition
                        active:scale-[0.99]
                      "
                    >
                      <div
                        className="
                          flex
                          items-center
                          justify-between
                          gap-3
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

                          <p
                            className="
                              mt-1
                              text-xs
                              text-slate-500
                            "
                          >
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
                                airwayCase.createdAt,
                              ),
                            )}
                          </p>
                        </div>

                        <span
                          className="
                            rounded-full
                            bg-slate-100
                            px-3
                            py-1.5
                            text-[11px]
                            font-semibold
                            text-slate-600
                          "
                        >
                          {getStatusLabel(
                            airwayCase.syncStatus,
                          )}
                        </span>
                      </div>
                    </Link>
                  ),
                )}
            </div>
          )}
      </section>
    </div>
  );
}