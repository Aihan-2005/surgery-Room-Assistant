import {
  getCase,
  getPhotosByCase,
  updateCaseStatus,
} from "@/lib/db/database";

import type {
  AirwayCase,
  StoredPhoto,
} from "@/lib/domain/types";

import type {
  CaseSyncResponse,
} from "@/lib/api/contracts";

import {
  ensureOperatorRegistered,
  OperatorDeviceError,
  recoverOperatorDevice,
} from "@/lib/profile/operator-profile";


export class CaseSyncError
  extends Error {
  code:
    string;

  status?:
    number;

  constructor(
    message:
      string,

    code =
      "SYNC_FAILED",

    status?:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "CaseSyncError";

    this.code =
      code;

    this.status =
      status;
  }
}


/*
 * هر Case در هر لحظه فقط یک upload واقعی دارد.
 */
const inFlightCaseSyncs =
  new Map<
    string,
    Promise<CaseSyncResponse>
  >();


export function isCaseSyncInFlight(
  caseId:
    string,
) {
  return inFlightCaseSyncs
    .has(
      caseId,
    );
}


async function readResponse(
  response:
    Response,
): Promise<CaseSyncResponse> {
  try {
    return (
      await response.json()
    ) as
      CaseSyncResponse;
  } catch {
    return {
      success:
        false,

      code:
        "INVALID_RESPONSE",

      message:
        "پاسخ سرور معتبر نیست.",
    };
  }
}


async function ensureSuccess(
  response:
    Response,
) {
  const result =
    await readResponse(
      response,
    );

  if (
    !response.ok ||
    !result.success
  ) {
    throw new CaseSyncError(
      result.success
        ? "ارسال ناموفق بود."
        : result.message,

      result.success
        ? "SYNC_FAILED"
        : result.code,

      response.status,
    );
  }

  return result;
}


function convertDeviceError(
  error:
    unknown,

  fallbackMessage:
    string,
): CaseSyncError {
  if (
    error instanceof
      OperatorDeviceError
  ) {
    return new CaseSyncError(
      error.message,

      error.code,

      error.status,
    );
  }

  if (
    error instanceof
      CaseSyncError
  ) {
    return error;
  }

  return new CaseSyncError(
    error instanceof
      Error
      ? error.message
      : fallbackMessage,

    "DEVICE_OPERATION_FAILED",

    503,
  );
}


/*
 * فقط خطاهایی که با گذشت زمان یا برگشت
 * شبکه احتمال حل شدن دارند queued می‌شوند.
 *
 * خطای Recovery/Disabled عمداً retry
 * خودکار بی‌نهایت نمی‌شود.
 */
function isRetryableError(
  error:
    unknown,
) {
  if (
    !(
      error instanceof
      CaseSyncError
    )
  ) {
    return true;
  }

  if (
    error.code ===
      "BACKEND_NOT_CONFIGURED" ||
    error.code ===
      "BACKEND_UNAVAILABLE" ||
    error.code ===
      "BACKEND_UNREACHABLE" ||
    error.code ===
      "SYNC_GATEWAY_ERROR" ||
    error.code ===
      "PHOTO_NETWORK_ERROR" ||
    error.code ===
      "NETWORK_ERROR"
  ) {
    return true;
  }

  if (
    error.status ===
      408 ||
    error.status ===
      425 ||
    error.status ===
      429
  ) {
    return true;
  }

  return (
    typeof error.status ===
      "number" &&
    error.status >=
      500
  );
}


/* -------------------------------------------------------------------------- */
/* Device token                                                               */
/* -------------------------------------------------------------------------- */

async function getDeviceToken() {
  try {
    /*
     * این تابع:
     *
     * - اولین registration را انجام می‌دهد
     * - recovery_key را برای نصب‌های قدیمی می‌گیرد
     * - اگر token وجود ندارد ولی recoveryKey هست،
     *   همان Device را recover می‌کند
     *
     * ولی هرگز UUID جدید نمی‌سازد.
     */
    const profile =
      await ensureOperatorRegistered();

    if (
      !profile.deviceToken
    ) {
      throw new OperatorDeviceError(
        "Device token موجود نیست.",

        "DEVICE_TOKEN_REQUIRED",

        401,
      );
    }

    return profile.deviceToken;
  } catch (
    error
  ) {
    throw convertDeviceError(
      error,
      "آماده‌سازی Device انجام نشد.",
    );
  }
}


async function recoverDeviceToken() {
  try {
    /*
     * فقط همین Device recover می‌شود.
     *
     * UUID ثابت می‌ماند.
     */
    const profile =
      await recoverOperatorDevice();

    if (
      !profile.deviceToken
    ) {
      throw new OperatorDeviceError(
        "Token جدید دریافت نشد.",

        "DEVICE_TOKEN_MISSING",
      );
    }

    return profile.deviceToken;
  } catch (
    error
  ) {
    throw convertDeviceError(
      error,
      "بازیابی Device انجام نشد.",
    );
  }
}


/* -------------------------------------------------------------------------- */
/* One complete upload attempt                                                */
/* -------------------------------------------------------------------------- */

