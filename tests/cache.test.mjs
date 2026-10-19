import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SnapshotCache } from "../server/cache.mjs";
import { demoSnapshot } from "../server/demo.mjs";
async function directory(t) {
  const d = await mkdtemp(path.join(os.tmpdir(), "futboleros-cache-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  return d;
}
function snapshot() {
  const v = demoSnapshot();
  v.team.id = "1001";
  return v;
}
test("coalesces concurrent requests and restores persisted snapshots after restart", async (t) => {
  const dir = await directory(t);
  let calls = 0;
  const loader = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return snapshot();
  };
  const c = new SnapshotCache({ directory: dir, loader });
  await Promise.all([c.get("1001"), c.get("1001"), c.get("1001")]);
  assert.equal(calls, 1);
  const restored = new SnapshotCache({ directory: dir, loader });
  assert.equal((await restored.get("1001")).team.id, "1001");
  assert.equal(calls, 1);
  await assert.rejects(() => c.get("../secret"), /válido/);
});
test("labels stale data during an upstream outage, waits before retry, then recovers", async (t) => {
  const dir = await directory(t);
  let now = 1000000,
    fail = false,
    calls = 0;
  const c = new SnapshotCache({
    directory: dir,
    ttl: 1000,
    retryDelay: 500,
    clock: () => now,
    loader: async () => {
      calls++;
      if (fail) throw Error("outage");
      return snapshot();
    },
  });
  const fresh = await c.get("1001");
  now += 1001;
  fail = true;
  const stale = await c.get("1001");
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, fresh.updatedAt);
  await c.get("1001");
  assert.equal(calls, 2);
  now += 501;
  fail = false;
  assert.equal((await c.get("1001")).stale, false);
  assert.equal(calls, 3);
});
test("corrupt persisted cache is replaced; unavailable team never becomes demo data", async (t) => {
  const dir = await directory(t);
  await writeFile(path.join(dir, "1001.json"), "{broken");
  const c = new SnapshotCache({
    directory: dir,
    loader: async () => snapshot(),
  });
  assert.equal((await c.get("1001")).stale, false);
  const missing = new SnapshotCache({
    directory: dir,
    loader: async () => {
      throw Error("not available");
    },
  });
  await assert.rejects(() => missing.get("1002"), /not available/);
});

test("serves fresh data in memory when persistent storage is unavailable", async (t) => {
  const dir = await directory(t);
  const file = path.join(dir, "not-a-directory");
  await writeFile(file, "x");
  let calls = 0;
  const c = new SnapshotCache({
    directory: file,
    loader: async () => {
      calls++;
      return snapshot();
    },
  });
  const fresh = await c.get("1001");
  assert.equal(fresh.stale, false);
  await c.get("1001");
  assert.equal(calls, 1);
});
