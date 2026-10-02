const CACHE_NAME =
  "airway-assistant-v1";

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll(["/"]),
        ),
    );

    self.skipWaiting();
  },
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key !==
                  CACHE_NAME,
              )
              .map((key) =>
                caches.delete(
                  key,
                ),
              ),
          ),
        ),
    );

    self.clients.claim();
  },
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url = new URL(
      request.url,
    );

    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }

   
    if (
      url.pathname.startsWith(
        "/api/",
      )
    ) {
      return;
    }

    event.respondWith(
      fetch(request)
        .then(
          async (response) => {
            if (
              response.ok
            ) {
              const cache =
                await caches.open(
                  CACHE_NAME,
                );

              await cache.put(
                request,
                response.clone(),
              );
            }

            return response;
          },
        )
        .catch(async () => {
          const cached =
            await caches.match(
              request,
            );

          if (cached) {
            return cached;
          }

        
          if (
            request.mode ===
            "navigate"
          ) {
            return caches.match(
              "/",
            );
          }

          throw new Error(
            "Offline resource unavailable",
          );
        }),
    );
  },
);