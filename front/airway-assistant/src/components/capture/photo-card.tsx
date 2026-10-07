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

import type {
  PreparedImage,
} from "@/lib/domain/types";

interface PhotoSlot {
  id: string;

  url: string;
}

interface PhotoCardProps {
  step:
    CaptureStep;

  positionIndex:
    number;

  totalPositions:
    number;

  photos:
    PhotoSlot[];

  requiredPhotoCount:
    number;

  onPhotoSelected: (
    image:
      PreparedImage,
    replacePhotoId?:
      string,
  ) => Promise<void>;

  disabled?: boolean;
}

export function PhotoCard({
  step,
  positionIndex,
  totalPositions,
  photos,
  requiredPhotoCount,
  onPhotoSelected,
  disabled = false,
}: PhotoCardProps) {
  const [
    cameraOpen,
    setCameraOpen,
  ] =
    useState(false);

  const [
    replacePhotoId,
    setReplacePhotoId,
  ] =
    useState<
      string | undefined
    >(undefined);

  function openCamera(
    photoId?:
      string,
  ) {
    setReplacePhotoId(
      photoId,
    );

    setCameraOpen(
      true,
    );
  }

  const complete =
    photos.length >=
    requiredPhotoCount;

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
            <div className="min-w-0 flex-1">
              <div
                className="
                  flex
                  flex-wrap
                  items-center
                  gap-2
                "
              >
                <span
                  className="
                    flex
                    size-7
                    items-center
                    justify-center
                    rounded-full
                    bg-sky-50
                    text-xs
                    font-bold
                    text-sky-700
                  "
                >
                  {positionIndex}
                </span>

                <p className="text-base font-bold text-slate-950">
                  {step.title}
                </p>

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
                  {requiredPhotoCount}
                  {" "}
                  عکس الزامی
                </span>
              </div>

              <p className="mt-2 text-xs leading-6 text-slate-500">
                {
                  step.description
                }
              </p>

              <p className="mt-1 text-[11px] text-slate-400">
                پوزیشن{" "}
                {positionIndex} از{" "}
                {totalPositions}
              </p>
            </div>

            {complete && (
              <CheckCircle2
                size={24}
                className="
                  shrink-0
                  text-emerald-600
                "
              />
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-700">
              راهنمای این پوزیشن
            </p>

            <ul className="mt-2 space-y-1 pr-4 text-xs leading-6 text-slate-500">
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
        </div>

        <div
          className="
            grid
            grid-cols-2
            gap-2
            px-4
          "
        >
          {Array.from({
            length:
              requiredPhotoCount,
          }).map(
            (
              _,
              index,
            ) => {
              const photo =
                photos[index];

              return (
                <div
                  key={
                    photo?.id ??
                    `slot-${index}`
                  }
                  className="
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-200
                    bg-slate-100
                  "
                >
                  <div
                    className="
                      relative
                      aspect-[4/3]
                    "
                  >
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          photo.url
                        }
                        alt={`${step.title} - عکس ${
                          index +
                          1
                        }`}
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
                          gap-2
                          text-slate-400
                        "
                      >
                        <Camera
                          size={24}
                        />

                        <span className="text-xs">
                          عکس{" "}
                          {index +
                            1}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={
                      disabled
                    }
                    onClick={() =>
                      openCamera(
                        photo?.id,
                      )
                    }
                    className="
                      flex
                      min-h-11
                      w-full
                      items-center
                      justify-center
                      gap-1.5
                      border-t
                      border-slate-200
                      bg-white
                      px-2
                      text-xs
                      font-bold
                      text-sky-700
                      disabled:opacity-50
                    "
                  >
                    {photo ? (
                      <>
                        <ImagePlus
                          size={16}
                        />

                        گرفتن مجدد
                      </>
                    ) : (
                      <>
                        <Camera
                          size={16}
                        />

                        ثبت عکس
                      </>
                    )}
                  </button>
                </div>
              );
            },
          )}
        </div>

        <div
          className="
            p-4
            text-center
            text-xs
            font-medium
            text-slate-500
          "
        >
          {Math.min(
            photos.length,
            requiredPhotoCount,
          )}
          {" / "}
          {requiredPhotoCount}
          {" "}
          عکس ثبت شده
        </div>
      </section>

      {cameraOpen && (
        <GuidedCamera
          step={
            step
          }
          onClose={() => {
            setCameraOpen(
              false,
            );

            setReplacePhotoId(
              undefined,
            );
          }}
          onConfirm={async (
            image,
          ) => {
            await onPhotoSelected(
              image,
              replacePhotoId,
            );

            setCameraOpen(
              false,
            );

            setReplacePhotoId(
              undefined,
            );
          }}
        />
      )}
    </>
  );
}