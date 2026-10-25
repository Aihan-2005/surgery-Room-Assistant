import { deviceFetch } from "@/lib/api/device-fetch";

export interface ServerPhoto {
  id: string;
  position: string;
}

export async function fetchServerPhotos(caseId: string, signal?: AbortSignal): Promise<ServerPhoto[]> {
  const response = await deviceFetch(`/api/sync/cases/${encodeURIComponent(caseId)}`, { signal });
  if (!response.ok) throw new Error(`PHOTO_LIST_${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.photos) || !payload.photos.every((photo: ServerPhoto) =>
    photo && typeof photo.id === "string" && typeof photo.position === "string",
  )) throw new Error("INVALID_PHOTO_LIST");
  return payload.photos;
}

export async function fetchServerPhoto(caseId: string, photoId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await deviceFetch(
    `/api/sync/cases/${encodeURIComponent(caseId)}/photos/${encodeURIComponent(photoId)}`,
    { signal },
  );
  if (!response.ok) throw new Error(`PHOTO_DOWNLOAD_${response.status}`);
  const blob = await response.blob();
  if (!blob.size || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
    throw new Error("INVALID_PHOTO_DATA");
  }
  return blob;
}
