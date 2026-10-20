import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Save,
  Search,
  Shield,
} from "lucide-react";
import type { Snapshot, Team } from "./types";
import "./admin.css";
import Brand from "./Brand";
import WeatherSettings from "./WeatherSettings";
import StatisticsPanel from "./StatisticsPanel";

type PublicTeam = Pick<Team, "id" | "name" | "category">;
type Config = { team: PublicTeam | null; updatedAt: string | null };
function extractId(query: string) {
  const value = query.trim();
  if (/^\d{1,12}$/.test(value)) return value;
  try {
    const url = new URL(value),
      match = url.pathname.match(/^\/fichaequipo\/(\d{1,12})\/?$/);
    if (
      url.protocol === "https:" &&
      ["www.rffm.es", "rffm.es"].includes(url.hostname) &&
      match
    )
      return match[1];
  } catch {
    /* Names are handled by search. */
  }
  return null;
}
export default function Admin() {
  const [initializing, setInitializing] = useState(true);
  const [available, setAvailable] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [panel, setPanel] = useState<"settings" | "statistics">("settings");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [config, setConfig] = useState<Config>({ team: null, updatedAt: null });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHint, setSearchHint] = useState("");
  const [candidate, setCandidate] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const previewRequest = useRef<AbortController | null>(null);
  async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Futboleros-Admin": "1",
        ...options.headers,
      },
    });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401 && url !== "/api/admin/login") {
        setAuthenticated(false);
        setCandidate(null);
        setConfig({ team: null, updatedAt: null });
      }
      throw new Error(value.error || "No se ha podido completar la operación.");
    }
    return value;
  }
  async function checkSession() {
    setInitializing(true);
    setError("");
    try {
      const session = await api<{ available: boolean; authenticated: boolean }>(
        "/api/admin/session",
      );
      setAvailable(session.available);
      setAuthenticated(session.authenticated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInitializing(false);
    }
  }
  useEffect(() => {
    void checkSession();
    return () => previewRequest.current?.abort();
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    const ctrl = new AbortController();
    api<Config>("/api/admin/config", { signal: ctrl.signal })
      .then(setConfig)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [authenticated]);
  useEffect(() => {
    setResults([]);
    setSearchHint("");
    if (!authenticated || query.trim().length < 3 || extractId(query)) {
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      api<{ teams: PublicTeam[]; more: boolean }>(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
        { signal: ctrl.signal },
      )
        .then((value) => {
          setResults(value.teams);
          setSearchHint(
            value.more
              ? "Hay más resultados. Concreta el nombre del club."
              : !value.teams.length
                ? "Sin resultados. Prueba con el nombre del club o pega el enlace de la ficha."
                : "",
          );
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSearchHint(e.message);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, authenticated]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setPanel("settings");
      setAuthenticated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/logout", { method: "POST", body: "{}" });
      setAuthenticated(false);
      setCandidate(null);
      setConfig({ team: null, updatedAt: null });
      setQuery("");
      setSuccess("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview(id: string) {
    previewRequest.current?.abort();
    const ctrl = new AbortController();
    previewRequest.current = ctrl;
    setBusy(true);
    setError("");
    setSuccess("");
    setCandidate(null);
    try {
      setCandidate(
        await api<Snapshot>(`/api/teams/${encodeURIComponent(id)}`, {
          signal: ctrl.signal,
        }),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }
  function choose(e: React.FormEvent) {
    e.preventDefault();
    const id = extractId(query);
    if (id) void preview(id);
    else if (results.length === 1) void preview(results[0].id);
    else
      setError(
        "Selecciona un resultado o pega el enlace completo de la ficha del equipo.",
      );
  }
  async function save() {
    if (!candidate) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      setConfig(
        await api<Config>("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify({ teamId: candidate.team.id }),
        }),
      );
      setSuccess(
        "Equipo guardado. Todas las visitas verán este equipo en la web pública.",
      );
      setCandidate(null);
      setQuery("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <Brand />
        <a className="secondary" href="/">
          <ArrowLeft size={15} />
          Ver web pública
        </a>
      </header>
      <main className="admin-main">
        <div className="admin-title">
          <div>
            <div className="eyebrow">EL EQUIPO, BIEN GUARDADO</div>
            <h1>
              Administración<span>.</span>
            </h1>
            <p>Un equipo para todos. Solo tú puedes cambiarlo.</p>
          </div>
          <span className="admin-private">
            <LockKeyhole size={14} />
            Acceso privado
          </span>
        </div>
        {error && (
          <div className="notice error-notice" role="alert">
            <Info size={18} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="notice admin-success" role="status">
            <Check size={18} />
            <span>{success}</span>
            <a href="/">
              Ver equipo <ArrowRight size={14} />
            </a>
          </div>
        )}
        {initializing ? (
          <div className="loading-state" role="status">
            <LoaderCircle className="spin" size={28} />
            <p>Comprobando sesión…</p>
          </div>
        ) : !authenticated ? (
          <section className="admin-login panel">
            <div className="modal-symbol">
              <LockKeyhole size={25} />
            </div>
            <h2>Tu rincón en la banda</h2>
            <p>
              Introduce la contraseña de administración para configurar el
              equipo que verá todo el mundo.
            </p>
            {available ? (
              <form onSubmit={login}>
                <label htmlFor="admin-password">
                  Contraseña de administración
                </label>
                <div className="search-field">
                  <LockKeyhole size={17} />
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    maxLength={1024}
                    required
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <button className="primary" disabled={busy || !password}>
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                  Entrar al panel
                </button>
              </form>
            ) : (
              <div className="admin-setup">
                <Info size={19} />
                <p>
                  El panel todavía no está habilitado. Define{" "}
                  <code>ADMIN_PASSWORD</code> con una contraseña de al menos 12
                  caracteres en las variables del stack de Dockhand y recrea el
                  contenedor. Después vuelve a esta página.
                </p>
                <button className="secondary" onClick={checkSession}>
                  Comprobar de nuevo
                </button>
              </div>
            )}
            <div className="admin-login-note">
              <Shield size={15} />
              <span>La web pública sigue disponible sin iniciar sesión.</span>
            </div>
          </section>
        ) : (
          <>
            <nav
              className="admin-tabs"
              aria-label="Secciones de administración"
            >
              <button
                className={panel === "settings" ? "active" : ""}
                aria-current={panel === "settings" ? "page" : undefined}
                onClick={() => setPanel("settings")}
              >
                Configuración
              </button>
              <button
                className={panel === "statistics" ? "active" : ""}
                aria-current={panel === "statistics" ? "page" : undefined}
                onClick={() => setPanel("statistics")}
              >
                Estadísticas
              </button>
              <button className="secondary" onClick={logout} disabled={busy}>
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </nav>
            {panel === "statistics" && <StatisticsPanel />}
            <div hidden={panel !== "settings"}>
              <section className="panel admin-current">
                <div className="section-header">
                  <div>
                    <div className="eyebrow">LO QUE VE TODO EL MUNDO</div>
                    <h2>Equipo público</h2>
                  </div>
                </div>
                <div className="admin-current-body">
                  <div className="admin-team-icon">
                    <Shield size={34} />
                  </div>
                  <div>
                    <h3>
                      {config.team?.name ||
                        "Todavía no hay un equipo configurado"}
                    </h3>
                    <p>
                      {config.team?.category ||
                        "Elige uno a continuación y pulsa Guardar equipo público."}
                    </p>
                    {config.updatedAt && (
                      <small>
                        Guardado el{" "}
                        {new Date(config.updatedAt).toLocaleString("es-ES")}
                      </small>
                    )}
                  </div>
                  {config.team && (
                    <span className="count-chip">
                      <Check size={12} />
                      Publicado
                    </span>
                  )}
                </div>
              </section>
              <section className="panel admin-editor">
                <div className="section-header">
                  <div>
                    <div className="eyebrow">PREPARA LA PRÓXIMA TEMPORADA</div>
                    <h2>
                      {config.team ? "Cambiar el equipo" : "Elegir el equipo"}
                    </h2>
                  </div>
                  <Shield size={21} />
                </div>
                <p className="admin-description">
                  Busca el club o pega el enlace de la ficha. Elegir un
                  resultado permite revisarlo antes de guardarlo; la web pública
                  seguirá mostrando el equipo actual.
                </p>
                <form onSubmit={choose}>
                  <label htmlFor="admin-team-search">
                    Nombre del club, enlace de la ficha o identificador
                  </label>
                  <div className="admin-search-line">
                    <div className="search-field">
                      <Search size={18} />
                      <input
                        id="admin-team-search"
                        value={query}
                        onChange={(e) => {
                          previewRequest.current?.abort();
                          setBusy(false);
                          setQuery(e.target.value);
                          setCandidate(null);
                          setSuccess("");
                        }}
                        placeholder="Busca el club o pega su enlace…"
                        autoComplete="off"
                        maxLength={250}
                        disabled={busy}
                      />
                      {searching && <LoaderCircle size={17} className="spin" />}
                    </div>
                    <button
                      className="secondary"
                      disabled={busy || !query.trim()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                      Revisar equipo
                    </button>
                  </div>
                </form>
                {searchHint && (
                  <p className="search-more" role="status">
                    {searchHint}
                  </p>
                )}
                <div className="search-results admin-results">
                  {results.map((t) => (
                    <button
                      key={t.id}
                      disabled={busy}
                      onClick={() => void preview(t.id)}
                    >
                      <Shield size={22} />
                      <span>
                        {t.name}
                        <small>{t.category}</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
                {candidate && (
                  <div className="admin-preview">
                    <div className="eyebrow">AÚN SIN GUARDAR</div>
                    <h3>{candidate.team.name}</h3>
                    <p>
                      {[
                        candidate.team.category,
                        candidate.team.group,
                        candidate.team.season,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="admin-preview-details">
                      <span>{candidate.matches.length} partidos</span>
                      <span>{candidate.squad.length} jugadores</span>
                      <span>
                        {candidate.standings.length} equipos en la liga
                      </span>
                    </div>
                    {candidate.warnings.length > 0 && (
                      <p className="search-more">
                        {candidate.warnings.join(" ")}
                      </p>
                    )}
                    {candidate.stale && (
                      <p className="search-more">
                        La federación no está disponible; la revisión usa la
                        última copia guardada.
                      </p>
                    )}
                    <button className="primary" disabled={busy} onClick={save}>
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <Save size={17} />
                      )}
                      Guardar equipo público
                    </button>
                  </div>
                )}
                <div className="picker-hint">
                  <Info size={16} />
                  <p>
                    Si no lo encuentras, abre su ficha en{" "}
                    <a
                      href="https://www.rffm.es"
                      target="_blank"
                      rel="noreferrer"
                    >
                      rffm.es <ExternalLink size={11} />
                    </a>{" "}
                    y pega aquí la dirección. Puedes usar este mismo panel
                    cuando cambie de categoría.
                  </p>
                </div>
              </section>
              {config.team && (
                <WeatherSettings
                  teamVersion={`${config.team.id}:${config.updatedAt}`}
                />
              )}
              <div className="admin-info">
                <LockKeyhole size={16} />
                <p>
                  La selección se guarda en el servidor. Las visitas públicas
                  pueden consultar la información y exportar el calendario, pero
                  no cambiar el equipo. La sesión dura 12 horas y se cierra si
                  se reinicia el servidor.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
