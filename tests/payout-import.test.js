const test = require("node:test");
const assert = require("node:assert/strict");
const { parseImport, mergeImport } = require("../public/payout-import.js");

const entry = (date, providerId, amount, memo) => ({ date, providerId, amount, ...(memo === undefined ? {} : { memo }) });
const batch = (...entries) => ({ format: "okumeter-payout-import", version: 1, entries });
const payout = (id, providerId, amount, memo = "") => ({ id, providerId, amount, memo });

test("JSON またはオブジェクトの全明細を検証し、入力を変更しない", () => {
  const source = batch(entry("2026-09-01", "uber", 1200), entry("2026-09-01", "demae", 800, "架空の入金"));
  const original = structuredClone(source);
  const parsed = parseImport(source);
  assert.deepEqual(source, original);
  assert.deepEqual(parsed, parseImport(JSON.stringify(source)));
  assert.notEqual(parsed.entries, source.entries);
  assert.notEqual(parsed.entries[0], source.entries[0]);
  assert.equal(parsed.entries[0].memo, "");
});

test("形式・版・空明細・不正な日付や金額・不明なプラットフォームを拒否する", () => {
  for (const value of [null, [], "not json", {}, batch(), { ...batch(entry("2026-09-01", "uber", 1)), version: 2 },
    { ...batch(entry("2026-09-01", "uber", 1)), format: "other" },
    { ...batch(entry("2026-09-01", "uber", 1)), version: "1" }]) {
    assert.throws(() => parseImport(value), /まだ振込を反映していません/);
  }
  const invalidEntries = [null, [], new Date(),
    ...["2026-02-29", "2026-09-31", "2026-9-01", "invalid", 20260901].map((date) => entry(date, "uber", 1)),
    ...[0, -1, 1.5, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, null].map((amount) => entry("2026-09-01", "uber", amount)),
    ...["", "wolt", "Uber", " uber ", null].map((provider) => entry("2026-09-01", provider, 1)),
    entry("2026-09-01", "uber", 1, 123), entry("2026-09-01", "uber", 1, null)];
  for (const invalid of invalidEntries) {
    assert.throws(() => parseImport(batch(entry("2026-09-04", "rocket", 100), invalid)), /2件目/);
  }
  assert.throws(() => parseImport(batch(entry("2026-09-01", "uber", Number.MAX_SAFE_INTEGER), entry("2026-09-02", "demae", 1))), /上限/);
});

test("同日複数社は受け入れ、同日同社の重複は金額にかかわらず拒否する", () => {
  assert.equal(parseImport(batch(entry("2026-09-01", "uber", 100), entry("2026-09-01", "demae", 200))).entries.length, 2);
  for (const amount of [100, 200]) {
    assert.throws(() => parseImport(batch(entry("2026-09-01", "uber", 100), entry("2026-09-01", "uber", amount))), /2026-09-01.*重複/);
  }
});

test("振込のない既存日と新規日に追加し、売上・経費と対象外の記録を保持する", () => {
  const records = {
    "2026-09-01": { date: "2026-09-01", services: { uber: { sales: 9000, count: 10 } }, expenses: [{ type: "gas", amount: 500 }], memo: "既存の日別メモ", sourceData: { custom: "保持" } },
    "2026-09-02": { date: "2026-09-02", payouts: [payout("other-day", "demae", 700)] },
  };
  const original = structuredClone(records);
  const source = batch(entry("2026-09-01", "uber", 1200), entry("2026-09-04", "rocket", 800, "架空の入金"));
  const result = mergeImport(records, source);
  assert.deepEqual(records, original);
  assert.deepEqual(result.records["2026-09-01"], { ...records["2026-09-01"], payouts: [payout("household-payout-2026-09-01-uber", "uber", 1200)] });
  assert.deepEqual(result.records["2026-09-04"], { date: "2026-09-04", payouts: [payout("household-payout-2026-09-04-rocket", "rocket", 800, "架空の入金")] });
  assert.equal(result.records["2026-09-02"], records["2026-09-02"]);
  assert.equal(result.addedDays, 2);
  assert.equal(result.classifiedDays, 0);
  assert.equal(result.changedDays, 2);
  assert.equal(result.count, 2);
  assert.equal(result.total, 2000);
  assert.deepEqual(result.providers, [{ providerId: "uber", count: 1, amount: 1200 }, { providerId: "rocket", count: 1, amount: 800 }]);
});

