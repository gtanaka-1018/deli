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

const provider = { id: "uber", label: "Uber", icon: "U", visible: true };
const vehicle = { id: "bike-1", type: "motorcycle", label: "配達バイク", visible: true };

test("新規日の車両に前回保存した車両を適用する", async ({ page }) => {
  await page.addInitScript(({ savedProvider, savedVehicle }) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      records: {},
      targets: {},
      providers: [savedProvider],
      vehicles: [savedVehicle],
      lastVehicleId: savedVehicle.id,
      taxProfiles: {},
      assets: {},
    }));
  }, { savedProvider: provider, savedVehicle: vehicle });

  await page.goto(process.env.DELILOG_TEST_URL || "http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await expect(page.locator("#vehicleId")).toHaveValue(vehicle.id);
});

test("経費がない日は不要な指標を隠しプラットフォーム単価を表示する", async ({ page }) => {
  const today = dateString(new Date());
  await page.addInitScript(({ date, savedProvider, savedVehicle }) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      records: {
        [date]: {
          date,
          services: { uber: { count: 4, sales: 2400 } },
          workSessions: [],
          workHours: 2,
          workHoursOverride: 0,
          breakHours: 0,
          vehicleId: savedVehicle.id,
          expenses: [],
        },
      },
      targets: {},
      providers: [savedProvider],
      vehicles: [savedVehicle],
      lastVehicleId: savedVehicle.id,
      taxProfiles: {},
      assets: {},
    }));
  }, { date: today, savedProvider: provider, savedVehicle: vehicle });

  await page.goto(process.env.DELILOG_TEST_URL || "http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await expect(page.locator("#dailyExpense").locator("..")).toBeHidden();
  await expect(page.locator("#dailyGasUnit").locator("..")).toBeHidden();
  await expect(page.locator('[data-service="uber"] .service-unit-price')).toHaveText(/単価 [¥￥]600\/件/);

  await page.locator('[data-screen="summary"]').click();
  await expect(page.locator("#dayReport .service-summary-values")).toContainText(/単価 [¥￥]600\/件/);
});
