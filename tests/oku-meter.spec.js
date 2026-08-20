const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const provider = { id: "uber", label: "Uber", icon: "U", visible: true };

function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("区分別の純資産を保存して1億円への進捗としてスマホ表示する", async ({ page }) => {
  const today = new Date();
  const tenDaysAgo = new Date(today);
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const oldDate = new Date(today);
  oldDate.setDate(oldDate.getDate() - 400);
  const dates = [dateString(today), dateString(tenDaysAgo), dateString(oldDate)];

  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(({ savedDates, savedProvider, currentYear }) => {
    const savedRecord = (date, sales) => ({
      date,
      services: { uber: { sales, count: 10 } },
      workSessions: [],
      workHours: 5,
      workHoursOverride: 0,
      breakHours: 0,
      expenses: [],
    });
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    if (localStorage.getItem("deli-sales-tracker-v1")) return;
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      selectedDate: savedDates[2],
      records: {
        [savedDates[0]]: savedRecord(savedDates[0], 2_000_000),
        [savedDates[1]]: savedRecord(savedDates[1], 1_000_000),
        [savedDates[2]]: savedRecord(savedDates[2], 7_000_000),
      },
      targets: {},
      providers: [savedProvider],
      vehicles: [],
      taxProfiles: {},
      assets: {
        cash: 2_000_000,
        securities: 5_000_000,
        pension: 4_000_000,
        crypto: 0,
        realEstate: 0,
        business: 0,
        other: 0,
        liabilities: 1_000_000,
      },
      taxYear: currentYear,
      updatedAt: new Date().toISOString(),
    }));
  }, { savedDates: dates, savedProvider: provider, currentYear: today.getFullYear() });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });
  await page.locator('[data-screen="meter"]').click();

  await expect(page.locator("#meterScreen")).toBeVisible();
  await expect(page.locator("#okuMeterPercent")).toHaveText("10.0%");
  await expect(page.locator("#okuMeterNetAssets")).toHaveText(/[¥￥]10,000,000/);
  await expect(page.locator("#okuMeterRemaining")).toHaveText(/[¥￥]90,000,000/);
  await expect(page.locator("#okuMeterTotalAssets")).toHaveText(/[¥￥]11,000,000/);
  await expect(page.locator("#okuMeterLiabilities")).toHaveText(/[¥￥]1,000,000/);
  await expect(page.locator("#okuMeterLifetimeSales")).toHaveText(/[¥￥]10,000,000/);
  await expect(page.locator("#assetInputs [data-asset-field]")).toHaveCount(8);
  await expect(page.locator('#okuMeterMilestones [data-milestone="1000000"]')).toHaveClass(/is-achieved/);
  await expect(page.locator('#okuMeterMilestones [data-milestone="10000000"]')).toHaveClass(/is-achieved/);
  await expect(page.locator('#okuMeterMilestones [data-milestone="50000000"]')).not.toHaveClass(/is-achieved/);

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    navItems: document.querySelectorAll("#primaryNav .screen-tab").length,
  }));
  expect(layout.navItems).toBe(6);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);

  await page.locator('[data-asset-field="cash"]').fill("3000000");
  await expect(page.locator("#okuMeterPercent")).toHaveText("11.0%");
  await expect(page.locator("#okuMeterNetAssets")).toHaveText(/[¥￥]11,000,000/);
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-screen="meter"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('[data-asset-field="cash"]')).toHaveValue("3000000");
  await expect(page.locator("#okuMeterNetAssets")).toHaveText(/[¥￥]11,000,000/);

  if (process.env.DELILOG_METER_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_METER_SCREENSHOT, fullPage: true });
  }
});
