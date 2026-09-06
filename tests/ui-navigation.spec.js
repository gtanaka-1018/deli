const { test, expect } = require("@playwright/test");

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";

test("初回から記録でき、今日の下書きを保ったまま入力へ戻れる", async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await expect(page.locator("#welcomeDialog")).not.toBeVisible();
  await expect(page.locator("#recordToday")).toBeInViewport();
  await page.locator("#recordToday").click();
  await expect(page.locator(".service-select").first()).toBeFocused();
  await expect(page.locator("#inputDayHeading")).toBeInViewport();

  const start = page.locator('[data-session-field="startTime"]').first();
  await start.fill("0900");
  await start.blur();
  await expect(page.locator("#recordActionDock")).toBeVisible();
  await page.locator("#recordToday").click();
  await expect(start).toHaveValue("0900");
  await expect(page.locator("#recordActionDock")).toBeVisible();

  await expect(page.locator("#dailyWorkHours")).not.toBeVisible();
  await page.locator(".daily-details summary").click();
  await expect(page.locator("#dailyWorkHours")).toBeVisible();
});

test("別日の未保存入力は今日への移動を取り消すと残る", async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  const today = await page.locator("#selectedDate").inputValue();
  const otherDay = page.locator(`.input-calendar-day:not([data-input-date="${today}"])`).first();
  const selected = await otherDay.getAttribute("data-input-date");
  await otherDay.click();
  const start = page.locator('[data-session-field="startTime"]').first();
  await start.fill("1100");
  await start.blur();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#recordToday").click();
  await expect(page.locator("#selectedDate")).toHaveValue(selected);
  await expect(start).toHaveValue("1100");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#recordToday").click();
  await expect(page.locator("#selectedDate")).toHaveValue(today);
  await expect(start).toHaveValue("");
  await expect(page.locator("#recordActionDock")).toBeHidden();
});

test("読み込み後の起動でもオフラインの準備ができ、保存した記録を開ける", async ({ page, context }) => {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      await registration.unregister();
    }
    // 非同期の端末内復元が window.load より遅れて完了する起動経路。
    registerServiceWorker();
  });
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state;
  })).toBe("activated");

  const start = page.locator('[data-session-field="startTime"]').first();
  const end = page.locator('[data-session-field="endTime"]').first();
  await start.fill("0900");
  await start.blur();
  await end.fill("1000");
  await end.blur();
  await page.locator("#saveRecord").click();
  await expect(page.locator("#recordActionDock")).toBeHidden();

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#dailyWorkHours")).toHaveText("1.00h");
  await expect(start).toHaveValue("0900");
  await expect(end).toHaveValue("1000");
});
