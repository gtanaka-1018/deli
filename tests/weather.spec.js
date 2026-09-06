const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const STORAGE_KEY = "deli-sales-tracker-v1";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function seed(page, records = {}) {
  await page.addInitScript((stored) => {
    localStorage.setItem("deli-onboarding-complete-v1", "done");
    // 初回だけ用意する。再読み込みで上書きすると保存結果を検証できない。
    if (!localStorage.getItem("deli-sales-tracker-v1")) {
      localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(stored));
    }
  }, {
    view: "day",
    records,
    targets: {},
    providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
    vehicles: [],
    taxProfiles: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

test("天気を選んで保存し、カレンダーとフォームに残る", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.goto(APP_URL, { waitUntil: "networkidle" });

  await page.locator('.weather-option', { hasText: "雨" }).click();
  await page.locator("#saveRecord").click();
  await expect(page.locator("#toast")).toContainText("保存しました");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.records[today()].weather).toBe("雨");

  // 再読み込みしても、カレンダーの印と選択状態が戻る。
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(`.input-calendar-day[data-input-date="${today()}"] .input-calendar-weather`)).toHaveText("☂");
  await expect(page.locator('input[name="weather"]:checked')).toHaveValue("雨");
});

test("取り込み済みデータの天気表記も選択肢へ寄せて扱う", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const date = today();
  // 取り込み元のデータは sourceData 側に、表記の揺れを含んだまま入っている。
  await seed(page, {
    [date]: {
      date,
      services: { uber: { sales: 5000, count: 4 } },
      workSessions: [],
      workHours: 3,
      workHoursOverride: 0,
      breakHours: 0,
      expenses: [],
      sourceData: { weather: "雲" },
    },
  });
  await page.goto(APP_URL, { waitUntil: "networkidle" });

  // 「雲」は選択肢の「曇」として扱い、記録済みの値を失わない。
  await expect(page.locator('input[name="weather"]:checked')).toHaveValue("曇");
  await expect(page.locator(`.input-calendar-day[data-input-date="${date}"] .input-calendar-weather`)).toHaveText("☁");
});
