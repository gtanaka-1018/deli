const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

test("確定申告画面をスマホ幅で操作できる", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("deli-sales-tracker-v1", JSON.stringify({
      view: "day",
      selectedDate: "2026-08-12",
      records: {},
      targets: {},
      providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
      vehicles: [],
      taxProfiles: {},
      taxYear: 2026,
      updatedAt: "2099-01-01T00:00:00.000Z",
    }));
  });
  await page.goto(process.env.DELILOG_TEST_URL || "https://okumeter.com", { waitUntil: "networkidle" });

  await expect(page.locator("#welcomeDialog")).toBeVisible();
  await expect(page.locator("#welcomeDialog")).toContainText("配達の数字を、迷わず管理。");
  if (process.env.DELILOG_WELCOME_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_WELCOME_SCREENSHOT, fullPage: true });
  }
  await page.locator("#welcomeStart").click();

  await page.locator('[data-screen="tax"]').click();
  await expect(page.locator("#taxScreen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "確定申告・納税見込み" })).toBeVisible();

  await page.locator("#taxOtherIncome").fill("3000000");
  await page.locator("#taxIdeco").fill("276000");
  await page.locator("#taxMutualAid").fill("240000");
  await page.locator("#taxRegion").selectOption("kanagawa_yokohama");
  await expect(page.locator("#taxTotalBurden")).not.toHaveText("¥0");
  await expect(page.locator("#taxIncomeDeadline")).toContainText("確定申告");
  await expect(page.locator("#taxResidentRate")).toHaveText("10.018%");
  await expect(page.locator("#taxRegionNote")).toContainText("神奈川県・横浜市");

  await page.locator("#taxEmploymentMode").selectOption("side_job");
  await expect(page.locator("#taxSalaryRevenueField")).toBeVisible();
  await expect(page.locator("#taxSalaryWithholdingField")).toBeVisible();
  await expect(page.locator("#taxResidentPaymentField")).toBeVisible();
  await page.locator("#taxSalaryRevenue").fill("6000000");
  await page.locator("#taxSalaryWithholding").fill("200000");
  await expect(page.locator("#taxSalaryIncomePreview")).toHaveText(/[¥￥]4,360,000/);
  await expect(page.locator("#taxTotalLabel")).toHaveText("確定申告などで別途納める見込み");
  await expect(page.locator("#taxCompanyHandled")).toHaveText(/[¥￥]200,000/);
  await expect(page.locator("#taxFilingStatus")).toContainText("給与と配達を合算");

  await page.locator("#taxResidentPaymentMethod").selectOption("payroll");
  await expect(page.locator("#taxAdditionalPaymentLabel")).toContainText("申告・事業税");
  await page.locator("#taxOtherIncome").fill("100000");
  await expect(page.locator("#taxFilingStatus")).toContainText("20万円以下");
  await expect(page.locator("#taxIncomeDeadline")).toContainText("住民税申告");

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(pageErrors).toEqual([]);

  if (process.env.DELILOG_TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.DELILOG_TEST_SCREENSHOT, fullPage: true });
  }
});

test("PWA用ファイルを配信できる", async ({ request }) => {
  const baseUrl = process.env.DELILOG_TEST_URL || "https://okumeter.com";
  const manifest = await request.get(`${baseUrl}/manifest.webmanifest`);
  const worker = await request.get(`${baseUrl}/service-worker.js`);
  expect(manifest.ok()).toBeTruthy();
  expect(worker.ok()).toBeTruthy();
});
