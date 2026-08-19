const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("日・週・月・年を選択したタップだけで即時反映する", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      selectedDate: "2026-08-12",
      records: {},
      targets: {},
      providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
      vehicles: [],
      taxProfiles: {},
      taxYear: 2026,
      updatedAt: "2099-01-01T00:00:00.000Z",
    }));
  });
  await page.goto(process.env.DELILOG_TEST_URL || "https://delilog.vercel.app", { waitUntil: "networkidle" });

  const picker = page.locator("#periodPickerDialog");
  await page.locator("#periodPickerButton").click();
  await expect(picker).toBeVisible();
  await picker.locator('[data-period-date="2026-08-10"]').click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedDate")).toHaveValue("2026-08-10");
  await expect(page.locator("#periodPickerValue")).toHaveText("2026/8/10");

  await page.locator('[data-screen="summary"]').click();
  await page.waitForTimeout(250);
  const layouts = [];
  const captureLayout = async () => layouts.push(await page.evaluate(() => {
    const pickerButton = document.querySelector("#periodPickerButton").getBoundingClientRect();
    const metrics = document.querySelector("#summaryScreen .metrics-grid").getBoundingClientRect();
    return { buttonWidth: pickerButton.width, buttonHeight: pickerButton.height, metricsY: metrics.y };
  }));
  await captureLayout();
  await page.locator("#weekViewTab").click();
  await page.locator("#periodPickerButton").click();
  await picker.locator('[data-period-date="2026-08-17"]').click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedWeek")).toHaveValue("2026-W34");
  await expect(page.locator("#periodPickerValue")).toHaveText("8/17〜8/23");
  await captureLayout();

  await page.locator("#monthViewTab").click();
  await page.locator("#periodPickerButton").click();
  await picker.locator('[data-period-date="2026-07-01"]').click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedMonth")).toHaveValue("2026-07");
  await expect(page.locator("#periodPickerValue")).toHaveText("2026年7月");
  await captureLayout();

  await page.locator("#yearViewTab").click();
  await page.locator("#periodPickerButton").click();
  await picker.locator('[data-period-date="2025-01-01"]').click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedYear")).toHaveValue("2025");
  await expect(page.locator("#periodPickerValue")).toHaveText("2025年");
  await captureLayout();

  expect(layouts.every((item) => Math.abs(item.buttonHeight - 44) <= 1)).toBeTruthy();
  expect(Math.max(...layouts.map((item) => item.buttonWidth)) - Math.min(...layouts.map((item) => item.buttonWidth))).toBeLessThanOrEqual(1);
  expect(Math.max(...layouts.map((item) => item.metricsY)) - Math.min(...layouts.map((item) => item.metricsY))).toBeLessThanOrEqual(1);

  const metricFonts = await page.evaluate(() => ({
    sales: getComputedStyle(document.querySelector("#metricSales")).fontSize,
    achievement: getComputedStyle(document.querySelector("#metricAchievement .achievement-percent")).fontSize,
  }));
  expect(metricFonts.achievement).toBe(metricFonts.sales);

  await expect(page.locator("#loadToday")).toBeHidden();
  await page.locator("#periodPickerButton").click();
  await expect(page.locator("#loadToday")).toBeVisible();
  await page.locator("#loadToday").click();
  await expect(picker).toBeHidden();

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);

  if (process.env.DELILOG_PERIOD_SCREENSHOT) {
    await page.locator("#periodPickerButton").click();
    await page.screenshot({ path: process.env.DELILOG_PERIOD_SCREENSHOT, fullPage: true });
  }
});
