import type {
  OperatorProfile,
} from "@/lib/domain/types";

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY =
  "airway-assistant:operator-profile:v2";

const LEGACY_STORAGE_KEY =
  "airway-assistant:operator-profile:v1";

/* -------------------------------------------------------------------------- */
/* Internal types                                                             */
/* -------------------------------------------------------------------------- */

interface LegacyOperatorProfile {
  id?: string;

  fullName?: string;

  version?: number;

  createdAt?: string;

  updatedAt?: string;
}

interface BackendRegistrationResponse {
  token?: string;

  detail?: string;

  code?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeFullName(
  value: string,
) {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function isOperatorProfile(
  value: unknown,
): value is OperatorProfile {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }

  const candidate =
    value as
      Partial<OperatorProfile>;

  return (
    typeof candidate.id ===
      "string" &&
    candidate.id.length > 0 &&

    typeof candidate.fullName ===
      "string" &&
    candidate.fullName.trim()
      .length > 0 &&

    typeof candidate.deviceToken ===
      "string" &&
    candidate.deviceToken.length >
      0 &&

    typeof candidate.registeredAt ===
      "string" &&
    candidate.registeredAt.length >
      0 &&

    candidate.version === 2 &&

    typeof candidate.createdAt ===
      "string" &&

    typeof candidate.updatedAt ===
      "string"
  );
}

function saveOperatorProfile(
  profile:
    OperatorProfile,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      profile,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Read current V2 profile                                                    */
/* -------------------------------------------------------------------------- */

export function getOperatorProfile():
  | OperatorProfile
  | null {
  if (
    typeof window ===
    "undefined"
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
    const parsed:
      unknown =
      JSON.parse(
        raw,
      );

    if (
      !isOperatorProfile(
        parsed,
      )
    ) {
      /**
       * داده خراب یا ناقص را نگه نمی‌داریم.
       */
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

/* -------------------------------------------------------------------------- */
/* Legacy profile                                                             */
/* -------------------------------------------------------------------------- */

/**
 * از نسخه قبلی فقط نام پزشک را نگه می‌داریم.
 *
 * Token قدیمی وجود نداشته؛ بنابراین V1 نمی‌تواند
 * مستقیماً به V2 تبدیل شود و باید یک بار Backend
 * registration انجام شود.
 */
export function getLegacyOperatorName():
  | string
  | null {
  if (
    typeof window ===
    "undefined"
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
    const parsed =
      JSON.parse(
        raw,
      ) as
        LegacyOperatorProfile;

    if (
      typeof parsed.fullName !==
      "string"
    ) {
      return null;
    }

    const normalized =
      normalizeFullName(
        parsed.fullName,
      );

    return (
      normalized ||
      null
    );
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Backend registration request                                               */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Register operator                                                          */
/* -------------------------------------------------------------------------- */

/**
 * اولین بار:
 *
 * 1. UUID برای device می‌سازیم.
 * 2. نام پزشک + UUID را به Next API می‌فرستیم.
 * 3. Next API آن را به Django Backend می‌فرستد.
 * 4. Backend یک token صادر می‌کند.
 * 5. token و device ID روی دستگاه ذخیره می‌شوند.
 *
 * دفعات بعد:
 * profile موجود برگردانده می‌شود و registration
 * دوباره انجام نمی‌شود.
 */
export async function registerOperator(
  fullName: string,
): Promise<OperatorProfile> {
  if (
    typeof window ===
    "undefined"
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
 
  let deviceId =
    crypto.randomUUID();

  let registration =
    await requestRegistration(
      deviceId,
      normalizedFullName,
    );

  /**
   * Backend برای Device ID تکراری 409 می‌دهد
   * چون token قبلی را مجدداً صادر نمی‌کند.
   *
   * در این حالت UUID تازه می‌سازیم.
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
        normalizedFullName,
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

  const profile:
    OperatorProfile = {
    id:
      deviceId,

    fullName:
      normalizedFullName,

    deviceToken:
      token,

    registeredAt:
      now,

    version:
      2,

    createdAt:
      now,

    updatedAt:
      now,
  };

  saveOperatorProfile(
    profile,
  );

  /**
   * بعد از migration موفق دیگر به profile v1
   * احتیاجی نداریم.
   */
  window.localStorage.removeItem(
    LEGACY_STORAGE_KEY,
  );

  return profile;
}

/* -------------------------------------------------------------------------- */
/* Clear profile                                                              */
/* -------------------------------------------------------------------------- */

export function clearOperatorProfile() {
  if (
    typeof window ===
    "undefined"
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