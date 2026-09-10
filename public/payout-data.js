(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DeliPayouts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cleanText(value) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim()
      : "";
  }

  function positiveAmount(value) {
    if (typeof value !== "number" && typeof value !== "string") return 0;
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  function normalize(record) {
    if (!isPlainObject(record)) return [];
    if (!Object.hasOwn(record, "payouts")) {
      const amount = isPlainObject(record.sourceData) ? positiveAmount(record.sourceData.transferAmount) : 0;
      return amount > 0 ? [{ id: "legacy-transfer", providerId: "", amount, memo: "" }] : [];
    }
    if (!Array.isArray(record.payouts)) return [];

    const usedIds = new Set();
    return record.payouts.flatMap((entry, index) => {
      if (!isPlainObject(entry)) return [];
      const amount = positiveAmount(entry.amount);
      if (amount <= 0) return [];
      let id = cleanText(entry.id) || `payout-${index + 1}`;
      if (usedIds.has(id)) {
        const baseId = `payout-${index + 1}`;
        id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
      }
      usedIds.add(id);
      return [{ id, providerId: cleanText(entry.providerId), amount, memo: cleanText(entry.memo) }];
    });
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function summarize(records) {
    const providers = new Map();
    const entries = [];
    let total = 0;
    if (Array.isArray(records)) {
      records.forEach((record) => {
        if (!isPlainObject(record) || !validDate(record.date)) return;
        normalize(record).forEach((entry) => {
          const provider = providers.get(entry.providerId) || { providerId: entry.providerId, amount: 0, count: 0 };
          provider.amount += entry.amount;
          provider.count += 1;
          providers.set(entry.providerId, provider);
          total += entry.amount;
          entries.push({ date: record.date, ...entry });
        });
      });
    }
    entries.sort((left, right) => right.date.localeCompare(left.date));
    return { total, count: entries.length, providers: [...providers.values()], entries };
  }

  return Object.freeze({ normalize, summarize });
});
