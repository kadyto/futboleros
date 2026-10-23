import path from "node:path";
import { ECDH, randomUUID, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { fetch, EnvHttpProxyAgent } from "undici";
import { JsonFile } from "./json-file.mjs";

const proxy = new EnvHttpProxyAgent();
const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const same = (left, right) => {
  const a = Buffer.from(left || ""),
    b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
};
export function validateSubscription(value) {
  let endpoint;
  try {
    endpoint = new URL(value?.endpoint);
  } catch {
    throw failure("Suscripción no válida.");
  }
  const host = endpoint.hostname;
  const allowed =
    [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ].includes(host) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (
    !allowed ||
    endpoint.protocol !== "https:" ||
    endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.href.length > 4096
  )
    throw failure("El servicio de notificaciones no está admitido.");
  const keys = {};
  for (const [name, size] of [
    ["p256dh", 65],
    ["auth", 16],
  ]) {
    const text = value?.keys?.[name];
    if (typeof text !== "string" || !/^[A-Za-z0-9_-]{20,100}={0,2}$/.test(text))
      throw failure("Las claves de la suscripción no son válidas.");
    const bytes = Buffer.from(text, "base64url");
    if (bytes.length !== size || (name === "p256dh" && bytes[0] !== 4))
      throw failure("Las claves de la suscripción no son válidas.");
    if (name === "p256dh") {
      try {
        ECDH.convertKey(bytes, "prime256v1");
      } catch {
        throw failure("La clave pública de la suscripción no es válida.");
      }
    }
    keys[name] = bytes.toString("base64url");
  }
  const expirationTime = value.expirationTime ?? null;
  if (
    expirationTime !== null &&
    (!Number.isFinite(expirationTime) || expirationTime < 0)
  )
    throw failure("La caducidad de la suscripción no es válida.");
  return { endpoint: endpoint.href, keys, expirationTime };
}

export async function sendWebPush(
  subscription,
  payload,
  keys,
  subject,
  requestPush = fetch,
) {
  validateSubscription(subscription);
  const request = webpush.generateRequestDetails(
    subscription,
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      },
      TTL: 24 * 60 * 60,
      urgency: "normal",
    },
  );
  const response = await requestPush(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    dispatcher: proxy,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (!response.ok)
    throw Object.assign(new Error("No se ha entregado el aviso."), {
      statusCode: response.status,
    });
}

export class PushService {
  constructor({
    directory,
    clock = () => Date.now(),
    send = sendWebPush,
    subject = process.env.PUSH_SUBJECT ||
      "https://github.com/kadyto/futboleros",
  }) {
    this.clock = clock;
    this.send = send;
    this.subject = subject;
    this.keyFile = new JsonFile(path.join(directory, "push-keys.json"), null);
    this.store = new JsonFile(path.join(directory, "push-subscriptions.json"), {
      version: 1,
      subscriptions: [],
    });
  }
  async keys() {
    if (!this.keyPromise) {
      this.keyPromise = (async () => {
        let keys = await this.keyFile.read();
        if (!keys) {
          keys = webpush.generateVAPIDKeys();
          await this.keyFile.write(keys);
        }
        if (
          typeof keys.publicKey !== "string" ||
          typeof keys.privateKey !== "string"
        )
          throw new Error("Las claves de avisos guardadas no son válidas.");
        return keys;
      })().catch((error) => {
        this.keyPromise = null;
        throw error;
      });
    }
    return this.keyPromise;
  }
  async publicKey() {
    return (await this.keys()).publicKey;
  }
  async list() {
    const value = await this.store.read();
    if (value.version !== 1 || !Array.isArray(value.subscriptions))
      throw new Error("Formato de suscripciones no válido.");
    return value.subscriptions.filter(
      (sub) => !sub.expirationTime || sub.expirationTime > this.clock(),
    );
  }
  async subscribe(input) {
    const subscription = validateSubscription(input);
    if (
      subscription.expirationTime !== null &&
      subscription.expirationTime <= this.clock()
    )
      throw failure("La suscripción ha caducado. Activa los avisos de nuevo.");
    await this.keys();
    return this.store.update((value) => {
      if (value.version !== 1 || !Array.isArray(value.subscriptions))
        throw new Error("Formato de suscripciones no válido.");
      value.subscriptions = value.subscriptions.filter(
        (sub) => !sub.expirationTime || sub.expirationTime > this.clock(),
      );
      const old = value.subscriptions.find(
        (sub) => sub.endpoint === subscription.endpoint,
      );
      if (
        old &&
        (!same(old.keys.auth, subscription.keys.auth) ||
          !same(old.keys.p256dh, subscription.keys.p256dh))
      )
        throw failure("No se puede modificar esa suscripción.", 403);
      if (!old && value.subscriptions.length >= 500)
        throw failure(
          "Se ha alcanzado el límite de dispositivos suscritos.",
          503,
        );
      const saved = {
        ...subscription,
        id: old?.id || randomUUID(),
        createdAt: old?.createdAt || new Date(this.clock()).toISOString(),
      };
      value.subscriptions = [
        ...value.subscriptions.filter((sub) => sub.id !== saved.id),
        saved,
      ];
      return { subscribed: true };
    });
  }
  async verified(input) {
    const proof = validateSubscription(input);
    const sub = (await this.list()).find(
      (item) => item.endpoint === proof.endpoint,
    );
    if (
      !sub ||
      !same(sub.keys.auth, proof.keys.auth) ||
      !same(sub.keys.p256dh, proof.keys.p256dh)
    )
      throw failure(
        "No se ha encontrado la suscripción de este dispositivo.",
        404,
      );
    return sub;
  }
  async remove(id) {
    await this.store.update((value) => {
      value.subscriptions = value.subscriptions.filter((sub) => sub.id !== id);
    });
  }
  async unsubscribe(input) {
    const sub = await this.verified(input);
    await this.remove(sub.id);
  }
  async deliver(sub, payload) {
    try {
      validateSubscription(sub);
      await this.send(sub, payload, await this.keys(), this.subject);
      return "sent";
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        await this.remove(sub.id);
        return "gone";
      }
      return "retry";
    }
  }
  async test(input) {
    const sub = await this.verified(input);
    const result = await this.deliver(sub, {
      title: "Avisos de partidos activados",
      body: "Recibirás una notificación cuando cambien los datos de un partido.",
      url: "/?view=calendar",
      tag: "futboleros-test",
    });
    if (result !== "sent")
      throw failure(
        "No se ha podido entregar la prueba. Revisa los permisos del dispositivo y vuelve a intentarlo.",
        502,
      );
  }
}
