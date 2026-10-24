import { weatherJson } from "./weather-http.mjs";
import { phaseOf } from "./match-timing.mjs";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const unavailable = (reason) => ({ available: false, reason });

function targetFor(match, now) {
  if (
    match.status !== "scheduled" ||
    match.homeScore !== null ||
    match.awayScore !== null
  )
    return unavailable("No hay previsión para partidos jugados o aplazados.");
  if (!match.date || !/^\d{4}-\d{2}-\d{2}$/.test(match.date))
    return unavailable("La fecha del partido está por confirmar.");
  const date = Date.parse(`${match.date}T00:00:00Z`);
  if (
    !Number.isFinite(date) ||
    new Date(date).toISOString().slice(0, 10) !== match.date
  )
    return unavailable("La fecha del partido está por confirmar.");
  if (phaseOf(match, now) === "pending")
    return unavailable(
      "La hora prevista del partido ya ha pasado. El resultado está pendiente de publicación.",
    );
  const days = Math.round(
    (date - Date.parse(`${dayFormatter.format(new Date(now))}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0) return unavailable("No hay previsión para partidos pasados.");
  if (days >= 16)
    return unavailable(
      "La previsión estará disponible cuando el partido entre en los próximos 16 días.",
    );
  const timed =
    typeof match.time === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(match.time);
  // Round the local Madrid clock, independent of the server's time zone.
  const hour = timed
    ? new Date(Date.parse(`${match.date}T${match.time}:00Z`) + 30 * 60_000)
        .toISOString()
        .slice(0, 13) + ":00"
    : null;
  return { available: true, date: match.date, hour };
}

const temperature = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= -90 &&
  value <= 65
    ? value
    : null;
const probability = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100
    ? value
    : null;

function selectForecast(raw, target, match, location, now) {
  if (raw?.timezone !== "Europe/Madrid")
    throw new Error("Zona horaria meteorológica inesperada.");
  const mode = target.hour ? "hourly" : "daily";
  const series = raw[mode];
  const at = Array.isArray(series?.time)
    ? series.time.indexOf(target.hour || target.date)
    : -1;
  if (at < 0) return unavailable("Todavía no hay previsión para ese momento.");
  const units = raw[`${mode}_units`] || {};
  const temp =
    mode === "hourly" && units.temperature_2m === "°C"
      ? temperature(series.temperature_2m?.[at])
      : null;
  const min =
    mode === "daily" && units.temperature_2m_min === "°C"
      ? temperature(series.temperature_2m_min?.[at])
      : null;
  const max =
    mode === "daily" && units.temperature_2m_max === "°C"
      ? temperature(series.temperature_2m_max?.[at])
      : null;
  const rainKey =
    mode === "hourly"
      ? "precipitation_probability"
      : "precipitation_probability_max";
  const rain =
    units[rainKey] === "%" ? probability(series[rainKey]?.[at]) : null;
  if ([temp, min, max, rain].every((value) => value === null))
    return unavailable("Todavía no hay previsión para ese momento.");
  return {
    available: true,
    matchId: match.id,
    mode,
    forecastFor: target.hour || target.date,
    temperature: temp,
    temperatureMin: min,
    temperatureMax: max,
    rainProbability: rain,
    location: location.name || match.venue || "Campo del partido",
    updatedAt: new Date(now).toISOString(),
    stale: false,
  };
}

export class WeatherService {
  constructor({
    locate,
    getJson = weatherJson,
    clock = () => Date.now(),
    ttl = 30 * 60_000,
    retryDelay = 5 * 60_000,
  }) {
    this.locate = locate;
    this.getJson = getJson;
    this.clock = clock;
    this.ttl = ttl;
    this.retryDelay = retryDelay;
    this.cache = new Map();
    this.pending = new Map();
    this.version = 0;
  }
  invalidate() {
    this.version++;
    this.cache.clear();
  }
  async forMatch(match) {
    const target = targetFor(match, this.clock());
    if (!target.available) return target;
    const key = JSON.stringify([
      this.version,
      match.id,
      match.venueId,
      match.venue,
      match.date,
      match.time,
    ]);
    const old = this.cache.get(key);
    if (old && old.expires > this.clock()) return old.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const task = this.load(match, target, old)
      .then((value) => {
        if (this.cache.size >= 128)
          this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, {
          value,
          expires:
            this.clock() +
            (value.available && !value.stale ? this.ttl : this.retryDelay),
        });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
  async load(match, target, old) {
    try {
      const location = await this.locate(match);
      if (location?.reason) return unavailable(location.reason);
      if (
        !location ||
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude) ||
        Math.abs(location.latitude) > 90 ||
        Math.abs(location.longitude) > 180 ||
        (location.latitude === 0 && location.longitude === 0)
      )
        return unavailable("No se ha podido localizar el campo del partido.");
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: location.latitude.toFixed(4),
        longitude: location.longitude.toFixed(4),
        hourly: "temperature_2m,precipitation_probability",
        daily:
          "temperature_2m_min,temperature_2m_max,precipitation_probability_max",
        forecast_days: "16",
        timezone: "Europe/Madrid",
        temperature_unit: "celsius",
      }).toString();
      return selectForecast(
        await this.getJson(url),
        target,
        match,
        location,
        this.clock(),
      );
    } catch {
      if (
        old?.value.available &&
        this.clock() - Date.parse(old.value.updatedAt) < 6 * 60 * 60_000
      )
        return { ...old.value, stale: true };
      return unavailable(
        "La previsión meteorológica no está disponible en este momento.",
      );
    }
  }
}
