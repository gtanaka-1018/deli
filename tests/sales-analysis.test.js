const test = require("node:test");
const assert = require("node:assert/strict");
const { periods, analyze } = require("../public/sales-analysis.js");

function row(date, sales = 0, count = 0, hours = 0, extra = {}) {
  return { date, services: { uber: { sales, count } }, hours, expense: 0, weather: "", ...extra };
}

function month(rows, selected = "2026-09-01", today = "2026-10-01") {
  return analyze(rows, periods("month", selected, today));
}

test("UTCの暦で年越し、週の月曜始まり、閏年を扱う", () => {
  assert.deepEqual(periods("day", "2026-01-01", "2026-09-15"), {
    currentStart: "2026-01-01", currentEnd: "2026-01-01",
    previousStart: "2025-12-31", previousEnd: "2025-12-31", isPartial: false, isFuture: false,
  });
  const week = periods("week", "2026-01-01", "2026-09-15");
  assert.equal(week.currentStart, "2025-12-29");
  assert.equal(week.currentEnd, "2026-01-04");
  assert.equal(week.previousStart, "2025-12-22");
  assert.equal(week.previousEnd, "2025-12-28");
  const leap = periods("month", "2024-03-01", "2026-09-15");
  assert.equal(leap.previousEnd, "2024-02-29");
  const year = periods("year", "2024-02-29", "2026-09-15");
  assert.equal(year.currentEnd, "2024-12-31");
  assert.equal(year.previousEnd, "2023-12-31");
});

test("進行中の週・月・年は今日までと対応する前期間を比較する", () => {
  const week = periods("week", "2026-09-14", "2026-09-15");
  assert.equal(week.currentEnd, "2026-09-15");
  assert.equal(week.previousEnd, "2026-09-08");
  assert.equal(week.isPartial, true);
  const ordinary = periods("month", "2026-09-01", "2026-09-15");
  assert.equal(ordinary.previousEnd, "2026-08-15");
  const shortMonth = periods("month", "2024-03-01", "2024-03-30");
  assert.equal(shortMonth.previousEnd, "2024-02-29");
  const year = periods("year", "2024-01-01", "2024-02-29");
  assert.equal(year.previousEnd, "2023-02-28");
  assert.equal(periods("month", "2026-09-01", "2026-09-30").isPartial, false);
  // 月末当日は完成期間として、前月も月末まで比較する。
  assert.equal(periods("month", "2026-04-01", "2026-04-30").previousEnd, "2026-03-31");
  assert.equal(periods("month", "2026-04-01", "2026-05-01").previousEnd, "2026-03-31");
});

test("未来の記録を当期へ含めず、未来期間は前期も含め空にする", () => {
  const rows = [row("2026-09-14", 1000, 1, 1), row("2026-09-16", 9000, 9, 9), row("2026-08-16", 8000, 8, 8)];
  const partial = month(rows, "2026-09-01", "2026-09-15");
  assert.equal(partial.current.sales, 1000);
  assert.equal(partial.previous.sales, 0);
  const range = periods("month", "2026-10-01", "2026-09-15");
  assert.equal(range.isFuture, true);
  assert.equal(range.currentEnd, "2026-09-15");
  const future = analyze([...rows, row("2026-10-01", 5000, 5, 5)], range);
  assert.equal(future.current.sales, 0);
  assert.equal(future.previous.sales, 0);
  assert.deepEqual(future.platforms, []);
  assert.equal(future.change.available, false);
});

test("時給・経費差引後時給は時間記録がある同じ日の分子と分母で計算する", () => {
  const result = month([
    row("2026-09-01", 12000, 12, 4, { expense: 2000 }),
    row("2026-09-02", 24000, 24, 0, { expense: 9000 }),
    row("2026-09-03", 0, 0, 0, { expense: 5000 }),
  ]);
  assert.equal(result.current.sales, 36000);
  assert.equal(result.current.expense, 16000);
  assert.equal(result.current.days, 2);
  assert.equal(result.current.timedDays, 1);
  assert.equal(result.current.timedSales, 12000);
  assert.equal(result.current.hourly, 3000);
  assert.equal(result.current.netHourly, 2500);
  assert.equal(result.weekdays[2].hourly, null);
  assert.equal(result.weekdays[3].days, 0);
});

