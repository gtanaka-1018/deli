const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

function pad(value) {
  return String(value).padStart(2, "0");
}

test("日・週・月・年を選択したタップだけで即時反映する", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      records: {},
      targets: {},
      providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
      vehicles: [],
      taxProfiles: {},
      updatedAt: "2099-01-01T00:00:00.000Z",
    }));
  });
  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });

  const today = await page.evaluate(() => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  await expect(page.locator("#selectedDate")).toHaveValue(today);

  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  // 期間選択は常に「今日」を起点に開く。今月以外の月を選んで反映を確かめる。
  const otherMonth = currentMonth === 1 ? 2 : 1;
  const laterMonth = currentMonth === 12 ? 11 : 12;

  const picker = page.locator("#periodPickerDialog");
  await page.locator("#periodPickerButton").click();
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("data-type", "month");
  await expect(picker.locator("#periodPickerTitle")).toHaveText("月を選択");
  await picker.locator(`[data-period-date="${currentYear}-${pad(otherMonth)}-01"]`).click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedDate")).toHaveValue(`${currentYear}-${pad(otherMonth)}-01`);
  await expect(page.locator("#periodPickerValue")).toHaveText(`${currentYear}年${otherMonth}月`);

  await page.locator('[data-screen="summary"]').click();
  await page.waitForTimeout(250);
  const layouts = [];
  const captureLayout = async () => layouts.push(await page.evaluate(() => {
    const pickerButton = document.querySelector("#periodPickerButton").getBoundingClientRect();
    const metrics = document.querySelector("#summaryScreen .metrics-grid").getBoundingClientRect();
    return { buttonWidth: pickerButton.width, buttonHeight: pickerButton.height, metricsY: metrics.y };
  }));
  await captureLayout();

  // 集計タブの切り替えは選択日を今日へ戻すため、週候補は今月の週だけが並ぶ。
  await page.locator("#weekViewTab").click();
  await expect(page.locator("#selectedDate")).toHaveValue(today);
  await page.locator("#periodPickerButton").click();
  await expect(picker).toHaveAttribute("data-type", "week");
  const weekOption = picker.locator(".period-week-option").nth(1);
  const weekRangeLabel = (await weekOption.locator("span").innerText()).trim();
  const weekNumberLabel = (await weekOption.locator("small").innerText()).trim();
  const expectedWeekValue = weekNumberLabel.replace("年 第", "-W").replace("週", "");
  await weekOption.click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedWeek")).toHaveValue(expectedWeekValue);
  await expect(page.locator("#periodPickerValue")).toHaveText(weekRangeLabel);
  await captureLayout();

  await page.locator("#monthViewTab").click();
  await expect(page.locator("#selectedMonth")).toHaveValue(today.slice(0, 7));
  await page.locator("#periodPickerButton").click();
  await picker.locator(`[data-period-date="${currentYear}-${pad(laterMonth)}-01"]`).click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedMonth")).toHaveValue(`${currentYear}-${pad(laterMonth)}`);
  await expect(page.locator("#periodPickerValue")).toHaveText(`${currentYear}年${laterMonth}月`);
  await captureLayout();

  await page.locator("#yearViewTab").click();
  await expect(page.locator("#selectedYear")).toHaveValue(today.slice(0, 4));
  await page.locator("#periodPickerButton").click();
  // 年候補は12年ごとの区切りで並ぶ。今年と同じ区切りに入る別の年を選ぶ。
  const firstYear = Math.floor(currentYear / 12) * 12;
  const otherYear = currentYear === firstYear ? currentYear + 1 : currentYear - 1;
  await picker.locator(`[data-period-date="${otherYear}-01-01"]`).click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#selectedYear")).toHaveValue(String(otherYear));
  await expect(page.locator("#periodPickerValue")).toHaveText(`${otherYear}年`);
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

  await page.locator("#prevPeriod").click();
  await expect(page.locator("#selectedDate")).not.toHaveValue(today);
  await page.locator('[data-screen="input"]').click();
  await expect(page.locator("#selectedDate")).toHaveValue(today);

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
