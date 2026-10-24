import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WeatherService } from "../server/weather.mjs";
import { WeatherLocations } from "../server/weather-locations.mjs";
import { weatherJson } from "../server/weather-http.mjs";

const match = {
  id: "3001",
  venueId: "4001",
  venue: "Campo Las Villas (HA)",
  date: "2026-10-24",
  time: "10:30",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
};
const now = Date.parse("2026-10-19T08:00:00Z");
const location = { latitude: 40.4, longitude: -3.7, name: "Campo Las Villas" };
function forecast() {
  return {
    timezone: "Europe/Madrid",
    hourly_units: { temperature_2m: "°C", precipitation_probability: "%" },
    hourly: {
      time: ["2026-10-24T10:00", "2026-10-24T11:00"],
      temperature_2m: [18, 19],
      precipitation_probability: [0, 35],
    },
    daily_units: {
      temperature_2m_min: "°C",
      temperature_2m_max: "°C",
      precipitation_probability_max: "%",
    },
    daily: {
      time: [match.date],
      temperature_2m_min: [12],
      temperature_2m_max: [22],
      precipitation_probability_max: [40],
    },
  };
}
const service = (getJson = async () => forecast(), extra = {}) =>
  new WeatherService({
    locate: async () => location,
    clock: () => now,
    getJson,
    ...extra,
  });

test("selects the closest Madrid forecast hour and requests only coordinates and weather variables", async () => {
  let url;
  const value = await service(async (query) => {
    url = query;
    return forecast();
  }).forMatch(match);
  assert.equal(value.available, true);
  assert.equal(value.forecastFor, "2026-10-24T11:00");
  assert.equal(value.temperature, 19);
  assert.equal(value.rainProbability, 35);
  assert.equal(url.origin, "https://api.open-meteo.com");
  assert.equal(url.searchParams.get("timezone"), "Europe/Madrid");
  assert.equal(url.searchParams.get("latitude"), "40.4000");
  assert.ok(!url.toString().includes("Villas"));
});
test("preserves zero values, leaves missing rain unknown and never displays mismatched units", async () => {
  const raw = forecast();
  raw.hourly.temperature_2m[1] = 0;
  raw.hourly.precipitation_probability[1] = 0;
  const zero = await service(async () => raw).forMatch(match);
  assert.equal(zero.temperature, 0);
  assert.equal(zero.rainProbability, 0);
  raw.hourly.precipitation_probability[1] = null;
  assert.equal(
    (await service(async () => raw).forMatch(match)).rainProbability,
    null,
  );
  raw.hourly_units.temperature_2m = "°F";
  assert.equal(
    (await service(async () => raw).forMatch(match)).available,
    false,
  );
});
test("uses a daily range and daily rain probability if the kickoff time is unknown", async () => {
  const value = await service().forMatch({ ...match, time: null });
  assert.equal(value.available, true);
  assert.equal(value.mode, "daily");
  assert.equal(value.temperature, null);
  assert.equal(value.temperatureMin, 12);
  assert.equal(value.temperatureMax, 22);
  assert.equal(value.rainProbability, 40);
});

