"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import CapturePage from
  "@/app/cases/[caseId]/capture/page";

function CaptureFromQuery() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");

  if (
    !caseId ||
    !/^[0-9a-fA-F-]{36}$/.test(caseId)
  ) {
    return (
      <div className="p-6 text-sm text-red-700">
        شناسه ارزیابی معتبر نیست.
      </div>
    );
  }

  return (
    <CapturePage
      caseIdOverride={caseId}
    />
  );
}

export default function OfflineCapturePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500">
          در حال بازکردن تصویربرداری...
        </div>
      }
    >
      <CaptureFromQuery />
    </Suspense>
  );
}