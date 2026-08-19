const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("狭いスマホ幅で開始・終了時刻が重ならない", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("deli-onboarding-complete-v1", "done"));
  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });

  const row = page.locator(".work-session-row").first();
  const start = row.locator('[data-session-field="startTime"]');
  const end = row.locator('[data-session-field="endTime"]');
  await expect(row).toBeVisible();

  const boxes = {
    row: await row.boundingBox(),
    start: await start.boundingBox(),
    end: await end.boundingBox(),
  };
  expect(boxes.row).not.toBeNull();
  expect(boxes.start).not.toBeNull();
  expect(boxes.end).not.toBeNull();
  expect(boxes.start.y + boxes.start.height).toBeLessThanOrEqual(boxes.end.y);
  expect(boxes.start.x + boxes.start.width).toBeLessThanOrEqual(boxes.row.x + boxes.row.width + 1);
  expect(boxes.end.x + boxes.end.width).toBeLessThanOrEqual(boxes.row.x + boxes.row.width + 1);

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);

  if (process.env.DELILOG_INPUT_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_INPUT_SCREENSHOT, fullPage: true });
  }
});
