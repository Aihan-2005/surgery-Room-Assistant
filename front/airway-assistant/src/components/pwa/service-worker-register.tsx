"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
 
    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      return;
    }

    if (
      !(
        "serviceWorker" in
        navigator
      )
    ) {
      return;
    }

    const registerWorker =
      async () => {
        try {
          await navigator
            .serviceWorker
            .register("/sw.js");
        } catch (error) {
          console.error(
            "Service worker registration failed:",
            error,
          );
        }
      };

    registerWorker();
  }, []);

  return null;
}