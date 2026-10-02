export type SyncStatus =
  | "draft"
  | "queued"
  | "syncing"
  | "synced"
  | "failed";

export type NeckMobility =
  | "normal"
  | "reduced"
  | "unknown";

export type CaptureKind =
  | "upper_lip_bite_front"
  | "lateral_neutral";

export interface AirwayCase {
  id: string;

  
  caseCode: string;

  heightCm?: number;

  weightKg?: number;

  neckMobility: NeckMobility;

  notes?: string;

  syncStatus: SyncStatus;

  createdAt: string;

  updatedAt: string;
}

export interface StoredPhoto {
  id: string;

  caseId: string;

  kind: CaptureKind;

  blob: Blob;

  filename: string;

  mimeType: string;

  createdAt: string;
}