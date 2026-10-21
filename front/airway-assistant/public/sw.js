


const CACHE_VERSION =
  "offline-v6-pending-reminders-20261021";

const SHELL_CACHE =
  `airway-shell-${CACHE_VERSION}`;

const ASSET_CACHE =
  `airway-assets-${CACHE_VERSION}`;

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

const SYNC_TAG =
  "airway-upload-reminder-v1";

const NOTIFICATION_TAG =
  "airway-upload-reminder";

const DB_NAME = "airway-assistant-db";

const PENDING_STATUSES = [
  "queued",
  "syncing",
  "failed",
];

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
    for (const attribute of ["src", "href"]) {
      const match = tag[0].match(
        new RegExp(
          `\\b${attribute}\\s*=\\s*["']([^"']+)["']`,
          "i",
        ),
      );

      if (!match) {
        continue;
      }

      try {
        const url = new URL(
          match[1].replaceAll("&amp;", "&"),
          self.location.origin,
        );

        if (isStaticAsset(url)) {
          assets.add(url.href);
        }
      } catch {
        // Ignore malformed resource URLs.
      }
    }
  }

  return assets;
}



async function installOfflineShell() {
  const shell = await caches.open(SHELL_CACHE);

  const assets = await caches.open(ASSET_CACHE);

  const staticUrls = new Set();

  for (const path of PAGES) {
    const response = await fetch(path, {
      cache: "reload",
      credentials: "same-origin",
    });

    const type =
      response.headers.get("content-type") || "";

    if (
      !response.ok ||
      !type.includes("text/html")
    ) {
      throw new Error(
        `Offline installation failed: ${path}`,
      );
    }

    const html = await response.clone().text();

    await shell.put(path, response);

    for (const url of getAssetsFromHtml(html)) {
      staticUrls.add(url);
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

    }
  }

  await Promise.all(
    [...staticUrls].map(async (url) => {
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
              (
                name.startsWith("airway-shell-") ||
                name.startsWith("airway-assets-") ||
                name.startsWith("airway-assistant-")
              ) &&
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

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  
  

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
          const legacy =
            url.pathname.match(CASE_ROUTE);

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

          const shell =
            await caches.open(SHELL_CACHE);

          return (
            (await shell.match(url.pathname)) ||
            Response.error()
          );
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
        const cache =
          await caches.open(ASSET_CACHE);

        const cached = await cache.match(
          request,
          {
            ignoreSearch: true,
          },
        );

        if (cached) {
          return cached;
        }

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


function countPendingCases() {
  return new Promise((resolve) => {
    if (!self.indexedDB) {
      resolve(0);
      return;
    }

    let openRequest;

    try {
      openRequest = indexedDB.open(DB_NAME);
    } catch {
      resolve(0);
      return;
    }

    openRequest.onupgradeneeded = () => {
      openRequest.transaction?.abort();
    };

    openRequest.onerror = () => {
      resolve(0);
    };

    openRequest.onblocked = () => {
      resolve(0);
    };

    openRequest.onsuccess = () => {
      const db = openRequest.result;

      if (!db.objectStoreNames.contains("cases")) {
        db.close();
        resolve(0);
        return;
      }

      try {
        const tx = db.transaction(
          "cases",
          "readonly",
        );

        const store =
          tx.objectStore("cases");

        const statusIndex =
          store.index("by-sync-status");

        let total = 0;

        for (const status of PENDING_STATUSES) {
          const countRequest =
            statusIndex.count(status);

          countRequest.onsuccess = () => {
            total += countRequest.result;
          };
        }

        tx.oncomplete = () => {
          db.close();
          resolve(total);
        };

        tx.onerror = () => {
          db.close();
          resolve(0);
        };

        tx.onabort = () => {
          db.close();
          resolve(0);
        };
      } catch {
        db.close();
        resolve(0);
      }
    };
  });
}



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

async function showPendingReminderIfNeeded() {

  
  if (await hasVisibleWindow()) {
    return;
  }

 
  
  const pendingCount =
    await countPendingCases();

  if (pendingCount === 0) {
    return;
  }


  
  const displayed =
    await self.registration.getNotifications({
      tag: NOTIFICATION_TAG,
    });

  if (displayed.length > 0) {
    return;
  }

  await self.registration.showNotification(
    "مواردی در انتظار ارسال هستند",
    {
      body:
        "ارسال هنوز کامل نشده است. " +
        "برای بررسی صف، برنامه را باز کنید.",

      tag: NOTIFICATION_TAG,

      data: {
        url: "/queue",
      },
    },
  );
}
 
self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) {
    return;
  }

  event.waitUntil(
    showPendingReminderIfNeeded().catch(
      () => undefined,
    ),
  );
});




self.addEventListener("message", (event) => {
  if (
    event.data?.type !==
    "AIRWAY_CHECK_PENDING_REMINDER"
  ) {
    return;
  }

  event.waitUntil(
    showPendingReminderIfNeeded().catch(
      () => undefined,
    ),
  );
});




self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    event.waitUntil(
      (async () => {
     
        

        const target = new URL(
          "/queue",
          self.location.origin,
        ).href;

        const windows =
          await self.clients.matchAll({
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

          }
        }

        if (self.clients.openWindow) {
          await self.clients.openWindow(target);
        }
      })(),
    );
  },
);



self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration
      .showNotification(
        "یادآوری ارسال",
        {
          body:
            "برای بررسی وضعیت ارسال، برنامه را باز کنید.",

          tag: "airway-server-push",

          data: {
            url: "/queue",
          },
        },
      )
      .catch(() => undefined),
  );
});


