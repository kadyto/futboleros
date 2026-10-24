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
  let sourceFailure = false;
  let matchCalls = 0;
  const app = createApp({
    directory,
    clock: () => now,
    adminPassword: TEST_PASSWORD,
    weather: fakeWeather(),
    provider: {
      ...fakeProvider(),
      snapshot: async () => structuredClone(source),
      matchUpdate: async () => {
        matchCalls++;
        if (sourceFailure) throw new Error("Fixture source unavailable");
        return update;
      },
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
    const initialStatus = await (
      await request(base, "/api/admin/notifications", { cookie })
    ).json();
    assert.equal(matchCalls, 1);
    now += 60_000;
    update = { homeScore: 0, awayScore: 0, reportPublished: false };
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
    await page.goto(base + "/admin");
    await page.getByLabel("Contraseña de administración").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Entrar al panel" }).click();
    async function forceResults() {
      const completed = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/admin/notifications/results/check"),
      );
      await page
        .getByRole("button", {
          name: "Comprobar resultados y actas ahora",
          exact: true,
        })
        .click();
      const response = await completed;
      assert.equal(response.status(), 200);
      return response.json();
    }
    const checked = await forceResults();
    await page
      .getByRole("status")
      .filter({
        hasText: "Resultados y actas comprobados.",
      })
      .waitFor();
    assert.equal(
      matchCalls,
      2,
      "manual check must consult the source before the next hourly slot",
    );
    assert.equal(checked.nextCheckAt, initialStatus.nextCheckAt);
    assert.equal(
      checked.results.nextCheckAt,
      initialStatus.results.nextCheckAt,
    );
    assert.equal(checked.results.lastCheckedAt, new Date(now).toISOString());
    assert.deepEqual(
      checked.events.map((event) => event.type),
      ["result"],
    );
    await page.goto(base);
    await page.locator(".results-panel .match-row").waitFor();
    assert.deepEqual(
      await page.locator(".results-panel .match-teams b").allTextContents(),
      ["0", "0"],
      "the hourly result must also update the public home, even while its calendar source is still blank",
    );
    assert.equal(await page.locator(".pending-results-panel").count(), 0);
    await page
      .getByText("No hay próximos partidos publicados.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: /^Avisos de partidos(?:, \d+ sin leer)?$/ })
      .click();
    await page
      .getByText("Resultado publicado: 0–0.", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Ver acta", exact: true }).count(),
      0,
    );
    await page.goto(base + "/admin");
    now += 60_000;
    sourceFailure = true;
    const failed = await forceResults();
    assert.equal(matchCalls, 3);
    assert.ok(failed.results.lastError);
    assert.equal(failed.results.lastCheckedAt, checked.results.lastCheckedAt);
    await page
      .getByRole("alert")
      .filter({
        hasText: "No se han podido comprobar todos los resultados y actas",
      })
      .waitFor();
    assert.equal(
      await page.locator(".admin-notifications .notification-message").count(),
      0,
      "a failed results check must not retain a success message",
    );
    now += 60_000;
    sourceFailure = false;
    update = { ...update, reportPublished: true };
    const recovered = await forceResults();
    assert.equal(matchCalls, 4);
    assert.equal(recovered.results.lastError, null);
    assert.equal(recovered.results.lastCheckedAt, new Date(now).toISOString());
    assert.equal(recovered.nextCheckAt, initialStatus.nextCheckAt);
    assert.equal(
      recovered.results.nextCheckAt,
      initialStatus.results.nextCheckAt,
    );
    await page
      .getByRole("status")
      .filter({
        hasText: "Resultados y actas comprobados.",
      })
      .waitFor();
    assert.equal(
      await page.locator(".admin-notifications [role=alert]").count(),
      0,
    );
    await page.goto(base);
    await page
      .getByRole("button", { name: /^Avisos de partidos(?:, \d+ sin leer)?$/ })
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
    await page
      .getByText("Resultados y actas: última revisión", { exact: true })
      .waitFor();
    await page.getByText("Próxima revisión horaria", { exact: true }).waitFor();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
    }
    await page.locator(".admin-notifications").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/results-check-admin-mobile.png",
    });
    assert.deepEqual(errors, []);
    console.log(
      "Results browser checks passed: manual results/report rechecks before the next slot, distinct notices, failed check feedback and recovery, report link, unchanged schedules and mobile layout.",
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
