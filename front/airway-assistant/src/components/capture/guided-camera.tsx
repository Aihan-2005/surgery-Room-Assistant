
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


type FacingMode =
  | "environment"
  | "user";

type CameraStatus =
  | "starting"
  | "live"
  | "unavailable";


interface GuidedCameraProps {
  step: CaptureStep;

  onClose: () => void;

  onConfirm: (
    image: PreparedImage,
  ) => Promise<void>;
}


const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 120;
const ANALYSIS_INTERVAL_MS = 650;


/* -------------------------------------------------------------------------- */
/* Image quality                                                              */
/* -------------------------------------------------------------------------- */

function toQualityMetrics(
  quality: ImageQualityResult | null,
  file: File,
): ImageQualityMetrics {
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

    flags:
      quality?.checks
        .filter(
          (check) => check.level !== "good",
        )
        .map(
          (check) => check.key,
        ) ?? [],

    checks: quality?.checks,

    checkedAt: new Date().toISOString(),
  };
}


/* -------------------------------------------------------------------------- */
/* Friendly camera errors                                                     */
/* -------------------------------------------------------------------------- */

function describeCameraError(
  error: unknown,
): string {
  if (
    typeof window !== "undefined" &&
    !window.isSecureContext
  ) {
    return (
      "برای نمایش زنده دوربین داخل برنامه، " +
      "آدرس HTTPS لازم است. فعلاً از " +
      "«باز کردن دوربین گوشی» استفاده کنید."
    );
  }

  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return (
        "برای ورود به دوربین، در پیام مرورگر " +
        "«اجازه دادن» را تأیید کنید. " +
        "اگر قبلاً دسترسی را رد کرده‌اید، " +
        "آن را از تنظیمات سایت فعال کنید " +
        "و دوباره تلاش کنید."
      );
    }

    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      return (
        "مرورگر دوربینی پیدا نکرد. " +
        "می‌توانید دوربین گوشی را " +
        "با دکمه پایین باز کنید."
      );
    }

    if (
      error.name === "NotReadableError" ||
      error.name === "TrackStartError"
    ) {
      return (
        "دوربین احتمالاً در برنامه دیگری " +
        "باز است. برنامه دیگر را ببندید " +
        "و دوباره تلاش کنید."
      );
    }
  }

  return (
    "پیش‌نمایش دوربین باز نشد. " +
    "دوباره تلاش کنید یا با دکمه پایین " +
    "مستقیماً دوربین گوشی را باز کنید."
  );
}


