import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyMatchResults } from "../server/match-updates.mjs";
import { fakeProvider, request, signIn, startTestApp } from "./helpers.mjs";

const fixture = (extra = {}) => ({
  id: "3001",
  round: 2,
  homeId: "1001",
  awayId: "1002",
  home: "Equipo local",
  away: "Equipo visitante",
  date: "2026-10-24",
  time: "16:00",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  ...extra,
});
const snapshot = (
  match = fixture(),
  updatedAt = "2026-10-24T17:00:00.000Z",
) => ({
  team: { id: "1001", season: "2026/27" },
  matches: [match],
  updatedAt,
});
const observation = () => ({
  match: fixture(),
  score: [2, 1],
  scoreObservedAt: "2026-10-24T17:30:00.000Z",
  scoreIdentity: Object.fromEntries(
    ["id", "homeId", "awayId", "date", "time"].map((key) => [
      key,
      fixture()[key],
    ]),
  ),
});

test("confirmed hourly scores fill a missing calendar score without replacing newer corrections or rescheduled fixtures", () => {
  const entry = observation();
  const base = snapshot();
  const updated = applyMatchResults(base, { matches: [entry] });
  assert.equal(updated.matches[0].status, "played");
  assert.equal(updated.matches[0].homeScore, 2);
  assert.equal(updated.matches[0].awayScore, 1);
  assert.equal(
    base.matches[0].homeScore,
    null,
    "the raw snapshot remains untouched",
  );
  const missingAgain = snapshot(fixture(), "2026-10-24T18:00:00.000Z");
  assert.equal(
    applyMatchResults(missingAgain, { matches: [entry] }).matches[0].homeScore,
    2,
  );
  const oldScore = snapshot(
    fixture({ status: "played", homeScore: 0, awayScore: 0 }),
  );
  assert.equal(
    applyMatchResults(oldScore, { matches: [entry] }).matches[0].homeScore,
    2,
  );
  const sameTime = snapshot(
    fixture({ status: "played", homeScore: 0, awayScore: 0 }),
    entry.scoreObservedAt,
  );
  assert.equal(
    applyMatchResults(sameTime, { matches: [entry] }).matches[0].homeScore,
    2,
  );
  const corrected = snapshot(
    fixture({ status: "played", homeScore: 3, awayScore: 1 }),
    "2026-10-24T18:00:00.000Z",
  );
  assert.equal(applyMatchResults(corrected, { matches: [entry] }), corrected);
  for (const changed of [
    { id: "9999" },
    { homeId: "9999" },
    { awayId: "9999" },
    { date: "2026-10-25" },
    { time: "18:00" },
    { status: "postponed" },
  ]) {
    const changedSnapshot = snapshot(fixture(changed));
    assert.equal(
      applyMatchResults(changedSnapshot, { matches: [entry] }),
      changedSnapshot,
    );
  }
});

test("legacy result events are usable evidence but a recent blank poll or baseline score alone is not", () => {
  const entry = observation();
  delete entry.scoreObservedAt;
  delete entry.scoreIdentity;
  entry.lastPolledAt = "2026-10-24T19:00:00.000Z";
  const base = snapshot();
  assert.equal(applyMatchResults(base, { matches: [entry] }), base);
  const event = {
    type: "result",
    createdAt: "2026-10-24T17:30:00.000Z",
    match: fixture({ status: "played", homeScore: 2, awayScore: 1 }),
  };
  assert.equal(
    applyMatchResults(base, { matches: [entry] }, [event]).matches[0].homeScore,
    2,
  );
  assert.equal(
    applyMatchResults(base, { matches: [entry] }, [
      { ...event, match: fixture({ homeScore: 9, awayScore: 9 }) },
    ]),
    base,
  );
});

