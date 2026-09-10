const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../public/maintenance-data.js");

const entry = (overrides = {}) => ({ id: "oil-1", vehicleId: "bike-1", date: "2026-09-01", odometerKm: 12000, description: "オイル交換", memo: "", ...overrides });

test("整備日を実在する日付として検証する", () => {
  assert.equal(data.validDate("2026-02-29"), false);
  assert.equal(data.validDate("2024-02-29"), true);
  assert.equal(data.validDate("2026-09-31"), false);
  assert.equal(data.validDate("invalid"), false);
});

test("不明な走行距離と0kmを区別し、記録内容を正規化する", () => {
  const normalized = data.normalize([entry({ odometerKm: null }), entry({ id: "zero", odometerKm: 0 }), entry({ id: "empty", odometerKm: "" }), entry({ id: "negative", odometerKm: -1 })]);
  assert.deepEqual(normalized.map((item) => item.odometerKm), [null, 0, null, null]);
  assert.deepEqual(data.normalize([entry({ description: "  点検  " })])[0].description, "点検");
});

test("車体ごとに履歴を分け、同日の複数整備も保持する", () => {
  const entries = data.normalize([entry(), entry({ id: "tire", description: "タイヤ交換" }), entry({ id: "older", date: "2026-08-01" }), entry({ id: "other", vehicleId: "bike-2" })]);
  const before = JSON.stringify(entries);
  const selected = data.forVehicle(entries, "bike-1");
  assert.equal(selected.length, 3);
  assert.equal(selected.at(-1).id, "older");
  assert.equal(JSON.stringify(entries), before);
});

test("IDの欠落や重複を安定して補完する", () => {
  const normalized = data.normalize([entry(), entry(), entry({ id: "" })]);
  assert.equal(new Set(normalized.map((item) => item.id)).size, 3);
  assert.deepEqual(data.normalize(normalized), normalized);
  assert.deepEqual(data.normalize([entry({ date: "2026-09-31" }), entry({ vehicleId: "" }), entry({ description: " " })]), []);
});

test("旧バックアップでは整備履歴と必要な車両を保持する", () => {
  const original = { maintenance: [entry()], vehicles: [{ id: "bike-1", label: "相棒" }, { id: "unused" }] };
  const imported = { vehicles: [{ id: "bike-2", label: "別車両" }] };
  const merged = data.mergeSnapshot(imported, original);
  assert.deepEqual(merged.maintenance, original.maintenance);
  assert.deepEqual(merged.vehicles.map((vehicle) => vehicle.id), ["bike-2", "bike-1"]);
  assert.equal(imported.vehicles.length, 1);
});

test("新バックアップの空配列は履歴の明示的な削除として扱う", () => {
  const merged = data.mergeSnapshot({ vehicles: [], maintenance: [] }, { vehicles: [{ id: "bike-1" }], maintenance: [entry()] });
  assert.deepEqual(merged, { vehicles: [], maintenance: [] });
});
