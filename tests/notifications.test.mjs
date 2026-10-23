import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as pause } from "node:timers/promises";
import vm from "node:vm";
import {
  CalendarWatch,
  CHECK_INTERVAL,
  calendarChanges,
} from "../server/calendar-watch.mjs";
import {
  PushService,
  sendWebPush,
  validateSubscription,
} from "../server/push.mjs";
import { SiteSettings } from "../server/settings.mjs";
import { fakeProvider, request, signIn, startTestApp } from "./helpers.mjs";

const now = Date.parse("2026-10-23T10:00:00Z");
const fixture = () => ({
  id: "3001",
  round: 1,
  home: "C.D. Olivares A",
  away: "Deportivo Norte",
  homeId: "1001",
  awayId: "1002",
  homeScore: null,
  awayScore: null,
  date: "2026-10-24",
  time: "10:00",
  venue: "Campo Municipal",
  status: "scheduled",
});
const snapshot = () => ({
  team: {
    id: "1001",
    name: "C.D. Olivares A",
    category: "Alevín F-7",
    season: "2026/2027",
  },
  matches: [fixture()],
  warnings: [],
  stale: false,
});
function subscription(name = "test-a") {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    keys: {
      p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
    expirationTime: null,
  };
}
async function directory(t) {
  const value = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-notifications-"),
  );
  t.after(() => rm(value, { recursive: true, force: true }));
  return value;
}
async function harness(t) {
  const dir = await directory(t);
  const state = {
    now,
    source: snapshot(),
    loads: 0,
    sent: [],
    failPush: false,
  };
  const settings = new SiteSettings(dir);
  await settings.save(state.source.team);
  const options = {
    directory: dir,
    clock: () => state.now,
    send: async (sub, payload) => {
      if (state.failPush)
        throw Object.assign(new Error("temporary error"), { statusCode: 503 });
      state.sent.push({ id: sub.id, payload });
    },
  };
  const push = new PushService(options);
  const load = async () => {
    state.loads++;
    if (state.source instanceof Error) throw state.source;
    return structuredClone(state.source);
  };
  const watcher = new CalendarWatch({
    directory: dir,
    settings,
    push,
    load,
    clock: () => state.now,
  });
  return { dir, state, settings, push, watcher, load, options };
}

test("establishes a silent reference, checks after 24 hours, and reports exact changes once", async (t) => {
  const { state, push, watcher } = await harness(t);
  await push.subscribe(subscription());
  await watcher.check();
  assert.equal(state.loads, 1);
  assert.deepEqual((await watcher.feed()).events, []);
  assert.equal(state.sent.length, 0);
  state.source.matches[0].date = "2026-10-25";
  state.source.matches[0].time = "12:30";
  state.source.matches[0].venue = "Campo Nuevo";
  await watcher.check();
  assert.equal(state.loads, 1);
  state.now += CHECK_INTERVAL;
  await Promise.all([watcher.check(), watcher.check()]);
  const feed = await watcher.feed();
  assert.equal(state.loads, 2);
  assert.equal(feed.events.length, 1);
  assert.deepEqual(
    feed.events[0].changes.map((value) => value.field),
    ["date", "time", "venue"],
  );
  assert.equal(feed.events[0].changes[1].before, "10:00");
  assert.equal(feed.events[0].changes[1].after, "12:30");
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0].payload.body, /10:00 → 12:30/);
  assert.equal(state.sent[0].payload.url, "/?view=calendar");
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events.length, 1);
  assert.equal(state.sent.length, 1);
  assert.equal(
    Date.parse((await watcher.feed()).nextCheckAt) - state.now,
    CHECK_INTERVAL,
  );
});

test("does not turn results, formatting changes or temporarily missing fixtures into calendar alerts", async (t) => {
  const { state, watcher } = await harness(t);
  await watcher.check();
  state.source.matches[0].venue = "  CAMPO   MUNICIPAL ";
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events.length, 0);
  state.source.matches = [];
  await watcher.check({ force: true });
  assert.ok((await watcher.feed()).lastError);
  state.source = snapshot();
  state.source.matches[0].time = "11:00";
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events.length, 1);
  state.source.matches[0].homeScore = 2;
  state.source.matches[0].awayScore = 1;
  state.source.matches[0].status = "played";
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events.length, 1);
});

test("matches a renumbered fixture by its teams and round and handles postponements and newly published times", async (t) => {
  const { state, watcher } = await harness(t);
  state.source.matches[0].time = null;
  await watcher.check();
  state.source.matches[0].id = "4001";
  state.source.matches[0].time = "09:15";
  state.source.matches[0].status = "postponed";
  await watcher.check({ force: true });
  const event = (await watcher.feed()).events[0];
  assert.equal(event.type, "changed");
  assert.deepEqual(
    event.changes.map((value) => value.field),
    ["time", "status"],
  );
  assert.equal(event.changes[0].before, "Por confirmar");
  const matches = [
    fixture(),
    { ...fixture(), round: 2, home: "Otro Equipo", homeId: "1003" },
  ].map((match) => ({ ...match, id: "0", played: false }));
  assert.deepEqual(
    calendarChanges(matches, structuredClone(matches), now).events,
    [],
  );
});

