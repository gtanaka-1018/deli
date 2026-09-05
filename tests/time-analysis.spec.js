const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const provider = { id: "uber", label: "Uber", icon: "U", visible: true };

function record(date, sales, count, workSessions = [], workHours = 0) {
  return {
    date,
    services: { uber: { sales, count } },
    workSessions,
    workHours,
    workHoursOverride: 0,
    breakHours: 0,
    expenses: [],
  };
}

async function seedState(page, snapshot) {
  await page.addInitScript((savedSnapshot) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(savedSnapshot));
  }, snapshot);
}

// アプリは起動時に必ず今日を選択するため、テストデータも実行日を基準に組み立てる。
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentYear() {
  return new Date().getFullYear();
}

test("達成率は数値だけを表示し、時間帯別の推定効率を集計する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const month = currentMonthKey();
  await seedState(page, {
    view: "month",
    records: {
      [`${month}-01`]: record(`${month}-01`, 6000, 6, [{ startTime: "06:00", endTime: "09:00" }]),
      [`${month}-02`]: record(`${month}-02`, 12000, 9, [{ startTime: "18:00", endTime: "21:00" }]),
      [`${month}-03`]: record(`${month}-03`, 9000, 6, [{ startTime: "23:00", endTime: "02:00" }]),
      [`${month}-04`]: record(`${month}-04`, 3000, 3, [], 1),
    },
    targets: { [month]: 20000 },
    providers: [provider],
    vehicles: [],
    taxProfiles: {},
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });
  await page.locator('[data-screen="summary"]').click();

  await expect(page.locator("#periodLabel")).toBeHidden();
  await expect(page.locator("#metricAchievement")).toHaveText("150%");
  await expect(page.locator(".rank-badge")).toHaveCount(0);
  await expect(page.locator("#monthReport .time-analysis-panel")).toBeVisible();
  await expect(page.locator("#monthReport .time-analysis-heading")).toContainText("分析対象 3/4日・対象売上 90%・時刻なし 1日は対象外");
  await expect(page.locator('#monthReport [data-time-band="morning"] .time-analysis-hourly')).toHaveText(/[¥￥]2,000\/h/);
  await expect(page.locator('#monthReport [data-time-band="dinner"] .time-analysis-hourly')).toHaveText(/[¥￥]4,000\/h/);
  await expect(page.locator('#monthReport [data-time-band="late"] .time-analysis-hourly')).toHaveText(/[¥￥]3,000\/h/);
  await expect(page.locator("#monthReport .time-analysis-insight")).toHaveCount(0);
  await expect(page.locator("#monthReport .time-analysis-sample-note")).toHaveCount(3);

  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);

  await page.locator("#dayViewTab").click();
  await expect(page.locator("#periodLabel")).toBeHidden();
  await page.locator("#yearViewTab").click();
  await expect(page.locator("#periodLabel")).toBeHidden();

  if (process.env.DELILOG_TIME_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_TIME_SCREENSHOT, fullPage: true });
  }
});

test("開始・終了時刻がない記録だけの年には説明を表示する", async ({ page }) => {
  const year = currentYear();
  await seedState(page, {
    view: "year",
    records: {
      [`${year}-01-06`]: record(`${year}-01-06`, 10000, 10),
    },
    targets: {},
    providers: [provider],
    vehicles: [],
    taxProfiles: {},
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });
  await page.locator('[data-screen="summary"]').click();

  await expect(page.locator("#yearReport .time-analysis-empty")).toBeVisible();
  await expect(page.locator("#yearReport .time-analysis-empty")).toContainText("分析できる時間帯データがありません");
});
