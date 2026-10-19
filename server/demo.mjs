// Deliberately fictional data. Never used as fallback for a real team.
export function demoSnapshot(now = new Date()) {
  const names = [
    "C.D. Olivares A",
    "Atlético del Parque",
    "Unión Deportiva Sierra",
    "E.F. Los Almendros",
    "C.D. Las Encinas",
    "Deportivo Norte",
    "Escuela Río Verde",
    "A.D. El Pinar",
  ];
  const team = {
    id: "demo",
    name: names[0],
    category: "Primera Alevín · Fútbol 7",
    group: "Grupo 4",
    season: "2026 / 2027",
    venue: "Campo Municipal Los Olivos",
    sourceUrl: "",
  };
  const day = new Date(now);
  day.setUTCDate(day.getUTCDate() + ((6 - day.getUTCDay() + 7) % 7 || 7));
  const matches = Array.from({ length: 14 }, (_, i) => {
    const round = i + 1,
      played = i < 5;
    const date = new Date(day);
    date.setUTCDate(date.getUTCDate() + (i - 5) * 7);
    const home = i % 2 === 0,
      rival = names[1 + (i % 7)];
    return {
      id: `demo-${round}`,
      round,
      home: home ? team.name : rival,
      away: home ? rival : team.name,
      homeId: home ? "demo" : `example-${1 + (i % 7)}`,
      awayId: home ? `example-${1 + (i % 7)}` : "demo",
      homeScore: played ? [2, 1, 4, 2, 3][i] : null,
      awayScore: played ? [0, 3, 1, 2, 1][i] : null,
      date: date.toISOString().slice(0, 10),
      time: i === 8 ? null : ["10:30", "11:45", "12:00"][i % 3],
      venue: home ? team.venue : "Polideportivo Municipal",
      status: played ? "played" : "scheduled",
    };
  });
  const order = [1, 2, 0, 3, 4, 5, 6, 7];
  const standings = order.map((n, i) => ({
    position: i + 1,
    team: names[n],
    teamId: n === 0 ? "demo" : `example-${n}`,
    played: 5,
    won: [5, 4, 4, 2, 2, 1, 0, 0][i],
    drawn: [0, 1, 1, 1, 0, 1, 1, 1][i],
    lost: [0, 0, 0, 2, 3, 3, 4, 4][i],
    goalsFor: [25, 21, 18, 12, 10, 7, 5, 4][i],
    goalsAgainst: [5, 6, 9, 14, 16, 18, 17, 17][i],
    points: [15, 13, 13, 7, 6, 4, 1, 1][i],
    statisticsComplete: true,
  }));
  const squad = Array.from({ length: 12 }, (_, i) => ({
    name: `Jugador de ejemplo ${i + 1}`,
    number: String(i + 1),
    role: i < 2 ? "Portería" : "Jugador/a",
  }));
  return {
    team,
    matches,
    standings,
    squad,
    updatedAt: now.toISOString(),
    stale: false,
    demo: true,
    warnings: [],
  };
}
