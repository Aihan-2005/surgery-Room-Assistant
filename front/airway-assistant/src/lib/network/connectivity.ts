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

interface BackendHealthResponse {
  configured?:
    boolean;

  reachable?:
    boolean;

  authenticated?:
    boolean;

  status?:
    number;
}

const PROBE_TIMEOUT_MS =
  4500;

const WEAK_PROBE_LATENCY_MS =
  3000;

const WEAK_DOWNLINK_MBPS =
  0.75;

const WEAK_RTT_MS =
  1500;

export function getBrowserConnection():
  | BrowserNetworkInformation
  | null {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return null;
  }

  const browserNavigator =
    navigator as
      NavigatorWithConnection;

  return (
    browserNavigator.connection ??
    browserNavigator.mozConnection ??
    browserNavigator.webkitConnection ??
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
    connection.downlink >
      0 &&
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
      new Date().toISOString(),
  };
}

export async function checkConnectivity():
  Promise<ConnectivitySnapshot> {
  const connection =
    getBrowserConnection();

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

      authenticated:
        false,

      ...common,
    });
  }

  if (
    !navigator.onLine
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
        false,

      backendReachable:
        false,

      authenticated:
        false,

      ...common,
    });
  }

  const operator =
    getOperatorProfile();

  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () =>
        controller.abort(),
      PROBE_TIMEOUT_MS,
    );

  const started =
    performance.now();

  try {
    const response =
      await fetch(
        `/api/sync/cases?probe=${Date.now()}`,
        {
          method:
            "GET",

          headers:
            operator
              ? {
                  "X-Device-Token":
                    operator.deviceToken,
                }
              : undefined,

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    const latency =
      Math.round(
        performance.now() -
          started,
      );

    const health =
      (await response.json()) as
        BackendHealthResponse;

    if (
      !health.configured
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

        authenticated:
          false,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    if (
      !health.reachable
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

        authenticated:
          false,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    if (
      weakConnection(
        connection,
      ) ||
      latency >=
        WEAK_PROBE_LATENCY_MS
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

        authenticated:
          health.authenticated ===
          true,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    if (
      !operator
    ) {
      return snapshot({
        mode:
          "local-only",

        reason:
          "device_not_registered",

        canUpload:
          false,

        internetReachable:
          true,

        backendConfigured:
          true,

        backendReachable:
          true,

        authenticated:
          false,

        probeLatencyMs:
          latency,

        ...common,
      });
    }

    if (
      !health.authenticated
    ) {
      return snapshot({
        mode:
          "local-only",

        reason:
          "device_unauthorized",

        canUpload:
          false,

        internetReachable:
          true,

        backendConfigured:
          true,

        backendReachable:
          true,

        authenticated:
          false,

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

      authenticated:
        true,

      probeLatencyMs:
        latency,

      ...common,
    });
  } catch {
    return snapshot({
      mode:
        "offline",

      reason:
        "probe_failed",

      canUpload:
        false,

      internetReachable:
        false,

      backendConfigured:
        true,

      backendReachable:
        false,

      authenticated:
        false,

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

  authenticated:
    false,

  checkedAt:
    "",
};