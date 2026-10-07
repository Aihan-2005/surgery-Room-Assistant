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

export class CaseSyncError extends Error {
  code: string;

  status?: number;

  constructor(
    message: string,
    code = "SYNC_FAILED",
    status?: number,
  ) {
    super(message);

    this.name =
      "CaseSyncError";

    this.code =
      code;

    this.status =
      status;
  }
}

async function readResponse(
  response: Response,
): Promise<CaseSyncResponse> {
  try {
    return (
      await response.json()
    ) as CaseSyncResponse;
  } catch {
    return {
      success: false,

      code:
        "INVALID_RESPONSE",

      message:
        "پاسخ سرور معتبر نیست.",
    };
  }
}

export async function syncCase(
  caseId: string,
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
          method: "POST",

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
      const message =
        result.success
          ? "ارسال Case ناموفق بود."
          : result.message;

      const code =
        result.success
          ? "SYNC_FAILED"
          : result.code;

      throw new CaseSyncError(
        message,
        code,
        response.status,
      );
    }

    await updateCaseStatus(
      caseId,
      "synced",
    );

    return result;
  } catch (error) {
    await updateCaseStatus(
      caseId,
      "failed",
    );

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
    );
  }
}

 