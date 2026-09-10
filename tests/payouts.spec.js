const fs = require("fs");
const { test, expect } = require("@playwright/test");

test.setTimeout(60000);

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const STORAGE_KEY = "deli-sales-tracker-v1";
const ENTRY_DATE = "2026-09-04";
const PROVIDERS = [
  { id: "uber", label: "Uber", icon: "U", visible: true },
  { id: "wolt", label: "Wolt", icon: "W", visible: true },
];

function record(date, overrides = {}) {
  return { date, services: {}, workSessions: [], workHours: 0, expenses: [], ...overrides };
}

function payout(id, providerId, amount, memo = "") {
  return { id, providerId, amount, memo };
}

async function openApp(page, records = {}, overrides = {}) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    // 再読み込みでは、アプリ自身が保存したデータを検証する。
    if (!localStorage.getItem("deli-sales-tracker-v1")) {
      localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(snapshot));
    }
  }, {
    view: "day", records, targets: {}, providers: PROVIDERS, vehicles: [],
    taxYear: 2026, taxProfiles: {}, assets: { cash: 123000, liabilities: 23000 },
    ...overrides,
  });
  await page.goto(APP_URL, { waitUntil: "networkidle" });
}

async function selectDate(page, date) {
  // カレンダーと同じ日付変更イベントで、実行日によらず対象期間を固定する。
  await page.locator("#selectedDate").evaluate((input, selected) => {
    input.value = selected;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, date);
  await expect(page.locator("#selectedDate")).toHaveValue(date);
}

async function readStored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

async function addPayout(page, providerId, amount, memo = "") {
  await page.locator("#addPayout").click();
  await expect(page.locator("#payoutDialog")).toBeVisible();
  await page.locator("#payoutProvider").selectOption(providerId);
  await page.locator("#payoutAmount").fill(String(amount));
  await page.locator("#payoutMemo").fill(memo);
  await page.locator("#payoutDialogForm").getByRole("button", { name: "明細を反映", exact: true }).click();
  await expect(page.locator("#payoutDialog")).toBeHidden();
}

async function saveRecord(page) {
  await page.locator("#saveRecord").click();
  await expect(page.locator("#saveDockStatus")).toHaveText("保存済み");
}

async function expectMoney(locator, amount) {
  const text = await locator.textContent();
  expect(Number(text.replace(/[^0-9.-]/g, ""))).toBe(amount);
}

test("選択日に複数プラットフォームの振込を保存し、再読み込み後も編集・削除できる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await selectDate(page, ENTRY_DATE);
  await addPayout(page, "uber", 12000, "週次振込");
  await addPayout(page, "wolt", 3500, "追加振込");
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(2);
  await expectMoney(page.locator("#payoutTotal"), 15500);
  expect((await readStored(page)).records[ENTRY_DATE]).toBeUndefined();
  await saveRecord(page);

  const saved = (await readStored(page)).records[ENTRY_DATE].payouts;
  expect(saved).toEqual([
    expect.objectContaining({ id: expect.any(String), providerId: "uber", amount: 12000, memo: "週次振込" }),
    expect.objectContaining({ id: expect.any(String), providerId: "wolt", amount: 3500, memo: "追加振込" }),
  ]);
  expect(new Set(saved.map((item) => item.id)).size).toBe(2);
  await page.reload({ waitUntil: "networkidle" });
  await selectDate(page, ENTRY_DATE);
  await expectMoney(page.locator("#payoutTotal"), 15500);
  await expectMoney(page.locator("#calendarMonthPayouts"), 15500);

  await page.locator('#payoutList [data-edit-payout="0"]').click();
  await expect(page.locator("#payoutProvider")).toHaveValue("uber");
  await page.locator("#payoutAmount").fill("12500");
  await page.locator("#payoutMemo").fill("訂正済み");
  await page.locator("#payoutDialogForm").getByRole("button", { name: "明細を反映", exact: true }).click();
  await page.locator('#payoutList [data-edit-payout="1"]').click();
  await page.locator("#payoutDialogDelete").click();
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
  await saveRecord(page);
  await page.reload({ waitUntil: "networkidle" });
  await selectDate(page, ENTRY_DATE);
  expect((await readStored(page)).records[ENTRY_DATE].payouts).toEqual([
    { ...saved[0], amount: 12500, memo: "訂正済み" },
  ]);
  await expectMoney(page.locator("#payoutTotal"), 12500);
});

