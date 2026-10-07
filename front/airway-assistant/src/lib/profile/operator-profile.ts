import type {
  OperatorProfile,
} from "@/lib/domain/types";

const STORAGE_KEY =
  "airway-assistant:operator-profile:v1";

function normalizeFullName(
  value: string,
) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function isOperatorProfile(
  value: unknown,
): value is OperatorProfile {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate =
    value as Partial<OperatorProfile>;

  return (
    typeof candidate.id ===
      "string" &&
    candidate.id.length > 0 &&
    typeof candidate.fullName ===
      "string" &&
    candidate.fullName.trim()
      .length > 0 &&
    candidate.version === 1 &&
    typeof candidate.createdAt ===
      "string" &&
    typeof candidate.updatedAt ===
      "string"
  );
}

export function getOperatorProfile():
  | OperatorProfile
  | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  const raw =
    window.localStorage.getItem(
      STORAGE_KEY,
    );

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(raw);

    if (
      !isOperatorProfile(
        parsed,
      )
    ) {
      window.localStorage.removeItem(
        STORAGE_KEY,
      );

      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(
      STORAGE_KEY,
    );

    return null;
  }
}

export function createOperatorProfile(
  fullName: string,
): OperatorProfile {
  if (
    typeof window === "undefined"
  ) {
    throw new Error(
      "OPERATOR_PROFILE_CLIENT_ONLY",
    );
  }

  const existing =
    getOperatorProfile();

  if (existing) {
    return existing;
  }

  const normalizedFullName =
    normalizeFullName(
      fullName,
    );

  if (
    !normalizedFullName
  ) {
    throw new Error(
      "OPERATOR_NAME_REQUIRED",
    );
  }

  const now =
    new Date().toISOString();

  const profile:
    OperatorProfile = {
    id:
      crypto.randomUUID(),

    fullName:
      normalizedFullName,

    version: 1,

    createdAt:
      now,

    updatedAt:
      now,
  };

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      profile,
    ),
  );

  return profile;
}

export function clearOperatorProfile() {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.removeItem(
    STORAGE_KEY,
  );
}