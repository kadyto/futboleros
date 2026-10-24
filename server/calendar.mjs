import { phaseOf } from "./match-timing.mjs";

function escape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function fold(line) {
  let out = "",
    width = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (width + bytes > 75) {
      out += "\r\n ";
      width = 1;
    }
    out += char;
    width += bytes;
  }
  return out;
}
export function makeCalendar(snapshot, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Futboleros//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(snapshot.team.name)}`,
    "X-WR-TIMEZONE:Europe/Madrid",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Madrid",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const m of snapshot.matches) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(m.date || "") ||
      phaseOf(m, now.getTime()) !== "upcoming"
    )
      continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escape(`${snapshot.team.id}-${m.id}@futboleros`)}`,
      `DTSTAMP:${now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
    );
    if (/^\d{2}:\d{2}$/.test(m.time || ""))
      lines.push(
        `DTSTART;TZID=Europe/Madrid:${m.date.replaceAll("-", "")}T${m.time.replace(":", "")}00`,
      );
    else lines.push(`DTSTART;VALUE=DATE:${m.date.replaceAll("-", "")}`);
    lines.push(
      `SUMMARY:${escape(`${m.home} – ${m.away}`)}`,
      `DESCRIPTION:${escape(`${m.round ? `Jornada ${m.round}. ` : ""}${!m.time ? "Hora por confirmar. " : ""}Comprueba el horario antes de desplazarte.\n${snapshot.team.sourceUrl}`)}`,
    );
    if (m.venue) lines.push(`LOCATION:${escape(m.venue)}`);
    lines.push("STATUS:TENTATIVE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
