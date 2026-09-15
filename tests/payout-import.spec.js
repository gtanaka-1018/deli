const { test, expect } = require("@playwright/test");

test.setTimeout(60000);
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const STORAGE_KEY = "deli-sales-tracker-v1";
const LEGACY_DATE = "2026-09-01";
const NEW_DATE = "2026-09-04";

function snapshot() {
  return {
    schemaVersion: 4, view: "day", selectedDate: LEGACY_DATE, taxYear: 2026,
    records: {
      [LEGACY_DATE]: {
        date: LEGACY_DATE,
        services: { uber: { sales: 9000, count: 8 }, custom: { sales: 2500, count: 2 } },
        workSessions: [{ startTime: "09:00", endTime: "12:00" }], workHours: 3,
        expenses: [{ id: "fuel", type: "gas", amount: 600, liters: 3, memo: "架空の給油" }],
        vehicleId: "bike-1", odometerKm: 12000, memo: "既存の日別メモ",
        sourceData: { transferAmount: 1200, weather: "晴れ", preserved: "元シートの補足" },
      },
      "2026-09-08": {
        date: "2026-09-08", services: {}, expenses: [],
        payouts: [{ id: "manual-payout", providerId: "uber", amount: 300, memo: "手入力メモを保持" }],
      },
    },
    targets: { "2026-09": 123456 },
    providers: [
      { id: "uber", label: "自分のUber", icon: "U", visible: false },
      { id: "rocket", label: "自分のRocket", icon: "R", visible: true },
      { id: "custom", label: "架空の配達先", icon: "配", visible: true },
    ],
    vehicles: [{ id: "bike-1", type: "motorcycle", label: "配達バイク", visible: true }],
    lastVehicleId: "bike-1",
    maintenance: [{ id: "oil-1", vehicleId: "bike-1", date: "2026-08-31", odometerKm: 11900, description: "オイル交換", memo: "架空の整備" }],
    taxProfiles: {}, assets: { cash: 777000, securities: 250000, liabilities: 100000 },
  };
}

const batch = (...entries) => ({ format: "okumeter-payout-import", version: 1, entries });
const newEntry = { date: NEW_DATE, providerId: "rocket", amount: 800, memo: "架空の振込" };
const file = (payload) => ({
  name: "fictional-payouts.json", mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(payload)),
});
const withoutTimestamp = ({ updatedAt, ...value }) => value;
const readStored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const readState = (page) => page.evaluate(() => window.DeliSyncData.getSnapshot());
const importPoints = (page) => page.evaluate(async () => (
  await window.DeliVault.listRestorePoints()
).filter((point) => point.reason.startsWith("before-payout-import-")));

async function openApp(page, initial = snapshot()) {
  await page.addInitScript((stored) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    // 再読み込み時は、アプリが保存した内容をそのまま検証する。
    if (!localStorage.getItem("deli-sales-tracker-v1")) {
      localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(stored));
    }
  }, initial);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator("#importPayoutJson")).toBeEnabled();
}

async function upload(page, payload, accept = true) {
  let confirmation = "";
  page.once("dialog", async (dialog) => {
    confirmation = dialog.message();
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  });
  await page.locator("#importPayoutJson").setInputFiles(file(payload));
  await expect(page.locator("#importPayoutJson")).toBeEnabled();
  return confirmation;
}

async function selectDate(page, date) {
  await page.locator("#selectedDate").evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, date);
}

