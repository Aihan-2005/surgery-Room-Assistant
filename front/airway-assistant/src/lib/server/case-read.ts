const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Proxy owner-authenticated reads; keep tokens out of image URLs and caches. */
export async function proxyCaseRead(request: Request, caseId: string, photoId?: string) {
  const error = (code: string, status: number) =>
    Response.json({ code }, { status, headers: PRIVATE_HEADERS });
  if (!UUID.test(caseId) || (photoId !== undefined && !UUID.test(photoId))) {
    return error("INVALID_ID", 400);
  }
  const token = request.headers.get("X-Device-Token")?.trim();
  if (!token) return error("DEVICE_TOKEN_REQUIRED", 401);
  const raw = process.env.BACKEND_API_URL?.trim().replace(/\\/g, "").replace(/\/+$/, "");
  if (!raw) return error("BACKEND_NOT_CONFIGURED", 503);
  try {
    const base = new URL(raw);
    if (!["http:", "https:"].includes(base.protocol)) return error("BACKEND_NOT_CONFIGURED", 503);
  } catch {
    return error("BACKEND_NOT_CONFIGURED", 503);
  }
  const path = photoId ? `${caseId}/photos/${photoId}/` : `${caseId}/`;
  try {
    const response = await fetch(`${raw}/api/assessments/${path}`, {
      headers: { Authorization: `Device ${token}`, Accept: photoId ? "image/*" : "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      // Do not expose upstream HTML, file paths, or internal exception details.
      return error("CASE_READ_FAILED", response.status);
    }
    if (!photoId) {
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.photos)) return error("INVALID_BACKEND_RESPONSE", 502);
      return Response.json(payload, { headers: PRIVATE_HEADERS });
    }
    const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (!type || !PHOTO_TYPES.has(type)) return error("INVALID_PHOTO_RESPONSE", 502);
    // Buffer within the timeout so an interrupted download becomes a retryable
    // response, rather than leaving the browser with a broken image stream.
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) return error("EMPTY_PHOTO_RESPONSE", 502);
    return new Response(bytes, { headers: {
      ...PRIVATE_HEADERS, "Content-Type": type, "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return error("BACKEND_UNAVAILABLE", 502);
  }
}
