import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.mjs";
import { demoSnapshot } from "../server/demo.mjs";
export const TEST_PASSWORD = "solo-para-pruebas-1234";
export function fakeProvider() {
  return {
    async snapshot(id) {
      if (id === "404") {
        const e = new Error(
          "Ese equipo no tiene una ficha pública disponible.",
        );
        e.status = 404;
        throw e;
      }
      const value = demoSnapshot();
      value.team.id = id;
      value.team.sourceUrl = `https://www.rffm.es/fichaequipo/${id}`;
      value.squad[0].sourceUrl = "https://www.rffm.es/fichajugador/5001";
      if (id === "1002") {
        value.team.name = "C.D. Olivares Infantil A";
        value.team.category = "Infantil F-11";
      }
      for (const m of value.matches) {
        if (m.homeId === "demo") {
          m.homeId = id;
          m.home = value.team.name;
        }
        if (m.awayId === "demo") {
          m.awayId = id;
          m.away = value.team.name;
        }
        for (const field of ["homeId", "awayId"]) {
          if (m[field].startsWith("example-"))
            m[field] = String(2000 + Number(m[field].slice("example-".length)));
        }
      }
      for (const row of value.standings) {
        if (row.teamId === "demo") {
          row.teamId = id;
          row.team = value.team.name;
        } else if (row.teamId.startsWith("example-"))
          row.teamId = String(
            2000 + Number(row.teamId.slice("example-".length)),
          );
      }
      delete value.demo;
      return value;
    },
    async search() {
      return {
        teams: [
          { id: "1001", name: "C.D. Olivares A", category: "Alevín F-7" },
          {
            id: "1002",
            name: "C.D. Olivares Infantil A",
            category: "Infantil F-11",
          },
        ],
        more: false,
      };
    },
  };
}
export async function startTestApp(t, options = {}) {
  const directory =
    options.directory ||
    (await mkdtemp(path.join(os.tmpdir(), "futboleros-api-")));
  const server = createApp({
    directory,
    provider: fakeProvider(),
    adminPassword: TEST_PASSWORD,
    ...options,
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  if (!options.directory)
    t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    server,
    directory,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}
export function request(
  url,
  route,
  { method = "GET", cookie, body, headers = {}, ...options } = {},
) {
  return fetch(url + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Futboleros-Admin": "1",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...options,
  });
}
export async function signIn(url, password = TEST_PASSWORD, headers = {}) {
  const r = await request(url, "/api/admin/login", {
    method: "POST",
    body: { password },
    headers: {
      "Content-Type": "application/json",
      "X-Futboleros-Admin": "1",
      ...headers,
    },
  });
  if (r.status !== 200) throw new Error(`Test login failed (${r.status})`);
  return r.headers.get("set-cookie").split(";")[0];
}
