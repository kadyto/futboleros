import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  Federation,
  nextProps,
  parseTeam,
  parseMatches,
  parseStandings,
  parseSquad,
  parseDate,
} from "../server/provider.mjs";
import { rawTeam, rawCalendar, rawStandings, page } from "./fixtures.mjs";

test("normalizes the public team, roster, dates and 0-0 scores without exporting contact data", () => {
  const team = parseTeam(rawTeam, "1001");
  assert.equal(team.name, "C.D. Olivares A");
  assert.equal(team.email_correspondencia, undefined);
  assert.deepEqual(parseSquad(rawTeam), [{ name: "Jugador de ejemplo" }]);
  const matches = parseMatches(rawCalendar, "1001");
  assert.equal(matches.length, 2);
  assert.equal(matches[0].status, "played");
  assert.equal(matches[0].homeScore, 0);
  assert.equal(matches[1].homeScore, null);
  assert.equal(matches[1].time, null);
  assert.equal(matches[1].date, "2026-10-24");
  assert.equal(parseStandings(rawStandings)[0].teamId, "1001");
  for (const value of ["2026-02-31", "31-02-2026", "x", ""])
    assert.equal(parseDate(value), null);
  assert.equal(parseDate("03/01/2027"), "2027-01-03");
  assert.throws(() => nextProps("<html>Maintenance</html>"), /formato/);
  assert.throws(() => parseMatches({}, "1001"), /calendario/);
  assert.throws(() => parseTeam(null, "1001"), /pública/);
});

test("discovers the current competition and group, fetches calendar and standings and reuses the index after restart", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-provider-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let groupCalls = 0;
  const getText = async (url) => {
    if (url === "/fichaequipo/1001") return page({ team: rawTeam });
    if (url.startsWith("/competicion/calendario?"))
      return page({ calendar: rawCalendar });
    throw Error(`Unexpected page ${url}`);
  };
  const getJson = async (url) => {
    const u = new URL(url, "https://www.rffm.es");
    if (u.pathname === "/api/seasons")
      return [{ cod_temporada: "22", nombre: "2026-2027" }];
    if (u.pathname === "/api/competitions") {
      assert.equal(u.searchParams.get("tipojuego"), "2");
      return [{ codigo: "600", CodigoCategoria: "501" }];
    }
    if (u.pathname === "/api/groups")
      return [{ codigo: "700", nombre: "Grupo 1" }];
    if (u.pathname === "/api/group-teams") {
      groupCalls++;
      return [{ cod_equipo: "1001" }];
    }
    if (u.pathname === "/api/standings") {
      assert.equal(u.searchParams.get("idGroup"), "700");
      return rawStandings;
    }
    throw Error(`Unexpected JSON ${url}`);
  };
  let p = new Federation({ directory, getText, getJson });
  let snapshot = await p.snapshot("1001");
  assert.equal(snapshot.team.group, "Grupo 1");
  assert.equal(snapshot.matches.length, 2);
  assert.equal(snapshot.standings.length, 1);
  assert.equal(snapshot.squad.length, 1);
  p = new Federation({ directory, getText, getJson });
  snapshot = await p.snapshot("1001");
  assert.equal(groupCalls, 1);
  assert.equal(snapshot.team.season, "2026-2027");
  await writeFile(
    path.join(directory, "groups-22-501.json"),
    JSON.stringify({
      1001: {
        groupId: "old",
        group: "Previous group",
        savedAt: Date.now() - 26 * 60 * 60_000,
      },
    }),
  );
  const changed = await new Federation({
    directory,
    getText,
    getJson,
  }).snapshot("1001");
  assert.equal(changed.team.group, "Grupo 1");
  assert.equal(groupCalls, 2);
});

test("searches public clubs and returns teams with categories", async () => {
  const p = new Federation({
    directory: "/unused",
    getText: async (url) =>
      url.startsWith("/competicion/clubes?")
        ? page({ clubs: { clubes: [{ codigo_club: "10" }] }, totalPages: 1 })
        : page({
            club: {
              equipos_club: [
                {
                  codigo_equipo: "1001",
                  nombre_equipo: "C.D. Olivares A",
                  categoria: "ALEVIN F-7",
                },
              ],
            },
          }),
  });
  const found = await p.search("Olivares");
  assert.equal(found.teams[0].id, "1001");
  assert.equal(found.teams[0].category, "ALEVIN F-7");
  assert.equal(found.more, false);
});
