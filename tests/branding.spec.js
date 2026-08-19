const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("利用者向け名称が億メーターに統一されている", async ({ page, request }) => {
  const appUrl = process.env.DELILOG_TEST_URL || "https://okumeter.com";
  await page.goto(appUrl, { waitUntil: "networkidle" });

  await expect(page).toHaveTitle("億メーター | 配達収益管理");
  await expect(page.locator(".brand-text h1")).toHaveText("億メーター");
  await expect(page.locator(".brand-mark")).toHaveAttribute("src", "app-icon.png");
  await expect(page.locator("#welcomeStart")).toHaveText("億メーターをはじめる");
  await expect(page.locator("[data-public-traffic]")).toBeVisible();

  const manifestResponse = await request.get(`${appUrl}/manifest.webmanifest`);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("億メーター | 配達収益管理");
  expect(manifest.short_name).toBe("億メーター");
  expect(manifest.icons[0].src).toBe("app-icon.png");
});
