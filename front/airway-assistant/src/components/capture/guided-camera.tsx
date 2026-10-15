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
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  X,
} from "lucide-react";

import { CameraGuide } from "@/components/capture/camera-guide";
import { QualityFeedback } from "@/components/capture/quality-feedback";

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

type CameraStatus =
  | "starting"
  | "live"
  | "fallback";

type FacingMode =
  | "user"
  | "environment";

interface GuidedCameraProps {
  step: CaptureStep;
  onClose: () => void;
  onConfirm: (image: PreparedImage) => Promise<void>;
}

const QUALITY_WIDTH = 160;
const QUALITY_HEIGHT = 120;
const QUALITY_INTERVAL_MS = 650;

function toQualityMetrics(
  quality: ImageQualityResult | null,
  file: File,
): ImageQualityMetrics {
  const checks = quality?.checks ?? [];

  return {
    width: quality?.width,
    height: quality?.height,
    fileSizeBytes: file.size,
    mimeType: file.type,
    brightness: quality?.brightness,
    meanBrightness: quality?.brightness,
    sharpness: quality?.sharpness,
    blurScore: quality?.sharpness,
    laplacianVariance: quality?.sharpness,
    overall: quality?.overall ?? "unknown",
    acceptable: quality?.overall !== "bad",
    passed: quality?.overall !== "bad",
    flags: checks
      .filter((check) => check.level !== "good")
      .map((check) => check.key),
    checks,
    checkedAt: new Date().toISOString(),
  };
}

function explainCameraFailure(
  error: unknown,
): string {
  if (!window.isSecureContext) {
    return (
      "برای پیش‌نمایش زنده دوربین در مرورگر، HTTPS لازم است. " +
      "در نسخه HTTP از دکمه «گرفتن عکس با دوربین گوشی» استفاده کنید."
    );
  }

  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return (
        "دسترسی دوربین در مرورگر رد شده است. آن را در تنظیمات سایت " +
        "فعال کنید و سپس «تلاش مجدد» را بزنید."
      );
    }

    if (error.name === "NotFoundError") {
      return "هیچ دوربینی شناسایی نشد. می‌توانید از گزینه دوربین گوشی استفاده کنید.";
    }

    if (error.name === "NotReadableError") {
      return "دوربین در برنامه دیگری در حال استفاده است. آن برنامه را ببندید و دوباره تلاش کنید.";
    }
  }

  return "پیش‌نمایش دوربین اجرا نشد. دوباره تلاش کنید یا دوربین گوشی را انتخاب کنید.";
}

