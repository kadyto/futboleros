const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const { createApp } = await import("../server/index.mjs");
  const { demoSnapshot } = await import("../server/demo.mjs");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "futboleros-browser-"),
  );
  const provider = {
    snapshot: async (id) => {
      if (id === "404") {
        const e = new Error(
          "Este equipo no tiene una ficha pública disponible.",
        );
        e.status = 404;
        throw e;
      }
      const v = demoSnapshot();
      v.team.id = id;
      for (const m of v.matches) {
        if (m.homeId === "demo") m.homeId = id;
        if (m.awayId === "demo") m.awayId = id;
      }
      for (const row of v.standings) if (row.teamId === "demo") row.teamId = id;
      delete v.demo;
      return v;
    },
    search: async () => ({
      teams: [
        { id: "1001", name: "C.D. Olivares A", category: "Alevín F-7" },
        { id: "1002", name: "C.D. Olivares A", category: "Infantil F-11" },
      ],
      more: false,
    }),
  };
  const server = createApp({ directory, provider }).listen(0, "127.0.0.1");
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
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("dialog").waitFor();
    await page
      .getByLabel("Nombre, enlace de la ficha o identificador")
      .fill("Olivares");
    await page
      .getByRole("button", { name: "C.D. Olivares A Alevín F-7", exact: true })
      .click();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator(".selected-row").count(), 1);
    assert.equal(await page.locator(".position>b").textContent(), "3º");
    await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
    await page
      .getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("button", { name: "Calendario", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    const dl = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar calendario" }).click();
    assert.match((await dl).suggestedFilename(), /\.ics$/);
    await page.getByRole("button", { name: "Resultados", exact: true }).click();
    assert.ok((await page.locator(".match-row").count()) > 0);
    await page
      .getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("button", { name: "Clasificación", exact: true })
      .click();
    assert.equal(await page.locator("tbody tr").count(), 8);
    await page
      .getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("button", { name: "Plantilla", exact: true })
      .click();
    assert.equal(await page.locator(".player-card").count(), 12);
    await page.reload();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .getByRole("button", { name: "Cambiar equipo", exact: true })
      .click();
    await page
      .getByLabel("Nombre, enlace de la ficha o identificador")
      .fill("404");
    await page
      .getByRole("button", { name: "Seguir equipo", exact: true })
      .click();
    await page.locator(".picker-error").waitFor();
    assert.match(
      await page.locator(".picker-error").textContent(),
      /ficha pública/,
    );
    await page.getByRole("button", { name: "Cerrar selección" }).click();
    await page.reload();
    await page.getByRole("heading", { name: "Tu equipo, a mano." }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    await page
      .getByRole("navigation", { name: "Navegación móvil" })
      .getByRole("button", { name: "Calendario", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    await page
      .getByRole("navigation", { name: "Navegación móvil" })
      .getByRole("button", { name: "Liga", exact: true })
      .click();
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
    assert.deepEqual(errors, []);
    await context.close();
    const demoContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const demoPage = await demoContext.newPage();
    await demoPage.goto(base);
    await demoPage
      .getByRole("button", {
        name: "Echar un vistazo con un equipo de ejemplo",
      })
      .click();
    await demoPage.locator(".demo-notice").waitFor();
    assert.equal(
      await demoPage.evaluate(() => localStorage.getItem("futboleros.teams")),
      JSON.stringify({ teams: [] }),
    );
    await demoContext.close();
    console.log(
      "Browser checks passed: selection, categories, saved team, four views, ICS, error, demo, mobile navigation, no page overflow.",
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
