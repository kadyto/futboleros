// Fictional fixture used only by the container readiness check.
import { writeFile } from "node:fs/promises";
const { demoSnapshot } = await import(`${process.cwd()}/server/demo.mjs`);
const { CACHE_SCHEMA_VERSION } = await import(
  `${process.cwd()}/server/cache.mjs`
);
const value = demoSnapshot();
value.team.id = "1001";
delete value.demo;
value.cacheVersion = CACHE_SCHEMA_VERSION;
for (const m of value.matches) {
  if (m.homeId === "demo") m.homeId = "1001";
  if (m.awayId === "demo") m.awayId = "1001";
}
for (const row of value.standings)
  if (row.teamId === "demo") row.teamId = "1001";
await writeFile("/data/1001.json", JSON.stringify(value), { mode: 0o600 });