test("正の整数だけを受け付け、プラットフォーム設定の名前と表示状態を反映する", async ({ page }) => {
  await openApp(page, {
    [ENTRY_DATE]: record(ENTRY_DATE, { payouts: [payout("hidden-payout", "wolt", 2400)] }),
  });
  await page.locator('[data-screen="settings"]').click();
  await page.locator('[data-provider-visible="wolt"]').uncheck();
  await page.locator('[data-edit-provider="wolt"]').click();
  await page.locator("#providerName").fill("旧Wolt");
  await page.locator("#providerDialogSubmit").click();
  await page.locator('[data-screen="input"]').click();
  await selectDate(page, ENTRY_DATE);

  await page.locator("#addPayout").click();
  await expect(page.locator('#payoutProvider option[value="wolt"]')).toHaveCount(0);
  await expect(page.locator('#payoutProvider option[value="uber"]')).toHaveCount(1);
  await expect(page.locator('#payoutProvider option[value=""]')).toContainText("未分類");
  for (const invalid of ["", "0", "-1", "1.5"]) {
    await page.locator("#payoutAmount").fill(invalid);
    await page.locator("#payoutDialogForm").getByRole("button", { name: "明細を反映", exact: true }).click();
    await expect(page.locator("#payoutDialog")).toBeVisible();
    await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await page.locator('#payoutList [data-edit-payout="0"]').click();
  await expect(page.locator("#payoutProvider")).toHaveValue("wolt");
  await expect(page.locator('#payoutProvider option[value="wolt"]')).toContainText("旧Wolt");
  await page.locator("#payoutAmount").fill("2500");
  await page.locator("#payoutDialogForm").getByRole("button", { name: "明細を反映", exact: true }).click();
  await saveRecord(page);
  await page.locator('[data-screen="summary"]').click();
  await expect(page.locator('#dayReport [data-payout-provider="wolt"]')).toContainText("旧Wolt");
  await expectMoney(page.locator('#dayReport [data-payout-provider="wolt"] .payout-provider-amount'), 2500);
});

test("日・週・月・年の振込を振込日で集計し、年をまたぐ週とプラットフォーム別明細を扱う", async ({ page }) => {
  const rows = [
    ["2025-12-28", "uber", 90000, "前週"],
    ["2025-12-29", "uber", 1000, "年末月曜"],
    ["2025-12-31", "wolt", 2000, "年末水曜"],
    ["2026-01-01", "uber", 3000, "元日Uber"],
    ["2026-01-01", "wolt", 4000, "元日Wolt"],
    ["2026-01-04", "uber", 5000, "日曜振込"],
    ["2026-01-05", "wolt", 6000, "翌週振込"],
    ["2026-02-01", "uber", 7000, "翌月振込"],
    ["2027-01-01", "uber", 8000, "翌年振込"],
  ];
  const records = {};
  rows.forEach(([date, providerId, amount, memo], index) => {
    records[date] ||= record(date, { payouts: [] });
    records[date].payouts.push(payout(`period-${index}`, providerId, amount, memo));
  });
  // 旧バックアップの内部日付がなくても、records のキーが振込日になる。
  delete records["2025-12-29"].date;
  await openApp(page, records);
  await selectDate(page, "2026-01-01");
  await expectMoney(page.locator("#calendarMonthPayouts"), 18000);
  await page.locator('[data-screen="summary"]').click();

  for (const [view, total, uber, wolt] of [
    ["day", 7000, 3000, 4000],
    ["week", 15000, 9000, 6000],
    ["month", 18000, 8000, 10000],
    ["year", 25000, 15000, 10000],
  ]) {
    await page.locator(`[data-view="${view}"]`).click();
    await selectDate(page, "2026-01-01");
    const report = page.locator(`#${view}Report .payout-report`);
    await expect(report).toBeVisible();
    await expectMoney(report.locator(".payout-report-total"), total);
    await expectMoney(report.locator('[data-payout-provider="uber"] .payout-provider-amount'), uber);
    await expectMoney(report.locator('[data-payout-provider="wolt"] .payout-provider-amount'), wolt);
    await expect(report.locator(".payout-history")).toContainText("元日Uber");
    await expect(report.locator(".payout-history")).toContainText("元日Wolt");
    await expect(report.locator(".payout-history")).not.toContainText("翌年振込");
  }
  await page.locator('[data-view="week"]').click();
  await selectDate(page, "2026-01-01");
  await expect(page.locator("#weekReport .payout-history")).toContainText("年末月曜");
  await expect(page.locator("#weekReport .payout-history")).toContainText("日曜振込");
  await expect(page.locator("#weekReport .payout-history")).not.toContainText("前週");
  await expect(page.locator("#weekReport .payout-history")).not.toContainText("翌週振込");
  const importedHistory = page.locator('#weekReport .payout-history [data-jump-date="2025-12-29"]');
  await expect(importedHistory).toHaveCount(1);
  await expect(importedHistory).toContainText("年末月曜");
  await expect(importedHistory).toContainText("2025");
  await expect(importedHistory).toHaveAttribute("aria-label", /2025.*12.*29/);
});

test("旧シートの振込を未分類から編集でき、削除した旧振込が再読み込みで復活しない", async ({ page }) => {
  const suppressedDate = "2026-09-05";
  const fractionalDate = "2026-08-31";
  await openApp(page, {
    [ENTRY_DATE]: record(ENTRY_DATE, { sourceData: { transferAmount: 6522, weather: "晴れ" } }),
    [suppressedDate]: record(suppressedDate, { payouts: [], sourceData: { transferAmount: 9999 } }),
    [fractionalDate]: record(fractionalDate, { sourceData: { transferAmount: 1234.5 } }),
  });
  await selectDate(page, suppressedDate);
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(0);
  await expectMoney(page.locator("#payoutTotal"), 0);
  await selectDate(page, ENTRY_DATE);
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
  await expect(page.locator("#payoutList")).toContainText("未分類");
  await expectMoney(page.locator("#payoutTotal"), 6522);
  await page.locator('#payoutList [data-edit-payout="0"]').click();
  await expect(page.locator("#payoutProvider")).toHaveValue("");
  await page.locator("#payoutProvider").selectOption("uber");
  await page.locator("#payoutAmount").fill("6600");
  await page.locator("#payoutDialogForm").getByRole("button", { name: "明細を反映", exact: true }).click();
  await saveRecord(page);
  await page.reload({ waitUntil: "networkidle" });
  await selectDate(page, ENTRY_DATE);
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
  await expectMoney(page.locator("#calendarMonthPayouts"), 6600);
  expect((await readStored(page)).records[ENTRY_DATE].sourceData.weather).toBe("晴れ");

  await page.locator('#payoutList [data-edit-payout="0"]').click();
  await page.locator("#payoutDialogDelete").click();
  await saveRecord(page);
  expect((await readStored(page)).records[ENTRY_DATE].payouts).toEqual([]);
  await page.reload({ waitUntil: "networkidle" });
  await selectDate(page, ENTRY_DATE);
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(0);
  await expectMoney(page.locator("#calendarMonthPayouts"), 0);

  // 旧データの小数額は、分類とメモだけの編集で丸めたり拒否したりしない。
  await selectDate(page, fractionalDate);
  await page.locator('#payoutList [data-edit-payout="0"]').click();
  await expect(page.locator("#payoutAmount")).toHaveValue("1234.5");
  await page.locator("#payoutProvider").selectOption("uber");
  await page.locator("#payoutMemo").fill("旧シートの金額を保持");
  await page.locator("#payoutDialogForm").getByRole("button", { name: "明細を反映", exact: true }).click();
  await expect(page.locator("#payoutDialog")).toBeHidden();
  await saveRecord(page);
  const fractionalPayouts = (await readStored(page)).records[fractionalDate].payouts;
  expect(fractionalPayouts).toEqual([
    expect.objectContaining({ providerId: "uber", amount: 1234.5, memo: "旧シートの金額を保持" }),
  ]);
  await page.reload({ waitUntil: "networkidle" });
  await selectDate(page, fractionalDate);
  expect((await readStored(page)).records[fractionalDate].payouts).toEqual(fractionalPayouts);
  await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
  await page.locator('#payoutList [data-edit-payout="0"]').click();
  await expect(page.locator("#payoutAmount")).toHaveValue("1234.5");
  await expect(page.locator("#payoutProvider")).toHaveValue("uber");
  await expect(page.locator("#payoutMemo")).toHaveValue("旧シートの金額を保持");
});

test("ファイル保存と別端末への読み込みで振込明細と削除済みの旧振込を保持する", async ({ page, browser }, testInfo) => {
  const payouts = [payout("backup-uber", "uber", 12500, "銀行明細メモ"), payout("backup-other", "", 700, "未分類の振込")];
  const records = {
    [ENTRY_DATE]: record(ENTRY_DATE, { payouts }),
    "2026-09-05": record("2026-09-05", { payouts: [], sourceData: { transferAmount: 9999 } }),
  };
  await openApp(page, records);
  await page.locator('[data-screen="settings"]').click();
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.locator("#exportJson").click(),
  ]);
  const backupPath = testInfo.outputPath("payout-backup.json");
  await download.saveAs(backupPath);
  const exported = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  expect(exported.schemaVersion).toBe(4);
  expect(exported.records[ENTRY_DATE].payouts).toEqual(payouts);
  expect(exported.records["2026-09-05"].payouts).toEqual([]);

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await openApp(otherPage);
    await otherPage.locator('[data-screen="settings"]').click();
    await otherPage.locator("#importJson").setInputFiles(backupPath);
    await expect(otherPage.locator("#toast")).toContainText("ファイルからデータを読み込みました");
    await otherPage.reload({ waitUntil: "networkidle" });
    expect((await readStored(otherPage)).records[ENTRY_DATE].payouts).toEqual(payouts);
    expect((await readStored(otherPage)).records["2026-09-05"].payouts).toEqual([]);
    await otherPage.locator('[data-screen="input"]').click();
    await selectDate(otherPage, ENTRY_DATE);
    await expectMoney(otherPage.locator("#payoutTotal"), 13200);
    await expectMoney(otherPage.locator("#calendarMonthPayouts"), 13200);
  } finally {
    await otherContext.close();
  }
});

