const CACHE_VERSION = "offline-v6-20261025";

const SHELL_CACHE = `airway-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `airway-assets-${CACHE_VERSION}`;

const PAGES = [
  "/",
  "/cases",
  "/cases/new",
  "/queue",
  "/capture",
];

const PUBLIC_ASSETS = [
  "/icon.svg",
  "/manifest.webmanifest",
];

const SYNC_TAG = "airway-upload-reminder-v1";
const NOTIFICATION_TAG = "airway-upload-reminder";

const CASE_ROUTE =
  /^\/cases\/([0-9a-fA-F-]{36})\/capture\/?$/;

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  );
}

function getAssetsFromHtml(html) {
  const assets = new Set();

  const tags = html.matchAll(
    /<(script|link)\b[^>]*>/gi,
  );

  for (const tag of tags) {
    const attributes = tag[0];

    for (const attribute of ["src", "href"]) {
      const matcher = new RegExp(
        `\\b${attribute}\\s*=\\s*["']([^"']+)["']`,
        "i",
      );

      const match = attributes.match(matcher);

      if (!match) continue;

      try {
        const url = new URL(
          match[1].replaceAll("&amp;", "&"),
          self.location.origin,
        );

        if (isStaticAsset(url)) {
          assets.add(url.href);
        }
      } catch {
        // Ignore invalid resource URLs.
      }
    }
  }

  return assets;
}

async function installOfflineShell() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const urls = new Set();

  for (const path of PAGES) {
    const response = await fetch(path, {
      cache: "reload",
      credentials: "same-origin",
    });

    const contentType =
      response.headers.get("content-type") || "";

    if (
      !response.ok ||
      !contentType.includes("text/html")
    ) {
      throw new Error(
        `Offline installation failed: ${path}`,
      );
    }

    const html = await response.clone().text();

    await shell.put(path, response);

    for (const url of getAssetsFromHtml(html)) {
      urls.add(url);
    }
  }

  for (const path of PUBLIC_ASSETS) {
    try {
      const response = await fetch(path, {
        cache: "reload",
      });

      if (response.ok) {
        await assets.put(path, response);
      }
    } catch {
      // Non-essential public asset.
    }
  }

  await Promise.all(
    [...urls].map(async (url) => {
      const response = await fetch(url, {
        cache: "reload",
      });

      if (!response.ok) {
        throw new Error(
          `Offline asset unavailable: ${url}`,
        );
      }

      await assets.put(url, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await installOfflineShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith("airway-shell-") ||
                name.startsWith("airway-assets-") ||
                name.startsWith("airway-assistant-")) &&
              name !== SHELL_CACHE &&
              name !== ASSET_CACHE,
          )
          .map((name) => caches.delete(name)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Never cache Backend responses.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const legacy = url.pathname.match(CASE_ROUTE);

          if (legacy) {
            const destination = new URL(
              `/capture?caseId=${encodeURIComponent(
                legacy[1],
              )}`,
              self.location.origin,
            );

            return Response.redirect(
              destination.href,
              302,
            );
          }

          const shell = await caches.open(
            SHELL_CACHE,
          );

          const response = await shell.match(
            url.pathname,
          );

          return response || Response.error();
        }
      })(),
    );

    return;
  }

  if (
    isStaticAsset(url) ||
    PUBLIC_ASSETS.includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(
          ASSET_CACHE,
        );

        const cached = await cache.match(
          request,
          {
            ignoreSearch: true,
          },
        );

        if (cached) return cached;

        const response = await fetch(request);

        if (response.ok) {
          await cache.put(
            request,
            response.clone(),
          );
        }

        return response;
      })(),
    );
  }
});

async function hasVisibleWindow() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  return clients.some(
    (client) =>
      client.visibilityState === "visible",
  );
}

async function backendReady() {
  try {
    const response = await fetch(
      `/api/backend-health?sw=${Date.now()}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) return false;

    const result = await response.json();

    return (
      result.configured === true &&
      result.reachable === true &&
      result.databaseReady === true
    );
  } catch {
    return false;
  }
}

// Read the same durable queue as the app; a registered sync tag can outlive
// the upload that created it. Never create or upgrade the database here.
async function hasPendingUploads() {
  return new Promise((resolve) => {
    const request = indexedDB.open("airway-assistant-db");
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cases")) {
        db.close();
        resolve(false);
        return;
      }
      const transaction = db.transaction("cases", "readonly");
      const cases = transaction.objectStore("cases").getAll();
      cases.onsuccess = () => resolve(cases.result.some((item) =>
        ["queued", "syncing", "failed"].includes(item.syncStatus),
      ));
      cases.onerror = () => resolve(false);
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => { db.close(); resolve(false); };
    };
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;

  event.waitUntil(
    (async () => {
      if (!(await hasPendingUploads()) || await hasVisibleWindow()) return;

      if (!(await backendReady())) {
        throw new Error("BACKEND_NOT_READY");
      }

      try {
        await self.registration.showNotification(
          "اتصال اینترنت برقرار شد",
          {
            body:
              "مواردی در انتظار ارسال دارید. برای ادامه ارسال، برنامه را باز کنید.",
            tag: NOTIFICATION_TAG,
            data: {
              url: "/queue",
            },
          },
        );
      } catch {
        // Notification permission may be unavailable.
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const target = new URL(
        event.notification?.data?.url || "/queue",
        self.location.origin,
      ).href;

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        try {
          if ("navigate" in client) {
            await client.navigate(target);
          }

          await client.focus();
          return;
        } catch {
          // Try another window.
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data?.json() || {};
    } catch {
      // Legacy pushes have no JSON payload.
    }
    const test = payload.type === "push-test";
    const pending = !test && await hasPendingUploads();
    // Safari requires every received push to display a notification. For a
    // stale reminder, use neutral wording instead of claiming uploads remain.
    await self.registration.showNotification(
      test ? "اعلان آزمایشی" : "یادآوری ارسال",
      {
        body: test
          ? "اتصال اعلان این دستگاه به سرور برقرار است."
          : pending
            ? "مواردی در انتظار ارسال دارید. برنامه را باز کنید."
            : "برای مشاهده وضعیت ارسال، برنامه را باز کنید.",
        tag: test ? "airway-push-test" : NOTIFICATION_TAG,
        data: { url: "/queue" },
      },
    );
  })());
});
