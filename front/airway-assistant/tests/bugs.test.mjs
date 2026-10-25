import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Isolated browser/API harness; no new test dependency or real device tokens.
function loadTS(path, dependencies = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
    URL, Headers, Response, Request, AbortController, AbortSignal, ArrayBuffer, Uint8Array, atob,
    setTimeout, clearTimeout, console, ...globals,
  });
  return exports;
}

const profilePath = "@/lib/profile/operator-profile";
const caseUuid = "4dfe4bde-40f4-4ada-a4e8-0ed351e97d38";
const photoUuid = "1dd95eb3-b88b-438b-9f8e-03e979885f24";
const readRequest = () => new Request("https://app/api/sync/cases", { headers: { "X-Device-Token": "device-secret" } });

test("photo proxy forwards authentication and exact image bytes without public media URLs", async () => {
  const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217]);
  const calls = [];
  const { proxyCaseRead } = loadTS("lib/server/case-read.ts", {}, {
    process: { env: { BACKEND_API_URL: "http://backend:8000" } },
    fetch: async (url, init) => { calls.push({ url, init }); return new Response(bytes, { headers: { "Content-Type": "image/jpeg" } }); },
  });
  const response = await proxyCaseRead(readRequest(), caseUuid, photoUuid);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(calls[0].url, `http://backend:8000/api/assessments/${caseUuid}/photos/${photoUuid}/`);
  assert.equal(calls[0].init.headers.Authorization, "Device device-secret");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "error");
  assert.doesNotMatch(calls[0].url, /device-secret/);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
});

test("case detail proxy returns the uploaded photo inventory", async () => {
  const payload = { id: caseUuid, photos: [{ id: photoUuid, position: "front" }] };
  const { proxyCaseRead } = loadTS("lib/server/case-read.ts", {}, {
    process: { env: { BACKEND_API_URL: "http://backend:8000" } },
    fetch: async (url) => {
      assert.equal(url, `http://backend:8000/api/assessments/${caseUuid}/`);
      return Response.json(payload);
    },
  });
  assert.deepEqual(await (await proxyCaseRead(readRequest(), caseUuid)).json(), payload);
});

test("photo proxy rejects unauthorized reads, invalid IDs, missing files, and nonimage responses", async () => {
  for (const [status, type, expected] of [
    [401, "application/json", 401], [403, "application/json", 403],
    [404, "text/html", 404], [200, "text/html", 502], [200, "image/svg+xml", 502],
  ]) {
    let fetched = false;
    const { proxyCaseRead } = loadTS("lib/server/case-read.ts", {}, {
      process: { env: { BACKEND_API_URL: "http://backend:8000" } },
      fetch: async () => { fetched = true; return new Response("upstream content", { status, headers: { "Content-Type": type } }); },
    });
    assert.equal((await proxyCaseRead(new Request("https://app"), caseUuid, photoUuid)).status, 401);
    assert.equal((await proxyCaseRead(readRequest(), "../other", photoUuid)).status, 400);
    assert.equal(fetched, false);
    const response = await proxyCaseRead(readRequest(), caseUuid, photoUuid);
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /upstream content/);
  }
});

test("browser loads server photo inventory and blobs through authenticated device requests", async () => {
  const paths = [];
  const { fetchServerPhotos, fetchServerPhoto } = loadTS("lib/api/server-photos.ts", {
    "@/lib/api/device-fetch": {
      deviceFetch: async (url) => {
        paths.push(url);
        return url.endsWith(`/photos/${photoUuid}`)
          ? new Response("image bytes", { headers: { "Content-Type": "image/jpeg" } })
          : Response.json({ photos: [{ id: photoUuid, position: "front" }] });
      },
    },
  });
  assert.equal((await fetchServerPhotos(caseUuid))[0].id, photoUuid);
  const photo = await fetchServerPhoto(caseUuid, photoUuid);
  assert.equal(photo.type, "image/jpeg");
  assert.equal(await photo.text(), "image bytes");
  assert.deepEqual(paths, [`/api/sync/cases/${caseUuid}`, `/api/sync/cases/${caseUuid}/photos/${photoUuid}`]);
});

