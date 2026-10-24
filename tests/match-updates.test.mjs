import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { CalendarWatch, CHECK_INTERVAL } from "../server/calendar-watch.mjs";
import { Federation, parseMatchUpdate } from "../server/provider.mjs";
import { nextResultCheck, resultHours } from "../server/match-updates.mjs";
import { SiteSettings } from "../server/settings.mjs";
import { page } from "./fixtures.mjs";
import { fakeProvider, request, signIn, startTestApp } from "./helpers.mjs";

const match = (extra = {}) => ({
  id: "3001",
  round: 1,
  homeId: "1001",
  awayId: "1002",
  home: "Equipo local",
  away: "Equipo visitante",
  date: "2026-10-23",
  time: "10:00",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  ...extra,
});
const game = (extra = {}) => ({
  codacta: "3001",
  codigo_equipo_local: "1001",
  codigo_equipo_visitante: "1002",
  estado: "1",
  sesion_ok: "1",
  partido_en_juego: "0",
  suspendido: "0",
  acta_cerrada: "0",
  goles_local: "",
  goles_visitante: "",
  ...extra,
});
const pending = () => ({
  homeScore: null,
  awayScore: null,
  reportPublished: false,
});
const result = (published = false) => ({
  homeScore: 0,
  awayScore: 0,
  reportPublished: published,
});

async function harness(t, matches = [match()]) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-results-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = {
    now: Date.parse("2026-10-24T06:00:00Z"),
    calls: [],
    sent: [],
    updates: new Map(),
    targets: ["first-device"],
    failPush: false,
    source: {
      team: {
        id: "1001",
        name: "Equipo local",
        category: "Prueba",
        season: "2026/27",
      },
      matches,
      warnings: [],
    },
  };
  const settings = new SiteSettings(directory);
  await settings.save(state.source.team);
  const options = {
    directory,
    settings,
    clock: () => state.now,
    load: async () => structuredClone(state.source),
    loadMatch: async (fixture, teamId) => {
      state.calls.push({ id: fixture.id, teamId });
      const update = state.updates.get(fixture.id) || pending();
      if (update instanceof Error) throw update;
      return update;
    },
    push: {
      list: async () => state.targets.map((id) => ({ id })),
      devices: async () => state.targets.map((id) => ({ id })),
      deliver: async (sub, payload) => {
        if (state.failPush) return "retry";
        state.sent.push({ id: sub.id, payload });
        return "sent";
      },
    },
  };
  const watcher = new CalendarWatch(options);
  await watcher.setup(state.source);
  return { directory, state, settings, options, watcher };
}

test("Madrid hourly slots include 08 and 23, exclude nights and handle both DST transitions", () => {
  for (const [time, active, next] of [
    ["2026-07-01T05:59:00Z", false, "2026-07-01T06:00:00.000Z"],
    ["2026-07-01T06:00:00Z", true, "2026-07-01T07:00:00.000Z"],
    ["2026-07-01T21:00:00Z", true, "2026-07-02T06:00:00.000Z"],
    ["2026-07-01T22:00:00Z", false, "2026-07-02T06:00:00.000Z"],
    ["2026-01-01T06:59:00Z", false, "2026-01-01T07:00:00.000Z"],
    ["2026-01-01T22:00:00Z", true, "2026-01-02T07:00:00.000Z"],
    ["2026-03-28T22:00:00Z", true, "2026-03-29T06:00:00.000Z"],
    ["2026-10-24T21:00:00Z", true, "2026-10-25T07:00:00.000Z"],
  ]) {
    assert.equal(resultHours(Date.parse(time)), active, time);
    assert.equal(nextResultCheck(Date.parse(time)), next, time);
  }
});

