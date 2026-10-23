import { useEffect, useState } from "react";
import { Bell, LoaderCircle, RefreshCw } from "lucide-react";
import { noticeDate, type NotificationFeed } from "./NotificationCenter";

type Status = NotificationFeed & {
  subscriptions: number;
  pendingDeliveries: number;
  lastPushError: string | null;
  checking: boolean;
};
export default function NotificationSettings({
  teamVersion,
}: {
  teamVersion: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
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
  async function check() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/notifications/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Futboleros-Admin": "1",
        },
        body: "{}",
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setStatus(value);
      if (!value.lastError)
        setMessage(
          "Calendario comprobado. Los cambios detectados aparecen en la campana de avisos.",
        );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
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
          dispositivo desde la campana de la web pública.
        </p>
        {status && (
          <dl>
            <div>
              <dt>Última revisión correcta</dt>
              <dd>{noticeDate(status.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>Próxima revisión</dt>
              <dd>{noticeDate(status.nextCheckAt)}</dd>
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
        {(error || status?.lastError || status?.lastPushError) && (
          <p className="notice error-notice" role="alert">
            {error || status?.lastError || status?.lastPushError}
          </p>
        )}
        {message && (
          <p className="notification-message" role="status">
            {message}
          </p>
        )}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void check()}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          Comprobar calendario ahora
        </button>
        <p className="notification-help">
          La primera revisión de cada equipo o temporada establece una
          referencia. No se interpretan como cancelaciones los partidos que
          desaparezcan temporalmente del origen.
        </p>
      </div>
    </section>
  );
}
