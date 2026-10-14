import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

interface PushInput {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

function backendUrl() {
  const raw =
    process.env.BACKEND_API_URL?.trim();

  if (!raw) return null;

  const normalized = raw
    .replace(/\\/g, "")
    .replace(/\/+$/, "");

  try {
    const url = new URL(normalized);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const base = backendUrl();

  if (!base) {
    return NextResponse.json(
      {
        code: "BACKEND_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const token =
    request.headers
      .get("x-device-token")
      ?.trim();

  if (!token) {
    return NextResponse.json(
      {
        code: "DEVICE_TOKEN_REQUIRED",
      },
      { status: 401 },
    );
  }

  let input: PushInput;

  try {
    input =
      (await request.json()) as PushInput;
  } catch {
    return NextResponse.json(
      { code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  if (
    typeof input.endpoint !== "string" ||
    !input.endpoint.startsWith("https://") ||
    typeof input.keys?.p256dh !== "string" ||
    typeof input.keys?.auth !== "string"
  ) {
    return NextResponse.json(
      {
        code: "INVALID_PUSH_SUBSCRIPTION",
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${base}/api/push/subscriptions/`,
      {
        method: "POST",
        headers: {
          Authorization: `Device ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: input.endpoint,
          expirationTime:
            typeof input.expirationTime === "number"
              ? input.expirationTime
              : null,
          keys: {
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (response.status === 204) {
      return new Response(null, {
        status: 204,
      });
    }

    let payload: unknown = {};

    try {
      payload = await response.json();
    } catch {
      payload = {
        code: "INVALID_BACKEND_RESPONSE",
      };
    }

    return NextResponse.json(
      payload,
      {
        status: response.status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        code: "PUSH_BACKEND_UNAVAILABLE",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}