test("a 200 match page, assigned ID and provisional scores do not imply a published report", async () => {
  assert.deepEqual(parseMatchUpdate(game(), match(), "1001"), pending());
  const finished = game({ goles_local: "0", goles_visitante: "0" });
  assert.deepEqual(parseMatchUpdate(finished, match(), "1001"), result());
  assert.deepEqual(
    parseMatchUpdate({ ...finished, acta_cerrada: "1" }, match(), "1001"),
    result(true),
  );
  for (const extra of [
    { partido_en_juego: "1" },
    { suspendido: "1" },
    { goles_local: "" },
    { goles_visitante: "-1" },
    { goles_local: "1x" },
  ])
    assert.deepEqual(
      parseMatchUpdate(
        { ...finished, acta_cerrada: "1", ...extra },
        match(),
        "1001",
      ),
      pending(),
    );
  for (const extra of [
    { codacta: "4000" },
    { codigo_equipo_local: "9999" },
    { sesion_ok: "0" },
    { estado: "0" },
  ])
    assert.throws(() =>
      parseMatchUpdate({ ...finished, ...extra }, match(), "1001"),
    );
  let calls = 0;
  const provider = new Federation({
    directory: "/unused",
    getText: async (url) => {
      calls++;
      assert.equal(url, "/acta-partido/3001");
      return page({
        game: {
          ...finished,
          acta_cerrada: "1",
          jugadores_equipo_local: [
            { nombre: "discarded", telefono: "discarded" },
          ],
        },
      });
    },
  });
  assert.deepEqual(await provider.matchUpdate(match(), "1001"), result(true));
  assert.equal(calls, 1);
  await assert.rejects(provider.matchUpdate(match(), "9999"));
  await assert.rejects(
    provider.matchUpdate(match({ id: "../../../other" }), "1001"),
  );
  assert.equal(calls, 1);
});

test("polls once per hour without moving the daily review and persists result/report deduplication", async (t) => {
  const { state, watcher, options } = await harness(t);
  const daily = (await watcher.feed()).nextCheckAt;
  state.now -= 60_000;
  await watcher.checkResults();
  assert.equal(state.calls.length, 0);
  state.now += 60_000;
  await Promise.all([watcher.checkResults(), watcher.checkResults()]);
  assert.equal(state.calls.length, 1);
  state.updates.set("3001", result());
  await watcher.checkResults();
  assert.equal(state.calls.length, 1);
  state.now += 60 * 60_000;
  await watcher.checkResults();
  let feed = await watcher.feed();
  assert.deepEqual(
    feed.events.map((e) => e.type),
    ["result"],
  );
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0].payload.body, /0–0/);
  assert.equal(state.sent[0].payload.url, "/?view=calendar&filter=played");
  assert.equal(feed.nextCheckAt, daily);
  const restored = new CalendarWatch(options);
  state.now += 60 * 60_000;
  state.updates.set("3001", result(true));
  await restored.checkResults();
  feed = await restored.feed();
  assert.deepEqual(
    feed.events.map((e) => e.type),
    ["report", "result"],
  );
  const ids = feed.events.map((e) => e.id);
  assert.equal(new Set(ids).size, 2);
  assert.equal(state.sent.length, 2);
  const calls = state.calls.length;
  state.now += CHECK_INTERVAL;
  const again = new CalendarWatch(options);
  await again.check();
  await again.checkResults();
  assert.deepEqual(
    (await again.feed()).events.map((e) => e.id),
    ids,
  );
  assert.equal(
    state.calls.length,
    calls,
    "published reports are never fetched again",
  );
  assert.equal(state.sent.length, 2);
  assert.equal((await again.status()).pendingDeliveries, 0);
  assert.doesNotMatch(
    JSON.stringify(await again.feed()),
    /lastPolledAt|targets|endpoint|cursor/,
  );
});

test("initial observations remain silent for already published results and reports", async (t) => {
  const { state, watcher } = await harness(t, [
    match({ homeScore: 0, awayScore: 0, status: "played" }),
  ]);
  state.updates.set("3001", result(true));
  await watcher.checkResults();
  assert.deepEqual((await watcher.feed()).events, []);
  assert.equal(state.sent.length, 0);
});

