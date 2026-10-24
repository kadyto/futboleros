import test from "node:test";
import assert from "node:assert/strict";
import {
  fakeProvider,
  fakeWeather,
  request,
  signIn,
  startTestApp,
} from "./helpers.mjs";

test("weather administration and exported calendar select future fixtures after today's kickoff", async (t) => {
  const provider = fakeProvider();
  const source = await provider.snapshot("1001");
  const fixture = source.matches.find((match) => match.homeId === "1001");
  source.matches = [
    {
      ...fixture,
      id: "3101",
      date: "2026-10-24",
      time: "16:00",
      homeScore: null,
      awayScore: null,
      status: "scheduled",
    },
    {
      ...fixture,
      id: "3102",
      round: 2,
      date: "2026-10-31",
      time: "16:00",
      homeScore: null,
      awayScore: null,
      status: "scheduled",
    },
  ];
  const { url } = await startTestApp(t, {
    clock: () => Date.parse("2026-10-24T17:57:00Z"),
    provider: { ...provider, snapshot: async () => structuredClone(source) },
    weather: fakeWeather(),
    weatherLocations: {
      saved: async () => null,
      candidates: async () => [],
      withMapLinks: async (matches) => matches,
    },
  });
  const cookie = await signIn(url);
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
  const next = await request(url, "/api/admin/weather-location", { cookie });
  assert.equal(next.status, 200);
  assert.equal((await next.json()).match.id, "3102");
  for (const path of ["/api/calendar.ics", "/api/teams/1001/calendar.ics"]) {
    const response = await request(url, path);
    assert.equal(response.status, 200);
    const content = await response.text();
    assert.doesNotMatch(content, /1001-3101@/);
    assert.match(content, /1001-3102@/);
  }
  const current = await (await request(url, "/api/team")).json();
  assert.equal(current.matches[0].homeScore, null);
});
