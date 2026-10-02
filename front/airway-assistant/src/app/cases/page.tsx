"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  ArrowLeft,
  ClipboardList,
  Plus,
  RefreshCw,
} from "lucide-react";

import { NetworkPill } from "@/components/app-shell/network-pill";

import { getAllCases } from "@/lib/db/database";

import type { AirwayCase } from "@/lib/domain/types";

function getStatusConfig(status: AirwayCase["syncStatus"]) {
  switch (status) {
    case "draft":
      return {
        label: "پیش‌نویس",
        className: "bg-slate-100 text-slate-600",
      };

    case "queued":
      return {
        label: "در صف ارسال",
        className: "bg-amber-50 text-amber-700",
      };

    case "syncing":
      return {
        label: "در حال ارسال",
        className: "bg-sky-50 text-sky-700",
      };

    case "synced":
      return {
        label: "ارسال شده",
        className: "bg-emerald-50 text-emerald-700",
      };

    case "failed":
      return {
        label: "خطای ارسال",
        className: "bg-red-50 text-red-700",
      };
  }
}

function formatDate(date: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  } catch {
    return date;
  }
}

export default function CasesPage() {
  const [cases, setCases] = useState<AirwayCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await getAllCases();

      setCases(result);
    } catch (error) {
      console.error("Failed to load cases:", error);

      setError("خواندن Caseها از حافظه دستگاه انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();

    const handleFocus = () => {
      void loadCases();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadCases]);

  return (
    <div className="px-4 pb-8 pt-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              Cases
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              Caseهای ثبت‌شده
            </h1>

            <p className="mt-2 text-sm leading-7 text-slate-500">
              Caseهای ذخیره‌شده روی این دستگاه را مشاهده و ادامه دهید.
            </p>
          </div>

          <NetworkPill />
        </div>
      </header>

      <section className="mt-6 grid grid-cols-[1fr_auto] gap-3">
        <Link
          href="/cases/new"
          className="
            flex
            min-h-13
            items-center
            justify-center
            gap-2
            rounded-2xl
            bg-sky-700
            px-4
            text-sm
            font-bold
            text-white
            shadow-sm
            transition
            hover:bg-sky-800
            active:scale-[0.99]
          "
        >
          <Plus size={19} />
          ثبت Case جدید
        </Link>

        <button
          type="button"
          aria-label="بروزرسانی لیست"
          onClick={() => void loadCases()}
          disabled={loading}
          className="
            flex
            size-13
            items-center
            justify-center
            rounded-2xl
            border
            border-slate-200
            bg-white
            text-slate-600
            shadow-sm
            transition
            active:scale-95
            disabled:opacity-50
          "
        >
          <RefreshCw
            size={19}
            className={loading ? "animate-spin" : ""}
          />
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="
            mt-5
            rounded-2xl
            bg-red-50
            p-4
            text-sm
            leading-6
            text-red-700
          "
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          className="
            mt-5
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-6
            text-center
            text-sm
            text-slate-500
          "
        >
          در حال خواندن Caseها...
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
        <div
          className="
            mt-5
            rounded-3xl
            border
            border-dashed
            border-slate-300
            bg-white
            px-6
            py-12
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
              bg-slate-100
              text-slate-500
            "
          >
            <ClipboardList size={26} />
          </div>

          <h2 className="mt-4 text-sm font-bold text-slate-900">
            هنوز Caseای ثبت نشده است
          </h2>

          <p className="mt-2 text-xs leading-6 text-slate-500">
            برای شروع، اولین Case را ایجاد کنید.
          </p>

          <Link
            href="/cases/new"
            className="
              mx-auto
              mt-5
              flex
              min-h-12
              max-w-52
              items-center
              justify-center
              gap-2
              rounded-2xl
              bg-sky-700
              px-4
              text-sm
              font-bold
              text-white
            "
          >
            <Plus size={18} />
            Case جدید
          </Link>
        </div>
      )}

      {!loading && !error && cases.length > 0 && (
        <div className="mt-5 space-y-3">
          {cases.map((airwayCase) => {
            const status = getStatusConfig(airwayCase.syncStatus);

            return (
              <Link
                key={airwayCase.id}
                href={`/cases/${airwayCase.id}/capture`}
                className="
                  block
                  rounded-3xl
                  border
                  border-slate-200
                  bg-white
                  p-4
                  shadow-sm
                  transition
                  hover:border-slate-300
                  active:scale-[0.99]
                "
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-950">
                      {airwayCase.caseCode}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(airwayCase.createdAt)}
                    </p>
                  </div>

                  <span
                    className={`
                      shrink-0
                      rounded-full
                      px-3
                      py-1.5
                      text-[11px]
                      font-bold
                      ${status.className}
                    `}
                  >
                    {status.label}
                  </span>
                </div>

                {(airwayCase.heightCm ||
                  airwayCase.weightKg ||
                  airwayCase.neckMobility !== "unknown") && (
                  <div
                    className="
                      mt-4
                      flex
                      flex-wrap
                      gap-2
                      border-t
                      border-slate-100
                      pt-4
                    "
                  >
                    {airwayCase.heightCm && (
                      <span
                        className="
                          rounded-lg
                          bg-slate-50
                          px-2.5
                          py-1.5
                          text-xs
                          text-slate-600
                        "
                      >
                        قد: {airwayCase.heightCm} cm
                      </span>
                    )}

                    {airwayCase.weightKg && (
                      <span
                        className="
                          rounded-lg
                          bg-slate-50
                          px-2.5
                          py-1.5
                          text-xs
                          text-slate-600
                        "
                      >
                        وزن: {airwayCase.weightKg} kg
                      </span>
                    )}
                  </div>
                )}

                <div
                  className="
                    mt-4
                    flex
                    items-center
                    justify-end
                    gap-1
                    text-xs
                    font-semibold
                    text-sky-700
                  "
                >
                  ادامه Case
                  <ArrowLeft size={15} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