test("manual checks immediately retry failed results without moving daily/hourly slots or duplicating notices", async (t) => {
  const { state, watcher, options } = await harness(t);
  state.updates.set("3001", new Error("source unavailable"));
  await watcher.checkResults();
  const before = await watcher.feed();
  assert.ok(before.results.lastError);
  state.now += 5 * 60_000;
  state.updates.set("3001", result());
  await watcher.checkResults();
  assert.equal(state.calls.length, 1);
  await watcher.checkResults({ force: true });
  const after = await watcher.feed();
  assert.equal(state.calls.length, 2);
  assert.equal(after.results.lastError, null);
  assert.equal(after.results.lastCheckedAt, new Date(state.now).toISOString());
  assert.equal(after.nextCheckAt, before.nextCheckAt);
  assert.equal(after.results.nextCheckAt, before.results.nextCheckAt);
  assert.deepEqual(
    after.events.map((event) => event.type),
    ["result"],
  );
  const restored = new CalendarWatch(options);
  await restored.checkResults({ force: true });
  assert.equal((await restored.feed()).events.length, 1);
  assert.equal(state.sent.length, 1);
});

test("manual checks also work overnight while automated checks continue to wait for 08:00 Madrid", async (t) => {
  const { state, watcher } = await harness(t);
  const daily = (await watcher.feed()).nextCheckAt;
  state.now = Date.parse("2026-10-24T22:30:00Z");
  state.updates.set("3001", result());
  await watcher.checkResults();
  assert.equal(state.calls.length, 0);
  await watcher.checkResults({ force: true });
  const feed = await watcher.feed();
  assert.equal(state.calls.length, 1);
  assert.equal(feed.results.nextCheckAt, "2026-10-25T07:00:00.000Z");
  assert.equal(feed.nextCheckAt, daily);
  await watcher.checkResults();
  assert.equal(state.calls.length, 1);
});

