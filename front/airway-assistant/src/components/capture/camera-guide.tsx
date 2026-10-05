"use client";

import type {
  CaptureStep,
} from "@/lib/config/capture-protocol";

interface CameraGuideProps {
  step: CaptureStep;
}

export function CameraGuide({
  step,
}: CameraGuideProps) {
  const showMouthTarget =
    step.guide ===
      "mallampati" ||
    step.guide ===
      "mouth-open";

  const isLateral =
    step.guide ===
    "lateral";

  return (
    <div
      className="
        pointer-events-none
        absolute
        inset-0
        z-10
      "
    >
      <div
        className="
          absolute
          inset-x-4
          top-1/2
          -translate-y-1/2
        "
      >
        <div
          className={`
            relative
            mx-auto
            aspect-[3/4]
            max-h-[62vh]
            w-[74vw]
            max-w-sm
            transition-transform
            ${
              isLateral
                ? "-translate-x-5"
                : ""
            }
          `}
        >
          <div
            className={`
              absolute
              inset-0
              border-2
              border-dashed
              border-white/80
              shadow-[0_0_0_9999px_rgba(0,0,0,0.20)]
              ${
                isLateral
                  ? "rounded-[42%_55%_52%_45%]"
                  : "rounded-[46%]"
              }
            `}
          />

          <div
            className="
              absolute
              left-1/2
              top-[35%]
              h-px
              w-10
              -translate-x-1/2
              bg-white/30
            "
          />

          {showMouthTarget && (
            <div
              className="
                absolute
                bottom-[25%]
                left-1/2
                flex
                h-14
                w-24
                -translate-x-1/2
                items-center
                justify-center
                rounded-[50%]
                border-2
                border-dashed
                border-amber-300
                bg-amber-300/10
              "
            >
              <span
                className="
                  text-[10px]
                  font-bold
                  text-amber-200
                "
              >
                {step.guide ===
                "mallampati"
                  ? "زبان بیرون"
                  : "دهان باز"}
              </span>
            </div>
          )}

          {isLateral && (
            <div
              className="
                absolute
                left-2
                top-1/2
                -translate-y-1/2
                rounded-full
                bg-black/45
                px-3
                py-1.5
                text-[10px]
                font-bold
                text-white
                backdrop-blur
              "
            >
              نمای کامل کنار
            </div>
          )}
        </div>

        <div
          className="
            mx-auto
            mt-5
            max-w-sm
            rounded-2xl
            bg-black/55
            px-4
            py-3
            text-center
            text-xs
            leading-6
            text-white
            backdrop-blur
          "
        >
          {step.liveInstruction}
        </div>
      </div>
    </div>
  );
}