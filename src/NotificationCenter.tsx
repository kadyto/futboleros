import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, ExternalLink, LoaderCircle, X } from "lucide-react";
import { matchReportUrl } from "./federation-links";

type CalendarEvent = {
  id: string;
  createdAt: string;
  type: "changed" | "added";
  match: {
    home: string;
    away: string;
    date: string | null;
    time: string | null;
  };
  changes: { field: string; label: string; before: string; after: string }[];
};
export type Announcement = {
  id: string;
  createdAt: string;
  type: "announcement";
  title: string;
  body: string;
};
type MatchEvent = {
  id: string;
  createdAt: string;
  type: "result" | "report";
  match: CalendarEvent["match"] & {
    id: string;
    homeScore: number;
    awayScore: number;
  };
};
export type NotificationFeed = {
  events: (CalendarEvent | Announcement | MatchEvent)[];
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  results: {
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    lastError: string | null;
  };
};
export const noticeDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Pendiente";
function readSeen(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function applicationKey(key: string) {
  const text = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}
async function pushRequest(
  url: string,
  subscription: PushSubscription,
  method = "POST",
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "X-Futboleros-Push": "1" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    const value = await response.json();
    throw new Error(value.error || "No se han podido configurar los avisos.");
  }
}

export default function NotificationCenter({
  teamId,
  onCalendar,
}: {
  teamId: string;
  onCalendar: (filter?: "all" | "played") => void;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const storageKey = `futboleros.notifications.read.${teamId}`;
  const [seen, setSeen] = useState(() => readSeen(storageKey));
  const dialog = useRef<HTMLDialogElement>(null);
  const supported =
    window.isSecureContext &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/notifications", { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              "No se pueden consultar los avisos en este momento.",
            );
          return response.json() as Promise<NotificationFeed>;
        })
        .then((value) => {
          setFeed(value);
          setFeedError("");
        })
        .catch((error) => {
          if (error.name !== "AbortError") setFeedError(error.message);
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [refresh, teamId]);
  useEffect(() => {
    if (!supported) return;
    let active = true;
    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return;
        await pushRequest("/api/push/subscriptions", subscription, "PATCH");
        if (active) setEnabled(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [supported]);
  useEffect(() => {
    if (!open) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    const latest =
      feed?.events.reduce(
        (date, event) => (event.createdAt > date ? event.createdAt : date),
        seen,
      ) || seen;
    if (latest !== seen) {
      setSeen(latest);
      try {
        localStorage.setItem(storageKey, latest);
      } catch {
        /* Read markers are optional. */
      }
    }
  }, [open, feed, seen, storageKey]);
  async function activate() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Ask while handling the click, before awaiting network or worker setup.
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          permission === "denied"
            ? "Los avisos están bloqueados. Puedes permitirlos desde los ajustes de este sitio en el navegador."
            : "No se han activado los avisos. Puedes intentarlo cuando quieras.",
        );
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const response = await fetch("/api/push/config");
      const config = await response.json();
      if (!response.ok) throw new Error(config.error);
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(config.publicKey),
        });
      await pushRequest("/api/push/subscriptions", subscription);
      setEnabled(true);
      setMessage(
        "Avisos activados en este dispositivo. Puedes enviar una prueba.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se han podido activar los avisos.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function subscriptionAction(action: "disable" | "test") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setEnabled(false);
        throw new Error(
          "La suscripción ha caducado. Activa los avisos de nuevo.",
        );
      }
      await pushRequest(
        action === "test" ? "/api/push/test" : "/api/push/subscriptions",
        subscription,
        action === "test" ? "POST" : "DELETE",
      );
      if (action === "disable") {
        await subscription.unsubscribe();
        setEnabled(false);
      }
      setMessage(
        action === "test"
          ? "Prueba enviada. Revisa las notificaciones del dispositivo."
          : "Avisos desactivados en este dispositivo.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se ha podido completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  const unread =
    feed?.events.filter((event) => event.createdAt > seen).length || 0;
  return (
    <>
      <button
        className="icon-button notification-bell"
        aria-label={
          unread
            ? `Avisos de partidos, ${unread} sin leer`
            : "Avisos de partidos"
        }
        title="Avisos de partidos"
        onClick={() => setOpen(true)}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="notification-count">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <dialog
          className="notification-dialog"
          ref={dialog}
          onCancel={() => setOpen(false)}
          aria-labelledby="notification-title"
        >
          <header>
            <div>
              <Bell size={20} />
              <h2 id="notification-title">Avisos de partidos</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar avisos"
              onClick={() => setOpen(false)}
            >
              <X size={19} />
            </button>
          </header>
          <div className="notification-content">
            <p>
              Revisamos el calendario cada 24 horas. Aquí verás los cambios de
              fecha, hora, campo y estado, además de nuevos partidos publicados
              y los avisos de la administración. Los resultados y las actas
              pendientes se comprueban cada hora de 08:00 a 23:00, hora de
              Madrid.
            </p>
            <section
              className="notification-preferences"
              aria-label="Notificaciones en este dispositivo"
            >
              <h3>
                {enabled
                  ? "Avisos activados en este dispositivo"
                  : "Recibe los avisos aunque cierres la web"}
              </h3>
              {ios && !installed ? (
                <p>
                  En iPhone o iPad, añade esta web a la pantalla de inicio desde
                  el menú Compartir y ábrela desde su icono para activar las
                  notificaciones. Requiere iOS o iPadOS 16.4 o posterior.
                </p>
              ) : !supported ? (
                <p>
                  Las notificaciones requieren HTTPS y un navegador compatible.
                  Puedes consultar siempre los cambios desde esta campana.
                </p>
              ) : (
                <div className="notification-actions">
                  {enabled ? (
                    <>
                      <button
                        className="secondary"
                        onClick={() => void subscriptionAction("test")}
                        disabled={busy}
                      >
                        Probar aviso
                      </button>
                      <button
                        className="secondary"
                        onClick={() => void subscriptionAction("disable")}
                        disabled={busy}
                      >
                        <BellOff size={14} />
                        Desactivar avisos
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => void activate()}
                      disabled={busy}
                    >
                      <Bell size={15} />
                      Activar avisos en este dispositivo
                    </button>
                  )}
                  {busy && <LoaderCircle className="spin" size={16} />}
                </div>
              )}
              <small>
                Es opcional y no hace falta iniciar sesión.{" "}
                <a href="/privacidad">
                  Privacidad <ExternalLink size={10} />
                </a>
              </small>
            </section>
            {(error || feedError) && (
              <p className="notice error-notice" role="alert">
                {error || feedError}
                <button
                  className="secondary"
                  onClick={() => {
                    setError("");
                    setFeedError("");
                    setRefresh((value) => value + 1);
                  }}
                >
                  Reintentar
                </button>
              </p>
            )}
            {message && (
              <p className="notification-message" role="status">
                {message}
              </p>
            )}
            {feed?.lastError && (
              <p className="notification-warning">{feed.lastError}</p>
            )}
            {feed?.results?.lastError && (
              <p className="notification-warning">{feed.results.lastError}</p>
            )}
            <p className="notification-checks">
              Última revisión: {noticeDate(feed?.lastCheckedAt || null)}
              <br />
              Próxima revisión: {noticeDate(feed?.nextCheckAt || null)}
              <br />
              Resultados y actas:{" "}
              {noticeDate(feed?.results?.lastCheckedAt || null)}
              <br />
              Próxima revisión horaria:{" "}
              {noticeDate(feed?.results?.nextCheckAt || null)}
            </p>
            {!feed ? (
              <p role="status">Consultando avisos…</p>
            ) : !feed.events.length ? (
              <div className="notification-empty">
                <Bell size={26} />
                <h3>Sin cambios registrados</h3>
                <p>
                  Los avisos aparecerán cuando cambie un partido. La primera
                  revisión establece la referencia y no envía avisos antiguos.
                </p>
              </div>
            ) : (
              <div className="notification-list">
                {feed.events.map((event) => (
                  <article key={event.id}>
                    <time dateTime={event.createdAt}>
                      {noticeDate(event.createdAt)}
                    </time>
                    <h3>
                      {event.type === "announcement"
                        ? event.title
                        : `${event.match.home} — ${event.match.away}`}
                    </h3>
                    {event.type === "announcement" ? (
                      <>
                        <small className="notification-announcement-label">
                          Aviso de la administración
                        </small>
                        <p className="notification-announcement-body">
                          {event.body}
                        </p>
                      </>
                    ) : event.type === "result" || event.type === "report" ? (
                      <>
                        <p>
                          {event.type === "report"
                            ? "Acta publicada"
                            : "Resultado publicado"}
                          : {event.match.homeScore}–{event.match.awayScore}.
                        </p>
                        {event.type === "report" &&
                          matchReportUrl(event.match.id) && (
                            <a
                              href={matchReportUrl(event.match.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Ver acta <ExternalLink size={12} />
                            </a>
                          )}
                      </>
                    ) : event.type === "added" ? (
                      <p>Nuevo partido publicado.</p>
                    ) : event.type === "changed" ? (
                      event.changes.map((change) => (
                        <p key={change.field}>
                          <b>{change.label}:</b> <del>{change.before}</del> →{" "}
                          <strong>{change.after}</strong>
                        </p>
                      ))
                    ) : null}
                    <button
                      className="notification-calendar"
                      onClick={() => {
                        onCalendar(
                          ["announcement", "result", "report"].includes(
                            event.type,
                          )
                            ? "played"
                            : "all",
                        );
                        setOpen(false);
                      }}
                    >
                      {["announcement", "result", "report"].includes(event.type)
                        ? "Ver resultados"
                        : "Ver calendario"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
