import type {
  OperatorProfile,
} from "@/lib/domain/types";

import {
  createUuidV4,
} from "@/lib/utils/uuid";


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


interface BackendDeviceResponse {
  device_id?: string;

  token?: string;

  recovery_key?: string;

  detail?: string;

  code?: string;
}


export class OperatorDeviceError
  extends Error {
  code:
    string;

  status?:
    number;

  constructor(
    message:
      string,

    code:
      string,

    status?:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "OperatorDeviceError";

    this.code =
      code;

    this.status =
      status;
  }
}


function normalizeFullName(
  value:
    string,
) {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}


function sameDeviceId(
  first:
    string,

  second:
    string,
) {
  return (
    first
      .trim()
      .toLowerCase() ===
    second
      .trim()
      .toLowerCase()
  );
}


function isOperatorProfile(
  value:
    unknown,
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
    candidate.id.length >
      0 &&

    typeof candidate.fullName ===
      "string" &&
    candidate.fullName
      .trim()
      .length >
      0 &&

    candidate.version ===
      2 &&

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
      candidate.recoveryKey ===
        undefined ||
      typeof candidate.recoveryKey ===
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


function migrateLegacyProfile():
  | OperatorProfile
  | null {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  const raw =
    window.localStorage
      .getItem(
        LEGACY_STORAGE_KEY,
      );

  if (!raw) {
    return null;
  }

  try {
    const legacy =
      JSON.parse(
        raw,
      ) as
        LegacyOperatorProfile;

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
      new Date()
        .toISOString();

    const profile:
      OperatorProfile = {
      id:
        typeof legacy.id ===
          "string" &&
        legacy.id.length >
          0
          ? legacy.id
          : createUuidV4(),

      fullName,

      version:
        2,

      createdAt:
        legacy.createdAt ??
        now,

      updatedAt:
        now,
    };

    saveOperatorProfile(
      profile,
    );

    window.localStorage
      .removeItem(
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
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  const raw =
    window.localStorage
      .getItem(
        STORAGE_KEY,
      );

  if (!raw) {
    return migrateLegacyProfile();
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
      window.localStorage
        .removeItem(
          STORAGE_KEY,
        );

      return migrateLegacyProfile();
    }

    return parsed;
  } catch {
    window.localStorage
      .removeItem(
        STORAGE_KEY,
      );

    return migrateLegacyProfile();
  }
}


export function createLocalOperatorProfile(
  fullName:
    string,
): OperatorProfile {
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

  /*
   * اگر profile قبلاً وجود دارد،
   * هیچ UUID جدیدی تولید نکن.
   */
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
    new Date()
      .toISOString();

  const profile:
    OperatorProfile = {
    id:
      createUuidV4(),

    fullName:
      normalized,

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

  window.localStorage
    .removeItem(
      LEGACY_STORAGE_KEY,
    );

  return profile;
}


/* -------------------------------------------------------------------------- */
/* Backend helpers                                                            */
/* -------------------------------------------------------------------------- */

async function readDeviceResponse(
  response:
    Response,
): Promise<BackendDeviceResponse> {
  try {
    return (
      await response.json()
    ) as
      BackendDeviceResponse;
  } catch {
    return {};
  }
}


async function requestRegistration(
  deviceId:
    string,

  fullName:
    string,
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

  return {
    response,

    data:
      await readDeviceResponse(
        response,
      ),
  };
}


async function requestRecoveryKey(
  token:
    string,
) {
  const response =
    await fetch(
      "/api/device/recovery-key",
      {
        method:
          "POST",

        headers: {
          Accept:
            "application/json",

          "X-Device-Token":
            token,
        },

        cache:
          "no-store",
      },
    );

  return {
    response,

    data:
      await readDeviceResponse(
        response,
      ),
  };
}


async function requestRecovery(
  deviceId:
    string,

  recoveryKey:
    string,
) {
  const response =
    await fetch(
      "/api/device/recover",
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

            recovery_key:
              recoveryKey,
          }),

        cache:
          "no-store",
      },
    );

  return {
    response,

    data:
      await readDeviceResponse(
        response,
      ),
  };
}


function throwCommonDeviceError(
  response:
    Response,

  data:
    BackendDeviceResponse,

  fallbackCode:
    string,

  fallbackMessage:
    string,
): never {
  if (
    response.status ===
    403
  ) {
    throw new OperatorDeviceError(
      "این دستگاه توسط مدیر غیرفعال شده است.",

      "DEVICE_DISABLED",

      403,
    );
  }

  if (
    response.status ===
    429
  ) {
    throw new OperatorDeviceError(
      "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",

      "DEVICE_RATE_LIMITED",

      429,
    );
  }

  if (
    response.status >=
    500
  ) {
    throw new OperatorDeviceError(
      "ارتباط با سرور موقتاً در دسترس نیست.",

      "BACKEND_UNAVAILABLE",

      response.status,
    );
  }

  throw new OperatorDeviceError(
    data.detail ||
      fallbackMessage,

    data.code ||
      fallbackCode,

    response.status,
  );
}


