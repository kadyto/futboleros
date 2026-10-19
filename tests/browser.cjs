const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const { createApp } = await import("../server/index.mjs");
  const { fakeProvider, TEST_PASSWORD } = await import("./helpers.mjs");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "futboleros-browser-"),
  );
  const server = createApp({
    directory,
    provider: fakeProvider(),
    adminPassword: TEST_PASSWORD,
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
    await admin.screenshot({
      path: "test-results/admin-desktop.png",
      fullPage: true,
    });
    await page.goto(base + "/?team=1002");
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    assert.equal(
      await page.locator(".team-banner h2").textContent(),
      "C.D. Olivares A",
    );
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
    await page.screenshot({ path: "test-results/desktop.png", fullPage: false });
    const nav = page.getByRole("navigation", {
      name: "Principal",
      exact: true,
    });
    await nav.getByRole("button", { name: "Calendario", exact: true }).click();
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar calendario" }).click();
    assert.match((await download).suggestedFilename(), /\.ics$/);
    await page.getByRole("button", { name: "Resultados", exact: true }).click();
    assert.ok((await page.locator(".match-row").count()) > 0);
    await nav
      .getByRole("button", { name: "Clasificación", exact: true })
      .click();
    assert.equal(await page.locator("tbody tr").count(), 8);
    await nav.getByRole("button", { name: "Plantilla", exact: true }).click();
    assert.equal(await page.locator(".player-card").count(), 12);
    await page.reload();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
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
    assert.deepEqual(errors, []);
    await publicContext.close();
    await adminContext.close();
    console.log(
      "Browser checks passed: admin login, search, review without publishing, save, independent public browser, locked APIs, ignored old browser selection, four views, ICS, replacement, logout and mobile layouts.",
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
