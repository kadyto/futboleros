import { fetch, EnvHttpProxyAgent } from "undici";
const proxy = new EnvHttpProxyAgent();
const origin = "https://www.rffm.es";
let active = 0;
const waiting = [];
async function acquire() {
  if (active >= 4) await new Promise((resolve) => waiting.push(resolve));
  else active++;
}
function release() {
  if (waiting.length) waiting.shift()();
  else active--;
}
export class SourceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
export async function officialText(path) {
  const url = new URL(path, origin);
  if (url.origin !== origin || !path.startsWith("/"))
    throw new SourceError("Dirección de origen no permitida.", 400);
  await acquire();
  try {
    const response = await fetch(url, {
      dispatcher: proxy,
      signal: AbortSignal.timeout(25_000),
      redirect: "error",
      headers: {
        "User-Agent":
          "Futboleros/0.1 (consulta de informacion deportiva publica)",
        Accept: "text/html,application/json",
      },
    });
    if (response.status === 404)
      throw new SourceError(
        "No se ha encontrado esa ficha en la federación.",
        404,
      );
    if (!response.ok)
      throw new SourceError(
        `La federación no está disponible en este momento (HTTP ${response.status}).`,
      );
    let length = 0,
      text = "";
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 5_000_000) {
        await response.body.cancel().catch(() => {});
        throw new SourceError(
          "La respuesta de la federación supera el tamaño esperado.",
        );
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError(
      "No se ha podido conectar con la federación. Vuelve a intentarlo en unos minutos.",
    );
  } finally {
    release();
  }
}
export async function officialJson(path) {
  try {
    return JSON.parse(await officialText(path));
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError(
      "La federación ha cambiado el formato de su respuesta.",
    );
  }
}
