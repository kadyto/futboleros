import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { weatherJson } from "./weather-http.mjs";

export const cleanVenue = (venue) =>
  typeof venue === "string"
    ? venue
        .replace(/\((?:HA|HN|TIERRA|HIERBA|F[ -]?(?:7|11))\)/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 250)
    : "";
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
const keyOf = (venue) => normalize(cleanVenue(venue));
const locationKey = (match) =>
  /^[1-9]\d{0,11}$/.test(match.venueId || "")
    ? `venue:${match.venueId}`
    : `match:${match.id}`;
const withinRegion = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= 39.7 &&
  latitude <= 41.3 &&
  longitude >= -4.7 &&
  longitude <= -2.9;
let queue = Promise.resolve(),
  lastRequest = 0;
async function geocodeJson(url) {
  const task = queue.then(async () => {
    const delay = 1100 - (Date.now() - lastRequest);
    if (delay > 0) await setTimeout(delay);
    lastRequest = Date.now();
    return weatherJson(url);
  });
  queue = task.catch(() => {});
  return task;
}

export class WeatherLocations {
  constructor({ directory, getJson = geocodeJson, clock = () => Date.now() }) {
    this.file = path.join(directory, "weather-locations.json");
    this.getJson = getJson;
    this.clock = clock;
    this.cache = new Map();
    this.pending = new Map();
    this.writes = Promise.resolve();
  }
  async readSaved() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return {};
      throw error;
    }
  }
  async saved(match) {
    const values = await this.readSaved();
    const value = values[locationKey(match)];
    return value && withinRegion(value.latitude, value.longitude)
      ? value
      : null;
  }
  async withMapLinks(matches) {
    const values = await this.readSaved();
    return matches.map((match) => {
      const venue = cleanVenue(match.venue);
      if (!venue) return { ...match, venueMapsUrl: undefined };
      const location = values[locationKey(match)];
      const url = new URL("https://www.google.com/maps/search/");
      url.search = new URLSearchParams({
        api: "1",
        query:
          location && withinRegion(location.latitude, location.longitude)
            ? `${location.latitude},${location.longitude}`
            : `${venue}, Comunidad de Madrid, España`,
      }).toString();
      return { ...match, venueMapsUrl: url.href };
    });
  }
  async candidates(venue) {
    const name = cleanVenue(venue),
      key = keyOf(venue);
    const specific = key
      .split(" ")
      .filter(
        (token) =>
          ![
            "CAMPO",
            "CAMPOS",
            "MUNICIPAL",
            "POLIDEPORTIVO",
            "DEPORTIVO",
            "ESTADIO",
            "FUTBOL",
            "DE",
            "DEL",
            "LA",
            "EL",
            "LOS",
            "LAS",
            "COMPLEJO",
            "CENTRO",
            "CIUDAD",
            "INSTALACIONES",
          ].includes(token),
      );
    if (!key || !specific.length) return [];
    const old = this.cache.get(key);
    if (old?.expires > this.clock()) return old.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const task = (async () => {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        q: name,
        format: "jsonv2",
        countrycodes: "es",
        limit: "5",
        viewbox: "-4.7,41.3,-2.9,39.7",
        bounded: "1",
      }).toString();
      const raw = await this.getJson(url);
      if (!Array.isArray(raw))
        throw new Error("Respuesta de ubicaciones no válida.");
      return raw
        .filter((item) =>
          [
            "sports_centre",
            "pitch",
            "stadium",
            "sports_hall",
            "recreation_ground",
          ].includes(item.type),
        )
        .filter((item) => withinRegion(Number(item.lat), Number(item.lon)))
        .filter((item) =>
          specific.every((token) =>
            normalize(`${item.name || ""} ${item.display_name || ""}`)
              .split(" ")
              .includes(token),
          ),
        )
        .map((item) => ({
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          name,
          label: String(item.display_name || item.name || name).slice(0, 400),
        }));
    })()
      .then((value) => {
        if (this.cache.size >= 128)
          this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, {
          value,
          expires:
            this.clock() + (value.length ? 24 * 60 * 60_000 : 5 * 60_000),
        });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
  async locate(match) {
    if (!cleanVenue(match.venue))
      return { reason: "El campo del partido está por confirmar." };
    const saved = await this.saved(match);
    if (saved) return saved;
    const candidates = await this.candidates(match.venue);
    if (
      candidates.length &&
      candidates.every(
        (value) =>
          Math.hypot(
            value.latitude - candidates[0].latitude,
            value.longitude - candidates[0].longitude,
          ) < 0.015,
      )
    )
      return candidates[0];
    return {
      reason: "La ubicación del campo necesita confirmación en Administración.",
    };
  }
  save(match, value) {
    const task = this.writes.then(() => this.writeLocation(match, value));
    this.writes = task.catch(() => {});
    return task;
  }
  async writeLocation(match, value) {
    const venue = match.venue;
    if (!keyOf(venue) || !withinRegion(value.latitude, value.longitude)) {
      const error = new Error(
        "Indica coordenadas válidas del campo en la Comunidad de Madrid o sus alrededores.",
      );
      error.status = 400;
      throw error;
    }
    let values = {};
    try {
      values = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error;
    }
    const saved = {
      name: cleanVenue(venue),
      latitude: value.latitude,
      longitude: value.longitude,
      label: cleanVenue(venue),
    };
    values[locationKey(match)] = saved;
    if (Object.keys(values).length > 250) {
      const error = new Error(
        "Se ha alcanzado el límite de ubicaciones guardadas.",
      );
      error.status = 400;
      throw error;
    }
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(values), { mode: 0o600 });
    await rename(temporary, this.file);
    return saved;
  }
}
