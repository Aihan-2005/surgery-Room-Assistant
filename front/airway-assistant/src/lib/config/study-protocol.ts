import type {
  CaptureKind,
} from "@/lib/domain/types";

export const STUDY_PROTOCOL_VERSION =
  "AIRWAY-PROSPECTIVE-v1.2";

export const CONSENT_VERSION =
  "AIRWAY-CONSENT-v1.0";


  
export const REQUIRED_CAPTURE_KINDS =
  [] as const satisfies readonly CaptureKind[];


  
export const MIN_PHOTOS_PER_REQUIRED_POSITION =
  0;


  
export const MIN_TOTAL_PHOTOS =
  1;

  
export const MAX_PHOTOS_PER_POSITION =
  5;