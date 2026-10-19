import { ExternalLink, Users } from "lucide-react";
import type { Player } from "./types";
import FederationLink from "./FederationLink";
import { playerProfileUrl } from "./federation-links";

export default function PlayerCard({ player }: { player: Player }) {
  const href = playerProfileUrl(player.sourceUrl);
  const content = (
    <>
      <div className="player-avatar">
        <Users size={24} />
        {player.number && <span>{player.number}</span>}
      </div>
      <div>
        <h3>
          {player.name}
          {href && <ExternalLink size={12} aria-hidden="true" />}
        </h3>
        <p>{player.role || "Jugador/a"}</p>
        {!href && (
          <p className="player-profile-unavailable">Ficha no disponible</p>
        )}
      </div>
    </>
  );
  return href ? (
    <FederationLink
      href={href}
      className="player-card player-profile-link"
      ariaLabel={player.name}
    >
      {content}
    </FederationLink>
  ) : (
    <article className="player-card">{content}</article>
  );
}
