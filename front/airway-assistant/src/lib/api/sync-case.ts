import {
  getCase,
  getPhotosByCase,
  updateCaseStatus,
} from "@/lib/db/database";

import type {
  CaseSyncResponse,
} from "@/lib/api/contracts";

import {
  getOperatorProfile,
} from "@/lib/profile/operator-profile";


export class CaseSyncError
  extends Error {
  code: string;

  status?: number;

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
      "DEVICE_UNAUTHORIZED"
  ) {
    return true;
  }

  if (
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429
  ) {
    return true;
  }

  if (
    typeof error.status ===
      "number" &&
    error.status >= 500
  ) {
    return true;
  }

  return false;
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


export async function syncCase(
  caseId:
    string,
): Promise<CaseSyncResponse> {
  const operator =
    getOperatorProfile();

  if (
    !operator ||
    !operator.deviceToken
  ) {
    throw new CaseSyncError(
      "Device هنوز در Backend ثبت نشده است.",

      "DEVICE_NOT_REGISTERED",

      401,
    );
  }

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
    /* -------------------------------------------------------------- */
    /* 1. Metadata                                                     */
    /* -------------------------------------------------------------- */

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
              operator.deviceToken,
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

    /* -------------------------------------------------------------- */
    /* 2. Photos one by one                                            */
    /* -------------------------------------------------------------- */

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

      const photoResponse =
        await fetch(
          `/api/sync/cases/${encodeURIComponent(
            caseId,
          )}/photos/${encodeURIComponent(
            photo.id,
          )}`,
          {
            method:
              "PUT",

            headers: {
              "X-Device-Token":
                operator.deviceToken,
            },

            body:
              form,

            cache:
              "no-store",
          },
        );

      await ensureSuccess(
        photoResponse,
      );
    }

    /* -------------------------------------------------------------- */
    /* 3. Complete                                                     */
    /* -------------------------------------------------------------- */

    const completeResponse =
      await fetch(
        `/api/sync/cases/${encodeURIComponent(
          caseId,
        )}/complete`,
        {
          method:
            "POST",

          headers: {
            "X-Device-Token":
              operator.deviceToken,
          },

          cache:
            "no-store",
        },
      );

    const result =
      await ensureSuccess(
        completeResponse,
      );

    await updateCaseStatus(
      caseId,
      "synced",
    );

    return result;
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