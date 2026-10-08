import {
  finalizePreop,
  getCase,
} from "@/lib/db/database";

import {
  syncCase,
} from "@/lib/api/sync-case";

import {
  checkConnectivity,
} from "@/lib/network/connectivity";

export type FinalizeAndSyncState =
  | "synced"
  | "queued"
  | "failed";

export interface FinalizeAndSyncResult {
  state:
    FinalizeAndSyncState;
}

export async function finalizeAndSyncCase(
  caseId:
    string,
): Promise<FinalizeAndSyncResult> {
  /*
   * اول اطلاعات به‌شکل durable روی IndexedDB
   * نهایی و queued می‌شوند.
   *
   * این مرحله حتی بدون اینترنت کار می‌کند.
   */
  const finalized =
    await finalizePreop(
      caseId,
    );

  if (
    finalized.syncStatus ===
    "synced"
  ) {
    return {
      state:
        "synced",
    };
  }

  /*
   * اگر Browser صریحاً offline است،
   * هیچ request شبکه‌ای نزن.
   */
  if (
    typeof navigator ===
      "undefined" ||
    navigator.onLine ===
      false
  ) {
    return {
      state:
        "queued",
    };
  }

  /*
   * وضعیت واقعی Backend + DB.
   */
  const connectivity =
    await checkConnectivity();

  if (
    !connectivity.canUpload
  ) {
    return {
      state:
        "queued",
    };
  }

  /*
   * آنلاین:
   * همان لحظه ارسال شود.
   */
  try {
    await syncCase(
      caseId,
    );

    return {
      state:
        "synced",
    };
  } catch (
    error
  ) {
    console.warn(
      "Immediate case sync failed:",
      error,
    );

    /*
     * syncCase خودش وضعیت queued/failed
     * را بر اساس نوع خطا تنظیم کرده است.
     */
    const latest =
      await getCase(
        caseId,
      );

    if (
      latest?.syncStatus ===
      "failed"
    ) {
      return {
        state:
          "failed",
      };
    }

    return {
      state:
        "queued",
    };
  }
}