test("stops forecasting an elapsed kickoff even when its score is missing and a forecast was cached", async () => {
  let clock = Date.parse("2026-10-24T08:29:00Z");
  let calls = 0;
  const weather = service(
    async () => {
      calls++;
      return forecast();
    },
    { clock: () => clock },
  );
  assert.equal((await weather.forMatch(match)).available, true);
  clock = Date.parse("2026-10-24T08:30:00Z");
  const pending = await weather.forMatch(match);
  assert.equal(pending.available, false);
  assert.match(pending.reason, /resultado está pendiente/);
  assert.equal(calls, 1);
});
test("does not query providers for missing, past, postponed or distant dates and uses Madrid's day boundary", async () => {
  let calls = 0;
  const weather = service(undefined, {
    locate: async () => {
      calls++;
      return location;
    },
  });
  for (const changed of [
    { date: null },
    { date: "2026-02-31" },
    { date: "2026-10-18" },
    { date: "2026-11-04" },
    { status: "postponed" },
    { homeScore: 0, awayScore: 0 },
  ])
    assert.equal(
      (await weather.forMatch({ ...match, ...changed })).available,
      false,
    );
  assert.equal(calls, 0);
  const boundary = service(undefined, {
    clock: () => Date.parse("2026-10-19T22:30:00Z"),
  });
  assert.equal(
    (await boundary.forMatch({ ...match, date: "2026-10-19" })).available,
    false,
  );
  const dst = forecast();
  dst.hourly.time[1] = "2026-10-25T11:00";
  assert.equal(
    (await service(async () => dst).forMatch({ ...match, date: "2026-10-25" }))
      .forecastFor,
    "2026-10-25T11:00",
  );
});
test("coalesces visitors, caches forecasts, labels old forecasts during an outage, and retries before recovering", async () => {
  let time = now,
    calls = 0,
    fail = false;
  const weather = service(
    async () => {
      calls++;
      if (fail) throw Error("outage");
      return forecast();
    },
    { clock: () => time, ttl: 1000, retryDelay: 500 },
  );
  const values = await Promise.all([
    weather.forMatch(match),
    weather.forMatch(match),
  ]);
  assert.equal(calls, 1);
  assert.equal(values[0].available, true);
  time += 1001;
  fail = true;
  assert.equal((await weather.forMatch(match)).stale, true);
  await weather.forMatch(match);
  assert.equal(calls, 2);
  time += 501;
  fail = false;
  assert.equal((await weather.forMatch(match)).stale, false);
  assert.equal(calls, 3);
  weather.invalidate();
  await weather.forMatch(match);
  assert.equal(calls, 4);
  time += 7 * 60 * 60_000;
  fail = true;
  assert.equal((await weather.forMatch(match)).available, false);
});
test("does not invent a location or forecast and rejects arbitrary network destinations", async () => {
  let calls = 0;
  const weather = service(
    async () => {
      calls++;
      return forecast();
    },
    { locate: async () => null },
  );
  assert.equal((await weather.forMatch(match)).available, false);
  assert.equal(calls, 0);
  const empty = forecast();
  empty.hourly.time = [];
  assert.equal(
    (await service(async () => empty).forMatch(match)).available,
    false,
  );
  empty.hourly.time = "2026-10-24T11:00";
  assert.equal(
    (await service(async () => empty).forMatch(match)).available,
    false,
  );
  await assert.rejects(
    () => weatherJson(new URL("http://127.0.0.1/private")),
    /permitido/,
  );
});

test("requires confirmation for two identically named grounds and persists the choice by field ID", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-locations-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const locations = new WeatherLocations({
    directory,
    getJson: async () => {
      calls++;
      return [
        {
          name: "Campo Las Villas",
          display_name: "Campo Las Villas, Municipio A",
          type: "pitch",
          lat: "40.4",
          lon: "-3.7",
        },
        {
          name: "Campo Las Villas",
          display_name: "Campo Las Villas, Municipio B",
          type: "pitch",
          lat: "40.7",
          lon: "-3.9",
        },
      ];
    },
  });
  assert.ok((await locations.locate(match)).reason);
  assert.equal((await locations.candidates(match.venue)).length, 2);
  assert.equal(calls, 1);
  await locations.save(match, location);
  assert.equal((await locations.locate(match)).latitude, 40.4);
  assert.ok((await locations.locate({ ...match, venueId: "4002" })).reason);
  const restored = new WeatherLocations({ directory });
  assert.equal((await restored.saved(match)).longitude, -3.7);
  await Promise.all([
    locations.save(
      { ...match, venueId: "4003" },
      { latitude: 40.3, longitude: -3.6 },
    ),
    locations.save(
      { ...match, venueId: "4004" },
      { latitude: 40.5, longitude: -3.8 },
    ),
  ]);
  assert.equal(
    (await restored.saved({ ...match, venueId: "4003" })).longitude,
    -3.6,
  );
  assert.equal(
    (await restored.saved({ ...match, venueId: "4004" })).longitude,
    -3.8,
  );
  await assert.rejects(
    () => locations.save(match, { latitude: 0, longitude: 0 }),
    /coordenadas/,
  );
});
test("automatically uses a unique sports ground, coalesces geocoding and does not guess generic names", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-location-auto-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const locations = new WeatherLocations({
    directory,
    getJson: async () => {
      calls++;
      return [
        { name: "Campo Las Villas", type: "pitch", lat: "40.4", lon: "-3.7" },
      ];
    },
  });
  const values = await Promise.all([
    locations.locate(match),
    locations.locate(match),
  ]);
  assert.equal(values[0].latitude, 40.4);
  assert.equal(calls, 1);
  assert.ok(
    (await locations.locate({ ...match, venue: "Campo Municipal" })).reason,
  );
  assert.equal(calls, 1);
});
