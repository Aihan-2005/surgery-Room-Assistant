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
  getBrowserConnection,
  INITIAL_CONNECTIVITY,
  type ConnectivitySnapshot,
} from "@/lib/network/connectivity";

interface ConnectivityContextValue {
  connectivity:
    ConnectivitySnapshot;

  refresh:
    () => Promise<void>;
}

const ConnectivityContext =
  createContext<
    ConnectivityContextValue | null
  >(null);

interface ConnectivityProviderProps {
  children:
    ReactNode;
}

const CHECK_INTERVAL_MS =
  15_000;

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

  const requestIdRef =
    useRef(0);

  const mountedRef =
    useRef(true);

  const refresh =
    useCallback(
      async () => {
        const requestId =
          ++requestIdRef.current;

        const result =
          await checkConnectivity();

        if (
          !mountedRef.current ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        setConnectivity(
          result,
        );
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
          void refresh();
        },
        CHECK_INTERVAL_MS,
      );

    const handleNetworkChange =
      () => {
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
      handleNetworkChange,
    );

    window.addEventListener(
      "offline",
      handleNetworkChange,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    const connection =
      getBrowserConnection();

    connection?.addEventListener(
      "change",
      handleNetworkChange,
    );

    return () => {
      mountedRef.current =
        false;

      window.clearInterval(
        intervalId,
      );

      window.removeEventListener(
        "online",
        handleNetworkChange,
      );

      window.removeEventListener(
        "offline",
        handleNetworkChange,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      connection?.removeEventListener(
        "change",
        handleNetworkChange,
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