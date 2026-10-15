import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

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

export async function GET() {
  const base = backendUrl();

  if (!base) {
    return NextResponse.json(
      {
        code: "BACKEND_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${base}/api/push/config/`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      },
    );

    const payload = await response.json();

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
        code: "PUSH_CONFIG_UNAVAILABLE",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}