export function GuidedCamera({
  step,
  onClose,
  onConfirm,
}: GuidedCameraProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const photoCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const qualityCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const requestIdRef = useRef(0);

  // Camera and gallery have separate file inputs.
  const nativeCameraRef =
    useRef<HTMLInputElement | null>(null);

  const galleryRef =
    useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] =
    useState<FacingMode>("environment");

  const [status, setStatus] =
    useState<CameraStatus>("starting");

  const [message, setMessage] =
    useState<string | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  const [capturedFile, setCapturedFile] =
    useState<File | null>(null);

  const [captureSource, setCaptureSource] =
    useState<CaptureSource>("unknown");

  const [liveQuality, setLiveQuality] =
    useState<ImageQualityResult | null>(null);

  const [capturedQuality, setCapturedQuality] =
    useState<ImageQualityResult | null>(null);

  const [confirming, setConfirming] =
    useState(false);

  const supportsLiveCamera =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  /* ------------------------------------------------------------------ */
  /* Stop camera                                                        */
  /* ------------------------------------------------------------------ */

  const stopCamera = useCallback(() => {
    requestIdRef.current += 1;

    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Image quality                                                       */
  /* ------------------------------------------------------------------ */

  const inspectImage = useCallback(
    (
      source: CanvasImageSource,
      width: number,
      height: number,
    ) => {
      const canvas = qualityCanvasRef.current;

      if (!canvas) return null;

      canvas.width = QUALITY_WIDTH;
      canvas.height = QUALITY_HEIGHT;

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) return null;

      context.drawImage(
        source,
        0,
        0,
        QUALITY_WIDTH,
        QUALITY_HEIGHT,
      );

      return analyzeImageData(
        context.getImageData(
          0,
          0,
          QUALITY_WIDTH,
          QUALITY_HEIGHT,
        ),
        width,
        height,
      );
    },
    [],
  );

  const inspectFile = useCallback(
    (file: File): Promise<ImageQualityResult | null> =>
      new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
          const result = inspectImage(
            image,
            image.naturalWidth,
            image.naturalHeight,
          );

          URL.revokeObjectURL(url);
          resolve(result);
        };

        image.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };

        image.src = url;
      }),
    [inspectImage],
  );

  /* ------------------------------------------------------------------ */
  /* Live camera                                                        */
  /* ------------------------------------------------------------------ */

  const startLiveCamera = useCallback(async () => {
    stopCamera();

    const requestId = requestIdRef.current;

    setStatus("starting");
    setMessage(null);
    setLiveQuality(null);

    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error("SECURE_CONTEXT_REQUIRED");
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: {
              ideal: facingMode,
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
        });

      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach(
          (track) => track.stop(),
        );
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        throw new Error("VIDEO_NOT_READY");
      }

      video.srcObject = stream;

      await video.play();

      if (requestId === requestIdRef.current) {
        setStatus("live");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      stopCamera();

      setMessage(
        explainCameraFailure(error),
      );

      setStatus("fallback");
    }
  }, [facingMode, stopCamera]);

  /* ------------------------------------------------------------------ */
  /* Initial camera activation                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (supportsLiveCamera) {
      void startLiveCamera();
    } else {
      setStatus("fallback");
      setMessage(
        "روی HTTP، مرورگر اجازه دوربین زنده داخل برنامه نمی‌دهد. " +
          "از دکمه گرفتن عکس با دوربین گوشی استفاده کنید.",
      );
    }

    return () => stopCamera();
  }, [
    supportsLiveCamera,
    startLiveCamera,
    stopCamera,
  ]);

  /* ------------------------------------------------------------------ */
  /* Live quality analysis                                              */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (status !== "live" || previewUrl) {
      return;
    }

    const timer = window.setInterval(() => {
      const video = videoRef.current;

      if (
        video &&
        video.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        setLiveQuality(
          inspectImage(
            video,
            video.videoWidth,
            video.videoHeight,
          ),
        );
      }
    }, QUALITY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [
    status,
    previewUrl,
    inspectImage,
  ]);

  /* ------------------------------------------------------------------ */
  /* Preview cleanup                                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */

  function openNativeCamera() {
    // Executed directly from a user click.
    nativeCameraRef.current?.click();
  }

  function openGallery() {
    galleryRef.current?.click();
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  function switchCamera() {
    if (previewUrl || status !== "live") {
      return;
    }

    setFacingMode((current) =>
      current === "environment"
        ? "user"
        : "environment",
    );
  }

  /* ------------------------------------------------------------------ */
  /* Capture live frame                                                 */
  /* ------------------------------------------------------------------ */

  async function captureLiveFrame() {
    const video = videoRef.current;
    const canvas = photoCanvasRef.current;

    if (
      !video ||
      !canvas ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setMessage(
        "تصویر دوربین هنوز آماده نیست.",
      );

      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) return;

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const quality = inspectImage(
      canvas,
      canvas.width,
      canvas.height,
    );

    const blob =
      await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          resolve,
          "image/jpeg",
          0.92,
        );
      });

    if (!blob) {
      setMessage(
        "گرفتن عکس انجام نشد. دوباره تلاش کنید.",
      );
      return;
    }

    setCapturedFile(
      new File(
        [blob],
        `${step.kind}-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        },
      ),
    );

    setCaptureSource("camera");
    setCapturedQuality(quality);
    setPreviewUrl(
      URL.createObjectURL(blob),
    );

    stopCamera();
  }

  /* ------------------------------------------------------------------ */
  /* Native camera / gallery                                            */
  /* ------------------------------------------------------------------ */

  async function handleFileSelected(
    event: ChangeEvent<HTMLInputElement>,
    source: CaptureSource,
  ) {
    const file =
      event.currentTarget.files?.[0];

    event.currentTarget.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage(
        "فایل انتخاب‌شده تصویر نیست.",
      );
      return;
    }

    stopCamera();

    setCapturedFile(file);
    setCaptureSource(source);
    setCapturedQuality(null);
    setPreviewUrl(
      URL.createObjectURL(file),
    );
    setMessage(null);

    setCapturedQuality(
      await inspectFile(file),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Retake photo                                                        */
  /* ------------------------------------------------------------------ */

  function retakePhoto() {
    if (supportsLiveCamera) {
      setPreviewUrl(null);
      setCapturedFile(null);
      setCapturedQuality(null);

      void startLiveCamera();
      return;
    }

    // Preserve the old photo if native capture is cancelled.
    openNativeCamera();
  }

  /* ------------------------------------------------------------------ */
  /* Confirm photo                                                       */
  /* ------------------------------------------------------------------ */

  async function confirmPhoto() {
    if (!capturedFile || confirming) {
      return;
    }

    const prepared: PreparedImage = {
      file: capturedFile,
      source: captureSource,
      qc: toQualityMetrics(
        capturedQuality,
        capturedFile,
      ),
    };

    try {
      setConfirming(true);

      await onConfirm(prepared);

      handleClose();
    } catch (error) {
      console.error(
        "Photo save failed:",
        error,
      );

      setMessage(
        "ذخیره عکس انجام نشد. دوباره تلاش کنید.",
      );
    } finally {
      setConfirming(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */

  return (
    <div
      className="
        fixed inset-0 z-[100]
        flex flex-col
        bg-black text-white
      "
    >
      {/* Dedicated native camera input */}

      <input
        ref={nativeCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="گرفتن عکس با دوربین گوشی"
        onChange={(event) =>
          void handleFileSelected(
            event,
            "unknown",
          )
        }
      />

      {/* Separate gallery input */}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="انتخاب تصویر از گالری"
        onChange={(event) =>
          void handleFileSelected(
            event,
            "gallery",
          )
        }
      />

      {/* Header */}

      <header
        className="
          absolute inset-x-0 top-0 z-30
          bg-gradient-to-b
          from-black/85 to-transparent
          px-4 pb-10
          pt-[calc(env(safe-area-inset-top)+12px)]
        "
      >
        <div
          className="
            flex items-start
            justify-between gap-4
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
            onClick={handleClose}
            aria-label="بستن دوربین"
            className="
              flex size-11
              items-center justify-center
              rounded-full bg-black/40
            "
          >
            <X size={22} />
          </button>
        </div>
      </header>

      {/* Camera / preview */}

      <div
        className="
          relative flex-1
          overflow-hidden bg-black
        "
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="پیش‌نمایش عکس"
            className="
              h-full w-full object-contain
            "
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="
              h-full w-full object-cover
            "
          />
        )}

        {!previewUrl &&
          status === "live" && (
            <CameraGuide step={step} />
          )}

        {(previewUrl ||
          status === "live") && (
          <div
            className="
              absolute
              bottom-4 left-4 right-4
              z-20
            "
          >
            <QualityFeedback
              quality={
                previewUrl
                  ? capturedQuality
                  : liveQuality
              }
            />
          </div>
        )}

        {/* Camera permission loading */}

        {!previewUrl &&
          status === "starting" && (
            <div
              className="
                absolute inset-0 z-40
                flex items-center justify-center
                bg-black/80 p-6 text-center
              "
            >
              <div>
                <LoaderCircle
                  size={29}
                  className="
                    mx-auto animate-spin
                  "
                />

                <p
                  className="
                    mt-3 text-sm leading-7
                  "
                >
                  در حال درخواست اجازه دوربین...
                </p>

                <p
                  className="
                    text-xs leading-6
                    text-white/60
                  "
                >
                  اگر پیام مرورگر نمایش داده شد،
                  «اجازه دادن» را انتخاب کنید.
                </p>
              </div>
            </div>
          )}

        {/* HTTP fallback / camera errors */}

        {!previewUrl &&
          status === "fallback" && (
            <div
              className="
                absolute inset-0 z-30
                flex items-center justify-center
                overflow-y-auto px-5 pb-10 pt-28
              "
            >
              <div
                className="
                  w-full max-w-sm
                  rounded-3xl bg-white p-5
                  text-center text-slate-900
                "
              >
                <Camera
                  size={36}
                  className="
                    mx-auto text-sky-700
                  "
                />

                <h3
                  className="
                    mt-3 text-base font-bold
                  "
                >
                  گرفتن عکس با دوربین گوشی
                </h3>

                <p
                  className="
                    mt-2 text-sm leading-7
                    text-slate-600
                  "
                >
                  {message}
                </p>

                {supportsLiveCamera && (
                  <button
                    type="button"
                    onClick={() =>
                      void startLiveCamera()
                    }
                    className="
                      mt-4 flex min-h-12 w-full
                      items-center justify-center gap-2
                      rounded-2xl bg-sky-700 px-4
                      text-sm font-bold text-white
                    "
                  >
                    <RefreshCcw size={18} />
                    تلاش دوباره برای دوربین زنده
                  </button>
                )}

                <button
                  type="button"
                  onClick={openNativeCamera}
                  className="
                    mt-4 flex min-h-12 w-full
                    items-center justify-center gap-2
                    rounded-2xl bg-emerald-600 px-4
                    text-sm font-bold text-white
                  "
                >
                  <Camera size={19} />
                  گرفتن عکس با دوربین گوشی
                </button>

                <button
                  type="button"
                  onClick={openGallery}
                  className="
                    mt-3 flex min-h-12 w-full
                    items-center justify-center gap-2
                    rounded-2xl border
                    border-slate-300 bg-white
                    px-4 text-sm font-bold
                    text-slate-700
                  "
                >
                  <ImagePlus size={18} />
                  انتخاب از گالری
                </button>

                <p
                  className="
                    mt-3 text-xs leading-6
                    text-slate-500
                  "
                >
                  بعضی مرورگرها حتی با درخواست دوربین،
                  گالری یا منوی انتخاب عکس را باز
                  می‌کنند. در HTTP امکان اجبار
                  مرورگر به اجرای دوربین وجود ندارد.
                </p>
              </div>
            </div>
          )}
      </div>

      {/* Hidden image-processing canvases */}

      <canvas
        ref={photoCanvasRef}
        className="hidden"
      />

      <canvas
        ref={qualityCanvasRef}
        className="hidden"
      />

      {/* Bottom controls */}

      <footer
        className="
          bg-black px-5
          pb-[calc(env(safe-area-inset-bottom)+18px)]
          pt-5
        "
      >
        {previewUrl ? (
          <>
            {message && (
              <p
                role="alert"
                className="
                  mb-3 text-center
                  text-xs leading-6
                  text-rose-300
                "
              >
                {message}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={retakePhoto}
                disabled={confirming}
                className="
                  flex min-h-14
                  items-center justify-center gap-2
                  rounded-2xl bg-white/15
                  px-4 text-sm font-bold
                  disabled:opacity-50
                "
              >
                <RefreshCcw size={18} />
                تکرار عکس
              </button>

              <button
                type="button"
                onClick={() =>
                  void confirmPhoto()
                }
                disabled={confirming}
                className="
                  flex min-h-14
                  items-center justify-center gap-2
                  rounded-2xl bg-emerald-500
                  px-4 text-sm font-bold text-white
                  disabled:opacity-50
                "
              >
                {confirming ? (
                  <LoaderCircle
                    size={18}
                    className="animate-spin"
                  />
                ) : (
                  <Check size={18} />
                )}

                {confirming
                  ? "در حال ذخیره..."
                  : capturedQuality?.overall ===
                      "bad"
                    ? "تأیید با وجود هشدار"
                    : "تأیید عکس"}
              </button>
            </div>
          </>
        ) : status === "live" ? (
          <>
            <p
              className="
                mb-4 text-center
                text-xs leading-6
                text-white/70
              "
            >
              {message ?? step.liveInstruction}
            </p>

            <div
              className="
                grid grid-cols-3
                items-center
              "
            >
              <button
                type="button"
                onClick={openGallery}
                aria-label="انتخاب از گالری"
                className="
                  flex size-12
                  items-center justify-center
                  justify-self-start
                  rounded-full bg-white/15
                "
              >
                <ImagePlus size={21} />
              </button>

              <button
                type="button"
                onClick={() =>
                  void captureLiveFrame()
                }
                aria-label="گرفتن عکس"
                className="
                  flex size-[76px]
                  items-center justify-center
                  justify-self-center
                  rounded-full border-4 border-white
                "
              >
                <span
                  className="
                    block size-[58px]
                    rounded-full bg-white
                  "
                />
              </button>

              <button
                type="button"
                onClick={switchCamera}
                aria-label="تعویض دوربین"
                className="
                  flex size-12
                  items-center justify-center
                  justify-self-end
                  rounded-full bg-white/15
                "
              >
                <RotateCcw size={21} />
              </button>
            </div>
          </>
        ) : (
          <p
            className="
              text-center text-xs leading-6
              text-white/65
            "
          >
            برای گرفتن عکس، روی دکمه
            «گرفتن عکس با دوربین گوشی» بزنید.
          </p>
        )}
      </footer>
    </div>
  );
}


