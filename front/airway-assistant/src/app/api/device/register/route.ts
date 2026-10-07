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

function getBackendBaseUrl() {
  return process.env
    .BACKEND_API_URL
    ?.replace(
      /\/+$/,
      "",
    );
}

export async function POST(
  request: Request,
) {
  const backendUrl =
    getBackendBaseUrl();

  if (!backendUrl) {
    return NextResponse.json(
      {
        code:
          "BACKEND_NOT_CONFIGURED",

        detail:
          "BACKEND_API_URL تنظیم نشده است.",
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
  ) {
    return NextResponse.json(
      {
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
                input.device_id,

              doctor_name:
                input.doctor_name.trim(),
            }),

          signal:
            controller.signal,

          cache:
            "no-store",
        },
      );

    const responseText =
      await response.text();

    let payload:
      unknown;

    try {
      payload =
        responseText
          ? JSON.parse(
              responseText,
            )
          : {};
    } catch {
      payload = {
        detail:
          responseText ||
          "Backend response invalid.",
      };
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

    return NextResponse.json(
      {
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