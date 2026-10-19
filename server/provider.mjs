import { load } from "cheerio";
import { officialText, officialJson, SourceError } from "./http.mjs";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
export const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const clean = (s) =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 250) : "";
const number = (s) => (/^-?\d+$/.test(String(s)) ? Number(s) : 0);
const score = (s) => (/^\d{1,3}$/.test(String(s).trim()) ? Number(s) : null);
const idOf = (t) =>
  String(t.codigo_equipo ?? t.cod_equipo ?? t.codequipo ?? t.codigo ?? "");
export function nextProps(html) {
  try {
    const $ = load(html);
    const data = JSON.parse($("#__NEXT_DATA__").text());
    if (!data.props?.pageProps) throw new Error();
    return data.props.pageProps;
  } catch {
    throw new SourceError("La federación ha cambiado el formato de la página.");
  }
}
export function parseDate(value) {
  const text = clean(value);
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!m) {
    const d = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (d) m = [d[0], d[3], d[2], d[1]];
  }
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso)
    ? iso
    : null;
}
export function parseTeam(raw, id) {
  if (!raw || String(raw.codigo_equipo) !== id || !clean(raw.nombre_equipo))
    throw new SourceError(
      "Ese equipo no tiene una ficha pública disponible.",
      404,
    );
  return {
    id,
    name: clean(raw.nombre_equipo),
    category: clean(raw.categoria),
    group: "",
    season: "",
    venue: clean(raw.campo),
    sourceUrl: `https://www.rffm.es/fichaequipo/${id}`,
  };
}
export function parseSquad(raw) {
  return (Array.isArray(raw?.jugadores_equipo) ? raw.jugadores_equipo : [])
    .filter((p) => clean(p.nombre))
    .map((p) => ({ name: clean(p.nombre) }));
}
export function parseStandings(raw) {
  if (!raw || !Array.isArray(raw.clasificacion))
    throw new SourceError(
      "La federación no ha devuelto una clasificación válida.",
    );
  return raw.clasificacion
    .map((t) => ({
      position: number(t.posicion),
      team: clean(t.nombre_equipo ?? t.nombre),
      teamId: idOf(t),
      played: number(t.jugados),
      won: number(t.ganados),
      drawn: number(t.empatados),
      lost: number(t.perdidos),
      goalsFor: number(t.goles_a_favor),
      goalsAgainst: number(t.goles_en_contra),
      points: number(t.puntos),
    }))
    .filter((t) => t.team)
    .sort((a, b) => a.position - b.position);
}
export function parseMatches(raw, teamId) {
  if (!raw || !Array.isArray(raw.rounds))
    throw new SourceError("La federación no ha devuelto un calendario válido.");
  const matches = [];
  for (const [ri, round] of raw.rounds.entries()) {
    if (!Array.isArray(round.equipos))
      throw new SourceError("El formato de los partidos ha cambiado.");
    for (const [mi, m] of round.equipos.entries()) {
      const homeId = String(m.codigo_equipo_local),
        awayId = String(m.codigo_equipo_visitante);
      if (
        ![homeId, awayId].includes(teamId) ||
        homeId === "-1" ||
        awayId === "-1"
      )
        continue;
      const homeScore = score(m.goles_casa),
        awayScore = score(m.goles_visitante);
      const time = clean(m.hora).match(/^(\d{1,2}):(\d{2})/);
      const validTime =
        time && Number(time[1]) < 24 && Number(time[2]) < 60
          ? `${time[1].padStart(2, "0")}:${time[2]}`
          : null;
      const postponed = /aplazad|suspendid/i.test(
        `${m.estado ?? ""} ${m.estado_partido ?? ""}`,
      );
      matches.push({
        id: String(m.codacta || `${homeId}-${awayId}-${ri}-${mi}`),
        round: Number.parseInt(round.jornada, 10) || ri + 1,
        home: clean(m.equipo_local),
        away: clean(m.equipo_visitante),
        homeId,
        awayId,
        homeScore,
        awayScore,
        date: parseDate(m.fecha),
        time: validTime,
        venue: clean(m.campo) || null,
        status: postponed
          ? "postponed"
          : homeScore !== null && awayScore !== null
            ? "played"
            : "scheduled",
      });
    }
  }
  return matches;
}

