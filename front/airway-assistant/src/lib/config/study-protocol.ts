import type {
  CaptureKind,
} from "@/lib/domain/types";

export const STUDY_PROTOCOL_VERSION =
  "AIRWAY-PROSPECTIVE-v1.0";

export const CONSENT_VERSION =
  "AIRWAY-CONSENT-v1.0";

export const REQUIRED_CAPTURE_KINDS =
  [
    "upper_lip_bite_front",
    "lateral_neutral",
  ] as const satisfies readonly CaptureKind[];