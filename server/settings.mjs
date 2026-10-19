import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class SiteSettings {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, "settings.json");
  }
  async read() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (
        value.version !== 1 ||
        !/^\d{1,12}$/.test(value.team?.id) ||
        typeof value.team.name !== "string" ||
        typeof value.team.category !== "string"
      )
        throw new Error("Invalid settings");
      return { team: value.team, updatedAt: value.updatedAt };
    } catch (error) {
      if (error.code === "ENOENT") return { team: null, updatedAt: null };
      const e = new Error(
        "No se puede leer la configuración del equipo. Revisa el almacenamiento del servidor.",
      );
      e.status = 503;
      throw e;
    }
  }
  async save(team) {
    const value = {
      version: 1,
      team: { id: team.id, name: team.name, category: team.category },
      updatedAt: new Date().toISOString(),
    };
    const temp = path.join(this.directory, `settings.${randomUUID()}.tmp`);
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
      await rename(temp, this.file);
      return { team: value.team, updatedAt: value.updatedAt };
    } catch {
      await unlink(temp).catch(() => {});
      const e = new Error(
        "No se ha podido guardar el equipo. Comprueba que el volumen de datos permite escritura.",
      );
      e.status = 503;
      throw e;
    }
  }
}
