import test from "node:test";
import assert from "node:assert/strict";
import { hasResult, phaseOf } from "../server/match-timing.mjs";

const fixture = (extra = {}) => ({
  date: "2026-10-24",
  time: "16:00",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  ...extra,
});

test("today's fixture stops being upcoming at its Madrid kickoff without inventing a result", () => {
  const match = fixture();
  assert.equal(phaseOf(match, Date.parse("2026-10-24T13:59:59Z")), "upcoming");
  assert.equal(phaseOf(match, Date.parse("2026-10-24T14:00:00Z")), "pending");
  assert.equal(phaseOf(match, Date.parse("2026-10-24T17:57:00Z")), "pending");
  assert.equal(hasResult(match), false);
  assert.equal(match.homeScore, null);
  assert.equal(match.awayScore, null);
});

test("kickoff comparisons use Madrid in summer, winter and both daylight saving transitions", () => {
  for (const [date, before, atKickoff] of [
    ["2026-07-01", "2026-07-01T07:59:59Z", "2026-07-01T08:00:00Z"],
    ["2026-01-01", "2026-01-01T08:59:59Z", "2026-01-01T09:00:00Z"],
    ["2026-03-29", "2026-03-29T07:59:59Z", "2026-03-29T08:00:00Z"],
    ["2026-10-25", "2026-10-25T08:59:59Z", "2026-10-25T09:00:00Z"],
  ]) {
    const match = fixture({ date, time: "10:00" });
    assert.equal(phaseOf(match, Date.parse(before)), "upcoming", date);
    assert.equal(phaseOf(match, Date.parse(atKickoff)), "pending", date);
  }
});

test("a match without kickoff time becomes pending after its Madrid date has ended", () => {
  const match = fixture({ time: null });
  assert.equal(phaseOf(match, Date.parse("2026-10-24T21:59:59Z")), "upcoming");
  assert.equal(phaseOf(match, Date.parse("2026-10-24T22:00:00Z")), "pending");
  const winter = fixture({ date: "2026-10-25", time: null });
  assert.equal(phaseOf(winter, Date.parse("2026-10-25T22:59:59Z")), "upcoming");
  assert.equal(phaseOf(winter, Date.parse("2026-10-25T23:00:00Z")), "pending");
});

test("published zero scores win over time/status while postponed and undated fixtures remain distinct", () => {
  const now = Date.parse("2026-10-24T17:57:00Z");
  assert.equal(phaseOf(fixture({ homeScore: 0, awayScore: 0 }), now), "played");
  assert.equal(
    phaseOf(fixture({ homeScore: 0, awayScore: 0, status: "postponed" }), now),
    "played",
  );
  assert.equal(phaseOf(fixture({ status: "postponed" }), now), "postponed");
  assert.equal(phaseOf(fixture({ date: null, time: null }), now), "upcoming");
  assert.equal(phaseOf(fixture({ date: "2026-02-31" }), now), "upcoming");
  assert.equal(phaseOf(fixture({ homeScore: 0 }), now), "pending");
  assert.equal(hasResult(fixture({ homeScore: -1, awayScore: 1 })), false);
  assert.equal(
    hasResult(fixture({ homeScore: 0, awayScore: undefined })),
    false,
  );
});
