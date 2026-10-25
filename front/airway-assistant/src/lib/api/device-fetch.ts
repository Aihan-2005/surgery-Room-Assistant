import {
  ensureOperatorRegistered,
  getOperatorProfile,
  recoverOperatorDevice,
} from "@/lib/profile/operator-profile";

let recoveryTask: ReturnType<typeof recoverOperatorDevice> | null = null;

/** Recover the same installation once on 401; a disabled device stays blocked. */
export async function deviceFetch(url: string, init: RequestInit = {}) {
  const send = (token?: string) => {
    if (!token) throw new Error("DEVICE_TOKEN_REQUIRED");
    const headers = new Headers(init.headers);
    headers.set("X-Device-Token", token);
    return fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  };

  const profile = await ensureOperatorRegistered();
  const response = await send(profile.deviceToken);
  if (response.status !== 401) return response;
  // Several visible photos may encounter the same rejected token together.
  // Reuse a replacement token or share one recovery, avoiding token rotations
  // that would invalidate one another's image downloads.
  const current = getOperatorProfile();
  if (current?.deviceToken && current.deviceToken !== profile.deviceToken) {
    return send(current.deviceToken);
  }
  if (!recoveryTask) {
    const task = recoverOperatorDevice().finally(() => {
      if (recoveryTask === task) recoveryTask = null;
    });
    recoveryTask = task;
  }
  const recovered = await recoveryTask;
  return send(recovered.deviceToken);
}
