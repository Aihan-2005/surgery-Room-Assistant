import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REQUEST_TIMEOUT_MS =
  5_000;

interface BackendHealthPayload {
  status?:
    string;

  database_ready?:
    boolean;
}

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
): Promise<BackendHealthPayload> {
  try {
    return (
      await response.json()
    ) as BackendHealthPayload;
  } catch {
    return {};
  }
}

function response(
  payload:
    Record<
      string,
      unknown
    >,
) {
  return NextResponse.json(
    payload,
    {
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    },
  );
}

export async function GET() {
  const backendUrl =
    getBackendBaseUrl();

  if (!backendUrl) {
    return response({
      configured:
        false,

      reachable:
        false,

      databaseReady:
        false,
    });
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
    const backendResponse =
      await fetch(
        `${backendUrl}/api/health/`,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",
          },

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    const payload =
      await readPayload(
        backendResponse,
      );

    /*
     * اگر از Backend هر HTTP response بگیریم،
     * خود Django reachable است.
     *
     * ممکن است DB مشکل داشته باشد و Backend
     * عمداً 503 برگرداند.
     */
    return response({
      configured:
        true,

      reachable:
        true,

      databaseReady:
        backendResponse.ok &&
        payload.database_ready ===
          true,

      backendStatus:
        backendResponse.status,
    });
  } catch (
    error
  ) {
    console.warn(
      "Backend health check failed:",
      error,
    );

    return response({
      configured:
        true,

      reachable:
        false,

      databaseReady:
        false,
    });
  } finally {
    clearTimeout(
      timeout,
    );
  }
}