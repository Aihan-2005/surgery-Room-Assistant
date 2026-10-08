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

/**
 * Workflow جدید فقط دو مرحله اصلی دارد:
 *
 * 1. اطلاعات بیمار
 * 2. تصویربرداری
 *
 * Outcome دیگر بخشی از workflow نیست.
 */
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
  /**
   * شناسه یکتای local device/operator.
   */
  id: string;

  fullName: string;

  /**
   * بعد از registration موفق Backend ایجاد می‌شود.
   */
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
  | "lateral_neutral"

  /**
   * فقط برای backward compatibility.
   */
  | "upper_lip_bite_front";

export type CaptureSource =
  | "camera"
  | "gallery"
  | "file"
  | "upload"
  | "legacy"
  | "unknown";

/* -------------------------------------------------------------------------- */
/* Image quality                                                              */
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
/* Prepared image                                                             */
/* -------------------------------------------------------------------------- */

export interface PreparedImage {
  file: File;

  source: CaptureSource;

  qc: ImageQualityMetrics;
}

/* -------------------------------------------------------------------------- */
/* Clinical assessment                                                        */
/* -------------------------------------------------------------------------- */

export interface ClinicalAssessment {
  /**
   * برای Caseهای جدید در createCase الزامی است.
   * Optional بودن type فقط برای داده‌های قدیمی است.
   */
  fullName?: string;

  /**
   * Legacy fields.
   */
  firstName?: string;

  lastName?: string;

  ageYears?: number;

  sex: BiologicalSex;

  heightCm?: number;

  weightKg?: number;

  /**
   * Legacy field.
   */
  neckMobility: NeckMobility;

  headRotationStatus?:
    HeadRotationStatus;

  /**
   * Legacy field.
   */
  neckRotationDegrees?: number;

  /**
   * این دو از فرم اطلاعات بیمار حذف شده‌اند
   * ولی برای backward compatibility باقی مانده‌اند.
   */
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
  /**
   * UUID اصلی Case.
   *
   * همین UUID برای Assessment Backend استفاده می‌شود.
   */
  id: string;

  /**
   * شناسه کوتاه برای نمایش.
   */
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

  /**
   * Legacy compatibility.
   */
  heightCm?: number;

  weightKg?: number;

  neckMobility?:
    NeckMobility;

  /**
   * بعد از تکمیل تمام عکس‌های الزامی،
   * Case قفل می‌شود.
   */
  preopLockedAt?: string;

  captureCompletedAt?: string;

  createdAt: string;

  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Photo                                                                      */
/* -------------------------------------------------------------------------- */

export interface StoredPhoto {
  /**
   * UUID عکس.
   *
   * همین UUID به Backend ارسال می‌شود تا
   * retry باعث duplicate نشود.
   */
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