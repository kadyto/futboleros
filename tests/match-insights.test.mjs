import assert from "node:assert/strict";
import test from "node:test";
import { findStanding, estimateMatch } from "../src/match-insights.ts";

const match = {
  id: "next",
  round: 7,
  home: "C.D. Árbol A",
  away: "C.D. Árbol B",
  homeId: "a",
  awayId: "b",
  homeScore: null,
  awayScore: null,
  date: "2026-11-07",
  time: "12:00",
  venue: null,
  status: "scheduled",
};
const row = (overrides = {}) => ({
  team: match.home,
  teamId: "a",
  position: 1,
  played: 6,
  won: 3,
  drawn: 2,
  lost: 1,
  goalsFor: 15,
  goalsAgainst: 15,
  points: 11,
  statisticsComplete: true,
  ...overrides,
});
const balanced = () => [row(), row({ team: match.away, teamId: "b" })];

test("matches standings by ID, safely falls back to names and never confuses A and B", () => {
  const rows = balanced();
  assert.equal(findStanding(rows, "Another spelling", "a"), rows[0]);
  assert.equal(findStanding(rows, " CD. ARBOL   A "), rows[0]);
  assert.equal(findStanding(rows, match.home, "different-id"), undefined);
  assert.equal(findStanding(rows, "C.D. Árbol C"), undefined);
  assert.equal(
    findStanding([...rows, row({ teamId: "other" })], match.home),
    undefined,
  );
  assert.equal(
    findStanding([row({ teamId: undefined })], match.home, "a")?.position,
    1,
  );
  assert.equal(
    findStanding([row({ team: "", teamId: undefined })], ""),
    undefined,
  );
});

test("returns balanced, finite percentages totaling 100 without inventing home advantage", () => {
  const value = estimateMatch(match, balanced());
  assert.equal(value.available, true);
  assert.equal(value.home + value.draw + value.away, 100);
  assert.ok(Math.abs(value.home - value.away) <= 1);
  assert.ok(value.draw > 0 && value.draw < 100);
  assert.equal(value.limited, false);
});

test("favors the stronger side and preserves team probabilities when the venue is reversed", () => {
  const rows = [
    row({
      won: 5,
      drawn: 1,
      lost: 0,
      points: 16,
      goalsFor: 30,
      goalsAgainst: 4,
    }),
    row({
      team: match.away,
      teamId: "b",
      position: 8,
      won: 0,
      drawn: 1,
      lost: 5,
      points: 1,
      goalsFor: 4,
      goalsAgainst: 30,
    }),
  ];
  const forward = estimateMatch(match, rows);
  const reverse = estimateMatch(
    { ...match, home: match.away, homeId: "b", away: match.home, awayId: "a" },
    rows,
  );
  assert.equal(forward.available, true);
  assert.equal(reverse.available, true);
  assert.ok(forward.home > forward.away);
  assert.ok(forward.home > estimateMatch(match, balanced()).home);
  assert.equal(forward.home, reverse.away);
  assert.equal(forward.away, reverse.home);
  assert.equal(forward.draw, reverse.draw);
  assert.equal(forward.home + forward.draw + forward.away, 100);
});

test("current positions and points per game influence the estimate, not just goal totals", () => {
  const base = estimateMatch(match, balanced());
  const rankChanged = balanced();
  rankChanged[1].position = 8;
  assert.ok(estimateMatch(match, rankChanged).home > base.home);
  const pointsChanged = balanced();
  pointsChanged[1].points = 1;
  assert.ok(estimateMatch(match, pointsChanged).home > base.home);
});

test("withholds estimates for absent, conflicting, incomplete or too few statistics", () => {
  for (const rows of [
    [],
    [row()],
    [row(), row({ team: match.away, teamId: "wrong" })],
    [row({ position: 0 }), balanced()[1]],
    [row({ played: 2, won: 1, drawn: 1, lost: 0 }), balanced()[1]],
    [row({ won: 1 }), balanced()[1]],
    [row({ goalsAgainst: -1 }), balanced()[1]],
    [row({ statisticsComplete: false }), balanced()[1]],
    [row({ statisticsComplete: undefined }), balanced()[1]],
    [row({ points: NaN }), balanced()[1]],
    balanced().map((r) => ({ ...r, goalsFor: 0, goalsAgainst: 0 })),
  ]) {
    const value = estimateMatch(match, rows);
    assert.equal(value.available, false);
    assert.ok(value.reason.length > 0);
    assert.equal("home" in value, false);
  }
  for (const changed of [
    { status: "postponed" },
    { status: "played", homeScore: 1, awayScore: 0 },
    { homeScore: 0, awayScore: 0 },
  ])
    assert.equal(
      estimateMatch({ ...match, ...changed }, balanced()).available,
      false,
    );
});

test("flags small samples and handles high scoring competitions without invalid percentages", () => {
  const few = balanced().map((r) => ({
    ...r,
    played: 3,
    won: 1,
    drawn: 1,
    lost: 1,
    points: 4,
  }));
  assert.equal(estimateMatch(match, few).limited, true);
  for (const goals of [1, 50, 600]) {
    const value = estimateMatch(
      match,
      balanced().map((r) => ({ ...r, goalsFor: goals, goalsAgainst: goals })),
    );
    assert.equal(value.available, true);
    assert.equal(value.home + value.draw + value.away, 100);
    assert.ok(
      [value.home, value.draw, value.away].every(
        (p) => Number.isInteger(p) && p >= 0 && p <= 100,
      ),
    );
  }
});
