"use client";

import {
  Cloud,
  CloudOff,
} from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function NetworkPill() {
  const isOnline =
    useOnlineStatus();

  if (isOnline === null) {
    return (
      <div
        className="
          inline-flex
          items-center
          rounded-full
          bg-slate-100
          px-3
          py-1.5
          text-xs
          font-medium
          text-slate-600
        "
      >
        بررسی اتصال...
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="
          inline-flex
          items-center
          gap-1.5
          rounded-full
          bg-amber-50
          px-3
          py-1.5
          text-xs
          font-semibold
          text-amber-700
        "
      >
        <CloudOff size={14} />

        آفلاین
      </div>
    );
  }

  return (
    <div
      className="
        inline-flex
        items-center
        gap-1.5
        rounded-full
        bg-emerald-50
        px-3
        py-1.5
        text-xs
        font-semibold
        text-emerald-700
      "
    >
      <Cloud size={14} />

      آنلاین
    </div>
  );
}