test("browser reports failed photo downloads instead of displaying JSON as a broken image", async () => {
  const { fetchServerPhoto } = loadTS("lib/api/server-photos.ts", {
    "@/lib/api/device-fetch": { deviceFetch: async () => Response.json({ detail: "Not an image" }) },
  });
  await assert.rejects(() => fetchServerPhoto(caseUuid, photoUuid), /INVALID_PHOTO_DATA/);
});

const browser = (extra = {}) => ({
  window: {
    isSecureContext: true, Notification: {}, PushManager: {},
    matchMedia: () => ({ matches: false }),
    ...extra.window,
  },
  navigator: {
    userAgent: "desktop", platform: "Linux", maxTouchPoints: 0,
    serviceWorker: {}, onLine: true, ...extra.navigator,
  },
  Notification: { permission: "granted" },
});
function reminders(globals, cases = []) {
  return loadTS("lib/pwa/upload-reminder.ts", {
    [profilePath]: { OperatorDeviceError: class extends Error {} },
    "@/lib/db/database": { getAllCases: async () => cases },
    "@/lib/api/device-fetch": {},
  }, globals);
}

test("notification support identifies HTTPS, iPhone tab, installed app, and unsupported browser", () => {
  assert.equal(reminders(browser({ window: { isSecureContext: false } })).getNotificationSupport(), "insecure");
  const iphone = { userAgent: "iPhone", platform: "iPhone" };
  assert.equal(reminders(browser({ navigator: iphone })).getNotificationSupport(), "ios-install-required");
  assert.equal(reminders(browser({ navigator: { ...iphone, standalone: true } })).getNotificationSupport(), "available");
  assert.equal(reminders(browser({ window: { matchMedia: () => ({ matches: true }) }, navigator: { platform: "MacIntel", maxTouchPoints: 5 } })).getNotificationSupport(), "available");
  const unsupported = browser();
  delete unsupported.window.PushManager;
  assert.equal(reminders(unsupported).getNotificationSupport(), "unsupported");
});

test("enabling notifications with an empty or completed queue does not schedule reminders", async () => {
  for (const cases of [[], [{ syncStatus: "synced" }], [{ syncStatus: "draft" }]]) {
    const env = browser();
    env.navigator.serviceWorker.getRegistration = () => { assert.fail("No worker needed for empty queue"); };
    assert.equal(await reminders(env, cases).registerUploadReminderSync(), false);
  }
});

test("authenticated requests recover only on 401, retry once, and keep request body", async () => {
  let recovered = 0;
  const calls = [];
  const { deviceFetch } = loadTS("lib/api/device-fetch.ts", {
    [profilePath]: {
      ensureOperatorRegistered: async () => ({ deviceToken: "old" }),
      getOperatorProfile: () => ({ deviceToken: "old" }),
      recoverOperatorDevice: async () => { recovered++; return { deviceToken: "new" }; },
    },
  }, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response("{}", { status: calls.length === 1 ? 401 : 200 });
    },
  });
  const result = await deviceFetch("/api/push/subscriptions", { method: "POST", body: "subscription" });
  assert.equal(result.status, 200);
  assert.equal(recovered, 1);
  assert.deepEqual(calls.map(({ init }) => init.headers.get("X-Device-Token")), ["old", "new"]);
  assert.ok(calls.every(({ init }) => init.body === "subscription" && init.cache === "no-store"));
});

test("disabled devices do not recover", async () => {
  const { deviceFetch } = loadTS("lib/api/device-fetch.ts", {
    [profilePath]: {
      ensureOperatorRegistered: async () => ({ deviceToken: "blocked" }),
      getOperatorProfile: () => ({ deviceToken: "blocked" }),
      recoverOperatorDevice: async () => assert.fail("403 must not recover"),
    },
  }, { fetch: async () => new Response("{}", { status: 403 }) });
  assert.equal((await deviceFetch("/api/sync/cases")).status, 403);
});

