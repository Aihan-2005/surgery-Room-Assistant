import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from "idb";

import {
  CONSENT_VERSION,
  REQUIRED_CAPTURE_KINDS,
  STUDY_PROTOCOL_VERSION,
} from "@/lib/config/study-protocol";

import type {
  AirwayCase,
  AuditEntry,
  CaptureKind,
  ClinicalAssessment,
  IntubationOutcome,
  NeckMobility,
  PreparedImage,
  StoredPhoto,
  StudyStatus,
  SyncStatus,
} from "@/lib/domain/types";

const DATABASE_NAME =
  "airway-assistant-db";

const DATABASE_VERSION =
  2;

/* -------------------------------------------------------------------------- */
/*                                 DB Schema                                  */
/* -------------------------------------------------------------------------- */

interface AirwayAssistantDatabase
  extends DBSchema {
  cases: {
    key: string;

    value: AirwayCase;

    indexes: {
      "by-created-at":
        string;

      "by-sync-status":
        SyncStatus;

      "by-study-status":
        StudyStatus;

      "by-case-code":
        string;
    };
  };

  photos: {
    key: string;

    value: StoredPhoto;

    indexes: {
      "by-case-id":
        string;
    };
  };

  outcomes: {
    key: string;

    value:
      IntubationOutcome;

    indexes: {
      "by-finalized-at":
        string;
    };
  };

  audit: {
    key: string;

    value:
      AuditEntry;

    indexes: {
      "by-case-id":
        string;

      "by-created-at":
        string;
    };
  };
}

/* -------------------------------------------------------------------------- */
/*                              Legacy Schema                                 */
/* -------------------------------------------------------------------------- */

interface LegacyCase {
  id: string;

  caseCode: string;

  heightCm?: number;

  weightKg?: number;

  neckMobility?: NeckMobility;

  notes?: string;

  syncStatus?: SyncStatus;

  createdAt: string;

  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                             Create Case Input                              */
/* -------------------------------------------------------------------------- */

export interface CreateCaseInput {
  /**
   * اختیاری.
   */
  fullName?: string;

  clinical:
    ClinicalAssessment;

  /**
   * فعلاً UI این را دریافت نمی‌کند.
   * برای compatibility باقی مانده.
   */
  consentAccepted?: boolean;

