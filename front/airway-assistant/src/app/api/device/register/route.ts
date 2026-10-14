import {
  NextResponse,
} from "next/server";


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


export async function POST(
  request:
    Request,
) {
  const backendUrl =
    getBackendBaseUrl();

  if (!backendUrl) {
    return NextResponse.json(
      {
        code:
          "BACKEND_NOT_CONFIGURED",

        detail:
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
        code:
          "DEVICE_TOKEN_REQUIRED",

        detail:
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
      () => {
        controller.abort();
      },
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${backendUrl}/api/devices/recovery-key/`,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Device ${token}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({}),

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    const payload =
      await readPayload(
        response,
      );

    return NextResponse.json(
      payload,
      {
        status:
          response.status,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      "Device recovery-key proxy failed:",
      error,
    );

    return NextResponse.json(
      {
        code:
          "BACKEND_UNREACHABLE",

        detail:
          "ارتباط با Backend برقرار نشد.",
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

