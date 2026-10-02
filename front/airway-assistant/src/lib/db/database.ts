import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from "idb";

import type {
  AirwayCase,
  CaptureKind,
  StoredPhoto,
  SyncStatus,
} from "@/lib/domain/types";

const DATABASE_NAME = "airway-assistant-db";

const DATABASE_VERSION = 1;

interface AirwayAssistantDatabase extends DBSchema {
  cases: {
    key: string;

    value: AirwayCase;

    indexes: {
      "by-created-at": string;
      "by-sync-status": SyncStatus;
    };
  };

  photos: {
    key: string;

    value: StoredPhoto;

    indexes: {
      "by-case-id": string;
    };
  };
}

let databasePromise:
  | Promise<IDBPDatabase<AirwayAssistantDatabase>>
  | null = null;

function getDatabase() {
  if (typeof window === "undefined") {
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
          upgrade(database) {
            if (
              !database.objectStoreNames.contains("cases")
            ) {
              const caseStore =
                database.createObjectStore("cases", {
                  keyPath: "id",
                });

              caseStore.createIndex(
                "by-created-at",
                "createdAt",
              );

              caseStore.createIndex(
                "by-sync-status",
                "syncStatus",
              );
            }

            if (
              !database.objectStoreNames.contains("photos")
            ) {
              const photoStore =
                database.createObjectStore("photos", {
                  keyPath: "id",
                });

              photoStore.createIndex(
                "by-case-id",
                "caseId",
              );
            }
          },
        },
      );
  }

  return databasePromise;
}

interface CreateCaseInput {
  caseCode: string;

  heightCm?: number;

  weightKg?: number;

  neckMobility: AirwayCase["neckMobility"];

  notes?: string;
}

export async function createCase(
  input: CreateCaseInput,
): Promise<AirwayCase> {
  const database = await getDatabase();

  const now = new Date().toISOString();

  const airwayCase: AirwayCase = {
    id: crypto.randomUUID(),

    caseCode: input.caseCode.trim(),

    heightCm: input.heightCm,

    weightKg: input.weightKg,

    neckMobility: input.neckMobility,

    notes: input.notes?.trim(),

    syncStatus: "draft",

    createdAt: now,

    updatedAt: now,
  };

  await database.put(
    "cases",
    airwayCase,
  );

  return airwayCase;
}

export async function getCase(
  caseId: string,
) {
  const database = await getDatabase();

  return database.get(
    "cases",
    caseId,
  );
}

export async function getAllCases() {
  const database = await getDatabase();

  const cases =
    await database.getAll("cases");

  return cases.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime(),
  );
}

export async function updateCaseStatus(
  caseId: string,
  status: SyncStatus,
) {
  const database = await getDatabase();

  const airwayCase =
    await database.get(
      "cases",
      caseId,
    );

  if (!airwayCase) {
    throw new Error(
      "Case پیدا نشد.",
    );
  }

  airwayCase.syncStatus = status;

  airwayCase.updatedAt =
    new Date().toISOString();

  await database.put(
    "cases",
    airwayCase,
  );

  return airwayCase;
}

export async function savePhoto(
  caseId: string,
  kind: CaptureKind,
  file: File,
): Promise<StoredPhoto> {
  const database = await getDatabase();

  const currentPhotos =
    await database.getAllFromIndex(
      "photos",
      "by-case-id",
      caseId,
    );

  /**
   * اگر قبلاً برای همین نوع عکس تصویری ذخیره شده،
   * تصویر قبلی را حذف می‌کنیم.
   */
  const oldPhoto =
    currentPhotos.find(
      (photo) =>
        photo.kind === kind,
    );

  if (oldPhoto) {
    await database.delete(
      "photos",
      oldPhoto.id,
    );
  }

  const photo: StoredPhoto = {
    id: crypto.randomUUID(),

    caseId,

    kind,

    blob: file,

    filename:
      file.name ||
      `${kind}-${Date.now()}.jpg`,

    mimeType:
      file.type || "image/jpeg",

    createdAt:
      new Date().toISOString(),
  };

  await database.put(
    "photos",
    photo,
  );

  return photo;
}

export async function getPhotosByCase(
  caseId: string,
) {
  const database = await getDatabase();

  return database.getAllFromIndex(
    "photos",
    "by-case-id",
    caseId,
  );
}

export async function deletePhoto(
  photoId: string,
) {
  const database = await getDatabase();

  await database.delete(
    "photos",
    photoId,
  );
}

export async function getQueuedCases() {
  const database = await getDatabase();

  return database.getAllFromIndex(
    "cases",
    "by-sync-status",
    "queued",
  );
}