  notes?: string;
}

/* -------------------------------------------------------------------------- */
/*                              DB singleton                                  */
/* -------------------------------------------------------------------------- */

let databasePromise:
  | Promise<
      IDBPDatabase<AirwayAssistantDatabase>
    >
  | null = null;

/* -------------------------------------------------------------------------- */
/*                            Clinical Defaults                               */
/* -------------------------------------------------------------------------- */

function unknownClinical(
  legacy?: LegacyCase,
): ClinicalAssessment {
  return {
    fullName:
      undefined,

    firstName:
      undefined,

    lastName:
      undefined,

    ageYears:
      undefined,

    sex:
      "unknown",

    heightCm:
      legacy?.heightCm,

    weightKg:
      legacy?.weightKg,

    neckMobility:
      legacy?.neckMobility ??
      "unknown",

    neckRotationDegrees:
      undefined,

    mallampatiClass:
      "unknown",

    upperLipBiteClass:
      "unknown",

    interincisorDistanceMm:
      undefined,

    thyromentalDistanceMm:
      undefined,

    sternomentalDistanceMm:
      undefined,

    hyomentalDistanceMm:
      undefined,

    neckCircumferenceMm:
      undefined,

    retrognathia:
      "unknown",

    prominentUpperIncisors:
      "unknown",

    priorDifficultIntubation:
      "unknown",
  };
}

/* -------------------------------------------------------------------------- */
/*                             Internal Case Code                             */
/* -------------------------------------------------------------------------- */

function createInternalCaseCode() {
  const shortId =
    crypto.randomUUID()
      .replace(
        /-/g,
        "",
      )
      .slice(
        0,
        8,
      )
      .toUpperCase();

  return `CASE-${shortId}`;
}

/* -------------------------------------------------------------------------- */
/*                                  Database                                  */
/* -------------------------------------------------------------------------- */

function getDatabase() {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "IndexedDB فقط در مرورگر قابل استفاده است.",
    );
  }

  if (!databasePromise) {
    databasePromise =
      openDB<AirwayAssistantDatabase>(
        DATABASE_NAME,
        DATABASE_VERSION,
        {
          async upgrade(
            database,
            oldVersion,
            _newVersion,
            transaction,
          ) {
            if (
              !database.objectStoreNames.contains(
                "cases",
              )
            ) {
              const store =
                database.createObjectStore(
                  "cases",
                  {
                    keyPath:
                      "id",
                  },
                );

              store.createIndex(
                "by-created-at",
                "createdAt",
              );

              store.createIndex(
                "by-sync-status",
                "syncStatus",
              );

              store.createIndex(
                "by-study-status",
                "studyStatus",
              );

              store.createIndex(
                "by-case-code",
                "caseCode",
              );
            }

            if (
              !database.objectStoreNames.contains(
                "photos",
              )
            ) {
              const store =
                database.createObjectStore(
                  "photos",
                  {
                    keyPath:
                      "id",
                  },
                );

              store.createIndex(
                "by-case-id",
                "caseId",
              );
            }

            if (
              !database.objectStoreNames.contains(
                "outcomes",
              )
            ) {
              const store =
                database.createObjectStore(
                  "outcomes",
                  {
                    keyPath:
                      "caseId",
                  },
                );

              store.createIndex(
                "by-finalized-at",
                "finalizedAt",
              );
            }

            if (
              !database.objectStoreNames.contains(
                "audit",
              )
            ) {
              const store =
                database.createObjectStore(
                  "audit",
                  {
                    keyPath:
                      "id",
                  },
                );

              store.createIndex(
                "by-case-id",
                "caseId",
              );

              store.createIndex(
                "by-created-at",
                "createdAt",
              );
            }

            const caseStore =
              transaction.objectStore(
                "cases",
              );

            if (
              !caseStore.indexNames.contains(
                "by-study-status",
              )
            ) {
              caseStore.createIndex(
                "by-study-status",
                "studyStatus",
              );
            }

            if (
              !caseStore.indexNames.contains(
                "by-case-code",
              )
            ) {
              caseStore.createIndex(
                "by-case-code",
                "caseCode",
              );
            }

            /*
             * Migration prototype v1 -> v2
             */
            if (
              oldVersion > 0 &&
              oldVersion < 2
            ) {
              let cursor =
                await caseStore.openCursor();

              while (
                cursor
              ) {
                const current =
                  cursor.value as unknown as
                    LegacyCase &
                      Partial<
                        AirwayCase
                      >;

                if (
                  !current.clinical
                ) {
                  const migrated:
                    AirwayCase = {
                    id:
                      current.id,

                    caseCode:
                      current.caseCode,

                    protocolVersion:
                      "legacy-v1",

                    consent: {
                      given:
                        false,

                      version:
                        "legacy-unverified",
                    },

                    clinical:
                      unknownClinical(
                        current,
                      ),

                    heightCm:
                      current.heightCm,

                    weightKg:
                      current.weightKg,

                    neckMobility:
                      current.neckMobility ??
                      "unknown",

                    notes:
                      current.notes,

                    studyStatus:
                      current.syncStatus ===
                      "queued"
                        ? "preop_ready"
                        : "preop_draft",

                    syncStatus:
                      current.syncStatus ??
                      "draft",

                    createdAt:
                      current.createdAt,

                    updatedAt:
                      current.updatedAt,
                  };

                  await cursor.update(
                    migrated,
                  );
                }

                cursor =
                  await cursor.continue();
              }
            }
          },
        },
      );
  }

  return databasePromise;
}

/* -------------------------------------------------------------------------- */
/*                                   Audit                                    */
/* -------------------------------------------------------------------------- */

