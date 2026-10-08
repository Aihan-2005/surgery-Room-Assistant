import {
  NextResponse,
} from "next/server";

import type {
  AirwayCase,
} from "@/lib/domain/types";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REQUEST_TIMEOUT_MS =
  10_000;

function getBackendBaseUrl():
  | string
  | null {
  const raw =
    process.env
      .BACKEND_API_URL
      ?.trim();

  if (!raw) {
    return null;
  }

  const normalized =
    raw
      .replace(
        /\\/g,
        "",
      )
      .replace(
        /\/+$/,
        "",
      );

  try {
    const url =
      new URL(
        normalized,
      );

    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function backendHeaders(
  token:
    string,
  json = false,
) {
  const headers =
    new Headers();

  headers.set(
    "Accept",
    "application/json",
  );

  headers.set(
    "Authorization",
    `Device ${token}`,
  );

  if (json) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  return headers;
}

async function fetchWithTimeout(
  url:
    string,
  init:
    RequestInit,
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    return await fetch(
      url,
      {
        ...init,

        cache:
          "no-store",

        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

async function readPayload(
  response:
    Response,
) {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(
      text,
    ) as unknown;
  } catch {
    return {
      detail:
        text,
    };
  }
}

function mapSex(
  sex:
    AirwayCase[
      "clinical"
    ][
      "sex"
    ],
) {
  switch (sex) {
    case "male":
      return "M";

    case "female":
      return "F";

    default:
      throw new Error(
        "INVALID_SEX",
      );
  }
}

function mapNeckMovement(
  status:
    AirwayCase[
      "clinical"
    ][
      "headRotationStatus"
    ],
) {
  switch (status) {
    case "complete":
      return "normal";

    case "incomplete":
      return "limited";

    default:
      throw new Error(
        "INVALID_NECK_MOVEMENT",
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Connectivity                                                               */
/* -------------------------------------------------------------------------- */

export async function GET(
  request:
    Request,
) {
  const backendUrl =
    getBackendBaseUrl();

  if (!backendUrl) {
    return NextResponse.json({
      configured:
        false,

      reachable:
        false,

      databaseReady:
        false,

      authenticated:
        false,
    });
  }

  const token =
    request.headers
      .get(
        "x-device-token",
      )
      ?.trim();

  try {
    /*
     * Backend فعلی /api/health/ ندارد.
     *
     * بنابراین endpoint واقعی assessments
     * را probe می‌کنیم.
     *
     * بدون token معمولاً 401 طبیعی است و
     * یعنی Django در دسترس است.
     */
    const response =
      await fetchWithTimeout(
        `${backendUrl}/api/assessments/`,
        {
          method:
            "GET",

          headers:
            token
              ? backendHeaders(
                  token,
                )
              : {
                  Accept:
                    "application/json",
                },
        },
      );

    const status =
      response.status;

    const reachable =
      response.ok ||
      status === 401 ||
      status === 403;

    /*
     * وقتی token داریم، authentication
     * برای بررسی Device به DB دسترسی می‌زند.
     *
     * بنابراین 200/401/403 نشان می‌دهد Django
     * حداقل توانسته request را پردازش کند.
     *
     * بدون token، 401 الزاماً DB را تست نمی‌کند.
     */
    const databaseReady =
      Boolean(
        token,
      ) &&
      reachable;

    return NextResponse.json({
      configured:
        true,

      reachable,

      databaseReady,

      authenticated:
        response.ok,

      status,
    });
  } catch (
    error
  ) {
    console.error(
      "Backend connectivity probe failed:",
      error,
    );

    return NextResponse.json({
      configured:
        true,

      reachable:
        false,

      databaseReady:
        false,

      authenticated:
        false,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Sync case metadata                                                         */
/* -------------------------------------------------------------------------- */

export async function POST(
  request:
    Request,
) {
  const backendUrl =
    getBackendBaseUrl();

  if (!backendUrl) {
    return NextResponse.json(
      {
        success:
          false,

        code:
          "BACKEND_NOT_CONFIGURED",

        message:
          "Backend API تنظیم نشده است.",
      },
      {
        status: 503,
      },
    );
  }

  const token =
    request.headers
      .get(
        "x-device-token",
      )
      ?.trim();

  if (!token) {
    return NextResponse.json(
      {
        success:
          false,

        code:
          "DEVICE_TOKEN_REQUIRED",

        message:
          "Device token موجود نیست.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const body =
      (await request.json()) as {
        case?:
          AirwayCase;
      };

    const airwayCase =
      body.case;

    if (!airwayCase) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "CASE_REQUIRED",

          message:
            "Case موجود نیست.",
        },
        {
          status: 400,
        },
      );
    }

    const clinical =
      airwayCase.clinical;

    if (
      !clinical.fullName
        ?.trim() ||
      clinical.ageYears ===
        undefined ||
      clinical.heightCm ===
        undefined ||
      clinical.weightKg ===
        undefined ||
      !clinical
        .headRotationStatus ||
      clinical.sex ===
        "unknown"
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "INCOMPLETE_CASE",

          message:
            "اطلاعات بیمار کامل نیست.",
        },
        {
          status: 400,
        },
      );
    }

    const assessmentPayload = {
      full_name:
        clinical.fullName.trim(),

      age:
        clinical.ageYears,

      sex:
        mapSex(
          clinical.sex,
        ),

      height_cm:
        clinical.heightCm,

      weight_kg:
        clinical.weightKg,

      neck_movement:
        mapNeckMovement(
          clinical.headRotationStatus,
        ),

      created_at:
        airwayCase.createdAt,
    };

    const response =
      await fetchWithTimeout(
        `${backendUrl}/api/assessments/${airwayCase.id}/`,
        {
          method:
            "PUT",

          headers:
            backendHeaders(
              token,
              true,
            ),

          body:
            JSON.stringify(
              assessmentPayload,
            ),
        },
      );

    const payload =
      await readPayload(
        response,
      );

    if (
      !response.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            response.status ===
              401
              ? "DEVICE_UNAUTHORIZED"
              : "ASSESSMENT_REJECTED",

          message:
            "Backend اطلاعات بیمار را نپذیرفت.",

          backend:
            payload,
        },
        {
          status:
            response.status,
        },
      );
    }

    return NextResponse.json({
      success:
        true,

      remoteCaseId:
        airwayCase.id,

      receivedAt:
        new Date()
          .toISOString(),
    });
  } catch (
    error
  ) {
    console.error(
      "Case metadata sync failed:",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        code:
          "SYNC_GATEWAY_ERROR",

        message:
          "ارتباط با Backend انجام نشد.",
      },
      {
        status: 502,
      },
    );
  }
}