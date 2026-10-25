"use client";

import Link from "next/link";

import {
  ClipboardList,
  Plus,
  RefreshCw,
} from "lucide-react";

import { NetworkPill } from "@/components/app-shell/network-pill";

import { useCaseHistory } from "@/hooks/use-case-history";
import { CaseHistoryCard } from "@/components/case-history-card";

export default function CasesPage() {
  const { cases, loading, refreshing, error, refresh } = useCaseHistory();

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
              پرونده‌های این دستگاه و پرونده‌های قبلی همین نصب در سرور را مشاهده کنید.
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
          onClick={() => void refresh()}
          disabled={refreshing}
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
            className={refreshing ? "animate-spin" : ""}
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

      {!loading && cases.length === 0 && (
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

      {!loading && cases.length > 0 && (
        <div className="mt-5 space-y-3">
          {cases.map((entry) => (
            <CaseHistoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

