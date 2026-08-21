const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("走行距離を記録した日の売上からkm単価を表示する", async ({ page }) => {
  const today = new Date();
  const previousDay = new Date(today);
  previousDay.setDate(previousDay.getDate() - 1);
  const todayKey = dateString(today);
  const previousKey = dateString(previousDay);

  await page.addInitScript(({ currentDate, previousDate }) => {
    const record = (date, sales, odometerKm) => ({
      date,
      services: { uber: { sales, count: sales > 0 ? 8 : 0 } },
      workSessions: [],
      workHours: sales > 0 ? 4 : 0,
      workHoursOverride: 0,
      breakHours: 0,
      vehicleId: "bike-1",
      odometerKm,
      distanceKm: 0,
      expenses: [],
      memo: "",
      sourceData: {},
    });

    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      selectedDate: currentDate,
      records: {
        [previousDate]: record(previousDate, 0, 100),
        [currentDate]: record(currentDate, 8000, 140),
      },
      targets: {},
      providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
      vehicles: [{ id: "bike-1", type: "motorcycle", label: "配達バイク", visible: true }],
      taxProfiles: {},
      assets: {},
      taxYear: new Date().getFullYear(),
      updatedAt: new Date().toISOString(),
    }));
  }, { currentDate: todayKey, previousDate: previousKey });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });

  await expect(page.locator("#dailyKmUnit")).toHaveText(/[¥￥]200\/km/);
  await expect(page.locator("#odometerHint")).toContainText("当日分 40km");

  await page.locator('[data-screen="summary"]').click();
  const kmUnitTile = page.locator("#dayReport .summary-tile", { hasText: "km単価（売上）" });
  await expect(kmUnitTile).toContainText(/[¥￥]200\/km/);
  await expect(page.locator("#dayReport .day-line", { hasText: "km単価（売上）" })).toContainText(/[¥￥]200\/km/);
});
