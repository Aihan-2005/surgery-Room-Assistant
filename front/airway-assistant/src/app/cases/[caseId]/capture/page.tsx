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
  MIN_TOTAL_PHOTOS,
} from "@/lib/config/study-protocol";

import {
  deletePhoto,
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
    useState(
      true,
    );

  const [
    savingKind,
    setSavingKind,
  ] =
    useState<
      CaptureKind | null
    >(null);

  const [
    deletingPhotoId,
    setDeletingPhotoId,
  ] =
    useState<
      string | null
    >(null);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  /* ---------------------------------------------------------------------- */
  /* Preview URLs                                                           */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* Load                                                                   */
  /* ---------------------------------------------------------------------- */

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

          /*
           * URLهای Preview قدیمی در صورت reload داخلی
           * آزاد شوند.
           */
          for (
            const url of
            previewUrlsRef.current
          ) {
            URL.revokeObjectURL(
              url,
            );
          }

          previewUrlsRef.current.clear();

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

  /* ---------------------------------------------------------------------- */
  /* Counts                                                                 */
  /* ---------------------------------------------------------------------- */

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

  const photographedPositions =
    useMemo(
      () =>
        Object.values(
          photos,
        ).filter(
          (
            items,
          ) =>
            (
              items?.length ??
              0
            ) >
            0,
        ).length,
      [
        photos,
      ],
    );

  /*
   * فقط یک عکس در کل Case کافی است.
   */
  const isReady =
    totalCapturedPhotos >=
    MIN_TOTAL_PHOTOS;

  const remoteLocked =
    airwayCase
      ?.syncStatus ===
    "synced";

  const captureLocked =
    Boolean(
      airwayCase
        ?.preopLockedAt,
    );

  const busy =
    savingKind !==
      null ||
    deletingPhotoId !==
      null ||
    submitting;

  /* ---------------------------------------------------------------------- */
  /* Save / replace                                                         */
  /* ---------------------------------------------------------------------- */

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
        `برای هر پوزیشن حداکثر ${MAX_PHOTOS_PER_POSITION} عکس قابل ثبت است.`,
      );

      return;
    }

    try {
      setSavingKind(
        kind,
      );

      setError(
        null,
      );

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

      const message =
        saveError instanceof
          Error
          ? saveError.message
          : "";

      if (
        message ===
        "MAX_PHOTOS_PER_POSITION_REACHED"
      ) {
        setError(
          `برای هر پوزیشن حداکثر ${MAX_PHOTOS_PER_POSITION} عکس قابل ثبت است.`,
        );
      } else {
        setError(
          "ذخیره تصویر انجام نشد.",
        );
      }

      throw saveError;
    } finally {
      setSavingKind(
        null,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Delete                                                                 */
  /* ---------------------------------------------------------------------- */

  async function handleDeletePhoto(
    kind:
      CaptureKind,

    photoId:
      string,
  ) {
    if (
      remoteLocked ||
      captureLocked
    ) {
      setError(
        "Case نهایی شده و دیگر امکان حذف تصویر وجود ندارد.",
      );

      return;
    }

    try {
      setDeletingPhotoId(
        photoId,
      );

      setError(
        null,
      );

      await deletePhoto(
        photoId,
      );

      setPhotos(
        (
          current,
        ) => {
          const list =
            current[
              kind
            ] ??
            [];

          const deleted =
            list.find(
              (
                item,
              ) =>
                item.photo.id ===
                photoId,
            );

          if (
            deleted
          ) {
            revokePreviewUrl(
              deleted.url,
            );
          }

          const next =
            list.filter(
              (
                item,
              ) =>
                item.photo.id !==
                photoId,
            );

          return {
            ...current,

            [kind]:
              next,
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
      deleteError
    ) {
      console.error(
        "Failed to delete photo:",
        deleteError,
      );

      setError(
        "حذف تصویر انجام نشد.",
      );

      throw deleteError;
    } finally {
      setDeletingPhotoId(
        null,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Finalize                                                               */
  /* ---------------------------------------------------------------------- */

  async function handleReady() {
    if (
      totalCapturedPhotos <
      MIN_TOTAL_PHOTOS
    ) {
      setError(
        "برای تکمیل Case حداقل یک عکس از یکی از پوزیشن‌ها ثبت کنید.",
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

      const message =
        readyError instanceof
          Error
          ? readyError.message
          : "";

      if (
        message ===
        "MINIMUM_PHOTOS_REQUIRED"
      ) {
        setError(
          "برای تکمیل Case حداقل یک عکس ثبت کنید.",
        );
      } else {
        setError(
          "تکمیل تصویربرداری انجام نشد.",
        );
      }
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Loading                                                                */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

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
            هیچ پوزیشن خاصی اجباری
            نیست. برای تکمیل Case حداقل
            یک عکس از هر پوزیشن دلخواه
            ثبت کنید. برای هر پوزیشن
            حداکثر{" "}
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

      {/* Summary */}

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
              تصاویر ثبت‌شده
            </p>
          </div>

          <span
            className="
              text-xl
              font-bold
              text-sky-700
            "
          >
            {
              totalCapturedPhotos
            }
          </span>
        </div>

        <div
          className="
            mt-4
            grid
            grid-cols-2
            gap-3
          "
        >
          <div
            className="
              rounded-2xl
              bg-slate-50
              p-3
            "
          >
            <p
              className="
                text-[11px]
                text-slate-500
              "
            >
              پوزیشن‌های دارای عکس
            </p>

            <p
              className="
                mt-1
                text-lg
                font-bold
                text-slate-900
              "
            >
              {
                photographedPositions
              }
            </p>
          </div>

          <div
            className="
              rounded-2xl
              bg-slate-50
              p-3
            "
          >
            <p
              className="
                text-[11px]
                text-slate-500
              "
            >
              حداقل لازم
            </p>

            <p
              className="
                mt-1
                text-lg
                font-bold
                text-slate-900
              "
            >
              {
                MIN_TOTAL_PHOTOS
              }{" "}
              عکس
            </p>
          </div>
        </div>

        {isReady ? (
          <div
            className="
              mt-4
              flex
              items-center
              gap-2
              rounded-xl
              bg-emerald-50
              px-3
              py-3
              text-xs
              leading-6
              text-emerald-700
            "
          >
            <CheckCircle2
              size={17}
              className="
                shrink-0
              "
            />

            حداقل عکس لازم ثبت شده است.
            در صورت نیاز می‌توانید عکس‌های
            بیشتری ثبت کنید یا عکس نامناسب
            را حذف کنید.
          </div>
        ) : (
          <div
            className="
              mt-4
              rounded-xl
              bg-amber-50
              px-3
              py-3
              text-xs
              leading-6
              text-amber-800
            "
          >
            برای فعال‌شدن ارسال، حداقل
            یک عکس از یکی از پوزیشن‌ها
            ثبت کنید.
          </div>
        )}
      </section>

      {/* Positions */}

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
                busy ||
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
              onPhotoDelete={(
                photoId,
              ) =>
                handleDeletePhoto(
                  step.kind,
                  photoId,
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

          در حال ذخیره تصویر روی دستگاه...
        </div>
      )}

      {deletingPhotoId && (
        <div
          className="
            mt-4
            flex
            items-center
            gap-2
            rounded-2xl
            bg-red-50
            p-4
            text-sm
            text-red-700
          "
        >
          <LoaderCircle
            size={18}
            className="
              animate-spin
            "
          />

          در حال حذف تصویر...
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
          عکس‌ها ابتدا داخل IndexedDB
          ذخیره می‌شوند. بنابراین قبل از
          نهایی‌سازی می‌توانید تصویر
          نامناسب را حذف یا دوباره ثبت
          کنید. در حالت آفلاین نیز تصاویر
          روی دستگاه باقی می‌مانند.
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
            !isReady ||
            busy ||
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

