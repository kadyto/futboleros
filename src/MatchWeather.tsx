import { useEffect, useState } from "react";
import { CloudRain, LoaderCircle, Thermometer } from "lucide-react";
import type { Match, MatchWeather as Forecast } from "./types";

const number = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 1 });

export default function MatchWeather({
  match,
  refreshKey,
}: {
  match: Match;
  refreshKey: number;
}) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/weather?matchId=${encodeURIComponent(match.id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Forecast>;
      })
      .then(setForecast)
      .catch((error) => {
        if (error.name !== "AbortError")
          setForecast({
            available: false,
            reason:
              "La previsión meteorológica no está disponible en este momento.",
          });
      });
    return () => controller.abort();
  }, [match.id, match.date, match.time, match.venue, refreshKey]);
  return (
    <section
      className="match-weather"
      aria-label="Previsión meteorológica"
      aria-live="polite"
    >
      <h4>El tiempo para el partido</h4>
      {!forecast ? (
        <p role="status">
          <LoaderCircle size={14} className="spin" /> Consultando previsión…
        </p>
      ) : !forecast.available ? (
        <p>{forecast.reason}</p>
      ) : (
        <>
          <p className="weather-period">
            {forecast.mode === "hourly"
              ? `Previsión para las ${forecast.forecastFor.slice(11, 16)} h`
              : "Previsión del día · Hora del partido por confirmar"}
          </p>
          <div className="weather-values">
            <div>
              <Thermometer size={20} />
              <span>
                <small>Temperatura prevista</small>
                <strong>
                  {forecast.mode === "hourly"
                    ? forecast.temperature === null
                      ? "Sin datos"
                      : `${number(forecast.temperature)} °C`
                    : forecast.temperatureMin === null ||
                        forecast.temperatureMax === null
                      ? "Sin datos"
                      : `${number(forecast.temperatureMin)}–${number(forecast.temperatureMax)} °C`}
                </strong>
              </span>
            </div>
            <div>
              <CloudRain size={20} />
              <span>
                <small>Prob. de lluvia</small>
                <strong>
                  {forecast.rainProbability === null
                    ? "Sin datos"
                    : `${Math.round(forecast.rainProbability)} %`}
                </strong>
              </span>
            </div>
          </div>
          <p className="weather-updated">
            {forecast.stale ? "Última previsión guardada" : "Consultada"} a las{" "}
            {new Date(forecast.updatedAt).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Madrid",
            })}
            . Ubicación aproximada del campo.
          </p>
          <div
            className="weather-sources"
            title="Datos redondeados para su presentación"
          >
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo
            </a>
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC BY 4.0
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ubicación © OpenStreetMap
            </a>
          </div>
        </>
      )}
    </section>
  );
}
