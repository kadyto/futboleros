import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8093";
const headers = {
  "Content-Type": "application/json",
  "X-Futboleros-Admin": "1",
};
if (process.argv[2] !== "restored") {
  assert.equal(await (await fetch(base + "/api/team")).json(), null);
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("A test administrator password is required.");
  const login = await fetch(base + "/api/admin/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const saved = await fetch(base + "/api/admin/config", {
    method: "PUT",
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ teamId: "1001" }),
  });
  assert.equal(saved.status, 200);
}
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
    ? "Container settings and public team survived recreation."
    : "Container administrator save and public team restrictions verified.",
);
