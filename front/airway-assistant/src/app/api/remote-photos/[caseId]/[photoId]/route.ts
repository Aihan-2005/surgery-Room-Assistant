import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 25_000;

const UUID =
  /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
};

type Context = {
  params: Promise<{
    caseId: string;
    photoId: string;
  }>;
};

async function proxyPhoto(
  request: Request,
  context: Context,
  method: "GET" | "HEAD",
): Promise<Response> {
  const { caseId, photoId } = await context.params;

  if (!UUID.test(caseId) || !UUID.test(photoId)) {
    return NextResponse.json(
      { code: "INVALID_PHOTO_ID" },
      { status: 400, headers: NO_STORE },
    );
  }

  const token = request.headers
    .get("x-device-token")
    ?.trim();

  if (!token) {
    return NextResponse.json(
      { code: "DEVICE_TOKEN_REQUIRED" },
      { status: 401, headers: NO_STORE },
    );
  }

  const raw = process.env.BACKEND_API_URL?.trim();

  if (!raw) {
    return NextResponse.json(
      { code: "BACKEND_NOT_CONFIGURED" },
      { status: 503, headers: NO_STORE },
    );
  }

  let backend: URL;

  try {
    backend = new URL(raw);

    if (!["http:", "https:"].includes(backend.protocol)) {
      throw new Error("UNSUPPORTED_SCHEME");
    }
  } catch {
    return NextResponse.json(
      { code: "INVALID_BACKEND_URL" },
      { status: 503, headers: NO_STORE },
    );
  }

  const url = new URL(
    `/api/assessments/${caseId}/photos/${photoId}/`,
    backend,
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        Authorization: `Device ${token}`,
        Accept: "image/jpeg,image/png,image/webp",
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          code:
            upstream.status === 401
              ? "DEVICE_UNAUTHORIZED"
              : upstream.status === 403
                ? "DEVICE_FORBIDDEN"
                : upstream.status === 404
                  ? "PHOTO_NOT_FOUND"
                  : "REMOTE_PHOTO_UNAVAILABLE",
        },
        {
          status:
            upstream.status >= 400 && upstream.status < 600
              ? upstream.status
              : 502,
          headers: NO_STORE,
        },
      );
    }

    const type = (
      upstream.headers.get("content-type") || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(type)
    ) {
      return NextResponse.json(
        { code: "UNEXPECTED_PHOTO_CONTENT_TYPE" },
        { status: 502, headers: NO_STORE },
      );
    }

    const headers = new Headers(NO_STORE);

    headers.set("Content-Type", type);
    headers.set("X-Content-Type-Options", "nosniff");

    const length = upstream.headers.get("content-length");

    if (length && /^\d+$/.test(length)) {
      headers.set("Content-Length", length);
    }

    return new Response(
      method === "HEAD" ? null : upstream.body,
      {
        status: 200,
        headers,
      },
    );
  } catch {
    return NextResponse.json(
      { code: "PHOTO_FETCH_FAILED" },
      { status: 502, headers: NO_STORE },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function GET(
  request: Request,
  context: Context,
) {
  return proxyPhoto(request, context, "GET");
}

export function HEAD(
  request: Request,
  context: Context,
) {
  return proxyPhoto(request, context, "HEAD");
}