export class Federation {
  constructor({ directory, getText = officialText, getJson = officialJson }) {
    this.directory = directory;
    this.getText = getText;
    this.getJson = getJson;
    this.memo = new Map();
    this.inflight = new Map();
  }
  async cached(key, loader, ttl = 24 * 60 * 60_000) {
    const old = this.memo.get(key);
    if (old && old.expires > Date.now()) return old.data;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const promise = loader()
      .then((data) => {
        this.memo.set(key, { data, expires: Date.now() + ttl });
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
  async page(url) {
    return nextProps(await this.getText(url));
  }
  async search(query) {
    const clubQuery = query.trim().replace(/\s*['"][A-Z]['"]\s*$/i, "");
    return this.cached(
      `search:${normalize(query)}`,
      async () => {
        const page = await this.page(
          `/competicion/clubes?${new URLSearchParams({ search: clubQuery })}`,
        );
        if (!page.clubs || !Array.isArray(page.clubs.clubes))
          throw new SourceError(
            "El buscador de la federación no está disponible. Puedes pegar el enlace de la ficha.",
          );
        const clubs = page.clubs.clubes.slice(0, 4);
        const details = await Promise.all(
          clubs.map((c) =>
            this.cached(`club:${c.codigo_club}`, () =>
              this.page(`/fichaclub/${c.codigo_club}`),
            ),
          ),
        );
        const teams = details
          .flatMap((d) => d.club?.equipos_club || [])
          .filter((t) => /^\d{1,12}$/.test(String(t.codigo_equipo)))
          .map((t) => ({
            id: String(t.codigo_equipo),
            name: clean(t.nombre_equipo),
            category: clean(t.categoria),
          }));
        const unique = [...new Map(teams.map((t) => [t.id, t])).values()];
        return {
          teams: unique.slice(0, 80),
          more: Number(page.totalPages) > 1 || page.clubs.clubes.length > 4,
        };
      },
      10 * 60_000,
    );
  }
  async locate(raw, season) {
    const cacheKey = `membership:${season.cod_temporada}:${raw.codigo_categoria}`;
    const game = /F[ -]?7|FUTBOL.?7/i.test(raw.categoria)
      ? "2"
      : /SALA/i.test(raw.categoria)
        ? "3"
        : /F[ -]?5/i.test(raw.categoria)
          ? "4"
          : /PLAYA/i.test(raw.categoria)
            ? "5"
            : "1";
    const competitions = await this.cached(
      `competitions:${season.cod_temporada}:${game}`,
      () =>
        this.getJson(
          `/api/competitions?${new URLSearchParams({ temporada: season.cod_temporada, tipojuego: game })}`,
        ),
    );
    if (!Array.isArray(competitions))
      throw new SourceError("No se han podido consultar las competiciones.");
    const candidates = competitions.filter(
      (c) => String(c.CodigoCategoria) === String(raw.codigo_categoria),
    );
    if (!candidates.length) return null;
    // Only the selected category is inspected, with a global maximum of four upstream requests.
    // Group membership is retained on disk; rosters and contact details never enter this index.
    const lookupPath = path.join(
      this.directory,
      `groups-${season.cod_temporada}-${raw.codigo_categoria}.json`,
    );
    let index = this.memo.get(cacheKey)?.data;
    if (!index) {
      try {
        index = JSON.parse(await readFile(lookupPath, "utf8"));
      } catch {
        index = {};
      }
      this.memo.set(cacheKey, { data: index, expires: Infinity });
    }
    const id = String(raw.codigo_equipo);
    if (index[id] && Date.now() - index[id].savedAt < 24 * 60 * 60_000)
      return index[id];
    delete index[id];
    for (const competition of candidates) {
      const groups = await this.cached(`groups:${competition.codigo}`, () =>
        this.getJson(
          `/api/groups?${new URLSearchParams({ competicion: competition.codigo })}`,
        ),
      );
      if (!Array.isArray(groups) || groups.length > 200)
        throw new SourceError(
          "La lista de grupos de la federación no es válida.",
        );
      let cursor = 0,
        found = null;
      const worker = async () => {
        while (cursor < groups.length && !found) {
          const g = groups[cursor++];
          const teams = await this.cached(`group-teams:${g.codigo}`, () =>
            this.getJson(
              `/api/group-teams?${new URLSearchParams({ codgrupo: g.codigo, codcompeticion: competition.codigo })}`,
            ),
          );
          if (!Array.isArray(teams))
            throw new SourceError(
              "No se han podido comprobar los equipos del grupo.",
            );
          const membership = {
            competitionId: String(competition.codigo),
            groupId: String(g.codigo),
            group: clean(g.nombre),
            game,
            savedAt: Date.now(),
          };
          for (const t of teams)
            if (/^\d{1,12}$/.test(idOf(t))) index[idOf(t)] = membership;
          if (index[id]) found = index[id];
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, groups.length) }, worker),
      );
      try {
        await mkdir(this.directory, { recursive: true });
        const temp = `${lookupPath}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(index), { mode: 0o600 });
        await rename(temp, lookupPath);
      } catch (e) {
        console.warn("No se ha podido guardar el índice de grupos:", e.code);
      }
      if (found) return found;
    }
    return null;
  }
  async snapshot(id) {
    const raw = (await this.page(`/fichaequipo/${id}`)).team;
    const team = parseTeam(raw, id),
      squad = parseSquad(raw);
    const seasons = await this.cached(
      "seasons",
      () => this.getJson("/api/seasons"),
      60 * 60_000,
    );
    if (!Array.isArray(seasons) || !seasons[0]?.cod_temporada)
      throw new SourceError(
        "La temporada de la federación no está disponible.",
      );
    const season = seasons[0];
    if (!/^\d{1,12}$/.test(String(season.cod_temporada)) || !/^\d{1,12}$/.test(String(raw.codigo_categoria))) throw new SourceError("La federación ha devuelto identificadores con un formato inesperado.");
    team.season = clean(season.nombre);
    const membership = await this.locate(raw, season);
    if (!membership)
      return {
        team,
        squad,
        matches: [],
        standings: [],
        warnings: [
          "Este equipo aún no tiene un grupo publicado para la temporada actual.",
        ],
      };
    team.group = membership.group;
    const query = new URLSearchParams({
      temporada: season.cod_temporada,
      tipojuego: membership.game,
      competicion: membership.competitionId,
      grupo: membership.groupId,
    });
    const [calendarPage, standingsRaw] = await Promise.all([
      this.cached(
        `calendar:${query}`,
        () => this.page(`/competicion/calendario?${query}`),
        15 * 60_000,
      ),
      this.cached(
        `standings:${membership.groupId}`,
        () =>
          this.getJson(
            `/api/standings?${new URLSearchParams({ idGroup: membership.groupId, round: "0" })}`,
          ),
        15 * 60_000,
      ),
    ]);
    const matches = parseMatches(calendarPage.calendar, id);
    const standings = parseStandings(standingsRaw);
    return { team, squad, matches, standings, warnings: [] };
  }
}