/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * همان installation را با همان UUID ثبت می‌کند.
 *
 * این تابع هیچ‌وقت UUID جدید تولید نمی‌کند.
 *
 * برای دو حالت استفاده می‌شود:
 *
 * 1. اولین registration واقعی
 * 2. Backend/Database تازه شده و token قدیمی
 *    Browser دیگر در Backend وجود ندارد.
 */
async function registerSameInstallation(
  profile:
    OperatorProfile,
): Promise<OperatorProfile> {
  const registration =
    await requestRegistration(
      profile.id,
      profile.fullName,
    );

  /*
   * UUID در Backend وجود دارد.
   *
   * مهم:
   * UUID جدید نساز.
   */
  if (
    registration.response.status ===
    409
  ) {
    throw new OperatorDeviceError(
      "این دستگاه قبلاً در سرور ثبت شده است اما اطلاعات بازیابی آن در این نصب موجود نیست.",

      "DEVICE_RECOVERY_REQUIRED",

      409,
    );
  }

  if (
    !registration.response.ok
  ) {
    throwCommonDeviceError(
      registration.response,
      registration.data,
      "DEVICE_REGISTRATION_FAILED",
      "ثبت دستگاه انجام نشد.",
    );
  }

  const token =
    registration.data.token;

  if (!token) {
    throw new OperatorDeviceError(
      "Device token از سرور دریافت نشد.",

      "DEVICE_TOKEN_MISSING",
    );
  }

  if (
    registration.data.device_id &&
    !sameDeviceId(
      registration.data.device_id,
      profile.id,
    )
  ) {
    throw new OperatorDeviceError(
      "شناسه Device برگشتی با شناسه این نصب مطابقت ندارد.",

      "DEVICE_ID_MISMATCH",
    );
  }

  const now =
    new Date()
      .toISOString();

  const registered:
    OperatorProfile = {
    ...profile,

    /*
     * profile.id عمداً تغییر نمی‌کند.
     */
    deviceToken:
      token,

    recoveryKey:
      registration.data
        .recovery_key,

    registeredAt:
      profile.registeredAt ??
      now,

    updatedAt:
      now,
  };

  saveOperatorProfile(
    registered,
  );

  return registered;
}


/* -------------------------------------------------------------------------- */
/* Recovery key                                                               */
/* -------------------------------------------------------------------------- */

export async function ensureOperatorRecoveryKey():
  Promise<OperatorProfile> {
  const profile =
    getOperatorProfile();

  if (!profile) {
    throw new OperatorDeviceError(
      "مشخصات پزشک روی دستگاه موجود نیست.",

      "OPERATOR_PROFILE_REQUIRED",
    );
  }

  if (
    profile.recoveryKey
  ) {
    return profile;
  }

  if (
    !profile.deviceToken
  ) {
    throw new OperatorDeviceError(
      "Device token موجود نیست.",

      "DEVICE_TOKEN_REQUIRED",

      401,
    );
  }

  const result =
    await requestRecoveryKey(
      profile.deviceToken,
    );

  /*
   * سناریوی مهم:
   *
   * Browser هنوز token قدیمی دارد،
   * ولی Backend/DB جدید آن token را نمی‌شناسد.
   *
   * در این حالت بدون تغییر UUID،
   * همان Device UUID را یک بار register می‌کنیم.
   */
  if (
    result.response.status ===
    401
  ) {
    try {
      return await registerSameInstallation(
        profile,
      );
    } catch (
      error
    ) {
      if (
        error instanceof
          OperatorDeviceError &&
        error.status ===
          409
      ) {
        throw new OperatorDeviceError(
          "اتصال این نصب نیاز به بررسی دارد. شناسه دستگاه و اطلاعات بیمار حفظ شده‌اند.",

          "DEVICE_RECOVERY_REQUIRED",

          409,
        );
      }

      throw error;
    }
  }

  if (
    !result.response.ok
  ) {
    throwCommonDeviceError(
      result.response,
      result.data,
      "RECOVERY_KEY_FAILED",
      "دریافت اطلاعات بازیابی انجام نشد.",
    );
  }

  const recoveryKey =
    result.data
      .recovery_key;

  if (!recoveryKey) {
    throw new OperatorDeviceError(
      "سرور recovery key را برنگرداند.",

      "RECOVERY_KEY_MISSING",
    );
  }

  if (
    result.data.device_id &&
    !sameDeviceId(
      result.data.device_id,
      profile.id,
    )
  ) {
    throw new OperatorDeviceError(
      "شناسه دستگاه با اطلاعات محلی مطابقت ندارد.",

      "DEVICE_ID_MISMATCH",
    );
  }

  const updated:
    OperatorProfile = {
    ...profile,

    recoveryKey,

    updatedAt:
      new Date()
        .toISOString(),
  };

  saveOperatorProfile(
    updated,
  );

  return updated;
}


