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
  | "awaiting_outcome"
  | "outcome_complete"
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

/**
 * پروفایل پزشک/دستگاه ثبت‌شده در Backend.
 *
 * id:
 * همان device_id است که برای Django ارسال می‌شود.
 *
 * deviceToken:
 * Token صادرشده توسط Backend است و برای
 * Authorization: Device <token>
 * استفاده می‌شود.
 */
export interface OperatorProfile {
  /**
   * Local unique operator/device ID.
   */
  id: string;

  fullName: string;

  /**
   * Undefined تا زمانی که Device
   * در Backend register نشده باشد.
   */
  deviceToken?: string;

  registeredAt?: string;

  version: 2;

  createdAt: string;

  updatedAt: string;
}
/* -------------------------------------------------------------------------- */
/* Airway classifications                                                     */
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

export type CormackLehaneGrade =
  | 1
  | 2
  | 3
  | 4
  | "unknown";

export type InitialAirwayDevice =
  | "direct_laryngoscope"
  | "video_laryngoscope"
  | "flexible_bronchoscope"
  | "fiberoptic"
  | "supraglottic_airway"
  | "other"
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
   * Legacy compatibility.
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

  /**
   * QC ممکن است بعداً metricهای بیشتری داشته باشد.
   */
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
  /**
   * برای Case جدید در createCase اجباری می‌شود.
   * Optional بودن اینجا فقط برای سازگاری داده‌های قدیمی است.
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

  /**
   * complete:
   * چرخش کامل
   *
   * incomplete:
   * چرخش ناکامل
   */
  headRotationStatus?:
    HeadRotationStatus;

  /**
   * Legacy field.
   */
  neckRotationDegrees?: number;

  /**
   * فعلاً از فرم حذف شده‌اند،
   * ولی برای backward compatibility نگه داشته می‌شوند.
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
/* Outcome                                                                    */
/* -------------------------------------------------------------------------- */

export interface IntubationOutcome {
  caseId: string;

  finalizedAt: string;

  attemptCount: number;

  cormackLehaneGrade:
    CormackLehaneGrade;

  initialDevice:
    InitialAirwayDevice;

  strategyEscalation: boolean;

  bougieUsed: boolean;

  styletUsed: boolean;

  videoLaryngoscopeUsed: boolean;

  supraglotticRescueUsed: boolean;

  operatorExperienceYears?: number;

  lowestSpO2Percent?: number;

  complications?: string;

  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Case                                                                       */
/* -------------------------------------------------------------------------- */

export interface AirwayCase {
  /**
   * UUID اصلی Case.
   *
   * همین UUID به‌عنوان Assessment ID
   * به Backend ارسال می‌شود.
   */
  id: string;

  /**
   * شناسه کوتاه فقط برای نمایش.
   */
  caseCode: string;

  protocolVersion: string;

  /**
   * همان Device ID پزشک.
   *
   * Optional برای Caseهای قدیمی.
   */
  operatorId?: string;

  /**
   * Snapshot نام پزشک هنگام ایجاد Case.
   */
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

  preopLockedAt?: string;

  captureCompletedAt?: string;

  outcomeCompletedAt?: string;

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
   * همین مقدار به Backend به‌عنوان
   * AssessmentPhoto ID ارسال می‌شود.
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
    | "outcome_finalized"
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