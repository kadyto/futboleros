import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
const COOKIE = "futboleros_admin";
const LIFETIME = 12 * 60 * 60_000;
const digest = (token) => createHash("sha256").update(token).digest("hex");
function cookieToken(req) {
  const pairs = String(req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim());
  const value = pairs
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export class AdminAuth {
  constructor({ password, clock = () => Date.now(), cookieSecure = "auto" }) {
    this.available =
      typeof password === "string" &&
      password.length >= 12 &&
      Buffer.byteLength(password) <= 1024;
    this.clock = clock;
    this.cookieSecure = cookieSecure;
    this.sessions = new Map();
    this.attempts = new Map();
    this.globalAttempts = [];
    this.salt = randomBytes(16);
    this.passwordHash = this.available ? derive(password, this.salt, 32) : null;
  }
  authenticated(req) {
    if (!this.available) return false;
    const token = cookieToken(req);
    if (!token) return false;
    const key = digest(token),
      expires = this.sessions.get(key);
    if (!expires) return false;
    if (expires <= this.clock()) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }
  require = (req, res, next) => {
    if (!this.available)
      return res
        .status(503)
        .json({
          error:
            "El acceso de administración no está habilitado. Configura ADMIN_PASSWORD con al menos 12 caracteres en el servidor.",
        });
    if (!this.authenticated(req))
      return res
        .status(401)
        .json({ error: "Inicia sesión para administrar el equipo." });
    next();
  };
  sameOrigin = (req, res, next) => {
    let foreign = false;
    try {
      if (req.headers.origin)
        foreign = new URL(req.headers.origin).host !== req.get("host");
    } catch {
      foreign = true;
    }
    if (
      foreign ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      req.headers["x-futboleros-admin"] !== "1"
    )
      return res
        .status(403)
        .json({
          error: "La petición de administración no procede de esta web.",
        });
    next();
  };
  async login(req, res) {
    if (!this.available)
      return res
        .status(503)
        .json({
          error:
            "Configura ADMIN_PASSWORD con al menos 12 caracteres en el servidor para habilitar el panel.",
        });
    const now = this.clock(),
      ip = req.socket.remoteAddress || "local";
    for (const [key, times] of this.attempts)
      if (!times.some((t) => now - t < 15 * 60_000)) this.attempts.delete(key);
    for (const [key, expires] of this.sessions)
      if (expires <= now) this.sessions.delete(key);
    const recent = (this.attempts.get(ip) || []).filter(
      (t) => now - t < 15 * 60_000,
    );
    this.globalAttempts = this.globalAttempts.filter(
      (t) => now - t < 15 * 60_000,
    );
    if (recent.length >= 8 || this.globalAttempts.length >= 60)
      return res
        .status(429)
        .set("Retry-After", "900")
        .json({
          error:
            "Demasiados intentos. Espera 15 minutos para volver a intentarlo.",
        });
    recent.push(now);
    this.attempts.set(ip, recent);
    this.globalAttempts.push(now);
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      Buffer.byteLength(password) > 1024 ||
      !timingSafeEqual(
        await derive(password, this.salt, 32),
        await this.passwordHash,
      )
    )
      return res.status(401).json({ error: "Contraseña incorrecta." });
    this.attempts.delete(ip);
    // Each cookie is an opaque random token; only its hash is retained by the server.
    const token = randomBytes(32).toString("hex");
    if (this.sessions.size >= 1000)
      this.sessions.delete(this.sessions.keys().next().value);
    this.sessions.set(digest(token), now + LIFETIME);
    res
      .set("Set-Cookie", this.cookie(req, token, LIFETIME / 1000))
      .json({ authenticated: true });
  }
  logout(req, res) {
    const token = cookieToken(req);
    if (token) this.sessions.delete(digest(token));
    res
      .set("Set-Cookie", this.cookie(req, "", 0))
      .json({ authenticated: false });
  }
  cookie(req, token, age) {
    const secure =
      this.cookieSecure === "true" ||
      (this.cookieSecure !== "false" &&
        (req.secure ||
          String(req.headers["x-forwarded-proto"] || "")
            .split(",")[0]
            .trim() === "https"));
    return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`;
  }
}
