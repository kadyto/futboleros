import type { Standing } from "./types";
import { hasPosition } from "./match-insights";

export default function TeamPosition({ standing }: { standing?: Standing }) {
  const label = hasPosition(standing)
    ? `${standing.position}.º actual`
    : "Sin posición";
  return (
    <span
      className={`team-position${hasPosition(standing) ? "" : " unavailable"}`}
      title={
        hasPosition(standing)
          ? "Posición actual en la clasificación"
          : "Posición actual no disponible"
      }
      aria-label={
        hasPosition(standing)
          ? `Posición actual: ${standing.position}.º`
          : "Posición actual no disponible"
      }
    >
      {label}
    </span>
  );
}