function createAuditEntry(
  caseId: string,
  event:
    AuditEntry["event"],
  details?: string,
): AuditEntry {
  return {
    id:
      crypto.randomUUID(),

    caseId,

    event,

    details,

    createdAt:
      new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*                               Create Case                                  */
/* -------------------------------------------------------------------------- */

export async function createCase(
  input:
    CreateCaseInput,
): Promise<AirwayCase> {
  const database =
    await getDatabase();

  const now =
    new Date().toISOString();

  /*
   * نام بیمار اختیاری است.
   */
  const normalizedFullName =
    input.fullName
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim() ||
    undefined;

  /*
   * اگر نام وجود داشته باشد برای compatibility
   * در caseCode هم نمایش داده می‌شود.
   *
   * اگر نام وجود نداشته باشد یک Case Code خودکار داریم.
   *
   * id همچنان شناسه واقعی و یکتا است.
   */
  const displayCaseCode =
    normalizedFullName ??
    createInternalCaseCode();

  const consentGiven =
    input.consentAccepted ===
    true;

  const clinical:
    ClinicalAssessment = {
    ...unknownClinical(),

    ...input.clinical,

    fullName:
      normalizedFullName,
  };

  const airwayCase:
    AirwayCase = {
    id:
      crypto.randomUUID(),

    caseCode:
      displayCaseCode,

    protocolVersion:
      STUDY_PROTOCOL_VERSION,

    consent: {
      given:
        consentGiven,

      version:
        CONSENT_VERSION,

      capturedAt:
        consentGiven
          ? now
          : undefined,
    },

    clinical,

    /*
     * Mirror برای compatibility با صفحه Cases فعلی.
     *
     * بعداً cases/page.tsx را کاملاً به clinical منتقل
     * می‌کنیم و این سه property قابل حذف هستند.
     */
    heightCm:
      clinical.heightCm,

    weightKg:
      clinical.weightKg,

    neckMobility:
      clinical.neckMobility,

    notes:
      input.notes
        ?.trim() ||
      undefined,

    studyStatus:
      "preop_draft",

    syncStatus:
      "draft",

    createdAt:
      now,

    updatedAt:
      now,
  };

  const transaction =
    database.transaction(
      [
        "cases",
        "audit",
      ],
      "readwrite",
    );

  await transaction
    .objectStore(
      "cases",
    )
    .put(
      airwayCase,
    );

  await transaction
    .objectStore(
      "audit",
    )
    .put(
      createAuditEntry(
        airwayCase.id,
        "case_created",
      ),
    );

  await transaction.done;

  return airwayCase;
}

/* -------------------------------------------------------------------------- */
/*                                   Cases                                    */
/* -------------------------------------------------------------------------- */

export async function getCase(
  caseId: string,
) {
  const database =
    await getDatabase();

  return database.get(
    "cases",
    caseId,
  );
}

export async function getAllCases() {
  const database =
    await getDatabase();

  const cases =
    await database.getAll(
      "cases",
    );

  return cases.sort(
    (
      a,
      b,
    ) =>
      new Date(
        b.createdAt,
      ).getTime() -
      new Date(
        a.createdAt,
      ).getTime(),
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Photos                                    */
/* -------------------------------------------------------------------------- */

export async function getPhotosByCase(
  caseId: string,
) {
  const database =
    await getDatabase();

  return database.getAllFromIndex(
    "photos",
    "by-case-id",
    caseId,
  );
}

export async function savePhoto(
  caseId: string,
  kind: CaptureKind,
  prepared:
    PreparedImage,
): Promise<StoredPhoto> {
  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      [
        "cases",
        "photos",
        "audit",
      ],
      "readwrite",
    );

  const caseStore =
    transaction.objectStore(
      "cases",
    );

  const photoStore =
    transaction.objectStore(
      "photos",
    );

  const airwayCase =
    await caseStore.get(
      caseId,
    );

  if (!airwayCase) {
    throw new Error(
      "CASE_NOT_FOUND",
    );
  }

  if (
    airwayCase.preopLockedAt
  ) {
    throw new Error(
      "PREOP_ALREADY_LOCKED",
    );
  }

  const currentPhotos =
    await photoStore
      .index(
        "by-case-id",
      )
      .getAll(
        caseId,
      );

  const oldPhoto =
    currentPhotos.find(
      (photo) =>
        photo.kind ===
        kind,
    );

  if (oldPhoto) {
    await photoStore.delete(
      oldPhoto.id,
    );
  }

  const now =
    new Date().toISOString();

  const photo:
    StoredPhoto = {
    id:
      crypto.randomUUID(),

    caseId,

    kind,

    blob:
      prepared.file,

    filename:
      prepared.file.name ||
      `${kind}-${Date.now()}.jpg`,

    mimeType:
      prepared.file.type ||
      "image/jpeg",

    source:
      prepared.source,

    qc:
      prepared.qc,

    createdAt:
      now,
  };

  await photoStore.put(
    photo,
  );

  const updatedPhotos =
    oldPhoto
      ? currentPhotos
          .filter(
            (item) =>
              item.id !==
              oldPhoto.id,
          )
          .concat(
            photo,
          )
      : currentPhotos.concat(
          photo,
        );

  const allRequiredCaptured =
    REQUIRED_CAPTURE_KINDS.every(
      (
        requiredKind,
      ) =>
        updatedPhotos.some(
          (item) =>
            item.kind ===
            requiredKind,
        ),
    );

  airwayCase.studyStatus =
    allRequiredCaptured
      ? "preop_ready"
      : "preop_draft";

  airwayCase.syncStatus =
    "draft";

  airwayCase.updatedAt =
    now;

  await caseStore.put(
    airwayCase,
  );

  const qualityStatus =
    prepared.qc.status ??
    prepared.qc.overall ??
    "unknown";

  await transaction
    .objectStore(
      "audit",
    )
    .put(
      createAuditEntry(
        caseId,
        "photo_saved",
        `${kind};qc=${String(
          qualityStatus,
        )};source=${prepared.source}`,
      ),
    );

  await transaction.done;

  return photo;
}

export async function deletePhoto(
  photoId: string,
) {
  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      [
        "cases",
        "photos",
        "audit",
      ],
      "readwrite",
    );

  const photoStore =
    transaction.objectStore(
      "photos",
    );

  const photo =
    await photoStore.get(
      photoId,
    );

  if (!photo) {
    return;
  }

  const caseStore =
    transaction.objectStore(
      "cases",
    );

  const airwayCase =
    await caseStore.get(
      photo.caseId,
    );

  if (!airwayCase) {
    throw new Error(
      "CASE_NOT_FOUND",
    );
  }

  if (
    airwayCase.preopLockedAt
  ) {
    throw new Error(
      "PREOP_ALREADY_LOCKED",
    );
  }

  await photoStore.delete(
    photoId,
  );

  airwayCase.studyStatus =
    "preop_draft";

  airwayCase.syncStatus =
    "draft";

  airwayCase.updatedAt =
    new Date().toISOString();

  await caseStore.put(
    airwayCase,
  );

  await transaction
    .objectStore(
      "audit",
    )
    .put(
      createAuditEntry(
        photo.caseId,
        "photo_deleted",
        photo.kind,
      ),
    );

  await transaction.done;
}

/* -------------------------------------------------------------------------- */
/*                              Finalize Pre-op                               */
/* -------------------------------------------------------------------------- */

export async function finalizePreop(
  caseId: string,
) {
  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      [
        "cases",
        "photos",
        "audit",
      ],
      "readwrite",
    );

  const caseStore =
    transaction.objectStore(
      "cases",
    );

  const airwayCase =
    await caseStore.get(
      caseId,
    );

  if (!airwayCase) {
    throw new Error(
      "CASE_NOT_FOUND",
    );
  }

  if (
    airwayCase.preopLockedAt
  ) {
    return airwayCase;
  }

  const photos =
    await transaction
      .objectStore(
        "photos",
      )
      .index(
        "by-case-id",
      )
      .getAll(
        caseId,
      );

  const missingKinds =
    REQUIRED_CAPTURE_KINDS.filter(
      (
        requiredKind,
      ) =>
        !photos.some(
          (photo) =>
            photo.kind ===
            requiredKind,
        ),
    );

  if (
    missingKinds.length >
    0
  ) {
    throw new Error(
      `MISSING_IMAGES:${missingKinds.join(
        ",",
      )}`,
    );
  }

  const now =
    new Date().toISOString();

  airwayCase.studyStatus =
    "awaiting_outcome";

  airwayCase.preopLockedAt =
    now;

  airwayCase.updatedAt =
    now;

  await caseStore.put(
    airwayCase,
  );

  await transaction
    .objectStore(
      "audit",
    )
    .put(
      createAuditEntry(
        caseId,
        "preop_locked",
      ),
    );

  await transaction.done;

  return airwayCase;
}

/* -------------------------------------------------------------------------- */
/*                                  Outcome                                   */
/* -------------------------------------------------------------------------- */

export type FinalizeOutcomeInput =
  Omit<
    IntubationOutcome,
    | "caseId"
    | "finalizedAt"
  >;

export async function finalizeOutcome(
  caseId: string,
  input:
    FinalizeOutcomeInput,
) {
  if (
    !Number.isInteger(
      input.attemptCount,
    ) ||
    input.attemptCount <
      1
  ) {
    throw new Error(
      "INVALID_ATTEMPT_COUNT",
    );
  }

  const lowestSpO2 =
    input.lowestSpO2Percent;

  if (
    lowestSpO2 !==
      undefined &&
    (
      lowestSpO2 <
        0 ||
      lowestSpO2 >
        100
    )
  ) {
    throw new Error(
      "INVALID_SPO2",
    );
  }

  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      [
        "cases",
        "outcomes",
        "audit",
      ],
      "readwrite",
    );

  const caseStore =
    transaction.objectStore(
      "cases",
    );

  const airwayCase =
    await caseStore.get(
      caseId,
    );

  if (!airwayCase) {
    throw new Error(
      "CASE_NOT_FOUND",
    );
  }

  if (
    airwayCase.studyStatus !==
    "awaiting_outcome"
  ) {
    throw new Error(
      "PREOP_NOT_FINALIZED",
    );
  }

  const now =
    new Date().toISOString();

  const outcome:
    IntubationOutcome = {
    ...input,

    caseId,

    finalizedAt:
      now,
  };

  await transaction
    .objectStore(
      "outcomes",
    )
    .put(
      outcome,
    );

  airwayCase.studyStatus =
    "outcome_complete";

  airwayCase.syncStatus =
    "queued";

  airwayCase.outcomeCompletedAt =
    now;

  airwayCase.updatedAt =
    now;

  await caseStore.put(
    airwayCase,
  );

  await transaction
    .objectStore(
      "audit",
    )
    .put(
      createAuditEntry(
        caseId,
        "outcome_finalized",
      ),
    );

  await transaction.done;

  return outcome;
}