test("振込だけを分類・追加して既存の会計と設定を保ち、再読み込み後の再取り込みで重複しない", async ({ page }) => {
  await openApp(page);
  const before = await readState(page);
  const payload = batch(
    { date: LEGACY_DATE, providerId: "uber", amount: 1200 },
    newEntry,
    { date: "2026-09-02", providerId: "demae", amount: 400 },
    { date: "2026-09-08", providerId: "uber", amount: 300, memo: "取り込み側の別メモ" },
  );
  const confirmation = await upload(page, payload);
  expect(confirmation).toContain("振込4件");
  expect(confirmation).toContain("自分のUber");
  expect(confirmation).toContain("自分のRocket");
  expect(confirmation).toContain("出前館");
  await expect(page.locator("#payoutImportStatus")).toContainText("新規 2日、分類 1日、登録済み 1日");

  const after = await readStored(page);
  for (const field of ["assets", "targets", "vehicles", "maintenance", "lastVehicleId", "taxProfiles", "taxYear"]) {
    expect(after[field]).toEqual(before[field]);
  }
  expect(after.providers.slice(0, before.providers.length)).toEqual(before.providers);
  expect(after.providers.filter((provider) => provider.id === "demae")).toHaveLength(1);
  expect(after.records[LEGACY_DATE]).toEqual({
    ...before.records[LEGACY_DATE],
    payouts: [{ id: expect.any(String), providerId: "uber", amount: 1200, memo: "" }],
  });
  expect(after.records[NEW_DATE].payouts).toEqual([
    { id: expect.any(String), providerId: "rocket", amount: 800, memo: newEntry.memo },
  ]);
  expect(after.records["2026-09-02"].payouts).toEqual([
    { id: expect.any(String), providerId: "demae", amount: 400, memo: "" },
  ]);
  expect(after.records["2026-09-08"]).toEqual(before.records["2026-09-08"]);
  expect(await importPoints(page)).toHaveLength(1);

  await page.reload({ waitUntil: "networkidle" });
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(after));
  await page.locator('[data-screen="input"]').click();
  await selectDate(page, LEGACY_DATE);
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
  await expect(page.locator("#payoutList")).toContainText("自分のUber");
  await expect(page.locator("#payoutTotal")).toContainText("1,200");
  await expect(page.locator("#calendarMonthPayouts")).toContainText("2,700");
  await expect(page.locator("#calendarMonthSales")).toContainText("11,500");
  await selectDate(page, NEW_DATE);
  await expect(page.locator("#payoutTotal")).toContainText("800");
  await page.locator('[data-screen="settings"]').click();
  const recordsBeforeRetry = (await readStored(page)).records;
  const dialogs = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.locator("#importPayoutJson").setInputFiles(file(payload));
  await expect(page.locator("#payoutImportStatus")).toContainText("すべて登録済みです");
  expect((await readStored(page)).records).toEqual(recordsBeforeRetry);
  expect(await importPoints(page)).toHaveLength(1);
  expect(dialogs).toEqual([]);
});

test("取り込み直前の復元ポイントに全データを残し、短時間の連続取り込みもそれぞれ戻せる", async ({ page }) => {
  await openApp(page);
  const initial = await readState(page);
  await upload(page, batch(newEntry));
  await expect(page.locator("#payoutImportStatus")).toContainText("取り込みが完了");
  const firstState = await readState(page);
  const [firstPoint] = await importPoints(page);
  expect(firstPoint).toBeTruthy();
  const firstBackup = await page.evaluate((id) => window.DeliVault.readRestorePoint(id), firstPoint.id);
  expect(withoutTimestamp(firstBackup)).toEqual(withoutTimestamp(initial));

  await upload(page, batch({ date: "2026-09-02", providerId: "demae", amount: 400 }));
  await expect(page.locator("#payoutImportStatus")).toContainText("取り込みが完了");
  const points = await importPoints(page);
  expect(points).toHaveLength(2);
  const secondPoint = points.find((point) => point.id !== firstPoint.id);
  const secondBackup = await page.evaluate((id) => window.DeliVault.readRestorePoint(id), secondPoint.id);
  expect(withoutTimestamp(secondBackup)).toEqual(withoutTimestamp(firstState));
  await expect(page.locator("#restorePointList")).toContainText("振込の取り込み直前");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(`[data-restore-id="${secondPoint.id}"]`).click();
  await expect(page.locator("#toast")).toContainText("復元ポイントから戻しました");
  expect(withoutTimestamp(await readStored(page))).toEqual(withoutTimestamp(firstState));
  await page.reload({ waitUntil: "networkidle" });
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(firstState));
});

