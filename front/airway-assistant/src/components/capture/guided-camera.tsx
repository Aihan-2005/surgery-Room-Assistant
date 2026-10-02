"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Camera,
  CameraIcon,
  Check,
  ImagePlus,
  RefreshCcw,
  RotateCcw,
  X,
} from "lucide-react";

import type {
  CaptureStep,
} from "@/lib/config/capture-protocol";

type CameraFacingMode =
  | "user"
  | "environment";

interface GuidedCameraProps {
  step: CaptureStep;

  onClose: () => void;

  onConfirm: (
    file: File,
  ) => Promise<void>;
}

export function GuidedCamera({
  step,
  onClose,
  onConfirm,
}: GuidedCameraProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(
      null,
    );

  const [
    facingMode,
    setFacingMode,
  ] =
    useState<CameraFacingMode>(
      "environment",
    );

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(
    null,
  );

  const [
    capturedFile,
    setCapturedFile,
  ] = useState<File | null>(
    null,
  );

  const [
    cameraError,
    setCameraError,
  ] = useState<string | null>(
    null,
  );

  const [
    startingCamera,
    setStartingCamera,
  ] = useState(true);

  const [
    confirming,
    setConfirming,
  ] = useState(false);

  const stopCamera =
    useCallback(() => {
      streamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current =
        null;

      if (videoRef.current) {
        videoRef.current.srcObject =
          null;
      }
    }, []);

  const startCamera =
    useCallback(async () => {
      stopCamera();

      setStartingCamera(true);
      setCameraError(null);

      try {
        if (
          !navigator.mediaDevices
            ?.getUserMedia
        ) {
          throw new Error(
            "MEDIA_DEVICES_UNAVAILABLE",
          );
        }

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: false,

              video: {
                facingMode: {
                  ideal:
                    facingMode,
                },

                width: {
                  ideal: 1920,
                },

                height: {
                  ideal: 1080,
                },
              },
            },
          );

        streamRef.current =
          stream;

        if (
          videoRef.current
        ) {
          videoRef.current.srcObject =
            stream;

          await videoRef.current.play();
        }
      } catch (error) {
        console.error(
          "Camera error:",
          error,
        );

        setCameraError(
          "دسترسی مستقیم به دوربین ممکن نیست. می‌توانید از گزینه انتخاب عکس یا دوربین سیستم استفاده کنید.",
        );
      } finally {
        setStartingCamera(false);
      }
    }, [
      facingMode,
      stopCamera,
    ]);

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, [
    startCamera,
    stopCamera,
  ]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl,
        );
      }
    };
  }, [previewUrl]);

  function handleClose() {
    stopCamera();

    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl,
      );
    }

    onClose();
  }

  function handleSwitchCamera() {
    if (previewUrl) {
      return;
    }

    setFacingMode(
      (current) =>
        current ===
        "environment"
          ? "user"
          : "environment",
    );
  }

  async function captureFrame() {
    const video =
      videoRef.current;

    const canvas =
      canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    const width =
      video.videoWidth;

    const height =
      video.videoHeight;

    if (!width || !height) {
      setCameraError(
        "تصویر دوربین هنوز آماده نیست.",
      );

      return;
    }

    canvas.width =
      width;

    canvas.height =
      height;

    const context =
      canvas.getContext(
        "2d",
      );

    if (!context) {
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      width,
      height,
    );

    const blob =
      await new Promise<Blob | null>(
        (resolve) => {
          canvas.toBlob(
            resolve,
            "image/jpeg",
            0.9,
          );
        },
      );

    if (!blob) {
      setCameraError(
        "ثبت تصویر انجام نشد.",
      );

      return;
    }

    const file =
      new File(
        [blob],
        `${step.kind}-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    setCapturedFile(file);
    setPreviewUrl(url);

    stopCamera();
  }

  async function handleFileInput(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/",
      )
    ) {
      setCameraError(
        "فایل انتخاب‌شده تصویر نیست.",
      );

      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl,
      );
    }

    const url =
      URL.createObjectURL(
        file,
      );

    setCapturedFile(file);
    setPreviewUrl(url);

    stopCamera();
  }

  async function handleRetake() {
    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl,
      );
    }

    setPreviewUrl(null);
    setCapturedFile(null);

    await startCamera();
  }

  async function handleConfirm() {
    if (!capturedFile) {
      return;
    }

    try {
      setConfirming(true);

      await onConfirm(
        capturedFile,
      );

      handleClose();
    } catch (error) {
      console.error(error);

      setCameraError(
        "ذخیره تصویر انجام نشد.",
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      className="
        fixed
        inset-0
        z-[100]
        flex
        flex-col
        bg-black
        text-white
      "
    >
      <header
        className="
          absolute
          left-0
          right-0
          top-0
          z-30
          bg-gradient-to-b
          from-black/80
          to-transparent
          px-4
          pb-8
          pt-[calc(env(safe-area-inset-top)+12px)]
        "
      >
        <div
          className="
            flex
            items-start
            justify-between
            gap-4
          "
        >
          <div>
            <p
              className="
                text-xs
                font-medium
                text-white/70
              "
            >
              ثبت تصویر
            </p>

            <h2
              className="
                mt-1
                text-base
                font-bold
              "
            >
              {step.shortTitle}
            </h2>
          </div>

          <button
            type="button"
            aria-label="بستن دوربین"
            onClick={
              handleClose
            }
            className="
              flex
              size-11
              items-center
              justify-center
              rounded-full
              bg-black/40
              backdrop-blur
            "
          >
            <X size={22} />
          </button>
        </div>
      </header>

      <div
        className="
          relative
          flex-1
          overflow-hidden
          bg-black
        "
      >
        {previewUrl ? (

<img
            src={previewUrl}
            alt="پیش‌نمایش تصویر ثبت‌شده"
            className="
              h-full
              w-full
              object-contain
            "
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="
              h-full
              w-full
              object-cover
            "
          />
        )}

        {!previewUrl &&
          !cameraError && (
            <CameraGuide
              step={step}
            />
          )}

        {startingCamera &&
          !previewUrl && (
            <div
              className="
                absolute
                inset-0
                flex
                items-center
                justify-center
                bg-black/60
              "
            >
              <div
                className="
                  text-center
                "
              >
                <RefreshCcw
                  className="
                    mx-auto
                    animate-spin
                  "
                  size={28}
                />

                <p
                  className="
                    mt-3
                    text-sm
                    text-white/80
                  "
                >
                  در حال فعال‌کردن
                  دوربین...
                </p>
              </div>
            </div>
          )}

        {cameraError &&
          !previewUrl && (
            <div
              className="
                absolute
                inset-0
                flex
                items-center
                justify-center
                px-6
              "
            >
              <div
                className="
                  max-w-sm
                  rounded-3xl
                  bg-white
                  p-6
                  text-center
                  text-slate-900
                "
              >
                <CameraIcon
                  className="
                    mx-auto
                    text-slate-400
                  "
                  size={36}
                />

                <p
                  className="
                    mt-4
                    text-sm
                    font-bold
                  "
                >
                  دوربین در دسترس نیست
                </p>

                <p
                  className="
                    mt-2
                    text-xs
                    leading-6
                    text-slate-500
                  "
                >
                  {cameraError}
                </p>

                <label
                  className="
                    mt-5
                    flex
                    min-h-12
                    cursor-pointer
                    items-center
                    justify-center
                    gap-2
                    rounded-2xl
                    bg-sky-700
                    px-4
                    text-sm
                    font-bold
                    text-white
                  "
                >
                  <ImagePlus
                    size={18}
                  />

                  انتخاب تصویر

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={
                      handleFileInput
                    }
                  />
                </label>
              </div>
            </div>
          )}
      </div>

      <canvas
        ref={canvasRef}
        className="hidden"
      />

      <footer
        className="
          bg-black
          px-5
          pb-[calc(env(safe-area-inset-bottom)+18px)]
          pt-5
        "
      >
        {!previewUrl ? (
          <>
            <p
              className="
                mb-4
                text-center
                text-xs
                leading-6
                text-white/65
              "
            >
              {
                step.description
              }
            </p>

            <div
              className="
                grid
                grid-cols-3
                items-center
              "
            >
              <label
                className="
                  flex
                  size-12
                  cursor-pointer
                  items-center
                  justify-center
                  justify-self-start
                  rounded-full
                  bg-white/15
                "
              >
                <ImagePlus
                  size={21}
                />

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={
                    handleFileInput
                  }
                />
              </label>

              <button
                type="button"
                aria-label="ثبت عکس"
                disabled={
                  startingCamera ||
                  Boolean(
                    cameraError,
                  )
                }
                onClick={
                  captureFrame
                }
                className="
                  flex
                  size-[76px]
                  items-center
                  justify-center
                  justify-self-center
                  rounded-full
                  border-4
                  border-white
                  disabled:opacity-30
                "
              >
                <span
                  className="
                    block
                    size-[58px]
                    rounded-full
                    bg-white
                  "
                />
              </button>

              <button
                type="button"
                aria-label="تعویض دوربین"
                onClick={
                  handleSwitchCamera
                }
                disabled={
                  Boolean(
                    cameraError,
                  )
                }
                className="
                  flex
                  size-12
                  items-center
                  justify-center
                  justify-self-end
                  rounded-full
                  bg-white/15
                  disabled:opacity-30
                "
              >
                <RotateCcw
                  size={21}
                />
              </button>
            </div>
          </>
        ) : (
          <div
            className="
              grid
              grid-cols-2
              gap-3
            "
          >
            <button
              type="button"
              onClick={
                handleRetake
              }
              disabled={
                confirming
              }
              className="
                flex
                min-h-14
                items-center
                justify-center
                gap-2
                rounded-2xl
                bg-white/15
                px-4
                text-sm
                font-bold
              "
            >
              <RefreshCcw
                size={18}
              />

              تکرار
            </button>

            <button
              type="button"
              onClick={
                handleConfirm
              }
              disabled={
                confirming
              }
              className="
                flex
                min-h-14
                items-center
                justify-center
                gap-2
                rounded-2xl
                bg-emerald-500
                px-4
                text-sm
                font-bold
                text-white
                disabled:opacity-60
              "
            >
              <Check
                size={19}
              />

              {confirming
                ? "در حال ذخیره..."
                : "تأیید تصویر"}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

interface CameraGuideProps {
  step: CaptureStep;
}

function CameraGuide({
  step,
}: CameraGuideProps) {
  const isLateral =
    step.kind ===
    "lateral_neutral";

  return (
    <div
      className="
        pointer-events-none
        absolute
        inset-0
      "
    >
      <div
        className="
          absolute
          inset-x-5
          top-1/2
          -translate-y-1/2
        "
      >
        <div
          className="
            relative
            mx-auto
            aspect-[3/4]
            max-h-[62vh]
            max-w-[78vw]
          "
        >
          <div
            className="
              absolute
              inset-0
              rounded-[46%]
              border-2
              border-dashed
              border-white/80
              shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]
            "
          />

          <div
            className={`
              absolute
              bottom-[10%]
              ${
                isLateral
                  ? "left-[4%]"
                  : "right-[4%]"
              }
            `}
          >
            <div
              className="
                flex
                size-16
                items-center
                justify-center
                rounded-xl
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
                Marker
              </span>
            </div>
          </div>
        </div>

        <p
          className="
            mx-auto
            mt-5
            max-w-xs
            rounded-full
            bg-black/50
            px-4
            py-2
            text-center
            text-xs
            leading-5
            text-white
            backdrop-blur
          "
        >
          {isLateral
            ? "نمای جانبی صورت را داخل کادر قرار دهید"
            : "صورت بیمار را در مرکز کادر قرار دهید"}
        </p>
      </div>
    </div>
  );
}