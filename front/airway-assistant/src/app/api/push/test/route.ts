import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 15_000;

function getBackendUrl(): string | null {
  const raw = process.env.BACKEND_API_URL?.trim();

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const token = request.headers
    .get("X-Device-Token")
    ?.trim();

  if (!token) {
    return NextResponse.json(
      {
        code: "DEVICE_TOKEN_REQUIRED",
        detail: "شناسه اتصال دستگاه موجود نیست.",
      },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const backendUrl = getBackendUrl();

  if (!backendUrl) {
    return NextResponse.json(
      {
        code: "BACKEND_NOT_CONFIGURED",
        detail: "اتصال Backend تنظیم نشده است.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${backendUrl}/api/push/test/`,
      {
        method: "POST",
        headers: {
          Authorization: `Device ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      },
    );

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      payload = {
        code: "INVALID_BACKEND_RESPONSE",
        detail: "پاسخ معتبر از Backend دریافت نشد.",
      };
    }

    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        code: "PUSH_BACKEND_UNAVAILABLE",
        detail: "ارتباط با سرویس اعلان برقرار نشد.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}