(function (root) {
  "use strict";

  const TABS = [
    { id: "weekdays", label: "曜日" },
    { id: "platforms", label: "プラットフォーム" },
    { id: "weather", label: "天気" },
  ];
  const numberFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
  const decimalFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
  let nextId = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[character]));
  }

  function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function number(value) {
    return isNumber(value) ? numberFormat.format(value) : "—";
  }

  function decimal(value) {
    return isNumber(value) ? decimalFormat.format(value) : "—";
  }

  function money(value) {
    return isNumber(value) ? `${number(value)}円` : "—";
  }

  function signedMoney(value) {
    return isNumber(value) ? `${value > 0 ? "+" : ""}${money(value)}` : "—";
  }

  function signedPercent(value) {
    return isNumber(value) && isNumber(value * 100) ? `${value > 0 ? "+" : ""}${decimal(value * 100)}%` : "";
  }

  function directionClass(value) {
    return isNumber(value) && value !== 0 ? (value > 0 ? "analysis-positive" : "analysis-negative") : "";
  }

  function dateLabel(value) {
    const date = value instanceof Date ? value : null;
    if (date && Number.isFinite(date.getTime())) {
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }
    const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : "期間未設定";
  }

  function periodLabel(start, end) {
    const first = dateLabel(start);
    const last = dateLabel(end);
    return first === last ? first : `${first}〜${last}`;
  }

  function perDay(summary) {
    if (!isNumber(summary.sales) || !isNumber(summary.days) || summary.days <= 0) return null;
    const value = summary.sales / summary.days;
    return isNumber(value) ? value : null;
  }

  function coverage(summary) {
    return `時間記録 ${number(summary.timedDays)} / ${number(summary.days)}日・${decimal(summary.hours)}時間`;
  }

  function comparisonExplanation(analysis, range) {
    const current = analysis.current || {};
    const previous = analysis.previous || {};
    if (range.isFuture) return "未来の期間は分析対象外です。登録済みの売上があっても、その日を迎えるまで分析には含めません。";
    if (!current.days && !previous.days) return "両期間とも稼働記録がありません。売上・件数・稼働時間を記録すると比較できます。";
    if (!current.days) return "対象期間に稼働記録がありません。未記録の日を休業や売上ゼロとは判断していません。";
    if (!previous.days) return "前期間に稼働記録がないため、売上の増減は比較できません。";
    if (current.missingCountDays || previous.missingCountDays) {
      return `件数が0件または未入力の売上記録があります（対象期間 ${number(current.missingCountDays)}日・前期間 ${number(previous.missingCountDays)}日）。件数を確認してください。件数を伴わない売上がある期間も、増減の分解対象外です。`;
    }
    if (!isNumber(current.unitPrice) || !isNumber(previous.unitPrice)) {
      return "件数が0件の期間があるため、件数と平均単価による増減の分解はできません。";
    }
    return "記録が比較条件を満たさないため、増減の分解は表示していません。";
  }

  function renderSummary(analysis, range) {
    const current = analysis.current || {};
    const previous = analysis.previous || {};
    const change = analysis.change || {};
    const comparable = !range.isFuture && current.days > 0 && previous.days > 0 && isNumber(change.delta);
    const percentage = comparable ? signedPercent(change.percent) : "";
    const comparison = comparable
      ? `<strong class="analysis-delta ${directionClass(change.delta)}">${signedMoney(change.delta)}</strong>${percentage ? `<span class="analysis-change-rate ${directionClass(change.delta)}">${percentage}</span>` : ""}`
      : `<strong class="analysis-no-comparison">${range.isFuture ? "未来の期間は比較対象外です" : "比較できる記録がありません"}</strong>`;
    const effects = change.available && comparable && isNumber(change.countEffect) && isNumber(change.unitEffect)
      ? `<div class="analysis-effects">
          <div><span>件数の変化分</span><strong class="${directionClass(change.countEffect)}">${signedMoney(change.countEffect)}</strong></div>
          <div><span>平均単価の変化分</span><strong class="${directionClass(change.unitEffect)}">${signedMoney(change.unitEffect)}</strong></div>
        </div><p class="analysis-note">売上の増減を、配達件数と1件あたりの平均単価に分けています。平均単価には、配達する会社の構成の変化も含まれます。</p>`
      : `<p class="analysis-note analysis-guidance">${escapeHtml(comparisonExplanation(analysis, range))}</p>`;
    return `<div class="analysis-summary-grid">
      <div class="analysis-sales"><span>対象期間の売上</span><strong>${range.isFuture ? "—" : money(current.sales)}</strong></div>
      <div class="analysis-change"><span>前期間からの売上増減</span><div>${comparison}</div></div>
    </div>${effects}`;
  }

  function table(headers, rows, caption, className) {
    return `<table class="analysis-table ${className || ""}"><caption class="analysis-visually-hidden">${escapeHtml(caption)}</caption>
      <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.join("") : `<tr><td class="analysis-empty-cell" colspan="${headers.length}">この期間の記録がありません。</td></tr>`}</tbody></table>`;
  }

  function comparisonTable(analysis) {
    const current = analysis.current || {};
    const previous = analysis.previous || {};
    const rows = [
      ["売上", money(current.sales), money(previous.sales)],
      ["配達件数", `${number(current.count)}件`, `${number(previous.count)}件`],
      ["1件あたりの平均単価", money(current.unitPrice), money(previous.unitPrice)],
      ["稼働記録", `${number(current.days)}日`, `${number(previous.days)}日`],
      ["時間入力日数", `${number(current.timedDays)}日`, `${number(previous.timedDays)}日`],
      ["記録した稼働時間", `${decimal(current.hours)}時間`, `${decimal(previous.hours)}時間`],
      ["時間記録日の売上", money(current.timedSales), money(previous.timedSales)],
      ["時間記録日の時給", money(current.hourly), money(previous.hourly)],
      ["記録経費差引後の時給", money(current.netHourly), money(previous.netHourly)],
    ].map(([label, first, second]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${first}</td><td>${second}</td></tr>`);
    return table(["指標", "対象期間", "前期間"], rows, "対象期間と前期間の比較", "analysis-comparison-table");
  }

  function weekdayTable(weekdays) {
    const rows = weekdays.map((day) => `<tr${day.eligible ? ' class="analysis-eligible-row"' : ""}>
      <th scope="row">${escapeHtml(day.label)}</th>
      <td>${money(day.hourly)}</td><td>${money(day.medianHourly)}</td><td>${money(perDay(day))}</td>
      <td><span>${number(day.timedDays)} / ${number(day.days)}日</span><small>${decimal(day.hours)}時間</small></td>
    </tr>`);
    return table(["曜日", "時給", "日別時給の中央値", "1稼働日あたり売上", "時間記録 / 稼働記録"], rows, "曜日ごとの売上と時給");
  }

  function platformTable(platforms, providers, comparable) {
    const names = new Map(providers.map((provider) => [provider.id, provider.label]));
    const rows = platforms.map((platform) => {
      const label = names.get(platform.providerId) || platform.providerId || "未分類";
      const share = isNumber(platform.share) ? `${decimal(platform.share * 100)}%` : "—";
      return `<tr><th scope="row">${escapeHtml(label)}</th>
        <td>${money(platform.sales)}</td><td>${share}</td><td>${number(platform.count)}件${platform.missingCountDays ? `<small>0件・未入力の売上 ${number(platform.missingCountDays)}日</small>` : ""}</td>
        <td>${money(platform.unitPrice)}</td><td class="${comparable ? directionClass(platform.salesDelta) : ""}">${comparable ? signedMoney(platform.salesDelta) : "—"}</td></tr>`;
    });
    return table(["プラットフォーム", "売上", "構成比", "件数", "平均単価", "前期間売上差"], rows, "プラットフォームごとの売上と単価");
  }

  function weatherTable(weather) {
    const rows = weather.map((item) => `<tr><th scope="row">${escapeHtml(item.label || item.key || "未記録")}</th>
      <td>${money(perDay(item))}</td><td>${money(item.hourly)}</td>
      <td><span>${number(item.timedDays)} / ${number(item.days)}日</span><small>${decimal(item.hours)}時間</small></td></tr>`);
    return table(["天気", "1稼働日あたり売上", "時給", "時間記録 / 稼働記録"], rows, "天気ごとの売上と時給", "analysis-weather-table");
  }

  function selectTab(container, id, focus) {
    if (!TABS.some((tab) => tab.id === id)) return;
    container.dataset.analysisTab = id;
    container.querySelectorAll("[data-analysis-tab]").forEach((button) => {
      const selected = button.dataset.analysisTab === id;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    container.querySelectorAll("[data-analysis-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.analysisPanel !== id;
    });
  }

  function mount(container) {
    const prefix = `sales-analysis-${++nextId}`;
    container.innerHTML = `<div class="analysis-heading"><div><p class="analysis-eyebrow">記録から傾向をつかむ</p><h3>売上分析</h3></div><span class="analysis-period-badge" data-analysis-period-badge></span></div>
      <div class="analysis-periods" data-analysis-periods></div>
      <div data-analysis-summary></div>
      <details class="analysis-details"><summary>比較の内訳</summary><div class="analysis-table-scroll" tabindex="0" role="region" aria-label="比較の内訳表" data-analysis-comparison></div>
        <p class="analysis-note">時給は、時間を入力した日の売上合計 ÷ その稼働時間です。記録経費差引後の時給も同じ日の経費だけを差し引き、税金は含めません。増減の分解は両期間の平均件数・平均単価を使い、丸めにより表示額に1円の差が出る場合があります。</p>
      </details>
      <p class="analysis-coverage" data-analysis-coverage></p>
      <div class="analysis-tabs" role="tablist" aria-label="売上分析の切り口">${TABS.map((tab) => `<button type="button" role="tab" id="${prefix}-tab-${tab.id}" aria-controls="${prefix}-panel-${tab.id}" aria-selected="false" tabindex="-1" data-analysis-tab="${tab.id}">${tab.label}</button>`).join("")}</div>
      ${TABS.map((tab) => `<section class="analysis-tab-panel" role="tabpanel" id="${prefix}-panel-${tab.id}" aria-labelledby="${prefix}-tab-${tab.id}" data-analysis-panel="${tab.id}" hidden>
        <p class="analysis-finding" data-analysis-finding="${tab.id}"></p>
        <p class="analysis-scroll-hint">表は横にスクロールできます</p>
        <div class="analysis-table-scroll" tabindex="0" role="region" aria-label="${tab.label}別の分析表" data-analysis-table="${tab.id}"></div>
        <p class="analysis-note" data-analysis-note="${tab.id}"></p>
      </section>`).join("")}`;
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-analysis-tab]");
      if (button && container.contains(button)) selectTab(container, button.dataset.analysisTab, false);
    });
    container.addEventListener("keydown", (event) => {
      const button = event.target.closest("[data-analysis-tab]");
      if (!button || !container.contains(button)) return;
      const index = TABS.findIndex((tab) => tab.id === button.dataset.analysisTab);
      let target;
      if (event.key === "ArrowRight") target = (index + 1) % TABS.length;
      else if (event.key === "ArrowLeft") target = (index + TABS.length - 1) % TABS.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = TABS.length - 1;
      else return;
      event.preventDefault();
      selectTab(container, TABS[target].id, true);
    });
    container.dataset.analysisReady = "true";
  }

  function render(container, analysis, options = {}) {
    if (!container || !analysis) return;
    if (container.dataset.analysisReady !== "true") mount(container);
    const range = options.range || analysis.range || {};
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const current = analysis.current || {};
    const weekdays = Array.isArray(analysis.weekdays) ? analysis.weekdays : [];
    const platforms = Array.isArray(analysis.platforms) ? analysis.platforms : [];
    const weather = Array.isArray(analysis.weather) ? analysis.weather : [];
    const best = analysis.bestWeekday;
    const hasComparableWeekdays = weekdays.filter((day) => day.eligible).length >= 2;
    container.querySelector("[data-analysis-period-badge]").textContent = range.isFuture ? "未来の期間" : range.isPartial ? "途中経過で比較" : "期間比較";
    const currentPeriod = range.isFuture ? `${dateLabel(range.currentStart)}から（未来の期間）` : periodLabel(range.currentStart, range.currentEnd);
    container.querySelector("[data-analysis-periods]").innerHTML = `<p><span>対象</span>${escapeHtml(currentPeriod)}</p><p><span>比較</span>${escapeHtml(periodLabel(range.previousStart, range.previousEnd))}</p>${range.isPartial ? '<small>対象期間は今日まで。前期間も対応する日付までで比べています。</small>' : ""}`;
    container.querySelector("[data-analysis-summary]").innerHTML = renderSummary(analysis, range);
    container.querySelector(".analysis-details").hidden = Boolean(range.isFuture);
    container.querySelector("[data-analysis-comparison]").innerHTML = comparisonTable(analysis);
    const missingHours = isNumber(current.days) && isNumber(current.timedDays) && current.days > current.timedDays
      ? ` 時間未入力の${number(current.days - current.timedDays)}日にも稼働時間を補うと、時給の比較対象が増えます。`
      : "";
    container.querySelector("[data-analysis-coverage]").textContent = `${coverage(current)}。未記録日は休業として数えません。振込額は売上に含めません。${missingHours}`;
    container.querySelector('[data-analysis-table="weekdays"]').innerHTML = weekdayTable(weekdays);
    container.querySelector('[data-analysis-finding="weekdays"]').textContent = best
      ? `記録上、${String(best.label).replace(/曜日$/, "")}曜日の時給が高め：${money(best.hourly)}（${coverage(best)}）`
      : hasComparableWeekdays ? "比較対象の曜日で、最も高い時給が同程度です。各曜日の記録日数・稼働時間も確認してください。"
      : "比較の目安は各曜日3日・6時間以上。記録を増やすと曜日の傾向が見えてきます。";
    container.querySelector('[data-analysis-note="weekdays"]').textContent = "時給は時間記録日の売上合計 ÷ 稼働時間。中央値は日ごとの時給の真ん中の値です。売上の平均は稼働を記録した日で計算します。曜日ごとの地域・天気・稼働時間や、配達する会社の構成の違いも影響します。";
    container.querySelector('[data-analysis-table="platforms"]').innerHTML = platformTable(platforms, providers, Boolean(analysis.change?.available));
    container.querySelector('[data-analysis-finding="platforms"]').textContent = "各社の稼働時間は記録していないため、単価と売上で比較します。";
    container.querySelector('[data-analysis-note="platforms"]').textContent = "構成比は対象期間の売上に占める割合です。件数が0件・未入力の売上がある場合は平均単価を表示しません。件数を伴わない売上も含まれます。";
    container.querySelector('[data-analysis-table="weather"]').innerHTML = weatherTable(weather);
    container.querySelector('[data-analysis-finding="weather"]').textContent = "天気ごとの実績。曜日・地域・稼働時間が異なるため、同じ条件での比較ではありません。";
    container.querySelector('[data-analysis-note="weather"]').textContent = "天気が未記録の日は別枠です。時給は時間を入力した日のみを使います。記録が少ない天気は参考値として確認してください。";
    selectTab(container, container.dataset.analysisTab || TABS[0].id, false);
  }

  root.DeliSalesInsights = { render };
})(typeof window !== "undefined" ? window : globalThis);
