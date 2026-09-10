(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeliMaintenanceData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function normalize(entries) {
    if (!Array.isArray(entries)) return [];
    const used = new Set();
    return entries.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object" || !validDate(entry.date)) return [];
      const vehicleId = typeof entry.vehicleId === "string" ? entry.vehicleId.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim().slice(0, 200) : "";
      if (!vehicleId || !description) return [];
      const base = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `maintenance-${entry.date}-${index}`;
      let id = base;
      let suffix = 2;
      while (used.has(id)) id = `${base}-${suffix++}`;
      used.add(id);
      const rawKm = entry.odometerKm;
      const km = rawKm === null || rawKm === undefined || rawKm === "" ? null : Number(rawKm);
      return [{
        id, vehicleId, date: entry.date,
        odometerKm: km !== null && Number.isFinite(km) && km >= 0 ? km : null,
        description,
        memo: typeof entry.memo === "string" ? entry.memo.trim().slice(0, 1000) : "",
      }];
    });
  }

  function forVehicle(entries, vehicleId) {
    return entries.filter((entry) => !vehicleId || entry.vehicleId === vehicleId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  // 旧ファイルに存在しなかった項目は、明示的な削除と区別する。
  function mergeSnapshot(snapshot, current) {
    const vehicles = Array.isArray(snapshot.vehicles) ? [...snapshot.vehicles] : [];
    if (snapshot.maintenance !== undefined) return { vehicles, maintenance: normalize(snapshot.maintenance) };
    const maintenance = normalize(current.maintenance);
    const needed = new Set(maintenance.map((entry) => entry.vehicleId));
    for (const vehicle of current.vehicles || []) {
      if (needed.has(vehicle.id) && !vehicles.some((candidate) => candidate?.id === vehicle.id)) vehicles.push(vehicle);
    }
    return { vehicles, maintenance };
  }

  return Object.freeze({ validDate, normalize, forVehicle, mergeSnapshot });
});
