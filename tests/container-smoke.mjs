import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8093";
const headers = {
  "Content-Type": "application/json",
  "X-Futboleros-Admin": "1",
};
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("A test administrator password is required.");
const login = await fetch(base + "/api/admin/login", {
  method: "POST",
  headers,
  body: JSON.stringify({ password }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie").split(";")[0];
if (process.argv[2] !== "restored") {
  assert.equal(await (await fetch(base + "/api/team")).json(), null);
  const saved = await fetch(base + "/api/admin/config", {
    method: "PUT",
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ teamId: "1001" }),
  });
  assert.equal(saved.status, 200);
  const counted = await fetch(base + "/api/statistics/view", {
    method: "POST",
    headers: {
      ...headers,
      "X-Futboleros-Event": "1",
      "User-Agent": "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36",
      "X-Forwarded-For": "8.8.8.8, 104.16.1.1",
      "CF-Connecting-IP": "8.8.8.8",
    },
    body: JSON.stringify({ view: "overview", entry: true }),
  });
  assert.equal(counted.status, 204);
  assert.equal(counted.headers.get("set-cookie"), null);
}
assert.equal((await fetch(base + "/api/admin/statistics")).status, 401);
const stats = await (await fetch(base + "/api/admin/statistics?days=7", {
  headers: { Cookie: cookie },
})).json();
assert.deepEqual(stats.totals, { entries: 1, views: 1 });
assert.deepEqual(stats.devices, [{ name: "Móvil", count: 1 }]);
assert.match(stats.locations[0].name, /Estados Unidos/);
assert.doesNotMatch(JSON.stringify(stats), /8\.8\.8\.8|104\.16\.1\.1|Mozilla|userAgent/);
const result = await fetch(base + "/api/team");
assert.equal(result.status, 200);
const value = await result.json();
assert.equal(value.team.id, "1001");
assert.ok(value.matches.length && value.standings.length && value.squad.length);
assert.equal((await fetch(base + "/api/teams/1002")).status, 403);
assert.equal(
  (
    await fetch(base + "/api/admin/config", {
      method: "PUT",
      headers,
      body: JSON.stringify({ teamId: "1002" }),
    })
  ).status,
  401,
);
console.log(
  process.argv[2] === "restored"
    ? "Container settings, public team and private statistics survived recreation."
    : "Container administrator save, local geolocation, private statistics and public restrictions verified.",
);
