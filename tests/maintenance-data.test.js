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

const transfer = (entries = [entry()]) => ({ type: "okumeter-maintenance", version: 1, vehicle: { label: "配達用バイク", type: "motorcycle" }, entries });

test("整備履歴ファイルは不正な行を黙って落とさず全体を拒否する", () => {
  assert.equal(data.readImport(transfer()).entries.length, 1);
  for (const bad of [entry({ date: "2026-02-30" }), entry({ odometerKm: -1 }), entry({ odometerKm: "12000" }), entry({ description: "" }), entry({ id: " oil-1 " })]) {
    assert.throws(() => data.readImport(transfer([entry({ id: "valid" }), bad])));
  }
  assert.throws(() => data.readImport(transfer([entry(), entry()])));
  assert.throws(() => data.readImport({ records: {} }));
});

test("整備の追加は既存履歴・他車両を保持し、再取り込みと手入力との重複を避ける", () => {
  const current = [entry(), entry({ id: "other", vehicleId: "bike-2" })];
  const before = JSON.stringify(current);
  const batch = data.readImport(transfer([entry({ id: "import-oil" }), entry({ id: "new", date: "2026-09-02", description: "点検" })]));
  const merged = data.mergeImport(current, batch, "bike-1");
  assert.equal(merged.added, 1);
  assert.equal(merged.skipped, 1);
  assert.equal(JSON.stringify(current), before);
  const edited = merged.entries.map((item) => item.id.startsWith("import:") ? { ...item, description: "追記した点検内容" } : item);
  assert.equal(data.mergeImport(edited, batch, "bike-1").added, 0);
  assert.equal(data.mergeImport(merged.entries, batch, "bike-3").added, 2);
});
