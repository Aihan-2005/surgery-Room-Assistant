"use client";

import {
  useEffect,
} from "react";


export function ServiceWorkerRegister() {
  useEffect(() => {
    /*
     * Service Worker در next dev فعال نشود.
     *
     * cache کردن فایل‌های development
     * می‌تواند مشکلات بسیار گیج‌کننده ایجاد کند.
     */
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


    async function registerWorker() {
      try {
        const registration =
          await navigator
            .serviceWorker
            .register(
              "/sw.js",
              {
                scope:
                  "/",

                /*
                 * نسخه جدید sw.js از cache
                 * قدیمی Browser خوانده نشود.
                 */
                updateViaCache:
                  "none",
              },
            );

        /*
         * هنگام بازشدن اپ update
         * Service Worker هم بررسی شود.
         */
        await registration
          .update();
      } catch (
        error
      ) {
        console.error(
          "Service worker registration failed:",
          error,
        );
      }
    }


    void registerWorker();
  }, []);


  return null;
}