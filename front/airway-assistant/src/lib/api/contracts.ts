import type {
  AirwayCase,
  CaptureKind,
  CaptureSource,
  ImageQualityMetrics,
} from "@/lib/domain/types";

export const CASE_UPLOAD_SCHEMA_VERSION =
  "1.0";

export interface CaseUploadPhotoMetadata {
  id: string;

  formField: string;

  kind: CaptureKind;

  filename: string;

  mimeType: string;

  source: CaptureSource;

  qc: ImageQualityMetrics;

  createdAt: string;
}

export interface CaseUploadMetadata {
  schemaVersion: string;

  exportedAt: string;

  case: AirwayCase;

  photos:
    CaseUploadPhotoMetadata[];
}

export interface CaseSyncSuccessResponse {
  success: true;

  remoteCaseId?: string;

  receivedAt?: string;
}

export interface CaseSyncErrorResponse {
  success: false;

  code: string;

  message: string;
}

export type CaseSyncResponse =
  | CaseSyncSuccessResponse
  | CaseSyncErrorResponse;