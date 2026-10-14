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

import {
  registerUploadReminderSync,
} from "@/lib/pwa/upload-reminder";


export type FinalizeAndSyncState =
  | "synced"
  | "queued"
  | "failed";


export interface FinalizeAndSyncResult {
  state:
    FinalizeAndSyncState;
}


async function queuedResult():
  Promise<FinalizeAndSyncResult> {
 
  await registerUploadReminderSync();

  return {
    state:
      "queued",
  };
}


export async function finalizeAndSyncCase(
  caseId:
    string,
): Promise<FinalizeAndSyncResult> {
 
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


 
  if (
    typeof navigator ===
      "undefined" ||
    navigator.onLine ===
      false
  ) {
    return queuedResult();
  }

 
  const connectivity =
    await checkConnectivity();

  if (
    !connectivity.canUpload
  ) {
    return queuedResult();
  }

 
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

 
    return queuedResult();
  }
}