test(
  "a manual request following an in-flight automatic check performs one fresh coalesced check",
  { timeout: 5000 },
  async (t) => {
    const { state, watcher } = await harness(t);
    let started;
    let release;
    const firstStarted = new Promise((resolve) => {
      started = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let calls = 0;
    watcher.loadMatch = async () => {
      calls++;
      if (calls === 1) {
        started();
        await gate;
        return pending();
      }
      return result();
    };
    const automatic = watcher.checkResults();
    await firstStarted;
    const manual = watcher.checkResults({ force: true });
    const secondManual = watcher.checkResults({ force: true });
    release();
    await Promise.all([automatic, manual, secondManual]);
    assert.equal(calls, 2);
    assert.deepEqual(
      (await watcher.feed()).events.map((event) => event.type),
      ["result"],
    );
    assert.equal(state.sent.length, 1);
  },
);

test("the manual results API requires an authenticated same-origin admin and exposes failure/recovery separately", async (t) => {
  const now = Date.parse("2026-10-24T06:00:00Z");
  let calls = 0;
  let unavailable = true;
  const provider = fakeProvider();
  const source = await provider.snapshot("1001");
  source.matches = [match()];
  const { url, directory } = await startTestApp(t, {
    clock: () => now,
    provider: {
      ...provider,
      snapshot: async () => structuredClone(source),
      matchUpdate: async () => {
        calls++;
        if (unavailable) throw new Error("source unavailable");
        return result();
      },
    },
  });
  const route = "/api/admin/notifications/results/check";
  assert.equal(
    (await request(url, route, { method: "POST", body: {} })).status,
    401,
  );
  const cookie = await signIn(url);
  const unconfigured = await request(url, route, {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(unconfigured.status, 409);
  assert.match((await unconfigured.json()).error, /equipo configurado/);
  assert.equal(
    (
      await request(url, "/api/admin/config", {
        method: "PUT",
        cookie,
        body: { teamId: "1001" },
      })
    ).status,
    200,
  );
  for (const headers of [
    { "X-Futboleros-Admin": "" },
    { Origin: "https://other.invalid" },
    { "Sec-Fetch-Site": "cross-site" },
  ])
    assert.equal(
      (await request(url, route, { method: "POST", cookie, headers, body: {} }))
        .status,
      403,
    );
  assert.equal(calls, 0);
  const first = await request(url, route, { method: "POST", cookie, body: {} });
  assert.equal(first.status, 200);
  const before = await first.json();
  assert.ok(before.results.lastError);
  assert.equal(calls, 1);
  unavailable = false;
  const response = await request(url, route, {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(calls, 2);
  assert.equal(status.results.lastError, null);
  assert.equal(status.nextCheckAt, before.nextCheckAt);
  assert.equal(status.results.nextCheckAt, before.results.nextCheckAt);
  assert.deepEqual(
    status.events.map((event) => event.type),
    ["result"],
  );
  unavailable = true;
  const failed = await request(url, route, {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(failed.status, 200);
  assert.ok((await failed.json()).results.lastError);
  assert.equal(calls, 3);
  await rm(path.join(directory, "calendar-watch.json"));
  const noReference = await request(url, route, {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(noReference.status, 409);
  assert.match(
    (await noReference.json()).error,
    /Comprueba primero el calendario/,
  );
  assert.equal(
    calls,
    3,
    "a missing reference must report an error without querying the source",
  );
});

test("keeps the same observation when the report ID or fixture round changes", async (t) => {
  const { state, watcher, options } = await harness(t);
  state.updates.set("3001", result());
  await watcher.checkResults();
  const original = (await watcher.feed()).events[0].id;
  state.source.matches[0].id = "4001";
  await watcher.check({ force: true });
  state.source.matches[0].round = 2;
  await watcher.check({ force: true });
  state.now += 60 * 60_000;
  state.updates.set("4001", result(true));
  const restored = new CalendarWatch(options);
  await restored.checkResults();
  const events = (await restored.feed()).events.filter((e) =>
    ["result", "report"].includes(e.type),
  );
  assert.deepEqual(
    events.map((e) => e.type),
    ["report", "result"],
  );
  assert.equal(events[1].id, original);
  assert.equal(
    state.sent.filter((s) => s.payload.tag.startsWith("match-")).length,
    2,
  );
});

test("a pending report announces publication independently of an already known score", async (t) => {
  const { state, watcher } = await harness(t, [
    match({ homeScore: 0, awayScore: 0, status: "played" }),
  ]);
  state.updates.set("3001", result());
  await watcher.checkResults();
  state.now += 60 * 60_000;
  state.updates.set("3001", result(true));
  await watcher.checkResults();
  assert.deepEqual(
    (await watcher.feed()).events.map((e) => e.type),
    ["report"],
  );
});

test("queries only recent fixtures of the selected team, with bounded rotating batches", async (t) => {
  const matches = Array.from({ length: 10 }, (_, i) =>
    match({ id: String(3001 + i), round: i + 1 }),
  );
  matches.push(
    match({ id: "4001", round: 20, date: "2026-10-25" }),
    match({ id: "4002", round: 21, date: "2026-10-24", time: "23:00" }),
    match({ id: "4003", round: 22, date: "2026-10-01" }),
    match({ id: "4004", round: 23, homeId: "9998", awayId: "9999" }),
    match({ id: "4005", round: 24, status: "postponed" }),
    match({ id: "synthetic-id", round: 25 }),
    match({ id: "4006", round: 26, date: null }),
  );
  const { state, watcher } = await harness(t, matches);
  await watcher.checkResults();
  assert.equal(state.calls.length, 8);
  state.now += 60 * 60_000;
  await watcher.checkResults();
  assert.equal(new Set(state.calls.map((c) => c.id)).size, 10);
  assert.ok(
    state.calls.every((c) => Number(c.id) < 4000 && c.teamId === "1001"),
  );
});

test("keeps pending reports for up to 30 days but stops chasing missing results after seven", async (t) => {
  const { state, watcher } = await harness(t, [
    match({ homeScore: 0, awayScore: 0, status: "played" }),
    match({ id: "3002", round: 2 }),
  ]);
  state.updates.set("3001", result());
  await watcher.checkResults();
  state.calls = [];
  state.now = Date.parse("2026-11-01T09:00:00Z");
  await watcher.checkResults();
  assert.deepEqual(
    state.calls.map((c) => c.id),
    ["3001"],
  );
  state.calls = [];
  state.now = Date.parse("2026-11-23T09:00:00Z");
  await watcher.checkResults();
  assert.equal(state.calls.length, 0);
});

test("retains observations through source outages and retries queued delivery after a restart", async (t) => {
  const { state, watcher, options } = await harness(t, [
    match(),
    match({ id: "3002", round: 2 }),
  ]);
  await watcher.checkResults();
  state.now += 60 * 60_000;
  state.updates.set("3001", new Error("source unavailable"));
  state.updates.set("3002", result());
  state.failPush = true;
  await watcher.checkResults();
  assert.ok((await watcher.feed()).results.lastError);
  assert.equal((await watcher.status()).pendingDeliveries, 1);
  state.targets.push("later-device");
  state.failPush = false;
  state.now += 5 * 60_000;
  const restored = new CalendarWatch(options);
  await restored.check();
  assert.deepEqual(
    state.sent.map((s) => s.id),
    ["first-device"],
  );
  assert.equal((await restored.feed()).events.length, 1);
  state.now += 55 * 60_000;
  state.updates.set("3001", result(true));
  await restored.checkResults();
  assert.equal((await restored.feed()).results.lastError, null);
  assert.equal((await restored.feed()).events.length, 3);
  const tags = state.sent
    .filter((s) => s.id === "first-device")
    .map((s) => s.payload.tag);
  assert.equal(new Set(tags).size, tags.length);
});

test("does not send or advance deduplication when the atomic state write fails", async (t) => {
  const { state, watcher } = await harness(t);
  state.updates.set("3001", result(true));
  const original = watcher.store.write.bind(watcher.store);
  watcher.store.write = async () => {
    throw new Error("disk unavailable");
  };
  await assert.rejects(watcher.checkResults(), /disk unavailable/);
  assert.equal(state.sent.length, 0);
  watcher.store.write = original;
  await watcher.checkResults();
  assert.equal(state.sent.length, 2);
  assert.equal((await watcher.feed()).events.length, 2);
});

test("discards an in-flight result if the configured team changes", async (t) => {
  const { state, settings, watcher } = await harness(t);
  watcher.loadMatch = async () => {
    await settings.save({
      id: "9999",
      name: "Otro equipo",
      category: "Prueba",
    });
    return result(true);
  };
  await watcher.checkResults();
  assert.equal(state.sent.length, 0);
  assert.equal((await watcher.feed()).events.length, 0);
});

test("migrates existing volumes and runs hourly checks autonomously alongside the daily timer", async (t) => {
  const { directory, state, watcher } = await harness(t);
  const file = path.join(directory, "calendar-watch.json");
  const legacy = JSON.parse(await readFile(file, "utf8"));
  delete legacy.results;
  await writeFile(file, JSON.stringify(legacy));
  state.updates.set("3001", result());
  watcher.start({ interval: 10 });
  t.after(() => watcher.stop());
  for (let i = 0; i < 100 && !state.sent.length; i++) await pause(10);
  await watcher.stop();
  assert.equal(state.sent.length, 1);
  const feed = await watcher.feed();
  assert.equal(Date.parse(feed.nextCheckAt) - state.now, CHECK_INTERVAL);
  assert.equal(Date.parse(feed.results.nextCheckAt) - state.now, 60 * 60_000);
  assert.deepEqual(
    feed.events.map((e) => e.type),
    ["result"],
  );
});
