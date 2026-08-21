const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("稼働時刻を3〜4桁で入力し、未保存時だけ保存ボタンを追従表示する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("deli-onboarding-complete-v1", "done"));
  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });

  const start = page.locator('[data-session-field="startTime"]').first();
  const end = page.locator('[data-session-field="endTime"]').first();
  const dock = page.locator("#recordActionDock");

  await expect(start).toHaveAttribute("type", "text");
  await expect(start).toHaveAttribute("inputmode", "numeric");
  await expect(dock).toBeHidden();

  await start.fill("645");
  await start.blur();
  await expect(start).toHaveValue("0645");
  await expect(dock).toBeVisible();
  await expect(page.locator("#saveRecord")).toHaveText("記録を保存");

  await end.fill("0745");
  await end.blur();
  await expect(end).toHaveValue("0745");
  await expect(page.locator("#dailyWorkHours")).toHaveText("1.00h");
  await expect(dock).toHaveCSS("position", "fixed");
  const dockBox = await dock.boundingBox();
  const navBox = await page.locator("#primaryNav").boundingBox();
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(navBox.y + 1);

  await page.locator("#saveRecord").click();
  await expect(dock).toBeHidden();
});
