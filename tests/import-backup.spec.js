const path = require("path");
const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("2019～2026年のスマホ転送用ファイルを読み込み、再読込後も保持する", async ({ page }) => {
  const backupPath = path.resolve(process.env.DELILOG_IMPORT_FILE || "data/delilog-sales-2019-2026.json");
  const appUrl = process.env.DELILOG_TEST_URL || "https://delilog.vercel.app";

  await page.addInitScript(() => localStorage.setItem("deli-onboarding-complete-v1", "done"));
  await page.goto(appUrl, { waitUntil: "networkidle" });
  if (await page.locator("#welcomeDialog").isVisible()) await page.locator("#welcomeStart").click();
  await page.locator('[data-screen="settings"]').click();
  await page.locator("#importJson").setInputFiles(backupPath);
  await expect(page.locator("#toast")).toContainText("ファイルからデータを読み込みました");

  const imported = await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("deli-sales-tracker-v1"));
    const dates = Object.keys(snapshot.records).sort();
    const sales = Object.values(snapshot.records).reduce((total, record) => (
      total + Object.values(record.services || {}).reduce((subtotal, service) => subtotal + (Number(service.sales) || 0), 0)
    ), 0);
    return { count: dates.length, first: dates[0], last: dates.at(-1), sales };
  });

  expect(imported).toEqual({
    count: 2210,
    first: "2019-08-10",
    last: "2026-08-09",
    sales: 12919638.5,
  });

  await page.reload({ waitUntil: "networkidle" });
  const persistedCount = await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("deli-sales-tracker-v1"));
    return Object.keys(snapshot.records).length;
  });
  expect(persistedCount).toBe(2210);
});
