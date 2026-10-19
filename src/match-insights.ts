import type { Match, Standing } from "./types.ts";

function normalizedName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleUpperCase("es")
    .replace(/[.'’"‘]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function findStanding(
  rows: Standing[],
  name: string,
  id?: string,
): Standing | undefined {
  const exact = id ? rows.filter((row) => row.teamId === id) : [];
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  // Never override conflicting IDs or guess between teams with the same name.
  const normalized = normalizedName(name);
  if (!normalized) return undefined;
  const byName = rows.filter((row) => normalizedName(row.team) === normalized);
  return byName.length === 1 && (!id || !byName[0].teamId)
    ? byName[0]
    : undefined;
}

export function hasPosition(row?: Standing): row is Standing {
  return !!row && Number.isInteger(row.position) && row.position > 0;
}

type Forecast =
  | { available: false; reason: string }
  | {
      available: true;
      home: number;
      draw: number;
      away: number;
      homePlayed: number;
      awayPlayed: number;
      limited: boolean;
    };

function usableStats(row: Standing) {
  // Older cached tables need a refresh before their statistics can be verified.
  return (
    row.statisticsComplete === true &&
    [
      row.played,
      row.won,
      row.drawn,
      row.lost,
      row.goalsFor,
      row.goalsAgainst,
    ].every((value) => Number.isInteger(value) && value >= 0) &&
    Number.isFinite(row.points) &&
    row.won + row.drawn + row.lost === row.played
  );
}

function poisson(mean: number) {
  const values = [Math.exp(-mean)];
  // Include the tail even in high-scoring youth football competitions.
  const limit = Math.ceil(mean + 10 * Math.sqrt(mean) + 10);
  for (let goals = 1; goals <= limit; goals++)
    values.push((values[goals - 1] * mean) / goals);
  return values;
}

function percentages(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const exact = values.map((value) => (100 * value) / total);
  const rounded = exact.map(Math.floor);
  const remainderOrder = exact
    .map((value, index) => ({ index, remainder: value - rounded[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  const remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remaining; i++) rounded[remainderOrder[i].index]++;
  return rounded;
}

export function estimateMatch(match: Match, rows: Standing[]): Forecast {
  if (
    match.status !== "scheduled" ||
    match.homeScore !== null ||
    match.awayScore !== null
  )
    return {
      available: false,
      reason: "Solo se estiman partidos pendientes de jugar y sin aplazar.",
    };
  const home = findStanding(rows, match.home, match.homeId);
  const away = findStanding(rows, match.away, match.awayId);
  if (!hasPosition(home) || !hasPosition(away) || home === away)
    return {
      available: false,
      reason: "Falta la clasificación actual de alguno de los equipos.",
    };
  if (!usableStats(home) || !usableStats(away))
    return {
      available: false,
      reason: "Faltan estadísticas completas de alguno de los equipos.",
    };
  if (Math.min(home.played, away.played) < 3)
    return {
      available: false,
      reason: "Cada equipo debe haber jugado al menos 3 partidos.",
    };

  const league = rows.filter((row) => usableStats(row) && row.played > 0);
  const mean =
    league.reduce((sum, row) => sum + row.goalsFor, 0) /
    league.reduce((sum, row) => sum + row.played, 0);
  if (!Number.isFinite(mean) || mean <= 0)
    return {
      available: false,
      reason: "No hay suficientes datos de goles en la clasificación.",
    };

  // Shrink goal rates towards the league mean with a prior of three matches.
  const rate = (goals: number, played: number) =>
    (goals + 3 * mean) / (played + 3);
  const lastPosition = Math.max(
    ...rows.filter(hasPosition).map((row) => row.position),
  );
  const rankEdge =
    (away.position - home.position) / Math.max(1, lastPosition - 1);
  const pointsEdge = Math.max(
    -1,
    Math.min(1, (home.points / home.played - away.points / away.played) / 3),
  );
  const sample = Math.min(home.played, away.played);
  const adjustment = Math.exp(
    ((0.3 * rankEdge + 0.2 * pointsEdge) * sample) / (sample + 5),
  );
  const expectedHome =
    ((rate(home.goalsFor, home.played) * rate(away.goalsAgainst, away.played)) /
      mean) *
    adjustment;
  const expectedAway =
    (rate(away.goalsFor, away.played) * rate(home.goalsAgainst, home.played)) /
    mean /
    adjustment;
  // Bound extreme rates; this is an uncalibrated estimate, not a certainty.
  const homeGoals = poisson(Math.max(0.15, Math.min(15, expectedHome)));
  const awayGoals = poisson(Math.max(0.15, Math.min(15, expectedAway)));
  const outcomes = [0, 0, 0];
  homeGoals.forEach((homeChance, h) => {
    awayGoals.forEach((awayChance, a) => {
      outcomes[h > a ? 0 : h === a ? 1 : 2] += homeChance * awayChance;
    });
  });
  const [homeWin, draw, awayWin] = percentages(outcomes);
  return {
    available: true,
    home: homeWin,
    draw,
    away: awayWin,
    homePlayed: home.played,
    awayPlayed: away.played,
    limited: sample < 5,
  };
}
