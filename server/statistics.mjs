import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const STATISTIC_VIEWS = ["overview", "calendar", "standings", "squad"];
const RETENTION_DAYS = 90;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayBefore = (date, offset) =>
  new Date(Date.parse(`${date}T12:00:00Z`) - offset * 86400_000)
    .toISOString()
    .slice(0, 10);
const emptyDay = () => ({
  entries: 0,
  views: 0,
  sections: {},
  devices: {},
  systems: {},
  models: {},
  locations: {},
});
function trim(data, today) {
  const first = dayBefore(today, RETENTION_DAYS - 1);
  let changed = false;
  for (const date of Object.keys(data.days))
    if (date < first || date > today) {
      delete data.days[date];
      changed = true;
    }
  return changed;
}
function increment(values, name) {
  const key =
    Object.hasOwn(values, name) || Object.keys(values).length < 100
      ? name
      : "Otros";
  Object.defineProperty(values, key, {
    value: (Object.hasOwn(values, key) ? values[key] : 0) + 1,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}
function rows(days, field) {
  const totals = {};
  for (const day of days)
    for (const [key, count] of Object.entries(day[field])) {
      Object.defineProperty(totals, key, {
        value: (Object.hasOwn(totals, key) ? totals[key] : 0) + count,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

export class Statistics {
  constructor({ directory, clock = () => Date.now() }) {
    this.file = path.join(directory, "statistics.json");
    this.clock = clock;
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      const raw = await readFile(this.file, "utf8");
      const value = JSON.parse(raw);
      if (value.version !== 1 || !value.days || typeof value.days !== "object")
        throw new Error("Formato de estadísticas no válido.");
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, days: {} };
      throw error;
    }
  }
  async persist(data) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, this.file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  record({ view, entry, device, system, model, location }) {
    const today = dateFormatter.format(new Date(this.clock()));
    const task = this.queue.then(async () => {
      const data = await this.read();
      trim(data, today);
      const day = data.days[today] || (data.days[today] = emptyDay());
      day.views++;
      increment(day.sections, view);
      if (entry) {
        day.entries++;
        increment(day.devices, device);
        increment(day.systems, system);
        increment(day.models, model);
        increment(day.locations, location);
      }
      await this.persist(data);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async summary(period = 30) {
    const today = dateFormatter.format(new Date(this.clock()));
    const task = this.queue.then(async () => {
      const data = await this.read();
      if (trim(data, today)) await this.persist(data);
      return data;
    });
    this.queue = task.then(
      () => {},
      () => {},
    );
    const data = await task;
    const daily = Array.from({ length: period }, (_, index) => {
      const date = dayBefore(today, period - index - 1);
      const day = data.days[date] || emptyDay();
      return { date, entries: day.entries, views: day.views };
    });
    const days = daily.map(({ date }) => data.days[date] || emptyDay());
    return {
      period,
      retentionDays: RETENTION_DAYS,
      totals: {
        entries: daily.reduce((total, day) => total + day.entries, 0),
        views: daily.reduce((total, day) => total + day.views, 0),
      },
      daily,
      sections: rows(days, "sections"),
      devices: rows(days, "devices"),
      systems: rows(days, "systems"),
      models: rows(days, "models"),
      locations: rows(days, "locations"),
    };
  }
}
