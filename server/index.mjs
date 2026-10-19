import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Federation } from "./provider.mjs";
import { SnapshotCache } from "./cache.mjs";
import { demoSnapshot } from "./demo.mjs";
import { makeCalendar } from "./calendar.mjs";

export function createApp({
  directory = process.env.DATA_DIR || path.resolve("data"),
  provider,
  clock,
} = {}) {
  const federation = provider || new Federation({ directory });
  const cache = new SnapshotCache({
    directory,
    loader: (id) => federation.snapshot(id),
    clock,
  });
  const app = express();
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
    res.json({ status: "ok", version: "0.1.0" }),
  );
  const requests = new Map();
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const key = req.socket.remoteAddress || "local",
      now = Date.now();
    const recent = (requests.get(key) || []).filter((t) => now - t < 60_000);
    if (recent.length >= 90)
      return res
        .status(429)
        .set("Retry-After", "60")
        .json({
          error: "Demasiadas consultas. Espera un minuto antes de continuar.",
        });
    recent.push(now);
    requests.set(key, recent);
    if (requests.size > 1000)
      for (const [ip, times] of requests)
        if (now - times.at(-1) > 60_000) requests.delete(ip);
    next();
  });
  app.get("/api/search", async (req, res, next) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 3 || q.length > 100 || /[\x00-\x1f]/.test(q))
      return res
        .status(400)
        .json({
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
  app.get("/api/teams/:id/calendar.ics", async (req, res, next) => {
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
  app.get("/api/teams/:id", async (req, res, next) => {
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
  app.get("/", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  app.use((_req, res) =>
    res.status(404).type("text/plain").send("No encontrado."),
  );
  app.use((err, _req, res, _next) => {
    const status =
      Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
        ? err.status
        : 500;
    if (status === 500) console.error("Error interno:", err.message);
    res
      .status(status)
      .json({
        error:
          status === 500
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
  server.requestTimeout = 120_000;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10_000).unref();
    });
}
