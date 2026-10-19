const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const { createApp } = await import("../server/index.mjs");
  const { fakeProvider, fakeWeather, TEST_PASSWORD } =
    await import("./helpers.mjs");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "futboleros-browser-"),
  );
  const legacy = await fakeProvider().snapshot("1001");
  for (const player of legacy.squad) delete player.sourceUrl;
  await fs.writeFile(path.join(directory, "1001.json"), JSON.stringify(legacy));
  const server = createApp({
    directory,
    provider: fakeProvider(),
    adminPassword: TEST_PASSWORD,
    weather: fakeWeather(),
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  try {
    await fs.mkdir("test-results", { recursive: true });
    const publicContext = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
      reducedMotion: "reduce",
      hasTouch: true,
    });
    await publicContext.addInitScript(() =>
      localStorage.setItem(
        "futboleros.teams",
        JSON.stringify({
          selected: "1002",
          teams: [{ id: "1002", name: "Old browser selection" }],
        }),
      ),
    );
    const page = await publicContext.newPage();
    await publicContext.route(
      /^https:\/\/www\.rffm\.es\/(?:ficha(?:equipo|jugador)|acta-partido)\/\d+$/,
      (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Ficha de prueba</title><h1>Ficha de prueba</h1>",
        }),
    );
    async function openProfile(link, expected, card, touch = false) {
      assert.equal(await link.getAttribute("href"), expected);
      assert.equal(await link.getAttribute("target"), "_blank");
      assert.match(await link.getAttribute("rel"), /noopener/);
      const opened = page.waitForEvent("popup");
      if (touch) await (card || link).tap({ position: { x: 8, y: 8 } });
      else if (card) await card.click({ position: { x: 8, y: 8 } });
      else await link.click();
      const popup = await opened;
      await popup.waitForLoadState("domcontentloaded");
      assert.equal(popup.url(), expected);
      assert.equal(await popup.evaluate(() => window.opener === null), true);
      await popup.close();
    }
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page
      .getByText("El equipo aún no está configurado.", { exact: false })
      .waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    const adminContext = await browser.newContext({
      viewport: { width: 1100, height: 900 },
      reducedMotion: "reduce",
    });
    const admin = await adminContext.newPage();
    admin.on("pageerror", (e) => errors.push(e.message));
    await admin.goto(base + "/admin");
    await admin.getByLabel("Contraseña de administración").fill("wrong");
    await admin.getByRole("button", { name: "Entrar al panel" }).click();
    await admin
      .getByRole("alert")
      .filter({ hasText: "Contraseña incorrecta" })
      .waitFor();
    await admin.getByLabel("Contraseña de administración").fill(TEST_PASSWORD);
    await admin.getByRole("button", { name: "Entrar al panel" }).click();
    await admin
      .getByRole("heading", { name: "Equipo público", exact: true })
      .waitFor();
    assert.ok(
      !(await admin.evaluate(() => document.cookie)).includes(
        "futboleros_admin",
      ),
    );
    await admin
      .getByLabel("Nombre del club, enlace de la ficha o identificador")
      .fill("Olivares");
    await admin
      .getByRole("button", { name: "C.D. Olivares A Alevín F-7", exact: true })
      .click();
    await admin
      .getByRole("heading", { name: "C.D. Olivares A", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(async () => (await fetch("/api/team")).json()),
      null,
      "review must not publish",
    );
    await admin.getByRole("button", { name: "Guardar equipo público" }).click();
    await admin
      .getByRole("status")
      .filter({ hasText: "Equipo guardado" })
      .waitFor();
    await admin
      .getByRole("heading", {
        name: "Ubicación para la previsión",
        exact: true,
      })
      .waitFor();
    await admin
      .getByText("Introducir coordenadas del campo", { exact: true })
      .click();
    await admin.getByLabel("Latitud del campo").fill("40.4");
    await admin.getByLabel("Longitud del campo").fill("-3.7");
    await admin
      .getByRole("button", { name: "Guardar ubicación del campo", exact: true })
      .click();
    await admin
      .getByRole("status")
      .filter({ hasText: "Ubicación guardada" })
      .waitFor();
    await admin.screenshot({
      path: "test-results/admin-desktop.png",
      fullPage: true,
    });
    await page.goto(base + "/?team=1002");
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    await page.locator(".weather-values").waitFor();
    assert.deepEqual(
      await page.locator(".weather-values strong").allTextContents(),
      ["0 °C", "0 %"],
    );
    assert.equal(
      await page.locator(".team-banner h2").textContent(),
      "C.D. Olivares A",
    );
    assert.equal(
      await page.locator(".team-banner .team-position").textContent(),
      "3.º actual",
    );
    assert.deepEqual(
      await page.locator(".matchup .team-position").allTextContents(),
      ["7.º actual", "3.º actual"],
    );
    await openProfile(
      page.locator(".matchup h3 a").first(),
      "https://www.rffm.es/fichaequipo/2006",
    );
    assert.equal(
      await page
        .locator(".results-panel .match-row")
        .first()
        .getByRole("link", { name: "Deportivo Norte", exact: true })
        .getAttribute("href"),
      "https://www.rffm.es/fichaequipo/2005",
    );
    const chances = await page
      .locator(".forecast-outcomes strong")
      .allTextContents();
    assert.equal(chances.length, 3);
    assert.equal(
      chances.reduce((sum, text) => sum + Number.parseInt(text), 0),
      100,
    );
    assert.equal(
      await page.locator(".results-panel .team-position").count(),
      6,
    );
    await page.getByText("Cómo se calcula", { exact: true }).click();
    await page
      .getByText("Compara la posición actual", { exact: false })
      .waitFor();
    await page.getByText("Cómo se calcula", { exact: true }).click();
    assert.equal(await page.locator(".selected-row").count(), 1);
    assert.equal(
      await page
        .getByRole("button", {
          name: /Cambiar equipo|Elegir mi equipo|Seguir equipo/,
        })
        .count(),
      0,
    );
    assert.deepEqual(
      await page.evaluate(async () => ({
        other: (await fetch("/api/teams/1002")).status,
        search: (await fetch("/api/search?q=Olivares")).status,
        write: (
          await fetch("/api/admin/config", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Futboleros-Admin": "1",
            },
            body: JSON.stringify({ teamId: "1002" }),
          })
        ).status,
      })),
      { other: 403, search: 401, write: 401 },
    );
    await page.screenshot({
      path: "test-results/desktop.png",
      fullPage: false,
    });
    const nav = page.getByRole("navigation", {
      name: "Principal",
      exact: true,
    });
    await nav.getByRole("button", { name: "Calendario", exact: true }).click();
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Ver acta", exact: true }).count(),
      await page.locator(".match-row").count(),
    );
    await openProfile(
      page
        .locator(".match-row")
        .first()
        .getByRole("link", { name: "Ver acta", exact: true }),
      "https://www.rffm.es/acta-partido/3006",
    );
    assert.deepEqual(
      await page
        .locator(".match-row")
        .first()
        .locator(".team-position")
        .allTextContents(),
      ["7.º actual", "3.º actual"],
    );
    assert.equal(
      await page
        .locator(".match-row")
        .first()
        .getByRole("link", { name: "Escuela Río Verde", exact: true })
        .getAttribute("href"),
      "https://www.rffm.es/fichaequipo/2006",
    );
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar calendario" }).click();
    assert.match((await download).suggestedFilename(), /\.ics$/);
    await page.getByRole("button", { name: "Resultados", exact: true }).click();
    assert.equal(
      await page.getByRole("link", { name: "Ver acta", exact: true }).count(),
      await page.locator(".match-row").count(),
    );
    await openProfile(
      page
        .locator(".match-row")
        .first()
        .getByRole("link", { name: "Ver acta", exact: true }),
      "https://www.rffm.es/acta-partido/3005",
    );
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    assert.equal(
      await page.getByRole("link", { name: "Ver acta", exact: true }).count(),
      14,
    );
    assert.ok((await page.locator(".match-row").count()) > 0);
    assert.equal(
      await page.locator(".match-row .team-position").count(),
      2 * (await page.locator(".match-row").count()),
    );
    assert.equal(
      await page.locator(".match-row .team-position.unavailable").count(),
      0,
    );
    await nav
      .getByRole("button", { name: "Clasificación", exact: true })
      .click();
    assert.equal(await page.locator("tbody tr").count(), 8);
    assert.equal(
      await page
        .getByRole("link", { name: "Atlético del Parque", exact: true })
        .getAttribute("href"),
      "https://www.rffm.es/fichaequipo/2001",
    );
    await nav.getByRole("button", { name: "Plantilla", exact: true }).click();
    assert.equal(await page.locator(".player-card").count(), 12);
    assert.equal(await page.locator(".player-profile-link").count(), 1);
    assert.equal(
      await page.locator(".player-card").nth(1).getByRole("link").count(),
      0,
    );
    await openProfile(
      page.getByRole("link", { name: "Jugador de ejemplo 1", exact: true }),
      "https://www.rffm.es/fichajugador/5001",
      page.locator(".player-card").first(),
    );
    await page.screenshot({
      path: "test-results/squad-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openProfile(
      page.locator(".player-profile-link"),
      "https://www.rffm.es/fichajugador/5001",
      undefined,
      true,
    );
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    await page.screenshot({
      path: "test-results/squad-mobile.png",
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    for (const width of [320, 360, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
      assert.equal(await page.locator(".forecast-outcomes strong").count(), 3);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    const mobileNav = page.getByRole("navigation", {
      name: "Navegación móvil",
    });
    await mobileNav
      .getByRole("button", { name: "Calendario", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
      await openProfile(
        page
          .locator(".match-row")
          .first()
          .getByRole("link", { name: "Ver acta", exact: true }),
        "https://www.rffm.es/acta-partido/3006",
        undefined,
        true,
      );
    }
    await page.screenshot({
      path: "test-results/calendar-mobile.png",
      fullPage: true,
    });
    await mobileNav.getByRole("button", { name: "Liga", exact: true }).click();
    await page
      .getByRole("heading", { name: "Clasificación.", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.locator(".sidebar.open").waitFor();
    await page
      .getByRole("button", { name: "Cerrar menú", exact: true })
      .click({ position: { x: 350, y: 100 } });
    await admin
      .getByLabel("Nombre del club, enlace de la ficha o identificador")
      .fill("https://www.rffm.es/fichaequipo/404");
    await admin.getByRole("button", { name: "Revisar equipo" }).click();
    await admin
      .getByRole("alert")
      .filter({ hasText: "ficha pública" })
      .waitFor();
    assert.equal(
      (await page.evaluate(async () => (await fetch("/api/team")).json())).team
        .id,
      "1001",
    );
    await admin
      .getByLabel("Nombre del club, enlace de la ficha o identificador")
      .fill("1002");
    await admin.getByRole("button", { name: "Revisar equipo" }).click();
    await admin
      .getByRole("button", { name: "Guardar equipo público" })
      .waitFor();
    await admin.getByRole("button", { name: "Guardar equipo público" }).click();
    await admin
      .getByRole("status")
      .filter({ hasText: "Equipo guardado" })
      .waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    assert.equal(
      await page.locator(".team-banner h2").textContent(),
      "C.D. Olivares Infantil A",
    );
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    await admin.screenshot({
      path: "test-results/admin-mobile.png",
      fullPage: true,
    });
    await admin.getByRole("button", { name: "Cerrar sesión" }).click();
    await admin.getByLabel("Contraseña de administración").waitFor();
    await admin.reload();
    await admin.getByLabel("Contraseña de administración").waitFor();
    assert.equal(
      (await page.evaluate(async () => (await fetch("/api/team")).json())).team
        .id,
      "1002",
    );
    await page.route("**/api/team", async (route) => {
      const response = await route.fetch();
      const snapshot = await response.json();
      snapshot.standings = [];
      for (const match of snapshot.matches) {
        delete match.homeId;
        delete match.awayId;
      }
      snapshot.squad[0].sourceUrl = "javascript:alert(1)";
      snapshot.squad[1].sourceUrl = "https://example.invalid/fichajugador/5001";
      for (const match of snapshot.matches)
        match.id = "missing-report-id" + match.round;
      await route.fulfill({ response, json: snapshot });
    });
    await page.route("**/api/weather?*", (route) =>
      route.fulfill({
        json: {
          available: false,
          reason:
            "La previsión meteorológica no está disponible en este momento.",
        },
      }),
    );
    await page.reload();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    await page.locator(".forecast-unavailable").waitFor();
    await page
      .getByText(
        "La previsión meteorológica no está disponible en este momento.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.locator(".forecast-outcomes").count(), 0);
    assert.deepEqual(
      await page.locator(".matchup .team-position").allTextContents(),
      ["Sin posición", "Sin posición"],
    );
    assert.equal(await page.locator(".matchup h3 a").count(), 0);
    await mobileNav
      .getByRole("button", { name: "Plantilla", exact: true })
      .click();
    assert.equal(await page.locator(".player-profile-link").count(), 0);
    assert.equal(
      await page.getByText("Ficha no disponible", { exact: true }).count(),
      12,
    );
    await mobileNav
      .getByRole("button", { name: "Calendario", exact: true })
      .click();
    assert.equal(
      await page.getByRole("link", { name: "Ver acta", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByText("Acta no disponible", { exact: true }).count(),
      await page.locator(".match-row").count(),
    );
    assert.deepEqual(errors, []);
    await publicContext.close();
    await adminContext.close();
    console.log(
      "Browser checks passed: admin flow, locked public team, current positions, estimates, player and team profile links, missing data, four views, ICS, persistence, logout and mobile layouts.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
