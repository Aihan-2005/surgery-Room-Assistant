import type {
  OperatorProfile,
} from "@/lib/domain/types";


const STORAGE_KEY =
  "airway-assistant:operator-profile:v2";

const LEGACY_STORAGE_KEY =
  "airway-assistant:operator-profile:v1";


interface LegacyOperatorProfile {
  id?: string;

  fullName?: string;

  createdAt?: string;

  updatedAt?: string;
}


interface BackendRegistrationResponse {
  token?: string;

  detail?: string;

  code?: string;
}


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

    candidate.version === 2 &&

    typeof candidate.createdAt ===
      "string" &&

    typeof candidate.updatedAt ===
      "string" &&

    (
      candidate.deviceToken ===
        undefined ||
      typeof candidate.deviceToken ===
        "string"
    ) &&

    (
      candidate.registeredAt ===
        undefined ||
      typeof candidate.registeredAt ===
        "string"
    )
  );
}


function saveOperatorProfile(
  profile:
    OperatorProfile,
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(profile),
  );
}


function migrateLegacyProfile():
  | OperatorProfile
  | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  const raw =
    window.localStorage.getItem(
      LEGACY_STORAGE_KEY,
    );

  if (!raw) {
    return null;
  }

  try {
    const legacy =
      JSON.parse(
        raw,
      ) as LegacyOperatorProfile;

    const fullName =
      typeof legacy.fullName ===
        "string"
        ? normalizeFullName(
            legacy.fullName,
          )
        : "";

    if (!fullName) {
      return null;
    }

    const now =
      new Date().toISOString();

    const profile:
      OperatorProfile = {
      id:
        typeof legacy.id ===
          "string" &&
        legacy.id.length > 0
          ? legacy.id
          : crypto.randomUUID(),

      fullName,

      version: 2,

      createdAt:
        legacy.createdAt ??
        now,

      updatedAt:
        now,
    };

    saveOperatorProfile(
      profile,
    );

    window.localStorage.removeItem(
      LEGACY_STORAGE_KEY,
    );

    return profile;
  } catch {
    return null;
  }
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
    return migrateLegacyProfile();
  }

  try {
    const parsed:
      unknown =
      JSON.parse(raw);

    if (
      !isOperatorProfile(
        parsed,
      )
    ) {
      window.localStorage.removeItem(
        STORAGE_KEY,
      );

      return migrateLegacyProfile();
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(
      STORAGE_KEY,
    );

    return migrateLegacyProfile();
  }
}


export function createLocalOperatorProfile(
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

  const normalized =
    normalizeFullName(
      fullName,
    );

  if (!normalized) {
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
      normalized,

    version: 2,

    createdAt:
      now,

    updatedAt:
      now,
  };

  saveOperatorProfile(
    profile,
  );

  window.localStorage.removeItem(
    LEGACY_STORAGE_KEY,
  );

  return profile;
}


async function requestRegistration(
  deviceId: string,
  fullName: string,
) {
  const response =
    await fetch(
      "/api/device/register",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            device_id:
              deviceId,

            doctor_name:
              fullName,
          }),

        cache:
          "no-store",
      },
    );

  let data:
    BackendRegistrationResponse =
    {};

  try {
    data =
      (await response.json()) as
        BackendRegistrationResponse;
  } catch {
    data = {};
  }

  return {
    response,
    data,
  };
}


export async function ensureOperatorRegistered(
  options?: {
    force?: boolean;
  },
): Promise<OperatorProfile> {
  const profile =
    getOperatorProfile();

  if (!profile) {
    throw new Error(
      "OPERATOR_PROFILE_REQUIRED",
    );
  }

  const force =
    options?.force === true;

  if (
    profile.deviceToken &&
    !force
  ) {
    return profile;
  }

  let deviceId =
    force
      ? crypto.randomUUID()
      : profile.id;

  let registration =
    await requestRegistration(
      deviceId,
      profile.fullName,
    );

  /*
   * Backend cannot re-issue an old token.
   * If the ID is already registered but this
   * browser no longer has its token, register
   * a fresh device ID.
   */
  if (
    registration.response.status ===
    409
  ) {
    deviceId =
      crypto.randomUUID();

    registration =
      await requestRegistration(
        deviceId,
        profile.fullName,
      );
  }

  if (
    !registration.response.ok
  ) {
    if (
      registration.response.status ===
      429
    ) {
      throw new Error(
        "REGISTRATION_RATE_LIMITED",
      );
    }

    if (
      registration.data.code ===
      "BACKEND_NOT_CONFIGURED"
    ) {
      throw new Error(
        "BACKEND_NOT_CONFIGURED",
      );
    }

    if (
      registration.response.status >=
      500
    ) {
      throw new Error(
        "BACKEND_UNAVAILABLE",
      );
    }

    throw new Error(
      registration.data.detail ||
      "DEVICE_REGISTRATION_FAILED",
    );
  }

  const token =
    registration.data.token;

  if (!token) {
    throw new Error(
      "DEVICE_TOKEN_MISSING",
    );
  }

  const now =
    new Date().toISOString();

  const registered:
    OperatorProfile = {
    ...profile,

    id:
      deviceId,

    deviceToken:
      token,

    registeredAt:
      now,

    updatedAt:
      now,
  };

  saveOperatorProfile(
    registered,
  );

  return registered;
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

  window.localStorage.removeItem(
    LEGACY_STORAGE_KEY,
  );
}