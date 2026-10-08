import {
  NextResponse,
} from "next/server";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


const REQUEST_TIMEOUT_MS =
  10_000;


function getBackendBaseUrl() {
  return process.env
    .BACKEND_API_URL
    ?.trim()
    .replace(
      /\/+$/,
      "",
    );
}


export async function POST(
  request:
    Request,

  context: {
    params:
      Promise<{
        caseId:
          string;
      }>;
  },
) {
  const {
    caseId,
  } =
    await context.params;

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
          "Backend تنظیم نشده است.",
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

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${backendUrl}/api/assessments/${caseId}/complete/`,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Device ${token}`,
          },

          signal:
            controller.signal,

          cache:
            "no-store",
        },
      );

    let payload:
      unknown =
      {};

    try {
      payload =
        await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            response.status ===
              401
              ? "DEVICE_UNAUTHORIZED"
              : "ASSESSMENT_NOT_COMPLETE",

          message:
            "Backend Case را کامل تشخیص نداد.",

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
        caseId,

      receivedAt:
        new Date().toISOString(),
    });
  } catch (
    error
  ) {
    console.error(
      "Complete sync failed:",
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
  } finally {
    clearTimeout(
      timeout,
    );
  }
}