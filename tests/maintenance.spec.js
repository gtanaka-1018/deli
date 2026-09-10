const fs = require("node:fs");
const { test, expect } = require("@playwright/test");
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" }, viewport: { width: 390, height: 844 } });
const URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const vehicles = [{ id: "bike-1", type: "motorcycle", label: "配達バイク", visible: true }, { id: "bike-2", type: "bicycle", label: "予備の自転車", visible: false }];
const entry = (overrides = {}) => ({ id: "oil-1", vehicleId: "bike-1", date: "2026-09-01", odometerKm: 12000, description: "オイル交換", memo: "交換後の状態を確認", ...overrides });

async function open(page, maintenance = [], custom = {}) {
  await page.addInitScript((snapshot) => {
    if (!localStorage.getItem("deli-sales-tracker-v1")) localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(snapshot));
  }, { schemaVersion: 4, records: {}, targets: {}, vehicles, maintenance, assets: { cash: 123456 }, ...custom });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="maintenance"]').click();
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("deli-sales-tracker-v1")));

test("関連記事は車両に応じて変わり、記録を送信せず別タブで開く", async ({ page, context }) => {
  const outbound = [];
  await context.route("https://erabibase.com/**", async (route) => {
    outbound.push({ url: route.request().url(), headers: await route.request().allHeaders() });
    await route.fulfill({ contentType: "text/html", body: "<title>記事のテスト</title>" });
  });
  await open(page, [entry()], { vehicles: [{ ...vehicles[0], label: "ＮＭＡＸ１２５ 非公開の車両名" }, vehicles[1]] });
  await expect(page.locator("#erabibaseArticles")).toContainText("スマホホルダーの適合を確認");
  expect(outbound).toHaveLength(0);
  const before = await stored(page);
  const [article] = await Promise.all([context.waitForEvent("page"), page.locator("#erabibaseArticles a").first().click()]);
  await article.waitForLoadState();
  expect(await article.evaluate(() => window.opener)).toBeNull();
  const request = outbound.find((item) => item.url.includes("kaedear-kdr-m28-delivery-review/"));
  const url = new globalThis.URL(request.url);
  expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "okumeter", utm_medium: "app", utm_campaign: "delivery_support", utm_content: "garage_nmax" });
  expect(request.headers.referer).toBeUndefined();
  expect(await stored(page)).toEqual(before);
  await article.close();
  await page.locator('[data-garage-vehicle="bike-2"]').click();
  await expect(page.locator("#erabibaseArticles a")).toHaveCount(2);
  await expect(page.locator("#erabibaseArticles")).not.toContainText("NMAX");
  await expect(page.locator("#erabibaseArticles")).toContainText("レインウェア");
});

test("車体別に追加・編集・削除し、再読込と復元で整備履歴を保持する", async ({ page }) => {
  await open(page, [entry({ id: "other", vehicleId: "bike-2", description: "チェーン清掃" })]);
  await expect(page.locator("#maintenanceCount")).toHaveText("0件");
  await page.locator("#addMaintenance").click();
  await page.locator("#maintenanceDate").fill("2026-09-10");
  await page.locator("#maintenanceOdometer").fill("15000.5");
  await page.locator('[data-maintenance-preset="オイル交換"]').click();
  await page.locator("#maintenanceMemo").fill("次回はタイヤも点検");
  await page.locator("#maintenanceSave").click();
  await expect(page.locator("#maintenanceDialog")).toBeHidden();
  await expect(page.locator("#maintenanceHistory")).toContainText("15,000.5 km");
  await page.locator("[data-maintenance-edit]").click();
  await page.locator("#maintenanceDescription").fill("オイル・フィルター交換");
  await page.locator("#maintenanceSave").click();
  await expect(page.locator("#maintenanceHistory")).toContainText("オイル・フィルター交換");
  expect((await stored(page)).records).toEqual({});
  expect((await stored(page)).assets.cash).toBe(123456);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-screen="maintenance"]').click();
  await expect(page.locator("#maintenanceHistory")).toContainText("オイル・フィルター交換");
  await page.locator('[data-garage-vehicle="bike-2"]').click();
  await expect(page.locator("#maintenanceHistory")).toContainText("チェーン清掃");
  await expect(page.locator("#maintenanceHistory")).not.toContainText("オイル");
  await page.locator('[data-garage-vehicle="bike-1"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-maintenance-delete]").click();
  await expect(page.locator("#maintenanceCount")).toHaveText("0件");
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator("#restorePointList")).toContainText("整備履歴の削除直前");
  await expect(page.locator("#restorePointList")).toContainText("整備2件");
  const restore = page.locator("#restorePointList [data-restore-id]").first();
  page.once("dialog", (dialog) => dialog.accept());
  await restore.click();
  await expect(page.locator("#toast")).toContainText("復元ポイントから戻しました");
  await page.locator('[data-screen="maintenance"]').click();
  await expect(page.locator("#maintenanceHistory")).toContainText("オイル・フィルター交換");
});

