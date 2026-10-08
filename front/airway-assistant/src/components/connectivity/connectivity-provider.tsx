"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  checkConnectivity,
  INITIAL_CONNECTIVITY,
  type ConnectivitySnapshot,
} from "@/lib/network/connectivity";

interface ConnectivityContextValue {
  connectivity:
    ConnectivitySnapshot;

  refresh:
    () =>
      Promise<ConnectivitySnapshot>;
}

const ConnectivityContext =
  createContext<
    ConnectivityContextValue | null
  >(null);

interface ConnectivityProviderProps {
  children:
    ReactNode;
}

/*
 * Heartbeat فقط برای UI است.
 *
 * eventهای online/focus/visibility
 * تغییر اتصال را سریع‌تر می‌گیرند.
 */
const HEARTBEAT_INTERVAL_MS =
  60_000;

export function ConnectivityProvider({
  children,
}: ConnectivityProviderProps) {
  const [
    connectivity,
    setConnectivity,
  ] =
    useState<ConnectivitySnapshot>(
      INITIAL_CONNECTIVITY,
    );

  const mountedRef =
    useRef(true);

  /*
   * اگر چند component هم‌زمان refresh بخواهند،
   * فقط یک health request واقعی ارسال شود.
   */
  const inFlightRef =
    useRef<
      Promise<ConnectivitySnapshot> | null
    >(null);

  const refresh =
    useCallback(
      async () => {
        if (
          inFlightRef.current
        ) {
          return inFlightRef.current;
        }

        const request =
          checkConnectivity();

        inFlightRef.current =
          request;

        try {
          const result =
            await request;

          if (
            mountedRef.current
          ) {
            setConnectivity(
              result,
            );
          }

          return result;
        } finally {
          if (
            inFlightRef.current ===
            request
          ) {
            inFlightRef.current =
              null;
          }
        }
      },
      [],
    );

  useEffect(() => {
    mountedRef.current =
      true;

    void refresh();

    const intervalId =
      window.setInterval(
        () => {
          /*
           * وقتی tab/PWA hidden است،
           * برای status UI heartbeat لازم نیست.
           */
          if (
            document.visibilityState ===
            "visible"
          ) {
            void refresh();
          }
        },
        HEARTBEAT_INTERVAL_MS,
      );

    const handleOnline =
      () => {
        void refresh();
      };

    const handleOffline =
      () => {
        /*
         * checkConnectivity در حالت offline
         * هیچ request شبکه‌ای نمی‌زند.
         */
        void refresh();
      };

    const handleFocus =
      () => {
        void refresh();
      };

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void refresh();
        }
      };

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "offline",
      handleOffline,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      mountedRef.current =
        false;

      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "offline",
        handleOffline,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [
    refresh,
  ]);

  return (
    <ConnectivityContext.Provider
      value={{
        connectivity,
        refresh,
      }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const context =
    useContext(
      ConnectivityContext,
    );

  if (!context) {
    throw new Error(
      "useConnectivity must be used inside ConnectivityProvider",
    );
  }

  return context;
}