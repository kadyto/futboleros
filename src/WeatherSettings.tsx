import { useEffect, useState } from "react";
import { CloudSun, LoaderCircle } from "lucide-react";

type Location = {
  latitude: number;
  longitude: number;
  name: string;
  label: string;
};
type Data = {
  match: { id: string; venue: string | null; venueId?: string } | null;
  saved: Location | null;
  candidates: Location[];
};

export default function WeatherSettings({
  teamVersion,
}: {
  teamVersion: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setSuccess("");
    fetch("/api/admin/weather-location", { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value as Data;
      })
      .then((value) => {
        setData(value);
        setLatitude(value.saved ? String(value.saved.latitude) : "");
        setLongitude(value.saved ? String(value.saved.longitude) : "");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [teamVersion]);
  async function save(location: Pick<Location, "latitude" | "longitude">) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/weather-location", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Futboleros-Admin": "1",
        },
        body: JSON.stringify({
          matchId: data?.match?.id,
          venue: data?.match?.venue,
          venueId: data?.match?.venueId,
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setData((current) => current && { ...current, saved: value.saved });
      setLatitude(String(value.saved.latitude));
      setLongitude(String(value.saved.longitude));
      setSuccess(
        "Ubicación guardada. La previsión pública se actualizará en la siguiente consulta.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel admin-weather">
      <div className="section-header">
        <h2>Ubicación para la previsión</h2>
        <CloudSun size={20} />
      </div>
      <div className="admin-weather-body">
        {error && (
          <p className="notice error-notice" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="notice admin-success" role="status">
            {success}
          </p>
        )}
        {!data ? (
          !error && (
            <p role="status">
              <LoaderCircle size={15} className="spin" /> Buscando el campo…
            </p>
          )
        ) : !data.match ? (
          <p>No hay un próximo partido publicado.</p>
        ) : (
          <>
            <h3>{data.match.venue || "Campo por confirmar"}</h3>
            <p>
              Si hay varios campos con el mismo nombre, confirma el correcto. Se
              guardará su ubicación para futuros encuentros en ese campo.
            </p>
            {data.saved && (
              <p className="weather-location-saved">
                Ubicación confirmada: {data.saved.latitude},{" "}
                {data.saved.longitude}
              </p>
            )}
            <div className="weather-location-options">
              {data.candidates.map((location, index) => (
                <div key={`${location.latitude},${location.longitude}`}>
                  <p>{location.label}</p>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver en el mapa
                  </a>
                  <button
                    className="secondary"
                    disabled={busy}
                    aria-label={`Usar ubicación ${index + 1}`}
                    onClick={() => void save(location)}
                  >
                    Usar esta ubicación
                  </button>
                </div>
              ))}
            </div>
            <details>
              <summary>Introducir coordenadas del campo</summary>
              <p>
                Puedes copiarlas desde el mapa si el campo no aparece en la
                lista.{" "}
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(data.match.venue || "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buscar el campo en el mapa
                </a>
                .
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({
                    latitude: Number(latitude),
                    longitude: Number(longitude),
                  });
                }}
              >
                <label>
                  Latitud del campo
                  <input
                    type="number"
                    step="any"
                    min="39.7"
                    max="41.3"
                    required
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </label>
                <label>
                  Longitud del campo
                  <input
                    type="number"
                    step="any"
                    min="-4.7"
                    max="-2.9"
                    required
                    value={longitude}
                    onChange={(event) => setLongitude(event.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Guardar ubicación del campo
                </button>
              </form>
            </details>
            <p className="weather-location-credit">
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ubicaciones © OpenStreetMap
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
