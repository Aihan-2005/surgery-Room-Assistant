"use client";

import { openDB } from "idb";

import {
  getCase,
  getPhotosByCase,
} from "@/lib/db/database";

import {
  getOperatorProfile,
  recoverOperatorDevice,
} from "@/lib/profile/operator-profile";

import type {
  StoredPhoto,
} from "@/lib/domain/types";

const DB_NAME = "airway-assistant-db";

const PHOTO_FETCH_TIMEOUT_MS = 20_000;

type StoredRemotePhoto =
  StoredPhoto & { remoteOnly?: boolean };

let recoveryTask: Promise<string> | null = null;

async function recoverSameInstallation():
  Promise<string> {
  if (recoveryTask) return recoveryTask;

  const task = recoverOperatorDevice().then(
    (profile) => {
      if (!profile.deviceToken) {
        throw new Error("DEVICE_RECOVERY_FAILED");
      }
      return profile.deviceToken;
    },
  );

  recoveryTask = task;

  try {
    return await task;
  } finally {
    if (recoveryTask === task) {
      recoveryTask = null;
    }
  }
}

function photoUrl(
  caseId: string,
  photoId: string,
): string {
  return (
    `/api/remote-photos/` +
    `${encodeURIComponent(caseId)}/` +
    `${encodeURIComponent(photoId)}`
  );
}

async function remoteRequest(
  caseId: string,
  photoId: string,
  method: "GET" | "HEAD",
  abortSignal?: AbortSignal,
): Promise<Response> {
  const profile = getOperatorProfile();

  if (!profile) {
    throw new Error("OPERATOR_PROFILE_REQUIRED");
  }

  let token = profile.deviceToken;

  if (!token && profile.recoveryKey) {
    token = await recoverSameInstallation();
  }

  if (!token) {
    throw new Error("DEVICE_TOKEN_REQUIRED");
  }

  const controller = new AbortController();

  const stop = () => controller.abort();

  if (abortSignal?.aborted) {
    stop();
  } else {
    abortSignal?.addEventListener(
      "abort",
      stop,
      { once: true },
    );
  }

  const timeout = setTimeout(
    () => controller.abort(),
    PHOTO_FETCH_TIMEOUT_MS,
  );

  try {
    const send = (deviceToken: string) =>
      fetch(photoUrl(caseId, photoId), {
        method,
        headers: {
          "X-Device-Token": deviceToken,
        },
        cache: "no-store",
        signal: controller.signal,
      });

    let response = await send(token);

    if (
      response.status === 401 &&
      getOperatorProfile()?.recoveryKey
    ) {
      const latestToken =
        getOperatorProfile()?.deviceToken;

      token =
        latestToken && latestToken !== token
          ? latestToken
          : await recoverSameInstallation();

      response = await send(token);
    }

    if (!response.ok) {
      throw new Error(
        `REMOTE_PHOTO_HTTP_${response.status}`,
      );
    }

    const contentType = (
      response.headers.get("content-type") || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (
      !["image/jpeg", "image/png", "image/webp"]
        .includes(contentType)
    ) {
      throw new Error("REMOTE_PHOTO_BAD_TYPE");
    }

    if (method === "GET") {
      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("REMOTE_PHOTO_EMPTY");
      }

      return new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": contentType,
        },
      });
    }

    const length =
      response.headers.get("content-length");

    if (
      length !== null &&
      Number(length) <= 0
    ) {
      throw new Error("REMOTE_PHOTO_EMPTY");
    }

    return response;
  } finally {
    clearTimeout(timeout);
    abortSignal?.removeEventListener(
      "abort",
      stop,
    );
  }
}

export async function getSyncedPhotoBlob(
  caseId: string,
  photoId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await remoteRequest(
    caseId,
    photoId,
    "GET",
    signal,
  );

  return response.blob();
}


export async function releaseSyncedCaseBlobs(
  caseId: string,
): Promise<number> {
  if (
    typeof navigator === "undefined" ||
    navigator.onLine === false
  ) {
    return 0;
  }

  const airwayCase = await getCase(caseId);

  if (
    !airwayCase ||
    airwayCase.syncStatus !== "synced"
  ) {
    return 0;
  }

  const allPhotos = (
    await getPhotosByCase(caseId)
  ) as StoredRemotePhoto[];

  const photosToRelease = allPhotos.filter(
    (photo) =>
      photo.blob instanceof Blob &&
      photo.blob.size > 0,
  );

  if (photosToRelease.length === 0) {
    return 0;
  }



  for (const photo of allPhotos) {
    await remoteRequest(
      caseId,
      photo.id,
      "HEAD",
    );
  }


  const db = await openDB(DB_NAME);

  try {
    const tx = db.transaction(
      ["cases", "photos"],
      "readwrite",
    );

    const currentCase =
      await tx.objectStore("cases").get(caseId);



    if (currentCase?.syncStatus !== "synced") {
      await tx.done;
      return 0;
    }

    const photoStore = tx.objectStore("photos");

    let released = 0;

    for (const photo of photosToRelease) {
      const current = (
        await photoStore.get(photo.id)
      ) as StoredRemotePhoto | undefined;

      if (
        !current ||
        current.caseId !== caseId ||
        !(current.blob instanceof Blob) ||
        current.blob.size === 0
      ) {
        continue;
      }

      released += current.blob.size;


      await photoStore.put({
        ...current,
        blob: new Blob([]),
        remoteOnly: true,
      });
    }

    await tx.done;

    return released;
  } finally {
    db.close();
  }
}
