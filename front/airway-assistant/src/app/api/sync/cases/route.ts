import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

function normalizeBaseUrl(
  value: string,
) {
  return value.replace(
    /\/+$/,
    "",
  );
}

function normalizePath(
  value: string,
) {
  return value.startsWith(
    "/",
  )
    ? value
    : `/${value}`;
}

export async function GET() {
  const backendUrl =
    process.env
      .BACKEND_API_URL;

  if (!backendUrl) {
    return NextResponse.json(
      {
        configured:
          false,

        reachable:
          false,

        message:
          "Backend API هنوز تنظیم نشده است.",
      },
      {
        status: 200,
      },
    );
  }

  const healthPath =
    process.env
      .BACKEND_HEALTH_PATH ??
    "/health";

  try {
    const response =
      await fetch(
        `${normalizeBaseUrl(
          backendUrl,
        )}${normalizePath(
          healthPath,
        )}`,
        {
          method: "GET",

          cache:
            "no-store",

          headers: {
            Accept:
              "application/json",
          },
        },
      );

    return NextResponse.json(
      {
        configured:
          true,

        reachable:
          response.ok,

        status:
          response.status,
      },
      {
        status:
          response.ok
            ? 200
            : 503,
      },
    );
  } catch {
    return NextResponse.json(
      {
        configured:
          true,

        reachable:
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

export async function POST(
  request: Request,
) {
  const backendUrl =
    process.env
      .BACKEND_API_URL;

  if (!backendUrl) {
    return NextResponse.json(
      {
        success: false,

        code:
          "BACKEND_NOT_CONFIGURED",

        message:
          "Backend API هنوز تنظیم نشده است.",
      },
      {
        status: 503,
      },
    );
  }

  try {
    const incomingForm =
      await request.formData();

    const metadata =
      incomingForm.get(
        "metadata",
      );

    if (
      typeof metadata !==
        "string" ||
      !metadata.trim()
    ) {
      return NextResponse.json(
        {
          success: false,

          code:
            "INVALID_REQUEST",

          message:
            "Metadata ارسال نشده است.",
        },
        {
          status: 400,
        },
      );
    }

 
    try {
      JSON.parse(
        metadata,
      );
    } catch {
      return NextResponse.json(
        {
          success: false,

          code:
            "INVALID_METADATA",

          message:
            "Metadata معتبر نیست.",
        },
        {
          status: 400,
        },
      );
    }

    const outboundForm =
      new FormData();

    for (
      const [
        key,
        value,
      ] of incomingForm.entries()
    ) {
      outboundForm.append(
        key,
        value,
      );
    }

    const backendPath =
      process.env
        .BACKEND_CASES_PATH ??
      "/v1/cases";

    const targetUrl =
      `${normalizeBaseUrl(
        backendUrl,
      )}${normalizePath(
        backendPath,
      )}`;

    const headers =
      new Headers();

    headers.set(
      "Accept",
      "application/json",
    );

  
    const apiKey =
      process.env
        .BACKEND_API_KEY;

    if (apiKey) {
      headers.set(
        "Authorization",
        `Bearer ${apiKey}`,
      );
    }

    const backendResponse =
      await fetch(
        targetUrl,
        {
          method:
            "POST",

          headers,

          body:
            outboundForm,

          cache:
            "no-store",
        },
      );

    const responseText =
      await backendResponse.text();

    if (
      !backendResponse.ok
    ) {
      console.error(
        "Backend upload failed:",
        backendResponse.status,
        responseText,
      );

      return NextResponse.json(
        {
          success:
            false,

          code:
            "BACKEND_REJECTED_REQUEST",

          message:
            "Backend درخواست ارسال را نپذیرفت.",

          status:
            backendResponse.status,
        },
        {
          status:
            backendResponse.status,
        },
      );
    }

    let backendData:
      unknown = null;

    if (
      responseText
    ) {
      try {
        backendData =
          JSON.parse(
            responseText,
          );
      } catch {
        backendData = {
          raw:
            responseText,
        };
      }
    }

    const remoteCaseId =
      typeof backendData ===
        "object" &&
      backendData !==
        null &&
      "id" in backendData &&
      typeof (
        backendData as {
          id?: unknown;
        }
      ).id === "string"
        ? (
            backendData as {
              id: string;
            }
          ).id
        : undefined;

    return NextResponse.json(
      {
        success:
          true,

        remoteCaseId,

        receivedAt:
          new Date().toISOString(),
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "Case sync gateway error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

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
 