test("parallel photo downloads share recovery and reuse a replacement token for late responses", async () => {
  let current = { deviceToken: "old" };
  let count = 0;
  let release;
  let started;
  const gate = new Promise((resolve) => { release = resolve; });
  const began = new Promise((resolve) => { started = resolve; });
  const { deviceFetch } = loadTS("lib/api/device-fetch.ts", {
    [profilePath]: {
      ensureOperatorRegistered: async () => ({ deviceToken: "old" }),
      getOperatorProfile: () => current,
      recoverOperatorDevice: async () => {
        count++;
        started();
        await gate;
        current = { deviceToken: "new" };
        return current;
      },
    },
  }, {
    fetch: async (_url, init) => new Response("{}", {
      status: init.headers.get("X-Device-Token") === "old" ? 401 : 200,
    }),
  });
  const requests = [deviceFetch("/photo/1"), deviceFetch("/photo/2")];
  await began;
  release();
  const responses = await Promise.all(requests);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal((await deviceFetch("/photo/late")).status, 200);
  assert.equal(count, 1);
});

test("case GET forwards only the authenticated case list and is never cached", async () => {
  const rows = [{ id: "case", full_name: "Patient" }];
  const calls = [];
  const route = loadTS("app/api/sync/cases/route.ts", { "next/server": { NextResponse: Response } }, {
    process: { env: { BACKEND_API_URL: "http://backend:8000" } },
    fetch: async (url, init) => { calls.push({ url, init }); return Response.json(rows); },
  });
  const unauthorized = await route.GET(new Request("https://app/api/sync/cases"));
  assert.equal(unauthorized.status, 401);
  assert.equal(calls.length, 0);
  const response = await route.GET(new Request("https://app/api/sync/cases", { headers: { "X-Device-Token": "test-token" } }));
  assert.deepEqual(await response.json(), rows);
  assert.equal(calls[0].url, "http://backend:8000/api/assessments/");
  assert.equal(calls[0].init.headers.get("Authorization"), "Device test-token");
  assert.match(response.headers.get("Cache-Control"), /no-store/);
});

test("case GET reports configuration, invalid response, and authentication errors", async () => {
  const request = new Request("https://app/api/sync/cases", { headers: { "X-Device-Token": "test" } });
  for (const [base, backend, expected] of [
    ["", Response.json([]), 503],
    ["http://backend", Response.json({ configured: true }), 502],
    ["http://backend", Response.json({ detail: "Unauthorized" }, { status: 401 }), 401],
    ["http://backend", Response.json({ detail: "Disabled" }, { status: 403 }), 403],
  ]) {
    const route = loadTS("app/api/sync/cases/route.ts", { "next/server": { NextResponse: Response } }, {
      process: { env: { BACKEND_API_URL: base } }, fetch: async () => backend,
    });
    assert.equal((await route.GET(request)).status, expected);
  }
});

test("case history merges server cases newest first without overwriting local drafts or photos", () => {
  const { mergeCaseHistory } = loadTS("lib/api/case-history.ts", { "@/lib/api/device-fetch": {} });
  const local = { id: "same", createdAt: "2026-10-24T10:00:00Z", syncStatus: "queued", clinical: { fullName: "Local" } };
  const server = [
    { id: "same", created_at: "2026-10-24T10:00:00Z", full_name: "Server stale", is_complete: false },
    { id: "remote", created_at: "2026-10-25T10:00:00Z", full_name: "Recent", is_complete: true },
  ];
  const result = mergeCaseHistory([local], server);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "remote");
  assert.equal(result[1].local, local);
  assert.equal(result[1].name, "Local");
  assert.equal(result[0].source, "server");
});

function workerHarness(statuses) {
  const listeners = {};
  const notifications = [];
  const context = {
    self: {
      location: { origin: "https://app" },
      addEventListener: (name, callback) => { listeners[name] = callback; },
      clients: { matchAll: async () => [] },
      registration: {
        showNotification: async (...args) => { notifications.push(args); },
        getNotifications: async ({ tag }) => notifications.filter((item) => item[1].tag === tag),
      },
    },
    indexedDB: { open: () => {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true }, close() {},
          transaction: () => {
            let completed = 0;
            const transaction = { objectStore: () => ({ index: () => ({ count: (status) => {
              const count = {};
              queueMicrotask(() => {
                count.result = statuses.filter((item) => item === status).length;
                count.onsuccess();
                if (++completed === 3) transaction.oncomplete();
              });
              return count;
            } }) }) };
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    } },
    URL, Response,
    fetch: async () => Response.json({ configured: true, reachable: true, databaseReady: true }),
  };
  context.self.indexedDB = context.indexedDB;
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  return { listeners, notifications };
}

