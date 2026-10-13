import {
  getOperatorProfile,
} from "@/lib/profile/operator-profile";

export type ConnectivityMode =
  | "checking"
  | "online"
  | "weak"
  | "offline"
  | "local-only";

export type ConnectivityReason =
  | "checking"
  | "ready"
  | "browser_offline"
  | "probe_failed"
  | "connection_too_slow"
  | "backend_not_configured"
  | "backend_unreachable"
  | "database_unavailable";

export interface ConnectivitySnapshot {
  mode:
    ConnectivityMode;

  reason:
    ConnectivityReason;

  canUpload:
    boolean;

  internetReachable:
    boolean;

  backendConfigured:
    boolean;

  backendReachable:
    boolean;

  databaseReady:
    boolean;

  authenticated:
    boolean;

  probeLatencyMs?:
    number;

  effectiveType?:
    string;

  downlinkMbps?:
    number;

  rttMs?:
    number;

  saveData?:
    boolean;

  checkedAt:
    string;
}

interface BrowserNetworkInformation
  extends EventTarget {
  effectiveType?:
    string;

  downlink?:
    number;

  rtt?:
    number;

  saveData?:
    boolean;
}

interface NavigatorWithConnection
  extends Navigator {
  connection?:
    BrowserNetworkInformation;

  mozConnection?:
    BrowserNetworkInformation;

  webkitConnection?:
    BrowserNetworkInformation;
}

interface BackendProbeResponse {
  configured?:
    boolean;

  reachable?:
    boolean;

  databaseReady?:
    boolean;

  backendStatus?:
    number;
}

const PROBE_TIMEOUT_MS =
  6_000;

const WEAK_DOWNLINK_MBPS =
  0.5;

const WEAK_RTT_MS =
  2_000;

export function getBrowserConnection():
  | BrowserNetworkInformation
  | null {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return null;
  }

  const nav =
    navigator as
      NavigatorWithConnection;

  return (
    nav.connection ??
    nav.mozConnection ??
    nav.webkitConnection ??
    null
  );
}

function isWeakConnection(
  connection:
    BrowserNetworkInformation | null,
) {
  if (!connection) {
    return false;
  }

  if (
    connection.effectiveType ===
      "slow-2g" ||
    connection.effectiveType ===
      "2g"
  ) {
    return true;
  }

  if (
    typeof connection.downlink ===
      "number" &&
    connection.downlink > 0 &&
    connection.downlink <
      WEAK_DOWNLINK_MBPS
  ) {
    return true;
  }

  return (
    typeof connection.rtt ===
      "number" &&
    connection.rtt >=
      WEAK_RTT_MS
  );
}

function snapshot(
  value:
    Omit<
      ConnectivitySnapshot,
      "checkedAt"
    >,
): ConnectivitySnapshot {
  return {
    ...value,

    checkedAt:
      new Date()
        .toISOString(),
  };
}

export async function checkConnectivity():
  Promise<ConnectivitySnapshot> {
  const connection =
    getBrowserConnection();

  const operator =
    getOperatorProfile();

  const hasDeviceToken =
    Boolean(
      operator?.deviceToken,
    );

  const common = {
    effectiveType:
      connection?.effectiveType,

    downlinkMbps:
      connection?.downlink,

    rttMs:
      connection?.rtt,

    saveData:
      connection?.saveData,
  };

  if (
    typeof navigator ===
    "undefined"
  ) {
    return snapshot({
      mode:
        "checking",

      reason:
        "checking",

      canUpload:
        false,

      internetReachable:
        false,

      backendConfigured:
        false,

      backendReachable:
        false,

      databaseReady:
        false,

      authenticated:
        false,

      ...common,
    });
  }

  /*
   * Browser صریحاً می‌گوید اینترنت قطع است.
   */
  if (
    navigator.onLine ===
    false
  ) {
    return snapshot({
      mode:
        "offline",

      reason:
        "browser_offline",

      canUpload:
        false,

      internetReachable:
        false,

      backendConfigured:
        true,

      backendReachable:
        false,

      databaseReady:
        false,

      authenticated:
        hasDeviceToken,

      ...common,
    });
  }

  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () => {
        controller.abort();
      },
      PROBE_TIMEOUT_MS,
    );

  const startedAt =
    performance.now();

  try {
    const response =
      await fetch(
        `/api/backend-health?probe=${Date.now()}`,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",
          },

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    const latency =
      Math.round(
        performance.now() -
        startedAt,
      );

    const probe =
      (await response.json()) as
        BackendProbeResponse;

    /*
     * اینترنت هست، ولی آدرس سرور
     * در Frontend تنظیم نشده.
     */
    if (
      probe.configured !==
      true
    ) {
      return snapshot({
        mode:
          "local-only",

        reason:
          "backend_not_configured",

        canUpload:
          false,

        internetReachable:
          true,

        backendConfigured:
          false,

        backendReachable:
          false,

        databaseReady:
          false,

        authenticated:
          hasDeviceToken,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    /*
     * Browser آنلاین است،
     * ولی API جواب نمی‌دهد.
     */
    if (
      probe.reachable !==
      true
    ) {
      return snapshot({
        mode:
          "local-only",

        reason:
          "backend_unreachable",

        canUpload:
          false,

        internetReachable:
          true,

        backendConfigured:
          true,

        backendReachable:
          false,

        databaseReady:
          false,

        authenticated:
          hasDeviceToken,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    /*
     * Backend جواب می‌دهد،
     * ولی دیتابیس آماده نیست.
     */
    if (
      probe.databaseReady !==
      true
    ) {
      return snapshot({
        mode:
          "local-only",

        reason:
          "database_unavailable",

        canUpload:
          false,

        internetReachable:
          true,

        backendConfigured:
          true,

        backendReachable:
          true,

        databaseReady:
          false,

        authenticated:
          hasDeviceToken,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    const weak =
      isWeakConnection(
        connection,
      );

    /*
     * سرعت پایین فقط یک هشدار است.
     * Upload را متوقف نمی‌کنیم.
     */
    if (weak) {
      return snapshot({
        mode:
          "weak",

        reason:
          "connection_too_slow",

        canUpload:
          true,

        internetReachable:
          true,

        backendConfigured:
          true,

        backendReachable:
          true,

        databaseReady:
          true,

        authenticated:
          hasDeviceToken,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    return snapshot({
      mode:
        "online",

      reason:
        "ready",

      canUpload:
        true,

      internetReachable:
        true,

      backendConfigured:
        true,

      backendReachable:
        true,

      databaseReady:
        true,

      authenticated:
        hasDeviceToken,

      probeLatencyMs:
        latency,

      ...common,
    });
  } catch (
    error
  ) {
    console.warn(
      "Connectivity probe failed:",
      error,
    );

    /*
     * Browser هنوز online است.
     * فقط ارسال فعلاً قابل انجام نیست.
     */
    return snapshot({
      mode:
        "local-only",

      reason:
        "probe_failed",

      canUpload:
        false,

      internetReachable:
        navigator.onLine,

      backendConfigured:
        true,

      backendReachable:
        false,

      databaseReady:
        false,

      authenticated:
        hasDeviceToken,

      ...common,
    });
  } finally {
    window.clearTimeout(
      timeout,
    );
  }
}

export const INITIAL_CONNECTIVITY:
  ConnectivitySnapshot = {
  mode:
    "checking",

  reason:
    "checking",

  canUpload:
    false,

  internetReachable:
    false,

  backendConfigured:
    false,

  backendReachable:
    false,

  databaseReady:
    false,

  authenticated:
    false,

  checkedAt:
    "",
};

