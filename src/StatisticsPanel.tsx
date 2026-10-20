import { useEffect, useState } from "react";
import { BarChart3, LoaderCircle, RefreshCw } from "lucide-react";

type Count = { name: string; count: number };
type Data = {
  period: number;
  retentionDays: number;
  proxyConfigured: boolean;
  totals: { entries: number; views: number };
  daily: { date: string; entries: number; views: number }[];
  sections: Count[];
  devices: Count[];
  systems: Count[];
  models: Count[];
  locations: Count[];
};
const number = (value: number) => value.toLocaleString("es-ES");
const sectionNames: Record<string, string> = {
  overview: "Mi equipo",
  calendar: "Calendario",
  standings: "Clasificación",
  squad: "Plantilla",
};
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Madrid",
  });

function Breakdown({
  title,
  rows,
  total,
  note,
}: {
  title: string;
  rows: Count[];
  total: number;
  note?: string;
}) {
  const visible = rows.slice(0, 10);
  const remaining = rows.slice(10).reduce((sum, row) => sum + row.count, 0);
  if (remaining) visible.push({ name: "Resto", count: remaining });
  return (
    <section className="panel statistics-breakdown">
      <h3>{title}</h3>
      {note && <p className="statistics-help">{note}</p>}
      {rows.length ? (
        <ul>
          {visible.map((row) => (
            <li key={row.name}>
              <div>
                <span>{sectionNames[row.name] || row.name}</span>
                <b>{number(row.count)}</b>
              </div>
              <div className="statistics-track" aria-hidden="true">
                <span
                  style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
                />
              </div>
              <small>
                {total ? Math.round((row.count / total) * 100) : 0} %
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="statistics-help">Todavía no hay datos en este periodo.</p>
      )}
    </section>
  );
}

export default function StatisticsPanel() {
  const [period, setPeriod] = useState(30);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch(`/api/admin/statistics?days=${period}`, { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(
            value.error || "No se pueden cargar las estadísticas.",
          );
        return value as Data;
      })
      .then(setData)
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [period, refresh]);
  const peak = Math.max(1, ...(data?.daily.map((day) => day.entries) || []));
  return (
    <div className="statistics-panel">
      <section className="panel statistics-intro">
        <div className="section-header">
          <div>
            <div className="eyebrow">LA ACTIVIDAD DE LA WEB</div>
            <h2>Estadísticas de visitas</h2>
          </div>
          <BarChart3 size={22} />
        </div>
        <p>
          Una entrada cada vez que se abre la web. Las pantallas consultadas se
          cuentan por separado; las recargas cuentan como nuevas entradas.
        </p>
        <div className="statistics-controls">
          <label>
            Periodo de estadísticas
            <select
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
            >
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={14} />
            Actualizar estadísticas
          </button>
        </div>
      </section>
      {error ? (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="statistics-loading" role="status">
          <LoaderCircle className="spin" size={18} />
          Cargando estadísticas…
        </p>
      ) : (
        <>
          <div className="statistics-metrics">
            <div className="panel">
              <small>Entradas</small>
              <strong data-testid="statistics-entries">
                {number(data.totals.entries)}
              </strong>
              <span>En el periodo seleccionado</span>
            </div>
            <div className="panel">
              <small>Pantallas vistas</small>
              <strong data-testid="statistics-views">
                {number(data.totals.views)}
              </strong>
              <span>Incluye la pantalla de inicio</span>
            </div>
            <div className="panel">
              <small>Entradas hoy</small>
              <strong>{number(data.daily.at(-1)?.entries || 0)}</strong>
              <span>Según el día de Madrid</span>
            </div>
          </div>
          <section className="panel statistics-chart">
            <h3>Entradas por día</h3>
            {!data.totals.entries && (
              <p className="statistics-help">
                Las estadísticas comenzarán con las próximas visitas públicas.
                Tus sesiones de administración no se cuentan.
              </p>
            )}
            <svg
              viewBox={`0 0 ${data.daily.length * 10} 120`}
              role="img"
              aria-label="Gráfico de entradas por día"
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                y1="110"
                x2={data.daily.length * 10}
                y2="110"
                stroke="#dfe4d7"
              />
              {data.daily.map((day, index) => (
                <rect
                  key={day.date}
                  x={index * 10 + 2}
                  y={110 - (day.entries / peak) * 100}
                  width="6"
                  height={(day.entries / peak) * 100}
                  rx="1"
                  fill="#729747"
                >
                  <title>
                    {dateLabel(day.date)}: {number(day.entries)} entradas
                  </title>
                </rect>
              ))}
            </svg>
            <div className="statistics-chart-labels">
              <span>{dateLabel(data.daily[0].date)}</span>
              <span>{dateLabel(data.daily.at(-1)!.date)}</span>
            </div>
            <details>
              <summary>Ver datos diarios</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Entradas</th>
                      <th>Pantallas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.daily].reverse().map((day) => (
                      <tr key={day.date}>
                        <td>{dateLabel(day.date)}</td>
                        <td>{number(day.entries)}</td>
                        <td>{number(day.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="statistics-grid">
            <Breakdown
              title="Dispositivos"
              rows={data.devices}
              total={data.totals.entries}
            />
            <Breakdown
              title="Sistemas operativos"
              rows={data.systems}
              total={data.totals.entries}
            />
            <Breakdown
              title="Pantallas consultadas"
              rows={data.sections}
              total={data.totals.views}
            />
            <Breakdown
              title="Modelos comunicados"
              rows={data.models}
              total={data.totals.entries}
              note="Solo cuando el navegador lo comunica. Muchos móviles Android y los iPhone ocultan el modelo exacto; no intentamos obtenerlo por otros medios."
            />
            <Breakdown
              title="Ubicación aproximada"
              rows={data.locations}
              total={data.totals.entries}
              note="Estimación por IP, sin GPS. Las redes móviles, VPN y proxies pueden mostrar otra ciudad o impedir localizar la visita."
            />
          </div>
          <div className="statistics-notes">
            <p>
              Solo se guardan contadores diarios separados durante{" "}
              {data.retentionDays} días: sin IP, identificadores de visitante,
              historial individual ni cookies de analítica. No son personas
              únicas. Se excluyen las sesiones de administración, los robots
              reconocidos y las peticiones con DNT o Global Privacy Control.
            </p>
            {!data.proxyConfigured && (
              <p>
                Si accedes mediante un proxy, configura las direcciones de
                confianza para obtener la ubicación original.{" "}
                <a
                  href="https://github.com/kadyto/futboleros/blob/main/docs/despliegue.md#estadísticas-y-proxy-inverso"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver configuración del proxy
                </a>
                .
              </p>
            )}
            <p>
              <a
                href="https://db-ip.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                IP Geolocation by DB-IP
              </a>{" "}
              · Datos locales bajo CC BY 4.0.{" "}
              <a href="/privacidad">Información de privacidad</a>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
