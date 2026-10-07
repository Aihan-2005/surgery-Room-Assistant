"use client";

import {
  Cloud,
  CloudOff,
  HardDrive,
  LoaderCircle,
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
          className="animate-spin"
        />

        بررسی اتصال
      </div>
    );
  }

  if (
    connectivity.mode ===
    "online"
  ) {
    return (
      <div
        title="اتصال مناسب است و ارسال خودکار فعال است."
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
        <Cloud
          size={14}
        />

        آنلاین
      </div>
    );
  }

  if (
    connectivity.mode ===
    "local-only"
  ) {
    return (
      <div
        title="اینترنت در دسترس است اما Backend هنوز متصل نشده؛ اطلاعات روی دستگاه و در صف ذخیره می‌شوند."
        className="
          inline-flex
          items-center
          gap-1.5
          rounded-full
          bg-sky-50
          px-3
          py-1.5
          text-xs
          font-semibold
          text-sky-700
        "
      >
        <HardDrive
          size={14}
        />

        ذخیره محلی
      </div>
    );
  }

  if (
    connectivity.mode ===
    "weak"
  ) {
    return (
      <div
        title="اتصال ضعیف است؛ ارسال متوقف شده و تصاویر روی دستگاه باقی می‌مانند."
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
        <CloudOff
          size={14}
        />

        آفلاین
      </div>
    );
  }

  return (
    <div
      title="ارسال ممکن نیست؛ تصاویر روی دستگاه ذخیره می‌شوند."
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
      <CloudOff
        size={14}
      />

      آفلاین
    </div>
  );
}

