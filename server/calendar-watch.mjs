import path from "node:path";
import { randomUUID } from "node:crypto";
import { JsonFile } from "./json-file.mjs";

export const CHECK_INTERVAL = 24 * 60 * 60_000;
const RETRY_INTERVAL = 15 * 60_000;
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clean = (value) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 250)
    : null;
const same = (a, b) =>
  (clean(a) || "").toLocaleUpperCase("es") ===
  (clean(b) || "").toLocaleUpperCase("es");
const compact = (match) => ({
  id: String(match.id),
  round: match.round,
  home: clean(match.home),
  away: clean(match.away),
  homeId: match.homeId,
  awayId: match.awayId,
  date: match.date,
  time: match.time,
  venue: clean(match.venue),
  status: match.status,
  played:
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined,
});
const fixtureKey = (match) =>
  `${match.round}:${match.homeId || match.home?.toUpperCase()}:${match.awayId || match.away?.toUpperCase()}`;
const relevant = (match, today) =>
  !match.played && (!match.date || match.date >= today);
const initial = (teamId = null) => ({
  version: 1,
  teamId,
  season: null,
  baseline: null,
  events: [],
  outbox: [],
  lastAttemptAt: null,
  lastCheckedAt: null,
  nextCheckAt: null,
  lastError: null,
  lastPushError: null,
});
const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });

function announcementInput(input) {
  if (
    !input ||
    typeof input.id !== "string" ||
    typeof input.teamId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      input.id || "",
    ) ||
    !/^\d{1,12}$/.test(input.teamId || "") ||
    Object.keys(input).some(
      (key) => !["id", "teamId", "title", "body"].includes(key),
    )
  )
    throw failure("El aviso no es válido. Revisa el formulario.");
  if (typeof input.title !== "string" || typeof input.body !== "string")
    throw failure("Escribe el título y el mensaje del aviso.");
  const title = input.title.replace(/\s+/g, " ").trim();
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (
    !title ||
    title.length > 80 ||
    !body ||
    body.length > 500 ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(title + body)
  )
    throw failure(
      "El título admite entre 1 y 80 caracteres y el mensaje entre 1 y 500, sin caracteres de control.",
    );
  return { id: input.id, teamId: input.teamId, title, body };
}

function keepAnnouncements(state) {
  return {
    events: state.events.filter((event) => event.type === "announcement"),
    outbox: state.outbox.filter((job) => job.kind === "announcement"),
  };
}

function display(field, value) {
  if (!value) return "Por confirmar";
  if (field === "date") {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Europe/Madrid",
        })
      : value;
  }
  if (field === "status")
    return value === "postponed" ? "Aplazado o suspendido" : "Programado";
  return value;
}

export function calendarChanges(before, after, now = Date.now()) {
  const today = day.format(new Date(now));
  const previous = new Map(
    before
      .filter((match) => !["0", "-1"].includes(match.id))
      .map((match) => [match.id, match]),
  );
  const fixtures = new Map(before.map((match) => [fixtureKey(match), match]));
  const matched = new Set();
  const events = [];
  for (const match of after) {
    const old = previous.get(match.id) || fixtures.get(fixtureKey(match));
    if (old) matched.add(old);
    if (
      old?.played ||
      match.played ||
      !(relevant(match, today) || (old && relevant(old, today)))
    )
      continue;
    const changes = [];
    if (old) {
      for (const [field, label] of [
        ["date", "Fecha"],
        ["time", "Hora"],
        ["venue", "Campo"],
        ["home", "Equipo local"],
        ["away", "Equipo visitante"],
        ["round", "Jornada"],
      ]) {
        if (
          field === "round"
            ? old[field] !== match[field]
            : !same(old[field], match[field])
        )
          changes.push({
            field,
            label,
            before: display(field, String(old[field] ?? "")),
            after: display(field, String(match[field] ?? "")),
          });
      }
      if ((old.status === "postponed") !== (match.status === "postponed"))
        changes.push({
          field: "status",
          label: "Estado",
          before: display("status", old.status),
          after: display("status", match.status),
        });
    }
    if (!old || changes.length)
      events.push({
        id: randomUUID(),
        createdAt: new Date(now).toISOString(),
        type: old ? "changed" : "added",
        match,
        changes,
      });
  }
  // A temporarily missing fixture is retained, never interpreted as a cancellation.
  const missing = before.filter(
    (match) => !matched.has(match) && relevant(match, today),
  );
  return { events, baseline: [...after, ...missing].slice(0, 500) };
}