test("keeps the baseline through source errors and stale responses, then compares the recovered calendar", async (t) => {
  const { state, watcher } = await harness(t);
  await watcher.check();
  const initialCheck = (await watcher.feed()).lastCheckedAt;
  state.now += CHECK_INTERVAL;
  state.source = new Error("source offline");
  await watcher.check();
  assert.equal((await watcher.feed()).lastCheckedAt, initialCheck);
  assert.equal(
    Date.parse((await watcher.feed()).nextCheckAt) - state.now,
    15 * 60_000,
  );
  state.source = snapshot();
  state.source.stale = true;
  state.source.matches[0].time = "13:00";
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events.length, 0);
  state.source.stale = false;
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events[0].changes[0].before, "10:00");
  assert.equal((await watcher.feed()).events[0].changes[0].after, "13:00");
});

test("persists failed deliveries and stable keys across restarts without sending old updates to new subscribers", async (t) => {
  const { state, push, watcher, dir, settings, load, options } =
    await harness(t);
  await push.subscribe(subscription());
  const publicKey = await push.publicKey();
  await watcher.check();
  state.failPush = true;
  state.source.matches[0].time = "11:00";
  await watcher.check({ force: true });
  assert.equal((await watcher.status()).pendingDeliveries, 1);
  await push.subscribe(subscription("test-b"));
  state.failPush = false;
  state.now += 5 * 60_000;
  const restoredPush = new PushService(options);
  const restored = new CalendarWatch({
    directory: dir,
    settings,
    load,
    push: restoredPush,
    clock: () => state.now,
  });
  assert.equal(await restoredPush.publicKey(), publicKey);
  await restored.check();
  assert.equal(state.loads, 2);
  assert.equal(state.sent.length, 1);
  assert.equal((await restored.status()).pendingDeliveries, 0);
  assert.equal((await restored.feed()).events.length, 1);
  for (const file of [
    "calendar-watch.json",
    "push-keys.json",
    "push-subscriptions.json",
  ])
    assert.equal((await stat(path.join(dir, file))).mode & 0o777, 0o600);
});

test("starts a daily check without page requests and resets the reference quietly for a new season", async (t) => {
  const { state, watcher, push } = await harness(t);
  await watcher.setup(state.source);
  await push.subscribe(subscription());
  state.source.matches[0].time = "11:00";
  state.now += CHECK_INTERVAL;
  watcher.start({ interval: 10 });
  t.after(() => watcher.stop());
  for (let attempt = 0; attempt < 100 && !state.sent.length; attempt++)
    await pause(10);
  await watcher.stop();
  assert.equal(state.sent.length, 1);
  state.source.team.season = "2027/2028";
  state.source.matches[0].time = "12:00";
  await watcher.check({ force: true });
  assert.equal((await watcher.feed()).events.length, 0);
  assert.equal(state.sent.length, 1);
});

test("protects subscriptions with their encryption secrets, rejects arbitrary URLs, and drops expired endpoints", async (t) => {
  const dir = await directory(t);
  const push = new PushService({
    directory: dir,
    clock: () => now,
    send: async () => {
      throw { statusCode: 410 };
    },
  });
  const sub = subscription();
  for (const endpoint of [
    "http://fcm.googleapis.com/send/test",
    "https://127.0.0.1/private",
    "https://fcm.googleapis.com.evil.invalid/send",
    "https://fcm.googleapis.com:8443/send",
    "https://user:pass@fcm.googleapis.com/send",
  ])
    assert.throws(() => validateSubscription({ ...sub, endpoint }));
  assert.throws(() =>
    validateSubscription({
      ...sub,
      keys: {
        ...sub.keys,
        p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
          "base64url",
        ),
      },
    }),
  );
  await push.subscribe(sub);
  await push.subscribe(sub);
  assert.equal((await push.list()).length, 1);
  const wrong = {
    ...sub,
    keys: { ...sub.keys, auth: randomBytes(16).toString("base64url") },
  };
  await assert.rejects(push.subscribe(wrong), (error) => error.status === 403);
  await assert.rejects(
    push.unsubscribe(wrong),
    (error) => error.status === 404,
  );
  assert.equal(
    await push.deliver((await push.list())[0], { title: "Test" }),
    "gone",
  );
  assert.equal((await push.list()).length, 0);
});