test("車両がなくても整備画面から登録して記録を始められる", async ({ page }) => {
  await open(page, [], { vehicles: [] });
  await expect(page.locator("#addMaintenance")).toBeDisabled();
  await page.locator("#maintenanceAddVehicle").click();
  await page.locator("#vehicleName").fill("新しい相棒");
  await page.locator("#vehicleDialogSubmit").click();
  await expect(page.locator("#maintenanceVehicleName")).toHaveText("新しい相棒");
  await expect(page.locator("#addMaintenance")).toBeEnabled();
  await page.locator("#addMaintenance").click();
  await page.locator("#maintenanceDescription").fill("納車時点検");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#maintenanceCancel").click();
  await expect(page.locator("#maintenanceDescription")).toHaveValue("納車時点検");
  await page.locator("#maintenanceSave").click();
  await expect(page.locator("#maintenanceDialog")).toBeHidden();
  expect((await stored(page)).maintenance[0].odometerKm).toBeNull();
});

test("JSON出力・読込・同期スナップショットが整備履歴を保持し、旧ファイルでも失わない", async ({ page }, testInfo) => {
  await open(page, [entry()]);
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator("#backupCareTitle")).toHaveText("最初のバックアップがおすすめです");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#exportJson").click()]);
  const path = testInfo.outputPath("maintenance-backup.json");
  await download.saveAs(path);
  const exported = JSON.parse(fs.readFileSync(path, "utf8"));
  expect(exported.maintenance).toEqual([entry()]);
  expect(exported.schemaVersion).toBe(4);
  expect(await page.evaluate(() => window.DeliSyncData.hasLocalData())).toBe(true);
  await page.locator("#importJson").setInputFiles({ name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ records: {}, vehicles: [] })) });
  await expect(page.locator("#toast")).toContainText("ファイルからデータを読み込みました");
  expect((await stored(page)).maintenance).toEqual([entry()]);
  expect((await stored(page)).vehicles.some((vehicle) => vehicle.id === "bike-1")).toBe(true);
  await page.evaluate(async () => window.DeliSyncData.applyRemoteSnapshot({ records: {}, vehicles: [] }));
  expect((await stored(page)).maintenance).toEqual([entry()]);
  await page.evaluate(async () => window.DeliSyncData.applyRemoteSnapshot({ records: {}, vehicles: [], maintenance: [] }));
  expect((await stored(page)).maintenance).toEqual([]);
  await page.locator("#importJson").setInputFiles(path);
  await expect.poll(async () => (await stored(page)).maintenance.length).toBe(1);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-screen="maintenance"]').click();
  await expect(page.locator("#maintenanceHistory")).toContainText("オイル交換");
});

test("保存失敗時も下書きと保存済みの履歴を残す", async ({ page }) => {
  await open(page, [entry()]);
  await page.locator("[data-maintenance-edit]").click();
  await page.locator("#maintenanceDescription").fill("編集後の内容");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "deli-sales-tracker-v1") throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#maintenanceSave").click();
  await expect(page.locator("#maintenanceError")).toContainText("保存できませんでした");
  await expect(page.locator("#maintenanceDescription")).toHaveValue("編集後の内容");
  expect((await stored(page)).maintenance[0].description).toBe("オイル交換");
  expect(await page.evaluate(() => window.DeliSyncData.getSnapshot().maintenance[0].description)).toBe("オイル交換");
});

test("編集中に同期で変更された履歴を上書きせず、入力を残す", async ({ page }) => {
  await open(page, [entry()]);
  await page.locator("[data-maintenance-edit]").click();
  await page.locator("#maintenanceDescription").fill("この端末の編集中の内容");
  await page.evaluate(async (remote) => {
    const snapshot = window.DeliSyncData.getSnapshot();
    await window.DeliSyncData.applyRemoteSnapshot({ ...snapshot, maintenance: [remote] });
  }, entry({ description: "別端末から更新した内容" }));
  await page.locator("#maintenanceSave").click();
  await expect(page.locator("#maintenanceError")).toContainText("別の操作で更新されています");
  await expect(page.locator("#maintenanceDescription")).toHaveValue("この端末の編集中の内容");
  expect((await stored(page)).maintenance[0].description).toBe("別端末から更新した内容");
});

for (const width of [390, 1440]) {
  for (const scheme of ["light", "dark"]) {
    test(`${width}px ${scheme}の車両別画面と入力フォームが収まる`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, [entry(), entry({ id: "tire", date: "2026-08-01", description: "前後タイヤ交換", odometerKm: 10000 }), entry({ id: "inspect", date: "2026-07-01", description: "定期点検", odometerKm: 8000 })]);
      await expect(page.locator("#maintenanceCount")).toHaveText("3件");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`garage-${width}-${scheme}.png`), fullPage: true });
      await page.locator("#addMaintenance").click();
      await expect(page.locator("#maintenanceSave")).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`form-${width}-${scheme}.png`) });
      await page.locator("#maintenanceCancel").click();
      await page.locator('[data-screen="input"]').click();
      await page.screenshot({ path: testInfo.outputPath(`input-${width}-${scheme}.png`), fullPage: true });
      await page.locator('[data-screen="summary"]').click();
      await page.screenshot({ path: testInfo.outputPath(`summary-${width}-${scheme}.png`), fullPage: true });
    });
  }
}
