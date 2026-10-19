import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export const CACHE_SCHEMA_VERSION = 1;

function publicSnapshot({ cacheVersion, ...value }, stale) {
  return { ...value, stale };
}

export class SnapshotCache {
  constructor({
    directory,
    ttl = 15 * 60_000,
    retryDelay = 60_000,
    loader,
    clock = () => Date.now(),
  }) {
    this.directory = directory;
    this.ttl = ttl;
    this.retryDelay = retryDelay;
    this.loader = loader;
    this.clock = clock;
    this.pending = new Map();
    this.memory = new Map();
    this.retryAt = new Map();
  }
  async get(id) {
    if (!/^\d{1,12}$/.test(id))
      throw new Error("Identificador de equipo no válido.");
    if (this.pending.has(id)) return this.pending.get(id);
    const task = this.#get(id).finally(() => this.pending.delete(id));
    this.pending.set(id, task);
    return task;
  }
  async #get(id) {
    let old = this.memory.get(id);
    if (!old) {
      try {
        const v = JSON.parse(
          await readFile(path.join(this.directory, `${id}.json`), "utf8"),
        );
        if (
          v.team?.id === id &&
          Array.isArray(v.matches) &&
          Array.isArray(v.standings) &&
          Array.isArray(v.squad) &&
          Number.isFinite(Date.parse(v.updatedAt))
        )
          old = v;
      } catch {
        /* Missing or corrupt cache is refreshed. */
      }
      if (old) this.memory.set(id, old);
    }
    if (
      old?.cacheVersion === CACHE_SCHEMA_VERSION &&
      this.clock() - Date.parse(old.updatedAt) < this.ttl
    )
      return publicSnapshot(old, false);
    if (old && this.clock() < (this.retryAt.get(id) || 0))
      return publicSnapshot(old, true);
    try {
      const fresh = {
        ...(await this.loader(id)),
        updatedAt: new Date(this.clock()).toISOString(),
        stale: false,
        cacheVersion: CACHE_SCHEMA_VERSION,
      };
      const tmp = path.join(this.directory, `${id}.${randomUUID()}.tmp`);
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(tmp, JSON.stringify(fresh), { mode: 0o600 });
        await rename(tmp, path.join(this.directory, `${id}.json`));
      } catch (e) {
        await unlink(tmp).catch(() => {});
        console.warn("No se ha podido guardar la caché en disco:", e.code);
      }
      this.memory.set(id, fresh);
      this.retryAt.delete(id);
      return publicSnapshot(fresh, false);
    } catch (e) {
      if (old) {
        this.retryAt.set(id, this.clock() + this.retryDelay);
        return publicSnapshot(old, true);
      }
      throw e;
    }
  }
}
