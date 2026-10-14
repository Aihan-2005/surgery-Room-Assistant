import {
  NextResponse,
} from "next/server";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


const REQUEST_TIMEOUT_MS =
  10_000;


interface RecoveryRequest {
  device_id?:
    unknown;

  recovery_key?:
    unknown;
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

  let input:
    RecoveryRequest;

  try {
    input =
      (await request.json()) as
        RecoveryRequest;
  } catch {
    return NextResponse.json(
      {
        code:
          "INVALID_REQUEST",

        detail:
          "درخواست معتبر نیست.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof input.device_id !==
      "string" ||
    !input.device_id
      .trim()
  ) {
    return NextResponse.json(
      {
        code:
          "DEVICE_ID_REQUIRED",

        detail:
          "device_id الزامی است.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof input.recovery_key !==
      "string" ||
    !input.recovery_key
      .trim()
  ) {
    return NextResponse.json(
      {
        code:
          "RECOVERY_KEY_REQUIRED",

        detail:
          "recovery_key الزامی است.",
      },
      {
        status: 400,
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
        `${backendUrl}/api/devices/recover/`,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              /*
               * همان UUID اولیه.
               *
               * UUID جدید تولید نمی‌شود.
               */
              device_id:
                input.device_id
                  .trim(),

              recovery_key:
                input.recovery_key,
            }),

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
      "Device recovery proxy failed:",
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