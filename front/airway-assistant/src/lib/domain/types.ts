export type OpenString<T extends string> =
  | T
  | (string & {});

/* -------------------------------------------------------------------------- */
/* Sync / Study                                                               */
/* -------------------------------------------------------------------------- */

export type SyncStatus =
  | "draft"
  | "queued"
  | "syncing"
  | "synced"
  | "failed";

export type StudyStatus =
  | "preop_draft"
  | "preop_ready"
  | "capture_in_progress"
  | "capture_completed"
  | "completed"
  | "excluded";

/* -------------------------------------------------------------------------- */
/* Common                                                                     */
/* -------------------------------------------------------------------------- */

export type YesNoUnknown =
  | "yes"
  | "no"
  | "unknown";

export type BiologicalSex =
  | "male"
  | "female"
  | "unknown";

export type NeckMobility =
  | "normal"
  | "reduced"
  | "unknown";

export type HeadRotationStatus =
  | "complete"
  | "incomplete";

/* -------------------------------------------------------------------------- */
/* Operator / Device                                                          */
/* -------------------------------------------------------------------------- */

export interface OperatorProfile {
  id: string;

  fullName: string;

  deviceToken?: string;

  registeredAt?: string;

  version: 2;

  createdAt: string;

  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Legacy airway classifications                                              */
/* -------------------------------------------------------------------------- */

export type MallampatiClass =
  | 1
  | 2
  | 3
  | 4
  | "unknown";

export type UpperLipBiteClass =
  | 1
  | 2
  | 3
  | "unknown";

/* -------------------------------------------------------------------------- */
/* Capture                                                                    */
/* -------------------------------------------------------------------------- */

export type CaptureKind =
  | "front_neutral"
  | "mallampati"
  | "mouth_open"
  | "upper_lip_bite_front"
  | "lateral_neutral"
  | "head_back_side";

export type CaptureSource =
  | "camera"
  | "gallery"
  | "file"
  | "upload"
  | "legacy"
  | "unknown";

/* -------------------------------------------------------------------------- */
/* Image Quality                                                              */
/* -------------------------------------------------------------------------- */

export type ImageQualityFlag =
  OpenString<
    | "too_dark"
    | "too_bright"
    | "blurry"
    | "possibly_blurry"
    | "low_resolution"
    | "bad_aspect_ratio"
    | "quality_warning"
    | "quality_ok"
  >;

export type ImageQualityLevel =
  | "good"
  | "warning"
  | "bad"
  | "unknown";

export interface ImageQualityCheck {
  key: string;

  label?: string;

  level?:
    | ImageQualityLevel
    | string;

  detail?: string;
}

export interface ImageQualityMetrics {
  width?: number;

  height?: number;

  fileSizeBytes?: number;

  fileSize?: number;

  mimeType?: string;

  brightness?: number;

  meanBrightness?: number;

  meanLuminance?: number;

  sharpness?: number;

  sharpnessScore?: number;

  blurScore?: number;

  laplacianVariance?: number;

  aspectRatio?: number;

  status?: string;

  overall?:
    | ImageQualityLevel
    | string;

  acceptable?: boolean;

  passed?: boolean;

  flags?: ImageQualityFlag[];

  checks?: ImageQualityCheck[];

  checkedAt?: string;

  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Prepared Image                                                             */
/* -------------------------------------------------------------------------- */

export interface PreparedImage {
  file: File;

  source: CaptureSource;

  qc: ImageQualityMetrics;
}

/* -------------------------------------------------------------------------- */
/* Clinical Assessment                                                        */
/* -------------------------------------------------------------------------- */

export interface ClinicalAssessment {
  fullName?: string;

  /*
   * Legacy compatibility.
   */
  firstName?: string;

  lastName?: string;

  ageYears?: number;

  sex: BiologicalSex;

  heightCm?: number;

  weightKg?: number;

  neckMobility: NeckMobility;

  headRotationStatus?:
    HeadRotationStatus;

  /*
   * Legacy compatibility.
   */
  neckRotationDegrees?: number;

  mallampatiClass:
    MallampatiClass;

  upperLipBiteClass:
    UpperLipBiteClass;

  interincisorDistanceMm?: number;

  thyromentalDistanceMm?: number;

  sternomentalDistanceMm?: number;

  hyomentalDistanceMm?: number;

  neckCircumferenceMm?: number;

  retrognathia:
    YesNoUnknown;

  prominentUpperIncisors:
    YesNoUnknown;

  /**
   * Backend:
   * previous_difficult_intubation
   *
   * yes     → آره
   * no      → خیر
   * unknown → نمی‌دانم
   */
  priorDifficultIntubation:
    YesNoUnknown;
}

/* -------------------------------------------------------------------------- */
/* Consent                                                                    */
/* -------------------------------------------------------------------------- */

export interface ConsentRecord {
  given: boolean;

  version: string;

  capturedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Case                                                                       */
/* -------------------------------------------------------------------------- */

export interface AirwayCase {
  id: string;

  caseCode: string;

  protocolVersion: string;

  operatorId?: string;

  operatorNameSnapshot?: string;

  consent:
    ConsentRecord;

  clinical:
    ClinicalAssessment;

  notes?: string;

  studyStatus:
    StudyStatus;

  syncStatus:
    SyncStatus;

  /*
   * Legacy compatibility.
   */
  heightCm?: number;

  weightKg?: number;

  neckMobility?:
    NeckMobility;

  preopLockedAt?: string;

  captureCompletedAt?: string;

  createdAt: string;

  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Photo                                                                      */
/* -------------------------------------------------------------------------- */

export interface StoredPhoto {
  id: string;

  caseId: string;

  kind:
    CaptureKind;

  blob: Blob;

  filename: string;

  mimeType: string;

  source:
    CaptureSource;

  qc:
    ImageQualityMetrics;

  createdAt: string;

  updatedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

export type AuditEvent =
  OpenString<
    | "case_created"
    | "case_updated"
    | "photo_saved"
    | "photo_deleted"
    | "preop_locked"
    | "sync_status_changed"
  >;

export interface AuditEntry {
  id: string;

  caseId: string;

  event:
    AuditEvent;

  details?: string;

  createdAt: string;
}