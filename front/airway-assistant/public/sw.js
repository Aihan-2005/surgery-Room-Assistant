const CACHE_NAME =
  "airway-assistant-v2";

const UPLOAD_REMINDER_SYNC_TAG =
  "airway-upload-reminder-v1";

const UPLOAD_REMINDER_NOTIFICATION_TAG =
  "airway-upload-reminder";


 
self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(
          CACHE_NAME,
        )
        .then(
          (cache) =>
            cache.addAll([
              "/",
            ]),
        ),
    );

    self.skipWaiting();
  },
);


 
self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      Promise.all([
        caches
          .keys()
          .then(
            (keys) =>
              Promise.all(
                keys
                  .filter(
                    (key) =>
                      key !==
                      CACHE_NAME,
                  )
                  .map(
                    (key) =>
                      caches.delete(
                        key,
                      ),
                  ),
              ),
          ),

        self.clients.claim(),
      ]),
    );
  },
);


 
self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

  
    if (
      request.method !==
      "GET"
    ) {
      return;
    }

    const url =
      new URL(
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
      fetch(
        request,
      )
        .then(
          async (
            response,
          ) => {
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
        .catch(
          async () => {
            const cached =
              await caches.match(
                request,
              );

            if (
              cached
            ) {
              return cached;
            }

       
            if (
              request.mode ===
              "navigate"
            ) {
              const home =
                await caches.match(
                  "/",
                );

              if (
                home
              ) {
                return home;
              }
            }

            throw new Error(
              "Offline resource unavailable",
            );
          },
        ),
    );
  },
);


 
async function hasVisibleAppWindow() {
  const windows =
    await self.clients.matchAll({
      type:
        "window",

      includeUncontrolled:
        true,
    });

  return windows.some(
    (
      client,
    ) =>
      client.visibilityState ===
      "visible",
  );
}


async function backendReady() {
  const response =
    await fetch(
      `/api/backend-health?sw=${Date.now()}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",
        },

        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    return false;
  }

  let payload;

  try {
    payload =
      await response.json();
  } catch {
    return false;
  }

  return (
    payload.configured ===
      true &&
    payload.reachable ===
      true &&
    payload.databaseReady ===
      true
  );
}


async function showUploadReminder() {
 
  try {
    await self.registration
      .showNotification(
        "اتصال برقرار شد",
        {
          body:
            "مواردی در انتظار ارسال دارید. برنامه را باز کنید تا ارسال ادامه پیدا کند.",

          tag:
            UPLOAD_REMINDER_NOTIFICATION_TAG,

          renotify:
            true,

          data: {
            url:
              "/queue",
          },
        },
      );
  } catch (
    error
  ) {
  
    console.warn(
      "Unable to show upload reminder:",
      error,
    );
  }
}


 
self.addEventListener(
  "sync",
  (event) => {
    if (
      event.tag !==
      UPLOAD_REMINDER_SYNC_TAG
    ) {
      return;
    }

    event.waitUntil(
      (async () => {
   
        if (
          await hasVisibleAppWindow()
        ) {
          return;
        }
 
        const ready =
          await backendReady();

        if (
          !ready
        ) {
  
          throw new Error(
            "BACKEND_NOT_READY",
          );
        }

        await showUploadReminder();
      })(),
    );
  },
);


 
self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const targetPath =
      event.notification
        ?.data
        ?.url ||
      "/queue";

    event.waitUntil(
      (async () => {
        const targetUrl =
          new URL(
            targetPath,
            self.location.origin,
          ).href;

        const windows =
          await self.clients.matchAll({
            type:
              "window",

            includeUncontrolled:
              true,
          });

    
        for (
          const client of
          windows
        ) {
          try {
            if (
              "navigate" in
              client
            ) {
              await client.navigate(
                targetUrl,
              );
            }

            await client.focus();

            return;
          } catch {
        
          }
        }

     
        if (
          self.clients.openWindow
        ) {
          await self.clients.openWindow(
            targetUrl,
          );
        }
      })(),
    );
  },
);


 
self.addEventListener(
  "push",
  (event) => {
    event.waitUntil(
      self.registration
        .showNotification(
          "یادآوری ارسال",
          {
       
            body:
              "مواردی در انتظار بررسی یا ارسال دارید. برنامه را باز کنید.",

            tag:
              UPLOAD_REMINDER_NOTIFICATION_TAG,

            data: {
              url:
                "/queue",
            },
          },
        )
        .catch(
          () => undefined,
        ),
    );
  },
);