test("the public API immediately uses persisted hourly results across restart without reloading the full snapshot", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-result-snapshot-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = Date.parse("2026-10-24T17:57:00Z");
  let snapshotCalls = 0;
  let update = { homeScore: 2, awayScore: 1, reportPublished: false };
  const source = await fakeProvider().snapshot("1001");
  source.matches = [fixture()];
  const provider = {
    snapshot: async (id) => {
      snapshotCalls++;
      return { ...structuredClone(source), team: { ...source.team, id } };
    },
    matchUpdate: async () => update,
  };
  const options = { directory, provider, clock: () => now };
  const first = await startTestApp(t, options);
  const cookie = await signIn(first.url);
  assert.equal(
    (
      await request(first.url, "/api/admin/config", {
        method: "PUT",
        cookie,
        body: { teamId: "1001" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await request(first.url, "/api/team")).json()).matches[0].homeScore,
    null,
  );
  assert.equal(snapshotCalls, 1);
  now += 60_000;
  assert.equal(
    (
      await request(first.url, "/api/admin/notifications/results/check", {
        method: "POST",
        cookie,
        body: {},
      })
    ).status,
    200,
  );
  for (const route of ["/api/team", "/api/teams/1001"]) {
    const publicSnapshot = await (await request(first.url, route)).json();
    assert.equal(publicSnapshot.matches[0].homeScore, 2);
    assert.equal(publicSnapshot.matches[0].awayScore, 1);
    assert.equal(publicSnapshot.matches[0].status, "played");
    assert.doesNotMatch(
      JSON.stringify(publicSnapshot),
      /scoreIdentity|scoreObservedAt|lastPolledAt|outbox|targets/,
    );
  }
  assert.equal(snapshotCalls, 1);
  const second = await startTestApp(t, options);
  assert.equal(
    (await (await request(second.url, "/api/team")).json()).matches[0]
      .homeScore,
    2,
  );
  assert.equal(
    snapshotCalls,
    1,
    "the restored snapshot and results use only retained files",
  );
  const other = await (
    await request(first.url, "/api/teams/1002", { cookie })
  ).json();
  assert.equal(
    other.matches[0].homeScore,
    null,
    "admin previews of other teams do not inherit the configured team's observations",
  );

  const statePath = path.join(directory, "calendar-watch.json");
  const observed = JSON.parse(await readFile(statePath, "utf8")).results
    .matches[0];
  const observedAt = observed.scoreObservedAt;
  now += 60_000;
  update = { homeScore: null, awayScore: null, reportPublished: false };
  await request(first.url, "/api/admin/notifications/results/check", {
    method: "POST",
    cookie,
    body: {},
  });
  const afterBlank = JSON.parse(await readFile(statePath, "utf8")).results
    .matches[0];
  assert.equal(afterBlank.scoreObservedAt, observedAt);
  assert.equal(afterBlank.lastPolledAt, new Date(now).toISOString());

  now += 16 * 60_000;
  source.matches = [fixture({ status: "played", homeScore: 4, awayScore: 2 })];
  assert.equal(
    (await (await request(first.url, "/api/team")).json()).matches[0].homeScore,
    4,
  );
  now += 60_000;
  await request(first.url, "/api/admin/notifications/results/check", {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(
    (await (await request(first.url, "/api/team")).json()).matches[0].homeScore,
    4,
    "a newer blank poll cannot promote the old score over a later calendar correction",
  );
  now += 16 * 60_000;
  source.team.season = "2027/28";
  source.matches = [fixture()];
  assert.equal(
    (await (await request(first.url, "/api/team")).json()).matches[0].homeScore,
    null,
    "a later season cannot inherit the previous season's result",
  );
});

test("an unreadable notification file does not take the public team offline", async (t) => {
  const { url, directory } = await startTestApp(t);
  const cookie = await signIn(url);
  await request(url, "/api/admin/config", {
    method: "PUT",
    cookie,
    body: { teamId: "1001" },
  });
  await writeFile(path.join(directory, "calendar-watch.json"), "invalid-json");
  const response = await request(url, "/api/team");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).team.id, "1001");
});
