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
  device_id?:
    unknown;

  doctor_name?:
    unknown;
}


interface ErrorPayload {
  code?:
    string;

  detail?:
    string;
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
          "BACKEND_API_URL تنظیم نشده یا معتبر نیست.",
      },
      {
        status:
          503,
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
        status:
          400,
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
        status:
          400,
      },
    );
  }


  if (
    typeof input.doctor_name !==
      "string" ||
    !input.doctor_name
      .trim()
  ) {
    return NextResponse.json(
      {
        code:
          "DOCTOR_NAME_REQUIRED",

        detail:
          "doctor_name الزامی است.",
      },
      {
        status:
          400,
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
    /*
     * ثبت اولیه Device.
     *
     * این endpoint نباید token بخواهد.
     */
    const response =
      await fetch(
        `${backendUrl}/api/devices/register/`,
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
              device_id:
                input.device_id
                  .trim(),

              doctor_name:
                input.doctor_name
                  .trim(),
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


    /*
     * پاسخ Backend را بدون دستکاری
     * به Client برمی‌گردانیم.
     *
     * روی registration موفق Backend:
     *
     * {
     *   device_id,
     *   token,
     *   recovery_key
     * }
     */
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
        status:
          502,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}
 