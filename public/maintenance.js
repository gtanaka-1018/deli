(function () {
  "use strict";
  const data = window.DeliMaintenanceData;
  const el = {};
  let app;
  let selectedVehicle = "";
  let editingId = "";
  let original = "";
  let originalEntry = "";
  let trigger;
  let saving = false;
  let importBatch = null;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const number = (value) => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value);
  const dateLabel = (value) => value.replaceAll("-", "/");
  const types = { motorcycle: "バイク", bicycle: "自転車", kei: "軽自動車", other: "その他" };

  function renderArticles(vehicle) {
    const articles = [
      { path: "food-delivery-bike-gear", tag: "装備選び", title: "配達で使い続けた装備12選", description: "最初にそろえる道具と、買う前の確認点。", source: "garage_gear" },
      { path: "rainwear-water-repellent-restore-nikwax", tag: "雨具の手入れ", title: "レインウェアの撥水を取り戻す", description: "洗濯表示を確かめて、雨具を長く使うヒントに。", source: "garage_rainwear" },
    ];
    if (vehicle?.type === "motorcycle") {
      const isNmax = /n[\s-]*max/i.test(String(vehicle.label).normalize("NFKC"));
      articles.unshift(isNmax
        ? { path: "kaedear-kdr-m28-delivery-review", tag: "NMAX125の装備", title: "スマホホルダーの適合を確認", description: "KDR-M28の寸法や取り付け条件をチェック。", source: "garage_nmax" }
        : { path: "nmax125-vs-pcx125", tag: "バイク選び", title: "NMAX125とPCX125を比較", description: "収納・ABS・配達用途から、車体選びを考える。", source: "garage_bike" });
    }
    document.getElementById("erabibaseArticles").innerHTML = articles.map((article) => {
      const url = new URL(`https://erabibase.com/${article.path}/`);
      url.search = new URLSearchParams({ utm_source: "okumeter", utm_medium: "app", utm_campaign: "delivery_support", utm_content: article.source }).toString();
      return `<a class="erabibase-article" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${article.title}（新しいタブ）"><span class="erabibase-tag">${article.tag}</span><strong>${article.title}<span aria-hidden="true"> ↗</span></strong><span class="erabibase-description">${article.description}</span><span class="erabibase-read">記事を読む</span></a>`;
    }).join("");
  }

  function vehicles() {
    const state = app.getState();
    const choices = [...state.vehicles];
    for (const entry of state.maintenance) {
      if (!choices.some((vehicle) => vehicle.id === entry.vehicleId)) {
        choices.push({ id: entry.vehicleId, label: "未登録の車両", type: "other", icon: "●", visible: false });
      }
    }
    return choices;
  }

  function init(adapter) {
    app = adapter;
    for (const id of ["maintenanceAddVehicle", "garageCount", "garageVehicles", "maintenanceVehicleName", "maintenanceVehicleType", "addMaintenance", "maintenanceCount", "maintenanceLatestDate", "maintenanceLatestKm", "maintenanceHistory", "maintenanceDialog", "maintenanceDialogTitle", "maintenanceForm", "maintenanceClose", "maintenanceVehicle", "maintenanceDate", "maintenanceOdometer", "maintenanceDescription", "maintenanceMemo", "maintenanceError", "maintenanceCancel", "maintenanceSave"]) {
      el[id] = document.getElementById(id);
    }
    for (const id of ["maintenanceImportOpen", "maintenanceImportFile", "maintenanceImportDialog", "maintenanceImportForm", "maintenanceImportSummary", "maintenanceImportTarget", "maintenanceImportPreview", "maintenanceImportError", "maintenanceImportClose", "maintenanceImportCancel", "maintenanceImportSave"]) el[id] = document.getElementById(id);
    el.maintenanceImportOpen.addEventListener("click", () => el.maintenanceImportFile.click());
    el.maintenanceImportFile.addEventListener("change", readImportFile);
    el.maintenanceImportTarget.addEventListener("change", renderImport);
    el.maintenanceImportClose.addEventListener("click", closeImport);
    el.maintenanceImportCancel.addEventListener("click", closeImport);
    el.maintenanceImportDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeImport(); });
    el.maintenanceImportDialog.addEventListener("close", () => el.maintenanceImportOpen.focus());
    el.maintenanceImportForm.addEventListener("submit", saveImport);
    el.maintenanceAddVehicle.addEventListener("click", () => app.openVehicle(el.maintenanceAddVehicle));
    el.garageVehicles.addEventListener("click", (event) => {
      const button = event.target.closest("[data-garage-vehicle]");
      if (!button) return;
      selectedVehicle = button.dataset.garageVehicle;
      render();
      el.garageVehicles.querySelector(`[data-garage-vehicle="${CSS.escape(selectedVehicle)}"]`)?.focus();
    });
    el.addMaintenance.addEventListener("click", () => open("", el.addMaintenance));
    el.maintenanceHistory.addEventListener("click", (event) => {
      const edit = event.target.closest("[data-maintenance-edit]");
      const remove = event.target.closest("[data-maintenance-delete]");
      if (edit) open(edit.dataset.maintenanceEdit, edit);
      if (remove) removeEntry(remove.dataset.maintenanceDelete, remove);
    });
    el.maintenanceClose.addEventListener("click", close);
    el.maintenanceCancel.addEventListener("click", close);
    el.maintenanceDialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    el.maintenanceDialog.addEventListener("close", () => {
      if (trigger?.isConnected) trigger.focus();
      else el.addMaintenance.focus();
    });
    el.maintenanceForm.addEventListener("submit", save);
    document.querySelectorAll("[data-maintenance-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const current = el.maintenanceDescription.value.trim();
        const value = button.dataset.maintenancePreset;
        if (!current.includes(value)) el.maintenanceDescription.value = current ? `${current}・${value}`.slice(0, 200) : value;
        el.maintenanceDescription.focus();
      });
    });
  }

  async function readImportFile() {
    const file = el.maintenanceImportFile.files[0];
    el.maintenanceImportFile.value = "";
    if (!file || saving) return;
    try {
      if (file.size > 2_000_000) throw new Error("整備履歴ファイルは2MB以内にしてください。");
      importBatch = data.readImport(JSON.parse((await file.text()).replace(/^\uFEFF/, "")));
      const choices = app.getState().vehicles;
      el.maintenanceImportTarget.innerHTML = choices.map((vehicle) => `<option value="${escape(vehicle.id)}">${escape(vehicle.label)}</option>`).join("")
        + `<option value="">${escape(importBatch.vehicle.label)} を新しく登録</option>`;
      const key = (label) => String(label).normalize("NFKC").replace(/[\s-]/g, "").toLowerCase();
      el.maintenanceImportTarget.value = choices.find((vehicle) => key(vehicle.label) === key(importBatch.vehicle.label))?.id || "";
      el.maintenanceImportError.hidden = true;
      renderImport();
      el.maintenanceImportDialog.showModal();
      el.maintenanceImportTarget.focus();
    } catch (error) {
      importBatch = null;
      app.notify(error instanceof SyntaxError ? "整備履歴の取り込み用JSONファイルを選んでください" : error.message);
    }
  }

  function renderImport() {
    if (!importBatch) return;
    const targetId = el.maintenanceImportTarget.value;
    const result = data.mergeImport(app.getState().maintenance, importBatch, targetId);
    el.maintenanceImportSummary.textContent = `${importBatch.vehicle.label}の履歴 ${importBatch.entries.length}件：追加 ${result.added}件・取り込み済み ${result.skipped}件`;
    el.maintenanceImportPreview.innerHTML = data.forVehicle(importBatch.entries).map((entry) => `<article><small>${dateLabel(entry.date)} ・ ${entry.odometerKm === null ? "走行距離 未記録" : `${number(entry.odometerKm)} km`}</small><strong>${escape(entry.description)}</strong>${entry.memo ? `<p>${escape(entry.memo)}</p>` : ""}</article>`).join("");
    el.maintenanceImportSave.disabled = !result.added;
  }

  function closeImport() {
    if (saving) return;
    el.maintenanceImportDialog.close();
    importBatch = null;
  }

  async function saveImport(event) {
    event.preventDefault();
    if (saving || !importBatch) return;
    saving = true;
    el.maintenanceImportSave.disabled = true;
    el.maintenanceImportTarget.disabled = true;
    el.maintenanceImportError.hidden = true;
    try {
      const result = await app.importEntries(importBatch, el.maintenanceImportTarget.value);
      selectedVehicle = result.vehicleId;
      el.maintenanceImportDialog.close();
      importBatch = null;
      render();
      app.notify(`整備履歴を${result.added}件追加しました${result.skipped ? `（取り込み済み${result.skipped}件）` : ""}`);
    } catch (error) {
      el.maintenanceImportError.textContent = error.message;
      el.maintenanceImportError.hidden = false;
    } finally {
      saving = false;
      el.maintenanceImportTarget.disabled = false;
      renderImport();
    }
  }

  function render() {
    if (!app) return;
    const state = app.getState();
    const choices = vehicles();
    if (!choices.some((vehicle) => vehicle.id === selectedVehicle)) selectedVehicle = choices.find((vehicle) => vehicle.id === state.lastVehicleId)?.id || choices[0]?.id || "";
    const vehicle = choices.find((item) => item.id === selectedVehicle);
    renderArticles(vehicle);
    el.garageCount.textContent = `${choices.length}台`;
    el.garageVehicles.innerHTML = choices.length ? choices.map((item) => {
      const entries = data.forVehicle(state.maintenance, item.id);
      return `<button class="garage-vehicle${item.id === selectedVehicle ? " selected" : ""}" type="button" data-garage-vehicle="${escape(item.id)}" aria-pressed="${item.id === selectedVehicle}">
        <span class="garage-vehicle-icon" aria-hidden="true">${escape(item.icon)}</span>
        <span class="garage-vehicle-copy"><strong>${escape(item.label)}</strong><small>${escape(types[item.type] || "その他")}${item.visible === false ? "・非表示の車両" : ""}</small><span>${entries.length ? `最終整備 ${dateLabel(entries[0].date)}` : "整備履歴なし"}</span></span>
        <span class="garage-vehicle-arrow" aria-hidden="true">›</span>
      </button>`;
    }).join("") : '<div class="maintenance-empty"><span aria-hidden="true">＋</span><strong>最初の車両を登録</strong><p>いつ、何を整備したか。<br>車両ごとに残せます。</p></div>';
    el.addMaintenance.disabled = !vehicle;
    el.maintenanceVehicleName.textContent = vehicle?.label || "車両を登録しましょう";
    el.maintenanceVehicleType.textContent = vehicle ? `${types[vehicle.type] || "その他"}のメンテナンス` : "車両ごとの記録";
    const entries = vehicle ? data.forVehicle(state.maintenance, vehicle.id) : [];
    el.maintenanceCount.textContent = `${entries.length}件`;
    el.maintenanceLatestDate.textContent = entries[0] ? dateLabel(entries[0].date) : "—";
    const readings = entries.filter((entry) => entry.odometerKm !== null).map((entry) => ({ date: entry.date, km: entry.odometerKm }));
    for (const [date, record] of Object.entries(state.records)) {
      if (record?.vehicleId === selectedVehicle && Number.isFinite(Number(record.odometerKm)) && Number(record.odometerKm) > 0) readings.push({ date, km: Number(record.odometerKm) });
    }
    readings.sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km);
    el.maintenanceLatestKm.textContent = readings[0] ? `${number(readings[0].km)} km` : "—";
    el.maintenanceLatestKm.title = readings[0] ? `${dateLabel(readings[0].date)}の記録` : "";
    el.maintenanceHistory.innerHTML = entries.length ? `<table class="maintenance-table" aria-label="${escape(vehicle.label)}の整備履歴">
      <colgroup><col class="maintenance-date-column"><col class="maintenance-km-column"><col></colgroup>
      <thead><tr><th scope="col" aria-sort="descending">日付</th><th scope="col">走行距離</th><th scope="col">整備内容</th></tr></thead>
      <tbody>${entries.map((entry) => `<tr>
        <td class="maintenance-date-cell"><time datetime="${entry.date}">${dateLabel(entry.date)}</time></td>
        <td class="maintenance-km-cell">${entry.odometerKm === null ? "未記録" : `${number(entry.odometerKm)} km`}</td>
        <td><details class="maintenance-details"><summary>${escape(entry.description)}</summary>
        ${entry.memo ? `<p>${escape(entry.memo)}</p>` : ""}
        <div class="maintenance-entry-actions"><button type="button" class="text-button muted" data-maintenance-edit="${escape(entry.id)}" aria-label="${escape(`${dateLabel(entry.date)} ${entry.description}を編集`)}">編集</button><button type="button" class="text-button danger" data-maintenance-delete="${escape(entry.id)}" aria-label="${escape(`${dateLabel(entry.date)} ${entry.description}を削除`)}">削除</button></div></details></td>
      </tr>`).join("")}</tbody></table>` : `<div class="maintenance-empty"><span aria-hidden="true">◇</span><strong>${vehicle ? "最初の整備を記録しましょう" : "相棒のケアを、ひとつの場所に"}</strong><p>オイル交換や点検の履歴を残して、<br>次の整備にも役立てましょう。</p></div>`;
  }

  function values() {
    return {
      vehicleId: el.maintenanceVehicle.value,
      date: el.maintenanceDate.value,
      odometerKm: el.maintenanceOdometer.value === "" ? null : Number(el.maintenanceOdometer.value),
      description: el.maintenanceDescription.value.trim(),
      memo: el.maintenanceMemo.value.trim(),
    };
  }

  function open(id, source) {
    const state = app.getState();
    const entry = state.maintenance.find((item) => item.id === id);
    if (id && !entry) return;
    editingId = entry?.id || "";
    originalEntry = entry ? JSON.stringify(entry) : "";
    trigger = source;
    el.maintenanceForm.reset();
    el.maintenanceError.hidden = true;
    el.maintenanceDialogTitle.textContent = entry ? "整備履歴を編集" : "整備を記録";
    el.maintenanceVehicle.innerHTML = vehicles().map((vehicle) => `<option value="${escape(vehicle.id)}">${escape(vehicle.label)}</option>`).join("");
    el.maintenanceVehicle.value = entry?.vehicleId || selectedVehicle;
    el.maintenanceDate.value = entry?.date || app.today();
    el.maintenanceOdometer.value = entry?.odometerKm ?? "";
    el.maintenanceDescription.value = entry?.description || "";
    el.maintenanceMemo.value = entry?.memo || "";
    original = JSON.stringify(values());
    el.maintenanceDialog.showModal();
    el.maintenanceDescription.focus();
  }

  function close() {
    if (saving) return;
    if (JSON.stringify(values()) !== original && !confirm("入力中の整備履歴を破棄しますか？")) return;
    el.maintenanceDialog.close();
  }

  function error(message) {
    el.maintenanceError.textContent = message;
    el.maintenanceError.hidden = false;
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !el.maintenanceForm.reportValidity()) return;
    const entry = values();
    if (!entry.description) return error("整備内容を入力してください。");
    if (!data.validDate(entry.date)) return error("整備日を確認してください。");
    if (!vehicles().some((vehicle) => vehicle.id === entry.vehicleId)) return error("車両を選択してください。");
    const state = app.getState();
    if (editingId && JSON.stringify(state.maintenance.find((item) => item.id === editingId)) !== originalEntry) return error("この履歴は別の操作で更新されています。入力は残しています。画面を閉じて最新の履歴を確認してください。");
    entry.id = editingId || `maintenance-${crypto.randomUUID()}`;
    const entries = editingId ? state.maintenance.map((item) => item.id === editingId ? entry : item) : [...state.maintenance, entry];
    saving = true;
    el.maintenanceSave.disabled = true;
    try {
      await app.save(entries);
      selectedVehicle = entry.vehicleId;
      render();
      el.maintenanceDialog.close();
      app.notify("整備履歴を保存しました");
    } catch {
      error("保存できませんでした。入力を残しています。空き容量や設定画面の復元を確認してください。");
    } finally {
      saving = false;
      el.maintenanceSave.disabled = false;
    }
  }

  async function removeEntry(id, button) {
    if (saving) return;
    const entry = app.getState().maintenance.find((item) => item.id === id);
    if (!entry || !confirm(`${dateLabel(entry.date)}「${entry.description}」を削除しますか？\n削除前の状態を復元ポイントに残します。`)) return;
    saving = true;
    button.disabled = true;
    try {
      await app.beforeDelete();
      if (JSON.stringify(app.getState().maintenance.find((item) => item.id === id)) !== JSON.stringify(entry)) throw new Error("Entry changed");
      await app.save(app.getState().maintenance.filter((item) => item.id !== id));
      render();
      el.addMaintenance.focus();
      app.notify("整備履歴を削除しました");
    } catch {
      button.disabled = false;
      app.notify("削除を保存できませんでした。履歴は残っています");
    } finally {
      saving = false;
    }
  }

  window.DeliMaintenanceUI = Object.freeze({ init, render });
})();
