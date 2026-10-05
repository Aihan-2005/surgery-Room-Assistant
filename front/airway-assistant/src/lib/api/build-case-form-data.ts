import {
  CASE_UPLOAD_SCHEMA_VERSION,
  type CaseUploadMetadata,
  type CaseUploadPhotoMetadata,
} from "@/lib/api/contracts";

import type {
  AirwayCase,
  StoredPhoto,
} from "@/lib/domain/types";

export function buildCaseFormData(
  airwayCase: AirwayCase,
  photos: StoredPhoto[],
) {
  const formData =
    new FormData();

  const photoMetadata:
    CaseUploadPhotoMetadata[] =
    photos.map(
      (
        photo,
        index,
      ) => {
        const formField =
          `photo_${index}`;

        return {
          id:
            photo.id,

          formField,

          kind:
            photo.kind,

          filename:
            photo.filename,

          mimeType:
            photo.mimeType,

          source:
            photo.source,

          qc:
            photo.qc,

          createdAt:
            photo.createdAt,
        };
      },
    );

  const metadata:
    CaseUploadMetadata = {
    schemaVersion:
      CASE_UPLOAD_SCHEMA_VERSION,

    exportedAt:
      new Date().toISOString(),

    case:
      airwayCase,

    photos:
      photoMetadata,
  };

  formData.append(
    "metadata",
    JSON.stringify(
      metadata,
    ),
  );

  photos.forEach(
    (
      photo,
      index,
    ) => {
      formData.append(
        `photo_${index}`,
        photo.blob,
        photo.filename,
      );
    },
  );

  return formData;
}