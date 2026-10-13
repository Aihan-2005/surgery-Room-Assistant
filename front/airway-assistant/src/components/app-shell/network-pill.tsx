"use client";

import {
  LoaderCircle,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  useConnectivity,
} from "@/components/connectivity/connectivity-provider";

export function NetworkPill() {
  const {
    connectivity,
  } =
    useConnectivity();

  if (
    connectivity.mode ===
    "checking"
  ) {
    return (
      <div
        className="
          inline-flex
          items-center
          gap-1.5
          rounded-full
          bg-slate-100
          px-3
          py-1.5
          text-xs
          font-medium
          text-slate-600
        "
      >
        <LoaderCircle
          size={14}
          className="
            animate-spin
          "
        />

        بررسی اتصال
      </div>
    );
  }

  /*
   * این indicator فقط وضعیت اینترنت
   * را به کاربر نشان می‌دهد.
   */
  if (
    connectivity.internetReachable
  ) {
    const weak =
      connectivity.mode ===
      "weak";

    return (
      <div
        title={
          weak
            ? "اینترنت متصل است، اما سرعت اتصال پایین است."
            : "اینترنت متصل است."
        }
        className={`
          inline-flex
          items-center
          gap-1.5
          rounded-full
          px-3
          py-1.5
          text-xs
          font-semibold
          ${
            weak
              ? `
                bg-amber-50
                text-amber-700
              `
              : `
                bg-emerald-50
                text-emerald-700
              `
          }
        `}
      >
        <Wifi
          size={14}
        />

        {weak
          ? "آنلاین — ضعیف"
          : "آنلاین"}
      </div>
    );
  }

  return (
    <div
      title="اتصال اینترنت قطع است."
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
      <WifiOff
        size={14}
      />

      آفلاین
    </div>
  );
}

