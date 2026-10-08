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
  | "database_unavailable"
  | "device_not_registered"
  | "device_unauthorized";

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

  /*
   * فقط نشان می‌دهد token محلی داریم.
   * صحت نهایی token موقع sync بررسی می‌شود.
   */
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

/*
 * فقط اتصال‌های واقعاً بد را weak
 * در نظر می‌گیریم.
 */
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

function weakConnection(
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
        hasDeviceToken,

      ...common,
    });
  }

  /*
   * اگر خود Browser قطع اینترنت را تشخیص داده،
   * حتی health request هم ارسال نمی‌کنیم.
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

    if (
      probe.reachable !==
      true
    ) {
      return snapshot({
        mode:
          "offline",

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

    if (
      probe.databaseReady !==
      true
    ) {
      return snapshot({
        mode:
          "offline",

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

    /*
     * اگر اتصال خیلی ضعیف باشد،
     * برای تصاویر بزرگ فعلاً Queue بهتر است.
     */
    if (
      weakConnection(
        connection,
      )
    ) {
      return snapshot({
        mode:
          "weak",

        reason:
          "connection_too_slow",

        canUpload:
          false,

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

    /*
     * وجود token شرط online بودن نیست.
     *
     * syncCase خودش در صورت نیاز Device را
     * register/re-register می‌کند.
     */
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

    return snapshot({
      mode:
        "offline",

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