test("encrypts Web Push requests, signs them with VAPID and refuses redirects", async (t) => {
  const push = new PushService({ directory: await directory(t) });
  let called = false;
  await sendWebPush(
    subscription(),
    { title: "Test", body: "PRIVATE-NOTIFICATION-CONTENT" },
    await push.keys(),
    "https://example.org",
    async (url, options) => {
      called = true;
      assert.equal(new URL(url).hostname, "fcm.googleapis.com");
      const headers = Object.fromEntries(
        Object.entries(options.headers).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      assert.match(headers.authorization, /^vapid /);
      assert.equal(headers["content-encoding"], "aes128gcm");
      assert.equal(options.redirect, "error");
      assert.ok(Buffer.isBuffer(options.body));
      assert.equal(
        options.body.includes(Buffer.from("PRIVATE-NOTIFICATION-CONTENT")),
        false,
      );
      return new Response(null, { status: 201 });
    },
  );
  assert.equal(called, true);
});

test("the worker displays a push without an open page and keeps notification links on this site", async () => {
  const handlers = {};
  const shown = [];
  const opened = [];
  const self = {
    location: { origin: "https://example.org" },
    addEventListener: (name, callback) => {
      handlers[name] = callback;
    },
    registration: {
      showNotification: async (title, options) =>
        shown.push({ title, options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, URL },
  );
  let pending;
  handlers.push({
    data: {
      json: () => ({
        title: "Cambio en el calendario",
        body: "Hora: 10:00 → 12:00",
        tag: "test-1",
        url: "/?view=calendar",
      }),
    },
    waitUntil: (task) => {
      pending = task;
    },
  });
  await pending;
  assert.equal(shown[0].title, "Cambio en el calendario");
  assert.equal(shown[0].options.tag, "test-1");
  handlers.notificationclick({
    notification: { close() {}, data: { url: "https://foreign.invalid/" } },
    waitUntil: (task) => {
      pending = task;
    },
  });
  await pending;
  assert.equal(opened[0], "https://example.org/?view=calendar");
});

test("notifications APIs expose only public history and require admin access or a subscription proof for mutations", async (t) => {
  const dir = await directory(t);
  const sent = [];
  const push = new PushService({
    directory: dir,
    send: async (_sub, payload) => sent.push(payload),
  });
  const source = await fakeProvider().snapshot("1001");
  let forced = 0;
  const { url } = await startTestApp(t, {
    directory: dir,
    pushService: push,
    provider: {
      snapshot: async (_id, options) => {
        if (options?.force) forced++;
        return structuredClone(source);
      },
    },
  });
  assert.equal((await request(url, "/api/admin/notifications")).status, 401);
  assert.equal(
    (
      await request(url, "/api/admin/notifications/check", {
        method: "POST",
        body: {},
      })
    ).status,
    401,
  );
  const cookie = await signIn(url);
  await request(url, "/api/admin/config", {
    method: "PUT",
    cookie,
    body: { teamId: "1001" },
  });
  const config = await (await request(url, "/api/push/config")).json();
  assert.deepEqual(Object.keys(config), ["publicKey"]);
  const sub = subscription();
  const subscribe = (extra = {}) =>
    request(url, "/api/push/subscriptions", {
      method: "POST",
      body: sub,
      headers: { "X-Futboleros-Push": "1" },
      ...extra,
    });
  assert.equal(
    (
      await subscribe({
        headers: {
          "X-Futboleros-Push": "1",
          Origin: "https://foreign.invalid",
        },
      })
    ).status,
    403,
  );
  assert.equal((await subscribe({ headers: {} })).status, 403);
  assert.equal((await subscribe()).status, 200);
  const match = source.matches.find((match) => match.status === "scheduled");
  match.time = match.time === "11:45" ? "12:00" : "11:45";
  assert.equal(
    (
      await request(url, "/api/admin/notifications/check", {
        method: "POST",
        cookie,
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(forced, 1);
  assert.equal(sent.length, 1);
  const publicFeed = await (await request(url, "/api/notifications")).json();
  assert.equal(publicFeed.events.length, 1);
  assert.doesNotMatch(
    JSON.stringify(publicFeed),
    /privateKey|endpoint|p256dh|outbox|baseline|subscriptions/,
  );
  assert.equal(
    (await request(url, "/sw.js")).headers.get("cache-control"),
    "no-cache",
  );
  assert.equal(
    (
      await request(url, "/api/push/subscriptions", {
        method: "DELETE",
        body: sub,
        headers: { "X-Futboleros-Push": "1" },
      })
    ).status,
    204,
  );
  assert.equal((await push.list()).length, 0);
  assert.ok(
    (await readFile(path.join(dir, "push-keys.json"), "utf8")).includes(
      "privateKey",
    ),
  );
});