test("background reminders recheck durable queue after uploads complete", async () => {
  for (const [statuses, expected] of [[[], 0], [["synced", "draft"], 0], [["queued"], 1]]) {
    const { listeners, notifications } = workerHarness(statuses);
    let work;
    listeners.sync({ tag: "airway-upload-reminder-v1", waitUntil: (promise) => { work = promise; } });
    await work;
    assert.equal(notifications.length, expected);
  }
});

test("message reminders use the same pending queue check and avoid duplicate notifications", async () => {
  for (const [statuses, expected] of [[[], 0], [["queued"], 1]]) {
    const { listeners, notifications } = workerHarness(statuses);
    for (let attempt = 0; attempt < 2; attempt++) {
      let work;
      listeners.message({ data: { type: "AIRWAY_CHECK_PENDING_REMINDER" }, waitUntil: (promise) => { work = promise; } });
      await work;
    }
    assert.equal(notifications.length, expected);
  }
});

test("real push tests display even with empty queue and use a distinct test message", async () => {
  const { listeners, notifications } = workerHarness([]);
  let work;
  listeners.push({ data: { json: () => ({ type: "push-test" }) }, waitUntil: (promise) => { work = promise; } });
  await work;
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][1].tag, "airway-push-test");
  assert.doesNotMatch(notifications[0][1].body, /انتظار/);
});

test("server reminder does not claim an empty queue needs uploading", async () => {
  const { listeners, notifications } = workerHarness(["synced"]);
  let work;
  listeners.push({ data: { json: () => ({ type: "sync-reminder" }) }, waitUntil: (promise) => { work = promise; } });
  await work;
  assert.equal(notifications.length, 1);
  assert.doesNotMatch(notifications[0][1].body, /انتظار/);
});

test("iPhone subscription is started synchronously from the click; background setup never subscribes", async () => {
  const env = browser();
  let subscribed = 0;
  let current = null;
  const profile = { deviceToken: "test-device" };
  const registration = {
    active: true,
    pushManager: {
      getSubscription: async () => current,
      subscribe: () => {
        subscribed++;
        current = { endpoint: "https://push.test/1", options: {}, toJSON: () => ({ endpoint: "https://push.test/1" }) };
        return Promise.resolve(current);
      },
    },
  };
  env.navigator.serviceWorker.getRegistration = async () => registration;
  env.fetch = async () => Response.json({ enabled: true, public_key: "AQ" });
  const setup = loadTS("lib/pwa/upload-reminder.ts", {
    [profilePath]: {
      OperatorDeviceError: class extends Error {},
      ensureOperatorRegistered: async () => profile,
      getOperatorProfile: () => profile,
    },
    "@/lib/db/database": { getAllCases: async () => [] },
    "@/lib/api/device-fetch": { deviceFetch: async () => Response.json({ active: true }) },
  }, env);
  assert.equal(await setup.ensureWebPushSubscription(), "pending");
  assert.equal(subscribed, 0);
  await setup.preloadPushConfiguration();
  const task = setup.enableWebPushFromGesture();
  assert.equal(subscribed, 1, "subscribe must run before returning to the event loop");
  assert.equal(await task, "active");
});

test("notification setup distinguishes server failures from missing worker and browser push errors", async () => {
  for (const [mode, expected] of [["config", "server-unavailable"], ["worker", "worker-unavailable"], ["browser", "subscription-error"]]) {
    const env = browser();
    env.fetch = async () => mode === "config" ? new Response("error", { status: 502 }) : Response.json({ enabled: true, public_key: "AQ" });
    env.navigator.serviceWorker.getRegistration = async () => mode === "worker" ? null : {
      active: true, pushManager: { getSubscription: async () => { throw new Error("Push service unavailable"); } },
    };
    assert.equal(await reminders(env).ensureWebPushSubscription(), expected);
  }
});
