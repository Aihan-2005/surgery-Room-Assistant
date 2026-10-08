import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REQUEST_TIMEOUT_MS =
  10_000;

interface RegistrationInput {
  device_id?: unknown;

  doctor_name?: unknown;
}

interface ErrorPayload {
  code?: string;

  detail?: string;
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

  /*
   * اگر مقدار env اشتباهاً به‌شکل
   * https\://...
   * وارد شده باشد هم اصلاح می‌کنیم.
   */
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
          "BACKEND_API_URL تنظیم نشده یا معتبر نیست.",
      },
      {
        status: 503,
      },
    );
  }

  let input:
    RegistrationInput;

  try {
    input =
      (await request.json()) as
        RegistrationInput;
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
    !input.device_id.trim()
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
    typeof input.doctor_name !==
      "string" ||
    !input.doctor_name.trim()
  ) {
    return NextResponse.json(
      {
        code:
          "DOCTOR_NAME_REQUIRED",

        detail:
          "doctor_name الزامی است.",
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
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${backendUrl}/api/devices/register/`,
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
                input.device_id.trim(),

              doctor_name:
                input.doctor_name.trim(),
            }),

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    const text =
      await response.text();

    let payload:
      unknown = {};

    if (text) {
      try {
        payload =
          JSON.parse(
            text,
          ) as unknown;
      } catch {
        payload = {
          detail:
            text,
        };
      }
    }

    return NextResponse.json(
      payload,
      {
        status:
          response.status,
      },
    );
  } catch (
    error
  ) {
    console.error(
      "Device registration proxy failed:",
      error,
    );

    const payload:
      ErrorPayload = {
      code:
        "BACKEND_UNREACHABLE",

      detail:
        "ارتباط با Backend برقرار نشد.",
    };

    return NextResponse.json(
      payload,
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