/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function GuidedCamera({
  step,
  onClose,
  onConfirm,
}: GuidedCameraProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const captureCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const analysisCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  /*
   * Prevent outdated camera permission requests
   * from opening a stream after the modal closes.
   */
  const cameraRequestIdRef = useRef(0);


  const [
    facingMode,
    setFacingMode,
  ] =
    useState<FacingMode>("environment");

  const [
    status,
    setStatus,
  ] =
    useState<CameraStatus>("starting");

  const [
    cameraMessage,
    setCameraMessage,
  ] =
    useState<string | null>(null);

  const [
    previewUrl,
    setPreviewUrl,
  ] =
    useState<string | null>(null);

  const [
    capturedFile,
    setCapturedFile,
  ] =
    useState<File | null>(null);

  const [
    captureSource,
    setCaptureSource,
  ] =
    useState<CaptureSource>("camera");

  const [
    confirming,
    setConfirming,
  ] =
    useState(false);

  const [
    liveQuality,
    setLiveQuality,
  ] =
    useState<ImageQualityResult | null>(null);

  const [
    capturedQuality,
    setCapturedQuality,
  ] =
    useState<ImageQualityResult | null>(null);


  const canUseWebCamera =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia ===
      "function";


  /* ---------------------------------------------------------------------- */
  /* Stop camera                                                            */
  /* ---------------------------------------------------------------------- */

  const stopCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;

    streamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);


  /* ---------------------------------------------------------------------- */
  /* Image analysis                                                         */
  /* ---------------------------------------------------------------------- */

  const analyzeSource = useCallback(
    (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
    ): ImageQualityResult | null => {
      const canvas =
        analysisCanvasRef.current;

      if (!canvas) {
        return null;
      }

      canvas.width = ANALYSIS_WIDTH;
      canvas.height = ANALYSIS_HEIGHT;

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

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

      return analyzeImageData(
        context.getImageData(
          0,
          0,
          ANALYSIS_WIDTH,
          ANALYSIS_HEIGHT,
        ),
        sourceWidth,
        sourceHeight,
      );
    },
    [],
  );


  const analyzeFile = useCallback(
    (
      file: File,
    ): Promise<ImageQualityResult | null> =>
      new Promise((resolve) => {
        const url =
          URL.createObjectURL(file);

        const image = new Image();

        image.onload = () => {
          const quality = analyzeSource(
            image,
            image.naturalWidth,
            image.naturalHeight,
          );

          URL.revokeObjectURL(url);

          resolve(quality);
        };

        image.onerror = () => {
          URL.revokeObjectURL(url);

          resolve(null);
        };

        image.src = url;
      }),
    [analyzeSource],
  );


  /* ---------------------------------------------------------------------- */
  /* Start live camera                                                      */
  /* ---------------------------------------------------------------------- */

  const startCamera = useCallback(
    async () => {
      stopCamera();

      const requestId =
        cameraRequestIdRef.current;

      setStatus("starting");

      setCameraMessage(null);

      setLiveQuality(null);

      try {
        if (
          !window.isSecureContext ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error(
            "CAMERA_REQUIRES_SECURE_CONTEXT",
          );
        }

        /*
         * The browser asks the user for permission.
         * When permission is granted, the camera
         * preview opens automatically.
         */
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


        if (
          requestId !==
          cameraRequestIdRef.current
        ) {
          stream.getTracks().forEach(
            (track) => track.stop(),
          );

          return;
        }


        streamRef.current = stream;

        const video = videoRef.current;

        if (!video) {
          throw new Error(
            "VIDEO_ELEMENT_UNAVAILABLE",
          );
        }

        video.srcObject = stream;

        await video.play();

        if (
          requestId !==
          cameraRequestIdRef.current
        ) {
          return;
        }

        setStatus("live");
      } catch (error) {
        if (
          requestId !==
          cameraRequestIdRef.current
        ) {
          return;
        }

        stopCamera();

        setCameraMessage(
          describeCameraError(error),
        );

        setStatus("unavailable");
      }
    },
    [facingMode, stopCamera],
  );


  /* ---------------------------------------------------------------------- */
  /* Initial camera activation                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (canUseWebCamera) {
      /*
       * On HTTPS, request camera permission.
       * On approval, live preview opens.
       */
      void startCamera();
    } else {
      /*
       * On non-HTTPS public origins, getUserMedia
       * cannot be used. Offer native camera capture
       * instead of showing a generic failure.
       */
      setStatus("unavailable");

      setCameraMessage(
        typeof window !== "undefined" &&
          !window.isSecureContext
          ? (
              "برای دوربین زنده داخل برنامه، " +
              "HTTPS لازم است. روی " +
              "«باز کردن دوربین گوشی» بزنید."
            )
          : (
              "دوربین زنده مرورگر در دسترس نیست. " +
              "از «باز کردن دوربین گوشی» استفاده کنید."
            ),
      );
    }

    return () => {
      stopCamera();
    };
  }, [
    canUseWebCamera,
    startCamera,
    stopCamera,
  ]);


  /* ---------------------------------------------------------------------- */
  /* Live quality analysis                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (
      status !== "live" ||
      previewUrl
    ) {
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
          analyzeSource(
            video,
            video.videoWidth,
            video.videoHeight,
          ),
        );
      }
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    analyzeSource,
    previewUrl,
    status,
  ]);


  /* ---------------------------------------------------------------------- */
  /* Preview cleanup                                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);


  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  function handleClose() {
    stopCamera();
    onClose();
  }


  function handleSwitchCamera() {
    if (
      previewUrl ||
      status !== "live"
    ) {
      return;
    }

    setFacingMode(
      (current) =>
        current === "environment"
          ? "user"
          : "environment",
    );
  }


  /* ---------------------------------------------------------------------- */
  /* Capture from live preview                                              */
  /* ---------------------------------------------------------------------- */

  async function captureFrame() {
    const video = videoRef.current;

    const canvas =
      captureCanvasRef.current;

    if (
      !video ||
      !canvas ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setCameraMessage(
        "تصویر دوربین هنوز آماده نیست.",
      );

      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const quality = analyzeSource(
      canvas,
      canvas.width,
      canvas.height,
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
      setCameraMessage(
        "عکس ثبت نشد. دوباره تلاش کنید.",
      );

      return;
    }

    const file = new File(
      [blob],
      `${step.kind}-${Date.now()}.jpg`,
      {
        type: "image/jpeg",
      },
    );

    setCapturedFile(file);

    setCaptureSource("camera");

    setCapturedQuality(quality);

    setPreviewUrl(
      URL.createObjectURL(blob),
    );

    stopCamera();
  }


  /* ---------------------------------------------------------------------- */
  /* Native camera / gallery                                                */
  /* ---------------------------------------------------------------------- */

  async function handleFileInput(
    event: ChangeEvent<HTMLInputElement>,
    source: CaptureSource,
  ) {
    const file =
      event.currentTarget.files?.[0];

    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith("image/")
    ) {
      setCameraMessage(
        "لطفاً فقط فایل تصویری انتخاب کنید.",
      );

      return;
    }

    stopCamera();

    setCapturedFile(file);

    /*
     * Native camera => camera
     * Existing gallery photo => gallery
     */
    setCaptureSource(source);

    setCapturedQuality(null);

    setPreviewUrl(
      URL.createObjectURL(file),
    );

    setCameraMessage(null);

    const quality =
      await analyzeFile(file);

    setCapturedQuality(quality);
  }


  /* ---------------------------------------------------------------------- */
  /* Retake                                                                 */
  /* ---------------------------------------------------------------------- */

  function handleRetake() {
    setPreviewUrl(null);

    setCapturedFile(null);

    setCapturedQuality(null);

    setCaptureSource("camera");

    setCameraMessage(null);

    if (canUseWebCamera) {
      void startCamera();
    } else {
      setStatus("unavailable");
    }
  }


  /* ---------------------------------------------------------------------- */
  /* Save / confirm                                                         */
  /* ---------------------------------------------------------------------- */

  async function handleConfirm() {
    if (
      !capturedFile ||
      confirming
    ) {
      return;
    }

    const image: PreparedImage = {
      file: capturedFile,

      source: captureSource,

      qc: toQualityMetrics(
        capturedQuality,
        capturedFile,
      ),
    };

    try {
      setConfirming(true);

      /*
       * Existing PhotoCard callback.
       * The image is still saved locally
       * through the existing IndexedDB flow.
       */
      await onConfirm(image);

      handleClose();
    } catch (error) {
      console.error(
        "Saving captured photo failed:",
        error,
      );

      setCameraMessage(
        "ذخیره عکس انجام نشد. دوباره تلاش کنید.",
      );
    } finally {
      setConfirming(false);
    }
  }


  const displayedQuality =
    previewUrl
      ? capturedQuality
      : liveQuality;


  /* ---------------------------------------------------------------------- */
  /* UI                                                                     */
  /* ---------------------------------------------------------------------- */

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
      {/* Header */}

      <header
        className="
          absolute
          inset-x-0
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
            onClick={handleClose}
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


      {/* Camera / Preview */}

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
            alt="پیش‌نمایش عکس گرفته‌شده"
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


        {/* Position guide */}

        {!previewUrl &&
          status === "live" && (
            <CameraGuide step={step} />
          )}


        {/* Image quality */}

        {(status === "live" || previewUrl) && (
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
              quality={displayedQuality}
            />
          </div>
        )}


        {/* Waiting for camera permission */}

        {!previewUrl &&
          status === "starting" && (
            <div
              className="
                absolute
                inset-0
                z-40
                flex
                items-center
                justify-center
                bg-black/80
                p-6
              "
            >
              <div className="text-center">
                <LoaderCircle
                  size={30}
                  className="
                    mx-auto
                    animate-spin
                  "
                />

                <p className="mt-3 text-sm leading-7">
                  در حال درخواست دسترسی به دوربین...
                </p>

                <p
                  className="
                    text-xs
                    leading-6
                    text-white/60
                  "
                >
                  اگر مرورگر اجازه دوربین خواست،
                  «اجازه دادن» را تأیید کنید.
                </p>
              </div>
            </div>
          )}


        {/* Camera permission / native camera fallback */}

        {!previewUrl &&
          status === "unavailable" && (
            <div
              className="
                absolute
                inset-0
                z-30
                flex
                items-center
                justify-center
                overflow-y-auto
                px-5
                pb-10
                pt-28
              "
            >
              <div
                className="
                  w-full
                  max-w-sm
                  rounded-3xl
                  bg-white
                  p-5
                  text-center
                  text-slate-900
                "
              >
                <Camera
                  size={36}
                  className="mx-auto text-sky-700"
                />

                <h3 className="mt-3 text-base font-bold">
                  ادامه تصویربرداری
                </h3>

                <p
                  className="
                    mt-2
                    text-sm
                    leading-7
                    text-slate-600
                  "
                >
                  {cameraMessage}
                </p>


                {/* Retry live camera permission */}

                {canUseWebCamera && (
                  <button
                    type="button"
                    onClick={() =>
                      void startCamera()
                    }
                    className="
                      mt-4
                      flex
                      min-h-12
                      w-full
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
                    <Camera size={18} />

                    اجازه دسترسی و شروع دوربین
                  </button>
                )}


                {/* Native phone camera */}

                <label
                  className="
                    relative
                    mt-3
                    flex
                    min-h-12
                    w-full
                    cursor-pointer
                    items-center
                    justify-center
                    gap-2
                    overflow-hidden
                    rounded-2xl
                    bg-emerald-600
                    px-4
                    text-sm
                    font-bold
                    text-white
                  "
                >
                  <Camera size={18} />

                  باز کردن دوربین گوشی

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="عکس گرفتن با دوربین گوشی"
                    className="
                      absolute
                      inset-0
                      h-full
                      w-full
                      cursor-pointer
                      opacity-0
                    "
                    onChange={(event) =>
                      void handleFileInput(
                        event,
                        "camera",
                      )
                    }
                  />
                </label>


                {/* Gallery: separate action */}

                <label
                  className="
                    relative
                    mt-3
                    flex
                    min-h-11
                    w-full
                    cursor-pointer
                    items-center
                    justify-center
                    gap-2
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-300
                    bg-white
                    px-4
                    text-sm
                    font-medium
                    text-slate-700
                  "
                >
                  <ImagePlus size={18} />

                  انتخاب از گالری

                  <input
                    type="file"
                    accept="image/*"
                    aria-label="انتخاب عکس از گالری"
                    className="
                      absolute
                      inset-0
                      h-full
                      w-full
                      cursor-pointer
                      opacity-0
                    "
                    onChange={(event) =>
                      void handleFileInput(
                        event,
                        "gallery",
                      )
                    }
                  />
                </label>


                <p
                  className="
                    mt-3
                    text-xs
                    leading-6
                    text-slate-500
                  "
                >
                  عکس بعد از تأیید شما روی همین
                  دستگاه ذخیره می‌شود؛ برای گرفتن
                  عکس اینترنت لازم نیست.
                </p>
              </div>
            </div>
          )}
      </div>


      {/* Hidden canvases */}

      <canvas
        ref={captureCanvasRef}
        className="hidden"
      />

      <canvas
        ref={analysisCanvasRef}
        className="hidden"
      />


      {/* Controls */}

      <footer
        className="
          bg-black
          px-5
          pb-[calc(env(safe-area-inset-bottom)+18px)]
          pt-5
        "
      >
        {previewUrl ? (
          <>
            {cameraMessage && (
              <p
                role="alert"
                className="
                  mb-3
                  text-center
                  text-xs
                  leading-6
                  text-rose-300
                "
              >
                {cameraMessage}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRetake}
                disabled={confirming}
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
                  disabled:opacity-50
                "
              >
                <RefreshCcw size={18} />

                تکرار عکس
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleConfirm()
                }
                disabled={confirming}
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
                mb-4
                text-center
                text-xs
                leading-6
                text-white/70
              "
            >
              {cameraMessage ??
                step.liveInstruction}
            </p>

            <div className="grid grid-cols-3 items-center">
              {/* Gallery */}

              <label
                className="
                  relative
                  flex
                  size-12
                  cursor-pointer
                  items-center
                  justify-center
                  justify-self-start
                  overflow-hidden
                  rounded-full
                  bg-white/15
                "
              >
                <ImagePlus size={21} />

                <input
                  type="file"
                  accept="image/*"
                  aria-label="انتخاب عکس از گالری"
                  className="
                    absolute
                    inset-0
                    h-full
                    w-full
                    cursor-pointer
                    opacity-0
                  "
                  onChange={(event) =>
                    void handleFileInput(
                      event,
                      "gallery",
                    )
                  }
                />
              </label>


              {/* Shutter */}

              <button
                type="button"
                aria-label="گرفتن عکس"
                onClick={() =>
                  void captureFrame()
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


              {/* Switch front/rear camera */}

              <button
                type="button"
                aria-label="تعویض دوربین جلو و عقب"
                onClick={handleSwitchCamera}
                className="
                  flex
                  size-12
                  items-center
                  justify-center
                  justify-self-end
                  rounded-full
                  bg-white/15
                "
              >
                <RotateCcw size={21} />
              </button>
            </div>
          </>
        ) : (
          <p
            className="
              text-center
              text-xs
              leading-6
              text-white/65
            "
          >
            برای عکس گرفتن، گزینه
            «باز کردن دوربین گوشی» را انتخاب کنید.
          </p>
        )}
      </footer>
    </div>
  );
}