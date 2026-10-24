export interface TimedMatch {
  date?: string | null;
  time?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
}
export type MatchPhase = "played" | "pending" | "upcoming" | "postponed";
export function hasResult(match: TimedMatch): boolean;
export function phaseOf(match: TimedMatch, now?: number): MatchPhase;
