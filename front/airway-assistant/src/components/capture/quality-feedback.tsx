"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleEllipsis,
  XCircle,
} from "lucide-react";

import type {
  ImageQualityResult,
  QualityLevel,
} from "@/lib/capture/image-quality";

interface QualityFeedbackProps {
  quality:
    | ImageQualityResult
    | null;

  compact?: boolean;
}

function getIcon(
  level: QualityLevel,
) {
  switch (level) {
    case "good":
      return CheckCircle2;

    case "warning":
      return AlertTriangle;

    case "bad":
      return XCircle;
  }
}

function getLevelClass(
  level: QualityLevel,
) {
  switch (level) {
    case "good":
      return {
        wrapper:
          "bg-emerald-500/15 text-emerald-100",

        icon:
          "text-emerald-400",
      };

    case "warning":
      return {
        wrapper:
          "bg-amber-500/15 text-amber-100",

        icon:
          "text-amber-400",
      };

    case "bad":
      return {
        wrapper:
          "bg-red-500/15 text-red-100",

        icon:
          "text-red-400",
      };
  }
}

export function QualityFeedback({
  quality,
  compact = false,
}: QualityFeedbackProps) {
  if (!quality) {
    return (
      <div
        className="
          flex
          items-center
          gap-2
          rounded-2xl
          bg-white/10
          px-3
          py-2
          text-xs
          text-white/70
          backdrop-blur
        "
      >
        <CircleEllipsis
          size={16}
        />

        در حال بررسی کیفیت...
      </div>
    );
  }

  if (compact) {
    const config =
      getLevelClass(
        quality.overall,
      );

    const Icon =
      getIcon(
        quality.overall,
      );

    return (
      <div
        className={`
          flex
          items-center
          gap-1.5
          rounded-full
          px-3
          py-1.5
          text-xs
          font-bold
          backdrop-blur
          ${config.wrapper}
        `}
      >
        <Icon
          size={15}
          className={
            config.icon
          }
        />

        {quality.overall ===
          "good" &&
          "کیفیت مناسب"}

        {quality.overall ===
          "warning" &&
          "نیاز به بهبود"}

        {quality.overall ===
          "bad" &&
          "کیفیت نامناسب"}
      </div>
    );
  }

  return (
    <div
      className="
        rounded-2xl
        bg-white/10
        p-3
        backdrop-blur
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
        <p
          className="
            text-xs
            font-bold
            text-white
          "
        >
          کنترل فنی تصویر
        </p>

        <QualityFeedback
          quality={quality}
          compact
        />
      </div>

      <div
        className="
          mt-3
          grid
          grid-cols-3
          gap-2
        "
      >
        {quality.checks.map(
          (check) => {
            const Icon =
              getIcon(
                check.level,
              );

            const config =
              getLevelClass(
                check.level,
              );

            return (
              <div
                key={
                  check.key
                }
                className="
                  rounded-xl
                  bg-black/20
                  p-2
                  text-center
                "
                title={
                  check.detail
                }
              >
                <Icon
                  size={16}
                  className={`
                    mx-auto
                    ${config.icon}
                  `}
                />

                <p
                  className="
                    mt-1.5
                    text-[11px]
                    font-medium
                    text-white/80
                  "
                >
                  {check.label}
                </p>
              </div>
            );
          },
        )}
      </div>

      {quality.overall !==
        "good" && (
        <div
          className="
            mt-3
            space-y-1
          "
        >
          {quality.checks
            .filter(
              (check) =>
                check.level !==
                "good",
            )
            .map((check) => (
              <p
                key={
                  check.key
                }
                className="
                  text-[11px]
                  leading-5
                  text-white/70
                "
              >
                •{" "}
                {
                  check.detail
                }
              </p>
            ))}
        </div>
      )}

      <p
        className="
          mt-3
          text-[10px]
          leading-5
          text-white/45
        "
      >
        این بررسی فقط کیفیت فنی
        تصویر را کنترل می‌کند و
        جایگزین تأیید پزشکی وضعیت
        بیمار نیست.
      </p>
    </div>
  );
}