export async function getOutcome(
  caseId: string,
) {
  const database =
    await getDatabase();

  return database.get(
    "outcomes",
    caseId,
  );
}


export async function updateCaseStatus(
  caseId: string,
  status:
    SyncStatus,
) {
  const database =
    await getDatabase();

  const transaction =
    database.transaction(
      [
        "cases",
        "audit",
      ],
      "readwrite",
    );

  const store =
    transaction.objectStore(
      "cases",
    );

  const airwayCase =
    await store.get(
      caseId,
    );

  if (!airwayCase) {
    throw new Error(
      "CASE_NOT_FOUND",
    );
  }

  airwayCase.syncStatus =
    status;

  airwayCase.updatedAt =
    new Date().toISOString();

  await store.put(
    airwayCase,
  );

  await transaction
    .objectStore(
      "audit",
    )
    .put(
      createAuditEntry(
        caseId,
        "sync_status_changed",
        status,
      ),
    );

  await transaction.done;

  return airwayCase;
}

export async function getQueuedCases() {
  const database =
    await getDatabase();

  const cases =
    await database.getAllFromIndex(
      "cases",
      "by-sync-status",
      "queued",
    );

  return cases.filter(
    (airwayCase) =>
      airwayCase.studyStatus ===
      "outcome_complete",
  );
}


export async function getAuditByCase(
  caseId: string,
) {
  const database =
    await getDatabase();

  return database.getAllFromIndex(
    "audit",
    "by-case-id",
    caseId,
  );
}