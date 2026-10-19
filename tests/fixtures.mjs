export const rawTeam = {
  codigo_equipo: "1001",
  codigo_categoria: "501",
  nombre_equipo: "C.D. Olivares A",
  categoria: "ALEVIN F-7",
  campo: "Campo Municipal",
  jugadores_equipo: [
    {
      nombre: "Jugador de ejemplo",
      cod_jugador: "private-id",
      fecha_nacimiento: "private-date",
    },
  ],
  telefonos: "not-for-export",
  email_correspondencia: "not-for-export",
  domicilio_correspondencia: "not-for-export",
};
export const rawCalendar = {
  rounds: [
    {
      jornada: "1 (17-10-2026)",
      equipos: [
        {
          codacta: "3001",
          codigo_equipo_local: "1001",
          codigo_equipo_visitante: "1002",
          equipo_local: "C.D. Olivares A",
          equipo_visitante: "C.D. Ejemplo B",
          goles_casa: "0",
          goles_visitante: "0",
          fecha: "17-10-2026",
          hora: "10:30",
          campo: "Campo Municipal",
        },
      ],
    },
    {
      jornada: "2 (24-10-2026)",
      equipos: [
        {
          codacta: "3002",
          codigo_equipo_local: "1002",
          codigo_equipo_visitante: "1001",
          equipo_local: "C.D. Ejemplo B",
          equipo_visitante: "C.D. Olivares A",
          goles_casa: "",
          goles_visitante: "",
          fecha: "24-10-2026",
          hora: "",
          campo: "",
        },
      ],
    },
    {
      jornada: "3",
      equipos: [
        {
          codacta: "3003",
          codigo_equipo_local: "1001",
          codigo_equipo_visitante: "-1",
          equipo_local: "C.D. Olivares A",
          equipo_visitante: "DESCANSA",
          goles_casa: "",
          goles_visitante: "",
          fecha: "",
          hora: "",
          campo: "",
        },
      ],
    },
    {
      jornada: "4",
      equipos: [
        {
          codacta: "3004",
          codigo_equipo_local: "1002",
          codigo_equipo_visitante: "1003",
          equipo_local: "C.D. Ejemplo B",
          equipo_visitante: "C.D. Ejemplo C",
          goles_casa: "2",
          goles_visitante: "1",
          fecha: "31-10-2026",
          hora: "13:00",
          campo: "",
        },
      ],
    },
  ],
};
export const rawStandings = {
  clasificacion: [
    {
      posicion: "1",
      codequipo: "1001",
      nombre: "C.D. Olivares A",
      jugados: "1",
      ganados: "0",
      empatados: "1",
      perdidos: "0",
      goles_a_favor: "0",
      goles_en_contra: "0",
      puntos: "1",
    },
  ],
};
export function page(props) {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script></html>`;
}
