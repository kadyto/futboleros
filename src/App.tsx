import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  Goal,
  Home,
  Info,
  LoaderCircle,
  MapPin,
  Menu,
  RefreshCw,
  Shield,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import type { Match, Snapshot, Standing, Team } from "./types";
import Brand from "./Brand";
import TeamPosition from "./TeamPosition";
import MatchForecast from "./MatchForecast";
import { findStanding, hasPosition } from "./match-insights";
import FederationLink from "./FederationLink";
import { teamProfileUrl, matchReportUrl } from "./federation-links";
import PlayerCard from "./PlayerCard";
import MatchWeather from "./MatchWeather";
import useStatistics from "./useStatistics";
import NotificationCenter from "./NotificationCenter";

type View = "overview" | "calendar" | "standings" | "squad";
const sections = [
  { id: "overview", title: "Mi equipo", icon: Home },
  { id: "calendar", title: "Calendario", icon: CalendarDays },
  { id: "standings", title: "Clasificación", icon: Trophy },
  { id: "squad", title: "Plantilla", icon: Users },
] as const;
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Madrid",
});
function displayDate(date: string | null) {
  return date
    ? dateFormatter.format(new Date(`${date}T12:00:00+02:00`))
    : "Fecha por confirmar";
}
function sameTeam(name: string, id: string | undefined, team: Team) {
  return id
    ? id === team.id
    : name.trim().toLocaleUpperCase() === team.name.trim().toLocaleUpperCase();
}
function ours(match: Match, team: Team) {
  return sameTeam(match.home, match.homeId, team);
}
function isPlayed(m: Match) {
  return m.homeScore !== null && m.awayScore !== null;
}
function result(m: Match, team: Team) {
  if (!isPlayed(m)) return null;
  const diff = (m.homeScore! - m.awayScore!) * (ours(m, team) ? 1 : -1);
  return diff > 0 ? "V" : diff < 0 ? "D" : "E";
}
function teamInitials(name: string) {
  return (
    name
      .replace(/['".]/g, "")
      .split(/\s+/)
      .filter(
        (w) =>
          !["C", "D", "F", "S", "A", "DEL", "DE"].includes(w.toUpperCase()),
      )
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "FC"
  );
}
function Crest({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <div className={`crest ${large ? "large" : ""}`} aria-hidden="true">
      <Shield />
      <span>{teamInitials(name)}</span>
    </div>
  );
}
function MatchRow({
  match: m,
  team,
  standings,
  showReport = false,
}: {
  match: Match;
  team: Team;
  standings: Standing[];
  showReport?: boolean;
}) {
  const r = result(m, team);
  const reportUrl = matchReportUrl(m.id);
  return (
    <div className={`match-row${showReport ? " match-row--report" : ""}`}>
      <div className="match-date">
        <span>{m.round ? `JORNADA ${m.round}` : "PARTIDO"}</span>
        <strong>{displayDate(m.date)}</strong>
        <small>
          {m.status === "postponed"
            ? "Aplazado"
            : isPlayed(m)
              ? "Finalizado"
              : m.time
                ? `${m.time} h`
                : "Hora por confirmar"}
        </small>
      </div>
      <div className="match-teams">
        <div className={ours(m, team) ? "our-team" : ""}>
          <Crest name={m.home} />
          <span className="match-team-name">
            <FederationLink
              href={teamProfileUrl(
                m.homeId ?? findStanding(standings, m.home)?.teamId,
              )}
            >
              {m.home}
            </FederationLink>
            <TeamPosition
              standing={findStanding(standings, m.home, m.homeId)}
            />
          </span>
          <b>{m.homeScore ?? "–"}</b>
        </div>
        <div className={!ours(m, team) ? "our-team" : ""}>
          <Crest name={m.away} />
          <span className="match-team-name">
            <FederationLink
              href={teamProfileUrl(
                m.awayId ?? findStanding(standings, m.away)?.teamId,
              )}
            >
              {m.away}
            </FederationLink>
            <TeamPosition
              standing={findStanding(standings, m.away, m.awayId)}
            />
          </span>
          <b>{m.awayScore ?? "–"}</b>
        </div>
      </div>
      <div className="match-extra">
        {r ? (
          <span
            className={`result ${r}`}
            title={r === "V" ? "Victoria" : r === "E" ? "Empate" : "Derrota"}
          >
            {r}
          </span>
        ) : (
          <span className="match-venue">
            <MapPin size={14} />
            <span>{m.venue || "Campo por confirmar"}</span>
          </span>
        )}
        {showReport &&
          (reportUrl ? (
            <FederationLink
              href={reportUrl}
              className="match-report-link"
              title={
                isPlayed(m)
                  ? "Ver acta en la federación (se abre en otra pestaña)"
                  : "Ver partido en la federación; el acta se publicará cuando esté disponible (se abre en otra pestaña)"
              }
            >
              Ver acta <ExternalLink size={12} aria-hidden="true" />
            </FederationLink>
          ) : (
            <span className="match-report-unavailable">Acta no disponible</span>
          ))}
      </div>
    </div>
  );
}
function LeagueTable({
  rows,
  team,
  compact = false,
}: {
  rows: Standing[];
  team: Team;
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th
              className="rank"
              title="Posición actual"
              aria-label="Posición actual"
            >
              #
            </th>
            <th>Equipo</th>
            <th className="points">PTS</th>
            <th>PJ</th>
            {!compact && (
              <>
                <th>PG</th>
                <th>PE</th>
                <th>PP</th>
                <th>GF</th>
                <th>GC</th>
                <th>DG</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.position}-${row.team}`}
              className={
                sameTeam(row.team, row.teamId, team) ? "selected-row" : ""
              }
            >
              <td className="rank">
                <span>{hasPosition(row) ? `${row.position}.º` : "–"}</span>
              </td>
              <td>
                <div className="table-team">
                  <Crest name={row.team} />
                  <span>
                    <FederationLink href={teamProfileUrl(row.teamId)}>
                      {row.team}
                    </FederationLink>
                  </span>
                  {sameTeam(row.team, row.teamId, team) && (
                    <span className="you-tag">TU EQUIPO</span>
                  )}
                </div>
              </td>
              <td className="points">{row.points}</td>
              <td>{row.played}</td>
              {!compact && (
                <>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td>{row.goalsFor - row.goalsAgainst}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Empty({
  text,
  icon: Icon = CalendarDays,
}: {
  text: string;
  icon?: typeof CalendarDays;
}) {
  return (
    <div className="empty">
      <Icon size={30} strokeWidth={1.5} />
      <p>{text}</p>
      <small>
        Los datos aparecerán cuando estén disponibles en la federación.
      </small>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get("view") === "calendar"
      ? "calendar"
      : "overview",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [calendarFilter, setCalendarFilter] = useState("upcoming");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useStatistics(view, Boolean(data?.team));
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/team", { signal: ctrl.signal })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok)
          throw new Error(value.error || "No se ha podido cargar el equipo.");
        return value as Snapshot | null;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [refreshKey]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const team = data?.team;
  const played =
    data?.matches
      .filter(isPlayed)
      .sort(
        (a, b) =>
          (b.date || "").localeCompare(a.date || "") || b.round - a.round,
      ) || [];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const upcoming =
    data?.matches
      .filter((m) => !isPlayed(m) && (!m.date || m.date >= today))
      .sort(
        (a, b) =>
          (a.date || "9999").localeCompare(b.date || "9999") ||
          a.round - b.round,
      ) || [];
  const next = upcoming.find((m) => m.status !== "postponed") || upcoming[0];
  const position =
    team && data ? findStanding(data.standings, team.name, team.id) : undefined;
  const nextHomePosition =
    next && data
      ? findStanding(data.standings, next.home, next.homeId)
      : undefined;
  const nextAwayPosition =
    next && data
      ? findStanding(data.standings, next.away, next.awayId)
      : undefined;
  const compactRows = data
    ? data.standings.slice(
        Math.max(
          0,
          data.standings.findIndex(
            (s) => team && sameTeam(s.team, s.teamId, team),
          ) - 2,
        ),
        Math.max(
          5,
          data.standings.findIndex(
            (s) => team && sameTeam(s.team, s.teamId, team),
          ) + 3,
        ),
      )
    : [];
  function navigate(v: View) {
    setView(v);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <Brand variant="sidebar" />
        <div className="team-selector public-team-label">
          <div className="small-team-icon">
            <Shield size={22} />
          </div>
          <span>
            <small>EQUIPO DE ESTA WEB</small>
            <strong>
              <FederationLink href={teamProfileUrl(team?.id)}>
                {team?.name || "Pendiente de configurar"}
              </FederationLink>
            </strong>
            {team && <TeamPosition standing={position} />}
          </span>
        </div>
        <p className="nav-label">TU TEMPORADA</p>
        <nav aria-label="Principal">
          {sections.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => navigate(id)}
              disabled={!team}
            >
              <Icon size={19} />
              <span>{title}</span>
              {id === view && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Shield size={16} />
            <span>Solo fútbol. Sin anuncios.</span>
          </div>
          <a className="admin-access" href="/admin">
            Administración
          </a>
          <a className="admin-access" href="/privacidad">
            Privacidad
          </a>
          <small>Futboleros · v0.2.0</small>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div className="mobile-brand">
            <button
              className="icon-button"
              aria-label="Abrir menú"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <Brand variant="mobile" />
          </div>
          <div className="breadcrumb">
            <span>Tu temporada</span>
            <ChevronRight size={14} />
            <b>{sections.find((s) => s.id === view)?.title}</b>
          </div>
          <div className="topbar-right">
            {team && (
              <span className="season-chip">
                <span />
                {team.season || "Temporada actual"}
              </span>
            )}
            {team && (
              <NotificationCenter
                key={team.id}
                teamId={team.id}
                onCalendar={() => {
                  setCalendarFilter("all");
                  navigate("calendar");
                }}
              />
            )}
            <a
              className="icon-button"
              href="/admin"
              title="Administración"
              aria-label="Administración"
            >
              <Shield size={19} />
            </a>
          </div>
        </header>
        <div className="page-content">
          {error && (
            <div className="notice error-notice" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button onClick={() => setRefreshKey((k) => k + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {data?.stale && (
            <div className="notice warning-notice">
              <Clock3 size={18} />
              <span>
                La federación no está disponible. Mostramos la última copia
                guardada, del {new Date(data.updatedAt).toLocaleString("es-ES")}
                .
              </span>
            </div>
          )}
          {loading && !data ? (
            <div className="loading-state" role="status">
              <LoaderCircle className="spin" size={30} />
              <h2>Buscando a tu equipo…</h2>
              <p>La primera consulta puede tardar un poco.</p>
            </div>
          ) : !data ? (
            <div className="welcome">
              <div className="welcome-tag">
                <Goal size={16} /> TU EQUIPO. TU TEMPORADA.
              </div>
              <h1>
                El fútbol que
                <br />
                más te importa<span>.</span>
              </h1>
              <p>
                {error
                  ? "No podemos cargar la información en este momento. Puedes volver a intentarlo con el botón superior."
                  : "El equipo aún no está configurado. Cuando la administración lo guarde, aquí aparecerán sus partidos, resultados y clasificación."}
              </p>
              {!error && (
                <a className="primary" href="/admin">
                  Ir a administración <ArrowRight size={18} />
                </a>
              )}
              <div className="welcome-pitch" aria-hidden="true">
                <div className="pitch-center" />
                <div className="pitch-ball">⚽</div>
                <div className="pitch-caption">Nos vemos en el campo.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {team!.category || "FÚTBOL BASE"}
                    {team!.group ? ` · ${team!.group}` : ""}
                  </div>
                  <h1>
                    {view === "overview"
                      ? "Tu equipo, a mano"
                      : sections.find((s) => s.id === view)?.title}
                    <span>.</span>
                  </h1>
                  {view !== "overview" && (
                    <p>
                      {view === "calendar"
                        ? "Organiza el finde. Y el siguiente."
                        : view === "standings"
                          ? "Cada jornada cuenta. Así va la temporada."
                          : "Los protagonistas de cada jornada."}
                    </p>
                  )}
                </div>
                <button
                  className="secondary refresh"
                  onClick={() => setRefreshKey((k) => k + 1)}
                  disabled={loading}
                >
                  <RefreshCw size={15} className={loading ? "spin" : ""} />
                  {loading ? "Consultando…" : "Actualizar"}
                </button>
              </div>
              <section className="team-banner">
                <Crest name={team!.name} large />
                <div>
                  <small>TU EQUIPO</small>
                  <div className="team-banner-heading">
                    <h2>
                      <FederationLink href={teamProfileUrl(team!.id)}>
                        {team!.name}
                      </FederationLink>
                    </h2>
                    <TeamPosition standing={position} />
                  </div>
                  <p>
                    {[team!.category, team!.group, team!.season]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="following">
                  <Star size={14} fill="currentColor" /> Siguiendo
                </span>
              </section>
              {data.warnings.length > 0 && (
                <div className="data-warnings">
                  <Info size={15} />
                  <span>{data.warnings.join(" ")}</span>
                </div>
              )}
              {view === "overview" && (
                <>
                  <div className="overview-grid">
                    <section className="next-match panel">
                      <div className="section-header">
                        <div className="eyebrow">
                          <span className="live-dot" /> PRÓXIMA CITA
                        </div>
                        {next?.round ? (
                          <span className="round-chip">
                            Jornada {next.round}
                          </span>
                        ) : null}
                      </div>
                      {next ? (
                        <>
                          <div className="next-date">
                            <CalendarDays size={16} />
                            <span>{displayDate(next.date)}</span>
                            <b>
                              {next.status === "postponed"
                                ? "Aplazado"
                                : next.time
                                  ? `${next.time} h`
                                  : "Hora por confirmar"}
                            </b>
                          </div>
                          <div className="matchup">
                            <div>
                              <Crest name={next.home} large />
                              <h3>
                                <FederationLink
                                  href={teamProfileUrl(
                                    next.homeId ?? nextHomePosition?.teamId,
                                  )}
                                >
                                  {next.home}
                                </FederationLink>
                              </h3>
                              <TeamPosition standing={nextHomePosition} />
                              <small>
                                {ours(next, team!)
                                  ? "TU EQUIPO · LOCAL"
                                  : "LOCAL"}
                              </small>
                            </div>
                            <div className="versus">
                              <span>VS</span>
                              <small>{team!.category}</small>
                            </div>
                            <div>
                              <Crest name={next.away} large />
                              <h3>
                                <FederationLink
                                  href={teamProfileUrl(
                                    next.awayId ?? nextAwayPosition?.teamId,
                                  )}
                                >
                                  {next.away}
                                </FederationLink>
                              </h3>
                              <TeamPosition standing={nextAwayPosition} />
                              <small>
                                {!ours(next, team!)
                                  ? "TU EQUIPO · VISITANTE"
                                  : "VISITANTE"}
                              </small>
                            </div>
                          </div>
                          <div className="next-venue">
                            {next.venueMapsUrl ? (
                              <a
                                href={next.venueMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver campo en Google Maps (se abre en otra pestaña)"
                              >
                                <MapPin size={16} aria-hidden="true" />
                                <span>{next.venue}</span>
                                <ExternalLink size={12} aria-hidden="true" />
                              </a>
                            ) : (
                              <>
                                <MapPin size={16} aria-hidden="true" />
                                <span>
                                  {next.venue || "Campo por confirmar"}
                                </span>
                              </>
                            )}
                          </div>
                          <MatchForecast
                            match={next}
                            standings={data.standings}
                            stale={data.stale}
                          />
                          <MatchWeather
                            key={`${next.id}:${next.date}:${next.time}:${next.venueId || next.venue}`}
                            match={next}
                            refreshKey={refreshKey}
                          />
                          <button
                            className="next-link"
                            onClick={() => navigate("calendar")}
                          >
                            Ver todo el calendario <ArrowRight size={16} />
                          </button>
                        </>
                      ) : (
                        <Empty text="No hay próximos partidos publicados." />
                      )}
                    </section>
                    <section className="season-panel panel">
                      <div className="section-header">
                        <h2>Así vamos</h2>
                        <Trophy size={20} />
                      </div>
                      {hasPosition(position) ? (
                        <>
                          <div className="position">
                            <b>
                              {position.position}
                              <sup>º</sup>
                            </b>
                            <div>
                              <strong>en la clasificación</strong>
                              <span>de {data.standings.length} equipos</span>
                            </div>
                          </div>
                          <div className="stats">
                            <div>
                              <b>{position.points}</b>
                              <span>Puntos</span>
                            </div>
                            <div>
                              <b>{position.played}</b>
                              <span>Jugados</span>
                            </div>
                            <div>
                              <b>{position.goalsFor}</b>
                              <span>Goles a favor</span>
                            </div>
                          </div>
                          <div className="form">
                            <span>ÚLTIMOS PARTIDOS</span>
                            <div>
                              {played
                                .slice(0, 5)
                                .reverse()
                                .map((m) => (
                                  <span
                                    key={m.id}
                                    className={`result ${result(m, team!)}`}
                                    title={`${m.home} ${m.homeScore} – ${m.awayScore} ${m.away}`}
                                  >
                                    {result(m, team!)}
                                  </span>
                                ))}
                              {!played.length && (
                                <small>Aún sin resultados</small>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <Empty
                          text="La clasificación aún no está publicada."
                          icon={Trophy}
                        />
                      )}
                    </section>
                  </div>
                  <div className="bottom-grid">
                    <section className="panel results-panel">
                      <div className="section-header">
                        <div>
                          <div className="eyebrow">EL PITIDO FINAL</div>
                          <h2>Últimos resultados</h2>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => {
                            setCalendarFilter("played");
                            navigate("calendar");
                          }}
                        >
                          Ver todos <ArrowRight size={15} />
                        </button>
                      </div>
                      {played.length ? (
                        played
                          .slice(0, 3)
                          .map((m) => (
                            <MatchRow
                              key={m.id}
                              match={m}
                              team={team!}
                              standings={data.standings}
                            />
                          ))
                      ) : (
                        <Empty text="Todavía no hay resultados publicados." />
                      )}
                    </section>
                    <section className="panel standings-panel">
                      <div className="section-header">
                        <div>
                          <div className="eyebrow">PASO A PASO</div>
                          <h2>La clasificación</h2>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Ver clasificación completa"
                          onClick={() => navigate("standings")}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                      {data.standings.length ? (
                        <LeagueTable rows={compactRows} team={team!} compact />
                      ) : (
                        <Empty
                          text="Sin clasificación disponible."
                          icon={Trophy}
                        />
                      )}
                      <button
                        className="table-link"
                        onClick={() => navigate("standings")}
                      >
                        Ver clasificación completa <ChevronRight size={15} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {view === "calendar" && (
                <section className="panel">
                  <div className="section-header calendar-header">
                    <div className="segmented" aria-label="Filtrar partidos">
                      {[
                        ["upcoming", "Próximos"],
                        ["played", "Resultados"],
                        ["all", "Todos"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          aria-pressed={calendarFilter === id}
                          className={calendarFilter === id ? "selected" : ""}
                          onClick={() => setCalendarFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <a className="secondary" href="/api/calendar.ics" download>
                      <ArrowDownToLine size={16} />
                      Exportar calendario
                    </a>
                  </div>
                  {(calendarFilter === "upcoming"
                    ? upcoming
                    : calendarFilter === "played"
                      ? played
                      : [...data.matches].sort((a, b) => a.round - b.round)
                  ).map((m) => (
                    <MatchRow
                      key={m.id}
                      match={m}
                      team={team!}
                      standings={data.standings}
                      showReport
                    />
                  ))}
                  {!(
                    calendarFilter === "upcoming"
                      ? upcoming
                      : calendarFilter === "played"
                        ? played
                        : data.matches
                  ).length && <Empty text="No hay partidos en esta sección." />}
                  <p className="panel-footnote">
                    <Info size={14} />
                    Los horarios pueden cambiar. Compruébalos antes de
                    desplazarte. La exportación es una copia, no una
                    suscripción. Las posiciones son las actuales, también en los
                    partidos pasados.
                  </p>
                </section>
              )}
              {view === "standings" && (
                <section className="panel">
                  <div className="section-header">
                    <h2>{team!.group || "Clasificación de la temporada"}</h2>
                    <span className="muted">
                      {data.standings.length} equipos
                    </span>
                  </div>
                  {data.standings.length ? (
                    <LeagueTable rows={data.standings} team={team!} />
                  ) : (
                    <Empty
                      text="La clasificación aún no está disponible."
                      icon={Trophy}
                    />
                  )}
                  <p className="panel-footnote">
                    PTS: puntos · PJ: jugados · PG: ganados · PE: empatados ·
                    PP: perdidos · GF: goles a favor · GC: goles en contra · DG:
                    diferencia
                  </p>
                </section>
              )}
              {view === "squad" && (
                <section className="panel">
                  <div className="section-header">
                    <h2>La plantilla</h2>
                    <span className="count-chip">
                      {data.squad.length} jugadores
                    </span>
                  </div>
                  {data.squad.length ? (
                    <div className="squad-grid">
                      {data.squad.map((player, i) => (
                        <PlayerCard
                          player={player}
                          key={`${player.name}-${i}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      text="La federación no muestra una plantilla pública para este equipo."
                      icon={Users}
                    />
                  )}
                  <p className="panel-footnote">
                    <Shield size={14} />
                    Solo se muestra información deportiva que la federación
                    publica. No guardamos fotografías, fechas de nacimiento ni
                    datos de contacto.
                  </p>
                </section>
              )}
              <footer className="page-footer">
                <span>
                  <span className={`status-dot ${data.stale ? "stale" : ""}`} />
                  {data.demo
                    ? "Datos de demostración"
                    : `Datos consultados el ${new Date(data.updatedAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
                </span>
                {!data.demo && (
                  <a href={team!.sourceUrl} target="_blank" rel="noreferrer">
                    Ver en la federación <ExternalLink size={12} />
                  </a>
                )}
                <span className="footer-motto">
                  Nos vemos en el campo <Goal size={14} />
                </span>
              </footer>
            </>
          )}
        </div>
        {data && (
          <nav className="mobile-nav" aria-label="Navegación móvil">
            {sections.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => navigate(id)}
              >
                <Icon size={20} />
                <span>
                  {id === "standings"
                    ? "Liga"
                    : id === "overview"
                      ? "Mi equipo"
                      : title}
                </span>
              </button>
            ))}
          </nav>
        )}
      </main>
    </div>
  );
}
