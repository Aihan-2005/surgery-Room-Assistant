"use client";

import {
  useState,
} from "react";

import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Plus,
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
  id:
    string;

  url:
    string;
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

  maxPhotoCount:
    number;

  onPhotoSelected: (
    image:
      PreparedImage,
    replacePhotoId?:
      string,
  ) => Promise<void>;

  disabled?:
    boolean;
}

export function PhotoCard({
  step,
  positionIndex,
  totalPositions,
  photos,
  requiredPhotoCount,
  maxPhotoCount,
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

  const complete =
    photos.length >=
    requiredPhotoCount;

  const canAdd =
    photos.length <
    maxPhotoCount;

  function openCamera(
    photoId?:
      string,
  ) {
    if (
      disabled
    ) {
      return;
    }

    if (
      !photoId &&
      !canAdd
    ) {
      return;
    }

    setReplacePhotoId(
      photoId,
    );

    setCameraOpen(
      true,
    );
  }

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
                  {
                    positionIndex
                  }
                </span>

                <p
                  className="
                    text-base
                    font-bold
                    text-slate-950
                  "
                >
                  {
                    step.title
                  }
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
                  حداقل{" "}
                  {
                    requiredPhotoCount
                  }{" "}
                  عکس
                </span>

                <span
                  className="
                    rounded-full
                    bg-slate-100
                    px-2
                    py-1
                    text-[10px]
                    font-bold
                    text-slate-500
                  "
                >
                  حداکثر{" "}
                  {
                    maxPhotoCount
                  }
                </span>
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

              <p
                className="
                  mt-1
                  text-[11px]
                  text-slate-400
                "
              >
                پوزیشن{" "}
                {
                  positionIndex
                }{" "}
                از{" "}
                {
                  totalPositions
                }
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
              راهنمای این پوزیشن
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
        </div>

        <div
          className="
            grid
            grid-cols-2
            gap-2
            px-4
          "
        >
          {photos.map(
            (
              photo,
              index,
            ) => (
              <div
                key={
                  photo.id
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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

                  <span
                    className="
                      absolute
                      right-2
                      top-2
                      flex
                      size-7
                      items-center
                      justify-center
                      rounded-full
                      bg-black/60
                      text-[11px]
                      font-bold
                      text-white
                    "
                  >
                    {
                      index + 1
                    }
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    disabled
                  }
                  onClick={() =>
                    openCamera(
                      photo.id,
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
                  <ImagePlus
                    size={16}
                  />

                  گرفتن مجدد
                </button>
              </div>
            ),
          )}

          {canAdd && (
            <button
              type="button"
              disabled={
                disabled
              }
              onClick={() =>
                openCamera()
              }
              className="
                flex
                aspect-[4/3]
                min-h-32
                flex-col
                items-center
                justify-center
                gap-2
                rounded-2xl
                border-2
                border-dashed
                border-sky-200
                bg-sky-50/50
                px-3
                text-sky-700
                transition
                active:scale-[0.98]
                disabled:opacity-50
              "
            >
              {photos.length ===
              0 ? (
                <Camera
                  size={26}
                />
              ) : (
                <Plus
                  size={28}
                />
              )}

              <span
                className="
                  text-xs
                  font-bold
                "
              >
                {photos.length ===
                0
                  ? "ثبت اولین عکس"
                  : "افزودن عکس"}
              </span>

              <span
                className="
                  text-[10px]
                  text-sky-600/70
                "
              >
                {
                  photos.length
                }
                {" / "}
                {
                  maxPhotoCount
                }
              </span>
            </button>
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
          {
            photos.length
          }{" "}
          عکس ثبت شده

          {" — "}

          {complete
            ? "حداقل لازم تکمیل شده"
            : `${requiredPhotoCount - photos.length} عکس دیگر لازم است`}
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