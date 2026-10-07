"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  ArrowRight,
  CheckCircle2,
  CloudOff,
  Images,
  LoaderCircle,
} from "lucide-react";

import {
  NetworkPill,
} from "@/components/app-shell/network-pill";

import {
  PhotoCard,
} from "@/components/capture/photo-card";

import {
  CAPTURE_PROTOCOL,
} from "@/lib/config/capture-protocol";

import {
  getCase,
  getPhotosByCase,
  savePhoto,
  updateCaseStatus,
} from "@/lib/db/database";

import type {
  AirwayCase,
  CaptureKind,
  PreparedImage,
  StoredPhoto,
} from "@/lib/domain/types";

interface PhotoPreview {
  photo: StoredPhoto;
  url: string;
}

export default function CapturePage() {
  const params =
    useParams<{
      caseId: string;
    }>();

  const router =
    useRouter();

  const caseId =
    params.caseId;

  /**
   * تمام Object URLهایی که در این صفحه می‌سازیم
   * اینجا track می‌شوند تا هنگام خروج از صفحه آزاد شوند.
   */
  const previewUrlsRef =
    useRef<Set<string>>(
      new Set(),
    );

  const [
    airwayCase,
    setAirwayCase,
  ] =
    useState<AirwayCase | null>(
      null,
    );

  const [
    photos,
    setPhotos,
  ] =
    useState<
      Partial<
        Record<
          CaptureKind,
          PhotoPreview
        >
      >
    >({});

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    savingKind,
    setSavingKind,
  ] =
    useState<CaptureKind | null>(
      null,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  /**
   * ایجاد Preview URL و ثبت آن برای cleanup بعدی.
   */
  const createPreviewUrl =
    useCallback(
      (blob: Blob) => {
        const url =
          URL.createObjectURL(
            blob,
          );

        previewUrlsRef.current.add(
          url,
        );

        return url;
      },
      [],
    );

  /**
   * حذف یک Preview URL مشخص.
   */
  const revokePreviewUrl =
    useCallback(
      (url: string) => {
        URL.revokeObjectURL(
          url,
        );

        previewUrlsRef.current.delete(
          url,
        );
      },
      [],
    );

  /**
   * خواندن Case و تمام تصاویر ذخیره‌شده آن.
   */
  const loadData =
    useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          loadedCase,
          storedPhotos,
        ] =
          await Promise.all([
            getCase(caseId),

            getPhotosByCase(
              caseId,
            ),
          ]);

        if (!loadedCase) {
          setAirwayCase(
            null,
          );

          setError(
            "Case موردنظر پیدا نشد.",
          );

          return;
        }

        setAirwayCase(
          loadedCase,
        );

        const previews:
          Partial<
            Record<
              CaptureKind,
              PhotoPreview
            >
          > = {};

        for (
          const photo of
          storedPhotos
        ) {
          /**
           * ممکن است IndexedDB شامل تصاویر مربوط به
           * protocol قدیمی باشد.
           *
           * فقط تصاویر مربوط به protocol فعلی را
           * در UI نمایش می‌دهیم.
           */
          const isCurrentKind =
            CAPTURE_PROTOCOL.some(
              (step) =>
                step.kind ===
                photo.kind,
            );

          if (
            !isCurrentKind
          ) {
            continue;
          }

          previews[
            photo.kind
          ] = {
            photo,

            url:
              createPreviewUrl(
                photo.blob,
              ),
          };
        }

        setPhotos(
          previews,
        );
      } catch (error) {
        console.error(
          "Failed to load capture data:",
          error,
        );

        setError(
          "خواندن اطلاعات Case انجام نشد.",
        );
      } finally {
        setLoading(false);
      }
    }, [
      caseId,
      createPreviewUrl,
    ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /**
   * Cleanup تمام URLهای ساخته‌شده فقط هنگام
   * unmount شدن خود صفحه.
   *
   * این بهتر از dependency روی photos است،
   * چون در آن حالت ممکن بود preview فعلی زودتر revoke شود.
   */
  useEffect(() => {
    return () => {
      for (
        const url of
        previewUrlsRef.current
      ) {
        URL.revokeObjectURL(
          url,
        );
      }

      previewUrlsRef.current.clear();
    };
  }, []);

  /**
   * پوزیشن‌هایی که الزاماً باید عکس داشته باشند.
   *
   * تعداد این‌ها hard-code نشده و مستقیماً
   * از Capture Protocol می‌آید.
   */
  const requiredSteps =
    useMemo(
      () =>
        CAPTURE_PROTOCOL.filter(
          (step) =>
            step.required,
        ),
      [],
    );

  const completedRequired =
    useMemo(() => {
      return requiredSteps.filter(
        (step) =>
          Boolean(
            photos[
              step.kind
            ],
          ),
      ).length;
    }, [
      photos,
      requiredSteps,
    ]);

  const requiredCount =
    requiredSteps.length;

  const isComplete =
    completedRequired ===
    requiredCount;

  /**
   * دریافت PreparedImage از GuidedCamera.
   *
   * PreparedImage شامل:
   *
   * file
   * source
   * qc
   *
   * است و دیگر File خام به Database فرستاده نمی‌شود.
   */
  async function handlePhoto(
    kind: CaptureKind,
    image: PreparedImage,
  ) {
    setError(null);

    setSavingKind(
      kind,
    );

    try {
      const storedPhoto =
        await savePhoto(
          caseId,
          kind,
          image,
        );

      /**
       * اگر Case قبلاً وارد Queue شده باشد
       * و یکی از عکس‌ها تغییر کند،
       * Case دیگر آماده ارسال قبلی محسوب نمی‌شود.
       */
      await updateCaseStatus(
        caseId,
        "draft",
      );

      const url =
        createPreviewUrl(
          storedPhoto.blob,
        );

      setPhotos(
        (current) => {
          const old =
            current[kind];

          if (old?.url) {
            revokePreviewUrl(
              old.url,
            );
          }

          return {
            ...current,

            [kind]: {
              photo:
                storedPhoto,

              url,
            },
          };
        },
      );
    } catch (error) {
      console.error(
        "Failed to save photo:",
        error,
      );

      setError(
        "ذخیره تصویر انجام نشد.",
      );
    } finally {
      setSavingKind(
        null,
      );
    }
  }

  /**
   * تکمیل مرحله Capture.
   */
  async function handleReady() {
    if (!isComplete) {
      setError(
        "ابتدا تمام پوزیشن‌های الزامی را ثبت کنید.",
      );

      return;
    }

    try {
      setSubmitting(
        true,
      );

      setError(null);

      await updateCaseStatus(
        caseId,
        "queued",
      );

      router.push(
        "/queue",
      );
    } catch (error) {
      console.error(
        "Failed to queue case:",
        error,
      );

      setError(
        "قرار دادن Case در صف ارسال انجام نشد.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  if (loading) {
    return (
      <div
        className="
          flex
          min-h-[70vh]
          items-center
          justify-center
        "
      >
        <LoaderCircle
          className="
            animate-spin
            text-sky-700
          "
          size={28}
        />
      </div>
    );
  }

  if (!airwayCase) {
    return (
      <div className="p-5">
        <div
          className="
            rounded-2xl
            bg-red-50
            p-4
            text-sm
            leading-6
            text-red-700
          "
        >
          {error ??
            "Case پیدا نشد."}
        </div>
      </div>
    );
  }

  const progress =
    requiredCount === 0
      ? 0
      : (completedRequired /
          requiredCount) *
        100;

  return (
    <div
      className="
        px-4
        pb-8
        pt-5
      "
    >
      {/* ------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------ */}

      <header>
        <div
          className="
            flex
            items-center
            justify-between
            gap-4
          "
        >
          <button
            type="button"
            aria-label="بازگشت"
            onClick={() =>
              router.back()
            }
            className="
              flex
              size-10
              items-center
              justify-center
              rounded-xl
              border
              border-slate-200
              bg-white
              text-slate-700
              transition
              active:scale-95
            "
          >
            <ArrowRight
              size={19}
            />
          </button>

          <NetworkPill />
        </div>

        <div className="mt-5">
          <p
            className="
              text-xs
              font-semibold
              text-sky-700
            "
          >
            مرحله تصویربرداری
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            پروتکل تصویربرداری
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-7
              text-slate-500
            "
          >
            برای هر پوزیشن یک تصویر
            استاندارد ثبت کنید. کیفیت
            فنی تصویر هنگام
            تصویربرداری بررسی می‌شود.
          </p>

          <p
            className="
              mt-2
              text-xs
              text-slate-400
            "
          >
            Case:{" "}
            <span
              className="
                font-bold
                text-slate-600
              "
            >
              {
                airwayCase.caseCode
              }
            </span>
          </p>
        </div>
      </header>

      {/* ------------------------------------------------ */}
      {/* Capture progress */}
      {/* ------------------------------------------------ */}

      <section
        className="
          mt-6
          rounded-3xl
          border
          border-slate-200
          bg-white
          p-4
          shadow-sm
        "
      >
        <div
          className="
            flex
            items-center
            justify-between
            gap-4
          "
        >
          <div
            className="
              flex
              items-center
              gap-2
            "
          >
            <Images
              size={20}
              className="text-sky-700"
            />

            <div>
              <p
                className="
                  text-sm
                  font-bold
                  text-slate-900
                "
              >
                پوزیشن‌های الزامی
              </p>

              <p
                className="
                  mt-0.5
                  text-[11px]
                  text-slate-400
                "
              >
                {
                  CAPTURE_PROTOCOL.length
                }{" "}
                پوزیشن تعریف شده
              </p>
            </div>
          </div>

          <span
            className="
              text-base
              font-bold
              text-sky-700
            "
          >
            {completedRequired}
            {" / "}
            {requiredCount}
          </span>
        </div>

        <div
          className="
            mt-4
            h-2
            overflow-hidden
            rounded-full
            bg-slate-100
          "
        >
          <div
            className="
              h-full
              rounded-full
              bg-sky-600
              transition-all
              duration-300
            "
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        {isComplete && (
          <div
            className="
              mt-4
              flex
              items-center
              gap-2
              rounded-xl
              bg-emerald-50
              px-3
              py-2.5
              text-xs
              font-medium
              text-emerald-700
            "
          >
            <CheckCircle2
              size={17}
            />

            تمام تصاویر الزامی ثبت
            شده‌اند.
          </div>
        )}
      </section>

      {/* ------------------------------------------------ */}
      {/* Capture positions */}
      {/* ------------------------------------------------ */}

      <div
        className="
          mt-4
          space-y-4
        "
      >
        {CAPTURE_PROTOCOL.map(
          (
            step,
            index,
          ) => (
            <PhotoCard
              key={
                step.kind
              }
              step={step}
              positionIndex={
                index + 1
              }
              totalPositions={
                CAPTURE_PROTOCOL.length
              }
              photoUrl={
                photos[
                  step.kind
                ]?.url
              }
              disabled={
                savingKind !==
                  null ||
                submitting
              }
              onPhotoSelected={(
                image,
              ) =>
                handlePhoto(
                  step.kind,
                  image,
                )
              }
            />
          ),
        )}
      </div>

      {/* ------------------------------------------------ */}
      {/* Saving state */}
      {/* ------------------------------------------------ */}

      {savingKind && (
        <div
          className="
            mt-4
            flex
            items-center
            gap-2
            rounded-2xl
            bg-sky-50
            p-4
            text-sm
            text-sky-700
          "
        >
          <LoaderCircle
            className="animate-spin"
            size={18}
          />

          در حال ذخیره تصویر روی
          دستگاه...
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* Offline info */}
      {/* ------------------------------------------------ */}

      <div
        className="
          mt-4
          flex
          gap-3
          rounded-2xl
          bg-amber-50
          p-4
        "
      >
        <CloudOff
          size={20}
          className="
            mt-0.5
            shrink-0
            text-amber-700
          "
        />

        <p
          className="
            text-xs
            leading-6
            text-amber-800
          "
        >
          تمام تصاویر ابتدا به‌صورت
          محلی روی دستگاه ذخیره
          می‌شوند. برای تصویربرداری
          نیازی به اتصال لحظه‌ای به
          اینترنت نیست.
        </p>
      </div>

      {/* ------------------------------------------------ */}
      {/* Error */}
      {/* ------------------------------------------------ */}

      {error && (
        <div
          role="alert"
          className="
            mt-4
            rounded-2xl
            bg-red-50
            p-4
            text-sm
            leading-6
            text-red-700
          "
        >
          {error}
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* Complete */}
      {/* ------------------------------------------------ */}

      <button
        type="button"
        onClick={
          handleReady
        }
        disabled={
          !isComplete ||
          submitting ||
          savingKind !== null
        }
        className="
          mt-5
          flex
          min-h-14
          w-full
          items-center
          justify-center
          gap-2
          rounded-2xl
          bg-emerald-600
          px-5
          font-bold
          text-white
          transition
          hover:bg-emerald-700
          disabled:cursor-not-allowed
          disabled:bg-slate-300
          active:scale-[0.99]
        "
      >
        {submitting ? (
          <LoaderCircle
            className="animate-spin"
            size={20}
          />
        ) : (
          <CheckCircle2
            size={20}
          />
        )}

        {submitting
          ? "در حال ذخیره..."
          : "تکمیل ثبت تصاویر"}
      </button>
    </div>
  );
}