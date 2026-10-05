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
  Check,
  ImagePlus,
  RefreshCcw,
  RotateCcw,
  X,
} from "lucide-react";

import {
  CameraGuide,
} from "@/components/capture/camera-guide";

import {
  QualityFeedback,
} from "@/components/capture/quality-feedback";

import type {
  CaptureStep,
} from "@/lib/config/capture-protocol";

import {
  analyzeImageData,
  type ImageQualityResult,
} from "@/lib/capture/image-quality";

import type {
  CaptureSource,
  ImageQualityMetrics,
  PreparedImage,
} from "@/lib/domain/types";

type CameraFacingMode =
  | "user"
  | "environment";

interface GuidedCameraProps {
  step: CaptureStep;

  onClose: () => void;

  onConfirm: (
    image: PreparedImage,
  ) => Promise<void>;
}

const ANALYSIS_WIDTH = 160;

const ANALYSIS_HEIGHT = 120;

const ANALYSIS_INTERVAL =
  650;

function toQualityMetrics(
  quality:
    | ImageQualityResult
    | null,
  file: File,
): ImageQualityMetrics {
  const flags =
    quality?.checks
      .filter(
        (check) =>
          check.level !==
          "good",
      )
      .map(
        (check) =>
          check.key,
      ) ?? [];

  return {
    width:
      quality?.width,

    height:
      quality?.height,

    fileSizeBytes:
      file.size,

    mimeType:
      file.type,

    brightness:
      quality?.brightness,

    meanBrightness:
      quality?.brightness,

    sharpness:
      quality?.sharpness,

    blurScore:
      quality?.sharpness,

    laplacianVariance:
      quality?.sharpness,

    overall:
      quality?.overall ??
      "unknown",

    acceptable:
      quality?.overall !==
      "bad",

    passed:
      quality?.overall !==
      "bad",

    flags,

    checks:
      quality?.checks,

    checkedAt:
      new Date().toISOString(),
  };
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

  const captureCanvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const analysisCanvasRef =
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
  ] =
    useState<string | null>(
      null,
    );

  const [
    capturedFile,
    setCapturedFile,
  ] =
    useState<File | null>(
      null,
    );

  const [
    captureSource,
    setCaptureSource,
  ] =
    useState<CaptureSource>(
      "camera",
    );

  const [
    cameraError,
    setCameraError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    startingCamera,
    setStartingCamera,
  ] =
    useState(true);

  const [
    confirming,
    setConfirming,
  ] =
    useState(false);

  const [
    liveQuality,
    setLiveQuality,
  ] =
    useState<ImageQualityResult | null>(
      null,
    );

  const [
    capturedQuality,
    setCapturedQuality,
  ] =
    useState<ImageQualityResult | null>(
      null,
    );

  const stopCamera =
    useCallback(() => {
      streamRef.current
        ?.getTracks()
        .forEach(
          (track) => {
            track.stop();
          },
        );

      streamRef.current =
        null;

      if (
        videoRef.current
      ) {
        videoRef.current.srcObject =
          null;
      }
    }, []);

  const analyzeSource =
    useCallback(
      (
        source:
          CanvasImageSource,
        sourceWidth: number,
        sourceHeight: number,
      ) => {
        const canvas =
          analysisCanvasRef.current;

        if (!canvas) {
          return null;
        }

        canvas.width =
          ANALYSIS_WIDTH;

        canvas.height =
          ANALYSIS_HEIGHT;

        const context =
          canvas.getContext(
            "2d",
            {
              willReadFrequently:
                true,
            },
          );

        if (!context) {
          return null;
        }

        context.drawImage(
          source,
          0,
          0,
          ANALYSIS_WIDTH,
          ANALYSIS_HEIGHT,
        );

        const imageData =
          context.getImageData(
            0,
            0,
            ANALYSIS_WIDTH,
            ANALYSIS_HEIGHT,
          );

        return analyzeImageData(
          imageData,
          sourceWidth,
          sourceHeight,
        );
      },
      [],
    );

  const analyzeFile =
    useCallback(
      (
        file: File,
      ): Promise<ImageQualityResult | null> => {
        return new Promise(
          (resolve) => {
            const url =
              URL.createObjectURL(
                file,
              );

            const image =
              new Image();

            image.onload =
              () => {
                const result =
                  analyzeSource(
                    image,
                    image.naturalWidth,
                    image.naturalHeight,
                  );

                URL.revokeObjectURL(
                  url,
                );

                resolve(
                  result,
                );
              };

            image.onerror =
              () => {
                URL.revokeObjectURL(
                  url,
                );

                resolve(null);
              };

            image.src =
              url;
          },
        );
      },
      [analyzeSource],
    );

  const startCamera =
    useCallback(async () => {
      stopCamera();

      setStartingCamera(
        true,
      );

      setCameraError(null);

      setLiveQuality(null);

      try {
        if (
          !navigator
            .mediaDevices
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
          "دسترسی مستقیم به دوربین ممکن نیست. دسترسی Camera مرورگر را بررسی کنید یا از انتخاب تصویر استفاده کنید.",
        );
      } finally {
        setStartingCamera(
          false,
        );
      }
    }, [
      facingMode,
      stopCamera,
    ]);

  useEffect(() => {
    void startCamera();

    return () => {
      stopCamera();
    };
  }, [
    startCamera,
    stopCamera,
  ]);

  useEffect(() => {
    if (
      previewUrl ||
      cameraError ||
      startingCamera
    ) {
      return;
    }

    let timeout:
      number | undefined;

    const checkFrame =
      () => {
        const video =
          videoRef.current;

        if (
          video &&
          video.readyState >=
            HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth >
            0 &&
          video.videoHeight >
            0
        ) {
          setLiveQuality(
            analyzeSource(
              video,
              video.videoWidth,
              video.videoHeight,
            ),
          );
        }

        timeout =
          window.setTimeout(
            checkFrame,
            ANALYSIS_INTERVAL,
          );
      };

    timeout =
      window.setTimeout(
        checkFrame,
        400,
      );

    return () => {
      if (
        timeout !==
        undefined
      ) {
        window.clearTimeout(
          timeout,
        );
      }
    };
  }, [
    analyzeSource,
    cameraError,
    previewUrl,
    startingCamera,
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
      captureCanvasRef.current;

    if (
      !video ||
      !canvas
    ) {
      return;
    }

    const width =
      video.videoWidth;

    const height =
      video.videoHeight;

    if (
      !width ||
      !height
    ) {
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

    const quality =
      analyzeSource(
        canvas,
        width,
        height,
      );

    const blob =
      await new Promise<Blob | null>(
        (resolve) => {
          canvas.toBlob(
            resolve,
            "image/jpeg",
            0.92,
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
          type:
            "image/jpeg",
        },
      );

    setCaptureSource(
      "camera",
    );

    setCapturedFile(
      file,
    );

    setCapturedQuality(
      quality,
    );

    setPreviewUrl(
      URL.createObjectURL(
        blob,
      ),
    );

    stopCamera();
  }

  async function handleFileInput(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target
        .files?.[0];

    event.target.value =
      "";

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

    setCaptureSource(
      "gallery",
    );

    setCapturedFile(
      file,
    );

    setCapturedQuality(
      null,
    );

    setPreviewUrl(
      URL.createObjectURL(
        file,
      ),
    );

    stopCamera();

    const quality =
      await analyzeFile(
        file,
      );

    setCapturedQuality(
      quality,
    );
  }

  async function handleRetake() {
    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl,
      );
    }

    setPreviewUrl(null);

    setCapturedFile(null);

    setCapturedQuality(
      null,
    );

    setCaptureSource(
      "camera",
    );

    await startCamera();
  }

  async function handleConfirm() {
    if (!capturedFile) {
      return;
    }

    const preparedImage:
      PreparedImage = {
      file:
        capturedFile,

      source:
        captureSource,

      qc:
        toQualityMetrics(
          capturedQuality,
          capturedFile,
        ),
    };

    try {
      setConfirming(
        true,
      );

      await onConfirm(
        preparedImage,
      );

      handleClose();
    } catch (error) {
      console.error(error);

      setCameraError(
        "ذخیره تصویر انجام نشد.",
      );
    } finally {
      setConfirming(
        false,
      );
    }
  }

  const displayedQuality =
    previewUrl
      ? capturedQuality
      : liveQuality;

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
          from-black/85
          to-transparent
          px-4
          pb-10
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
            <p className="text-xs text-white/60">
              تصویربرداری
            </p>

            <h2 className="mt-1 text-base font-bold">
              {step.title}
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="پیش‌نمایش تصویر"
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
          !cameraError &&
          !startingCamera && (
            <CameraGuide
              step={step}
            />
          )}

        {!cameraError && (
          <div
            className="
              absolute
              bottom-4
              left-4
              right-4
              z-20
            "
          >
            <QualityFeedback
              quality={
                displayedQuality
              }
            />
          </div>
        )}

        {startingCamera &&
          !previewUrl && (
            <div
              className="
                absolute
                inset-0
                z-40
                flex
                items-center
                justify-center
                bg-black/60
              "
            >
              <div className="text-center">
                <RefreshCcw
                  className="mx-auto animate-spin"
                  size={28}
                />

                <p className="mt-3 text-sm text-white/80">
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
                <Camera
                  className="mx-auto text-slate-400"
                  size={36}
                />

                <p className="mt-4 text-sm font-bold">
                  دوربین در دسترس نیست
                </p>

                <p className="mt-2 text-xs leading-6 text-slate-500">
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
        ref={
          captureCanvasRef
        }
        className="hidden"
      />

      <canvas
        ref={
          analysisCanvasRef
        }
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
                text-white/60
              "
            >
              {
                step.liveInstruction
              }
            </p>

            <div className="grid grid-cols-3 items-center">
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

              تکرار عکس
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
                : capturedQuality?.overall ===
                    "bad"
                  ? "تأیید با وجود هشدار"
                  : "تأیید تصویر"}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}