import {
  openDB,
  unwrap,
  type DBSchema,
  type IDBPDatabase,
} from "idb";

import {
  CONSENT_VERSION,
  MAX_PHOTOS_PER_POSITION,
  MIN_TOTAL_PHOTOS,
  STUDY_PROTOCOL_VERSION,
} from "@/lib/config/study-protocol";

import type {
  AirwayCase,
  AuditEntry,
  CaptureKind,
  ClinicalAssessment,
  NeckMobility,
  PreparedImage,
  StoredPhoto,
  StudyStatus,
  SyncStatus,
} from "@/lib/domain/types";

import {
  getOperatorProfile,
} from "@/lib/profile/operator-profile";

const DATABASE_NAME =
  "airway-assistant-db";

const DATABASE_VERSION =
  3;

interface AirwayAssistantDatabase
  extends DBSchema {
  cases: {
    key:
      string;

    value:
      AirwayCase;

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
    key:
      string;

    value:
      StoredPhoto;

    indexes: {
      "by-case-id":
        string;
    };
  };

  audit: {
    key:
      string;

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

interface LegacyCase {
  id:
    string;

  caseCode:
    string;

  heightCm?:
    number;

  weightKg?:
    number;

  neckMobility?:
    NeckMobility;

  notes?:
    string;

  syncStatus?:
    SyncStatus;

  studyStatus?:
    string;

  createdAt:
    string;

  updatedAt:
    string;
}

export interface CreateCaseInput {
  fullName:
    string;

  clinical:
    ClinicalAssessment;

  notes?:
    string;
}

let databasePromise:
  | Promise<
      IDBPDatabase<AirwayAssistantDatabase>
    >
  | null = null;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function unknownClinical(
  legacy?:
    LegacyCase,
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

    headRotationStatus:
      undefined,

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

function normalizeFullName(
  value:
    string,
) {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function createCaseCode(
  id:
    string,
) {
  return `CASE-${id
    .replace(
      /-/g,
      "",
    )
    .slice(
      0,
      8,
    )
    .toUpperCase()}`;
}

function validateNewCase(
  input:
    CreateCaseInput,
) {
  const fullName =
    normalizeFullName(
      input.fullName,
    );

  if (
    !fullName
  ) {
    throw new Error(
      "PATIENT_NAME_REQUIRED",
    );
  }

  const {
    ageYears,
    sex,
    heightCm,
    weightKg,
    headRotationStatus,
  } =
    input.clinical;

  if (
    ageYears ===
    undefined
  ) {
    throw new Error(
      "AGE_REQUIRED",
    );
  }

  if (
    !Number.isFinite(
      ageYears,
    ) ||
    ageYears <= 0 ||
    ageYears > 120
  ) {
    throw new Error(
      "INVALID_AGE",
    );
  }

  if (
    sex ===
    "unknown"
  ) {
    throw new Error(
      "SEX_REQUIRED",
    );
  }

  if (
    heightCm ===
    undefined
  ) {
    throw new Error(
      "HEIGHT_REQUIRED",
    );
  }

  if (
    !Number.isFinite(
      heightCm,
    ) ||
    heightCm < 30 ||
    heightCm > 250
  ) {
    throw new Error(
      "INVALID_HEIGHT",
    );
  }

  if (
    weightKg ===
    undefined
  ) {
    throw new Error(
      "WEIGHT_REQUIRED",
    );
  }

  if (
    !Number.isFinite(
      weightKg,
    ) ||
    weightKg < 1 ||
    weightKg > 500
  ) {
    throw new Error(
      "INVALID_WEIGHT",
    );
  }

  if (
    !headRotationStatus
  ) {
    throw new Error(
      "HEAD_ROTATION_REQUIRED",
    );
  }

  return {
    fullName,
    ageYears,
    sex,
    heightCm,
    weightKg,
    headRotationStatus,
  };
}

/**
 * دیگر position مشخصی اجباری نیست.
 *
 * تنها قانون:
 * Case باید حداقل یک عکس داشته باشد.
 */
function minimumPhotosCaptured(
  photos:
    StoredPhoto[],
) {
  return (
    photos.length >=
    MIN_TOTAL_PHOTOS
  );
}

function createAuditEntry(
  caseId:
    string,

  event:
    AuditEntry["event"],

  details?:
    string,
): AuditEntry {
  return {
    id:
      crypto.randomUUID(),

    caseId,

    event,

    details,

    createdAt:
      new Date()
        .toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Database                                                                   */
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

  if (
    !databasePromise
  ) {
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
            /* ------------------------------------------------------------ */
            /* Cases                                                        */
            /* ------------------------------------------------------------ */

            if (
              !database
                .objectStoreNames
                .contains(
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

            /* ------------------------------------------------------------ */
            /* Photos                                                       */
            /* ------------------------------------------------------------ */

            if (
              !database
                .objectStoreNames
                .contains(
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

            /* ------------------------------------------------------------ */
            /* Audit                                                        */
            /* ------------------------------------------------------------ */

            if (
              !database
                .objectStoreNames
                .contains(
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

            /* ------------------------------------------------------------ */
            /* Remove legacy Outcome store                                  */
            /* ------------------------------------------------------------ */

            const nativeDatabase =
              unwrap(
                database,
              );

            if (
              nativeDatabase
                .objectStoreNames
                .contains(
                  "outcomes",
                )
            ) {
              nativeDatabase.deleteObjectStore(
                "outcomes",
              );
            }

            /* ------------------------------------------------------------ */
            /* Ensure indexes                                               */
            /* ------------------------------------------------------------ */

            const caseStore =
              transaction.objectStore(
                "cases",
              );

            if (
              !caseStore
                .indexNames
                .contains(
                  "by-study-status",
                )
            ) {
              caseStore.createIndex(
                "by-study-status",
                "studyStatus",
              );
            }

            if (
              !caseStore
                .indexNames
                .contains(
                  "by-case-code",
                )
            ) {
              caseStore.createIndex(
                "by-case-code",
                "caseCode",
              );
            }

            /* ------------------------------------------------------------ */
            /* Legacy migration                                             */
            /* ------------------------------------------------------------ */

            if (
              oldVersion < 3
            ) {
              let cursor =
                await caseStore
                  .openCursor();

              while (
                cursor
              ) {
                const original =
                  cursor.value as unknown as
                    LegacyCase &
                    Partial<AirwayCase> & {
                      clinical?:
                        ClinicalAssessment;

                      outcomeCompletedAt?:
                        string;
                    };

                let changed =
                  false;

                const migrated:
                  Record<
                    string,
                    unknown
                  > = {
                    ...original,
                  };

                if (
                  !original.clinical
                ) {
                  Object.assign(
                    migrated,
                    {
                      id:
                        original.id,

                      caseCode:
                        original.caseCode,

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
                          original,
                        ),

                      heightCm:
                        original.heightCm,

                      weightKg:
                        original.weightKg,

                      neckMobility:
                        original.neckMobility ??
                        "unknown",

                      notes:
                        original.notes,

                      studyStatus:
                        "preop_draft",

                      syncStatus:
                        original.syncStatus ??
                        "draft",

                      createdAt:
                        original.createdAt,

                      updatedAt:
                        original.updatedAt,
                    },
                  );

                  changed =
                    true;
                }

                const oldStudyStatus =
                  String(
                    migrated.studyStatus ??
                    "",
                  );

                if (
                  oldStudyStatus ===
                    "awaiting_outcome" ||
                  oldStudyStatus ===
                    "outcome_complete"
                ) {
                  migrated.studyStatus =
                    "capture_completed";

                  changed =
                    true;
                }

                if (
                  "outcomeCompletedAt" in
                  migrated
                ) {
                  delete migrated
                    .outcomeCompletedAt;

                  changed =
                    true;
                }

                if (
                  changed
                ) {
                  await cursor.update(
                    migrated as unknown as
                      AirwayCase,
                  );
                }

                cursor =
                  await cursor
                    .continue();
              }
            }
          },
        },
      );
  }

  return databasePromise;
}

/* -------------------------------------------------------------------------- */
/* Cases                                                                      */
/* -------------------------------------------------------------------------- */

export async function createCase(
  input:
    CreateCaseInput,
): Promise<AirwayCase> {
  const validated =
    validateNewCase(
      input,
    );

  const operator =
    getOperatorProfile();

  if (
    !operator
  ) {
    throw new Error(
      "OPERATOR_PROFILE_REQUIRED",
    );
  }

  const database =
    await getDatabase();

  const now =
    new Date()
      .toISOString();

  const id =
    crypto.randomUUID();

  const clinical:
    ClinicalAssessment = {
    ...unknownClinical(),

    ...input.clinical,

    fullName:
      validated.fullName,

    ageYears:
      validated.ageYears,

    sex:
      validated.sex,

    heightCm:
      validated.heightCm,

    weightKg:
      validated.weightKg,

    headRotationStatus:
      validated.headRotationStatus,

    neckRotationDegrees:
      undefined,

    mallampatiClass:
      "unknown",

    upperLipBiteClass:
      "unknown",
  };

  const airwayCase:
    AirwayCase = {
    id,

    caseCode:
      createCaseCode(
        id,
      ),

    protocolVersion:
      STUDY_PROTOCOL_VERSION,

    operatorId:
      operator.id,

    operatorNameSnapshot:
      operator.fullName,

    consent: {
      given:
        false,

      version:
        CONSENT_VERSION,
    },

    clinical,

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
        `operatorId=${operator.id}`,
      ),
    );

  await transaction.done;

  return airwayCase;
}

export async function getCase(
  caseId:
    string,
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
      first,
      second,
    ) =>
      new Date(
        second.createdAt,
      ).getTime() -
      new Date(
        first.createdAt,
      ).getTime(),
  );
}

/* -------------------------------------------------------------------------- */
/* Photos                                                                     */
/* -------------------------------------------------------------------------- */

export async function getPhotosByCase(
  caseId:
    string,
) {
  const database =
    await getDatabase();

  return database
    .getAllFromIndex(
      "photos",
      "by-case-id",
      caseId,
    );
}

export async function savePhoto(
  caseId:
    string,

  kind:
    CaptureKind,

  prepared:
    PreparedImage,

  replacePhotoId?:
    string,
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

  if (
    !airwayCase
  ) {
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

  if (
    airwayCase.syncStatus ===
    "synced"
  ) {
    throw new Error(
      "REMOTE_CASE_ALREADY_SYNCED",
    );
  }

  const existingPhotos =
    await photoStore
      .index(
        "by-case-id",
      )
      .getAll(
        caseId,
      );

  const sameKindPhotos =
    existingPhotos.filter(
      (
        photo,
      ) =>
        photo.kind ===
        kind,
    );

  /*
   * اگر عکس جدید است، limit را بررسی کن.
   *
   * Replace تعداد را زیاد نمی‌کند.
   */
  if (
    !replacePhotoId &&
    sameKindPhotos.length >=
      MAX_PHOTOS_PER_POSITION
  ) {
    throw new Error(
      "MAX_PHOTOS_PER_POSITION_REACHED",
    );
  }

  if (
    replacePhotoId
  ) {
    const oldPhoto =
      await photoStore.get(
        replacePhotoId,
      );

    if (
      !oldPhoto ||
      oldPhoto.caseId !==
        caseId ||
      oldPhoto.kind !==
        kind
    ) {
      throw new Error(
        "PHOTO_NOT_FOUND",
      );
    }

    await photoStore.delete(
      replacePhotoId,
    );
  }

  const now =
    new Date()
      .toISOString();

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
    await photoStore
      .index(
        "by-case-id",
      )
      .getAll(
        caseId,
      );

  airwayCase.studyStatus =
    minimumPhotosCaptured(
      updatedPhotos,
    )
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
        `${kind};photoId=${photo.id};qc=${String(
          qualityStatus,
        )};source=${prepared.source}`,
      ),
    );

  await transaction.done;

  return photo;
}

export async function deletePhoto(
  photoId:
    string,
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

  if (
    !photo
  ) {
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

  if (
    !airwayCase
  ) {
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

  if (
    airwayCase.syncStatus ===
    "synced"
  ) {
    throw new Error(
      "REMOTE_CASE_ALREADY_SYNCED",
    );
  }

  await photoStore.delete(
    photoId,
  );

  const remainingPhotos =
    await photoStore
      .index(
        "by-case-id",
      )
      .getAll(
        photo.caseId,
      );

  airwayCase.studyStatus =
    minimumPhotosCaptured(
      remainingPhotos,
    )
      ? "preop_ready"
      : "preop_draft";

  airwayCase.syncStatus =
    "draft";

  airwayCase.updatedAt =
    new Date()
      .toISOString();

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
        `${photo.kind};photoId=${photo.id}`,
      ),
    );

  await transaction.done;
}

/* -------------------------------------------------------------------------- */
/* Finalize Capture                                                           */
/* -------------------------------------------------------------------------- */

export async function finalizePreop(
  caseId:
    string,
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

  if (
    !airwayCase
  ) {
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

  /*
   * فقط یک عکس در کل Case کافی است.
   */
  if (
    photos.length <
    MIN_TOTAL_PHOTOS
  ) {
    throw new Error(
      "MINIMUM_PHOTOS_REQUIRED",
    );
  }

  /*
   * دفاع دوم:
   * حتی اگر UI باگ داشت،
   * IndexedDB بیشتر از limit نهایی نشود.
   */
  const counts =
    new Map<
      CaptureKind,
      number
    >();

  for (
    const photo of
    photos
  ) {
    counts.set(
      photo.kind,
      (
        counts.get(
          photo.kind,
        ) ??
        0
      ) + 1,
    );
  }

  for (
    const count of
    counts.values()
  ) {
    if (
      count >
      MAX_PHOTOS_PER_POSITION
    ) {
      throw new Error(
        "MAX_PHOTOS_PER_POSITION_REACHED",
      );
    }
  }

  const now =
    new Date()
      .toISOString();

  airwayCase.studyStatus =
    "capture_completed";

  airwayCase.syncStatus =
    "queued";

  airwayCase.preopLockedAt =
    now;

  airwayCase.captureCompletedAt =
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
        `capture_completed;photoCount=${photos.length}`,
      ),
    );

  await transaction.done;

  return airwayCase;
}

/* -------------------------------------------------------------------------- */
/* Sync status                                                                */
/* -------------------------------------------------------------------------- */

export async function updateCaseStatus(
  caseId:
    string,

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

  if (
    !airwayCase
  ) {
    throw new Error(
      "CASE_NOT_FOUND",
    );
  }

  airwayCase.syncStatus =
    status;

  airwayCase.updatedAt =
    new Date()
      .toISOString();

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

  return database
    .getAllFromIndex(
      "cases",
      "by-sync-status",
      "queued",
    );
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

export async function getAuditByCase(
  caseId:
    string,
) {
  const database =
    await getDatabase();

  return database
    .getAllFromIndex(
      "audit",
      "by-case-id",
      caseId,
    );
}
