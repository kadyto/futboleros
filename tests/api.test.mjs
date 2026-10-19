import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startTestApp, request, signIn, TEST_PASSWORD } from "./helpers.mjs";

test("public visitors see only the server-configured team and cannot select another", async (t) => {
  const { url, directory } = await startTestApp(t);
  assert.equal(await (await request(url, "/api/team")).json(), null);
  assert.equal((await request(url, "/api/calendar.ics")).status, 404);
  assert.equal((await request(url, "/api/admin/config")).status, 401);
  assert.equal((await request(url, "/api/search?q=Olivares")).status, 401);
  assert.equal((await request(url, "/api/teams/demo")).status, 403);
  assert.equal((await request(url, "/api/teams/1001")).status, 403);
  assert.equal(
    (
      await request(url, "/api/admin/config", {
        method: "PUT",
        body: { teamId: "1001" },
      })
    ).status,
    401,
  );
  const cookie = await signIn(url);
  const preview = await request(url, "/api/teams/1001", { cookie });
  assert.equal(preview.status, 200);
  assert.equal(
    await (await request(url, "/api/team")).json(),
    null,
    "preview must not publish",
  );
  const saved = await request(url, "/api/admin/config", {
    method: "PUT",
    cookie,
    body: { teamId: "1001" },
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).team.id, "1001");
  const publicResponse = await request(url, "/api/team?teamId=1002");
  const value = await publicResponse.json();
  assert.equal(value.team.id, "1001");
  assert.equal(value.demo, undefined);
  assert.ok(value.matches.length);
  assert.equal(publicResponse.headers.get("cache-control"), "no-store");
  assert.match(
    publicResponse.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.equal((await request(url, "/api/teams/1001")).status, 200);
  for (const route of [
    "/api/teams/1002",
    "/api/teams/1002/calendar.ics",
    "/api/teams/demo",
  ])
    assert.equal((await request(url, route)).status, 403);
  assert.equal((await request(url, "/api/search?q=Olivares")).status, 401);
  const calendar = await request(url, "/api/calendar.ics");
  assert.match(calendar.headers.get("content-type"), /text\/calendar/);
  assert.match(await calendar.text(), /BEGIN:VEVENT/);
  assert.equal(
    (
      await request(url, "/api/admin/config", {
        method: "PUT",
        cookie,
        body: { teamId: "demo" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(url, "/api/admin/config", {
        method: "PUT",
        cookie,
        body: { teamId: "404" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await (await request(url, "/api/team")).json()).team.id,
    "1001",
  );
  assert.ok(
    !(await readFile(path.join(directory, "settings.json"), "utf8")).includes(
      TEST_PASSWORD,
    ),
  );
  assert.equal((await request(url, "/admin")).status, 200);
  assert.equal((await request(url, "/api/unknown")).status, 404);
});

test("a second browser sees the saved change and settings survive application recreation", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "futboleros-persistent-settings-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const a = await startTestApp(t, { directory }),
    cookie = await signIn(a.url);
  await request(a.url, "/api/admin/config", {
    method: "PUT",
    cookie,
    body: { teamId: "1001" },
  });
  await request(a.url, "/api/admin/config", {
    method: "PUT",
    cookie,
    body: { teamId: "1002" },
  });
  const b = await startTestApp(t, { directory });
  assert.equal(
    (await (await request(b.url, "/api/team")).json()).team.id,
    "1002",
  );
  assert.equal(
    (await request(b.url, "/api/admin/config", { cookie })).status,
    401,
    "sessions do not survive restart",
  );
  assert.equal((await request(b.url, "/api/teams/1001")).status, 403);
});