test("競合する日や全件バックアップを含むファイルは、一部の振込も反映しない", async ({ page }) => {
  await openApp(page);
  const before = await readStored(page);
  const beforeState = await readState(page);
  const dialogs = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.locator("#importPayoutJson").setInputFiles(file(batch(
    newEntry, { date: LEGACY_DATE, providerId: "uber", amount: 999 },
  )));
  await expect(page.locator("#payoutImportStatus")).toContainText(`${LEGACY_DATE} の登録済み振込`);
  await expect(page.locator("#payoutImportStatus")).toContainText("まだ振込を反映していません");
  expect(await readStored(page)).toEqual(before);
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(beforeState));
  expect(await importPoints(page)).toEqual([]);

  // バックアップ用の #importJson と振込用の入力を取り違えても、全記録を置換しない。
  await page.locator("#importPayoutJson").setInputFiles(file({ ...snapshot(), records: {} }));
  await expect(page.locator("#payoutImportStatus")).toContainText("対応する形式の振込ファイル");
  expect(await readStored(page)).toEqual(before);
  expect(dialogs).toEqual([]);
});

test("確認をキャンセルすると記録も復元ポイントも変わらず、同じファイルを選び直せる", async ({ page }) => {
  await openApp(page);
  const before = await readStored(page);
  const beforeState = await readState(page);
  expect(await upload(page, batch(newEntry), false)).toContain("振込1件");
  await expect(page.locator("#payoutImportStatus")).toContainText("キャンセルしました");
  expect(await readStored(page)).toEqual(before);
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(beforeState));
  expect(await importPoints(page)).toEqual([]);
  await expect(page.locator("#importPayoutJson")).toHaveValue("");
  await upload(page, batch(newEntry));
  await expect(page.locator("#payoutImportStatus")).toContainText("取り込みが完了");
  expect((await readStored(page)).records[NEW_DATE].payouts).toHaveLength(1);
});

test("復元ポイントを保存できない場合は、既存記録とプラットフォームを変更しない", async ({ page }) => {
  await openApp(page);
  const before = await readStored(page);
  const beforeState = await readState(page);
  await page.evaluate(() => {
    window.DeliVault = { ...window.DeliVault, saveRestorePoint: async () => null };
  });
  await upload(page, batch(newEntry, { date: "2026-09-02", providerId: "demae", amount: 400 }));
  await expect(page.locator("#payoutImportStatus")).toContainText("復元ポイントを保存できませんでした");
  expect(await readStored(page)).toEqual(before);
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(beforeState));
  expect(await importPoints(page)).toEqual([]);
  await page.reload({ waitUntil: "networkidle" });
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(beforeState));
});

test("端末への保存に失敗しても既存記録と追加前の設定を保ち、再読み込みで誤反映しない", async ({ page }) => {
  await openApp(page);
  const before = await readStored(page);
  const beforeState = await readState(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "deli-sales-tracker-v1") throw new DOMException("Test storage failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await upload(page, batch(newEntry, { date: "2026-09-02", providerId: "demae", amount: 400 }));
  await expect(page.locator("#payoutImportStatus")).toContainText("振込を保存できませんでした");
  expect(await readStored(page)).toEqual(before);
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(beforeState));
  const [point] = await importPoints(page);
  const backup = await page.evaluate((id) => window.DeliVault.readRestorePoint(id), point.id);
  expect(withoutTimestamp(backup)).toEqual(withoutTimestamp(beforeState));
  await page.reload({ waitUntil: "networkidle" });
  expect(withoutTimestamp(await readState(page))).toEqual(withoutTimestamp(beforeState));
  await page.locator('[data-screen="input"]').click();
  await selectDate(page, LEGACY_DATE);
  await expect(page.locator("#payoutList")).toContainText("未分類");
  await expect(page.locator("#payoutTotal")).toContainText("1,200");
});
