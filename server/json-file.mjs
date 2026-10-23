import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class JsonFile {
  constructor(file, initial) {
    this.file = file;
    this.initial = initial;
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return structuredClone(this.initial);
      throw new Error(
        "No se pueden leer los avisos guardados. Revisa el almacenamiento.",
      );
    }
  }
  async write(value) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, this.file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  update(change) {
    const task = this.queue.then(async () => {
      const value = await this.read();
      const result = await change(value);
      await this.write(value);
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
