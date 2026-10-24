import { useEffect, useState } from "react";
import {
  Bell,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { noticeDate, type NotificationFeed } from "./NotificationCenter";
import ManualNotification from "./ManualNotification";

type SubscribedDevice = {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  expirationTime: number | null;
  device: {
    device: string;
    system: string;
    browser: string;
    model: string;
  } | null;
};
function deviceName(subscription: SubscribedDevice) {
  const info = subscription.device;
  return info
    ? [info.device, info.system]
        .filter((value) => value !== "No disponible" && value !== "Otros")
        .join(" · ") || "Dispositivo sin identificar"
    : "Dispositivo sin identificar";
}
type Status = NotificationFeed & {
  devices: SubscribedDevice[];
  subscriptions: number;
  pendingDeliveries: number;
  lastPushError: string | null;
  checking: boolean;
};
export default function NotificationSettings({
  teamId,
  teamVersion,
}: {
  teamId: string;
  teamVersion: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [operation, setOperation] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const busy = Boolean(operation);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setError("");
    setMessage("");
    void fetch("/api/admin/notifications", { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value as Status;
      })
      .then(setStatus)
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [teamVersion]);
  async function update(
    action: "check" | "results" | "refresh" | "remove",
    id?: string,
  ) {
    setOperation(action);
    setError("");
    setMessage("");
    try {
      const path = "/api/admin/notifications";
      const checking = action === "check" || action === "results";
      const response = await fetch(
        action === "check"
          ? `${path}/check`
          : action === "results"
            ? `${path}/results/check`
            : action === "remove"
              ? `${path}/devices/${encodeURIComponent(id || "")}`
              : path,
        {
          method: checking ? "POST" : action === "remove" ? "DELETE" : "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Futboleros-Admin": "1",
          },
          ...(checking ? { body: "{}" } : {}),
        },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setStatus(value);
      setConfirming(null);
      if (action === "remove")
        setMessage("Dispositivo dado de baja. Ya no recibirá nuevos avisos.");
      else if (action === "refresh")
        setMessage("Lista de dispositivos actualizada.");
      else if (action === "results") {
        if (value.results && !value.results.lastError)
          setMessage(
            "Resultados y actas comprobados. Los avisos nuevos aparecen en la campana.",
          );
      } else if (!value.lastError)
        setMessage(
          "Calendario comprobado. Los cambios detectados aparecen en la campana de avisos.",
        );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setOperation("");
    }
  }
  return (
    <section className="panel admin-notifications">
      <div className="section-header">
        <h2>Avisos de cambios en partidos</h2>
        <Bell size={21} />
      </div>
      <div className="admin-notifications-body">
        <p>
          El servidor revisa el calendario cada 24 horas aunque nadie visite la
          web. Cada visitante puede activar las notificaciones en su propio
          dispositivo desde la campana de la web pública. Los resultados
          recientes y las actas pendientes se comprueban cada hora de 08:00 a
          23:00, hora de Madrid.
        </p>
        {status && (
          <dl className="notification-metrics">
            <div>
              <dt>Última revisión correcta</dt>
              <dd>{noticeDate(status.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>Próxima revisión</dt>
              <dd>{noticeDate(status.nextCheckAt)}</dd>
            </div>
            <div>
              <dt>Resultados y actas: última revisión</dt>
              <dd>{noticeDate(status.results?.lastCheckedAt || null)}</dd>
            </div>
            <div>
              <dt>Próxima revisión horaria</dt>
              <dd>{noticeDate(status.results?.nextCheckAt || null)}</dd>
            </div>
            <div>
              <dt>Dispositivos suscritos</dt>
              <dd>{status.subscriptions}</dd>
            </div>
            <div>
              <dt>Entregas pendientes</dt>
              <dd>{status.pendingDeliveries}</dd>
            </div>
          </dl>
        )}
        {(error ||
          status?.lastError ||
          status?.results?.lastError ||
          status?.lastPushError) && (
          <p className="notice error-notice" role="alert">
            {error ||
              status?.lastError ||
              status?.results?.lastError ||
              status?.lastPushError}
          </p>
        )}
        {message && (
          <p className="notification-message" role="status">
            {message}
          </p>
        )}
        <div className="notification-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void update("check")}
          >
            {operation === "check" ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Comprobar calendario ahora
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void update("results")}
          >
            {operation === "results" ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Comprobar resultados y actas ahora
          </button>
        </div>
        <ManualNotification
          key={teamVersion}
          teamId={teamId}
          recipients={status?.subscriptions || 0}
          announcements={
            status?.events.filter((event) => event.type === "announcement") ||
            []
          }
          disabled={busy || !status}
          onPublished={() => void update("refresh")}
        />
        <section
          className="notification-devices"
          aria-labelledby="notification-devices-title"
        >
          <div className="notification-devices-header">
            <h3 id="notification-devices-title">
              Dispositivos que reciben avisos
            </h3>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void update("refresh")}
            >
              <RefreshCw
                size={14}
                className={operation === "refresh" ? "spin" : undefined}
              />
              Actualizar lista
            </button>
          </div>
          {!status ? (
            <p role="status">Consultando dispositivos…</p>
          ) : !status.devices.length ? (
            <div className="notification-devices-empty">
              <Bell size={22} />
              <p>
                Todavía no hay dispositivos suscritos. Los que activen los
                avisos desde la campana aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="notification-device-list">
              {status.devices.map((subscription) => {
                const info = subscription.device;
                const Icon =
                  info?.device === "Móvil"
                    ? Smartphone
                    : info?.device === "Tablet"
                      ? Tablet
                      : Monitor;
                const details = [info?.browser, info?.model]
                  .filter((value) => value && value !== "No disponible")
                  .join(" · ");
                return (
                  <article
                    className="notification-device"
                    key={subscription.id}
                    aria-label={`Dispositivo ${subscription.id.slice(0, 8)}`}
                  >
                    <div className="notification-device-heading">
                      <span className="notification-device-icon">
                        <Icon size={20} />
                      </span>
                      <div>
                        <h4>{deviceName(subscription)}</h4>
                        <p>{details || "Detalles pendientes del navegador"}</p>
                        <small>Referencia {subscription.id.slice(0, 8)}</small>
                      </div>
                      <span className="notification-device-badge">
                        Suscrito
                      </span>
                    </div>
                    <dl className="notification-device-dates">
                      <div>
                        <dt>Alta</dt>
                        <dd>{noticeDate(subscription.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Última sincronización</dt>
                        <dd>
                          {subscription.lastSeenAt
                            ? noticeDate(subscription.lastSeenAt)
                            : "Sin datos todavía"}
                        </dd>
                      </div>
                    </dl>
                    {confirming === subscription.id ? (
                      <div
                        className="notification-device-confirm"
                        role="group"
                        aria-label={`Confirmar baja ${subscription.id.slice(0, 8)}`}
                      >
                        <p>
                          Dejará de recibir avisos. Podrá volver a activarlos
                          desde la campana de su dispositivo.
                        </p>
                        <div>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void update("remove", subscription.id)
                            }
                          >
                            {operation === "remove" && (
                              <LoaderCircle size={14} className="spin" />
                            )}
                            Confirmar baja
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => setConfirming(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="secondary notification-device-remove"
                        disabled={busy}
                        aria-label={`Dar de baja ${deviceName(subscription)}, ${subscription.id.slice(0, 8)}`}
                        onClick={() => setConfirming(subscription.id)}
                      >
                        <Trash2 size={14} />
                        Dar de baja
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <p className="notification-help">
            Cada entrada corresponde a una suscripción de un navegador. La
            última sincronización indica cuándo abrió la web o activó los
            avisos; no indica si está conectado ahora. Los detalles antiguos se
            completan cuando el dispositivo vuelve a abrir la web.
          </p>
        </section>
        <p className="notification-help">
          La primera revisión de cada equipo o temporada establece una
          referencia. No se interpretan como cancelaciones los partidos que
          desaparezcan temporalmente del origen.
        </p>
      </div>
    </section>
  );
}
