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
  | "backend_unreachable";

export interface ConnectivitySnapshot {
  mode:
    ConnectivityMode;

  reason:
    ConnectivityReason;

  /**
   * آیا در همین لحظه upload واقعی مجاز است؟
   */
  canUpload:
    boolean;

  /**
   * آیا حداقل ارتباط با Next.js server برقرار است؟
   */
  internetReachable:
    boolean;

  backendConfigured:
    boolean;

  backendReachable:
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

  status?:
    number;

  message?:
    string;
}

const PROBE_TIMEOUT_MS =
  4500;

/**
 * اگر probe بیشتر از این زمان طول بکشد،
 * برای ارسال تصاویر اتصال را ضعیف در نظر می‌گیریم.
 */
const WEAK_PROBE_LATENCY_MS =
  3000;

/**
 * Mbps
 *
 * فقط زمانی استفاده می‌شود که browser
 * Network Information API را پشتیبانی کند.
 */
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

function isConnectionObviouslyWeak(
  connection:
    BrowserNetworkInformation | null,
) {
  if (!connection) {
    return false;
  }

  const effectiveType =
    connection.effectiveType;

  if (
    effectiveType ===
      "slow-2g" ||
    effectiveType ===
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

  if (
    typeof connection.rtt ===
      "number" &&
    connection.rtt >=
      WEAK_RTT_MS
  ) {
    return true;
  }

  return false;
}

function buildSnapshot(
  partial:
    Omit<
      ConnectivitySnapshot,
      "checkedAt"
    >,
): ConnectivitySnapshot {
  return {
    ...partial,

    checkedAt:
      new Date().toISOString(),
  };
}

export async function checkConnectivity():
  Promise<ConnectivitySnapshot> {
  if (
    typeof window ===
      "undefined" ||
    typeof navigator ===
      "undefined"
  ) {
    return buildSnapshot({
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
    });
  }

  const connection =
    getBrowserConnection();

  const effectiveType =
    connection
      ?.effectiveType;

  const downlinkMbps =
    connection
      ?.downlink;

  const rttMs =
    connection
      ?.rtt;

  const saveData =
    connection
      ?.saveData;

  if (
    navigator.onLine ===
    false
  ) {
    return buildSnapshot({
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

      effectiveType,

      downlinkMbps,

      rttMs,

      saveData,
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
    /*
     * همین endpoint موجود پروژه:
     *
     * GET /api/sync/cases
     *
     * هم دسترسی به Next server را ثابت می‌کند
     * و هم وضعیت Backend آینده را برمی‌گرداند.
     *
     * Service Worker فعلی /api را cache نمی‌کند،
     * پس پاسخ cache شده باعث Online جعلی نمی‌شود.
     */
    const response =
      await fetch(
        `/api/sync/cases?connectivity=${Date.now()}`,
        {
          method:
            "GET",

          cache:
            "no-store",

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",
          },
        },
      );

    const probeLatencyMs =
      Math.round(
        performance.now() -
          startedAt,
      );

    let health:
      BackendHealthResponse =
      {};

    try {
      health =
        (await response.json()) as
          BackendHealthResponse;
    } catch {
      health = {};
    }

    const backendConfigured =
      health.configured ===
      true;

    const backendReachable =
      health.reachable ===
      true;

    const weakByBrowser =
      isConnectionObviouslyWeak(
        connection,
      );

    const weakByProbe =
      probeLatencyMs >=
      WEAK_PROBE_LATENCY_MS;

    if (
      weakByBrowser ||
      weakByProbe
    ) {
      return buildSnapshot({
        mode:
          "weak",

        reason:
          "connection_too_slow",

        canUpload:
          false,

        internetReachable:
          true,

        backendConfigured,

        backendReachable,

        probeLatencyMs,

        effectiveType,

        downlinkMbps,

        rttMs,

        saveData,
      });
    }

    /*
     * Backend هنوز ساخته نشده.
     *
     * اینترنت داریم، اما upload واقعی نداریم.
     */
    if (
      !backendConfigured
    ) {
      return buildSnapshot({
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

        probeLatencyMs,

        effectiveType,

        downlinkMbps,

        rttMs,

        saveData,
      });
    }

    /*
     * Backend configured است،
     * اما health check آن شکست خورده.
     */
    if (
      !backendReachable
    ) {
      return buildSnapshot({
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

        probeLatencyMs,

        effectiveType,

        downlinkMbps,

        rttMs,

        saveData,
      });
    }

    return buildSnapshot({
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

      probeLatencyMs,

      effectiveType,

      downlinkMbps,

      rttMs,

      saveData,
    });
  } catch {
    return buildSnapshot({
      mode:
        "offline",

      reason:
        "probe_failed",

      canUpload:
        false,

      internetReachable:
        false,

      backendConfigured:
        false,

      backendReachable:
        false,

      effectiveType,

      downlinkMbps,

      rttMs,

      saveData,
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

  checkedAt:
    "",
};