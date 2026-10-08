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
  getOperatorProfile,
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

async function readResponse(
  response:
    Response,
): Promise<CaseSyncResponse> {
  try {
    return (
      await response.json()
    ) as CaseSyncResponse;
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
      "SYNC_GATEWAY_ERROR" ||
    error.code ===
      "PHOTO_NETWORK_ERROR" ||
    error.code ===
      "DEVICE_NOT_REGISTERED" ||
    error.code ===
      "DEVICE_TOKEN_REQUIRED" ||
    error.code ===
      "DEVICE_UNAUTHORIZED" ||
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

async function getDeviceToken(
  force:
    boolean,
) {
  let profile =
    getOperatorProfile();

  if (!profile) {
    throw new CaseSyncError(
      "مشخصات پزشک روی دستگاه موجود نیست.",

      "OPERATOR_PROFILE_REQUIRED",
    );
  }

  if (
    force ||
    !profile.deviceToken
  ) {
    try {
      profile =
        await ensureOperatorRegistered(
          {
            force,
          },
        );
    } catch (
      error
    ) {
      throw new CaseSyncError(
        error instanceof Error
          ? error.message
          : "ثبت Device انجام نشد.",

        "DEVICE_NOT_REGISTERED",

        503,
      );
    }
  }

  if (
    !profile.deviceToken
  ) {
    throw new CaseSyncError(
      "Device token موجود نیست.",

      "DEVICE_NOT_REGISTERED",

      401,
    );
  }

  return profile.deviceToken;
}

async function uploadAttempt(
  airwayCase:
    AirwayCase,

  photos:
    StoredPhoto[],

  token:
    string,
): Promise<CaseSyncResponse> {
  /* ---------------------------------------------------------------------- */
  /* 1. Patient / Assessment metadata                                       */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* 2. Photos individually                                                 */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* 3. Complete                                                            */
  /* ---------------------------------------------------------------------- */

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

export async function syncCase(
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
    photos.length === 0
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
    let token =
      await getDeviceToken(
        false,
      );

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
       * Token قدیمی / حذف Device از سرور:
       * یک بار Device جدید ثبت می‌کنیم
       * و کل عملیات idempotent را retry می‌کنیم.
       */
      if (
        firstError instanceof
          CaseSyncError &&
        firstError.code ===
          "DEVICE_UNAUTHORIZED"
      ) {
        token =
          await getDeviceToken(
            true,
          );

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
      await updateCaseStatus(
        caseId,
        "queued",
      );
    } else {
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
      error instanceof Error
        ? error.message
        : "ارسال Case انجام نشد.",

      "NETWORK_ERROR",
    );
  }
}


