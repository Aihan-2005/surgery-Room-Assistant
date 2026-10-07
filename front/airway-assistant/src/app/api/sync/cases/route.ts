import {
  NextResponse,
} from "next/server";

import type {
  AirwayCase,
  CaptureKind,
} from "@/lib/domain/types";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REQUEST_TIMEOUT_MS =
  15_000;

interface PhotoMetadata {
  id: string;

  formField: string;

  kind: CaptureKind;

  filename: string;

  mimeType: string;
}

interface UploadMetadata {
  case:
    AirwayCase;

  photos:
    PhotoMetadata[];
}

function getBackendBaseUrl() {
  return process.env
    .BACKEND_API_URL
    ?.replace(
      /\/+$/,
      "",
    );
}

function backendHeaders(
  token: string,
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
  input:
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
      input,
      {
        ...init,

        signal:
          controller.signal,

        cache:
          "no-store",
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function mapSex(
  sex:
    AirwayCase["clinical"]["sex"],
) {
  if (
    sex === "male"
  ) {
    return "M";
  }

  if (
    sex === "female"
  ) {
    return "F";
  }

  throw new Error(
    "INVALID_SEX",
  );
}

function mapNeckMovement(
  status:
    AirwayCase["clinical"]["headRotationStatus"],
) {
  if (
    status ===
    "complete"
  ) {
    return "normal";
  }

  if (
    status ===
    "incomplete"
  ) {
    return "limited";
  }

  throw new Error(
    "INVALID_NECK_MOVEMENT",
  );
}

function mapPosition(
  kind:
    CaptureKind,
) {
  switch (kind) {
    case "front_neutral":
      return "front";

    case "mallampati":
      return "mallampati";

    case "mouth_open":
      return "open_mouth";

    case "lateral_neutral":
      return "side";

    /*
     * فقط برای داده legacy.
     */
    case "upper_lip_bite_front":
      return "front";
  }
}

async function parseBackendResponse(
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

/* -------------------------------------------------------------------------- */
/* Connectivity probe                                                         */
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

      authenticated:
        false,

      message:
        "Backend API تنظیم نشده است.",
    });
  }

  const token =
    request.headers.get(
      "x-device-token",
    );

  try {
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

    /*
     * حتی 401 یعنی خود Django در دسترس است.
     */
    const reachable =
      response.ok ||
      response.status ===
        401 ||
      response.status ===
        403;

    return NextResponse.json({
      configured:
        true,

      reachable,

      authenticated:
        response.ok,

      status:
        response.status,
    });
  } catch {
    return NextResponse.json(
      {
        configured:
          true,

        reachable:
          false,

        authenticated:
          false,

        message:
          "Backend در دسترس نیست.",
      },
      {
        status: 503,
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Full assessment sync                                                       */
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
    request.headers.get(
      "x-device-token",
    );

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
    const formData =
      await request.formData();

    const metadataValue =
      formData.get(
        "metadata",
      );

    if (
      typeof metadataValue !==
      "string"
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "INVALID_METADATA",

          message:
            "Metadata موجود نیست.",
        },
        {
          status: 400,
        },
      );
    }

    const metadata =
      JSON.parse(
        metadataValue,
      ) as UploadMetadata;

    const airwayCase =
      metadata.case;

    const clinical =
      airwayCase.clinical;

    if (
      !clinical.fullName ||
      clinical.ageYears ===
        undefined ||
      clinical.heightCm ===
        undefined ||
      clinical.weightKg ===
        undefined
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

    /* ------------------------------------------------------------------ */
    /* 1. Create/update Assessment                                         */
    /* ------------------------------------------------------------------ */

    const assessmentPayload = {
      full_name:
        clinical.fullName,

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

    const assessmentResponse =
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

    if (
      !assessmentResponse.ok
    ) {
      const backendError =
        await parseBackendResponse(
          assessmentResponse,
        );

      return NextResponse.json(
        {
          success:
            false,

          code:
            assessmentResponse.status ===
            401
              ? "DEVICE_UNAUTHORIZED"
              : "ASSESSMENT_REJECTED",

          message:
            "Backend اطلاعات بیمار را نپذیرفت.",

          backend:
            backendError,
        },
        {
          status:
            assessmentResponse.status,
        },
      );
    }

    /* ------------------------------------------------------------------ */
    /* 2. Upload photos                                                    */
    /* ------------------------------------------------------------------ */

    for (
      const photo of
      metadata.photos
    ) {
      const file =
        formData.get(
          photo.formField,
        );

      if (
        !file ||
        typeof file ===
          "string"
      ) {
        return NextResponse.json(
          {
            success:
              false,

            code:
              "PHOTO_FILE_MISSING",

            message:
              `فایل ${photo.id} موجود نیست.`,
          },
          {
            status: 400,
          },
        );
      }

      const backendPhotoForm =
        new FormData();

      backendPhotoForm.append(
        "position",
        mapPosition(
          photo.kind,
        ),
      );

      backendPhotoForm.append(
        "image",
        file,
        photo.filename,
      );

      const photoResponse =
        await fetchWithTimeout(
          `${backendUrl}/api/assessments/${airwayCase.id}/photos/${photo.id}/`,
          {
            method:
              "PUT",

            headers:
              backendHeaders(
                token,
              ),

            body:
              backendPhotoForm,
          },
        );

      if (
        !photoResponse.ok
      ) {
        const backendError =
          await parseBackendResponse(
            photoResponse,
          );

        return NextResponse.json(
          {
            success:
              false,

            code:
              photoResponse.status ===
              401
                ? "DEVICE_UNAUTHORIZED"
                : "PHOTO_UPLOAD_REJECTED",

            message:
              `ارسال تصویر ${photo.id} ناموفق بود.`,

            backend:
              backendError,
          },
          {
            status:
              photoResponse.status,
          },
        );
      }
    }

    /* ------------------------------------------------------------------ */
    /* 3. Complete assessment                                              */
    /* ------------------------------------------------------------------ */

    const completeResponse =
      await fetchWithTimeout(
        `${backendUrl}/api/assessments/${airwayCase.id}/complete/`,
        {
          method:
            "POST",

          headers:
            backendHeaders(
              token,
            ),
        },
      );

    const completionPayload =
      await parseBackendResponse(
        completeResponse,
      );

    if (
      !completeResponse.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "ASSESSMENT_NOT_COMPLETE",

          message:
            "Backend Case را کامل تشخیص نداد.",

          backend:
            completionPayload,
        },
        {
          status:
            completeResponse.status,
        },
      );
    }

    return NextResponse.json({
      success:
        true,

      remoteCaseId:
        airwayCase.id,

      receivedAt:
        new Date().toISOString(),

      backend:
        completionPayload,
    });
  } catch (
    error
  ) {
    console.error(
      "Assessment sync proxy failed:",
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

