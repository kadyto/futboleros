import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Federation } from "./provider.mjs";
import { SnapshotCache } from "./cache.mjs";
import { demoSnapshot } from "./demo.mjs";
import { makeCalendar } from "./calendar.mjs";
import { SiteSettings } from "./settings.mjs";
import { AdminAuth } from "./auth.mjs";
import { WeatherService } from "./weather.mjs";
import { WeatherLocations } from "./weather-locations.mjs";
import { Statistics, STATISTIC_VIEWS } from "./statistics.mjs";
import {
  deviceInfo,
  notificationDeviceInfo,
  visitorAddress,
  VisitorLocation,
} from "./visitor-info.mjs";
import { PushService } from "./push.mjs";
import { CalendarWatch } from "./calendar-watch.mjs";

export function createApp({
  directory = process.env.DATA_DIR || path.resolve("data"),
  provider,
  clock,
  adminPassword = process.env.ADMIN_PASSWORD,
  cookieSecure = process.env.COOKIE_SECURE || "auto",
  weather,
  weatherLocations,
  statistics,
  visitorLocation,
  analyticsTrustProxy = process.env.ANALYTICS_TRUST_PROXY || "",
  pushService,
} = {}) {
  const federation = provider || new Federation({ directory });
  const cache = new SnapshotCache({
    directory,
    loader: (id, options) => federation.snapshot(id, options),
    clock,
  });
  const settings = new SiteSettings(directory);
  const auth = new AdminAuth({ password: adminPassword, clock, cookieSecure });
  const push = pushService || new PushService({ directory, clock });
  const calendarWatch = new CalendarWatch({
    directory,
    settings,
    push,
    clock,
    load: (id) => cache.get(id, { force: true }),
  });
  const stats = statistics || new Statistics({ directory, clock });
  const ipLocation = visitorLocation || new VisitorLocation();
  const locations =
    weatherLocations || new WeatherLocations({ directory, clock });
  const weatherService =
    weather ||
    new WeatherService({ locate: (match) => locations.locate(match), clock });
  const app = express();
  app.locals.calendarWatch = calendarWatch;
  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    next();
  });
  app.get("/healthz", (_req, res) =>
    res.json({ status: "ok", version: "0.2.0" }),
  );
  const requests = new Map();
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const group = req.path.startsWith("/statistics/")
      ? "statistics"
      : /^(?:\/notifications|\/push)/.test(req.path)
        ? "notifications"
        : "api";
    const key = `${group}:${req.socket.remoteAddress || "local"}`,
      now = Date.now();
    const recent = (requests.get(key) || []).filter((t) => now - t < 60_000);
    if (recent.length >= 90)
      return res.status(429).set("Retry-After", "60").json({
        error: "Demasiadas consultas. Espera un minuto antes de continuar.",
      });
    recent.push(now);
    requests.set(key, recent);
    if (requests.size > 1000)
      for (const [ip, times] of requests)
        if (now - times.at(-1) > 60_000) requests.delete(ip);
    next();
  });
  app.use("/api/admin", express.json({ limit: "8kb" }));
  app.get("/api/notifications", async (_req, res, next) => {
    try {
      res.json(await calendarWatch.feed());
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/admin/notifications", auth.require, async (_req, res, next) => {
    try {
      res.json(await calendarWatch.status());
    } catch (error) {
      next(error);
    }
  });
  app.delete(
    "/api/admin/notifications/devices/:id",
    auth.require,
    auth.sameOrigin,
    async (req, res, next) => {
      try {
        if (!/^[a-f0-9-]{36}$/.test(req.params.id))
          return res.status(400).json({ error: "Dispositivo no válido." });
        if (!(await push.remove(req.params.id)))
          return res
            .status(404)
            .json({ error: "El dispositivo ya no está suscrito." });
        res.json(await calendarWatch.status());
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    "/api/admin/notifications/check",
    auth.require,
    auth.sameOrigin,
    async (_req, res, next) => {
      try {
        await calendarWatch.check({ force: true });
        res.json(await calendarWatch.status());
      } catch (error) {
        next(error);
      }
    },
  );
  app.get("/api/push/config", async (_req, res, next) => {
    try {
      if (!(await settings.read()).team)
        return res
          .status(404)
          .json({ error: "Todavía no hay un equipo configurado." });
      res.json({ publicKey: await push.publicKey() });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/push", express.json({ limit: "8kb" }));
  const pushOrigin = async (req, res, next) => {
    let foreign = req.headers["sec-fetch-site"] === "cross-site";
    try {
      if (req.headers.origin)
        foreign ||= new URL(req.headers.origin).host !== req.get("host");
      if (foreign || req.headers["x-futboleros-push"] !== "1")
        return res
          .status(403)
          .json({ error: "La petición no procede de esta web." });
      if (!(await settings.read()).team)
        return res
          .status(404)
          .json({ error: "Todavía no hay un equipo configurado." });
      next();
    } catch (error) {
      next(error);
    }
  };
  app.post("/api/push/subscriptions", pushOrigin, async (req, res, next) => {
    try {
      res.json(
        await push.subscribe(req.body, {
          device: notificationDeviceInfo(req.headers["user-agent"]),
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  app.patch("/api/push/subscriptions", pushOrigin, async (req, res, next) => {
    try {
      res.json(
        await push.subscribe(req.body, {
          existingOnly: true,
          device: notificationDeviceInfo(req.headers["user-agent"]),
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  app.delete("/api/push/subscriptions", pushOrigin, async (req, res, next) => {
    try {
      await push.unsubscribe(req.body);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/push/test", pushOrigin, async (req, res, next) => {
    try {
      await push.test(req.body);
      res.json({ sent: true });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/admin/statistics", auth.require, async (req, res, next) => {
    const period = req.query.days === undefined ? 30 : Number(req.query.days);
    if (![7, 30, 90].includes(period))
      return res
        .status(400)
        .json({ error: "Elige un periodo de 7, 30 o 90 días." });
    try {
      res.json({
        ...(await stats.summary(period)),
        proxyConfigured: Boolean(analyticsTrustProxy.trim()),
      });
    } catch (error) {
      next(error);
    }
  });
  app.post(
    "/api/statistics/view",
    express.json({ limit: "256b" }),
    async (req, res) => {
      let foreign = req.headers["sec-fetch-site"] === "cross-site";
      try {
        if (req.headers.origin)
          foreign ||= new URL(req.headers.origin).host !== req.get("host");
      } catch {
        foreign = true;
      }
      if (foreign || req.headers["x-futboleros-event"] !== "1")
        return res
          .status(403)
          .json({ error: "La petición no procede de esta web." });
      const body = req.body;
      if (
        !body ||
        !STATISTIC_VIEWS.includes(body.view) ||
        typeof body.entry !== "boolean" ||
        Object.keys(body).some((key) => !["view", "entry"].includes(key))
      )
        return res
          .status(400)
          .json({ error: "Evento de estadísticas no válido." });
      if (
        auth.authenticated(req) ||
        req.headers.dnt === "1" ||
        req.headers["sec-gpc"] === "1"
      )
        return res.sendStatus(204);
      const device = deviceInfo(req.headers["user-agent"]);
      if (!device) return res.sendStatus(204);
      try {
        const location = body.entry
          ? await ipLocation.lookup(visitorAddress(req, analyticsTrustProxy))
          : "No disponible";
        await stats.record({
          view: body.view,
          entry: body.entry,
          ...device,
          location,
        });
        res.sendStatus(204);
      } catch {
        // Do not log request headers, addresses or individual events.
        res.sendStatus(503);
      }
    },
  );
  app.get("/api/admin/session", (req, res) =>
    res.json({
      available: auth.available,
      authenticated: auth.authenticated(req),
    }),
  );
  app.post("/api/admin/login", auth.sameOrigin, async (req, res, next) => {
    try {
      await auth.login(req, res);
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/admin/logout", auth.sameOrigin, (req, res) =>
    auth.logout(req, res),
  );
  app.get("/api/admin/config", auth.require, async (_req, res, next) => {
    try {
      res.json(await settings.read());
    } catch (e) {
      next(e);
    }
  });
  app.put(
    "/api/admin/config",
    auth.require,
    auth.sameOrigin,
    async (req, res, next) => {
      const id = req.body?.teamId;
      if (typeof id !== "string" || !/^\d{1,12}$/.test(id))
        return res
          .status(400)
          .json({ error: "Elige un equipo real antes de guardar." });
      try {
        const snapshot = await getSnapshot(id);
        const config = await settings.save(snapshot.team);
        await calendarWatch.setup(snapshot).catch(() => {});
        res.json(config);
      } catch (e) {
        next(e);
      }
    },
  );
  app.get("/api/team", async (_req, res, next) => {
    try {
      const config = await settings.read();
      if (!config.team) return res.json(null);
      const snapshot = await getSnapshot(config.team.id);
      res.json({
        ...snapshot,
        matches: await locations.withMapLinks(snapshot.matches),
      });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/weather", async (req, res, next) => {
    try {
      const config = await settings.read();
      if (!config.team)
        return res
          .status(404)
          .json({ error: "Todavía no hay un equipo configurado." });
      const id = typeof req.query.matchId === "string" ? req.query.matchId : "";
      const snapshot = await getSnapshot(config.team.id);
      const match = snapshot.matches.find((match) => match.id === id);
      if (!match)
        return res
          .status(404)
          .json({ error: "Partido no disponible para el equipo configurado." });
      res.json(await weatherService.forMatch(match));
    } catch (error) {
      next(error);
    }
  });
  async function nextWeatherMatch() {
    const config = await settings.read();
    if (!config.team) return null;
    const snapshot = await getSnapshot(config.team.id);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(clock ? clock() : Date.now()));
    return (
      snapshot.matches
        .filter(
          (match) =>
            match.status === "scheduled" &&
            match.homeScore === null &&
            match.awayScore === null &&
            (!match.date || match.date >= today),
        )
        .sort(
          (a, b) =>
            (a.date || "9999").localeCompare(b.date || "9999") ||
            a.round - b.round,
        )[0] || null
    );
  }
  app.get(
    "/api/admin/weather-location",
    auth.require,
    async (_req, res, next) => {
      try {
        const match = await nextWeatherMatch();
        if (!match)
          return res.json({ match: null, saved: null, candidates: [] });
        const saved = await locations.saved(match);
        const candidates = await locations
          .candidates(match.venue)
          .catch(() => []);
        res.json({
          match: { id: match.id, venue: match.venue, venueId: match.venueId },
          saved,
          candidates,
        });
      } catch (error) {
        next(error);
      }
    },
  );
  app.put(
    "/api/admin/weather-location",
    auth.require,
    auth.sameOrigin,
    async (req, res, next) => {
      try {
        const match = await nextWeatherMatch();
        if (
          !match ||
          match.id !== req.body?.matchId ||
          match.venue !== req.body?.venue ||
          match.venueId !== req.body?.venueId
        )
          return res.status(409).json({
            error: "El próximo partido ha cambiado. Recarga el panel.",
          });
        const saved = await locations.save(match, req.body);
        weatherService.invalidate?.();
        res.json({ saved });
      } catch (error) {
        next(error);
      }
    },
  );
  app.get("/api/calendar.ics", async (_req, res, next) => {
    try {
      const config = await settings.read();
      if (!config.team)
        return res
          .status(404)
          .json({ error: "Todavía no hay un equipo configurado." });
      res
        .set({
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="futboleros.ics"',
        })
        .send(makeCalendar(await getSnapshot(config.team.id)));
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/search", auth.require, async (req, res, next) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 3 || q.length > 100 || /[\x00-\x1f]/.test(q))
      return res.status(400).json({
        error: "Escribe entre 3 y 100 caracteres para buscar tu club.",
      });
    try {
      res.json(await federation.search(q));
    } catch (e) {
      next(e);
    }
  });
  async function getSnapshot(id) {
    if (id === "demo") return demoSnapshot();
    if (!/^\d{1,12}$/.test(id)) {
      const e = new Error("Identificador de equipo no válido.");
      e.status = 400;
      throw e;
    }
    return cache.get(id);
  }
  async function allowTeam(req, res, next) {
    if (auth.authenticated(req)) return next();
    try {
      const config = await settings.read();
      if (config.team?.id !== req.params.id)
        return res.status(403).json({
          error:
            "La parte pública solo permite consultar el equipo configurado.",
        });
      next();
    } catch (e) {
      next(e);
    }
  }
  app.get("/api/teams/:id/calendar.ics", allowTeam, async (req, res, next) => {
    try {
      const data = await getSnapshot(req.params.id);
      res
        .set({
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="futboleros-${req.params.id}.ics"`,
        })
        .send(makeCalendar(data));
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/teams/:id", allowTeam, async (req, res, next) => {
    try {
      res.json(await getSnapshot(req.params.id));
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Recurso no encontrado." }),
  );
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  app.use(
    express.static(dist, {
      etag: true,
      setHeaders(res, file) {
        res.setHeader(
          "Cache-Control",
          file.includes(`${path.sep}assets${path.sep}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );
  app.get(
    ["/", "/admin", "/admin/", "/privacidad", "/privacidad/"],
    (_req, res) => res.sendFile(path.join(dist, "index.html")),
  );
  app.use((_req, res) =>
    res.status(404).type("text/plain").send("No encontrado."),
  );
  app.use((err, _req, res, _next) => {
    const status =
      Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
        ? err.status
        : 500;
    if (status === 500) console.error("Error interno:", err.message);
    res.status(status).json({
      error:
        err.type === "entity.parse.failed"
          ? "El contenido de la petición no es válido."
          : status === 500
            ? "Ha ocurrido un error al consultar los datos. Vuelve a intentarlo."
            : err.message,
    });
  });
  return app;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  const port = Number(process.env.PORT || 8000);
  const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
    console.log(`Futboleros iniciado en el puerto ${port}`),
  );
  app.locals.calendarWatch.start();
  server.requestTimeout = 120_000;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      const stopped = app.locals.calendarWatch.stop();
      server.close(() => {
        void stopped.finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    });
}
