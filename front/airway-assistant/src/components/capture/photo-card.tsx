"use client";

import {
  useState,
} from "react";

import {
  Camera,
  CheckCircle2,
  ImagePlus,
} from "lucide-react";

import {
  GuidedCamera,
} from "@/components/capture/guided-camera";

import type {
  CaptureStep,
} from "@/lib/config/capture-protocol";

interface PhotoCardProps {
  step: CaptureStep;

  photoUrl?: string;

  onPhotoSelected: (
    file: File,
  ) => Promise<void>;

  disabled?: boolean;
}

export function PhotoCard({
  step,
  photoUrl,
  onPhotoSelected,
  disabled = false,
}: PhotoCardProps) {
  const [
    cameraOpen,
    setCameraOpen,
  ] = useState(false);

  return (
    <>
      <section
        className="
          overflow-hidden
          rounded-3xl
          border
          border-slate-200
          bg-white
          shadow-sm
        "
      >
        <div className="p-4">
          <div
            className="
              flex
              items-start
              justify-between
              gap-4
            "
          >
            <div>
              <div
                className="
                  flex
                  items-center
                  gap-2
                "
              >
                <p
                  className="
                    text-base
                    font-bold
                    text-slate-950
                  "
                >
                  {step.title}
                </p>

                {step.required && (
                  <span
                    className="
                      rounded-full
                      bg-red-50
                      px-2
                      py-1
                      text-[10px]
                      font-bold
                      text-red-600
                    "
                  >
                    الزامی
                  </span>
                )}
              </div>

              <p
                className="
                  mt-2
                  text-xs
                  leading-6
                  text-slate-500
                "
              >
                {
                  step.description
                }
              </p>
            </div>

            {photoUrl && (
              <CheckCircle2
                size={22}
                className="
                  shrink-0
                  text-emerald-600
                "
              />
            )}
          </div>

          {!photoUrl && (
            <div
              className="
                mt-4
                rounded-2xl
                bg-slate-50
                p-3
              "
            >
              <p
                className="
                  text-xs
                  font-bold
                  text-slate-700
                "
              >
                قبل از عکس
              </p>

              <ul
                className="
                  mt-2
                  space-y-1
                  pr-4
                  text-xs
                  leading-6
                  text-slate-500
                "
              >
                {step.instructions.map(
                  (
                    instruction,
                  ) => (
                    <li
                      key={
                        instruction
                      }
                      className="list-disc"
                    >
                      {
                        instruction
                      }
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </div>

        <div
          className="
            relative
            aspect-[4/3]
            overflow-hidden
            bg-slate-100
          "
        >
          {photoUrl ? (

            <img
              src={photoUrl}
              alt={step.title}
              className="
                h-full
                w-full
                object-cover
              "
            />
          ) : (
            <div
              className="
                flex
                h-full
                flex-col
                items-center
                justify-center
                gap-3
                text-slate-400
              "
            >
              <div
                className="
                  flex
                  size-16
                  items-center
                  justify-center
                  rounded-full
                  bg-white
                  shadow-sm
                "
              >
                <Camera
                  size={30}
                />
              </div>

              <p className="text-sm">
                هنوز تصویری ثبت نشده
              </p>
            </div>
          )}
        </div>

        <div className="p-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setCameraOpen(
                true,
              )
            }
            className={`
              flex
              min-h-13
              w-full
              items-center
              justify-center
              gap-2
              rounded-2xl
              border
              px-4
              text-sm
              font-bold
              transition
              disabled:cursor-not-allowed
              disabled:opacity-50
              active:scale-[0.99]
              ${
                photoUrl
                  ? "border-slate-200 bg-white text-slate-700"
                  : "border-sky-700 bg-sky-700 text-white"
              }
            `}
          >
            {photoUrl ? (
              <>
                <ImagePlus
                  size={19}
                />

                گرفتن مجدد عکس
              </>
            ) : (
              <>
                <Camera
                  size={19}
                />

                شروع تصویربرداری
              </>
            )}
          </button>
        </div>
      </section>

      {cameraOpen && (
        <GuidedCamera
          step={step}
          onClose={() =>
            setCameraOpen(
              false,
            )
          }
          onConfirm={
            onPhotoSelected
          }
        />
      )}
    </>
  );
}