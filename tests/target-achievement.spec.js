const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("達成率カードに小数なしの達成率と目標売上を表示する", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const currentDate = `${year}-${month}-${day}`;
    const currentMonth = `${year}-${month}`;
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "month",
      selectedDate: currentDate,
      records: {
        [currentDate]: {
          date: currentDate,
          services: { uber: { sales: 50000, count: 10 } },
          workSessions: [],
          workHours: 5,
          expenses: [],
        },
      },
      targets: { [currentMonth]: 100001 },
      providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
      vehicles: [],
      taxProfiles: {},
      taxYear: year,
      updatedAt: new Date().toISOString(),
    }));
  });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });
  await page.locator('[data-screen="summary"]').click();

  await expect(page.locator("#metricAchievement")).toHaveText("50%");
  await expect(page.locator("#metricAchievement")).not.toContainText(".");
  await expect(page.locator("#metricTargetSales")).toHaveText(/目標売上：[¥￥]100,001/);
});
