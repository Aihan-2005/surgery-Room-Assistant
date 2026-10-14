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
          : crypto.randomUUID(),

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
      crypto.randomUUID(),

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
      "اطلاعات بازیابی این نصب موجود نیست.",

      "DEVICE_RECOVERY_REQUIRED",

      401,
    );
  }

  const result =
    await requestRecoveryKey(
      profile.deviceToken,
    );

  if (
    !result.response.ok
  ) {

    
    if (
      result.response.status ===
      401
    ) {
      throw new OperatorDeviceError(
        "اتصال این نصب نیاز به بررسی دارد. اطلاعات و شناسه دستگاه حفظ شده‌اند.",

        "DEVICE_RECOVERY_REQUIRED",

        401,
      );
    }

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

 
export async function ensureOperatorRegistered(
 
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
 
  if (
    profile.deviceToken
  ) {
    if (
      !profile.recoveryKey
    ) {
      profile =
        await ensureOperatorRecoveryKey();
    }

    return profile;
  }

 
  if (
    profile.recoveryKey
  ) {
    return recoverOperatorDevice();
  }
 
  const registration =
    await requestRegistration(
      profile.id,
      profile.fullName,
    );

 
  if (
    registration.response.status ===
    409
  ) {
    throw new OperatorDeviceError(
      "این نصب قبلاً ثبت شده است اما اطلاعات بازیابی آن روی دستگاه موجود نیست.",

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

  let registered:
    OperatorProfile = {
    ...profile,

   
    deviceToken:
      token,

    recoveryKey:
      registration.data
        .recovery_key,

    registeredAt:
      now,

    updatedAt:
      now,
  };

  saveOperatorProfile(
    registered,
  );

 
  if (
    !registered.recoveryKey
  ) {
    registered =
      await ensureOperatorRecoveryKey();
  }

  return registered;
}


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

