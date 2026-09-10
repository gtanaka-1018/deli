const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, summarize } = require("../public/payout-data.js");

test("同日の複数プラットフォームと同一プラットフォームの複数振込をそれぞれ集計する", () => {
  const summary = summarize([
    {
      date: "2026-09-01",
      services: { uber: { sales: 99999 } },
      payouts: [
        { id: "first", providerId: "uber", amount: 1000, memo: "初回" },
        { id: "second", providerId: "rocket", amount: 2000, memo: "" },
        { id: "third", providerId: "uber", amount: 500, memo: "追加" },
      ],
    },
    { date: "2026-09-03", payouts: [{ id: "last", providerId: "rocket", amount: 3000 }] },
  ]);

  assert.equal(summary.total, 6500);
  assert.equal(summary.count, 4);
  assert.deepEqual(summary.providers, [
    { providerId: "uber", amount: 1500, count: 2 },
    { providerId: "rocket", amount: 5000, count: 2 },
  ]);
  assert.deepEqual(summary.entries.map(({ date, id }) => [date, id]), [
    ["2026-09-03", "last"],
    ["2026-09-01", "first"],
    ["2026-09-01", "second"],
    ["2026-09-01", "third"],
  ]);
  assert.equal(summary.entries[3].memo, "追加");
});

test("旧形式の振込を未分類で読み込み、正規化しても二重計上しない", () => {
  const source = { date: "2026-08-31", sourceData: { transferAmount: "1234.5" } };
  const payouts = normalize(source);
  assert.deepEqual(payouts, [{ id: "legacy-transfer", providerId: "", amount: 1234.5, memo: "" }]);
  assert.deepEqual(normalize(source), payouts);
  assert.deepEqual(normalize({ ...source, payouts }), payouts);
  assert.equal(summarize([{ ...source, payouts }]).total, 1234.5);
  assert.deepEqual(normalize({ ...source, payouts: [] }), []);
  assert.deepEqual(normalize({ ...source, payouts: null }), []);
  assert.equal(summarize([{ ...source, payouts: [] }]).count, 0);
});

test("不正な金額や通常のオブジェクトでない振込は採用しない", () => {
  const invalidAmounts = [0, -1, NaN, Infinity, -Infinity, "", " ", "100円", "1,000", true, false, null, undefined, [], [100], {}, { valueOf: () => 100 }];
  const payouts = [null, [], new Date(), Object.assign(new Number(1), { amount: 500 })];
  payouts.push(...invalidAmounts.map((amount) => ({ amount })));
  payouts.push({ id: "number", amount: 10.25 });
  payouts.push({ id: "string", amount: " 20 " });
  assert.deepEqual(normalize({ payouts }), [
    { id: "number", providerId: "", amount: 10.25, memo: "" },
    { id: "string", providerId: "", amount: 20, memo: "" },
  ]);
  for (const transferAmount of invalidAmounts) {
    assert.deepEqual(normalize({ sourceData: { transferAmount } }), []);
  }
  assert.deepEqual(normalize(null), []);
  assert.deepEqual(normalize([]), []);
});

test("入力を変更せず、欠落・重複 ID を決定的かつ一意に補う", () => {
  const record = {
    payouts: [
      { id: "payout-2", amount: 100 },
      { id: "payout-2", providerId: " uber ", amount: 200, memo: " 確認\u0000済み " },
      { id: {}, providerId: {}, amount: 300, memo: 123 },
      { id: "__proto__", providerId: "__proto__", amount: 400 },
    ],
  };
  const original = structuredClone(record);
  const payouts = normalize(record);
  assert.deepEqual(record, original);
  assert.deepEqual(payouts.map(({ id }) => id), ["payout-2", "payout-2-2", "payout-3", "__proto__"]);
  assert.deepEqual(normalize(record), payouts);
  assert.deepEqual(normalize({ payouts }), payouts);
  assert.equal(payouts[1].providerId, "uber");
  assert.equal(payouts[1].memo, "確認済み");
  assert.equal(payouts[2].providerId, "");
  assert.equal(payouts[2].memo, "");
});

test("任意のプラットフォーム ID を安全に集計し、未分類も合計に含める", () => {
  const summary = summarize([{
    date: "2026-09-01",
    payouts: [
      { providerId: "__proto__", amount: 100 },
      { providerId: "constructor", amount: 200 },
      { providerId: "__proto__", amount: 300 },
      { providerId: "", amount: 400 },
    ],
  }]);
  assert.equal(summary.total, 1000);
  assert.deepEqual(summary.providers, [
    { providerId: "__proto__", amount: 400, count: 2 },
    { providerId: "constructor", amount: 200, count: 1 },
    { providerId: "", amount: 400, count: 1 },
  ]);
  assert.equal(Object.prototype.amount, undefined);
});

test("集計対象は渡された日付範囲だけで、不正な日付は除外する", () => {
  const records = [
    { date: "2025-12-31", payouts: [{ amount: 100 }] },
    { date: "2026-01-01", payouts: [{ amount: 200 }] },
    { date: "2026-01-07", payouts: [{ amount: 300 }] },
    { date: "2026-02-01", payouts: [{ amount: 400 }] },
    { date: "2026-02-30", payouts: [{ amount: 99999 }] },
    { date: "invalid", payouts: [{ amount: 99999 }] },
    { payouts: [{ amount: 99999 }] },
    null,
  ];
  const validRecords = records.slice(0, 4);
  assert.equal(summarize(validRecords.filter(({ date }) => date >= "2026-01-01" && date <= "2026-01-04")).total, 200);
  assert.equal(summarize(validRecords.filter(({ date }) => date.startsWith("2026-01"))).total, 500);
  assert.equal(summarize(validRecords.filter(({ date }) => date.startsWith("2026"))).total, 900);
  assert.equal(summarize(records).total, 1000);
  assert.deepEqual(summarize(undefined), { total: 0, count: 0, providers: [], entries: [] });
});
