import test from "node:test";
import assert from "node:assert/strict";
import { startTestApp, request, signIn, TEST_PASSWORD } from "./helpers.mjs";

test("password validation, opaque HttpOnly cookies, logout and forged sessions", async (t) => {
  const { url } = await startTestApp(t);
  let r = await request(url, "/api/admin/login", {
    method: "POST",
    body: { password: "wrong" },
  });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("set-cookie"), null);
  r = await request(url, "/api/admin/login", {
    method: "POST",
    body: { password: TEST_PASSWORD },
  });
  assert.equal(r.status, 200);
  const setCookie = r.headers.get("set-cookie"),
    cookie = setCookie.split(";")[0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.ok(!setCookie.includes(TEST_PASSWORD));
  assert.equal(
    (await (await request(url, "/api/admin/session", { cookie })).json())
      .authenticated,
    true,
  );
  assert.equal(
    (
      await request(url, "/api/admin/config", {
        cookie: "futboleros_admin=" + "a".repeat(64),
      })
    ).status,
    401,
  );
  r = await request(url, "/api/admin/logout", {
    method: "POST",
    cookie,
    body: {},
  });
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (await request(url, "/api/admin/config", { cookie })).status,
    401,
  );
});

test("foreign origins, cross-site requests and missing CSRF headers cannot change configuration", async (t) => {
  const { url } = await startTestApp(t),
    cookie = await signIn(url);
  const foreign = {
    method: "PUT",
    cookie,
    body: { teamId: "1001" },
    headers: {
      "Content-Type": "application/json",
      "X-Futboleros-Admin": "1",
      Origin: "https://foreign.example",
    },
  };
  assert.equal((await request(url, "/api/admin/config", foreign)).status, 403);
  assert.equal(
    (
      await request(url, "/api/admin/login", {
        method: "POST",
        body: { password: TEST_PASSWORD },
        headers: foreign.headers,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/admin/config", {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: "1001" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(url, "/api/admin/config", {
        ...foreign,
        headers: {
          "Content-Type": "application/json",
          "X-Futboleros-Admin": "1",
          "Sec-Fetch-Site": "cross-site",
        },
      })
    ).status,
    403,
  );
  assert.equal(await (await request(url, "/api/team")).json(), null);
});

test("sessions expire, and HTTPS proxy requests receive Secure cookies", async (t) => {
  let now = Date.now();
  const { url } = await startTestApp(t, { clock: () => now });
  const cookie = await signIn(url);
  now += 13 * 60 * 60_000;
  assert.equal(
    (await request(url, "/api/admin/config", { cookie })).status,
    401,
  );
  const r = await request(url, "/api/admin/login", {
    method: "POST",
    body: { password: TEST_PASSWORD },
    headers: {
      "Content-Type": "application/json",
      "X-Futboleros-Admin": "1",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.match(r.headers.get("set-cookie"), /; Secure/);
});

test("the backoffice remains disabled without a valid administrator password", async (t) => {
  for (const adminPassword of [null, "short"]) {
    const { url } = await startTestApp(t, { adminPassword });
    assert.deepEqual(await (await request(url, "/api/admin/session")).json(), {
      available: false,
      authenticated: false,
    });
    assert.equal(
      (
        await request(url, "/api/admin/login", {
          method: "POST",
          body: { password: TEST_PASSWORD },
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await request(url, "/api/admin/config", {
          method: "PUT",
          body: { teamId: "1001" },
        })
      ).status,
      503,
    );
    assert.equal(await (await request(url, "/api/team")).json(), null);
  }
});

test("repeated incorrect passwords are rate limited", async (t) => {
  const { url } = await startTestApp(t);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await request(url, "/api/admin/login", {
          method: "POST",
          body: { password: "wrong" },
        })
      ).status,
      401,
    );
  const r = await request(url, "/api/admin/login", {
    method: "POST",
    body: { password: TEST_PASSWORD },
  });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "900");
});
