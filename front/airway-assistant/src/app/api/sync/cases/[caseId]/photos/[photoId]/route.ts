import {
  NextResponse,
} from "next/server";

import type {
  CaptureKind,
} from "@/lib/domain/types";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REQUEST_TIMEOUT_MS =
  30_000;

const MAX_PROXY_IMAGE_BYTES =
  4 * 1024 * 1024;

function getBackendBaseUrl():
  | string
  | undefined {
  const raw =
    process.env
      .BACKEND_API_URL
      ?.trim();

  if (
    !raw
  ) {
    return undefined;
  }

  return raw
    .replace(
      /\\/g,
      "",
    )
    .replace(
      /\/+$/,
      "",
    );
}

function mapPosition(
  kind:
    CaptureKind,
):
  | "front"
  | "mallampati"
  | "open_mouth"
  | "upper_lip_bite"
  | "side"
  | "head_back_side"
  | null {
  switch (
    kind
  ) {
    case "front_neutral":
      return "front";

    case "mallampati":
      return "mallampati";

    case "mouth_open":
      return "open_mouth";

    case "upper_lip_bite_front":
      return "upper_lip_bite";

    case "lateral_neutral":
      return "side";

    case "head_back_side":
      return "head_back_side";

    default:
      return null;
  }
}

async function readPayload(
  response:
    Response,
) {
  const text =
    await response.text();

  if (
    !text
  ) {
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

export async function PUT(
  request:
    Request,

  context: {
    params:
      Promise<{
        caseId:
          string;

        photoId:
          string;
      }>;
  },
) {
  const {
    caseId,
    photoId,
  } =
    await context.params;

  const backendUrl =
    getBackendBaseUrl();

  if (
    !backendUrl
  ) {
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

  if (
    !token
  ) {
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
    const incoming =
      await request.formData();

    const kindValue =
      incoming.get(
        "kind",
      );

    const image =
      incoming.get(
        "image",
      );

    if (
      typeof kindValue !==
        "string" ||
      !image ||
      typeof image ===
        "string"
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "INVALID_PHOTO",

          message:
            "اطلاعات تصویر معتبر نیست.",
        },
        {
          status: 400,
        },
      );
    }

    const position =
      mapPosition(
        kindValue as
          CaptureKind,
      );

    if (
      !position
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "INVALID_CAPTURE_KIND",

          message:
            "نوع پوزیشن تصویر معتبر نیست.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Backend خودش 5 MB قبول می‌کند.
     * ولی proxy روی Vercel بهتر است
     * فایل را زیر 4 MB نگه دارد.
     */
    if (
      image.size >
      MAX_PROXY_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            "PHOTO_TOO_LARGE",

          message:
            "حجم تصویر برای ارسال زیاد است.",
        },
        {
          status: 413,
        },
      );
    }

    const backendForm =
      new FormData();

    backendForm.append(
      "position",
      position,
    );

    backendForm.append(
      "image",
      image,
      image.name,
    );

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
          `${backendUrl}/api/assessments/${caseId}/photos/${photoId}/`,
          {
            method:
              "PUT",

            headers: {
              Accept:
                "application/json",

              Authorization:
                `Device ${token}`,
            },

            body:
              backendForm,

            signal:
              controller.signal,

            cache:
              "no-store",
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
                : response.status ===
                    413
                  ? "PHOTO_TOO_LARGE"
                  : "PHOTO_UPLOAD_REJECTED",

            message:
              response.status ===
                413
                ? "حجم تصویر برای ارسال زیاد است."
                : "ارسال تصویر انجام نشد.",

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
      });
    } finally {
      clearTimeout(
        timeout,
      );
    }
  } catch (
    error
  ) {
    console.error(
      "Photo sync failed:",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        code:
          "PHOTO_NETWORK_ERROR",

        message:
          "ارسال تصویر انجام نشد.",
      },
      {
        status: 502,
      },
    );
  }
}