const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { createECDH, randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const { createApp } = await import("../server/index.mjs");
  const { PushService } = await import("../server/push.mjs");
  const { fakeProvider, fakeWeather, TEST_PASSWORD } =
    await import("./helpers.mjs");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "futboleros-notifications-browser-"),
  );
  const source = await fakeProvider().snapshot("1001");
  const sent = [];
  const push = new PushService({
    directory,
    send: async (_sub, payload) => sent.push(payload),
  });
  const app = createApp({
    directory,
    provider: {
      ...fakeProvider(),
      snapshot: async () => structuredClone(source),
    },
    pushService: push,
    weather: fakeWeather(),
    adminPassword: TEST_PASSWORD,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    await fs.mkdir("test-results", { recursive: true });
    const admin = await browser.newPage({
      viewport: { width: 1100, height: 900 },
    });
    await admin.goto(base + "/admin");
    await admin.getByLabel("Contraseña de administración").fill(TEST_PASSWORD);
    await admin.getByRole("button", { name: "Entrar al panel" }).click();
    await admin
      .getByLabel("Nombre del club, enlace de la ficha o identificador")
      .fill("1001");
    await admin.getByRole("button", { name: "Revisar equipo" }).click();
    await admin.getByRole("button", { name: "Guardar equipo público" }).click();
    await admin
      .getByRole("heading", { name: "Avisos de cambios en partidos" })
      .waitFor();
    const context = await browser.newContext({
      viewport: { width: 1100, height: 900 },
    });
    const data = {
      endpoint: "https://fcm.googleapis.com/fcm/send/browser-test",
      keys: {
        p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
      expirationTime: null,
    };
    await context.addInitScript((data) => {
      let subscribed = false;
      const subscription = {
        toJSON: () => data,
        unsubscribe: async () => {
          subscribed = false;
          return true;
        },
      };
      const registration = {
        pushManager: {
          getSubscription: async () => (subscribed ? subscription : null),
          subscribe: async () => {
            subscribed = true;
            return subscription;
          },
        },
      };
      window.__notificationPermissionCalls = 0;
      class NotificationMock {
        static permission = "default";
        static async requestPermission() {
          window.__notificationPermissionCalls++;
          this.permission = "granted";
          return "granted";
        }
      }
      Object.defineProperty(window, "Notification", {
        value: NotificationMock,
      });
      Object.defineProperty(window, "PushManager", { value: class {} });
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          getRegistration: async () => registration,
          register: async () => registration,
          ready: Promise.resolve(registration),
        },
      });
    }, data);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page
      .getByRole("button", { name: "Avisos de partidos", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__notificationPermissionCalls),
      0,
    );
    await page
      .getByRole("button", { name: "Avisos de partidos", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Sin cambios registrados" })
      .waitFor();
    await page
      .getByRole("button", { name: "Activar avisos en este dispositivo" })
      .click();
    await page
      .getByRole("heading", { name: "Avisos activados en este dispositivo" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__notificationPermissionCalls),
      1,
    );
    assert.equal((await push.list()).length, 1);
    await page
      .getByRole("button", { name: "Probar aviso", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Prueba enviada" })
      .waitFor();
    assert.equal(sent.length, 1);
    await page.getByRole("button", { name: "Cerrar avisos" }).click();
    const upcoming = source.matches.find(
      (match) => match.status === "scheduled",
    );
    const previous = upcoming.time;
    upcoming.time = previous === "13:45" ? "14:00" : "13:45";
    await admin
      .getByRole("button", { name: "Comprobar calendario ahora" })
      .click();
    await admin
      .getByRole("status")
      .filter({ hasText: "Calendario comprobado" })
      .waitFor();
    assert.equal(sent.length, 2);
    const loaded = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/notifications") && response.ok(),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await loaded;
    await page
      .getByRole("button", { name: "Avisos de partidos, 1 sin leer" })
      .waitFor();
    await page
      .getByRole("button", { name: "Avisos de partidos, 1 sin leer" })
      .click();
    await page.locator(".notification-list article").waitFor();
    assert.equal(
      await page.locator(".notification-list del").textContent(),
      previous,
    );
    assert.equal(
      await page.locator(".notification-list strong").textContent(),
      upcoming.time,
    );
    assert.equal(await page.locator(".notification-count").count(), 0);
    await page.screenshot({ path: "test-results/notifications-desktop.png" });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
      assert.ok(
        await page
          .locator(".notification-dialog")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/notifications-mobile.png" });
    await page
      .getByRole("button", { name: "Ver calendario", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Avisos de partidos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Desactivar avisos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Activar avisos en este dispositivo" })
      .waitFor();
    assert.equal((await push.list()).length, 0);
    await page.getByRole("button", { name: "Cerrar avisos" }).click();
    await page.goto(base + "/?view=calendar");
    await page
      .getByRole("heading", { name: "Calendario.", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    const workerPage = await browser.newPage();
    await workerPage.goto(base);
    const script = await workerPage.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL;
    });
    assert.equal(script, base + "/sw.js");
    await workerPage.close();
    console.log(
      "Notification browser checks passed: opt-in without automatic prompts, activation, test delivery, unread markers, changed hours, calendar links, unsubscribe, mobile layouts and real worker installation.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
