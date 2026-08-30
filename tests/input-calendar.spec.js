const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

test("iPhone 15 Pro Maxで月間実績を見ながら入力日を選べる", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDate = dateKey(year, month, 5);
  const secondDate = dateKey(year, month, 12);
  const provider = { id: "uber", label: "Uber", icon: "U", visible: true };

  await page.addInitScript(({ savedProvider, first, second }) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      records: {
        [first]: {
          date: first,
          services: { uber: { count: 7, sales: 6500 } },
          workSessions: [{ startTime: "10:00", endTime: "12:00" }],
          expenses: [],
          sourceData: { weather: "晴れ" },
        },
        [second]: {
          date: second,
          services: { uber: { count: 8, sales: 8000 } },
          workHours: 3.5,
          expenses: [],
          sourceData: { weather: "雨" },
        },
      },
      targets: {},
      providers: [savedProvider],
      vehicles: [],
      taxProfiles: {},
      assets: {},
    }));
  }, { savedProvider: provider, first: firstDate, second: secondDate });

  await page.goto(process.env.DELILOG_TEST_URL || "http://127.0.0.1:4173", { waitUntil: "networkidle" });

  const daysInMonth = new Date(year, month, 0).getDate();
  await expect(page.locator("#inputCalendarGrid .input-calendar-day")).toHaveCount(daysInMonth);
  await expect(page.locator("#calendarMonthSales")).toHaveText(/14,500/);
  await expect(page.locator("#calendarMonthCount")).toHaveText("15件");
  await expect(page.locator("#calendarMonthHours")).toHaveText("5h30m");
  await expect(page.locator(`[data-input-date="${firstDate}"] strong`)).toHaveText("6,500");
  await expect(page.locator(`[data-input-date="${firstDate}"] .input-calendar-weather`)).toHaveText("☀");

  await page.locator(`[data-input-date="${secondDate}"]`).click();
  await expect(page.locator("#selectedDate")).toHaveValue(secondDate);
  await expect(page.locator(`[data-input-date="${secondDate}"]`)).toHaveAttribute("aria-current", "date");
  await expect(page.locator("#inputDayHeading")).toContainText(`${month}月12日`);
  await expect(page.locator("#dailyCount")).toHaveText("8件");
  await expect(page.locator("#dailyUnitPrice")).toHaveText(/1,000/);

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    calendarBottom: document.querySelector("#inputCalendarPanel").getBoundingClientRect().bottom,
    dayHeadingTop: document.querySelector("#inputDayHeading").getBoundingClientRect().top,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.dayHeadingTop).toBeGreaterThanOrEqual(layout.calendarBottom);
  expect(layout.dayHeadingTop).toBeLessThan(850);

  if (process.env.DELILOG_INPUT_CALENDAR_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_INPUT_CALENDAR_SCREENSHOT, fullPage: true });
  }
});
