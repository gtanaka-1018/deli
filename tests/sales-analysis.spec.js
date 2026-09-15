const { test, expect } = require("@playwright/test");

test.use({
  timezoneId: "Asia/Tokyo",
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const STORAGE_KEY = "deli-sales-tracker-v1";
const PROVIDERS = [
  { id: "uber", label: "Uber Eats", icon: "U", visible: true },
  { id: "rocket", label: "ロケットナウ", icon: "R", visible: true },
  { id: "demae", label: "出前館", icon: "D", visible: true },
];

function record(date, providerId, sales, count, workHours, weather = "", expense = 0) {
  return {
    date,
    services: providerId ? { [providerId]: { sales, count } } : {},
    workSessions: [],
    workHours,
    workHoursOverride: 0,
    breakHours: 0,
    weather,
    payouts: [],
    expenses: expense ? [{ type: "other", amount: expense, memo: "テスト経費" }] : [],
  };
}

async function openApp(page, records, { view = "month", theme = "light", providers = PROVIDERS } = {}) {
  await page.clock.setFixedTime(new Date("2026-09-15T03:00:00Z"));
  await page.addInitScript(({ snapshotJson, themeChoice }) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-theme-v1", themeChoice);
    localStorage.setItem("deli-sales-tracker-v1", snapshotJson);
  }, {
    themeChoice: theme,
    snapshotJson: JSON.stringify({
      schemaVersion: 4,
      view,
      selectedDate: "2026-09-15",
      records,
      targets: {},
      providers,
      vehicles: [],
      taxYear: 2026,
      taxProfiles: {},
      updatedAt: "2026-09-15T02:00:00.000Z",
    }),
  });
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-screen="summary"]').click();
  await expect(page.locator("#salesInsights")).toBeVisible();
}

async function storedRecords(page) {
  // JSON文字列で渡し、ブラウザとテスト間でも __proto__ などの取込キーを保持する。
  return JSON.parse(await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key)).records), STORAGE_KEY));
}

function tableRow(page, table, label) {
  return table.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
}

async function expectNoPageOverflow(page) {
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(size.document).toBeLessThanOrEqual(size.viewport + 1);
}