/* -------------------------------------------------------------------------- */
/* Device recovery                                                            */
/* -------------------------------------------------------------------------- */

export async function recoverOperatorDevice():
  Promise<OperatorProfile> {
  const profile =
    getOperatorProfile();

  if (!profile) {
    throw new OperatorDeviceError(
      "مشخصات پزشک روی دستگاه موجود نیست.",

      "OPERATOR_PROFILE_REQUIRED",
    );
  }

  if (
    !profile.recoveryKey
  ) {
    throw new OperatorDeviceError(
      "اطلاعات بازیابی این نصب موجود نیست.",

      "DEVICE_RECOVERY_REQUIRED",

      401,
    );
  }

  const result =
    await requestRecovery(
      profile.id,
      profile.recoveryKey,
    );

  if (
    !result.response.ok
  ) {
    /*
     * Recovery ناموفق است.
     *
     * هیچ Device جدیدی نساز.
     */
    if (
      result.response.status ===
      401
    ) {
      throw new OperatorDeviceError(
        "بازیابی اتصال این دستگاه انجام نشد و نیاز به بررسی دارد.",

        "DEVICE_RECOVERY_FAILED",

        401,
      );
    }

    throwCommonDeviceError(
      result.response,
      result.data,
      "DEVICE_RECOVERY_FAILED",
      "بازیابی Device انجام نشد.",
    );
  }

  const token =
    result.data.token;

  if (!token) {
    throw new OperatorDeviceError(
      "سرور token جدید را برنگرداند.",

      "DEVICE_TOKEN_MISSING",
    );
  }

  if (
    result.data.device_id &&
    !sameDeviceId(
      result.data.device_id,
      profile.id,
    )
  ) {
    throw new OperatorDeviceError(
      "شناسه Device بعد از recovery تغییر کرده است.",

      "DEVICE_ID_MISMATCH",
    );
  }

  const now =
    new Date()
      .toISOString();

  const recovered:
    OperatorProfile = {
    ...profile,

    /*
     * فقط token تعویض می‌شود.
     *
     * UUID و recoveryKey ثابت می‌مانند.
     */
    deviceToken:
      token,

    registeredAt:
      profile.registeredAt ??
      now,

    updatedAt:
      now,
  };

  saveOperatorProfile(
    recovered,
  );

  return recovered;
}


/* -------------------------------------------------------------------------- */
/* Public registration entry                                                  */
/* -------------------------------------------------------------------------- */

export async function ensureOperatorRegistered(
  /*
   * برای compatibility با callerهای قدیمی
   * نگه داشته شده است.
   *
   * force دیگر باعث ساخت UUID جدید نمی‌شود.
   */
  _options?: {
    force?: boolean;
  },
): Promise<OperatorProfile> {
  let profile =
    getOperatorProfile();

  if (!profile) {
    throw new OperatorDeviceError(
      "مشخصات پزشک روی دستگاه موجود نیست.",

      "OPERATOR_PROFILE_REQUIRED",
    );
  }


  /*
   * Token داریم.
   */
  if (
    profile.deviceToken
  ) {
    /*
     * Installation جدید:
     * recoveryKey از registration ذخیره شده.
     */
    if (
      profile.recoveryKey
    ) {
      return profile;
    }

    /*
     * Installation قدیمی:
     *
     * token دارد ولی recoveryKey ندارد.
     */
    profile =
      await ensureOperatorRecoveryKey();

    return profile;
  }


  /*
   * Token نداریم ولی recoveryKey داریم.
   *
   * همان Device را recover کن.
   */
  if (
    profile.recoveryKey
  ) {
    return recoverOperatorDevice();
  }


  /*
   * نه token داریم نه recoveryKey.
   *
   * همان UUID اولیه را register کن.
   */
  profile =
    await registerSameInstallation(
      profile,
    );


  /*
   * Backend فعلی recovery_key را مستقیم
   * همراه registration برمی‌گرداند.
   *
   * اگر Backend قدیمی‌تر بود و key را
   * برنگرداند، اکنون با token معتبر
   * recovery key را provision کن.
   */
  if (
    !profile.recoveryKey
  ) {
    profile =
      await ensureOperatorRecoveryKey();
  }


  return profile;
}


/* -------------------------------------------------------------------------- */
/* Clear                                                                      */
/* -------------------------------------------------------------------------- */

export function clearOperatorProfile() {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.localStorage
    .removeItem(
      STORAGE_KEY,
    );

  window.localStorage
    .removeItem(
      LEGACY_STORAGE_KEY,
    );
}

