const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("利用者向け名称が億メーターに統一されている", async ({ page, request }) => {
  const appUrl = process.env.DELILOG_TEST_URL || "https://okumeter.com";
  const initialRequests = [];
  page.on("request", (outgoing) => initialRequests.push(outgoing.url()));
  await page.goto(appUrl, { waitUntil: "networkidle" });

  await expect(page).toHaveTitle("フードデリバリー配達員の売上・経費・税金管理 | 億メーター");
  await expect(page.locator(".brand-text h1")).toHaveText("億メーター");
  await expect(page.locator(".brand-mark")).toHaveAttribute("src", "/brand-mark.svg");
  await expect(page.locator("#welcomeStart")).toHaveText("億メーターをはじめる");
  await expect(page.locator("[data-public-traffic]")).toBeVisible();
  await expect(page.locator("main > .product-discovery")).toContainText("入力内容はこの端末内だけに保存");
  expect(initialRequests.some((url) => url.includes("@supabase/supabase-js"))).toBeFalsy();
  expect(initialRequests.some((url) => url.includes("/api/ranking-config"))).toBeFalsy();

  const manifestResponse = await request.get(`${appUrl}/manifest.webmanifest`);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("億メーター | 配達収益管理");
  expect(manifest.short_name).toBe("億メーター");
  expect(manifest.icons[0].src).toBe("app-icon.png");

  const robotsResponse = await request.get(`${appUrl}/robots.txt`);
  const sitemapResponse = await request.get(`${appUrl}/sitemap.xml`);
  const socialImageResponse = await request.get(`${appUrl}/og-image.png`);
  expect(robotsResponse.ok()).toBeTruthy();
  expect(await robotsResponse.text()).toContain("Sitemap: https://okumeter.com/sitemap.xml");
  expect(sitemapResponse.ok()).toBeTruthy();
  expect(await sitemapResponse.text()).toContain("<loc>https://okumeter.com/</loc>");
  expect(socialImageResponse.ok()).toBeTruthy();
  expect(socialImageResponse.headers()["content-type"]).toContain("image/png");
});

test("紹介エリアから機能へ移動し追跡可能な共有URLを渡す", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => { window.__sharedAppData = data; },
    });
  });
  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });

  await page.locator("#shareApp").click();
  const shareData = await page.evaluate(() => window.__sharedAppData);
  expect(shareData.title).toBe("億メーター");
  const sharedUrl = new URL(shareData.url);
  expect(sharedUrl.origin).toBe("https://okumeter.com");
  expect(sharedUrl.searchParams.get("utm_source")).toBe("share");
  expect(sharedUrl.searchParams.get("utm_medium")).toBe("referral");

  await page.locator('[data-open-screen="tax"]').click();
  await expect(page.locator("#taxScreen")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
