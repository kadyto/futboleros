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
    path.join(os.tmpdir(), "futboleros-results-browser-"),
  );
  const source = await fakeProvider().snapshot("1001");
  source.matches = [
    {
      ...source.matches[0],
      id: "3001",
      date: "2026-10-23",
      time: "10:00",
      status: "scheduled",
      homeScore: null,
      awayScore: null,
    },
  ];
  let now = Date.parse("2026-10-24T06:00:00Z");
  let update = { homeScore: null, awayScore: null, reportPublished: false };
  const app = createApp({
    directory,
    clock: () => now,
    adminPassword: TEST_PASSWORD,
    weather: fakeWeather(),
    provider: {
      ...fakeProvider(),
      snapshot: async () => structuredClone(source),
      matchUpdate: async () => update,
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
    await app.locals.calendarWatch.checkResults();
    now += 60 * 60_000;
    update = { homeScore: 0, awayScore: 0, reportPublished: false };
    await app.locals.calendarWatch.checkResults();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page
      .getByRole("button", { name: "Avisos de partidos", exact: true })
      .click();
    await page
      .getByText("Resultado publicado: 0–0.", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Ver acta", exact: true }).count(),
      0,
    );
    now += 60 * 60_000;
    update = { ...update, reportPublished: true };
    await app.locals.calendarWatch.checkResults();
    await page.reload();
    await page
      .getByRole("button", { name: "Avisos de partidos", exact: true })
      .click();
    await page.getByText("Acta publicada: 0–0.", { exact: true }).waitFor();
    const report = page.getByRole("link", { name: "Ver acta", exact: true });
    assert.equal(
      await report.getAttribute("href"),
      "https://www.rffm.es/acta-partido/3001",
    );
    assert.equal(await report.getAttribute("target"), "_blank");
    assert.match(await report.getAttribute("rel"), /noopener/);
    assert.equal(await page.locator(".notification-list article").count(), 2);
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/result-report-mobile.png" });
    await page
      .getByRole("button", { name: "Ver resultados", exact: true })
      .first()
      .click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.goto(base + "/admin");
    await page.getByLabel("Contraseña de administración").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Entrar al panel" }).click();
    await page
      .getByText("Resultados y actas: última revisión", { exact: true })
      .waitFor();
    await page.getByText("Próxima revisión horaria", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Results browser checks passed: distinct result/report notices, verified report link, results navigation, hourly status and mobile layout.",
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
