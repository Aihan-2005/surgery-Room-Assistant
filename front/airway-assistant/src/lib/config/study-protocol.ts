import type {
  CaptureKind,
} from "@/lib/domain/types";

export const STUDY_PROTOCOL_VERSION =
  "AIRWAY-PROSPECTIVE-v1.1";

export const CONSENT_VERSION =
  "AIRWAY-CONSENT-v1.0";


  
export const REQUIRED_CAPTURE_KINDS =
  [
    "front_neutral",
    "mallampati",
    "mouth_open",
    "upper_lip_bite_front",
    "lateral_neutral",
    "head_back_side",
  ] as const satisfies readonly CaptureKind[];


  
export const MIN_PHOTOS_PER_REQUIRED_POSITION =
  1;


  
export const MAX_PHOTOS_PER_POSITION =
  5;

  