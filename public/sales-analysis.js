(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DeliSalesAnalysis = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
  const WEATHER = ["晴", "曇", "雨", "雪", "雷", ""];

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

  function dateValue(value) {
    if (!validDate(value)) throw new RangeError("日付は有効な YYYY-MM-DD で指定してください。");
    return new Date(`${value}T00:00:00Z`);
  }

  function dateKey(date) {
    const key = date.toISOString().slice(0, 10);
    if (!validDate(key)) throw new RangeError("分析できる日付の範囲を超えています。");
    return key;
  }

  function shiftDays(value, days) {
    return dateKey(new Date(dateValue(value).getTime() + days * DAY_MS));
  }

  function monthEnd(value) {
    const date = dateValue(value);
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    return dateKey(date);
  }

  function shiftMonths(value, months) {
    const date = dateValue(value);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    date.setUTCDate(Math.min(day, Number(monthEnd(dateKey(date)).slice(8, 10))));
    return dateKey(date);
  }

  function periods(view, selectedDate, today) {
    dateValue(selectedDate);
    dateValue(today);
    let currentStart;
    let fullEnd;
    let previousStart;
    let previousEnd;
    if (view === "day") {
      currentStart = selectedDate;
      fullEnd = selectedDate;
      previousStart = shiftDays(selectedDate, -1);
      previousEnd = previousStart;
    } else if (view === "week") {
      const weekday = (dateValue(selectedDate).getUTCDay() + 6) % 7;
      currentStart = shiftDays(selectedDate, -weekday);
      fullEnd = shiftDays(currentStart, 6);
      previousStart = shiftDays(currentStart, -7);
      previousEnd = shiftDays(fullEnd, -7);
    } else if (view === "month") {
      currentStart = `${selectedDate.slice(0, 7)}-01`;
      fullEnd = monthEnd(currentStart);
      previousStart = shiftMonths(currentStart, -1);
      previousEnd = monthEnd(previousStart);
    } else if (view === "year") {
      currentStart = `${selectedDate.slice(0, 4)}-01-01`;
      fullEnd = `${selectedDate.slice(0, 4)}-12-31`;
      previousStart = shiftMonths(currentStart, -12);
      previousEnd = `${previousStart.slice(0, 4)}-12-31`;
    } else {
      throw new RangeError("分析期間は day・week・month・year で指定してください。");
    }

    const isFuture = currentStart > today;
    const containsToday = currentStart <= today && fullEnd >= today;
    const isPartial = containsToday && today < fullEnd;
    const currentEnd = fullEnd > today ? today : fullEnd;
    if (isPartial) {
      if (view === "week") previousEnd = shiftDays(today, -7);
      if (view === "month") previousEnd = shiftMonths(today, -1);
      if (view === "year") previousEnd = shiftMonths(today, -12);
    }
    return {
      currentStart, currentEnd, previousStart, previousEnd,
      isPartial,
      isFuture,
    };
  }

  function nonnegative(value) {
    return typeof value === "number" && Number.isFinite(value)
      && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : 0;
  }

  function countValue(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function normalizeRow(source) {
    const services = new Map();
    if (isPlainObject(source.services)) {
      Object.entries(source.services).forEach(([providerId, item]) => {
        if (!providerId || !isPlainObject(item)) return;
        services.set(providerId, { sales: nonnegative(item.sales), count: countValue(item.count) });
      });
    }
    const items = [...services.values()];
    const sales = items.reduce((sum, item) => sum + item.sales, 0);
    const count = items.reduce((sum, item) => sum + item.count, 0);
    const hours = nonnegative(source.hours);
    return {
      date: source.date,
      services,
      sales,
      count,
      hours,
      expense: nonnegative(source.expense),
      weather: WEATHER.includes(source.weather) ? source.weather : "",
      active: sales > 0 || count > 0 || hours > 0,
      missingCount: items.some((item) => item.sales > 0 && item.count === 0),
    };
  }

  function summarize(rows) {
    const summary = {
      sales: 0, count: 0, expense: 0, days: 0, timedDays: 0, hours: 0,
      timedSales: 0, hourly: null, netHourly: null, unitPrice: null, missingCountDays: 0,
    };
    let timedExpense = 0;
    rows.forEach((row) => {
      summary.sales += row.sales;
      summary.count += row.count;
      summary.expense += row.expense;
      if (row.active) summary.days += 1;
      if (row.missingCount) summary.missingCountDays += 1;
      if (row.hours > 0) {
        summary.timedDays += 1;
        summary.hours += row.hours;
        summary.timedSales += row.sales;
        timedExpense += row.expense;
      }
    });
    if (summary.hours > 0) {
      summary.hourly = summary.timedSales / summary.hours;
      summary.netHourly = (summary.timedSales - timedExpense) / summary.hours;
    }
    if (summary.count > 0 && summary.missingCountDays === 0) {
      summary.unitPrice = summary.sales / summary.count;
    }
    return summary;
  }

  function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function platformSummary(rows) {
    const platforms = new Map();
    rows.forEach((row) => {
      row.services.forEach((item, providerId) => {
        if (item.sales <= 0 && item.count <= 0) return;
        if (!platforms.has(providerId)) {
          platforms.set(providerId, { sales: 0, count: 0, days: 0, missingCountDays: 0 });
        }
        const total = platforms.get(providerId);
        total.sales += item.sales;
        total.count += item.count;
        total.days += 1;
        if (item.sales > 0 && item.count === 0) total.missingCountDays += 1;
      });
    });
    return platforms;
  }

  function changeSummary(current, previous) {
    const available = current.days > 0 && previous.days > 0;
    const delta = current.sales - previous.sales;
    let countEffect = null;
    let unitEffect = null;
    let reason = "";
    if (!available) {
      reason = "比較には両期間の売上・稼働の記録が必要です。";
    } else if (current.missingCountDays > 0 || previous.missingCountDays > 0) {
      reason = "件数未記録の売上があるため、増減の内訳は表示できません。";
    } else if (current.unitPrice === null || previous.unitPrice === null) {
      reason = "増減の内訳には両期間の件数が必要です。";
    } else {
      countEffect = (current.count - previous.count) * (current.unitPrice + previous.unitPrice) / 2;
      unitEffect = (current.unitPrice - previous.unitPrice) * (current.count + previous.count) / 2;
    }
    return {
      available, delta,
      percent: available && previous.sales > 0 ? delta / previous.sales : null,
      countEffect, unitEffect, reason,
    };
  }

  function analyze(rows, range) {
    if (!isPlainObject(range)
      || ![range.currentStart, range.currentEnd, range.previousStart, range.previousEnd].every(validDate)
      || range.previousStart > range.previousEnd
      || (!range.isFuture && range.currentStart > range.currentEnd)) {
      throw new RangeError("有効な分析期間を指定してください。");
    }
    // 日別レコードはスナップショット。重複日は最後の有効行を採用する。
    const uniqueRows = new Map();
    if (!range.isFuture && Array.isArray(rows)) {
      rows.forEach((row) => {
        if (isPlainObject(row) && validDate(row.date)) uniqueRows.set(row.date, normalizeRow(row));
      });
    }
    const normalized = [...uniqueRows.values()].sort((a, b) => a.date.localeCompare(b.date));
    const inRange = (start, end) => normalized.filter((row) => row.date >= start && row.date <= end);
    const currentRows = inRange(range.currentStart, range.currentEnd);
    const previousRows = inRange(range.previousStart, range.previousEnd);
    const current = summarize(currentRows);
    const previous = summarize(previousRows);
    const activeRows = currentRows.filter((row) => row.active);

    const weekdays = WEEKDAYS.map((label, id) => {
      const weekdayRows = activeRows.filter((row) => (dateValue(row.date).getUTCDay() + 6) % 7 === id);
      const summary = summarize(weekdayRows);
      return {
        id, label, ...summary,
        medianHourly: median(weekdayRows.filter((row) => row.hours > 0).map((row) => row.sales / row.hours)),
        eligible: summary.timedDays >= 3 && summary.hours >= 6,
      };
    });
    const eligibleWeekdays = weekdays.filter((weekday) => weekday.eligible)
      .sort((a, b) => b.hourly - a.hourly || a.id - b.id);
    const bestWeekday = eligibleWeekdays.length >= 2
      && eligibleWeekdays[0].hourly - eligibleWeekdays[1].hourly > 1e-9
      ? eligibleWeekdays[0]
      : null;
    const weather = WEATHER.flatMap((key) => {
      const weatherRows = activeRows.filter((row) => row.weather === key);
      return weatherRows.length > 0 ? [{ key, label: key || "天気未入力", ...summarize(weatherRows) }] : [];
    });

    const currentPlatforms = platformSummary(currentRows);
    const previousPlatforms = platformSummary(previousRows);
    const providerIds = new Set([...currentPlatforms.keys(), ...previousPlatforms.keys()]);
    const platforms = [...providerIds].map((providerId) => {
      const total = currentPlatforms.get(providerId) || { sales: 0, count: 0, days: 0, missingCountDays: 0 };
      const previousSales = previousPlatforms.get(providerId)?.sales || 0;
      return {
        providerId, ...total,
        unitPrice: total.count > 0 && total.missingCountDays === 0 ? total.sales / total.count : null,
        share: current.sales > 0 ? total.sales / current.sales : 0,
        previousSales, salesDelta: total.sales - previousSales,
      };
    }).sort((a, b) => b.sales - a.sales || a.providerId.localeCompare(b.providerId));

    return {
      current, previous, weekdays, weather, platforms,
      change: changeSummary(current, previous), bestWeekday,
    };
  }

  return { periods, analyze };
});
