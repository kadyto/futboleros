import { createHash } from "node:crypto";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const madrid = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const local = (now) =>
  Object.fromEntries(
    madrid.formatToParts(new Date(now)).map(({ type, value }) => [type, value]),
  );
const dateOf = (parts) => `${parts.year}-${parts.month}-${parts.day}`;
const keyOf = (match) => `${match.round}:${match.homeId}:${match.awayId}`;
const scoreOf = (match) =>
  [match.homeScore, match.awayScore].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 999,
  )
    ? [match.homeScore, match.awayScore]
    : null;
const identityOf = (match) =>
  Object.fromEntries(
    ["id", "homeId", "awayId", "date", "time"].map((field) => [
      field,
      match[field],
    ]),
  );
const sameIdentity = (left, right) =>
  ["id", "homeId", "awayId", "date", "time"].every(
    (field) => left?.[field] === right?.[field],
  );

export const resultHours = (now) => {
  const hour = Number(local(now).hour);
  return hour >= 8 && hour <= 23;
};

export function nextResultCheck(now) {
  // Madrid's UTC offset is a whole number of hours, also across DST changes.
  let next = Math.floor(now / HOUR) * HOUR + HOUR;
  while (!resultHours(next)) next += HOUR;
  return new Date(next).toISOString();
}

export const initialResults = () => ({
  matches: null,
  cursor: 0,
  lastCheckedAt: null,
  nextCheckAt: null,
  lastError: null,
});

export function trackMatches(results, snapshot, now) {
  const today = Date.parse(dateOf(local(now)));
  const known = new Map(
    (results.matches || []).map((item) => [item.key, item]),
  );
  const byId = new Map(
    (results.matches || []).map((item) => [item.match.id, item]),
  );
  for (const match of snapshot.matches) {
    if (![match.homeId, match.awayId].includes(snapshot.team.id)) continue;
    const old = byId.get(match.id) || known.get(keyOf(match));
    const key = old?.key || keyOf(match);
    // Do not start monitoring the historical season when installing/upgrading.
    if (!old && (!match.date || Date.parse(match.date) < today - 7 * DAY))
      continue;
    const safe = Object.fromEntries(
      [
        "id",
        "round",
        "homeId",
        "awayId",
        "home",
        "away",
        "date",
        "time",
        "status",
      ].map((field) => [field, match[field]]),
    );
    known.set(
      key,
      old
        ? { ...old, match: safe }
        : {
            key,
            match: safe,
            score: scoreOf(match),
            report: null,
            lastPolledAt: null,
          },
    );
  }
  results.matches = [...known.values()];
  results.nextCheckAt ||= resultHours(now)
    ? new Date(now).toISOString()
    : nextResultCheck(now);
  return results;
}

export function pendingMatches(results, teamId, now) {
  const parts = local(now);
  const today = dateOf(parts);
  const candidates = (results.matches || [])
    .filter(({ match, score, report, lastPolledAt }) => {
      const age = (Date.parse(today) - Date.parse(match.date)) / DAY;
      return (
        [match.homeId, match.awayId].includes(teamId) &&
        /^[1-9]\d{0,11}$/.test(String(match.id)) &&
        match.status !== "postponed" &&
        age >= 0 &&
        (age <= 7 || (score && lastPolledAt && age <= 30)) &&
        !(
          match.date === today &&
          match.time &&
          `${parts.hour}:${parts.minute}` < match.time
        ) &&
        report !== true
      );
    })
    .sort(
      (a, b) =>
        b.match.date.localeCompare(a.match.date) || a.key.localeCompare(b.key),
    );
  // A bounded, rotating batch avoids flooding the source or starving pending reports.
  const offset = results.cursor % (candidates.length || 1);
  const batch = [
    ...candidates.slice(offset),
    ...candidates.slice(0, offset),
  ].slice(0, 8);
  results.cursor = (offset + batch.length) % (candidates.length || 1);
  return batch;
}

export function observeMatch(entry, update, { teamId, season, now }) {
  const score = scoreOf(update);
  if (update.reportPublished && !score)
    throw new Error("Acta sin resultado válido.");
  const newResult = score && entry.score === null;
  const newReport =
    update.reportPublished &&
    entry.report !== true &&
    (entry.report === false || newResult);
  const events = [];
  for (const type of [newResult && "result", newReport && "report"].filter(
    Boolean,
  )) {
    const id = createHash("sha256")
      .update(`${teamId}:${season}:${entry.key}:${type}`)
      .digest("hex");
    events.push({
      id,
      type,
      createdAt: new Date(now).toISOString(),
      match: { ...entry.match, homeScore: score[0], awayScore: score[1] },
    });
  }
  if (score) {
    entry.score = score;
    entry.scoreObservedAt = new Date(now).toISOString();
    entry.scoreIdentity = identityOf(entry.match);
  }
  entry.report = entry.report === true || Boolean(update.reportPublished);
  entry.lastPolledAt = new Date(now).toISOString();
  return events;
}

export function applyMatchResults(snapshot, results, events = []) {
  if (!Array.isArray(results?.matches)) return snapshot;
  const observed = new Map(
    results.matches.map((entry) => [entry.match.id, entry]),
  );
  const snapshotAt = Date.parse(snapshot.updatedAt);
  let changed = false;
  const matches = snapshot.matches.map((match) => {
    if (match.status === "postponed") return match;
    const entry = observed.get(match.id);
    if (!entry || !Array.isArray(entry.score) || entry.score.length !== 2)
      return match;
    const score = scoreOf({
      homeScore: entry.score[0],
      awayScore: entry.score[1],
    });
    if (!score) return match;
    let observedAt = Date.parse(entry.scoreObservedAt);
    let identity = entry.scoreIdentity;
    if (!Number.isFinite(observedAt) || !identity) {
      // Older volumes have no observation timestamp. Only an actual result/report
      // event proves that this score was observed; lastPolledAt can be a blank response.
      const evidence = events.find(
        (event) =>
          ["result", "report"].includes(event.type) &&
          sameIdentity(event.match, match) &&
          event.match.homeScore === score[0] &&
          event.match.awayScore === score[1],
      );
      observedAt = Date.parse(evidence?.createdAt);
      identity = evidence?.match;
    }
    if (!Number.isFinite(observedAt) || !sameIdentity(identity, match))
      return match;
    // Keep a newer calendar correction. A temporary missing score must not turn
    // an already confirmed result back into an upcoming fixture.
    if (
      scoreOf(match) &&
      (!Number.isFinite(snapshotAt) || snapshotAt > observedAt)
    )
      return match;
    changed = true;
    return {
      ...match,
      homeScore: score[0],
      awayScore: score[1],
      status: "played",
    };
  });
  return changed ? { ...snapshot, matches } : snapshot;
}

export function matchPayload(event) {
  const { match } = event;
  return {
    title: event.type === "report" ? "Acta publicada" : "Resultado publicado",
    body: `${match.home} ${match.homeScore}–${match.awayScore} ${match.away}`.slice(
      0,
      420,
    ),
    url: "/?view=calendar&filter=played",
    tag: `match-${event.id}`,
  };
}
