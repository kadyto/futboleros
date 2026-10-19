import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.mjs";
import { demoSnapshot } from "../server/demo.mjs";
test("HTTP API serves real selections, explicit demo, calendar downloads and validation errors", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "futboleros-api-"));
  let calls = 0;
  const provider = {
    snapshot: async (id) => {
      calls++;
      if (id === "404") {
        const e = new Error("No disponible");
        e.status = 404;
        throw e;
      }
      const v = demoSnapshot();
      v.team.id = id;
      delete v.demo;
      return v;
    },
    search: async (q) => ({
      teams: [{ id: "1001", name: q, category: "Alevín" }],
    }),
  };
  const server = createApp({ directory, provider }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const url = `http://127.0.0.1:${server.address().port}`;
  let r = await fetch(`${url}/api/teams/1001`);
  assert.equal(r.status, 200);
  let v = await r.json();
  assert.equal(v.team.id, "1001");
  assert.equal(v.demo, undefined);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  await fetch(`${url}/api/teams/1001`);
  assert.equal(calls, 1);
  r = await fetch(`${url}/api/teams/demo`);
  v = await r.json();
  assert.equal(v.demo, true);
  assert.equal(calls, 1);
  r = await fetch(`${url}/api/teams/1001/calendar.ics`);
  assert.match(r.headers.get("content-type"), /text\/calendar/);
  assert.match(r.headers.get("content-disposition"), /attachment/);
  assert.match(await r.text(), /BEGIN:VEVENT/);
  assert.equal((await fetch(`${url}/api/teams/invalid`)).status, 400);
  assert.equal((await fetch(`${url}/api/teams/404`)).status, 404);
  assert.equal((await fetch(`${url}/api/search?q=ab`)).status, 400);
  assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
  r = await fetch(`${url}/api/search?q=Olivares`);
  assert.equal((await r.json()).teams[0].category, "Alevín");
});