test("振込だけの日を保存しても売上・税額・資産へ二重計上しない", async ({ page }) => {
  await openApp(page, {
    "2026-09-01": record("2026-09-01", {
      services: { uber: { sales: 1200000, count: 900 } },
      expenses: [{ id: "business-cost", type: "other", amount: 100000, memo: "業務経費" }],
      workHours: 100,
    }),
  });
  await selectDate(page, ENTRY_DATE);
  const readAccounting = async () => {
    await page.locator('[data-screen="tax"]').click();
    await expectMoney(page.locator("#taxAnnualSales"), 1200000);
    await page.locator('[data-screen="meter"]').click();
    const accounting = await page.evaluate(() => ({
      sales: document.querySelector("#taxAnnualSales").textContent,
      expenses: document.querySelector("#taxAnnualExpenses").textContent,
      profit: document.querySelector("#taxAnnualProfit").textContent,
      tax: document.querySelector("#taxTotalBurden").textContent,
      netAssets: document.querySelector("#assetSummaryNet").textContent,
      assets: window.DeliSyncData.getSnapshot().assets,
    }));
    await page.locator('[data-screen="input"]').click();
    await selectDate(page, ENTRY_DATE);
    return accounting;
  };
  const before = await readAccounting();
  await addPayout(page, "uber", 500000, "前月分の振込");
  await saveRecord(page);
  await expectMoney(page.locator("#payoutTotal"), 500000);
  await expectMoney(page.locator("#calendarMonthPayouts"), 500000);
  await expectMoney(page.locator("#calendarMonthSales"), 1200000);
  await expect(page.locator("#dailyCount")).toHaveText("0件");
  expect(await readAccounting()).toEqual(before);
  const stored = (await readStored(page)).records[ENTRY_DATE];
  expect(stored.payouts).toHaveLength(1);
  expect(Object.values(stored.services).reduce((sum, service) => sum + service.sales, 0)).toBe(0);
  await page.reload({ waitUntil: "networkidle" });
  await selectDate(page, ENTRY_DATE);
  expect(await readAccounting()).toEqual(before);
  await expectMoney(page.locator("#payoutTotal"), 500000);
});
