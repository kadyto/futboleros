import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SiteSettings } from "../server/settings.mjs";
test("only the selected team metadata is persisted with private file permissions", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-settings-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SiteSettings(directory);
  assert.equal((await store.read()).team, null);
  await store.save({
    id: "1001",
    name: "C.D. Olivares A",
    category: "Alevín F-7",
    extra: "not persisted",
  });
  assert.deepEqual((await new SiteSettings(directory).read()).team, {
    id: "1001",
    name: "C.D. Olivares A",
    category: "Alevín F-7",
  });
  assert.equal(
    (await stat(path.join(directory, "settings.json"))).mode & 0o777,
    0o600,
  );
  await writeFile(path.join(directory, "settings.json"), "{broken");
  await assert.rejects(() => store.read(), /configuración/);
});
test("a failed write never claims that the team was saved", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-settings-fail-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "not-a-directory");
  await writeFile(file, "x");
  await assert.rejects(
    () =>
      new SiteSettings(file).save({
        id: "1001",
        name: "Example",
        category: "Example",
      }),
    /No se ha podido guardar/,
  );
});
