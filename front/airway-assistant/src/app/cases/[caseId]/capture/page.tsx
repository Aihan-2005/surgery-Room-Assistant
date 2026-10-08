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
  MAX_PHOTOS_PER_POSITION,
  MIN_PHOTOS_PER_REQUIRED_POSITION,
} from "@/lib/config/study-protocol";

import {
  getCase,
  getPhotosByCase,
  savePhoto,
} from "@/lib/db/database";

import {
  finalizeAndSyncCase,
} from "@/lib/sync/finalize-and-sync-case";

import type {
  AirwayCase,
  CaptureKind,
  PreparedImage,
  StoredPhoto,
} from "@/lib/domain/types";

interface PhotoPreview {
  photo:
    StoredPhoto;

  url:
    string;
}

type PhotosByKind =
  Partial<
    Record<
      CaptureKind,
      PhotoPreview[]
    >
  >;

export default function CapturePage() {
  const params =
    useParams<{
      caseId:
        string;
    }>();

  const router =
    useRouter();

  const caseId =
    params.caseId;

  const previewUrlsRef =
    useRef<
      Set<string>
    >(
      new Set(),
    );

  const [
    airwayCase,
    setAirwayCase,
  ] =
    useState<
      AirwayCase | null
    >(null);

  const [
    photos,
    setPhotos,
  ] =
    useState<
      PhotosByKind
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
    useState<
      CaptureKind | null
    >(null);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const createPreviewUrl =
    useCallback(
      (
        blob:
          Blob,
      ) => {
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

  const revokePreviewUrl =
    useCallback(
      (
        url:
          string,
      ) => {
        URL.revokeObjectURL(
          url,
        );

        previewUrlsRef.current.delete(
          url,
        );
      },
      [],
    );

  const loadData =
    useCallback(
      async () => {
        try {
          setLoading(
            true,
          );

          setError(
            null,
          );

          const [
            loadedCase,
            storedPhotos,
          ] =
            await Promise.all([
              getCase(
                caseId,
              ),

              getPhotosByCase(
                caseId,
              ),
            ]);

          if (
            !loadedCase
          ) {
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
            PhotosByKind = {};

          for (
            const photo of
            storedPhotos
          ) {
            const valid =
              CAPTURE_PROTOCOL.some(
                (
                  step,
                ) =>
                  step.kind ===
                  photo.kind,
              );

            if (
              !valid
            ) {
              continue;
            }

            const preview:
              PhotoPreview = {
              photo,

              url:
                createPreviewUrl(
                  photo.blob,
                ),
            };

            previews[
              photo.kind
            ] = [
              ...(previews[
                photo.kind
              ] ?? []),

              preview,
            ];
          }

          for (
            const kind of
            Object.keys(
              previews,
            ) as
              CaptureKind[]
          ) {
            previews[
              kind
            ]?.sort(
              (
                first,
                second,
              ) =>
                new Date(
                  first.photo.createdAt,
                ).getTime() -
                new Date(
                  second.photo.createdAt,
                ).getTime(),
            );
          }

          setPhotos(
            previews,
          );
        } catch (
          loadError
        ) {
          console.error(
            "Failed to load capture data:",
            loadError,
          );

          setError(
            "خواندن اطلاعات Case انجام نشد.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        caseId,
        createPreviewUrl,
      ],
    );

  useEffect(() => {
    void loadData();
  }, [
    loadData,
  ]);

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

  const requiredSteps =
    useMemo(
      () =>
        CAPTURE_PROTOCOL.filter(
          (
            step,
          ) =>
            step.required,
        ),
      [],
    );

  const requiredPhotoTotal =
    requiredSteps.length *
    MIN_PHOTOS_PER_REQUIRED_POSITION;

  const completedPhotoTotal =
    useMemo(
      () =>
        requiredSteps.reduce(
          (
            total,
            step,
          ) => {
            const count =
              photos[
                step.kind
              ]?.length ??
              0;

            return (
              total +
              Math.min(
                count,
                MIN_PHOTOS_PER_REQUIRED_POSITION,
              )
            );
          },
          0,
        ),
      [
        photos,
        requiredSteps,
      ],
    );

  const totalCapturedPhotos =
    useMemo(
      () =>
        Object.values(
          photos,
        ).reduce(
          (
            total,
            items,
          ) =>
            total +
            (
              items?.length ??
              0
            ),
          0,
        ),
      [
        photos,
      ],
    );

  const isComplete =
    requiredSteps.every(
      (
        step,
      ) =>
        (
          photos[
            step.kind
          ]?.length ??
          0
        ) >=
        MIN_PHOTOS_PER_REQUIRED_POSITION,
    );

  const remoteLocked =
    airwayCase
      ?.syncStatus ===
    "synced";

  const captureLocked =
    Boolean(
      airwayCase
        ?.preopLockedAt,
    );

  async function handlePhoto(
    kind:
      CaptureKind,

    image:
      PreparedImage,

    replacePhotoId?:
      string,
  ) {
    if (
      remoteLocked ||
      captureLocked
    ) {
      setError(
        "تصویربرداری این Case قبلاً تکمیل شده است.",
      );

      return;
    }

    const currentCount =
      photos[
        kind
      ]?.length ??
      0;

    if (
      !replacePhotoId &&
      currentCount >=
        MAX_PHOTOS_PER_POSITION
    ) {
      setError(
        `حداکثر ${MAX_PHOTOS_PER_POSITION} عکس برای هر پوزیشن مجاز است.`,
      );

      return;
    }

    setSavingKind(
      kind,
    );

    setError(
      null,
    );

    try {
      const storedPhoto =
        await savePhoto(
          caseId,
          kind,
          image,
          replacePhotoId,
        );

      const url =
        createPreviewUrl(
          storedPhoto.blob,
        );

      setPhotos(
        (
          current,
        ) => {
          const currentList =
            current[
              kind
            ] ??
            [];

          const replaced =
            replacePhotoId
              ? currentList.find(
                  (
                    item,
                  ) =>
                    item.photo.id ===
                    replacePhotoId,
                )
              : undefined;

          if (
            replaced
          ) {
            revokePreviewUrl(
              replaced.url,
            );
          }

          const nextList =
            replacePhotoId
              ? currentList.filter(
                  (
                    item,
                  ) =>
                    item.photo.id !==
                    replacePhotoId,
                )
              : currentList;

          return {
            ...current,

            [kind]: [
              ...nextList,

              {
                photo:
                  storedPhoto,

                url,
              },
            ].sort(
              (
                first,
                second,
              ) =>
                new Date(
                  first.photo.createdAt,
                ).getTime() -
                new Date(
                  second.photo.createdAt,
                ).getTime(),
            ),
          };
        },
      );

      const updatedCase =
        await getCase(
          caseId,
        );

      if (
        updatedCase
      ) {
        setAirwayCase(
          updatedCase,
        );
      }
    } catch (
      saveError
    ) {
      console.error(
        "Failed to save photo:",
        saveError,
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

  async function handleReady() {
    if (
      !isComplete
    ) {
      setError(
        `برای هر یک از ${requiredSteps.length} پوزیشن، حداقل ${MIN_PHOTOS_PER_REQUIRED_POSITION} عکس ثبت کنید.`,
      );

      return;
    }

    try {
      setSubmitting(
        true,
      );

      setError(
        null,
      );

      const result =
        await finalizeAndSyncCase(
          caseId,
        );

      if (
        result.state ===
        "synced"
      ) {
        router.replace(
          "/cases",
        );

        return;
      }

      router.replace(
        "/queue",
      );
    } catch (
      readyError
    ) {
      console.error(
        "Failed to finalize capture:",
        readyError,
      );

      setError(
        "تکمیل تصویربرداری انجام نشد.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  if (
    loading
  ) {
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
          size={28}
          className="
            animate-spin
            text-sky-700
          "
        />
      </div>
    );
  }

  if (
    !airwayCase
  ) {
    return (
      <div
        className="p-5"
      >
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

  const progress =
    requiredPhotoTotal ===
      0
      ? 0
      : (
          completedPhotoTotal /
          requiredPhotoTotal
        ) *
        100;

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
            "
          >
            <ArrowRight
              size={19}
            />
          </button>

          <NetworkPill />
        </div>

        <div
          className="mt-5"
        >
          <p
            className="
              text-xs
              font-semibold
              text-sky-700
            "
          >
            مرحله ۲
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            تصویربرداری
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-7
              text-slate-500
            "
          >
            هر ۶ پوزیشن را ثبت کنید.
            برای هر پوزیشن حداقل{" "}
            {
              MIN_PHOTOS_PER_REQUIRED_POSITION
            }{" "}
            و حداکثر{" "}
            {
              MAX_PHOTOS_PER_POSITION
            }{" "}
            عکس قابل ثبت است.
          </p>

          <p
            className="
              mt-2
              text-xs
              text-slate-400
            "
          >
            بیمار:{" "}
            <span
              className="
                font-bold
                text-slate-600
              "
            >
              {
                airwayCase
                  .clinical
                  .fullName
              }
            </span>
          </p>
        </div>
      </header>

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
              className="
                text-sky-700
              "
            />

            <p
              className="
                text-sm
                font-bold
                text-slate-900
              "
            >
              تکمیل پوزیشن‌ها
            </p>
          </div>

          <span
            className="
              text-base
              font-bold
              text-sky-700
            "
          >
            {
              completedPhotoTotal
            }
            {" / "}
            {
              requiredPhotoTotal
            }
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
            "
            style={{
              width:
                `${progress}%`,
            }}
          />
        </div>

        <p
          className="
            mt-3
            text-xs
            text-slate-500
          "
        >
          مجموع عکس‌های ثبت‌شده:{" "}
          <strong>
            {
              totalCapturedPhotos
            }
          </strong>
        </p>

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
              text-emerald-700
            "
          >
            <CheckCircle2
              size={17}
            />

            هر ۶ پوزیشن تکمیل شده‌اند.
            در صورت نیاز می‌توانید قبل
            از نهایی‌سازی عکس‌های بیشتری
            اضافه کنید.
          </div>
        )}
      </section>

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
              step={
                step
              }
              positionIndex={
                index + 1
              }
              totalPositions={
                CAPTURE_PROTOCOL.length
              }
              requiredPhotoCount={
                MIN_PHOTOS_PER_REQUIRED_POSITION
              }
              maxPhotoCount={
                MAX_PHOTOS_PER_POSITION
              }
              photos={(
                photos[
                  step.kind
                ] ??
                []
              ).map(
                (
                  item,
                ) => ({
                  id:
                    item.photo.id,

                  url:
                    item.url,
                }),
              )}
              disabled={
                savingKind !==
                  null ||
                submitting ||
                remoteLocked ||
                captureLocked
              }
              onPhotoSelected={(
                image,
                replaceId,
              ) =>
                handlePhoto(
                  step.kind,
                  image,
                  replaceId,
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
            size={18}
            className="
              animate-spin
            "
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
          در حالت آفلاین تصاویر داخل
          IndexedDB ذخیره می‌شوند.
          بعد از تکمیل، Case در صف باقی
          می‌ماند و در زمان مناسب به
          Backend ارسال می‌شود.
        </p>
      </div>

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
          {
            error
          }
        </div>
      )}

      {!captureLocked && (
        <button
          type="button"
          onClick={
            handleReady
          }
          disabled={
            !isComplete ||
            submitting ||
            savingKind !==
              null ||
            remoteLocked
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
            disabled:bg-slate-300
          "
        >
          {submitting ? (
            <LoaderCircle
              size={20}
              className="
                animate-spin
              "
            />
          ) : (
            <CheckCircle2
              size={20}
            />
          )}

          {submitting
            ? "در حال نهایی‌سازی..."
            : "تکمیل تصویربرداری و ارسال"}
        </button>
      )}

      {captureLocked && (
        <button
          type="button"
          onClick={() =>
            router.push(
              "/queue",
            )
          }
          className="
            mt-5
            flex
            min-h-14
            w-full
            items-center
            justify-center
            rounded-2xl
            bg-sky-700
            px-5
            font-bold
            text-white
          "
        >
          مشاهده صف ارسال
        </button>
      )}
    </div>
  );
}