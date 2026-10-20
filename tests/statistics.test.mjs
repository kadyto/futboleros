import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Statistics } from "../server/statistics.mjs";
import {
  deviceInfo,
  visitorAddress,
  VisitorLocation,
} from "../server/visitor-info.mjs";
import { request, signIn, startTestApp } from "./helpers.mjs";

const desktop =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const android =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const samsung =
  "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36";
const event = {
  view: "overview",
  entry: true,
  device: "Móvil",
  system: "Android",
  model: "No disponible",
  location: "Madrid, España",
};
async function temporary(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-statistics-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("classifies normal browser headers without inventing hidden phone models", () => {
  assert.deepEqual(deviceInfo(desktop), {
    device: "Ordenador",
    system: "Windows",
    model: "No disponible",
  });
  assert.deepEqual(deviceInfo(android), {
    device: "Móvil",
    system: "Android",
    model: "No disponible",
  });
  assert.match(deviceInfo(samsung).model, /Samsung SM-G991B/);
  const iphone = deviceInfo(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  );
  assert.equal(iphone.system, "iOS");
  assert.equal(iphone.model, "No disponible");
  assert.equal(deviceInfo("Googlebot/2.1"), null);
  assert.equal(deviceInfo("HeadlessChrome/120"), null);
  assert.equal(deviceInfo(""), null);
});

test("trusts the configured proxy chain and ignores forged forwarding headers from direct clients", () => {
  const req = (remoteAddress, headers) => ({
    socket: { remoteAddress },
    headers,
  });
  assert.equal(
    visitorAddress(req("::ffff:127.0.0.1", { "x-forwarded-for": "8.8.8.8" })),
    "127.0.0.1",
  );
  const throughCloudflare = req("172.18.0.4", {
    "x-forwarded-for": "8.8.8.8, 104.16.1.1",
    "cf-connecting-ip": "8.8.8.8",
  });
  assert.equal(visitorAddress(throughCloudflare, "cloudflare"), "8.8.8.8");
  assert.equal(
    visitorAddress(req("9.9.9.9", throughCloudflare.headers), "cloudflare"),
    "9.9.9.9",
  );
  assert.equal(
    visitorAddress(
      req("172.18.0.4", {
        "x-forwarded-for": "104.16.1.1, 9.9.9.9",
        "cf-connecting-ip": "8.8.8.8",
      }),
      "cloudflare",
    ),
    "9.9.9.9",
  );
  assert.equal(
    visitorAddress(
      req("172.18.0.4", {
        "x-forwarded-for": "8.8.8.8",
      }),
      "172.18.0.0/16",
    ),
    "8.8.8.8",
  );
});

test("uses only local GeoIP data, leaves private or unknown addresses unlocated, and returns no coordinates", async () => {
  let opens = 0;
  const location = new VisitorLocation({
    open: async () => {
      opens++;
      return {
        get: () => ({
          country_code: "ES",
          city: "Madrid",
          latitude: 40.4,
          longitude: -3.7,
        }),
      };
    },
  });
  assert.equal(await location.lookup("127.0.0.1"), "No disponible");
  assert.equal(await location.lookup("192.168.1.1"), "No disponible");
  assert.equal(await location.lookup("not-an-ip"), "No disponible");
  assert.equal(opens, 0);
  assert.equal(await location.lookup("8.8.8.8"), "Madrid, España");
  assert.equal(await location.lookup("::ffff:8.8.4.4"), "Madrid, España");
  assert.equal(opens, 1);
  assert.match(await new VisitorLocation().lookup("8.8.8.8"), /Estados Unidos/);
});

test("serializes concurrent counts, survives restart and stores only daily independent aggregates", async (t) => {
  const directory = await temporary(t);
  const clock = () => Date.parse("2026-10-20T22:30:00Z");
  const stats = new Statistics({ directory, clock });
  await Promise.all(Array.from({ length: 20 }, () => stats.record(event)));
  await stats.record({ ...event, entry: false, view: "calendar" });
  const restored = new Statistics({ directory, clock });
  const summary = await restored.summary(7);
  assert.deepEqual(summary.totals, { entries: 20, views: 21 });
  assert.equal(summary.daily.at(-1).date, "2026-10-21");
  assert.equal(summary.daily.at(-1).entries, 20);
  assert.deepEqual(summary.devices, [{ name: "Móvil", count: 20 }]);
  assert.deepEqual(summary.locations, [{ name: "Madrid, España", count: 20 }]);
  const raw = await readFile(path.join(directory, "statistics.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(raw)), ["version", "days"]);
  assert.doesNotMatch(
    raw,
    /ipAddress|userAgent|Mozilla|session|visitorId|40\.4|timestamp|referrer/,
  );
  assert.equal(
    (await stat(path.join(directory, "statistics.json"))).mode & 0o777,
    0o600,
  );
});

test("expires old counters when read after inactivity and keeps a corrupt file intact", async (t) => {
  const directory = await temporary(t);
  let now = Date.parse("2026-01-01T12:00:00Z");
  const stats = new Statistics({ directory, clock: () => now });
  await stats.record(event);
  now = Date.parse("2026-05-01T12:00:00Z");
  assert.deepEqual((await stats.summary(90)).totals, { entries: 0, views: 0 });
  assert.deepEqual(JSON.parse(await readFile(stats.file, "utf8")).days, {});
  await writeFile(stats.file, "broken");
  await assert.rejects(stats.record(event));
  assert.equal(await readFile(stats.file, "utf8"), "broken");
});

test("the statistics API is private, validates events, respects privacy signals and never stores source headers or IP", async (t) => {
  let addresses = [];
  const { url, directory } = await startTestApp(t, {
    analyticsTrustProxy: "cloudflare",
    visitorLocation: {
      lookup: async (ip) => {
        addresses.push(ip);
        return "Madrid, España";
      },
    },
  });
  const headers = {
    "X-Futboleros-Event": "1",
    "User-Agent": samsung,
    "X-Forwarded-For": "8.8.8.8, 104.16.1.1",
    "CF-Connecting-IP": "8.8.8.8",
  };
  const send = (extra = {}) =>
    request(url, "/api/statistics/view", {
      method: "POST",
      body: { view: "overview", entry: true },
      headers,
      ...extra,
    });
  assert.equal((await request(url, "/api/admin/statistics")).status, 401);
  assert.equal((await send()).status, 204);
  assert.deepEqual(addresses, ["8.8.8.8"]);
  assert.equal(
    (await send({ body: { view: "calendar", entry: false } })).status,
    204,
  );
  assert.equal((await send({ headers: { ...headers, DNT: "1" } })).status, 204);
  assert.equal(
    (await send({ headers: { ...headers, "Sec-GPC": "1" } })).status,
    204,
  );
  assert.equal(
    (await send({ headers: { ...headers, "User-Agent": "Googlebot/2.1" } }))
      .status,
    204,
  );
  assert.equal(
    (await send({ headers: { ...headers, Origin: "https://foreign.invalid" } }))
      .status,
    403,
  );
  assert.equal(
    (await send({ headers: { ...headers, "X-Futboleros-Event": "" } })).status,
    403,
  );
  assert.equal(
    (await send({ body: { view: "overview", entry: true, ip: "1.2.3.4" } }))
      .status,
    400,
  );
  assert.equal(
    (await send({ body: { view: "admin", entry: true } })).status,
    400,
  );
  const cookie = await signIn(url);
  assert.equal((await send({ cookie })).status, 204);
  const response = await request(url, "/api/admin/statistics?days=7", {
    cookie,
  });
  const summary = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(summary.totals, { entries: 1, views: 2 });
  assert.equal(summary.proxyConfigured, true);
  assert.equal(addresses.length, 1);
  assert.equal(
    (await request(url, "/api/admin/statistics?days=500", { cookie })).status,
    400,
  );
  const raw = await readFile(path.join(directory, "statistics.json"), "utf8");
  assert.doesNotMatch(
    raw,
    /8\.8\.8\.8|104\.16|Mozilla|Chrome|Win64|forwarded|connecting/i,
  );
  assert.equal((await request(url, "/privacidad")).status, 200);
});

test("a statistics write failure does not prevent public team requests", async (t) => {
  const { url } = await startTestApp(t, {
    statistics: {
      record: async () => {
        throw new Error("disk unavailable");
      },
    },
    visitorLocation: { lookup: async () => "No disponible" },
  });
  const response = await request(url, "/api/statistics/view", {
    method: "POST",
    headers: { "X-Futboleros-Event": "1", "User-Agent": desktop },
    body: { view: "overview", entry: true },
  });
  assert.equal(response.status, 503);
  assert.equal((await request(url, "/api/team")).status, 200);
});
