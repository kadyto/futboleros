const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const { createApp } = await import("../server/index.mjs");
  const { fakeProvider, fakeWeather, TEST_PASSWORD, signIn, request } =
    await import("./helpers.mjs");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "futboleros-calendar-timing-"),
  );
  const source = await fakeProvider().snapshot("1001");
  const fixture = (id, round, date, time, away, extra = {}) => ({
    id,
    round,
    date,
    time,
    home: source.team.name,
    away,
    homeId: "1001",
    awayId: String(2000 + round),
    venue: "Campo de prueba",
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    ...extra,
  });
  source.matches = [
    fixture("3001", 1, "2026-10-24", "16:00", "Rival de hoy"),
    fixture("3002", 2, "2026-10-31", "16:00", "Rival siguiente"),
    fixture("3003", 3, "2026-10-17", "16:00", "Rival con resultado", {
      homeScore: 0,
      awayScore: 0,
      status: "played",
    }),
    fixture("3004", 4, "2026-10-24", "10:00", "Rival aplazado", {
      status: "postponed",
    }),
    fixture("3005", 5, null, null, "Rival sin fecha"),
    fixture("3006", 6, "2026-10-10", null, "Rival sin hora"),
  ];
  const now = Date.parse("2026-10-24T17:57:00Z");
  const app = createApp({
    directory,
    clock: () => now,
    adminPassword: TEST_PASSWORD,
    weather: fakeWeather(),
    provider: {
      ...fakeProvider(),
      snapshot: async () => structuredClone(source),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const cookie = await signIn(base);
    assert.equal(
      (
        await request(base, "/api/admin/config", {
          method: "PUT",
          cookie,
          body: { teamId: "1001" },
        })
      ).status,
      200,
    );
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
      timezoneId: "America/Los_Angeles",
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(now) });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page
      .locator(".next-match .matchup")
      .getByText("Rival siguiente", { exact: true })
      .waitFor();
    assert.doesNotMatch(
      await page.locator(".next-match").innerText(),
      /Rival de hoy|Rival aplazado/,
    );
    const pendingPanel = page.locator(".pending-results-panel");
    await pendingPanel
      .getByRole("heading", { name: "Pendientes de resultado", exact: true })
      .waitFor();
    assert.match(await pendingPanel.innerText(), /Rival de hoy/);
    assert.match(await pendingPanel.innerText(), /Pendiente de resultado/);
    assert.deepEqual(
      await pendingPanel
        .locator(".match-row")
        .first()
        .locator(".match-teams b")
        .allTextContents(),
      ["–", "–"],
    );
    assert.doesNotMatch(
      await page.locator(".results-panel").innerText(),
      /Rival de hoy|Rival sin hora/,
    );
    await page
      .getByRole("button", { name: "Ver pendientes", exact: true })
      .click();
    const filters = page.getByLabel("Filtrar partidos");
    assert.equal(
      await filters
        .getByRole("button", { name: "Pendientes", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator(".match-row").count(), 2);
    assert.equal(
      await page
        .locator(".match-date small")
        .filter({ hasText: "Finalizado" })
        .count(),
      0,
    );
    await filters
      .getByRole("button", { name: "Próximos", exact: true })
      .click();
    assert.equal(await page.locator(".match-row").count(), 2);
    assert.doesNotMatch(
      await page.locator(".page-content").innerText(),
      /Rival de hoy|Rival aplazado/,
    );
    await filters
      .getByRole("button", { name: "Resultados", exact: true })
      .click();
    assert.equal(await page.locator(".match-row").count(), 1);
    assert.match(
      await page.locator(".match-row").innerText(),
      /Rival con resultado|Finalizado/,
    );
    assert.deepEqual(await page.locator(".match-teams b").allTextContents(), [
      "0",
      "0",
    ]);
    await filters.getByRole("button", { name: "Todos", exact: true }).click();
    assert.equal(await page.locator(".match-row").count(), 6);
    assert.match(
      await page
        .locator(".match-row")
        .filter({ hasText: "Rival aplazado" })
        .innerText(),
      /Aplazado/,
    );
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
    }
    await filters
      .getByRole("button", { name: "Pendientes", exact: true })
      .click();
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/calendar-pending-mobile.png" });
    const ticking = await context.newPage();
    await ticking.clock.install({ time: new Date("2026-10-24T13:59:00Z") });
    await ticking.route("**/api/team", (route) =>
      route.fulfill({ json: source }),
    );
    await ticking.goto(base);
    await ticking
      .locator(".next-match .matchup")
      .getByText("Rival de hoy", { exact: true })
      .waitFor();
    await ticking.clock.fastForward(120_000);
    await ticking
      .locator(".next-match .matchup")
      .getByText("Rival siguiente", { exact: true })
      .waitFor();
    assert.match(
      await ticking.locator(".pending-results-panel").innerText(),
      /Rival de hoy/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Calendar timing browser checks passed: past kickoff pending without a score, future next match, distinct filters, 0–0 results, Madrid clock in another browser timezone, live minute refresh and mobile layout.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
