import Link from "next/link";
import type { CaseHistoryEntry } from "@/lib/api/case-history";
import { ServerCasePhotos } from "@/components/server-case-photos";

const statusLabels = {
  draft: "پیش‌نویس", queued: "در صف ارسال", syncing: "در حال ارسال",
  synced: "ارسال شده", failed: "خطای ارسال",
};

export function CaseHistoryCard({ entry }: { entry: CaseHistoryEntry }) {
  const status = entry.source === "local"
    ? statusLabels[entry.local.syncStatus]
    : entry.server.is_complete ? "ارسال شده" : "ارسال ناقص";
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900">{entry.name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">{status}</span>
    </div>
  );
  const className = "block rounded-2xl border border-slate-200 bg-white p-4";
  if (entry.source === "local") {
    return <Link href={`/cases/${entry.id}/capture`} className={className}>{header}</Link>;
  }
  // Server metadata does not contain local consent or photo blobs. Do not send
  // these records to the capture editor or pretend they have been restored.
  return (
    <article className={className}>
      {header}
      <p className="mt-3 text-xs leading-6 text-slate-500">ذخیره‌شده در سرور · {entry.server.photo_count} تصویر · فقط مشاهده</p>
      <details className="mt-2 text-xs leading-7 text-slate-600">
        <summary className="cursor-pointer font-semibold text-sky-700">اطلاعات بیمار</summary>
        <p>سن: {entry.server.age} · جنسیت: {entry.server.sex === "M" ? "مرد" : "زن"}</p>
        <p>قد: {entry.server.height_cm} cm · وزن: {entry.server.weight_kg} kg</p>
        <p>حرکت گردن: {entry.server.neck_movement === "normal" ? "کامل" : "محدود"}</p>
        <p>سابقه لوله‌گذاری دشوار: {({ yes: "بله", no: "خیر", unknown: "نامشخص" } as Record<string, string>)[entry.server.previous_difficult_intubation] ?? "نامشخص"}</p>
      </details>
      <ServerCasePhotos caseId={entry.id} />
    </article>
  );
}
