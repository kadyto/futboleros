import { fetch, EnvHttpProxyAgent } from "undici";
const proxy = new EnvHttpProxyAgent();

export async function weatherJson(url) {
  if (!(
    (url.origin === "https://api.open-meteo.com" &&
      url.pathname === "/v1/forecast") ||
    (url.origin === "https://nominatim.openstreetmap.org" &&
      url.pathname === "/search")
  ))
    throw new Error("Origen meteorológico no permitido.");
  const response = await fetch(url, {
    dispatcher: proxy,
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Accept-Language": "es",
      "User-Agent": "Futboleros/0.2 (https://github.com/kadyto/futboleros)",
    },
  });
  if (!response.ok) throw new Error("Servicio meteorológico no disponible.");
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 256_000)
      throw new Error("Respuesta meteorológica demasiado grande.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
