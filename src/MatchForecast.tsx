import type { Match, Standing } from "./types";
import { estimateMatch } from "./match-insights";

function percent(value: number) {
  return value === 0 ? "<1 %" : value === 100 ? ">99 %" : `${value} %`;
}

export default function MatchForecast({
  match,
  standings,
  stale,
}: {
  match: Match;
  standings: Standing[];
  stale: boolean;
}) {
  const forecast = estimateMatch(match, standings);
  return (
    <section
      className="match-forecast"
      aria-label="Estimación del próximo partido"
    >
      <div className="forecast-heading">
        <h4>Posibilidades del partido</h4>
        <span>Orientativas</span>
      </div>
      {forecast.available ? (
        <>
          <div className="forecast-outcomes">
            <div
              className="forecast-home"
              aria-label={`Victoria de ${match.home}: ${percent(forecast.home)}`}
            >
              <span>Gana local</span>
              <strong>{percent(forecast.home)}</strong>
              <small>{match.home}</small>
            </div>
            <div
              className="forecast-draw"
              aria-label={`Empate: ${percent(forecast.draw)}`}
            >
              <span>Empate</span>
              <strong>{percent(forecast.draw)}</strong>
            </div>
            <div
              className="forecast-away"
              aria-label={`Victoria de ${match.away}: ${percent(forecast.away)}`}
            >
              <span>Gana visitante</span>
              <strong>{percent(forecast.away)}</strong>
              <small>{match.away}</small>
            </div>
          </div>
          <div className="forecast-bar" aria-hidden="true">
            <span
              className="forecast-home"
              style={{ flexGrow: forecast.home }}
            />
            <span
              className="forecast-draw"
              style={{ flexGrow: forecast.draw }}
            />
            <span
              className="forecast-away"
              style={{ flexGrow: forecast.away }}
            />
          </div>
          {forecast.limited && (
            <p className="forecast-note">
              Pocos partidos disputados: estimación con mayor incertidumbre.
            </p>
          )}
          <details>
            <summary>Cómo se calcula</summary>
            <p>
              Compara la posición actual, los puntos por partido y los goles a
              favor y en contra de ambos equipos, con la media goleadora de la
              liga. Local: {forecast.homePlayed} partidos; visitante:{" "}
              {forecast.awayPlayed}. Es una estimación estadística sin validar,
              no garantiza el resultado ni tiene en cuenta bajas o cambios de
              plantilla.
              {stale &&
                " Usa la última clasificación guardada, pendiente de actualizar."}
            </p>
          </details>
        </>
      ) : (
        <p className="forecast-unavailable">
          <strong>Datos insuficientes.</strong> {forecast.reason}
        </p>
      )}
    </section>
  );
}