async function uploadAttempt(
  airwayCase:
    AirwayCase,

  photos:
    StoredPhoto[],

  token:
    string,
): Promise<CaseSyncResponse> {
  /*
   * 1. Assessment metadata
   */
  const metadataResponse =
    await fetch(
      "/api/sync/cases",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Device-Token":
            token,
        },

        body:
          JSON.stringify({
            case:
              airwayCase,
          }),

        cache:
          "no-store",
      },
    );

  await ensureSuccess(
    metadataResponse,
  );


  /*
   * 2. تصاویر یکی‌یکی
   *
   * عمدی است که parallel نیست:
   *
   * - RAM کمتر
   * - فشار کمتر روی Backend
   * - پایدارتر روی موبایل
   * - recovery ساده‌تر
   */
  for (
    const photo of
    photos
  ) {
    const form =
      new FormData();

    form.append(
      "kind",
      photo.kind,
    );

    form.append(
      "image",
      photo.blob,
      photo.filename,
    );

    const response =
      await fetch(
        `/api/sync/cases/${encodeURIComponent(
          airwayCase.id,
        )}/photos/${encodeURIComponent(
          photo.id,
        )}`,
        {
          method:
            "PUT",

          headers: {
            "X-Device-Token":
              token,
          },

          body:
            form,

          cache:
            "no-store",
        },
      );

    await ensureSuccess(
      response,
    );
  }


  /*
   * 3. Complete
   */
  const completeResponse =
    await fetch(
      `/api/sync/cases/${encodeURIComponent(
        airwayCase.id,
      )}/complete`,
      {
        method:
          "POST",

        headers: {
          "X-Device-Token":
            token,
        },

        cache:
          "no-store",
      },
    );

  return ensureSuccess(
    completeResponse,
  );
}


/* -------------------------------------------------------------------------- */
/* Case sync                                                                  */
/* -------------------------------------------------------------------------- */

async function syncCaseInternal(
  caseId:
    string,
): Promise<CaseSyncResponse> {
  const airwayCase =
    await getCase(
      caseId,
    );

  if (!airwayCase) {
    throw new CaseSyncError(
      "Case پیدا نشد.",

      "CASE_NOT_FOUND",
    );
  }


  const photos =
    await getPhotosByCase(
      caseId,
    );

  if (
    photos.length ===
    0
  ) {
    await updateCaseStatus(
      caseId,
      "failed",
    );

    throw new CaseSyncError(
      "هیچ تصویری برای ارسال وجود ندارد.",

      "NO_PHOTOS",
    );
  }


  await updateCaseStatus(
    caseId,
    "syncing",
  );


  try {
    /*
     * Token فعلی یا registration اولیه.
     */
    let token =
      await getDeviceToken();


    try {
      const result =
        await uploadAttempt(
          airwayCase,
          photos,
          token,
        );

      await updateCaseStatus(
        caseId,
        "synced",
      );

      return result;
    } catch (
      firstError
    ) {
      /*
       * مهم‌ترین بخش Recovery:
       *
       * فقط 401 باعث recovery می‌شود.
       *
       * 403 به معنی disabled بودن Device است
       * و هرگز recover/register خودکار نمی‌شود.
       */
      if (
        firstError instanceof
          CaseSyncError &&
        firstError.status ===
          401
      ) {
        /*
         * فقط یک بار recovery.
         *
         * اگر retry دوم هم 401 بدهد،
         * دیگر recovery دوم انجام نمی‌دهیم.
         */
        token =
          await recoverDeviceToken();

        /*
         * همان AirwayCase object
         * همان airwayCase.id
         * همان photo.idها
         *
         * هیچ UUID جدیدی تولید نمی‌شود.
         */
        const result =
          await uploadAttempt(
            airwayCase,
            photos,
            token,
          );

        await updateCaseStatus(
          caseId,
          "synced",
        );

        return result;
      }

      /*
       * 403 یا هر خطای دیگر.
       */
      throw firstError;
    }
  } catch (
    error
  ) {
    if (
      isRetryableError(
        error,
      )
    ) {
      /*
       * شبکه / Backend موقتاً unavailable.
       *
       * AutoSync بعداً دوباره تلاش می‌کند.
       */
      await updateCaseStatus(
        caseId,
        "queued",
      );
    } else {
      /*
       * مواردی مثل:
       *
       * DEVICE_DISABLED
       * DEVICE_RECOVERY_REQUIRED
       * DEVICE_RECOVERY_FAILED
       * second 401
       *
       * در Queue باقی می‌مانند چون صفحه Queue
       * failed را هم نمایش می‌دهد، ولی AutoSync
       * بی‌نهایت Backend را hammer نمی‌کند.
       */
      await updateCaseStatus(
        caseId,
        "failed",
      );
    }


    if (
      error instanceof
        CaseSyncError
    ) {
      throw error;
    }


    throw new CaseSyncError(
      error instanceof
        Error
        ? error.message
        : "ارسال Case انجام نشد.",

      "NETWORK_ERROR",
    );
  }
}


export function syncCase(
  caseId:
    string,
): Promise<CaseSyncResponse> {
  /*
   * اگر همین Case همین الآن در حال sync است،
   * Promise موجود را برگردان.
   */
  const existing =
    inFlightCaseSyncs
      .get(
        caseId,
      );

  if (existing) {
    return existing;
  }


  const task =
    syncCaseInternal(
      caseId,
    ).finally(
      () => {
        if (
          inFlightCaseSyncs
            .get(
              caseId,
            ) ===
          task
        ) {
          inFlightCaseSyncs
            .delete(
              caseId,
            );
        }
      },
    );


  inFlightCaseSyncs.set(
    caseId,
    task,
  );

  return task;
}