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

test("同意したユーザーだけが資産と日別売上をランキングへ送信する", async ({ page }) => {
  const today = dateString(new Date());
  await page.setViewportSize({ width: 320, height: 740 });

  await page.route("**/api/ranking-config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      available: true,
      url: "https://ranking-test.supabase.co",
      publishableKey: "sb_publishable_test_12345678901234567890",
    }),
  }));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      window.__rankingCalls = [];
      window.supabase = {
        createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session: { user: { email: "rider@example.com" } } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signInWithOtp: async () => ({ error: null }),
              signOut: async () => ({ error: null }),
            },
            rpc: async (name, args) => {
              window.__rankingCalls.push({ name, args });
              if (name === "get_my_ranking_status") {
                return { data: [{ is_participating: false, display_name: null }], error: null };
              }
              if (name === "get_asset_rankings") {
                return { data: [{ rank: 1, display_name: "先行ライダー", net_assets: 3000000 }], error: null };
              }
              if (name === "get_daily_sales_rankings") {
                return { data: [{ rank: 1, display_name: "先行ライダー", sales_date: "${today}", delivery_count: 12, sales_amount: 15000 }], error: null };
              }
              return { data: null, error: null };
            },
          };
        },
      };
    `,
  }));

  await page.addInitScript(({ currentDate }) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      selectedDate: currentDate,
      records: {
        [currentDate]: {
          date: currentDate,
          services: { uber: { sales: 8000, count: 8 } },
          workSessions: [],
          workHours: 4,
          workHoursOverride: 0,
          breakHours: 0,
          expenses: [],
        },
      },
      targets: {},
      providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
      vehicles: [],
      taxProfiles: {},
      assets: { cash: 2000000, liabilities: 500000 },
      taxYear: new Date().getFullYear(),
      updatedAt: new Date().toISOString(),
    }));
  }, { currentDate: today });

  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });
  await page.locator('[data-screen="ranking"]').click();

  await expect(page.locator("#rankingScreen")).toBeVisible();
  await expect(page.locator("#rankingSignedInEmail")).toHaveText("rider@example.com");
  await expect(page.locator("#assetRankingRows")).toContainText("先行ライダー");
  await expect(page.locator("#salesRankingRows")).toContainText("12件");
  await expect(page.locator("#salesRankingRows")).toContainText(/[¥￥]15,000/);

  await page.locator("#rankingDisplayName").fill("テストライダー");
  await page.locator("#rankingConsent").check();
  await page.locator("#rankingSaveConsent").click();
  await expect(page.locator("#rankingStatus")).toContainText("参加内容を更新しました");

  const syncCall = await page.evaluate(() => window.__rankingCalls.find((call) => call.name === "sync_my_rankings"));
  expect(syncCall.args.p_display_name).toBe("テストライダー");
  expect(syncCall.args.p_net_assets).toBe(1500000);
  expect(syncCall.args.p_daily_sales).toEqual([{ date: today, count: 8, sales: 8000 }]);

  await page.locator("#rankingConsent").uncheck();
  await page.locator("#rankingSaveConsent").click();
  await expect(page.locator("#rankingStatus")).toContainText("公開データを削除しました");
  const leaveCalls = await page.evaluate(() => window.__rankingCalls.filter((call) => call.name === "leave_rankings").length);
  expect(leaveCalls).toBe(1);

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);

  if (process.env.DELILOG_RANKING_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_RANKING_SCREENSHOT, fullPage: true });
  }
});