async function selectDate(page, date) {
  await page.locator("#selectedDate").evaluate((input, selected) => {
    input.value = selected;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, date);
  await expect(page.locator("#selectedDate")).toHaveValue(date);
}

test("月の途中経過を同じ日まで比べ、時間未入力日と振込を区別して分析する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const records = Object.fromEntries([
    record("2026-08-01", "uber", 10000, 10, 4),
    record("2026-08-02", "rocket", 14000, 7, 5),
    record("2026-08-15", "uber", 10000, 10, 4),
    // 前月16日以降の売上は、当月15日までの比較に混ぜない。
    record("2026-08-16", "uber", 999000, 999, 10),
    record("2026-09-01", "uber", 6000, 6, 3, "晴", 600),
    record("2026-09-02", "rocket", 12000, 8, 4, "雨", 400),
    record("2026-09-03", "demae", 5000, 5, 0),
    { ...record("2026-09-04", null, 0, 0, 0), payouts: [{ id: "payout-only", providerId: "uber", amount: 50000, memo: "振込のみ" }] },
    record("2026-09-05", null, 0, 0, 0, "", 2000),
    record("2026-09-08", "uber", 9000, 6, 3, "晴"),
    record("2026-09-09", "rocket", 15000, 10, 5, "曇"),
    record("2026-09-14", "demae", 18000, 12, 6, "晴"),
    record("2026-09-15", "uber", 12000, 8, 3, "雨"),
  ].map((item) => [item.date, item]));
  await openApp(page, records);
  const saved = await storedRecords(page);
  const panel = page.locator("#salesInsights");

  await expect(panel.locator("[data-analysis-periods]")).toContainText("2026年9月1日〜2026年9月15日");
  await expect(panel.locator("[data-analysis-periods]")).toContainText("2026年8月1日〜2026年8月15日");
  await expect(panel.locator(".analysis-sales strong")).toHaveText("77,000円");
  await expect(panel.locator(".analysis-delta")).toHaveText("+43,000円");
  await expect(panel.locator(".analysis-change-rate")).toHaveText("+126.5%");
  await expect(panel.locator(".analysis-effects strong")).toHaveText(["+37,230円", "+5,770円"]);
  await expect(panel.locator("[data-analysis-coverage]")).toContainText("時間記録 6 / 7日・24時間");
  await expect(page.locator("#metricHourly")).toHaveText(/[¥￥]3,000/);
  await expect(page.locator("#metricHourlyCoverage")).toHaveText("時間記録 6/7日");

  await panel.getByText("比較の内訳", { exact: true }).click();
  const comparison = panel.locator("[data-analysis-comparison] table");
  await expect(tableRow(page, comparison, "売上").getByRole("cell")).toHaveText(["77,000円", "34,000円"]);
  for (const cell of await tableRow(page, comparison, "売上").getByRole("cell").all()) {
    const bounds = await cell.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
  await expect(tableRow(page, comparison, "時間記録日の売上").getByRole("cell")).toHaveText(["72,000円", "34,000円"]);
  await expect(tableRow(page, comparison, "記録経費差引後の時給").getByRole("cell")).toHaveText(["2,958円", "2,615円"]);
  const weekdays = panel.locator('[data-analysis-table="weekdays"] table');
  await expect(tableRow(page, weekdays, "火").getByRole("cell")).toHaveText(["3,000円", "3,000円", "9,000円", /3 \/ 3日\s*9時間/]);
  await expect(tableRow(page, weekdays, "木").getByRole("cell")).toHaveText(["—", "—", "5,000円", /0 \/ 1日\s*0時間/]);
  await expect(tableRow(page, weekdays, "金").getByRole("cell")).toHaveText(["—", "—", "—", /0 \/ 0日\s*0時間/]);
  // 3日・6時間以上の曜日が1つだけなら、最適な曜日とは案内しない。
  await expect(panel.locator('[data-analysis-finding="weekdays"]')).not.toContainText("時給が高め");
  await expectNoPageOverflow(page);

  const weekdayTab = panel.getByRole("tab", { name: "曜日", exact: true });
  const platformTab = panel.getByRole("tab", { name: "プラットフォーム", exact: true });
  const weatherTab = panel.getByRole("tab", { name: "天気", exact: true });
  await weekdayTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(platformTab).toBeFocused();
  await expect(platformTab).toHaveAttribute("aria-selected", "true");
  const platforms = panel.locator('[data-analysis-table="platforms"] table');
  await expect(tableRow(page, platforms, "Uber Eats").getByRole("cell")).toHaveText(["27,000円", "35.1%", "20件", "1,350円", "+7,000円"]);
  await expect(platforms.getByRole("columnheader", { name: /時給/ })).toHaveCount(0);
  await expect(panel.locator('[data-analysis-finding="platforms"]')).toContainText("各社の稼働時間は記録していないため");
  await expectNoPageOverflow(page);

  await page.keyboard.press("End");
  await expect(weatherTab).toBeFocused();
  await expect(weatherTab).toHaveAttribute("aria-selected", "true");
  const weather = panel.locator('[data-analysis-table="weather"] table');
  await expect(tableRow(page, weather, "雨").getByRole("cell")).toHaveText(["12,000円", "3,429円", /2 \/ 2日\s*7時間/]);
  await expect(tableRow(page, weather, "天気未入力").getByRole("cell")).toHaveText(["5,000円", "—", /0 \/ 1日\s*0時間/]);
  await expectNoPageOverflow(page);
  await page.keyboard.press("Home");
  await expect(weekdayTab).toBeFocused();
  expect(await storedRecords(page)).toEqual(saved);

  if (process.env.DELILOG_ANALYSIS_SCREENSHOT) {
    await panel.screenshot({ path: process.env.DELILOG_ANALYSIS_SCREENSHOT });
  }
});