test("売上ゼロでも稼働時間があれば稼働日と時給の分母に含める", () => {
  const result = month([row("2026-09-01", 6000, 6, 2), row("2026-09-08", 0, 0, 2, { expense: 1000 })]);
  assert.equal(result.current.days, 2);
  assert.equal(result.current.hourly, 1500);
  assert.equal(result.current.netHourly, 1250);
  assert.equal(result.weekdays[1].medianHourly, 1500);
  assert.equal(result.weekdays[1].timedDays, 2);
});

test("件数未記録の売上が1社でもあれば全体単価と増減分解を欠測にする", () => {
  const result = month([
    row("2026-08-01", 1000, 1, 1),
    row("2026-09-01", 0, 0, 1, { services: { uber: { sales: 1000, count: 1 }, rocket: { sales: 500, count: 0 } } }),
    row("2026-09-02", 1000, 0, 1),
  ]);
  assert.equal(result.current.count, 1);
  assert.equal(result.current.missingCountDays, 2);
  assert.equal(result.current.unitPrice, null);
  assert.equal(result.change.available, true);
  assert.equal(result.change.countEffect, null);
  assert.equal(result.change.unitEffect, null);
  assert.match(result.change.reason, /件数未記録/);
  assert.equal(result.platforms.find((item) => item.providerId === "uber").missingCountDays, 1);
  assert.equal(result.platforms.find((item) => item.providerId === "uber").unitPrice, null);
});

test("曜日の標本数と時間を併記し、比較できる曜日が2つ未満なら推奨しない", () => {
  const rows = ["01", "08", "15"].map((day) => row(`2026-09-${day}`, 4000, 4, 2));
  rows.push(row("2026-09-02", 50000, 50, 1));
  const sparse = month(rows);
  assert.equal(sparse.weekdays[1].eligible, true);
  assert.equal(sparse.weekdays[2].eligible, false);
  assert.equal(sparse.bestWeekday, null);
  rows.push(row("2026-09-09", 6000, 6, 3), row("2026-09-16", 6000, 6, 3));
  assert.equal(month(rows).bestWeekday.id, 2);
});

test("曜日時給は合計の比、中央値は日別時給から計算して外れ値を示す", () => {
  const result = month([
    row("2026-09-01", 2000, 2, 2),
    row("2026-09-08", 4000, 4, 2),
    row("2026-09-15", 60000, 60, 6),
  ]);
  assert.equal(result.weekdays[1].hourly, 6600);
  assert.equal(result.weekdays[1].medianHourly, 2000);
  assert.equal(result.weekdays[1].hours, 10);
});

test("十分な標本があっても最高時給が同率なら特定の曜日を推奨しない", () => {
  const rows = ["01", "08", "15"].map((day) => row(`2026-09-${day}`, 4000, 4, 2));
  rows.push(...["02", "09", "16"].map((day) => row(`2026-09-${day}`, 6000, 6, 3)));
  const result = month(rows);
  assert.equal(result.weekdays[1].eligible, true);
  assert.equal(result.weekdays[2].eligible, true);
  assert.equal(result.weekdays[1].hourly, 2000);
  assert.equal(result.weekdays[2].hourly, 2000);
  assert.equal(result.bestWeekday, null);
  // 丸め誤差程度の差もランキング根拠にしない。
  rows[0].services.uber.sales += 1e-10;
  assert.equal(month(rows).bestWeekday, null);
  rows[0].services.uber.sales += 6;
  assert.equal(month(rows).bestWeekday.id, 1);
});