export function notificationPayload(events, id) {
  const first = events[0];
  const match = `${first.match.home} — ${first.match.away}`.slice(0, 180);
  const detail =
    first.type === "added"
      ? "Nuevo partido publicado"
      : first.changes
          .map(
            (change) => `${change.label}: ${change.before} → ${change.after}`,
          )
          .join(" · ");
  return {
    title:
      events.length === 1
        ? "Cambio en el calendario"
        : `${events.length} partidos con cambios`,
    body:
      `${match}. ${detail}`.slice(0, 420) +
      (events.length > 1 ? ` · Y ${events.length - 1} partido(s) más.` : ""),
    url: "/?view=calendar",
    tag: `calendar-${id}`,
  };
}

export class CalendarWatch {
  constructor({ directory, settings, load, push, clock = () => Date.now() }) {
    this.store = new JsonFile(
      path.join(directory, "calendar-watch.json"),
      initial(),
    );
    this.settings = settings;
    this.load = load;
    this.push = push;
    this.clock = clock;
    this.queue = Promise.resolve();
  }
  run(task) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
  async read() {
    const state = await this.store.read();
    if (
      state.version !== 1 ||
      !Array.isArray(state.events) ||
      !Array.isArray(state.outbox)
    )
      throw new Error("El estado del calendario no es válido.");
    return state;
  }
  snapshot(snapshot) {
    if (
      snapshot.stale ||
      !Array.isArray(snapshot.matches) ||
      snapshot.matches.length > 500 ||
      snapshot.warnings?.length ||
      snapshot.matches.some(
        (match) =>
          !match || !clean(match.home) || !clean(match.away) || !match.id,
      )
    )
      throw new Error(
        "No se ha recibido un calendario actualizado y completo.",
      );
    return snapshot.matches.map(compact);
  }
  setup(snapshot) {
    return this.run(async () => {
      if ((await this.settings.read()).team?.id !== snapshot.team.id) return;
      const state = await this.read();
      if (
        state.teamId === snapshot.team.id &&
        state.season === snapshot.team.season &&
        state.baseline !== null
      )
        return;
      const baseline = this.snapshot(snapshot);
      const now = this.clock();
      await this.store.write({
        ...initial(snapshot.team.id),
        ...(state.teamId === snapshot.team.id ? keepAnnouncements(state) : {}),
        season: snapshot.team.season,
        baseline,
        lastCheckedAt: new Date(now).toISOString(),
        nextCheckAt: new Date(now + CHECK_INTERVAL).toISOString(),
      });
    });
  }
  announce(input) {
    const message = announcementInput(input);
    const task = this.run(async () => {
      const config = await this.settings.read();
      if (!config.team)
        throw failure("Todavía no hay un equipo configurado.", 409);
      if (config.team.id !== message.teamId)
        throw failure(
          "Ha cambiado el equipo configurado. Recarga el panel antes de enviar el aviso.",
          409,
        );
      let state = await this.read();
      if (state.teamId !== config.team.id) state = initial(config.team.id);
      const previous = state.events.find((event) => event.id === message.id);
      if (previous) {
        if (
          previous.type !== "announcement" ||
          previous.title !== message.title ||
          previous.body !== message.body
        )
          throw failure(
            "El identificador ya corresponde a otro aviso. Crea un aviso nuevo.",
            409,
          );
        return {
          id: message.id,
          recipients: previous.recipientCount,
          duplicate: true,
        };
      }
      if (state.outbox.length >= 100)
        throw failure(
          "Hay demasiados avisos pendientes. Espera a que se entreguen antes de enviar otro.",
          503,
        );
      const targets = (await this.push.list()).map((sub) => sub.id);
      const now = this.clock();
      const createdAt = new Date(now).toISOString();
      if ((await this.settings.read()).team?.id !== config.team.id)
        throw failure(
          "Ha cambiado el equipo configurado. Recarga el panel antes de enviar el aviso.",
          409,
        );
      const event = {
        id: message.id,
        title: message.title,
        body: message.body,
        type: "announcement",
        createdAt,
        recipientCount: targets.length,
      };
      state.events = [event, ...state.events]
        .filter(
          (item) => now - Date.parse(item.createdAt) <= 90 * CHECK_INTERVAL,
        )
        .slice(0, 100);
      if (targets.length)
        state.outbox.push({
          id: message.id,
          teamId: config.team.id,
          kind: "announcement",
          createdAt,
          nextAttemptAt: now,
          targets,
          payload: {
            title: message.title,
            body: message.body,
            tag: `announcement-${message.id}`,
            url: "/?view=calendar&filter=played",
          },
        });
      await this.store.write(state);
      return { id: message.id, recipients: targets.length, duplicate: false };
    });
    void task
      .then(
        () => this.sendPending(),
        () => {},
      )
      .catch(() =>
        console.warn("No se ha podido procesar el envío de un aviso manual."),
      );
    return task;
  }
  sendPending() {
    return this.run(async () => {
      const config = await this.settings.read();
      const state = await this.read();
      if (state.teamId === config.team?.id) await this.deliver(state);
    });
  }
  check({ force = false } = {}) {
    if (this.pending) {
      if (!force || this.pending.force) return this.pending.task;
      return this.pending.task.then(() => this.check({ force }));
    }
    const task = this.run(() => this.perform(force)).finally(() => {
      this.pending = null;
    });
    this.pending = { task, force };
    return task;
  }
  async perform(force) {
    const config = await this.settings.read();
    if (!config.team) return;
    const now = this.clock();
    let state = await this.read();
    if (state.teamId !== config.team.id) state = initial(config.team.id);
    if (force || !state.nextCheckAt || now >= Date.parse(state.nextCheckAt)) {
      state.lastAttemptAt = new Date(now).toISOString();
      try {
        const snapshot = await this.load(config.team.id);
        const matches = this.snapshot(snapshot);
        if (state.baseline?.length && matches.length === 0)
          throw new Error("El calendario recibido está vacío.");
        if ((await this.settings.read()).team?.id !== config.team.id) return;
        const freshReference =
          state.baseline === null || state.season !== snapshot.team.season;
        const compared = freshReference
          ? { events: [], baseline: matches }
          : calendarChanges(state.baseline, matches, now);
        const targets = compared.events.length
          ? (await this.push.list()).map((sub) => sub.id)
          : [];
        if (freshReference) {
          Object.assign(state, keepAnnouncements(state));
        }
        state.baseline = compared.baseline;
        state.season = snapshot.team.season;
        state.events = [...compared.events, ...state.events]
          .filter(
            (event) => now - Date.parse(event.createdAt) <= 90 * CHECK_INTERVAL,
          )
          .slice(0, 100);
        if (compared.events.length) {
          if (targets.length) {
            const id = randomUUID();
            state.outbox.push({
              id,
              teamId: state.teamId,
              createdAt: new Date(now).toISOString(),
              nextAttemptAt: now,
              targets,
              payload: notificationPayload(compared.events, id),
            });
          }
        }
        state.lastCheckedAt = new Date(now).toISOString();
        state.nextCheckAt = new Date(now + CHECK_INTERVAL).toISOString();
        state.lastError = null;
      } catch {
        state.lastError =
          "No se ha podido comprobar un calendario actualizado y completo. Se reintentará en 15 minutos.";
        state.nextCheckAt = new Date(now + RETRY_INTERVAL).toISOString();
      }
      // Persist the baseline, history and pending deliveries together before sending.
      await this.store.write(state);
    }
    await this.deliver(state);
    return this.publicState(state);
  }
  async deliver(state) {
    if (!state.outbox.length && !state.lastPushError) return;
    const now = this.clock();
    state.outbox = state.outbox.filter(
      (job) => now - Date.parse(job.createdAt) < CHECK_INTERVAL,
    );
    for (const job of [...state.outbox]) {
      if (job.nextAttemptAt > now) continue;
      const subscriptions = new Map(
        (await this.push.list()).map((sub) => [sub.id, sub]),
      );
      job.targets = job.targets.filter((id) => subscriptions.has(id));
      const targets = [...job.targets];
      for (let index = 0; index < targets.length; index += 4) {
        if ((await this.settings.read()).team?.id !== state.teamId) {
          state.outbox = [];
          await this.store.write(state);
          return;
        }
        const batch = targets.slice(index, index + 4);
        const results = await Promise.all(
          batch.map(async (id) => ({
            id,
            result: await this.push.deliver(subscriptions.get(id), job.payload),
          })),
        );
        const completed = new Set(
          results
            .filter((value) => value.result !== "retry")
            .map((value) => value.id),
        );
        job.targets = job.targets.filter((id) => !completed.has(id));
        job.nextAttemptAt = now + 5 * 60_000;
        await this.store.write(state);
      }
      if (!job.targets.length)
        state.outbox = state.outbox.filter((item) => item.id !== job.id);
    }
    state.lastPushError = state.outbox.length
      ? "Hay avisos pendientes de entrega; se reintentarán automáticamente."
      : null;
    await this.store.write(state);
  }
  publicState(state) {
    return {
      events: state.events
        .filter(
          (event) =>
            this.clock() - Date.parse(event.createdAt) <= 90 * CHECK_INTERVAL,
        )
        .map((event) =>
          event.type === "announcement"
            ? {
                id: event.id,
                type: event.type,
                createdAt: event.createdAt,
                title: event.title,
                body: event.body,
              }
            : event,
        ),
      lastCheckedAt: state.lastCheckedAt,
      nextCheckAt: state.nextCheckAt,
      lastError: state.lastError,
    };
  }
  async feed() {
    const config = await this.settings.read();
    const state = await this.read();
    return this.publicState(
      state.teamId === config.team?.id ? state : initial(config.team?.id),
    );
  }
  async status() {
    const config = await this.settings.read();
    const state = await this.read();
    const current =
      state.teamId === config.team?.id ? state : initial(config.team?.id);
    const devices = await this.push.devices();
    const subscribed = new Set(devices.map((device) => device.id));
    return {
      ...this.publicState(current),
      lastAttemptAt: current.lastAttemptAt,
      lastPushError: current.lastPushError,
      subscriptions: devices.length,
      devices,
      pendingDeliveries: current.outbox.reduce(
        (sum, job) =>
          sum + job.targets.filter((id) => subscribed.has(id)).length,
        0,
      ),
      checking: Boolean(this.pending),
    };
  }
  start({ interval = 60_000 } = {}) {
    if (this.timer) return;
    const tick = () => {
      void this.check().catch(() =>
        console.warn("No se ha podido revisar el calendario automático."),
      );
    };
    this.timer = setInterval(tick, interval);
    this.timer.unref();
    this.first = setTimeout(tick, 0);
    this.first.unref();
  }
  stop() {
    clearInterval(this.timer);
    clearTimeout(this.first);
    this.timer = null;
    return this.queue;
  }
}
