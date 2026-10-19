export interface Team {
  id: string;
  name: string;
  category: string;
  group: string;
  season: string;
  venue?: string;
  sourceUrl: string;
}
export interface Match {
  id: string;
  round: number;
  home: string;
  away: string;
  homeId?: string;
  awayId?: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  venueId?: string;
  status: "scheduled" | "played" | "postponed" | "unknown";
}
export interface Standing {
  position: number;
  team: string;
  teamId?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  statisticsComplete?: boolean;
}
export interface Player {
  name: string;
  sourceUrl?: string;
  number?: string;
  role?: string;
}
export interface Snapshot {
  team: Team;
  matches: Match[];
  standings: Standing[];
  squad: Player[];
  updatedAt: string;
  stale: boolean;
  demo?: boolean;
  warnings: string[];
}

export type MatchWeather =
  | { available: false; reason: string }
  | {
      available: true;
      matchId: string;
      mode: "hourly" | "daily";
      forecastFor: string;
      temperature: number | null;
      temperatureMin: number | null;
      temperatureMax: number | null;
      rainProbability: number | null;
      location: string;
      updatedAt: string;
      stale: boolean;
    };
