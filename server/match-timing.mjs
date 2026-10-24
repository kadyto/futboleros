const madrid = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const partsOf = (instant) =>
  Object.fromEntries(
    madrid
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]),
  );
const dateOf = (parts) => `${parts.year}-${parts.month}-${parts.day}`;
export function hasResult(match) {
  return [match.homeScore, match.awayScore].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 999,
  );
}

export function phaseOf(match, now = Date.now()) {
  if (hasResult(match)) return "played";
  if (match.status === "postponed") return "postponed";
  const date = match.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "upcoming";
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== date
  )
    return "upcoming";
  const parts = partsOf(now);
  const today = dateOf(parts);
  if (date < today) return "pending";
  if (date > today) return "upcoming";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(match.time || "")) return "upcoming";
  return `${parts.hour}:${parts.minute}` >= match.time ? "pending" : "upcoming";
}
