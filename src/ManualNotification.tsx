import { useState, type FormEvent } from "react";
import { Bell, LoaderCircle, Megaphone, Send } from "lucide-react";
import { noticeDate, type Announcement } from "./NotificationCenter";

// getRandomValues is also available on local HTTP administration pages.
function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function ManualNotification({
  teamId,
  recipients,
  announcements,
  disabled,
  onPublished,
}: {
  teamId: string;
  recipients: number;
  announcements: Announcement[];
  disabled: boolean;
  onPublished: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<{
    id: string;
    title: string;
    body: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function preview(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setDraft({
      id: requestId(),
      title: title.replace(/\s+/g, " ").trim(),
      body: body.trim(),
    });
  }
  async function send() {
    if (!draft || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/notifications/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Futboleros-Admin": "1",
        },
        body: JSON.stringify({ ...draft, teamId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No se ha podido publicar el aviso.");
      setMessage(
        result.duplicate
          ? "Este aviso ya estaba publicado. Se ha conservado el envío original."
          : result.recipients
            ? `Aviso publicado. Envío programado para ${result.recipients} ${result.recipients === 1 ? "dispositivo" : "dispositivos"}.`
            : "Aviso publicado en la campana. No hay dispositivos suscritos para recibirlo.",
      );
      setDraft(null);
      setTitle("");
      setBody("");
      onPublished();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se ha podido publicar el aviso.",
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <section
      className="manual-notification"
      aria-labelledby="manual-notification-title"
    >
      <h3 id="manual-notification-title">
        <Megaphone size={18} />
        Enviar una notificación
      </h3>
      <p>
        Anuncia un resultado al terminar el partido o comparte una novedad del
        equipo. El aviso aparecerá en la campana y se enviará a los dispositivos
        suscritos.
      </p>
      {error && (
        <p className="notice error-notice" role="alert">
          {error} Puedes reintentar el mismo envío sin crear otro aviso.
        </p>
      )}
      {message && (
        <p className="notification-message" role="status">
          {message}
        </p>
      )}
      {draft ? (
        <div className="manual-notification-review">
          <div
            className="manual-notification-preview"
            role="region"
            aria-label="Vista previa de la notificación"
          >
            <small>
              <Bell size={13} />
              Futboleros · Vista previa
            </small>
            <h4>{draft.title}</h4>
            <p>{draft.body}</p>
          </div>
          <p>
            Al confirmar se publicará en la campana y se enviará a los
            dispositivos suscritos en ese momento. Actualmente hay{" "}
            <b>{recipients}</b>. Al abrir el aviso se mostrarán los resultados
            del equipo.
          </p>
          <div className="manual-notification-actions">
            <button
              className="primary"
              disabled={sending || disabled}
              onClick={() => void send()}
            >
              {sending ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Send size={14} />
              )}
              Confirmar y enviar aviso
            </button>
            <button
              className="secondary"
              disabled={sending}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Volver a editar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={preview}>
          <label htmlFor="manual-notification-subject">
            Título del aviso<span>{title.length}/80</span>
          </label>
          <input
            id="manual-notification-subject"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Resultado del partido"
            required
            maxLength={80}
            disabled={disabled}
          />
          <label htmlFor="manual-notification-message">
            Mensaje del aviso<span>{body.length}/500</span>
          </label>
          <textarea
            id="manual-notification-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Final del partido: Local 3–2 Visitante. ¡Gran partido del equipo!"
            required
            maxLength={500}
            rows={4}
            disabled={disabled}
          />
          <div className="manual-notification-actions">
            <button
              className="secondary"
              type="submit"
              disabled={disabled || !title.trim() || !body.trim()}
            >
              <Bell size={14} />
              Ver vista previa
            </button>
            <small>
              {recipients}{" "}
              {recipients === 1
                ? "dispositivo suscrito"
                : "dispositivos suscritos"}
            </small>
          </div>
        </form>
      )}
      {announcements.length > 0 && (
        <details className="manual-notification-history">
          <summary>Últimos avisos manuales</summary>
          {announcements.slice(0, 5).map((announcement) => (
            <article key={announcement.id}>
              <time dateTime={announcement.createdAt}>
                {noticeDate(announcement.createdAt)}
              </time>
              <h4>{announcement.title}</h4>
              <p>{announcement.body}</p>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