test("件数の欠測は増減内訳と単価を保留し、期間を変えても分析タブを保持する", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, {
    "2026-09-14": record("2026-09-14", "rocket", 18000, 12, 6, "晴"),
    "2026-09-15": record("2026-09-15", "uber", 12000, 0, 3, "雨"),
  }, { view: "day", theme: "dark" });
  const saved = await storedRecords(page);
  const panel = page.locator("#salesInsights");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(panel.locator(".analysis-delta")).toHaveText("-6,000円");
  await expect(panel.locator(".analysis-change-rate")).toHaveText("-33.3%");
  await expect(panel.locator(".analysis-effects")).toHaveCount(0);
  await expect(panel.locator(".analysis-guidance")).toContainText("件数が0件または未入力の売上記録があります");
  await panel.getByText("比較の内訳", { exact: true }).click();
  const comparison = panel.locator("[data-analysis-comparison] table");
  await expect(tableRow(page, comparison, "1件あたりの平均単価").getByRole("cell")).toHaveText(["—", "1,500円"]);
  const platformTab = panel.getByRole("tab", { name: "プラットフォーム", exact: true });
  await platformTab.click();
  const platforms = panel.locator('[data-analysis-table="platforms"] table');
  const uberCells = tableRow(page, platforms, "Uber Eats").getByRole("cell");
  await expect(uberCells.nth(2)).toContainText("0件・未入力の売上 1日");
  await expect(uberCells.nth(3)).toHaveText("—");
  await expectNoPageOverflow(page);

  await page.locator("#weekViewTab").click();
  await expect(panel.locator("[data-analysis-periods]")).toContainText("2026年9月14日〜2026年9月15日");
  await expect(panel.locator("[data-analysis-periods]")).toContainText("2026年9月7日〜2026年9月8日");
  await expect(panel.locator(".analysis-sales strong")).toHaveText("30,000円");
  await expect(platformTab).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".analysis-details")).toHaveAttribute("open", "");
  await expect(panel.locator(".analysis-no-comparison")).toBeVisible();
  await page.locator("#yearViewTab").click();
  await expect(panel.locator("[data-analysis-periods]")).toContainText("2025年1月1日〜2025年9月15日");
  await expect(platformTab).toHaveAttribute("aria-selected", "true");
  await expectNoPageOverflow(page);
  expect(await storedRecords(page)).toEqual(saved);
});

test("振込だけの日や未来の期間に売上・稼働の傾向を作らない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, {
    "2026-09-15": {
      ...record("2026-09-15", null, 0, 0, 0),
      payouts: [{ id: "payout-only", providerId: "uber", amount: 50000, memo: "振込のみ" }],
    },
    "2026-10-01": record("2026-10-01", "uber", 90000, 90, 9),
  }, { view: "day", theme: "dark" });
  const panel = page.locator("#salesInsights");
  await expect(panel.locator(".analysis-sales strong")).toHaveText("0円");
  await expect(panel.locator("[data-analysis-coverage]")).toContainText("時間記録 0 / 0日・0時間");
  await expect(panel.locator(".analysis-no-comparison")).toBeVisible();
  await expect(page.locator("#metricHourly")).toHaveText("—");
  await panel.getByRole("tab", { name: "プラットフォーム", exact: true }).click();
  await expect(panel.locator('[data-analysis-table="platforms"]')).toContainText("この期間の記録がありません");

  await page.locator("#monthViewTab").click();
  await selectDate(page, "2026-10-01");
  await expect(panel.locator("[data-analysis-period-badge]")).toHaveText("未来の期間");
  await expect(panel.locator(".analysis-sales strong")).toHaveText("—");
  await expect(panel.locator(".analysis-guidance")).toContainText("未来の期間");
  await expect(panel.locator(".analysis-delta")).toHaveCount(0);
  await expect(panel.locator('[data-analysis-table="platforms"]')).toContainText("この期間の記録がありません");
  await expectNoPageOverflow(page);
});

test("取込データの特殊なサービスIDも集計し、プラットフォーム名は文字として表示する", async ({ page }) => {
  const label = '<img src="x" onerror="window.analysisLabelExecuted=true">';
  const imported = {
    ...record("2026-09-15", null, 0, 0, 5),
    services: JSON.parse('{"__proto__":{"sales":4000,"count":4},"constructor":{"sales":6000,"count":3}}'),
  };
  await openApp(page, { "2026-09-15": imported }, {
    view: "day",
    providers: [{ id: "__proto__", label, icon: "P", visible: false }],
  });
  const panel = page.locator("#salesInsights");
  await expect(page.locator("#metricSales")).toHaveText(/[¥￥]10,000/);
  await expect(page.locator("#metricHourly")).toHaveText(/[¥￥]2,000/);
  await expect(panel.locator(".analysis-sales strong")).toHaveText("10,000円");
  await panel.getByRole("tab", { name: "プラットフォーム", exact: true }).click();
  const platforms = panel.locator('[data-analysis-table="platforms"] table');
  await expect(tableRow(page, platforms, label).getByRole("cell").first()).toHaveText("4,000円");
  await expect(tableRow(page, platforms, "constructor").getByRole("cell").first()).toHaveText("6,000円");
  await expect(platforms.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => ({
    executed: Boolean(window.analysisLabelExecuted),
    inheritedSales: "sales" in {},
  }))).toEqual({ executed: false, inheritedSales: false });
  expect((await storedRecords(page))["2026-09-15"].services).toEqual(imported.services);
});