test("旧 transferAmount と未分類明細を合計一致時だけ分類し、元の情報を残す", () => {
  const records = {
    "2026-09-01": { sourceData: { transferAmount: "1200", weather: "晴れ" }, services: { uber: { sales: 3000 } } },
    "2026-09-04": { date: "2026-09-04", payouts: [payout("unclassified-a", "", 500), payout("unclassified-b", "", 700)] },
  };
  const original = structuredClone(records);
  const result = mergeImport(records, batch(entry("2026-09-01", "uber", 1200), entry("2026-09-04", "rocket", 900), entry("2026-09-04", "demae", 300)));
  assert.equal(result.classifiedDays, 2);
  assert.equal(result.addedDays, 0);
  assert.equal(result.count, 3);
  assert.equal(result.total, 2400);
  assert.deepEqual(records, original);
  assert.deepEqual(result.records["2026-09-01"].sourceData, original["2026-09-01"].sourceData);
  assert.deepEqual(result.records["2026-09-01"].services, original["2026-09-01"].services);
  assert.equal(Object.hasOwn(result.records["2026-09-01"], "date"), false);
  assert.deepEqual(result.records["2026-09-04"].payouts.map(({ providerId, amount }) => [providerId, amount]), [["rocket", 900], ["demae", 300]]);
});

test("再取り込みは何も変更せず、既存の ID とメモおよび明細の順序を保つ", () => {
  const source = batch(entry("2026-09-01", "uber", 1200, "取り込みメモ"), entry("2026-09-01", "demae", 800));
  const records = {
    "2026-09-01": { date: "2026-09-01", payouts: [payout("manual-second", "demae", 800, "元メモ2"), payout("manual-first", "uber", 1200, "元メモ1")] },
  };
  const result = mergeImport(records, source);
  assert.equal(result.records["2026-09-01"], records["2026-09-01"]);
  assert.deepEqual(result.records, records);
  assert.equal(result.unchangedDays, 1);
  assert.equal(result.changedDays, 0);
  const first = mergeImport({}, source);
  const second = mergeImport(first.records, source);
  assert.deepEqual(second.records, first.records);
  assert.equal(second.unchangedDays, 1);
  assert.equal(second.changedDays, 0);
});

test("1日の競合でも全バッチを拒否し、不足振込を追加しない", () => {
  const records = {
    "2026-09-01": { date: "2026-09-01", payouts: [payout("already-saved", "uber", 1000)] },
    "2026-09-04": { date: "2026-09-04", sourceData: { transferAmount: 2000 } },
  };
  const original = structuredClone(records);
  assert.throws(() => mergeImport(records, batch(
    entry("2026-09-02", "demae", 500),
    entry("2026-09-04", "rocket", 1000),
    entry("2026-09-01", "uber", 1000), entry("2026-09-01", "demae", 500),
  )), (error) => {
    assert.deepEqual(error.dates, ["2026-09-01", "2026-09-04"]);
    assert.match(error.message, /2026-09-01.*2026-09-04/);
    return true;
  });
  assert.deepEqual(records, original);
  assert.equal(Object.hasOwn(records, "2026-09-02"), false);
});

test("分類済みの不一致、分類混在、同社の別明細を勝手に集約しない", () => {
  for (const existing of [
    [payout("classified", "demae", 1000)],
    [payout("changed", "uber", 900)],
    [payout("classified", "uber", 500), payout("unclassified", "", 500)],
    [payout("split-1", "uber", 500), payout("split-2", "uber", 500)],
  ]) {
    assert.throws(() => mergeImport({ "2026-09-01": { payouts: existing } }, batch(entry("2026-09-01", "uber", 1000))), /2026-09-01/);
  }
});

test("明示的な空 payouts は旧振込を復活させず、今回指定された振込だけ追加する", () => {
  const records = { "2026-09-01": { date: "2026-09-01", payouts: [], sourceData: { transferAmount: 9999 } } };
  const result = mergeImport(records, batch(entry("2026-09-01", "uber", 1200)));
  assert.equal(result.addedDays, 1);
  assert.equal(result.classifiedDays, 0);
  assert.deepEqual(result.records["2026-09-01"].payouts, [payout("household-payout-2026-09-01-uber", "uber", 1200)]);
  assert.equal(result.records["2026-09-01"].sourceData.transferAmount, 9999);
  assert.deepEqual(records["2026-09-01"].payouts, []);
});

