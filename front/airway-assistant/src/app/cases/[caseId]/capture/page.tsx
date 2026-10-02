"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Images,
  LoaderCircle,
} from "lucide-react";

import { NetworkPill } from "@/components/app-shell/network-pill";

import { PhotoCard } from "@/components/capture/photo-card";

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
  ] = useState<
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
  ] = useState(true);

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
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const loadData =
    useCallback(async () => {
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
        setError(
          "Case موردنظر پیدا نشد.",
        );

        setLoading(false);

        return;
      }

      setAirwayCase(
        loadedCase,
      );

      const previews: Partial<
        Record<
          CaptureKind,
          PhotoPreview
        >
      > = {};

      for (
        const photo of
        storedPhotos
      ) {
        previews[
          photo.kind
        ] = {
          photo,

          url:
            URL.createObjectURL(
              photo.blob,
            ),
        };
      }

      setPhotos(
        previews,
      );

      setLoading(false);
    }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

useEffect(() => {
  return () => {
    Object.values(
      photos,
    ).forEach(
      (preview) => {
        if (preview?.url) {
          URL.revokeObjectURL(
            preview.url,
          );
        }
      },
    );
  };
}, [photos]);

  const completedRequired =
    useMemo(() => {
      return CAPTURE_PROTOCOL.filter(
        (step) =>
          step.required,
      ).filter(
        (step) =>
          Boolean(
            photos[
              step.kind
            ],
          ),
      ).length;
    }, [photos]);

  const requiredCount =
    CAPTURE_PROTOCOL.filter(
      (step) =>
        step.required,
    ).length;

  const isComplete =
    completedRequired ===
    requiredCount;

  async function handlePhoto(
    kind: CaptureKind,
    file: File,
  ) {
    setError(null);

    setSavingKind(kind);

    try {
      const storedPhoto =
        await savePhoto(
          caseId,
          kind,
          file,
        );

      const url =
        URL.createObjectURL(
          storedPhoto.blob,
        );

      setPhotos(
        (current) => {
          const old =
            current[kind];

          if (old?.url) {
            URL.revokeObjectURL(
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
      console.error(error);

      setError(
        "ذخیره تصویر انجام نشد.",
      );
    } finally {
      setSavingKind(
        null,
      );
    }
  }

  async function handleReady() {
    if (!isComplete) {
      setError(
        "ابتدا تمام تصاویر الزامی را ثبت کنید.",
      );

      return;
    }

    try {
      setSubmitting(true);

      setError(null);

      await updateCaseStatus(
        caseId,
        "queued",
      );

      router.push(
        "/queue",
      );
    } catch (error) {
      console.error(error);

      setError(
        "قرار دادن Case در صف انجام نشد.",
      );
    } finally {
      setSubmitting(false);
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
            text-red-700
          "
        >
          {error ??
            "Case پیدا نشد."}
        </div>
      </div>
    );
  }

  return (
    <div
      className="
        px-4
        pb-8
        pt-5
      "
    >
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
            "
          >
            <ArrowLeft
              className="rotate-180"
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
            مرحله ۲ از ۲
          </p>

     <h1
  className="
    mt-1
    text-2xl
    font-bold
    text-slate-950
  "
>
  تصویربرداری استاندارد
</h1>

          <p
            className="
              mt-2
              text-sm
              text-slate-500
            "
          >
            Case:{" "}
            <span
              className="
                font-bold
                text-slate-700
              "
            >
              {
                airwayCase.caseCode
              }
            </span>
          </p>
        </div>
      </header>

      <section
        className="
          mt-6
          rounded-2xl
          border
          border-slate-200
          bg-white
          p-4
        "
      >
        <div
          className="
            flex
            items-center
            justify-between
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
              size={19}
              className="text-sky-700"
            />

            <p
              className="
                text-sm
                font-bold
                text-slate-900
              "
            >
              تصاویر الزامی
            </p>
          </div>

          <span
            className="
              text-sm
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
            mt-3
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
            "
            style={{
              width: `${
                requiredCount ===
                0
                  ? 0
                  : (completedRequired /
                      requiredCount) *
                    100
              }%`,
            }}
          />
        </div>
      </section>

      <div
        className="
          mt-4
          space-y-4
        "
      >
        {CAPTURE_PROTOCOL.map(
          (step) => (
            <PhotoCard
              key={step.kind}
              step={step}
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
                file,
              ) =>
                handlePhoto(
                  step.kind,
                  file,
                )
              }
            />
          ),
        )}
      </div>

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
          تصاویر ابتدا در حافظه
          محلی برنامه ذخیره می‌شوند؛
          بنابراین برای ثبت تصاویر
          نیازی به اتصال لحظه‌ای به
          اینترنت نیست.
        </p>
      </div>

      {error && (
        <div
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
          : "آماده برای تحلیل"}
      </button>
    </div>
  );
}