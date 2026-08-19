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

test("達成率は数値だけを表示し、時間帯別の推定効率を集計する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedState(page, {
    view: "month",
    selectedDate: "2026-08-12",
    records: {
      "2026-08-01": record("2026-08-01", 6000, 6, [{ startTime: "06:00", endTime: "09:00" }]),
      "2026-08-02": record("2026-08-02", 12000, 9, [{ startTime: "18:00", endTime: "21:00" }]),
      "2026-08-03": record("2026-08-03", 9000, 6, [{ startTime: "23:00", endTime: "02:00" }]),
      "2026-08-04": record("2026-08-04", 3000, 3, [], 1),
    },
    targets: { "2026-08": 20000 },
    providers: [provider],
    vehicles: [],
    taxProfiles: {},
    taxYear: 2026,
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

test("開始・終了時刻がない過去年には説明を表示する", async ({ page }) => {
  await seedState(page, {
    view: "year",
    selectedDate: "2024-06-01",
    records: {
      "2024-06-01": record("2024-06-01", 10000, 10),
    },
    targets: {},
    providers: [provider],
    vehicles: [],
    taxProfiles: {},
    taxYear: 2024,
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });
  await page.locator('[data-screen="summary"]').click();

  await expect(page.locator("#yearReport .time-analysis-empty")).toBeVisible();
  await expect(page.locator("#yearReport .time-analysis-empty")).toContainText("分析できる時間帯データがありません");
});