test("mergeImport も入力検証を行い、不正な既存レコードを上書きしない", () => {
  assert.throws(() => mergeImport({}, batch(entry("2026-09-01", "uber", 1.5))), /1件目/);
  assert.throws(() => mergeImport([], batch(entry("2026-09-01", "uber", 1))), /端末内の記録/);
  for (const record of [null, [], "invalid"]) {
    assert.throws(() => mergeImport({ "2026-09-01": record }, batch(entry("2026-09-01", "uber", 100))), /2026-09-01/);
  }
});

test("不正な既存 payouts を正規化で消さず、1件でもあれば全体を拒否する", () => {
  const valid = payout("existing", "uber", 1000);
  for (const existing of [null, {}, "invalid", [{ amount: -1 }], [valid, { amount: -1 }],
    [valid, null], [payout("provider-invalid", 123, 1000)], [payout("memo-invalid", "", 1000, 123)]]) {
    const records = { "2026-09-01": { date: "2026-09-01", payouts: existing } };
    const original = structuredClone(records);
    assert.throws(() => mergeImport(records, batch(entry("2026-09-02", "demae", 500), entry("2026-09-01", "uber", 1000))), /2026-09-01/);
    assert.deepEqual(records, original);
  }
});

test("不正な旧 transferAmount は追加で覆わず、正常な空値とゼロは未登録として扱う", () => {
  for (const transferAmount of [-1, "-100", NaN, Infinity, "金額不明", true, false, [], {}]) {
    assert.throws(() => mergeImport({ "2026-09-01": { sourceData: { transferAmount } } }, batch(entry("2026-09-01", "uber", 1000))), /2026-09-01/);
  }
  for (const transferAmount of [null, undefined, "", " ", 0, "0"]) {
    const result = mergeImport({ "2026-09-01": { sourceData: { transferAmount } } }, batch(entry("2026-09-01", "uber", 1000)));
    assert.equal(result.addedDays, 1);
    assert.equal(result.records["2026-09-01"].sourceData.transferAmount, transferAmount);
  }
});

test("ID やメモが欠落した正常明細の分類は許可する", () => {
  const result = mergeImport({ "2026-09-01": { payouts: [{ amount: 1000 }] } }, batch(entry("2026-09-01", "uber", 1000)));
  assert.equal(result.classifiedDays, 1);
  assert.deepEqual(result.records["2026-09-01"].payouts, [payout("household-payout-2026-09-01-uber", "uber", 1000)]);
});

test("未分類のメモを1社へ引き継ぎ、入力メモと重複せず再取込でも増えない", () => {
  const records = { "2026-09-01": { payouts: [payout("unclassified", "", 1000, "元のメモ")] } };
  const source = batch(entry("2026-09-01", "uber", 1000, "入力メモ"));
  const result = mergeImport(records, source);
  assert.equal(result.records["2026-09-01"].payouts[0].memo, "元のメモ / 入力メモ");
  assert.equal(mergeImport(result.records, source).records["2026-09-01"].payouts[0].memo, "元のメモ / 入力メモ");
  assert.equal(mergeImport(records, batch(entry("2026-09-01", "uber", 1000, "元のメモ"))).records["2026-09-01"].payouts[0].memo, "元のメモ");
  assert.equal(records["2026-09-01"].payouts[0].memo, "元のメモ");
});

test("複数の未分類メモは1社への集約なら保持し、複数社への割当は競合にする", () => {
  const records = { "2026-09-01": { payouts: [payout("first", "", 500, "元メモ1"), payout("second", "", 500, "元メモ2")] } };
  const result = mergeImport(records, batch(entry("2026-09-01", "uber", 1000)));
  assert.equal(result.records["2026-09-01"].payouts[0].memo, "元メモ1 / 元メモ2");
  assert.throws(() => mergeImport(records, batch(entry("2026-09-01", "uber", 500), entry("2026-09-01", "demae", 500))), /2026-09-01/);
  assert.throws(() => mergeImport({ "2026-09-01": { payouts: [payout("single", "", 1000, "社名不明のメモ")] } }, batch(entry("2026-09-01", "uber", 500), entry("2026-09-01", "demae", 500))), /2026-09-01/);
});
