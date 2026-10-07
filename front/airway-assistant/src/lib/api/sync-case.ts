import {
  getCase,
  getPhotosByCase,
  updateCaseStatus,
} from "@/lib/db/database";

import {
  buildCaseFormData,
} from "@/lib/api/build-case-form-data";

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
    !(error instanceof
      CaseSyncError)
  ) {
    return true;
  }

  if (
    error.code ===
      "BACKEND_NOT_CONFIGURED" ||
    error.code ===
      "SYNC_GATEWAY_ERROR"
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

  if (
    typeof error.status ===
      "number" &&
    error.status >=
      500
  ) {
    return true;
  }

  return false;
}

export async function syncCase(
  caseId:
    string,
): Promise<CaseSyncResponse> {
  const operator =
    getOperatorProfile();

  if (!operator) {
    throw new CaseSyncError(
      "پزشک در Backend ثبت نشده است.",
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
    const body =
      buildCaseFormData(
        airwayCase,
        photos,
      );

    const response =
      await fetch(
        "/api/sync/cases",
        {
          method:
            "POST",

          headers: {
            "X-Device-Token":
              operator.deviceToken,
          },

          body,

          cache:
            "no-store",
        },
      );

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
          ? "ارسال Case ناموفق بود."
          : result.message,

        result.success
          ? "SYNC_FAILED"
          : result.code,

        response.status,
      );
    }

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

