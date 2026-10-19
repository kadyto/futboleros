import test from "node:test";
import assert from "node:assert/strict";
import { makeCalendar } from "../server/calendar.mjs";
test("exports only scheduled events, preserves Madrid time and date-only unknown times, and escapes ICS fields", () => {
  const matches = [
    {
      id: "1",
      date: "2027-03-28",
      time: "10:30",
      home: "Equipo;A",
      away: "Equipo,B",
      venue: "Campo\nInjected: value",
      round: 1,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
    },
    {
      id: "2",
      date: "2027-04-03",
      time: null,
      home: "A",
      away: "B",
      round: 2,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
    },
    { id: "3", date: null, homeScore: null, awayScore: null },
    { id: "4", date: "2027-03-20", homeScore: 0, awayScore: 0 },
    {
      id: "5",
      date: "2027-04-04",
      homeScore: null,
      awayScore: null,
      status: "postponed",
    },
  ];
  const v = makeCalendar(
    {
      team: {
        id: "1",
        name: "Equipo de ejemplo",
        sourceUrl: "https://www.rffm.es",
      },
      matches,
    },
    new Date("2026-10-01T10:00:00Z"),
  );
  assert.equal((v.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(v, /DTSTART;TZID=Europe\/Madrid:20270328T103000/);
  assert.match(v, /DTSTART;VALUE=DATE:20270403/);
  assert.match(v, /SUMMARY:Equipo\\;A – Equipo\\,B/);
  assert.match(v, /LOCATION:Campo\\nInjected: value/);
  assert.match(v, /TZOFFSETTO:\+0200/);
  for (const line of v.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
});
