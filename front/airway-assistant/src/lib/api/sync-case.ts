import {
  getCase,
  getPhotosByCase,
  updateCaseStatus,
} from "@/lib/db/database";
import type { AirwayCase, StoredPhoto } from "@/lib/domain/types";
import type { CaseSyncResponse } from "@/lib/api/contracts";
import {
  ensureOperatorRegistered,
  OperatorDeviceError,
  recoverOperatorDevice,
} from "@/lib/profile/operator-profile";

export class CaseSyncError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code = "SYNC_FAILED", status?: number) {
    super(message);
    this.name = "CaseSyncError";
    this.code = code;
    this.status = status;
  }
}

/* Only one sync operation for a Case in the current browser tab. */
const inFlightCaseSyncs = new Map<string, Promise<CaseSyncResponse>>();

export function isCaseSyncInFlight(caseId: string) {
  return inFlightCaseSyncs.has(caseId);
}

async function readResponse(response: Response): Promise<CaseSyncResponse> {
  try {
    return (await response.json()) as CaseSyncResponse;
  } catch {
    return {
      success: false,
      code: "INVALID_RESPONSE",
      message: "پاسخ سرور معتبر نیست.",
    };
  }
}

async function ensureSuccess(response: Response): Promise<CaseSyncResponse> {
  const result = await readResponse(response);

  if (!response.ok || !result.success) {
    throw new CaseSyncError(
      result.success ? "ارسال ناموفق بود." : result.message,
      result.success ? "SYNC_FAILED" : result.code,
      response.status,
    );
  }

  return result;
}

function convertDeviceError(error: unknown, fallbackMessage: string): CaseSyncError {
  if (error instanceof OperatorDeviceError) {
    return new CaseSyncError(error.message, error.code, error.status);
  }

  if (error instanceof CaseSyncError) return error;

  return new CaseSyncError(
    error instanceof Error ? error.message : fallbackMessage,
    "DEVICE_OPERATION_FAILED",
    503,
  );
}

function isRetryableError(error: unknown) {
  if (!(error instanceof CaseSyncError)) return true;

  if (
    [
      "BACKEND_NOT_CONFIGURED",
      "BACKEND_UNAVAILABLE",
      "BACKEND_UNREACHABLE",
      "SYNC_GATEWAY_ERROR",
      "PHOTO_NETWORK_ERROR",
      "NETWORK_ERROR",
    ].includes(error.code)
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

  return typeof error.status === "number" && error.status >= 500;
}

async function getDeviceToken(): Promise<string> {
  try {
    const profile = await ensureOperatorRegistered();

    if (!profile.deviceToken) {
      throw new OperatorDeviceError(
        "Device token موجود نیست.",
        "DEVICE_TOKEN_REQUIRED",
        401,
      );
    }

    return profile.deviceToken;
  } catch (error) {
    throw convertDeviceError(error, "آماده‌سازی Device انجام نشد.");
  }
}

async function recoverDeviceToken(): Promise<string> {
  try {
    const profile = await recoverOperatorDevice();

    if (!profile.deviceToken) {
      throw new OperatorDeviceError(
        "Token جدید دریافت نشد.",
        "DEVICE_TOKEN_MISSING",
      );
    }

    return profile.deviceToken;
  } catch (error) {
    throw convertDeviceError(error, "بازیابی Device انجام نشد.");
  }
}

/** Keep the original case/photo IDs and upload order for safe retries. */
async function uploadAttempt(
  airwayCase: AirwayCase,
  photos: StoredPhoto[],
  token: string,
): Promise<CaseSyncResponse> {
  // 1. Metadata.
  const metadataResponse = await fetch("/api/sync/cases", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": token,
    },
    body: JSON.stringify({ case: airwayCase }),
    cache: "no-store",
  });
  await ensureSuccess(metadataResponse);

  // 2. Images, uploaded sequentially.
  for (const photo of photos) {
    const form = new FormData();
    form.append("kind", photo.kind);
    form.append("image", photo.blob, photo.filename);

    const response = await fetch(
      `/api/sync/cases/${encodeURIComponent(airwayCase.id)}/photos/${encodeURIComponent(photo.id)}`,
      {
        method: "PUT",
        headers: { "X-Device-Token": token },
        body: form,
        cache: "no-store",
      },
    );

    await ensureSuccess(response);
  }

  // 3. Mark the assessment completed in Django.
  const completed = await fetch(
    `/api/sync/cases/${encodeURIComponent(airwayCase.id)}/complete`,
    {
      method: "POST",
      headers: { "X-Device-Token": token },
      cache: "no-store",
    },
  );

  return ensureSuccess(completed);
}

async function syncCaseInternal(caseId: string): Promise<CaseSyncResponse> {
  const airwayCase = await getCase(caseId);

  if (!airwayCase) {
    throw new CaseSyncError("Case پیدا نشد.", "CASE_NOT_FOUND");
  }

  /*
   * IMPORTANT: A completed transfer is immutable.
   * Reject before reading images, touching the Device token,
   * changing status, or making any HTTP request.
   */
  if (airwayCase.syncStatus === "synced") {
    throw new CaseSyncError(
      "این پرونده قبلاً با موفقیت ارسال شده و فقط قابل مشاهده است.",
      "CASE_ALREADY_SYNCED",
      409,
    );
  }

  const photos = await getPhotosByCase(caseId);

  if (photos.length === 0) {
    await updateCaseStatus(caseId, "failed");
    throw new CaseSyncError(
      "هیچ تصویری برای ارسال وجود ندارد.",
      "NO_PHOTOS",
    );
  }

  await updateCaseStatus(caseId, "syncing");

  try {
    let token = await getDeviceToken();

    try {
      const result = await uploadAttempt(airwayCase, photos, token);
      await updateCaseStatus(caseId, "synced");
      return result;
    } catch (firstError) {
      // Only 401 permits ONE recovery with the SAME case/photo UUIDs.
      // Device-disabled (403) must not cause automatic recovery.
      if (
        firstError instanceof CaseSyncError &&
        firstError.status === 401
      ) {
        token = await recoverDeviceToken();
        const result = await uploadAttempt(airwayCase, photos, token);
        await updateCaseStatus(caseId, "synced");
        return result;
      }

      throw firstError;
    }
  } catch (error) {
    await updateCaseStatus(
      caseId,
      isRetryableError(error) ? "queued" : "failed",
    );

    if (error instanceof CaseSyncError) throw error;

    throw new CaseSyncError(
      error instanceof Error ? error.message : "ارسال Case انجام نشد.",
      "NETWORK_ERROR",
    );
  }
}

export function syncCase(caseId: string): Promise<CaseSyncResponse> {
  const existing = inFlightCaseSyncs.get(caseId);
  if (existing) return existing;

  const task = syncCaseInternal(caseId).finally(() => {
    if (inFlightCaseSyncs.get(caseId) === task) {
      inFlightCaseSyncs.delete(caseId);
    }
  });

  inFlightCaseSyncs.set(caseId, task);
  return task;
}


