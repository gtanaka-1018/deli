const { test, expect } = require("@playwright/test");

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
});

const APP_URL = process.env.DELILOG_TEST_URL || "https://okumeter.com";
const SCREENS = ["input", "summary", "meter", "ranking", "plan", "tax", "maintenance", "settings"];

// 実データがないと集計・時間帯・チャートが描画されず、検査対象から漏れる。
function seedSnapshot() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const day = (index) => `${month}-${String(index).padStart(2, "0")}`;
  const today = day(now.getDate());
  const record = (date, sales, count, sessions) => ({
    date,
    services: { uber: { sales, count } },
    workSessions: sessions,
    workHours: 0,
    workHoursOverride: 0,
    breakHours: 0,
    expenses: [{ type: "gas", amount: 1200, fuelLiters: 8 }],
    odometerKm: 120,
  });
  const records = {
    [day(1)]: record(day(1), 6000, 6, [{ startTime: "06:00", endTime: "09:00" }]),
    [day(2)]: record(day(2), 12000, 9, [{ startTime: "11:00", endTime: "14:00" }]),
    [day(3)]: record(day(3), 9000, 6, [{ startTime: "18:00", endTime: "21:00" }]),
    [day(4)]: record(day(4), 7000, 5, [{ startTime: "23:00", endTime: "02:00" }]),
  };
  records[today] = {
    ...(records[today] || record(today, 8000, 8, [{ startTime: "06:00", endTime: "09:00" }])),
    payouts: [{ id: "contrast-payout", providerId: "uber", amount: 15000, memo: "今週分の振込" }],
  };

  return {
    view: "month",
    selectedDate: today,
    records,
    targets: { [month]: 20000 },
    providers: [{ id: "uber", label: "Uber", icon: "U", visible: true }],
    vehicles: [{ id: "contrast-bike", type: "motorcycle", label: "配達用バイク", visible: true }],
    maintenance: [{ id: "contrast-service", vehicleId: "contrast-bike", date: today, description: "オイル交換", odometerKm: 12000, memo: "次回はタイヤも点検" }],
    taxProfiles: {},
    assets: { cash: 900000, securities: 200000, liabilities: 100000 },
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// 文字と背景のコントラスト比を測る。背景は透過と重なりを合成し、
// グラデーションは不透明な最後の層で近似する。
const MEASURE = `(() => {
  function parse(value) {
    const match = value && value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const parts = match[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
  }
  function over(front, back) {
    const a = front.a + back.a * (1 - front.a);
    if (!a) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
      g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
      b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
      a,
    };
  }
  function luminance(color) {
    const channel = (value) => {
      value /= 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  }
  function contrast(a, b) {
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }
  function backdrop(element) {
    let node = element;
    let stack = { r: 0, g: 0, b: 0, a: 0 };
    while (node) {
      const style = getComputedStyle(node);
      let color = parse(style.backgroundColor);
      const image = style.backgroundImage;
      if (image && image !== "none" && /gradient/.test(image)) {
        const opaque = [...image.matchAll(/rgba?\\([^)]+\\)/g)]
          .map((match) => parse(match[0]))
          .filter((value) => value && value.a > 0.9);
        if (opaque.length) color = opaque[opaque.length - 1];
      }
      if (color && color.a > 0) {
        stack = stack.a === 0 ? color : over(stack, color);
        if (stack.a >= 0.999) return stack;
      }
      node = node.parentElement;
    }
    const base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    return stack.a > 0 ? over(stack, base) : base;
  }

  const failures = [];
  document.querySelectorAll("*").forEach((element) => {
    if (element.offsetParent === null && getComputedStyle(element).position !== "fixed") return;
    const text = [...element.childNodes]
      .filter((node) => node.nodeType === 3 && node.textContent.trim())
      .map((node) => node.textContent.trim())
      .join(" ");
    if (!text) return;
    const style = getComputedStyle(element);
    const foreground = parse(style.color);
    if (!foreground) return;
    const background = backdrop(element);
    const solid = foreground.a < 1 ? over(foreground, background) : foreground;
    const ratio = contrast(solid, background);
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight) || 400;
    const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    if (ratio >= required) return;
    failures.push({
      selector: (element.tagName + "." + (typeof element.className === "string"
        ? element.className.trim().split(/\\s+/).slice(0, 2).join(".")
        : "")).slice(0, 48),
      text: text.slice(0, 18),
      ratio: Number(ratio.toFixed(2)),
      required,
      color: style.color,
    });
  });
  return failures;
})()`;

for (const scheme of ["light", "dark"]) {
  test(`${scheme === "dark" ? "ダーク" : "ライト"}テーマの全画面で文字が背景から読み取れる`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((snapshot) => {
      localStorage.setItem("deli-onboarding-complete-v1", "done");
      localStorage.setItem("deli-sales-tracker-v1", JSON.stringify(snapshot));
    }, seedSnapshot());

    await page.goto(APP_URL, { waitUntil: "networkidle" });

    const found = [];
    for (const screen of SCREENS) {
      await page.locator(`[data-screen="${screen}"]`).click();
      if (screen === "input") {
        await page.locator(".daily-details").evaluate((element) => { element.open = true; });
        await page.locator(".product-about").evaluate((element) => { element.open = true; });
        await expect(page.locator("#payoutList [data-edit-payout]")).toHaveCount(1);
        await expect(page.locator("#payoutList [data-edit-payout]")).toBeVisible();
        await expect(page.locator("#payoutList")).toContainText("Uber");
        await expect(page.locator("#payoutList")).toContainText("今週分の振込");
      }
      await page.waitForTimeout(300);
      const failures = await page.evaluate(MEASURE);
      failures.forEach((failure) => found.push({ screen, ...failure }));
      if (screen === "maintenance") {
        await page.locator("#addMaintenance").click();
        await expect(page.locator("#maintenanceDialog")).toBeVisible();
        const dialogFailures = await page.evaluate(MEASURE);
        dialogFailures.forEach((failure) => found.push({ screen: "maintenance:dialog", ...failure }));
        await page.locator("#maintenanceCancel").click();
      }
      if (screen === "input") {
        await page.locator("#addPayout").click();
        await expect(page.locator("#payoutDialog")).toBeVisible();
        const dialogFailures = await page.evaluate(MEASURE);
        dialogFailures.forEach((failure) => found.push({ screen: "input:payout-dialog", ...failure }));
        await page.locator("#payoutDialogCancel").click();
        await expect(page.locator("#payoutDialog")).not.toBeVisible();
      }
    }

    expect(found, `読み取れない文字が見つかりました:\n${JSON.stringify(found, null, 2)}`).toEqual([]);
  });
}
