"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAllCases } from "@/lib/db/database";
import { fetchServerCases, mergeCaseHistory, type ServerCase } from "@/lib/api/case-history";
import type { AirwayCase } from "@/lib/domain/types";

export function useCaseHistory() {
  const [local, setLocal] = useState<AirwayCase[]>([]);
  const [server, setServer] = useState<ServerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    setError(null);
    // Show device records immediately, even while the server is slow or offline.
    const localTask = getAllCases().then(setLocal).catch(() => {
      setError("خواندن پرونده‌های دستگاه انجام نشد.");
    }).finally(() => setLoading(false));
    const serverTask = navigator.onLine === false
      ? Promise.resolve()
      : fetchServerCases().then(setServer).catch(() => {
        setError("دریافت پرونده‌های سرور انجام نشد؛ پرونده‌های دستگاه همچنان در دسترس هستند.");
      });
    await Promise.all([localTask, serverTask]);
    running.current = false;
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const update = () => { void refresh(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    // Uploads can finish while a server history request is still in flight.
    // Refresh local status independently so that change is never dropped.
    const onCasesChanged = () => {
      void getAllCases().then(setLocal).catch(() => {
        setError("خواندن پرونده‌های دستگاه انجام نشد.");
      });
    };
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    window.addEventListener("airway-cases-changed", onCasesChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      window.removeEventListener("airway-cases-changed", onCasesChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return {
    cases: mergeCaseHistory(local, server),
    loading: loading || (refreshing && local.length === 0 && server.length === 0),
    refreshing, error, refresh,
  };
}
