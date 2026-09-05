const fs = require("fs");
const path = require("path");
const os = require("os");
const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const STORAGE_KEY = "deli-sales-tracker-v1";

function snapshot(overrides = {}) {
  return {
    view: "day",
    records: {
      "2026-09-01": {
        date: "2026-09-01",
        services: { uber: { sales: 12345, count: 9 } },
        workSessions: [],
        workHours: 5,
        workHoursOverride: 0,
        breakHours: 0,
        expenses: [],
      },
    },
    targets: {},
    providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
    vehicles: [],
    taxProfiles: {},
    assets: { cash: 777000, securities: 250000, liabilities: 100000 },
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

async function seed(page, value = snapshot()) {
  await page.addInitScript((stored) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    // 初回だけ用意する。再読み込みで上書きすると、破損からの復元を検証できない。
    if (!localStorage.getItem("deli-sales-tracker-v1")) {
      localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(stored));
    }
  }, value);
}

async function readMirror(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("okumeter-vault");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise((resolve) => {
      const store = db.transaction("mirror", "readonly").objectStore("mirror");
      const get = store.get("latest");
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    });
  });
}

test("ファイル保存には資産が含まれ、読み込みで資産まで戻る", async ({ page }) => {
  await seed(page);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="settings"]').click();

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportJson").click(),
  ]).then(([event]) => event);

  const saved = path.join(os.tmpdir(), `okumeter-export-${Date.now()}.json`);
  await download.saveAs(saved);
  const exported = JSON.parse(fs.readFileSync(saved, "utf8"));

  // 資産は億メーターの中心となる入力値。ここが欠けると機種変更で失われる。
  expect(exported.assets).toMatchObject({ cash: 777000, securities: 250000, liabilities: 100000 });
  expect(Object.keys(exported.records)).toEqual(["2026-09-01"]);
  expect(exported.schemaVersion).toBeGreaterThanOrEqual(1);

  // 別の内容で上書きしてから読み込み、資産まで戻ることを確かめる。
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key));
    stored.assets = { cash: 1, securities: 2, liabilities: 3 };
    stored.records = {};
    localStorage.setItem(key, JSON.stringify(stored));
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-screen="settings"]').click();
  await page.locator("#importJson").setInputFiles(saved);
  await expect(page.locator("#toast")).toContainText("ファイルからデータを読み込みました");

  const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(restored.assets).toMatchObject({ cash: 777000, securities: 250000, liabilities: 100000 });
  expect(Object.keys(restored.records)).toEqual(["2026-09-01"]);

  fs.rmSync(saved, { force: true });
});

test("保存データが壊れても端末内の控えから復元し、壊れた内容は退避する", async ({ page }) => {
  await seed(page);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  // 起動時に控えが作られるまで待つ。
  await expect.poll(async () => Boolean(await readMirror(page)), { timeout: 15000 }).toBe(true);

  await page.evaluate((key) => localStorage.setItem(key, '{"records": {壊れた'), STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.locator("#toast")).toContainText("復元しました");

  // 壊れた値を残したままにせず、復元した内容で保存し直している。
  const repaired = await page.evaluate((key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }, STORAGE_KEY);
  expect(repaired).not.toBeNull();
  expect(Object.keys(repaired.records)).toEqual(["2026-09-01"]);
  expect(repaired.assets.cash).toBe(777000);

  // 読めなかった生データは捨てずに退避しておく。
  const quarantined = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("okumeter-vault");
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise((resolve) => {
      const store = db.transaction("quarantine", "readonly").objectStore("quarantine");
      const all = store.getAll();
      all.onsuccess = () => resolve(all.result || []);
      all.onerror = () => resolve([]);
    });
  });
  expect(quarantined.length).toBeGreaterThan(0);
  expect(quarantined[0].raw).toContain("壊れた");
});

test("読み込みの直前に復元ポイントを作り、そこから戻せる", async ({ page }) => {
  await seed(page);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="settings"]').click();

  const other = path.join(os.tmpdir(), `okumeter-other-${Date.now()}.json`);
  fs.writeFileSync(other, JSON.stringify({
    records: { "2026-08-15": { date: "2026-08-15", services: { uber: { sales: 500, count: 1 } } } },
    targets: {},
    providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
    vehicles: [],
    taxProfiles: {},
  }));

  await page.locator("#importJson").setInputFiles(other);
  await expect(page.locator("#toast")).toContainText("ファイルからデータを読み込みました");

  const beforeImport = page.locator(".restore-point-item", { hasText: "ファイル読み込みの直前" });
  await expect(beforeImport).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await beforeImport.locator("button").click();
  await expect(page.locator("#toast")).toContainText("復元ポイントから戻しました");

  const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(Object.keys(restored.records)).toEqual(["2026-09-01"]);

  fs.rmSync(other, { force: true });
});

test("表示テーマを選ぶと再読み込み後も保たれる", async ({ page }) => {
  await seed(page);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="settings"]').click();

  await page.locator('[data-theme-choice="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('[data-theme-choice="dark"]')).toHaveAttribute("aria-checked", "true");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const painted = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(painted).toBe("rgb(0, 0, 0)");

  await page.locator('[data-screen="settings"]').click();
  await page.locator('[data-theme-choice="system"]').click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
});

test("クラウド同期は未設定なら準備中と表示し、記録を送信しない", async ({ page }) => {
  const requests = [];
  page.on("request", (outgoing) => requests.push(outgoing.url()));

  await seed(page);
  await page.route("**/api/ranking-config", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ available: false }),
  }));

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="settings"]').click();

  await expect(page.locator("#cloudSyncUnavailable")).toBeVisible();
  await expect(page.locator("#cloudSyncLoginForm")).toBeHidden();
  expect(requests.some((url) => url.includes("supabase.co"))).toBeFalsy();
});
