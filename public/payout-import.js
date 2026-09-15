(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./payout-data.js"));
  else root.DeliPayoutImport = factory(root.DeliPayouts);
})(typeof globalThis !== "undefined" ? globalThis : this, function (payouts) {
  "use strict";

  const FORMAT = "okumeter-payout-import";
  const PROVIDERS = new Set(["uber", "rocket", "demae"]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function invalidImport(detail) {
    return new Error(`${detail} まだ振込を反映していません。`);
  }

  /** 全明細を検証し、一部だけを読み込むことはしない。 */
  function parseImport(value) {
    let payload = value;
    if (typeof value === "string") {
      try { payload = JSON.parse(value); }
      catch { throw invalidImport("振込の取り込み用 JSON ファイルを選んでください。"); }
    }
    if (!isPlainObject(payload) || payload.format !== FORMAT || payload.version !== 1
      || !Array.isArray(payload.entries) || payload.entries.length === 0) {
      throw invalidImport("対応する形式の振込ファイルに、1件以上の明細が必要です。");
    }

    const entries = [];
    const datesAndProviders = new Set();
    let total = 0;
    for (const [index, entry] of payload.entries.entries()) {
      if (!isPlainObject(entry) || !validDate(entry.date) || !PROVIDERS.has(entry.providerId)
        || typeof entry.amount !== "number" || !Number.isSafeInteger(entry.amount) || entry.amount <= 0
        || (entry.memo !== undefined && typeof entry.memo !== "string")) {
        throw invalidImport(`${index + 1}件目の日付・プラットフォーム・金額・メモを確認してください。金額は正の整数で指定します。`);
      }
      const key = `${entry.date}:${entry.providerId}`;
      if (datesAndProviders.has(key)) {
        throw invalidImport(`${entry.date} の同じプラットフォームの振込が重複しています。`);
      }
      datesAndProviders.add(key);
      total += entry.amount;
      if (!Number.isSafeInteger(total)) {
        throw invalidImport("振込合計が扱える金額の上限を超えています。");
      }
      entries.push({ date: entry.date, providerId: entry.providerId, amount: entry.amount, memo: entry.memo ?? "" });
    }
    return { format: FORMAT, version: 1, entries };
  }

  function sameDetails(existing, incoming) {
    if (existing.length !== incoming.length) return false;
    const signatures = (entries) => entries.map((entry) => JSON.stringify([entry.providerId, entry.amount])).sort();
    const left = signatures(existing);
    return signatures(incoming).every((signature, index) => signature === left[index]);
  }

  function hasInvalidExistingPayouts(record, normalized) {
    if (Object.hasOwn(record, "payouts")) {
      return !Array.isArray(record.payouts) || record.payouts.length !== normalized.length
        || record.payouts.some((entry) => (entry.providerId !== undefined && typeof entry.providerId !== "string")
          || (entry.memo !== undefined && typeof entry.memo !== "string"));
    }
    if (!isPlainObject(record.sourceData) || !Object.hasOwn(record.sourceData, "transferAmount")) return false;
    const amount = record.sourceData.transferAmount;
    if (amount === null || amount === undefined) return false;
    if (typeof amount !== "number" && typeof amount !== "string") return true;
    return !Number.isFinite(Number(amount)) || Number(amount) < 0;
  }

  function combineMemos(memos) {
    const combined = [];
    const seen = new Set();
    for (const memo of memos) {
      const key = memo.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      combined.push(memo);
    }
    return combined.join(" / ");
  }

  /** 日別の振込だけをマージする。競合が1日でもあれば全件を拒否する。 */
  function mergeImport(records, value) {
    if (!isPlainObject(records)) throw invalidImport("端末内の記録を読み込めませんでした。");
    const batch = parseImport(value);
    const byDate = new Map();
    const providers = new Map();
    let total = 0;
    for (const entry of batch.entries) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, []);
      byDate.get(entry.date).push(entry);
      const summary = providers.get(entry.providerId) || { providerId: entry.providerId, count: 0, amount: 0 };
      summary.count++;
      summary.amount += entry.amount;
      providers.set(entry.providerId, summary);
      total += entry.amount;
    }

    const updates = new Map();
    const conflicts = [];
    let addedDays = 0;
    let classifiedDays = 0;
    let unchangedDays = 0;
    for (const [date, incoming] of byDate) {
      const hasRecord = Object.hasOwn(records, date);
      const record = hasRecord ? records[date] : { date };
      if (!isPlainObject(record)) {
        conflicts.push(date);
        continue;
      }
      const existing = payouts.normalize(record);
      if (hasInvalidExistingPayouts(record, existing)) {
        // 表示時に無視する不正明細も、取り込みで消してはいけない。
        conflicts.push(date);
        continue;
      }
      if (sameDetails(existing, incoming)) {
        // 金額と分類が同じなら、手入力した ID やメモもそのまま残す。
        unchangedDays++;
        continue;
      }
      const amount = incoming.reduce((sum, entry) => sum + entry.amount, 0);
      const existingMemos = Array.isArray(record.payouts)
        ? record.payouts.map((entry) => entry.memo || "").filter((memo) => memo.trim())
        : [];
      if (existing.length === 0) addedDays++;
      else if (existing.every((entry) => entry.providerId === "")
        && existing.reduce((sum, entry) => sum + entry.amount, 0) === amount
        // 複数社へ分割するとき、元メモをどの社に引き継ぐかは推測しない。
        && !(incoming.length > 1 && existingMemos.length)) classifiedDays++;
      else {
        conflicts.push(date);
        continue;
      }
      updates.set(date, {
        ...record,
        payouts: incoming.map((entry) => ({
          id: `household-payout-${date}-${entry.providerId}`,
          providerId: entry.providerId,
          amount: entry.amount,
          memo: combineMemos([...existingMemos, entry.memo]),
        })),
      });
    }
    if (conflicts.length) {
      const dates = conflicts.sort();
      const error = invalidImport(`${dates.join("、")} の登録済み振込とファイルの内容が異なります。既存の振込を確認してください。`);
      error.dates = dates;
      throw error;
    }

    const merged = { ...records };
    for (const [date, record] of updates) merged[date] = record;
    return {
      records: merged,
      addedDays,
      classifiedDays,
      unchangedDays,
      changedDays: updates.size,
      count: batch.entries.length,
      total,
      providers: [...providers.values()],
    };
  }

  return Object.freeze({ parseImport, mergeImport });
});
