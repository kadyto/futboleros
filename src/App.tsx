import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
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
  Search,
  Shield,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { Match, Snapshot, Standing, Team } from "./types";

type View = "overview" | "calendar" | "standings" | "squad";
type Bookmark = Pick<Team, "id" | "name"> & { category?: string };
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
function readSaved(): { selected?: string; teams: Bookmark[] } {
  try {
    const v = JSON.parse(localStorage.getItem("futboleros.teams") || "{}");
    return {
      selected: typeof v.selected === "string" ? v.selected : undefined,
      teams: Array.isArray(v.teams)
        ? v.teams.filter(
            (t: Bookmark) => /^\d+$/.test(t.id) && typeof t.name === "string",
          )
        : [],
    };
  } catch {
    return { teams: [] };
  }
}
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
function MatchRow({ match: m, team }: { match: Match; team: Team }) {
  const r = result(m, team);
  return (
    <div className="match-row">
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
          <span>{m.home}</span>
          <b>{m.homeScore ?? "–"}</b>
        </div>
        <div className={!ours(m, team) ? "our-team" : ""}>
          <Crest name={m.away} />
          <span>{m.away}</span>
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
          <>
            <MapPin size={14} />
            <span>{m.venue || "Campo por confirmar"}</span>
          </>
        )}
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
            <th className="rank">#</th>
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
                <span>{row.position}</span>
              </td>
              <td>
                <div className="table-team">
                  <Crest name={row.team} />
                  <span>{row.team}</span>
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
  const [saved, setSaved] = useState(readSaved);
  const [selected, setSelected] = useState<string | undefined>(saved.selected);
  const [data, setData] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>("overview");
  const [picker, setPicker] = useState(!saved.selected);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Bookmark[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searchMore, setSearchMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState("upcoming");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("futboleros.teams", JSON.stringify(saved));
    } catch {
      /* Private browsing can disable storage. */
    }
  }, [saved]);
  useEffect(() => {
    if (picker) inputRef.current?.focus();
  }, [picker]);
  useEffect(() => {
    if (!selected) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/teams/${encodeURIComponent(selected)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok)
          throw new Error(v.error || "No se ha podido cargar el equipo.");
        return v as Snapshot;
      })
      .then((v) => {
        setData(v);
        setPicker(false);
        if (!v.demo)
          setSaved((old) => ({
            selected: v.team.id,
            teams: [v.team, ...old.teams.filter((t) => t.id !== v.team.id)]
              .slice(0, 8)
              .map((t) => ({ id: t.id, name: t.name, category: t.category })),
          }));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [selected, refreshKey]);
  useEffect(() => {
    const clean = query.trim();
    setFound([]);
    setSearchError("");
    setSearchMore(false);
    if (
      !picker ||
      clean.length < 3 ||
      /^\d+$/.test(clean) ||
      clean.includes("fichaequipo/")
    ) {
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(clean)}`, {
        signal: ctrl.signal,
      })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error || "No se ha podido buscar.");
          return v;
        })
        .then((v) => {
          setFound(v.teams);
          setSearchMore(Boolean(v.more));
          if (!v.teams.length)
            setSearchError(
              "No se han encontrado equipos. También puedes pegar el enlace de su ficha.",
            );
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSearchError(e.message);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, picker]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  function choose(id: string) {
    setSelected(id);
    setView("overview");
    setQuery("");
    setError("");
    if (id === selected) setRefreshKey((k) => k + 1);
  }
  function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    const clean = query.trim();
    if (/^\d{1,12}$/.test(clean)) {
      choose(clean);
      return;
    }
    try {
      const u = new URL(clean);
      const m = u.pathname.match(/^\/fichaequipo\/(\d{1,12})\/?$/);
      if (
        u.protocol === "https:" &&
        ["www.rffm.es", "rffm.es"].includes(u.hostname) &&
        m
      ) {
        choose(m[1]);
        return;
      }
    } catch {
      /* A name is handled by search. */
    }
    if (found.length === 1) choose(found[0].id);
    else
      setSearchError(
        "Elige un resultado o pega el enlace completo de la ficha del equipo.",
      );
  }
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
  const position = data?.standings.find(
    (s) => team && sameTeam(s.team, s.teamId, team),
  );
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
        <a className="brand" href="/" aria-label="Futboleros, inicio">
          <span className="brand-mark">
            f<span>.</span>
          </span>
          <span>
            futboleros<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-kicker">EN LA BANDA, CONTIGO</div>
        <button
          className="team-selector"
          onClick={() => {
            setPicker(true);
            setMobileMenu(false);
          }}
        >
          <div className="small-team-icon">
            <Shield size={22} />
          </div>
          <span>
            <small>ESTÁS SIGUIENDO A</small>
            <strong>{team?.name || "Elige tu equipo"}</strong>
          </span>
          <ChevronDown size={16} />
        </button>
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
          <div className="field-art" aria-hidden="true">
            <div />
            <span>El mejor plan del finde.</span>
          </div>
          <div className="quiet-note">
            <Shield size={16} />
            <span>Solo fútbol. Sin anuncios.</span>
          </div>
          <small>Futboleros · v0.1.0</small>
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
            <strong>
              futboleros<span>.</span>
            </strong>
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
            <button
              className="icon-button"
              title="Cambiar equipo"
              aria-label="Cambiar equipo"
              onClick={() => setPicker(true)}
            >
              <Search size={19} />
            </button>
          </div>
        </header>
        <div className="page-content">
          {data?.demo && (
            <div className="notice demo-notice">
              <Info size={17} />
              <span>Estás explorando un ejemplo con datos ficticios.</span>
              <button
                onClick={() => {
                  setPicker(true);
                  setQuery("");
                }}
              >
                Elegir mi equipo <ArrowRight size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="notice error-notice" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button onClick={() => setRefreshKey((k) => k + 1)}>
                Reintentar
              </button>
              <button onClick={() => setPicker(true)}>Cambiar equipo</button>
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
                Los horarios del próximo finde. Ese gol de la última jornada. La
                ilusión de toda una temporada. Todo, en un mismo sitio.
              </p>
              <button className="primary" onClick={() => setPicker(true)}>
                Elegir mi equipo <ArrowRight size={18} />
              </button>
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
                  <p>
                    {view === "overview"
                      ? "Lo que necesitas saber, antes de ir al campo."
                      : view === "calendar"
                        ? "Organiza el finde. Y el siguiente."
                        : view === "standings"
                          ? "Cada jornada cuenta. Así va la temporada."
                          : "Los protagonistas de cada jornada."}
                  </p>
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
                  <h2>{team!.name}</h2>
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
                              <h3>{next.home}</h3>
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
                              <h3>{next.away}</h3>
                              <small>
                                {!ours(next, team!)
                                  ? "TU EQUIPO · VISITANTE"
                                  : "VISITANTE"}
                              </small>
                            </div>
                          </div>
                          <div className="next-venue">
                            <MapPin size={16} />
                            <span>{next.venue || "Campo por confirmar"}</span>
                          </div>
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
                      {position ? (
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
                            <MatchRow key={m.id} match={m} team={team!} />
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
                    <a
                      className="secondary"
                      href={`/api/teams/${team!.id}/calendar.ics`}
                      download
                    >
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
                    <MatchRow key={m.id} match={m} team={team!} />
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
                    suscripción.
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
                        <article
                          className="player-card"
                          key={`${player.name}-${i}`}
                        >
                          <div className="player-avatar">
                            <Users size={24} />
                            {player.number && <span>{player.number}</span>}
                          </div>
                          <div>
                            <h3>{player.name}</h3>
                            <p>{player.role || "Jugador/a"}</p>
                          </div>
                        </article>
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
      {picker && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && data) setPicker(false);
          }}
        >
          <section
            className="picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="picker-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && data) setPicker(false);
              if (e.key === "Tab") {
                const controls = [
                  ...e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input, a[href]",
                  ),
                ];
                const first = controls[0],
                  last = controls.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="modal-top">
              <span className="modal-symbol">
                <Shield size={24} />
              </span>
              {data && (
                <button
                  className="icon-button"
                  aria-label="Cerrar selección"
                  onClick={() => setPicker(false)}
                >
                  <X size={21} />
                </button>
              )}
            </div>
            <div className="eyebrow">AQUÍ EMPIEZA TU TEMPORADA</div>
            <h2 id="picker-title">
              ¿A quién animamos<span>?</span>
            </h2>
            <p>
              Elige un equipo de la Federación de Fútbol de Madrid. Lo
              recordaremos para la próxima vez.
            </p>
            <form onSubmit={submitTeam}>
              <label htmlFor="team-search">
                Nombre, enlace de la ficha o identificador
              </label>
              <div className="search-field">
                <Search size={18} />
                <input
                  id="team-search"
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Busca tu equipo o pega su enlace…"
                  autoComplete="off"
                  maxLength={250}
                />
                {searching && <LoaderCircle size={17} className="spin" />}
              </div>
              {searchError && (
                <p className="search-error" role="status">
                  {searchError}
                </p>
              )}
              <div className="search-results">
                {found.map((t) => (
                  <button type="button" key={t.id} onClick={() => choose(t.id)}>
                    <Crest name={t.name} />
                    <span>
                      {t.name}
                      {t.category && <small>{t.category}</small>}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
              {searchMore && (
                <p className="search-more">
                  Hay más resultados. Escribe un nombre de club más concreto.
                </p>
              )}
              <button className="primary" disabled={!query.trim() || loading}>
                {loading ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
                Seguir equipo
              </button>
            </form>
            {error && (
              <div className="picker-error" role="alert">
                {error}
              </div>
            )}
            {saved.teams.length > 0 && (
              <div className="saved-teams">
                <h3>Tus equipos recientes</h3>
                {saved.teams.map((t) => (
                  <div key={t.id}>
                    <button onClick={() => choose(t.id)}>
                      <Crest name={t.name} />
                      <span>
                        {t.name}
                        {t.category && <small>{t.category}</small>}
                      </span>
                      {selected === t.id ? (
                        <Check size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Olvidar ${t.name}`}
                      onClick={() => {
                        setSaved((old) => ({
                          ...old,
                          teams: old.teams.filter((x) => x.id !== t.id),
                        }));
                        setToast("Equipo eliminado de recientes");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="picker-hint">
              <Info size={16} />
              <p>
                Si no lo encuentras, abre su ficha en{" "}
                <a href="https://www.rffm.es" target="_blank" rel="noreferrer">
                  rffm.es <ExternalLink size={11} />
                </a>{" "}
                y pega aquí la dirección. Puedes cambiar de equipo o categoría
                cuando quieras.
              </p>
            </div>
            <button className="demo-link" onClick={() => choose("demo")}>
              Echar un vistazo con un equipo de ejemplo <ArrowRight size={14} />
            </button>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