test("対称な件数・単価分解は売上差に一致し、比較方向を逆転できる", () => {
  const result = month([row("2026-08-01", 10000, 10, 5), row("2026-09-01", 18000, 12, 5)]);
  assert.equal(result.change.delta, 8000);
  assert.equal(result.change.percent, 0.8);
  assert.equal(result.change.countEffect, 2500);
  assert.equal(result.change.unitEffect, 5500);
  assert.equal(result.change.countEffect + result.change.unitEffect, result.change.delta);
  const reverse = month([row("2026-08-01", 18000, 12, 5), row("2026-09-01", 10000, 10, 5)]);
  assert.equal(reverse.change.countEffect, -2500);
  assert.equal(reverse.change.unitEffect, -5500);
  const zero = month([row("2026-08-01", 0, 0, 2), row("2026-09-01", 1000, 1, 2)]);
  assert.equal(zero.change.available, true);
  assert.equal(zero.change.percent, null);
  assert.equal(zero.change.countEffect, null);
});

test("振込や経費だけの日は売上・曜日・天気へ加算しない", () => {
  const result = month([
    row("2026-09-01", 4000, 4, 2, { weather: "晴" }),
    row("2026-09-02", 0, 0, 0, { payouts: [{ amount: 900000, providerId: "uber" }], weather: "雨" }),
    row("2026-09-03", 0, 0, 0, { expense: 1000, weather: "雪" }),
    row("2026-09-04", 3000, 3, 1),
  ]);
  assert.equal(result.current.sales, 7000);
  assert.equal(result.current.days, 2);
  assert.equal(result.current.expense, 1000);
  assert.equal(result.weekdays[2].days, 0);
  assert.deepEqual(result.weather.map((item) => item.key), ["晴", ""]);
  assert.equal(result.weather[1].label, "天気未入力");
});

test("各社を売上・件数・単価・構成比・前期差で比較し、時間を割り当てない", () => {
  const result = month([
    row("2026-08-01", 1000, 1, 2, { services: { uber: { sales: 1000, count: 1 }, wolt: { sales: 500, count: 1 } } }),
    row("2026-09-01", 0, 0, 4, { services: { uber: { sales: 6000, count: 6 }, rocket: { sales: 4000, count: 2 } } }),
  ]);
  const uber = result.platforms.find((item) => item.providerId === "uber");
  assert.equal(uber.unitPrice, 1000);
  assert.equal(uber.share, 0.6);
  assert.equal(uber.previousSales, 1000);
  assert.equal(uber.salesDelta, 5000);
  const wolt = result.platforms.find((item) => item.providerId === "wolt");
  assert.equal(wolt.sales, 0);
  assert.equal(wolt.salesDelta, -500);
  result.platforms.forEach((item) => {
    assert.equal(Object.hasOwn(item, "hours"), false);
    assert.equal(Object.hasOwn(item, "hourly"), false);
  });
});

test("入力を変更せず重複日は最後のスナップショットを採用する", () => {
  const rows = [row("2026-09-01", 9000, 9, 9), row("2026-09-01", 1000, 1, 1)];
  const original = structuredClone(rows);
  const result = month(rows);
  assert.deepEqual(rows, original);
  assert.equal(result.current.days, 1);
  assert.equal(result.current.sales, 1000);
  assert.equal(result.platforms[0].days, 1);
});

test("不正日付・非数値・継承プロパティを除外し、特殊な会社キーにも安全", () => {
  const services = JSON.parse('{"__proto__":{"sales":1000,"count":1},"constructor":{"sales":2000,"count":2}}');
  const result = month([
    row("2026-09-01", 0, 0, 1, { services }),
    row("2026-09-02", NaN, Infinity, Infinity, { expense: -1 }),
    row("2026-09-03", "5000", true, "2"),
    row("2026-09-31", 9000, 9, 9),
    null,
    Object.assign(Object.create({ sales: 10000 }), row("2026-09-04", 9000, 9, 9)),
  ]);
  assert.equal(result.current.sales, 3000);
  assert.equal(result.current.hours, 1);
  assert.equal(result.current.count, 3);
  assert.equal(result.platforms.length, 2);
  assert.equal(result.platforms.find((item) => item.providerId === "__proto__").sales, 1000);
  assert.equal({}.sales, undefined);
  assert.throws(() => periods("month", "2026-02-29", "2026-09-15"), RangeError);
  assert.throws(() => periods("quarter", "2026-09-01", "2026-09-15"), RangeError);
  assert.throws(() => analyze([], {}), RangeError);
});
