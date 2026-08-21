const STORAGE_KEY = "deli-sales-tracker-v1";
const ONBOARDING_KEY = "deli-onboarding-complete-v1";
const LAST_BACKUP_KEY = "deli-last-backup-v1";
const OKU_METER_GOAL = 100_000_000;
const OKU_METER_MILESTONES = [1_000_000, 10_000_000, 50_000_000, OKU_METER_GOAL];
const ASSET_FIELDS = Object.freeze([
  { id: "cash", label: "現金・預金", icon: "¥", hint: "普通預金・定期預金・現金" },
  { id: "points", label: "ポイント・電子マネー", icon: "P", hint: "円換算した現在の残高" },
  { id: "securities", label: "株式・投資信託", icon: "↗", hint: "国内外株式・投資信託・ETF" },
  { id: "gold", label: "金・貴金属", icon: "◆", hint: "現在の評価額" },
  { id: "pension", label: "iDeCo・年金", icon: "○", hint: "iDeCo・企業型DCなど" },
  { id: "crypto", label: "暗号資産", icon: "◇", hint: "現在の評価額" },
  { id: "realEstate", label: "不動産", icon: "⌂", hint: "現在の評価額" },
  { id: "business", label: "事業資産", icon: "▦", hint: "車両・設備・事業用資金など" },
  { id: "other", label: "その他資産", icon: "+", hint: "上記以外の資産" },
  { id: "liabilities", label: "負債・ローン", icon: "−", hint: "住宅・車両・カード等の残高", liability: true },
]);

const TIME_BANDS = Object.freeze([
  { id: "morning", label: "早朝・朝", time: "5:00–10:00", segments: [[5 * 60, 10 * 60]] },
  { id: "lunch", label: "ランチ", time: "10:00–14:00", segments: [[10 * 60, 14 * 60]] },
  { id: "afternoon", label: "午後", time: "14:00–17:00", segments: [[14 * 60, 17 * 60]] },
  { id: "dinner", label: "ディナー", time: "17:00–22:00", segments: [[17 * 60, 22 * 60]] },
  { id: "late", label: "深夜", time: "22:00–5:00", segments: [[22 * 60, 24 * 60], [0, 5 * 60]] },
]);

const DEFAULT_PROVIDERS = [
  { id: "uber", label: "Uber", icon: "U", visible: true },
  { id: "wolt", label: "Wolt", icon: "W", visible: false },
  { id: "rocket", label: "Rocket Now", icon: "R", visible: true },
  { id: "demae", label: "出前館", icon: "出", visible: true },
];

const VEHICLE_TYPES = {
  motorcycle: { label: "バイク", icon: "🏍" },
  bicycle: { label: "自転車", icon: "🚲" },
  kei: { label: "軽自動車", icon: "🚙" },
  other: { label: "その他", icon: "●" },
};

const state = {
  view: "day",
  selectedDate: todayString(),
  taxYear: new Date().getFullYear(),
  records: {},
  targets: {},
  providers: DEFAULT_PROVIDERS.map((provider) => ({ ...provider })),
  vehicles: [],
  taxProfiles: {},
  assets: defaultAssetValues(),
};

const els = {};
let persistTimer = 0;
let activeServiceId = "";
let serviceDialogTrigger = null;
let currentScreen = "input";
let draftExpenses = [];
let editingExpenseIndex = -1;
let expenseDialogTrigger = null;
let formDirty = false;
let formRevision = 0;
let draftSourceData = {};
let draftServices = {};
let providerDialogTrigger = null;
let editingProviderId = "";
let editingVehicleId = "";
let vehicleDialogTrigger = null;
let odometerIndexCache = null;
let periodPickerCursor = new Date();

document.addEventListener("DOMContentLoaded", () => {
  startApp();
});

async function startApp() {
  bindElements();
  await loadState();
  await requestPersistentStorage();
  bindEvents();
  state.selectedDate = todayString();
  fillFormForDate(state.selectedDate);
  render({ shouldPersist: false });
  registerServiceWorker();
  setupWelcomeGuide();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

function bindElements() {
  [
    "selectedDate",
    "selectedWeek",
    "selectedWeekControl",
    "selectedWeekRange",
    "selectedMonth",
    "selectedYear",
    "periodControls",
    "inputPeriodHost",
    "summaryPeriodHost",
    "planPeriodHost",
    "periodLabel",
    "periodPickerButton",
    "periodPickerValue",
    "periodPickerDialog",
    "periodPickerTitle",
    "periodPickerClose",
    "periodPickerPrev",
    "periodPickerNext",
    "periodPickerHeading",
    "periodPickerOptions",
    "prevPeriod",
    "nextPeriod",
    "metricSales",
    "metricProfit",
    "metricHourly",
    "metricAchievement",
    "metricTargetSales",
    "okuMeterGauge",
    "okuMeterPercent",
    "okuMeterNetAssets",
    "okuMeterRail",
    "okuMeterMilestones",
    "okuMeterNext",
    "okuMeterRemaining",
    "okuMeterTotalAssets",
    "okuMeterLiabilities",
    "okuMeterLifetimeSales",
    "okuMeterMessage",
    "okuMeterPeriod",
    "assetInputs",
    "assetSummaryTotal",
    "assetSummaryLiabilities",
    "assetSummaryNet",
    "loadToday",
    "saveRecord",
    "recordActionDock",
    "monthlyTarget",
    "planPercent",
    "planProgress",
    "planRemaining",
    "planDailyNeed",
    "planWeeklyNeed",
    "planForecast",
    "planNeededCount",
    "dailySales",
    "dailyProfit",
    "dailyExpense",
    "dailyWorkHours",
    "dailyHourly",
    "dailyGasUnit",
    "dailyKmUnit",
    "reportTitle",
    "dayReport",
    "weekReport",
    "monthReport",
    "yearReport",
    "toast",
    "exportJson",
    "importJson",
    "clearAll",
    "backupCareCard",
    "backupCareTitle",
    "backupCareMessage",
    "openWelcomeGuide",
    "welcomeDialog",
    "welcomeStart",
    "welcomeClose",
    "workHours",
    "workHoursOverrideHint",
    "breakHours",
    "odometerKm",
    "odometerHint",
    "memo",
    "workSessions",
    "addWorkSession",
    "serviceDialog",
    "serviceDialogForm",
    "serviceDialogTitle",
    "serviceDialogClose",
    "serviceDialogCancel",
    "serviceCount",
    "serviceSales",
    "primaryNav",
    "inputScreen",
    "summaryScreen",
    "meterScreen",
    "rankingScreen",
    "planScreen",
    "taxScreen",
    "saveDockStatus",
    "expenseList",
    "expenseTotal",
    "addExpense",
    "expenseDialog",
    "expenseDialogForm",
    "expenseDialogTitle",
    "expenseDialogClose",
    "expenseDialogCancel",
    "expenseDialogDelete",
    "expenseTypeGas",
    "expenseTypeOther",
    "expenseAmount",
    "expenseFuelLiters",
    "expenseMemo",
    "expenseGasFields",
    "expenseOtherFields",
    "expenseGasUnitPreview",
    "sourceDataSummary",
    "servicePicker",
    "addProvider",
    "providerDialog",
    "providerDialogForm",
    "providerDialogTitle",
    "providerDialogClose",
    "providerDialogCancel",
    "providerDialogSubmit",
    "providerIcon",
    "providerName",
    "providerSettingsList",
    "settingsScreen",
    "taxYear",
    "taxEmploymentMode",
    "taxSalaryRevenueField",
    "taxSalaryRevenue",
    "taxSalaryIncomePreview",
    "taxSalaryWithholdingField",
    "taxSalaryWithholding",
    "taxResidentPaymentField",
    "taxResidentPaymentMethod",
    "taxRegion",
    "taxFilingType",
    "taxOtherIncome",
    "taxOtherIncomeLabel",
    "taxOtherIncomeHint",
    "taxIdeco",
    "taxMutualAid",
    "taxSocialInsurance",
    "taxSocialInsuranceHint",
    "taxOtherDeductions",
    "taxWithholding",
    "taxWithholdingLabel",
    "taxWithholdingHint",
    "taxFileAnywayRow",
    "taxFileAnyway",
    "taxIncludeBusinessTax",
    "taxInvoiceRegistered",
    "taxAnnualSales",
    "taxAnnualExpenses",
    "taxAnnualProfit",
    "taxTotalLabel",
    "taxTotalBurden",
    "taxMonthlyReserve",
    "taxResultSubtitle",
    "taxFilingStatus",
    "taxSalaryIncomeRow",
    "taxSalaryIncome",
    "taxCompanyHandledRow",
    "taxCompanyHandled",
    "taxIncrementalBurdenRow",
    "taxIncrementalBurdenLabel",
    "taxIncrementalBurden",
    "taxTaxableIncomeLabel",
    "taxTaxableIncome",
    "taxIncomeTaxLabel",
    "taxIncomeTax",
    "taxReconstructionTaxLabel",
    "taxReconstructionTax",
    "taxResidentTaxLabel",
    "taxResidentTax",
    "taxBusinessTax",
    "taxAdditionalPayment",
    "taxAdditionalPaymentLabel",
    "taxRefundMessage",
    "taxBlueDeduction",
    "taxBasicDeduction",
    "taxEnteredDeductions",
    "taxResidentRate",
    "taxResidentFixed",
    "taxRegionalExtra",
    "taxRegionNote",
    "taxIncomeDeadline",
    "taxResidentSchedule",
    "taxBusinessSchedule",
    "taxConsumptionStatus",
    "storageModeLabel",
    "vehicleId",
    "vehicleSettingsList",
    "addVehicle",
    "vehicleDialog",
    "vehicleDialogForm",
    "vehicleDialogTitle",
    "vehicleDialogClose",
    "vehicleDialogCancel",
    "vehicleDialogSubmit",
    "vehicleType",
    "vehicleName",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

}

function bindEvents() {
  els.selectedDate.addEventListener("change", () => {
    changeSelectedPeriod(els.selectedDate.value || todayString());
  });
  els.selectedWeek.addEventListener("change", () => {
    const date = dateFromWeekInput(els.selectedWeek.value);
    if (date) changeSelectedPeriod(date);
  });
  els.selectedMonth.addEventListener("change", () => {
    if (els.selectedMonth.value) changeSelectedPeriod(`${els.selectedMonth.value}-01`);
  });
  els.selectedYear.addEventListener("change", () => {
    if (els.selectedYear.value) changeSelectedPeriod(`${els.selectedYear.value}-01-01`);
  });
  els.periodPickerButton.addEventListener("click", openPeriodPicker);
  els.periodPickerClose.addEventListener("click", closePeriodPicker);
  els.periodPickerPrev.addEventListener("click", () => movePeriodPickerCursor(-1));
  els.periodPickerNext.addEventListener("click", () => movePeriodPickerCursor(1));
  els.periodPickerOptions.addEventListener("click", selectPeriodFromPicker);
  els.periodPickerDialog.addEventListener("click", (event) => {
    if (event.target === els.periodPickerDialog) closePeriodPicker();
  });

  document.querySelectorAll(".screen-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.screen === "input" && state.selectedDate !== todayString()) {
        if (!confirmDiscardDraft()) return;
        state.selectedDate = todayString();
        fillFormForDate(state.selectedDate);
      }
      currentScreen = tab.dataset.screen;
      render();
      if (currentScreen === "meter") window.scrollTo({ top: 0, behavior: "auto" });
    });
  });

  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (state.selectedDate !== todayString()) {
        if (!confirmDiscardDraft()) return;
        state.selectedDate = todayString();
        fillFormForDate(state.selectedDate);
      }
      state.view = tab.dataset.view;
      render();
    });
    tab.addEventListener("keydown", moveReportTabFocus);
  });

  els.dayReport.addEventListener("click", (event) => {
    const button = event.target.closest("[data-jump-date]");
    if (button) jumpToInputDate(button.dataset.jumpDate);
  });

  els.prevPeriod.addEventListener("click", () => movePeriod(-1));
  els.nextPeriod.addEventListener("click", () => movePeriod(1));
  els.loadToday.addEventListener("click", () => {
    if (!confirmDiscardDraft()) return;
    state.selectedDate = todayString();
    fillFormForDate(state.selectedDate);
    render();
    closePeriodPicker();
  });
  els.assetInputs.addEventListener("input", updateAssetValue);

  els.saveRecord.addEventListener("click", saveCurrentRecord);
  els.monthlyTarget.addEventListener("input", () => {
    const key = monthKey(state.selectedDate);
    const value = numberValue(els.monthlyTarget.value);
    state.targets[key] = value;
    render({ shouldPersist: false });
    schedulePersist();
  });

  els.taxYear.addEventListener("change", () => {
    state.taxYear = Number(els.taxYear.value) || new Date().getFullYear();
    renderTaxScreen();
    schedulePersist();
  });
  document.querySelector(".tax-input-panel").addEventListener("input", (event) => {
    if (!event.target.matches('input[type="number"]')) return;
    updateTaxProfileFromForm();
  });
  document.querySelector(".tax-input-panel").addEventListener("change", (event) => {
    if (event.target.matches('input[type="number"]')) return;
    updateTaxProfileFromForm();
  });

  document.querySelector(".input-panel").addEventListener("input", (event) => {
    if (event.target.matches("[data-session-field]") || event.target === els.breakHours) {
      if (event.target.matches("[data-session-field]")) event.target.setCustomValidity("");
      clearImportedWorkHoursOverride();
      updateManualHoursState();
    }
    if (event.target.matches("input")) {
      markFormDirty();
      renderDailyPreview();
    }
  });
  els.servicePicker.addEventListener("click", (event) => {
    const button = event.target.closest(".service-select");
    if (button) openServiceDialog(button.dataset.service, button);
  });
  els.serviceDialogForm.addEventListener("submit", applyServiceDialog);
  els.serviceDialogClose.addEventListener("click", closeServiceDialog);
  els.serviceDialogCancel.addEventListener("click", closeServiceDialog);
  els.serviceDialog.addEventListener("click", (event) => {
    if (event.target === els.serviceDialog) closeServiceDialog();
  });
  els.serviceDialog.addEventListener("close", restoreServiceDialogFocus);
  els.addProvider.addEventListener("click", () => openProviderDialog());
  els.providerDialogForm.addEventListener("submit", applyProviderDialog);
  els.providerDialogClose.addEventListener("click", closeProviderDialog);
  els.providerDialogCancel.addEventListener("click", closeProviderDialog);
  els.providerDialog.addEventListener("click", (event) => {
    if (event.target === els.providerDialog) closeProviderDialog();
  });
  els.providerDialog.addEventListener("close", restoreProviderDialogFocus);
  els.providerSettingsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-provider]");
    if (button) openProviderDialog(button.dataset.editProvider, button);
  });
  els.providerSettingsList.addEventListener("change", toggleProviderVisibility);
  els.addVehicle.addEventListener("click", () => openVehicleDialog());
  els.vehicleSettingsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-vehicle]");
    if (button) openVehicleDialog(button.dataset.editVehicle, button);
  });
  els.vehicleSettingsList.addEventListener("change", toggleVehicleVisibility);
  els.vehicleDialogForm.addEventListener("submit", applyVehicleDialog);
  els.vehicleDialogClose.addEventListener("click", closeVehicleDialog);
  els.vehicleDialogCancel.addEventListener("click", closeVehicleDialog);
  els.vehicleDialog.addEventListener("click", (event) => {
    if (event.target === els.vehicleDialog) closeVehicleDialog();
  });
  els.vehicleDialog.addEventListener("close", restoreVehicleDialogFocus);
  els.vehicleType.addEventListener("change", suggestVehicleName);
  els.vehicleId.addEventListener("change", () => {
    markFormDirty();
    renderDailyPreview();
  });

  els.addExpense.addEventListener("click", () => openExpenseDialog(-1, els.addExpense));
  els.expenseList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-expense]");
    if (button) openExpenseDialog(Number(button.dataset.editExpense), button);
  });
  els.expenseDialogForm.addEventListener("submit", applyExpenseDialog);
  els.expenseDialogClose.addEventListener("click", closeExpenseDialog);
  els.expenseDialogCancel.addEventListener("click", closeExpenseDialog);
  els.expenseDialogDelete.addEventListener("click", deleteExpenseFromDialog);
  els.expenseDialog.addEventListener("click", (event) => {
    if (event.target === els.expenseDialog) closeExpenseDialog();
  });
  els.expenseDialog.addEventListener("close", restoreExpenseDialogFocus);
  [els.expenseTypeGas, els.expenseTypeOther].forEach((input) => {
    input.addEventListener("change", updateExpenseDialogFields);
  });
  els.expenseAmount.addEventListener("input", updateExpenseGasUnitPreview);
  els.expenseFuelLiters.addEventListener("input", updateExpenseGasUnitPreview);
  els.expenseMemo.addEventListener("input", () => els.expenseMemo.setCustomValidity(""));

  els.addWorkSession.addEventListener("click", addWorkSession);
  els.workSessions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-session]");
    if (button) removeWorkSession(Number(button.dataset.removeSession));
  });
  els.workSessions.addEventListener("focusout", (event) => {
    const input = event.target.closest("[data-session-field]");
    if (!input || !input.value.trim()) return;
    const normalized = normalizeTime(input.value);
    if (normalized) input.value = timeInputValue(normalized);
  });

  els.exportJson.addEventListener("click", exportBackup);
  els.importJson.addEventListener("change", importBackup);
  els.clearAll.addEventListener("click", clearAllData);
  els.openWelcomeGuide.addEventListener("click", () => openWelcomeGuide(true));
  els.welcomeStart.addEventListener("click", closeWelcomeGuide);
  els.welcomeClose.addEventListener("click", closeWelcomeGuide);
  window.addEventListener("beforeunload", (event) => {
    if (formDirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

async function loadState() {
  try {
    const snapshot = await readBrowserSnapshot();
    if (snapshot) applySnapshot(snapshot);
  } catch {
    showToast("保存データを読み込めませんでした");
  }
}

async function persist() {
  const snapshot = snapshotState();
  const browserOk = persistBrowserSnapshot(snapshot);

  if (!browserOk) {
    throw new Error("Unable to save data");
  }

  window.dispatchEvent(new Event("deli:data-saved"));
  return { browserOk };
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persist().catch(() => showToast("自動保存に失敗しました"));
  }, 120);
}

function snapshotState() {
  return {
    view: state.view,
    selectedDate: state.selectedDate,
    taxYear: state.taxYear,
    records: state.records,
    targets: state.targets,
    providers: state.providers,
    vehicles: state.vehicles,
    taxProfiles: state.taxProfiles,
    assets: state.assets,
    updatedAt: new Date().toISOString(),
  };
}

function publishableRankingSnapshot() {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffDate = toDateInput(cutoff);
  const today = todayString();
  const dailySales = Object.entries(state.records)
    .filter(([date]) => date >= cutoffDate && date <= today)
    .map(([date, record]) => {
      const summary = summarizeRecords([
        normalizeRecord({ ...(isPlainObject(record) ? record : {}), date }),
      ]);
      return {
        date,
        count: Math.max(0, Math.round(summary.count)),
        sales: Math.max(0, Math.round(summary.sales)),
      };
    })
    .filter((entry) => entry.count > 0 || entry.sales > 0)
    .sort((left, right) => right.date.localeCompare(left.date));
  const totalAssets = ASSET_FIELDS
    .filter((field) => !field.liability)
    .reduce((sum, field) => sum + numberValue(state.assets[field.id]), 0);
  const liabilities = numberValue(state.assets.liabilities);

  return {
    netAssets: Math.round(totalAssets - liabilities),
    dailySales,
  };
}

window.DeliRankingData = Object.freeze({
  getPublishableSnapshot: publishableRankingSnapshot,
});

function applySnapshot(snapshot) {
  state.view = ["day", "week", "month", "year"].includes(snapshot.view) ? snapshot.view : "day";
  state.selectedDate = snapshot.selectedDate || todayString();
  state.taxYear = Number(snapshot.taxYear) || Number(state.selectedDate.slice(0, 4)) || new Date().getFullYear();
  state.records = isPlainObject(snapshot.records) ? snapshot.records : {};
  state.targets = isPlainObject(snapshot.targets) ? snapshot.targets : {};
  state.providers = normalizeProviders(snapshot.providers, state.records);
  state.vehicles = normalizeVehicles(snapshot.vehicles);
  state.taxProfiles = normalizeTaxProfiles(snapshot.taxProfiles);
  state.assets = normalizeAssetValues(snapshot.assets);
  invalidateOdometerIndex();
}

async function readBrowserSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistBrowserSnapshot(snapshot = snapshotState()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Browser storage persistence is best-effort; users can export JSON backups separately.
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProviders(providers, records = {}) {
  const source = Array.isArray(providers) && providers.length > 0 ? providers : DEFAULT_PROVIDERS;
  const normalized = [];
  const seen = new Set();
  source.forEach((provider) => {
    const id = typeof provider?.id === "string" ? provider.id.trim() : "";
    if (!id || seen.has(id)) return;
    const label = typeof provider.label === "string" && provider.label.trim() ? provider.label.trim() : id;
    const icon = typeof provider.icon === "string" && provider.icon.trim()
      ? provider.icon.trim().slice(0, 3)
      : label.slice(0, 1).toUpperCase();
    const visible = typeof provider.visible === "boolean" ? provider.visible : id !== "wolt";
    normalized.push({ id, label, icon, visible });
    seen.add(id);
  });

  Object.values(isPlainObject(records) ? records : {}).forEach((record) => {
    Object.keys(isPlainObject(record?.services) ? record.services : {}).forEach((id) => {
      if (seen.has(id)) return;
      normalized.push({ id, label: id, icon: id.slice(0, 1).toUpperCase(), visible: false });
      seen.add(id);
    });
  });
  return normalized;
}

function normalizeVehicles(vehicles) {
  if (!Array.isArray(vehicles)) return [];
  const seen = new Set();
  return vehicles.flatMap((vehicle) => {
    const id = typeof vehicle?.id === "string" ? vehicle.id.trim() : "";
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const type = Object.hasOwn(VEHICLE_TYPES, vehicle.type) ? vehicle.type : "other";
    const label = typeof vehicle.label === "string" && vehicle.label.trim()
      ? vehicle.label.trim().slice(0, 30)
      : VEHICLE_TYPES[type].label;
    return [{ id, type, label, icon: VEHICLE_TYPES[type].icon, visible: vehicle.visible !== false }];
  });
}

function defaultAssetValues() {
  return Object.fromEntries(ASSET_FIELDS.map((field) => [field.id, 0]));
}

function normalizeAssetValues(values) {
  const source = isPlainObject(values) ? values : {};
  return Object.fromEntries(ASSET_FIELDS.map((field) => [field.id, numberValue(source[field.id])]));
}

function updateAssetValue(event) {
  const input = event.target.closest("[data-asset-field]");
  if (!input || !Object.hasOwn(state.assets, input.dataset.assetField)) return;
  state.assets[input.dataset.assetField] = numberValue(input.value);
  renderOkuMeter({ syncInputs: false });
  schedulePersist();
}

function normalizeTaxProfiles(profiles) {
  if (!isPlainObject(profiles)) return {};
  return Object.fromEntries(
    Object.entries(profiles)
      .filter(([year]) => /^\d{4}$/.test(year))
      .map(([year, profile]) => [year, normalizeTaxProfile(profile)])
  );
}

function normalizeTaxProfile(profile = {}) {
  const filingTypes = new Set(["white", "blue10", "blue55", "blue65"]);
  const employmentModes = new Set(["self_employed", "side_job"]);
  const residentPaymentMethods = new Set(["ordinary", "payroll"]);
  return {
    employmentMode: employmentModes.has(profile.employmentMode) ? profile.employmentMode : "self_employed",
    salaryRevenue: numberValue(profile.salaryRevenue),
    salaryWithholding: numberValue(profile.salaryWithholding),
    residentPaymentMethod: residentPaymentMethods.has(profile.residentPaymentMethod)
      ? profile.residentPaymentMethod
      : "ordinary",
    fileAnyway: profile.fileAnyway === true,
    region: typeof profile.region === "string" && window.DeliTaxCalculator.REGIONS[profile.region]
      ? profile.region
      : "standard",
    filingType: filingTypes.has(profile.filingType) ? profile.filingType : "white",
    otherIncome: numberValue(profile.otherIncome),
    ideco: numberValue(profile.ideco),
    mutualAid: numberValue(profile.mutualAid),
    socialInsurance: numberValue(profile.socialInsurance),
    otherDeductions: numberValue(profile.otherDeductions),
    withholding: numberValue(profile.withholding),
    includeBusinessTax: profile.includeBusinessTax !== false,
    invoiceRegistered: profile.invoiceRegistered === true,
  };
}

function taxProfileForYear(year = state.taxYear) {
  const key = String(year);
  if (!state.taxProfiles[key]) state.taxProfiles[key] = normalizeTaxProfile();
  return state.taxProfiles[key];
}

function blankRecord(date) {
  return {
    date,
    services: Object.fromEntries(state.providers.map((provider) => [provider.id, { count: 0, sales: 0 }])),
    workSessions: [],
    workHours: 0,
    workHoursOverride: 0,
    startTime: "",
    endTime: "",
    breakHours: 0,
    vehicleId: "",
    odometerKm: 0,
    distanceKm: 0,
    expenses: [],
    gasCost: 0,
    fuelLiters: 0,
    otherExpense: 0,
    memo: "",
    sourceData: {},
  };
}

function fillFormForDate(date) {
  formRevision += 1;
  const record = normalizeRecord(state.records[date] || blankRecord(date));
  els.selectedDate.value = date;

  draftServices = Object.fromEntries(
    Object.entries(record.services).map(([id, values]) => [id, { ...values }])
  );
  renderServiceButtons();

  const importedHours = numberValue(record.workHoursOverride);
  if (importedHours > 0) els.workHours.dataset.importedOverride = "true";
  else delete els.workHours.dataset.importedOverride;
  renderWorkSessionRows(record.workSessions.length > 0 ? record.workSessions : [blankWorkSession()]);
  els.workHours.value = importedHours > 0
    ? hoursValueOrEmpty(importedHours)
    : record.workSessions.length > 0
      ? ""
      : hoursValueOrEmpty(record.workHours);
  els.workHoursOverrideHint.hidden = importedHours <= 0;
  els.breakHours.value = valueOrEmpty(record.breakHours);
  renderVehicleSelect(record.vehicleId);
  els.odometerKm.value = valueOrEmpty(record.odometerKm);
  renderOdometerHint(record);
  draftExpenses = record.expenses.map((expense) => ({ ...expense }));
  renderExpenseList();
  els.memo.value = record.memo || "";
  draftSourceData = { ...record.sourceData };
  renderSourceDataSummary();
  els.monthlyTarget.value = valueOrEmpty(state.targets[monthKey(date)] || 0);
  renderDailyPreview();
  setSaveStatus("保存済み", "saved");
  formDirty = false;
}

function readFormRecord() {
  const record = blankRecord(state.selectedDate);
  record.services = Object.fromEntries(
    Object.entries(draftServices).map(([id, values]) => [id, {
      count: integerValue(values.count),
      sales: numberValue(values.sales),
    }])
  );

  record.workSessions = readWorkSessionsFromForm();
  if (record.workSessions.length === 1) {
    record.startTime = record.workSessions[0].startTime;
    record.endTime = record.workSessions[0].endTime;
  }
  record.breakHours = numberValue(els.breakHours.value);
  record.workHoursOverride = els.workHours.dataset.importedOverride === "true"
    ? numberValue(els.workHours.value)
    : 0;
  record.workHours = roundHours(calculateWorkHours(record, numberValue(els.workHours.value)));
  record.vehicleId = els.vehicleId.value;
  record.odometerKm = numberValue(els.odometerKm.value);
  record.distanceKm = calculateDailyDistance(record.date, record.odometerKm, record.vehicleId);
  record.expenses = draftExpenses.map((expense) => ({ ...expense }));
  record.gasCost = record.expenses
    .filter((expense) => expense.type === "gas")
    .reduce((sum, expense) => sum + expense.amount, 0);
  record.fuelLiters = record.expenses
    .filter((expense) => expense.type === "gas")
    .reduce((sum, expense) => sum + expense.liters, 0);
  record.otherExpense = record.expenses
    .filter((expense) => expense.type === "other")
    .reduce((sum, expense) => sum + expense.amount, 0);
  record.memo = els.memo.value.trim();
  record.sourceData = { ...draftSourceData };
  return record;
}

function renderSourceDataSummary() {
  const items = [];
  if (numberValue(draftSourceData.transferAmount) > 0) {
    items.push(`振込 ${yen(draftSourceData.transferAmount)}`);
  }
  if (numberValue(draftSourceData.odometerKm) > 0) {
    items.push(`オドメーター ${formatNumber(draftSourceData.odometerKm)}km`);
  }
  if (draftSourceData.weather) items.push(`天気 ${draftSourceData.weather}`);
  if (draftSourceData.temperatureC !== "" && draftSourceData.temperatureC !== undefined) {
    items.push(`気温 ${draftSourceData.temperatureC}℃`);
  }
  if (draftSourceData.holiday) items.push("祝日");

  els.sourceDataSummary.hidden = items.length === 0;
  els.sourceDataSummary.innerHTML = items.length > 0
    ? `<strong>元データ情報</strong><span>${items.map(escapeHtml).join(" ・ ")}</span>`
    : "";
}

function previousOdometerRecord(date, vehicleId = "") {
  const index = odometerIndex();
  const vehicleKey = vehicleId || "legacy";
  const directKey = `${vehicleKey}|${date}`;
  if (index.previousByVehicleDate.has(directKey)) return index.previousByVehicleDate.get(directKey);

  const readings = index.readingsByVehicle.get(vehicleKey) || [];
  let low = 0;
  let high = readings.length - 1;
  let found = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const item = readings[middle];
    if (item.date < date) {
      found = item;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function odometerIndex() {
  if (odometerIndexCache) return odometerIndexCache;
  const readingsByVehicle = new Map();
  const previousByVehicleDate = new Map();
  const previousByVehicle = new Map();
  Object.entries(state.records)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([date, record]) => {
      const vehicleKey = typeof record?.vehicleId === "string" && record.vehicleId ? record.vehicleId : "legacy";
      const previous = previousByVehicle.get(vehicleKey) || null;
      previousByVehicleDate.set(`${vehicleKey}|${date}`, previous);
      const value = numberValue(record?.odometerKm ?? record?.sourceData?.odometerKm);
      if (value <= 0) return;
      const item = { date, value, vehicleId: vehicleKey === "legacy" ? "" : vehicleKey };
      if (!readingsByVehicle.has(vehicleKey)) readingsByVehicle.set(vehicleKey, []);
      readingsByVehicle.get(vehicleKey).push(item);
      previousByVehicle.set(vehicleKey, item);
    });
  odometerIndexCache = { readingsByVehicle, previousByVehicleDate };
  return odometerIndexCache;
}

function invalidateOdometerIndex() {
  odometerIndexCache = null;
}

function calculateDailyDistance(date, odometerKm, vehicleId = "") {
  const current = numberValue(odometerKm);
  const previous = previousOdometerRecord(date, vehicleId);
  if (!previous || current <= 0 || current < previous.value) return 0;
  return current - previous.value;
}

function renderOdometerHint(record) {
  const current = numberValue(record.odometerKm);
  const previous = previousOdometerRecord(record.date, record.vehicleId);
  const vehicle = state.vehicles.find((item) => item.id === record.vehicleId);
  const vehiclePrefix = vehicle ? `${vehicle.label}：` : "";
  els.odometerHint.classList.remove("error");
  if (current <= 0) {
    els.odometerHint.textContent = previous
      ? `${vehiclePrefix}前回 ${formatNumber(previous.value)}km（${formatDate(previous.date)}）`
      : "前回の記録を入力すると当日分を自動計算します";
    return;
  }
  if (!previous) {
    els.odometerHint.textContent = `${vehiclePrefix}最初の走行距離として登録します`;
    return;
  }
  if (current < previous.value) {
    els.odometerHint.classList.add("error");
    els.odometerHint.textContent = `前回 ${formatNumber(previous.value)}kmより小さいため、当日分を計算できません`;
    return;
  }
  els.odometerHint.textContent = `前回 ${formatNumber(previous.value)}km → 当日分 ${formatNumber(current - previous.value)}km`;
}

function renderServiceButtons() {
  const visibleProviders = state.providers.filter((provider) => provider.visible !== false);
  if (visibleProviders.length === 0) {
    els.servicePicker.innerHTML = `<p class="settings-empty">設定画面で入力するプラットフォームを表示してください</p>`;
    return;
  }
  els.servicePicker.innerHTML = visibleProviders.map((service) => {
    const values = draftServices[service.id] || { count: 0, sales: 0 };
    const count = integerValue(values.count);
    const sales = numberValue(values.sales);
    return `
      <div class="service-card">
        <button
          class="service-select ${count > 0 || sales > 0 ? "has-value" : ""}"
          type="button"
          data-service="${escapeHtml(service.id)}"
          aria-haspopup="dialog"
          aria-controls="serviceDialog"
        >
          <span class="service-icon" aria-hidden="true">${escapeHtml(service.icon)}</span>
          <span class="service-name">${escapeHtml(service.label)}</span>
          <span class="service-values">
            <strong>${count}件</strong>
            <strong>${yen(sales)}</strong>
          </span>
        </button>
      </div>
    `;
  }).join("");
}

function openServiceDialog(serviceId, trigger) {
  const service = state.providers.find((item) => item.id === serviceId);
  if (!service) return;

  activeServiceId = service.id;
  serviceDialogTrigger = trigger;
  els.serviceDialogTitle.textContent = `${service.label} の配達記録`;
  const values = draftServices[service.id] || { count: 0, sales: 0 };
  els.serviceCount.value = valueOrEmpty(values.count);
  els.serviceSales.value = valueOrEmpty(values.sales);
  els.serviceDialog.showModal();
  requestAnimationFrame(() => {
    els.serviceCount.focus();
    els.serviceCount.select();
  });
}

function applyServiceDialog(event) {
  event.preventDefault();
  const service = state.providers.find((item) => item.id === activeServiceId);
  if (!service) return;

  draftServices[service.id] = {
    count: integerValue(els.serviceCount.value),
    sales: numberValue(els.serviceSales.value),
  };
  renderServiceButtons();
  renderDailyPreview();
  markFormDirty();
  closeServiceDialog();
}

function closeServiceDialog() {
  if (els.serviceDialog.open) els.serviceDialog.close();
}

function restoreServiceDialogFocus() {
  serviceDialogTrigger?.focus();
  serviceDialogTrigger = null;
  activeServiceId = "";
}

function openProviderDialog(providerId = "", trigger = els.addProvider) {
  const provider = state.providers.find((item) => item.id === providerId);
  editingProviderId = provider?.id || "";
  providerDialogTrigger = trigger;
  els.providerDialogTitle.textContent = provider ? "プラットフォームを編集" : "プラットフォームを追加";
  els.providerDialogSubmit.textContent = provider ? "変更を保存" : "プラットフォームを追加";
  els.providerIcon.value = provider?.icon || "";
  els.providerName.value = provider?.label || "";
  els.providerName.setCustomValidity("");
  els.providerDialog.showModal();
  requestAnimationFrame(() => {
    els.providerName.focus();
    els.providerName.select();
  });
}

function applyProviderDialog(event) {
  event.preventDefault();
  const label = els.providerName.value.trim();
  const icon = els.providerIcon.value.trim();
  if (!label || !icon) return;

  const duplicate = state.providers.some((provider) => (
    provider.id !== editingProviderId && provider.label.toLowerCase() === label.toLowerCase()
  ));
  if (duplicate) {
    els.providerName.setCustomValidity("同じ名前のプラットフォームが登録されています");
    els.providerName.reportValidity();
    return;
  }
  els.providerName.setCustomValidity("");

  const provider = state.providers.find((item) => item.id === editingProviderId);
  if (provider) {
    provider.label = label;
    provider.icon = icon;
  } else {
    const addedProvider = { id: uniqueProviderId(label), label, icon, visible: true };
    state.providers.push(addedProvider);
    draftServices[addedProvider.id] = { count: 0, sales: 0 };
  }
  renderServiceButtons();
  renderProviderSettings();
  schedulePersist();
  closeProviderDialog();
  showToast(provider ? `${label}の変更を保存しました` : `${label}を追加しました`);
}

function closeProviderDialog() {
  if (els.providerDialog.open) els.providerDialog.close();
}

function restoreProviderDialogFocus() {
  if (providerDialogTrigger?.isConnected) providerDialogTrigger.focus();
  else els.addProvider.focus();
  providerDialogTrigger = null;
  editingProviderId = "";
}

function uniqueProviderId(label) {
  const base = label
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `service-${Date.now()}`;
  let id = base;
  let suffix = 2;
  while (state.providers.some((provider) => provider.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function renderProviderSettings() {
  els.providerSettingsList.innerHTML = state.providers.map((provider) => `
    <article class="settings-item">
      <span class="settings-item-icon" aria-hidden="true">${escapeHtml(provider.icon)}</span>
      <div class="settings-item-copy">
        <strong>${escapeHtml(provider.label)}</strong>
        <span>${provider.visible !== false ? "入力欄に表示中" : "入力欄では非表示"}</span>
      </div>
      <label class="visibility-toggle">
        <input type="checkbox" data-provider-visible="${escapeHtml(provider.id)}" ${provider.visible !== false ? "checked" : ""} />
        <span>表示</span>
      </label>
      <button class="settings-edit-button" type="button" data-edit-provider="${escapeHtml(provider.id)}" aria-label="${escapeHtml(provider.label)}を編集">編集</button>
    </article>
  `).join("");
}

function toggleProviderVisibility(event) {
  const input = event.target.closest("[data-provider-visible]");
  if (!input) return;
  const provider = state.providers.find((item) => item.id === input.dataset.providerVisible);
  if (!provider) return;
  provider.visible = input.checked;
  renderServiceButtons();
  renderProviderSettings();
  schedulePersist();
  showToast(`${provider.label}を${provider.visible ? "表示" : "非表示"}にしました`);
}

function renderVehicleSelect(selectedId = els.vehicleId?.value || "") {
  const choices = state.vehicles.filter((vehicle) => vehicle.visible !== false || vehicle.id === selectedId);
  els.vehicleId.innerHTML = `
    <option value="">未選択</option>
    ${choices.map((vehicle) => `
      <option value="${escapeHtml(vehicle.id)}">${escapeHtml(`${vehicle.icon} ${vehicle.label}${vehicle.visible === false ? "（非表示）" : ""}`)}</option>
    `).join("")}
  `;
  els.vehicleId.value = choices.some((vehicle) => vehicle.id === selectedId) ? selectedId : "";
}

function renderVehicleSettings() {
  if (state.vehicles.length === 0) {
    els.vehicleSettingsList.innerHTML = `<p class="settings-empty">車両はまだ登録されていません</p>`;
    return;
  }
  els.vehicleSettingsList.innerHTML = state.vehicles.map((vehicle) => `
    <article class="settings-item">
      <span class="settings-item-icon vehicle-icon" aria-hidden="true">${escapeHtml(vehicle.icon)}</span>
      <div class="settings-item-copy">
        <strong>${escapeHtml(vehicle.label)}</strong>
        <span>${escapeHtml(VEHICLE_TYPES[vehicle.type].label)}・${vehicle.visible !== false ? "選択可能" : "非表示"}</span>
      </div>
      <label class="visibility-toggle">
        <input type="checkbox" data-vehicle-visible="${escapeHtml(vehicle.id)}" ${vehicle.visible !== false ? "checked" : ""} />
        <span>表示</span>
      </label>
      <button class="settings-edit-button" type="button" data-edit-vehicle="${escapeHtml(vehicle.id)}" aria-label="${escapeHtml(vehicle.label)}を編集">編集</button>
    </article>
  `).join("");
}

function openVehicleDialog(vehicleId = "", trigger = els.addVehicle) {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  editingVehicleId = vehicle?.id || "";
  vehicleDialogTrigger = trigger;
  els.vehicleDialogTitle.textContent = vehicle ? "車両を編集" : "車両を登録";
  els.vehicleDialogSubmit.textContent = vehicle ? "変更を保存" : "車両を登録";
  els.vehicleType.value = vehicle?.type || "motorcycle";
  els.vehicleName.value = vehicle?.label || VEHICLE_TYPES.motorcycle.label;
  els.vehicleDialog.showModal();
  requestAnimationFrame(() => {
    els.vehicleName.focus();
    els.vehicleName.select();
  });
}

function suggestVehicleName() {
  if (!editingVehicleId || !els.vehicleName.value.trim() || Object.values(VEHICLE_TYPES).some((item) => item.label === els.vehicleName.value.trim())) {
    els.vehicleName.value = VEHICLE_TYPES[els.vehicleType.value]?.label || "車両";
  }
}

function applyVehicleDialog(event) {
  event.preventDefault();
  const type = Object.hasOwn(VEHICLE_TYPES, els.vehicleType.value) ? els.vehicleType.value : "other";
  const label = els.vehicleName.value.trim();
  if (!label) return;
  const vehicle = state.vehicles.find((item) => item.id === editingVehicleId);
  if (vehicle) {
    vehicle.type = type;
    vehicle.label = label;
    vehicle.icon = VEHICLE_TYPES[type].icon;
  } else {
    state.vehicles.push({
      id: uniqueVehicleId(type),
      type,
      label,
      icon: VEHICLE_TYPES[type].icon,
      visible: true,
    });
  }
  renderVehicleSettings();
  renderVehicleSelect();
  invalidateOdometerIndex();
  schedulePersist();
  closeVehicleDialog();
  showToast(`${label}を保存しました`);
}

function uniqueVehicleId(type) {
  const base = `${type}-${Date.now()}`;
  let id = base;
  let suffix = 2;
  while (state.vehicles.some((vehicle) => vehicle.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function toggleVehicleVisibility(event) {
  const input = event.target.closest("[data-vehicle-visible]");
  if (!input) return;
  const vehicle = state.vehicles.find((item) => item.id === input.dataset.vehicleVisible);
  if (!vehicle) return;
  vehicle.visible = input.checked;
  renderVehicleSettings();
  renderVehicleSelect();
  schedulePersist();
  showToast(`${vehicle.label}を${vehicle.visible ? "表示" : "非表示"}にしました`);
}

function closeVehicleDialog() {
  if (els.vehicleDialog.open) els.vehicleDialog.close();
}

function restoreVehicleDialogFocus() {
  if (vehicleDialogTrigger?.isConnected) vehicleDialogTrigger.focus();
  else els.addVehicle.focus();
  vehicleDialogTrigger = null;
  editingVehicleId = "";
}

function renderExpenseList() {
  const total = draftExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
  els.expenseTotal.textContent = yen(total);

  if (draftExpenses.length === 0) {
    els.expenseList.innerHTML = `<p class="expense-empty">経費はまだありません</p>`;
    return;
  }

  els.expenseList.innerHTML = draftExpenses
    .map((expense, index) => {
      const isGas = expense.type === "gas";
      const detail = isGas
        ? expense.liters > 0
          ? `${formatLiters(expense.liters)}L ・ ${yen(expense.amount / expense.liters)}/L`
          : "給油量なし"
        : expense.memo || "内容メモなし（旧データ）";
      return `
        <button class="expense-item" type="button" data-edit-expense="${index}">
          <span class="expense-kind ${isGas ? "gas" : "other"}">${isGas ? "G" : "他"}</span>
          <span class="expense-item-copy">
            <strong>${isGas ? "ガソリン" : "その他"}</strong>
            <small>${escapeHtml(detail)}</small>
          </span>
          <strong class="expense-item-amount">${yen(expense.amount)}</strong>
          <span class="expense-item-arrow" aria-hidden="true">›</span>
        </button>
      `;
    })
    .join("");
}

function openExpenseDialog(index, trigger) {
  const expense = index >= 0 ? draftExpenses[index] : null;
  editingExpenseIndex = expense ? index : -1;
  expenseDialogTrigger = trigger;
  els.expenseDialogTitle.textContent = expense ? "経費を編集" : "経費を追加";
  els.expenseTypeGas.checked = !expense || expense.type === "gas";
  els.expenseTypeOther.checked = expense?.type === "other";
  els.expenseAmount.value = valueOrEmpty(expense?.amount);
  els.expenseFuelLiters.value = valueOrEmpty(expense?.liters);
  els.expenseMemo.value = expense?.memo || "";
  els.expenseDialogDelete.hidden = !expense;
  els.expenseAmount.setCustomValidity("");
  els.expenseMemo.setCustomValidity("");
  updateExpenseDialogFields();
  els.expenseDialog.showModal();
  requestAnimationFrame(() => {
    els.expenseAmount.focus();
    els.expenseAmount.select();
  });
}

function updateExpenseDialogFields() {
  const isOther = els.expenseTypeOther.checked;
  els.expenseGasFields.hidden = isOther;
  els.expenseOtherFields.hidden = !isOther;
  els.expenseMemo.required = isOther;
  if (!isOther) els.expenseMemo.setCustomValidity("");
  updateExpenseGasUnitPreview();
}

function updateExpenseGasUnitPreview() {
  const amount = numberValue(els.expenseAmount.value);
  const liters = numberValue(els.expenseFuelLiters.value);
  els.expenseGasUnitPreview.textContent = liters > 0 ? `単価：${yen(amount / liters)}/L` : "単価：-";
}

function applyExpenseDialog(event) {
  event.preventDefault();
  const type = els.expenseTypeOther.checked ? "other" : "gas";
  const amount = numberValue(els.expenseAmount.value);
  const memo = els.expenseMemo.value.trim();

  if (amount <= 0) {
    els.expenseAmount.setCustomValidity("1円以上の金額を入力してください");
    els.expenseAmount.reportValidity();
    return;
  }
  els.expenseAmount.setCustomValidity("");

  if (type === "other" && !memo) {
    els.expenseMemo.setCustomValidity("その他経費の内容を入力してください");
    els.expenseMemo.reportValidity();
    return;
  }

  const expense = normalizeExpense({
    type,
    amount,
    liters: type === "gas" ? numberValue(els.expenseFuelLiters.value) : 0,
    memo: type === "other" ? memo : "",
  });

  if (editingExpenseIndex >= 0) draftExpenses[editingExpenseIndex] = expense;
  else draftExpenses.push(expense);

  renderExpenseList();
  renderDailyPreview();
  markFormDirty();
  closeExpenseDialog();
}

function deleteExpenseFromDialog() {
  if (editingExpenseIndex < 0) return;
  if (!confirm("この経費明細を削除しますか？")) return;
  draftExpenses.splice(editingExpenseIndex, 1);
  renderExpenseList();
  renderDailyPreview();
  markFormDirty();
  closeExpenseDialog();
}

function closeExpenseDialog() {
  if (els.expenseDialog.open) els.expenseDialog.close();
}

function restoreExpenseDialogFocus() {
  if (expenseDialogTrigger?.isConnected) expenseDialogTrigger.focus();
  else els.addExpense.focus();
  expenseDialogTrigger = null;
  editingExpenseIndex = -1;
}

function blankWorkSession() {
  return { startTime: "", endTime: "" };
}

function renderWorkSessionRows(sessions) {
  const rows = sessions.length > 0 ? sessions : [blankWorkSession()];
  els.workSessions.innerHTML = rows
    .map((session, index) => {
      const normalized = normalizeWorkSession(session);
      return `
        <div class="work-session-row">
          <strong class="session-number">時間帯 ${index + 1}</strong>
          <label class="session-time-field">
            開始
            <input
              type="text"
              value="${escapeHtml(timeInputValue(normalized.startTime))}"
              inputmode="numeric"
              autocomplete="off"
              maxlength="4"
              pattern="[0-9]{3,4}"
              placeholder="例：0645"
              data-session-index="${index}"
              data-session-field="startTime"
              aria-label="時間帯 ${index + 1} の開始"
            />
          </label>
          <label class="session-time-field">
            終了
            <input
              type="text"
              value="${escapeHtml(timeInputValue(normalized.endTime))}"
              inputmode="numeric"
              autocomplete="off"
              maxlength="4"
              pattern="[0-9]{3,4}"
              placeholder="例：1200"
              data-session-index="${index}"
              data-session-field="endTime"
              aria-label="時間帯 ${index + 1} の終了"
            />
          </label>
          <button
            class="session-remove"
            type="button"
            data-remove-session="${index}"
            aria-label="時間帯 ${index + 1} を削除"
            title="時間帯 ${index + 1} を削除"
          >×</button>
        </div>
      `;
    })
    .join("");
  updateManualHoursState();
}

function readWorkSessionRows({ includeBlank = false } = {}) {
  return [...els.workSessions.querySelectorAll(".work-session-row")]
    .map((row) => ({
      startTime: row.querySelector('[data-session-field="startTime"]').value,
      endTime: row.querySelector('[data-session-field="endTime"]').value,
    }))
    .filter((session) => includeBlank || session.startTime || session.endTime);
}

function readWorkSessionsFromForm() {
  return readWorkSessionRows().map(normalizeWorkSession);
}

function updateManualHoursState() {
  const hasEnteredTime = readWorkSessionRows({ includeBlank: true })
    .some((session) => session.startTime || session.endTime);
  els.workHours.disabled = hasEnteredTime;
  els.workHours.title = hasEnteredTime ? "開始・終了時刻から自動計算します" : "";
}

function clearImportedWorkHoursOverride() {
  if (els.workHours.dataset.importedOverride !== "true") return;
  delete els.workHours.dataset.importedOverride;
  els.workHours.value = "";
  els.workHoursOverrideHint.hidden = true;
}

function addWorkSession() {
  const sessions = readWorkSessionRows({ includeBlank: true });
  sessions.push(blankWorkSession());
  clearImportedWorkHoursOverride();
  renderWorkSessionRows(sessions);
  els.workSessions.querySelector(`[data-session-index="${sessions.length - 1}"][data-session-field="startTime"]`)?.focus();
  renderDailyPreview();
  markFormDirty();
}

function removeWorkSession(index) {
  const sessions = readWorkSessionRows({ includeBlank: true });
  sessions.splice(index, 1);
  clearImportedWorkHoursOverride();
  renderWorkSessionRows(sessions.length > 0 ? sessions : [blankWorkSession()]);
  renderDailyPreview();
  markFormDirty();
}

function incompleteWorkSession() {
  return [...els.workSessions.querySelectorAll(".work-session-row")]
    .map((row, index) => {
      const startInput = row.querySelector('[data-session-field="startTime"]');
      const endInput = row.querySelector('[data-session-field="endTime"]');
      if (!startInput.value && !endInput.value) return null;
      if (startInput.value && endInput.value) return null;
      return { index, missingInput: startInput.value ? endInput : startInput };
    })
    .find(Boolean);
}

function invalidWorkSessionTime() {
  return [...els.workSessions.querySelectorAll("[data-session-field]")]
    .find((input) => input.value.trim() && !normalizeTime(input.value));
}

function overlappingWorkSessions() {
  const sessions = readWorkSessionRows()
    .map((session, index) => ({ ...normalizeWorkSession(session), index }))
    .filter((session) => session.startTime && session.endTime);

  for (let first = 0; first < sessions.length; first += 1) {
    const firstSegments = workSessionSegments(sessions[first]);
    for (let second = first + 1; second < sessions.length; second += 1) {
      const secondSegments = workSessionSegments(sessions[second]);
      const overlaps = firstSegments.some(([firstStart, firstEnd]) =>
        secondSegments.some(([secondStart, secondEnd]) =>
          Math.max(firstStart, secondStart) < Math.min(firstEnd, secondEnd)
        )
      );
      if (overlaps) return { firstIndex: sessions[first].index, secondIndex: sessions[second].index };
    }
  }

  return null;
}

function workSessionSegments(session) {
  const start = timeToMinutes(session.startTime);
  const end = timeToMinutes(session.endTime);
  if (start === end) return [];
  if (end > start) return [[start, end]];
  return [[start, 24 * 60], [0, end]].filter(([segmentStart, segmentEnd]) => segmentEnd > segmentStart);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function markFormDirty() {
  formRevision += 1;
  formDirty = true;
  setSaveStatus("未保存の変更あり", "dirty");
}

function setSaveStatus(message, status) {
  els.saveDockStatus.textContent = message;
  els.saveDockStatus.className = `save-status ${status}`;
  els.recordActionDock.hidden = status === "saved";
}

function confirmDiscardDraft(message = "未保存の入力があります。破棄して日付を移動しますか？") {
  return !formDirty || confirm(message);
}

async function saveCurrentRecord() {
  const invalidTimeInput = invalidWorkSessionTime();
  if (invalidTimeInput) {
    invalidTimeInput.setCustomValidity("0000〜2359の時刻を3〜4桁で入力してください");
    invalidTimeInput.reportValidity();
    invalidTimeInput.focus();
    showToast("稼働時間は24時間表記の3〜4桁で入力してください");
    return;
  }
  const incomplete = incompleteWorkSession();
  if (incomplete) {
    incomplete.missingInput.focus();
    showToast(`時間帯${incomplete.index + 1}の開始と終了を両方入力してください`);
    return;
  }
  const overlap = overlappingWorkSessions();
  if (overlap) {
    els.workSessions
      .querySelector(`[data-session-index="${overlap.secondIndex}"][data-session-field="startTime"]`)
      ?.focus();
    showToast(`時間帯${overlap.firstIndex + 1}と時間帯${overlap.secondIndex + 1}が重複しています`);
    return;
  }
  const saveDate = state.selectedDate;
  const revisionAtSave = formRevision;
  const record = readFormRecord();
  state.records[saveDate] = record;
  invalidateOdometerIndex();
  setSaveStatus("保存中…", "saving");

  try {
    await persist();
    render({ shouldPersist: false });
    if (state.selectedDate !== saveDate) {
      showToast(`${formatDate(saveDate)} を保存しました`);
      return;
    }
    if (formRevision !== revisionAtSave) {
      formDirty = true;
      setSaveStatus("保存後の変更あり", "dirty");
      showToast("保存後に追加した変更はまだ保存されていません");
      return;
    }
    formDirty = false;
    setSaveStatus("保存済み", "saved");
    showToast("保存しました");
  } catch {
    if (state.selectedDate === saveDate) {
      formDirty = true;
      setSaveStatus("保存に失敗", "error");
    }
    showToast(`${formatDate(saveDate)} を保存できませんでした`);
  }
}

async function clearAllData() {
  if (!confirm("すべての記録と目標売上を削除しますか？")) return;
  state.records = {};
  state.targets = {};
  invalidateOdometerIndex();
  clearTimeout(persistTimer);

  try {
    await persist();
    fillFormForDate(state.selectedDate);
    render({ shouldPersist: false });
    showToast("全データを削除しました");
  } catch {
    showToast("削除後の保存に失敗しました");
  }
}

function render(options = {}) {
  const shouldPersist = options.shouldPersist === true;

  els.selectedDate.value = state.selectedDate;
  if (["input", "summary", "plan"].includes(currentScreen)) renderPeriodControls();
  els.storageModeLabel.textContent = "この端末内だけに保存";
  els.monthlyTarget.value = valueOrEmpty(state.targets[monthKey(state.selectedDate)] || 0);
  document.querySelectorAll(".screen-tab").forEach((tab) => {
    const isActive = tab.dataset.screen === currentScreen;
    tab.classList.toggle("active", isActive);
    if (isActive) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-screen-panel]").forEach((panel) => {
    const isActive = panel.dataset.screenPanel === currentScreen;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });
  document.querySelectorAll(".view-tab").forEach((tab) => {
    const isActive = tab.dataset.view === state.view;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  document.querySelectorAll(".report-view").forEach((view) => view.classList.remove("active"));
  els[`${state.view}Report`].classList.add("active");

  renderDailyPreview();
  if (currentScreen === "meter") renderOkuMeter();
  if (currentScreen === "plan") renderPlan();
  if (currentScreen === "tax") renderTaxScreen();
  if (currentScreen === "settings") renderSettings();
  if (currentScreen === "summary") {
    renderCurrentMetrics();
    renderReports();
  } else {
    els.periodLabel.textContent = periodLabel();
  }
  if (shouldPersist) schedulePersist();
}

function renderSettings() {
  renderProviderSettings();
  renderVehicleSettings();
  renderBackupCare();
}

function setupWelcomeGuide() {
  try {
    if (localStorage.getItem(ONBOARDING_KEY) !== "done") openWelcomeGuide(false);
  } catch {
    openWelcomeGuide(false);
  }
}

function openWelcomeGuide(manual = false) {
  els.welcomeDialog.dataset.manual = manual ? "true" : "false";
  els.welcomeClose.hidden = !manual;
  if (!els.welcomeDialog.open) els.welcomeDialog.showModal();
}

function closeWelcomeGuide() {
  try {
    localStorage.setItem(ONBOARDING_KEY, "done");
  } catch {
    // The guide can still be closed when browser storage is unavailable.
  }
  els.welcomeDialog.close();
}

function renderBackupCare() {
  const hasRecords = Object.keys(state.records).length > 0;
  let lastBackup = null;
  try {
    const saved = localStorage.getItem(LAST_BACKUP_KEY);
    if (saved) lastBackup = new Date(saved);
  } catch {
    // Keep the general reminder when local storage cannot be read.
  }

  els.backupCareCard.classList.remove("attention", "complete");
  if (!hasRecords) {
    els.backupCareTitle.textContent = "記録はこの端末内に保存されます";
    els.backupCareMessage.textContent = "記録を始めたら、月1回を目安にバックアップしてください。";
    return;
  }
  if (!lastBackup || Number.isNaN(lastBackup.getTime())) {
    els.backupCareCard.classList.add("attention");
    els.backupCareTitle.textContent = "最初のバックアップがおすすめです";
    els.backupCareMessage.textContent = "機種変更やサイトデータ削除に備えて、下のボタンから保存してください。";
    return;
  }

  const elapsedDays = Math.floor((Date.now() - lastBackup.getTime()) / 86_400_000);
  if (elapsedDays >= 30) {
    els.backupCareCard.classList.add("attention");
    els.backupCareTitle.textContent = "前回から30日以上経っています";
    els.backupCareMessage.textContent = `最終バックアップ：${lastBackup.toLocaleDateString("ja-JP")}。新しいファイルを保存しましょう。`;
    return;
  }

  els.backupCareCard.classList.add("complete");
  els.backupCareTitle.textContent = "バックアップ済みです";
  els.backupCareMessage.textContent = `最終バックアップ：${lastBackup.toLocaleDateString("ja-JP")}（${elapsedDays}日前）`;
}

function updateTaxProfileFromForm() {
  const profile = taxProfileForYear();
  profile.employmentMode = els.taxEmploymentMode.value;
  profile.salaryRevenue = numberValue(els.taxSalaryRevenue.value);
  profile.salaryWithholding = numberValue(els.taxSalaryWithholding.value);
  profile.residentPaymentMethod = els.taxResidentPaymentMethod.value;
  profile.fileAnyway = els.taxFileAnyway.checked;
  profile.region = els.taxRegion.value;
  profile.filingType = els.taxFilingType.value;
  profile.otherIncome = numberValue(els.taxOtherIncome.value);
  profile.ideco = numberValue(els.taxIdeco.value);
  profile.mutualAid = numberValue(els.taxMutualAid.value);
  profile.socialInsurance = numberValue(els.taxSocialInsurance.value);
  profile.otherDeductions = numberValue(els.taxOtherDeductions.value);
  profile.withholding = numberValue(els.taxWithholding.value);
  profile.includeBusinessTax = els.taxIncludeBusinessTax.checked;
  profile.invoiceRegistered = els.taxInvoiceRegistered.checked;
  renderTaxEmploymentFields(profile);
  renderTaxResults();
  schedulePersist();
}

function renderTaxScreen() {
  renderTaxYearOptions();
  renderTaxRegionOptions();
  const profile = taxProfileForYear();
  els.taxEmploymentMode.value = profile.employmentMode;
  els.taxSalaryRevenue.value = valueOrEmpty(profile.salaryRevenue);
  els.taxSalaryWithholding.value = valueOrEmpty(profile.salaryWithholding);
  els.taxResidentPaymentMethod.value = profile.residentPaymentMethod;
  els.taxFileAnyway.checked = profile.fileAnyway;
  els.taxRegion.value = profile.region;
  els.taxFilingType.value = profile.filingType;
  els.taxOtherIncome.value = valueOrEmpty(profile.otherIncome);
  els.taxIdeco.value = valueOrEmpty(profile.ideco);
  els.taxMutualAid.value = valueOrEmpty(profile.mutualAid);
  els.taxSocialInsurance.value = valueOrEmpty(profile.socialInsurance);
  els.taxOtherDeductions.value = valueOrEmpty(profile.otherDeductions);
  els.taxWithholding.value = valueOrEmpty(profile.withholding);
  els.taxIncludeBusinessTax.checked = profile.includeBusinessTax;
  els.taxInvoiceRegistered.checked = profile.invoiceRegistered;
  renderTaxEmploymentFields(profile);
  renderTaxResults();
}

function renderTaxEmploymentFields(profile) {
  const isSideJob = profile.employmentMode === "side_job";
  els.taxSalaryRevenueField.hidden = !isSideJob;
  els.taxSalaryWithholdingField.hidden = !isSideJob;
  els.taxResidentPaymentField.hidden = !isSideJob;
  els.taxFileAnywayRow.hidden = !isSideJob;
  els.taxOtherIncomeLabel.textContent = isSideJob ? "配達・給与以外の所得" : "配達以外の所得";
  els.taxOtherIncomeHint.textContent = isSideJob
    ? "年金、不動産などがあれば、収入ではなく所得金額を入力します。"
    : "給与なら収入額ではなく、給与所得控除後の所得金額を入力します。";
  els.taxSocialInsuranceHint.textContent = isSideJob
    ? "源泉徴収票の社会保険料など、その年に支払った合計です。iDeCo等との二重入力に注意してください。"
    : "国民健康保険、国民年金など、その年に支払った合計です。";
  els.taxWithholdingLabel.textContent = isSideJob ? "副業側の源泉徴収・予定納税済み" : "源泉徴収・予定納税済み";
  els.taxWithholdingHint.textContent = isSideJob
    ? "配達報酬などで差し引かれた所得税や予定納税です。本業分は上の欄へ入力します。"
    : "すでに納めた所得税があれば入力します。";
  const salaryIncome = window.DeliTaxCalculator.salaryIncomeFromRevenue
    ? window.DeliTaxCalculator.salaryIncomeFromRevenue(profile.salaryRevenue, state.taxYear)
    : 0;
  els.taxSalaryIncomePreview.textContent = yen(salaryIncome);
}

function renderTaxRegionOptions() {
  els.taxRegion.innerHTML = window.DeliTaxCalculator.REGION_DEFINITIONS
    .map((region) => `<option value="${escapeHtml(region.id)}">${escapeHtml(region.label)}</option>`)
    .join("");
}

function renderTaxYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = new Set([
    currentYear,
    currentYear - 1,
    currentYear - 2,
    state.taxYear,
    ...yearsWithRecords(),
  ]);
  const options = [...years]
    .filter((year) => Number.isFinite(year) && year >= 2020 && year <= currentYear)
    .sort((left, right) => right - left);
  els.taxYear.innerHTML = options.map((year) => `<option value="${year}">${year}年分</option>`).join("");
  els.taxYear.value = String(state.taxYear);
}

function renderTaxResults() {
  const year = Number(state.taxYear) || new Date().getFullYear();
  const profile = taxProfileForYear(year);
  const annualSummary = summarizeRecords(recordsInYear(year));
  const estimate = window.DeliTaxCalculator.calculateTaxEstimate({
    year,
    sales: annualSummary.sales,
    expenses: annualSummary.expense,
    ...profile,
  });
  const isSideJob = profile.employmentMode === "side_job";
  const usesOrdinaryCollection = profile.residentPaymentMethod === "ordinary";

  els.taxAnnualSales.textContent = yen(estimate.sales);
  els.taxAnnualExpenses.textContent = yen(estimate.expenses);
  els.taxAnnualProfit.textContent = yen(estimate.deliveryProfit);
  els.taxTotalLabel.textContent = isSideJob ? "確定申告などで別途納める見込み" : "年間の税負担概算";
  els.taxTotalBurden.textContent = yen(isSideJob ? estimate.additionalPayment : estimate.annualTaxBurden);
  els.taxMonthlyReserve.textContent = `これからの積立目安 月 ${yen(estimate.monthlyReserve)}`;
  els.taxSalaryIncomeRow.hidden = !isSideJob;
  els.taxCompanyHandledRow.hidden = !isSideJob;
  els.taxIncrementalBurdenRow.hidden = !isSideJob;
  els.taxIncrementalBurdenLabel.textContent = isSideJob && !estimate.incomeTaxReturnRequired && !profile.fileAnyway
    ? "確定申告した場合の税負担増（参考）"
    : "給与以外で増える年間税負担";
  els.taxSalaryIncome.textContent = yen(estimate.salaryIncome || 0);
  els.taxCompanyHandled.textContent = yen(profile.salaryWithholding);
  els.taxIncrementalBurden.textContent = yen(estimate.incrementalTaxBurden || 0);
  els.taxTaxableIncomeLabel.textContent = isSideJob ? "合算後の課税所得（所得税）" : "課税所得（所得税）";
  els.taxTaxableIncome.textContent = yen(estimate.taxableIncome);
  els.taxIncomeTaxLabel.textContent = isSideJob ? "給与以外で増える所得税" : "所得税";
  els.taxIncomeTax.textContent = yen(isSideJob ? estimate.incomeTaxIncrement : estimate.incomeTax);
  els.taxReconstructionTaxLabel.textContent = isSideJob ? "給与以外で増える復興特別所得税" : "復興特別所得税";
  els.taxReconstructionTax.textContent = yen(isSideJob ? estimate.reconstructionIncrement : estimate.reconstructionTax);
  els.taxResidentTaxLabel.textContent = isSideJob ? "給与以外で増える住民税" : "住民税の概算";
  els.taxResidentTax.textContent = yen(isSideJob ? estimate.residentTaxIncrement : estimate.residentTax);
  els.taxBusinessTax.textContent = profile.includeBusinessTax ? yen(estimate.businessTax) : "対象外";
  els.taxAdditionalPaymentLabel.textContent = isSideJob && !usesOrdinaryCollection
    ? "申告・事業税で別途納める見込み"
    : "これから別途納める見込み";
  els.taxAdditionalPayment.textContent = yen(estimate.additionalPayment);
  els.taxBlueDeduction.textContent = yen(estimate.blueDeduction);
  els.taxBasicDeduction.textContent = yen(estimate.basicDeduction);
  els.taxEnteredDeductions.textContent = yen(estimate.commonDeductions);
  els.taxResidentRate.textContent = `${(estimate.residentIncomeRate * 100).toFixed(3)}%`;
  els.taxResidentFixed.textContent = yen(estimate.residentStandardPerCapita + estimate.forestEnvironmentTax);
  const regionalIncomeExtra = Math.floor(estimate.residentTaxableIncome * estimate.region.incomeRateExtra);
  els.taxRegionalExtra.textContent = yen(estimate.regionalFixedExtra + regionalIncomeExtra);
  els.taxRegionNote.innerHTML = estimate.region.id === "standard"
    ? `地域が未選択のため、住民税は標準税率で計算しています。市区町村による独自課税は含みません。${isSideJob ? "給与のみとの差額を副業分としています。" : ""}個人事業税は配達・運送業の標準税率5%で概算します。`
    : `<strong>${escapeHtml(estimate.region.label)}</strong>の住民税上乗せを反映中です。${isSideJob ? "給与のみの場合との差額を副業分としています。" : ""}個人事業税は配達・運送業の標準税率5%で概算します。独自の減免・税額控除などにより通知額とは異なる場合があります。`;

  const canReceiveRefund = !isSideJob || estimate.incomeTaxReturnRequired || profile.fileAnyway;
  els.taxRefundMessage.hidden = estimate.incomeTaxRefund <= 0 || !canReceiveRefund;
  els.taxRefundMessage.textContent = estimate.incomeTaxRefund > 0 && canReceiveRefund
    ? `源泉徴収・予定納税を精算すると、所得税は約${yen(estimate.incomeTaxRefund)}の還付見込みです。`
    : "";
  if (isSideJob) {
    els.taxResultSubtitle.textContent = profile.salaryWithholding > 0
      ? "源泉徴収票の税額を差し引き、会社で精算済みの給与分を二重計上していません。"
      : "本業の源泉徴収税額が0円または未入力です。源泉徴収票がある場合は入力すると精度が上がります。";
    const willFile = estimate.incomeTaxReturnRequired || profile.fileAnyway;
    els.taxFilingStatus.classList.toggle("needs-filing", willFile);
    els.taxFilingStatus.textContent = estimate.incomeTaxReturnRequired
      ? "所得税の確定申告が必要になる見込みです。給与と配達を合算して申告します。"
      : profile.fileAnyway
        ? "副業所得は20万円以下ですが、確定申告する設定で税額を計算しています。"
        : "副業所得が20万円以下のため、所得税の確定申告は原則不要の見込みです。住民税の申告は別途必要です。";
  } else {
    els.taxResultSubtitle.textContent = profile.withholding > 0
      ? "源泉徴収・予定納税済みの金額も精算しています。"
      : "入力内容を反映した概算です。";
    els.taxFilingStatus.classList.toggle("needs-filing", estimate.incomeTaxGross > 0);
    els.taxFilingStatus.textContent = estimate.incomeTaxGross > 0
      ? "所得税の確定申告が必要になる見込みです。"
      : estimate.totalIncome > 0
        ? "所得税は0円の見込みです。住民税申告や青色申告の要件は別途確認してください。"
        : "現在の記録と入力では所得税は発生しない見込みです。";
  }

  renderTaxSchedule(year);
  if (isSideJob && !estimate.incomeTaxReturnRequired && !profile.fileAnyway) {
    els.taxIncomeDeadline.textContent = "所得税の申告は原則不要見込み（住民税申告は別途）";
  }
  if (isSideJob && !usesOrdinaryCollection) {
    els.taxResidentSchedule.textContent = `${year + 1}年6月以降、給与天引きに合算される見込み`;
  }
  renderConsumptionTaxStatus(year, profile.invoiceRegistered);
}

function renderTaxSchedule(year) {
  const filingDeadline = adjustedMarchDeadline(year + 1);
  els.taxIncomeDeadline.textContent = `${formatJapaneseDate(filingDeadline)}までに確定申告・原則納付`;
  els.taxResidentSchedule.textContent = `${year + 1}年6月・8月・10月、${year + 2}年1月が一般的`;
  els.taxBusinessSchedule.textContent = `${year + 1}年8月・11月が一般的（対象者のみ）`;
}

function adjustedMarchDeadline(year) {
  const deadline = new Date(year, 2, 15);
  if (deadline.getDay() === 6) deadline.setDate(17);
  if (deadline.getDay() === 0) deadline.setDate(16);
  return deadline;
}

function formatJapaneseDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function renderConsumptionTaxStatus(year, invoiceRegistered) {
  const baseYear = year - 2;
  const baseSummary = summarizeRecords(recordsInYear(baseYear));
  const hasBaseRecords = recordsInYear(baseYear).length > 0;

  if (invoiceRegistered) {
    els.taxConsumptionStatus.innerHTML = `<strong>消費税の申告が必要です。</strong> インボイス登録中は、売上が1,000万円以下でも申告対象です。`;
    return;
  }
  if (hasBaseRecords && baseSummary.sales > 10_000_000) {
    els.taxConsumptionStatus.innerHTML = `<strong>消費税の申告が必要になる見込みです。</strong> ${baseYear}年の記録済み売上が${yen(baseSummary.sales)}で、1,000万円を超えています。`;
    return;
  }
  if (hasBaseRecords) {
    els.taxConsumptionStatus.innerHTML = `${baseYear}年の記録済み売上は${yen(baseSummary.sales)}です。1,000万円以下なら原則免税ですが、前年上半期の売上や届出状況によって申告が必要な場合があります。`;
    return;
  }
  els.taxConsumptionStatus.innerHTML = `${baseYear}年の記録がないため自動判定できません。前々年の課税売上が1,000万円超、前年上半期が一定条件で1,000万円超、またはインボイス登録中なら申告が必要です。`;
}

function openPeriodPicker() {
  const selected = new Date(`${state.selectedDate}T00:00:00`);
  periodPickerCursor = Number.isNaN(selected.getTime()) ? new Date() : selected;
  els.periodPickerDialog.dataset.type = activePeriodType();
  renderPeriodPicker();
  if (!els.periodPickerDialog.open) els.periodPickerDialog.showModal();
}

function closePeriodPicker() {
  if (els.periodPickerDialog.open) els.periodPickerDialog.close();
}

function movePeriodPickerCursor(direction) {
  const type = els.periodPickerDialog.dataset.type || activePeriodType();
  periodPickerCursor.setDate(1);
  if (type === "day" || type === "week") periodPickerCursor.setMonth(periodPickerCursor.getMonth() + direction);
  if (type === "month") periodPickerCursor.setFullYear(periodPickerCursor.getFullYear() + direction);
  if (type === "year") periodPickerCursor.setFullYear(periodPickerCursor.getFullYear() + direction * 12);
  renderPeriodPicker();
}

function renderPeriodPicker() {
  const type = els.periodPickerDialog.dataset.type || activePeriodType();
  const year = periodPickerCursor.getFullYear();
  const month = periodPickerCursor.getMonth();
  const typeLabels = { day: "日付", week: "週", month: "月", year: "年" };
  els.periodPickerTitle.textContent = `${typeLabels[type]}を選択`;
  els.periodPickerPrev.setAttribute("aria-label", `前の${typeLabels[type]}`);
  els.periodPickerNext.setAttribute("aria-label", `次の${typeLabels[type]}`);

  if (type === "day") {
    els.periodPickerHeading.textContent = `${year}年${month + 1}月`;
    els.periodPickerOptions.innerHTML = dayPickerMarkup(year, month);
    return;
  }
  if (type === "week") {
    els.periodPickerHeading.textContent = `${year}年${month + 1}月の週`;
    els.periodPickerOptions.innerHTML = weekPickerMarkup(year, month);
    return;
  }
  if (type === "month") {
    els.periodPickerHeading.textContent = `${year}年`;
    els.periodPickerOptions.innerHTML = monthPickerMarkup(year);
    return;
  }

  const firstYear = Math.floor(year / 12) * 12;
  const lastYear = firstYear + 11;
  els.periodPickerHeading.textContent = `${firstYear}–${lastYear}年`;
  els.periodPickerOptions.innerHTML = yearPickerMarkup(firstYear);
}

function dayPickerMarkup(year, month) {
  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const buttons = [
    ...Array.from({ length: leadingDays }, () => `<span class="period-day-spacer" aria-hidden="true"></span>`),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = toDateInput(new Date(year, month, day));
      const isSelected = date === state.selectedDate;
      return `
        <button class="period-option${isSelected ? " is-selected" : ""}" type="button" data-period-date="${date}"${isSelected ? ' aria-current="date"' : ""}>
          ${day}
        </button>
      `;
    }),
  ];
  return `
    <div class="period-calendar-weekdays" aria-hidden="true">
      ${weekdays.map((weekday) => `<span>${weekday}</span>`).join("")}
    </div>
    <div class="period-calendar-grid">${buttons.join("")}</div>
  `;
}

function weekPickerMarkup(year, month) {
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const firstWeekStart = weekRange(monthStart).start;
  const lastDay = new Date(year, month + 1, 0);
  const selectedWeek = weekInputValue(state.selectedDate);
  const weeks = [];
  const cursor = new Date(`${firstWeekStart}T00:00:00`);

  while (cursor <= lastDay) {
    const start = toDateInput(cursor);
    const range = weekRange(start);
    const weekValue = weekInputValue(start);
    const isSelected = weekValue === selectedWeek;
    weeks.push(`
      <button class="period-option period-week-option${isSelected ? " is-selected" : ""}" type="button" data-period-date="${start}"${isSelected ? ' aria-current="date"' : ""}>
        <span>${shortDateRange(range.start, range.end)}</span>
        <small>${weekValue.replace("-W", "年 第")}週</small>
      </button>
    `);
    cursor.setDate(cursor.getDate() + 7);
  }

  return `<div class="period-week-list">${weeks.join("")}</div>`;
}

function monthPickerMarkup(year) {
  const selectedMonth = monthKey(state.selectedDate);
  return `
    <div class="period-month-grid">
      ${Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0");
        const key = `${year}-${month}`;
        const isSelected = key === selectedMonth;
        return `<button class="period-option${isSelected ? " is-selected" : ""}" type="button" data-period-date="${key}-01"${isSelected ? ' aria-current="date"' : ""}>${index + 1}月</button>`;
      }).join("")}
    </div>
  `;
}

function yearPickerMarkup(firstYear) {
  const selectedYear = Number(state.selectedDate.slice(0, 4));
  return `
    <div class="period-year-grid">
      ${Array.from({ length: 12 }, (_, index) => firstYear + index).map((year) => {
        const isSelected = year === selectedYear;
        return `<button class="period-option${isSelected ? " is-selected" : ""}" type="button" data-period-date="${year}-01-01"${isSelected ? ' aria-current="date"' : ""}>${year}年</button>`;
      }).join("")}
    </div>
  `;
}

function selectPeriodFromPicker(event) {
  const button = event.target.closest("[data-period-date]");
  if (!button) return;
  if (changeSelectedPeriod(button.dataset.periodDate)) closePeriodPicker();
}

function periodPickerDisplayValue(type) {
  if (type === "day") return formatDate(state.selectedDate);
  if (type === "week") {
    const range = weekRange(state.selectedDate);
    return shortDateRange(range.start, range.end);
  }
  if (type === "month") return `${state.selectedDate.slice(0, 4)}年${Number(state.selectedDate.slice(5, 7))}月`;
  return `${state.selectedDate.slice(0, 4)}年`;
}

function changeSelectedPeriod(date) {
  if (!confirmDiscardDraft()) {
    renderPeriodControls();
    return false;
  }
  state.selectedDate = date;
  fillFormForDate(state.selectedDate);
  render();
  return true;
}

function jumpToInputDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !confirmDiscardDraft()) return;
  state.selectedDate = date;
  currentScreen = "input";
  fillFormForDate(state.selectedDate);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function activePeriodType() {
  if (currentScreen === "input") return "day";
  if (currentScreen === "plan") return "month";
  return state.view;
}

function renderPeriodControls() {
  const host = currentScreen === "input"
    ? els.inputPeriodHost
    : currentScreen === "summary"
      ? els.summaryPeriodHost
      : els.planPeriodHost;
  if (els.periodControls.parentElement !== host) host.appendChild(els.periodControls);

  const type = activePeriodType();
  els.selectedDate.hidden = true;
  els.selectedWeekControl.hidden = true;
  els.selectedMonth.hidden = true;
  els.selectedYear.hidden = true;
  els.periodLabel.hidden = true;
  els.selectedDate.value = state.selectedDate;
  els.selectedWeek.value = weekInputValue(state.selectedDate);
  const selectedWeekRange = weekRange(state.selectedDate);
  els.selectedWeekRange.textContent = `${formatDate(selectedWeekRange.start)} ～ ${formatDate(selectedWeekRange.end)}`;
  els.selectedMonth.value = monthKey(state.selectedDate);
  renderYearOptions();
  els.selectedYear.value = state.selectedDate.slice(0, 4);
  const pickerValue = periodPickerDisplayValue(type);
  els.periodPickerValue.textContent = pickerValue;
  els.periodPickerButton.setAttribute("aria-label", `${pickerValue}。${{ day: "日付", week: "週", month: "月", year: "年" }[type]}を選択`);
  els.loadToday.textContent = {
    day: "今日へ戻る",
    week: "今週へ戻る",
    month: "今月へ戻る",
    year: "今年へ戻る",
  }[type];
}

function renderYearOptions() {
  const selectedYear = Number(state.selectedDate.slice(0, 4));
  const currentYear = new Date().getFullYear();
  const years = [...new Set([...yearsWithRecords(), selectedYear, currentYear])].sort((left, right) => right - left);
  els.selectedYear.innerHTML = years
    .map((year) => `<option value="${year}">${year}年</option>`)
    .join("");
}

function renderDailyPreview() {
  const record = readFormRecord();
  const total = summarizeRecords([record]);
  els.dailySales.textContent = yen(total.sales);
  els.dailyProfit.textContent = yen(total.profit);
  els.dailyExpense.textContent = yen(total.expense);
  els.dailyWorkHours.textContent = formatHours(total.workHours);
  els.dailyHourly.textContent = yen(total.hourly);
  els.dailyGasUnit.textContent = total.gasUnit > 0 ? `${yen(total.gasUnit)}/L` : "-";
  els.dailyKmUnit.textContent = total.kmUnit > 0 ? `${yen(total.kmUnit)}/km` : "-";
  renderOdometerHint(record);
}

function renderCurrentMetrics() {
  const summary = getSummaryForView(state.view);
  const target = targetForView(state.view, state.selectedDate);
  const achievement = target > 0 ? summary.sales / target : 0;

  els.metricSales.textContent = yen(summary.sales);
  els.metricProfit.textContent = yen(summary.profit);
  els.metricHourly.textContent = yen(summary.hourly);
  renderAchievement(els.metricAchievement, achievement, target > 0);
  els.metricTargetSales.textContent = `目標売上：${yen(target)}`;
}

function renderOkuMeter(options = {}) {
  const syncInputs = options.syncInputs !== false;
  const records = allRecordedRecords();
  const lifetimeSales = summarizeRecords(records).sales;
  const totalAssets = ASSET_FIELDS
    .filter((field) => !field.liability)
    .reduce((sum, field) => sum + numberValue(state.assets[field.id]), 0);
  const liabilities = numberValue(state.assets.liabilities);
  const netAssets = totalAssets - liabilities;
  const progress = Math.max(netAssets, 0) / OKU_METER_GOAL;
  const progressPercent = progress * 100;
  const visualPercent = Math.min(Math.max(progressPercent, 0), 100);
  const percentLabel = formatOkuMeterPercent(progressPercent);
  const nextMilestone = OKU_METER_MILESTONES.find((milestone) => netAssets < milestone);

  renderAssetInputs(syncInputs);

  els.okuMeterGauge.style.setProperty("--meter-progress", `${visualPercent}%`);
  els.okuMeterGauge.setAttribute("aria-label", `1億円への達成率 ${percentLabel}、純資産 ${assetYen(netAssets)}`);
  els.okuMeterPercent.textContent = percentLabel;
  els.okuMeterNetAssets.textContent = assetYen(netAssets);
  els.okuMeterRail.style.width = `${visualPercent}%`;
  els.okuMeterRemaining.textContent = assetYen(Math.max(OKU_METER_GOAL - netAssets, 0));
  els.okuMeterTotalAssets.textContent = assetYen(totalAssets);
  els.okuMeterLiabilities.textContent = assetYen(liabilities);
  els.okuMeterLifetimeSales.textContent = yen(lifetimeSales);
  els.assetSummaryTotal.textContent = assetYen(totalAssets);
  els.assetSummaryLiabilities.textContent = `− ${assetYen(liabilities)}`;
  els.assetSummaryNet.textContent = assetYen(netAssets);
  els.okuMeterMessage.textContent = okuMeterMessage(netAssets, progress);
  els.okuMeterPeriod.textContent = `総資産 ${assetYen(totalAssets)} から負債 ${assetYen(liabilities)} を引いた、この端末の純資産を集計。`;

  els.okuMeterMilestones.querySelectorAll("[data-milestone]").forEach((item) => {
    const achieved = netAssets >= Number(item.dataset.milestone);
    item.classList.toggle("is-achieved", achieved);
    item.setAttribute("aria-label", `${item.textContent.trim()} ${achieved ? "達成" : "未達成"}`);
  });

  if (nextMilestone) {
    const labels = { 1000000: "最初の100万円", 10000000: "1,000万円", 50000000: "5,000万円", 100000000: "1億円" };
    els.okuMeterNext.textContent = `${labels[nextMilestone]}まであと${assetYen(nextMilestone - netAssets)}`;
  } else {
    els.okuMeterNext.textContent = `1億円を達成。現在 ${assetYen(netAssets)}`;
  }
}

function renderAssetInputs(syncValues = true) {
  if (!els.assetInputs.childElementCount) {
    els.assetInputs.innerHTML = ASSET_FIELDS.map((field) => `
      <label class="asset-input-card${field.liability ? " is-liability" : ""}">
        <span class="asset-input-copy">
          <i aria-hidden="true">${field.icon}</i>
          <span><strong>${field.label}</strong><small>${field.hint}</small></span>
        </span>
        <span class="asset-money-input"><b>¥</b><input type="number" min="0" step="10000" inputmode="numeric" data-asset-field="${field.id}" aria-label="${field.label}の現在額" /></span>
      </label>
    `).join("");
  }
  if (!syncValues) return;
  els.assetInputs.querySelectorAll("[data-asset-field]").forEach((input) => {
    input.value = valueOrEmpty(state.assets[input.dataset.assetField]);
  });
}

function allRecordedRecords() {
  return Object.entries(state.records)
    .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map(([date, record]) => normalizeRecord({ ...(isPlainObject(record) ? record : {}), date }));
}

function assetYen(value) {
  const numeric = Number(value);
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Math.round(Number.isFinite(numeric) ? numeric : 0));
}

function formatOkuMeterPercent(value) {
  const numeric = Math.max(Number(value) || 0, 0);
  const digits = numeric < 1 ? 3 : numeric < 10 ? 2 : 1;
  return `${new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric)}%`;
}

function okuMeterMessage(netAssets, progress) {
  if (netAssets < 0) return "まずは純資産をプラスへ。ここから反転する。";
  if (netAssets === 0) return "最初の1円が、1億へのスタート。";
  if (progress < 0.01) return "まずは100万円。積み上げはもう始まっている。";
  if (progress < 0.1) return "数字が、挑戦の輪郭をつくっていく。";
  if (progress < 0.5) return "次の桁へ。今日の積み上げを止めない。";
  if (progress < 1) return "1億円が、現実的な距離になってきた。";
  return "1億円、到達。積み上げた数字が証明になった。";
}

function renderPlan() {
  const key = monthKey(state.selectedDate);
  const target = state.targets[key] || 0;
  const records = recordsInMonth(key);
  const summary = summarizeRecords(records);
  const plan = calculatePlan(key, target, summary);

  renderAchievement(els.planPercent, plan.achievement, target > 0);
  els.planProgress.style.width = `${Math.min(plan.achievement * 100, 100)}%`;
  els.planRemaining.textContent = yen(plan.remaining);
  els.planDailyNeed.textContent = yen(plan.dailyNeed);
  els.planWeeklyNeed.textContent = yen(plan.weeklyNeed);
  els.planForecast.textContent = yen(plan.forecast);
  els.planNeededCount.textContent = `${formatNumber(plan.neededCount)}件`;
}

function renderReports() {
  els.reportTitle.textContent = {
    day: "集計",
    week: "週別集計",
    month: "月別集計",
    year: "年別集計",
  }[state.view];

  renderDayReport();
  renderWeekReport();
  renderMonthReport();
  renderYearReport();
  els.periodLabel.textContent = periodLabel();
}

function renderDayReport() {
  const record = normalizeRecord(state.records[state.selectedDate] || blankRecord(state.selectedDate));
  const summary = summarizeRecords([record]);
  const vehicle = state.vehicles.find((item) => item.id === record.vehicleId);
  const key = monthKey(state.selectedDate);
  const [year, month] = key.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailySales = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${key}-${String(day).padStart(2, "0")}`;
    return {
      label: `${day}日`,
      value: summarizeRecords([normalizeRecord(state.records[date] || blankRecord(date))]).sales,
      selected: date === state.selectedDate,
      date,
    };
  });
  els.dayReport.innerHTML = `
    ${summaryGrid(summary, targetForDay(state.selectedDate))}
    ${serviceSummaryGrid(summary)}
    ${timeBandAnalysisMarkup([record])}
    ${barChart(
      `${year}年${month}月 日別売上`,
      dailySales,
      { variant: "days", selectedLabel: formatDate(state.selectedDate), interactive: true }
    )}
    <div class="day-list">
      ${lineItem("日付", formatDate(state.selectedDate), [
        ["総売上", yen(summary.sales)],
        ["件数", `${summary.count}件`],
        ["稼働時間", formatHours(summary.workHours)],
        ["車両", vehicle?.label || "-"],
        ["km単価（売上）", summary.kmUnit > 0 ? `${yen(summary.kmUnit)}/km` : "-"],
        ["ガソリン単価", summary.gasUnit > 0 ? `${yen(summary.gasUnit)}/L` : "-"],
      ])}
    </div>
    ${expenseReportMarkup(record.expenses)}
    ${record.memo ? `<p class="empty-state">メモ: ${escapeHtml(record.memo)}</p>` : ""}
  `;

  requestAnimationFrame(() => centerSelectedChartItem(els.dayReport));
}

function expenseReportMarkup(expenses) {
  if (!expenses.length) return "";
  return `
    <section class="expense-report-block">
      <h3>経費明細</h3>
      <div class="expense-report-list">
        ${expenses.map((expense) => {
          const detail = expense.type === "gas"
            ? expense.liters > 0 ? `${formatLiters(expense.liters)}L` : "給油量なし"
            : expense.memo || "内容メモなし（旧データ）";
          return `
            <div class="expense-report-item">
              <span>${expense.type === "gas" ? "ガソリン" : "その他"}・${escapeHtml(detail)}</span>
              <strong>${yen(expense.amount)}</strong>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderWeekReport() {
  const { start, end } = weekRange(state.selectedDate);
  const days = datesBetween(start, end);
  const records = days.map((date) => normalizeRecord(state.records[date] || blankRecord(date)));
  const summary = summarizeRecords(records);
  const selectedWeek = weekInputValue(state.selectedDate);
  const weekYear = Number(selectedWeek.slice(0, 4));
  const selectedWeekNumber = Number(selectedWeek.slice(6));
  const weekSummaries = Array.from({ length: isoWeeksInYear(weekYear) }, (_, index) => {
    const weekNumber = index + 1;
    const weekStart = dateFromWeekInput(`${weekYear}-W${String(weekNumber).padStart(2, "0")}`);
    const range = weekRange(weekStart);
    return {
      label: shortDateRange(range.start, range.end),
      value: summarizeRecords(recordsBetween(range.start, range.end)).sales,
      selected: weekNumber === selectedWeekNumber,
    };
  });

  els.weekReport.innerHTML = `
    ${summaryGrid(summary, targetForWeek(state.selectedDate))}
    ${timeBandAnalysisMarkup(records)}
    ${barChart(
      `${weekYear}年 週別売上`,
      weekSummaries,
      { variant: "weeks", selectedLabel: `${formatDate(start)} ～ ${formatDate(end)}` }
    )}
  `;

  requestAnimationFrame(() => centerSelectedChartItem(els.weekReport));
}

function renderMonthReport() {
  const key = monthKey(state.selectedDate);
  const records = recordsInMonth(key);
  const summary = summarizeRecords(records);
  const year = Number(key.slice(0, 4));
  const previousYear = year - 1;
  const monthComparisons = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return {
      label: `${index + 1}月`,
      current: summarizeRecords(recordsInMonth(`${year}-${month}`)).sales,
      previous: summarizeRecords(recordsInMonth(`${previousYear}-${month}`)).sales,
    };
  });

  els.monthReport.innerHTML = `
    ${summaryGrid(summary, state.targets[key] || 0)}
    ${serviceSummaryGrid(summary)}
    ${timeBandAnalysisMarkup(records)}
    ${comparisonBarChart(
      `${year}年 月別売上（前年比較）`,
      monthComparisons,
      { currentLabel: `${year}年`, previousLabel: `${previousYear}年` }
    )}
  `;
}

function renderYearReport() {
  const year = new Date(`${state.selectedDate}T00:00:00`).getFullYear();
  const records = recordsInYear(year);
  const summary = summarizeRecords(records);
  const years = yearsWithRecords();

  els.yearReport.innerHTML = `
    ${summaryGrid(summary, targetForYear(year))}
    ${timeBandAnalysisMarkup(records)}
    ${barChart(
      "年別売上",
      years.map((itemYear) => ({
        label: `${itemYear}年`,
        value: summarizeRecords(recordsInYear(itemYear)).sales,
        selected: itemYear === year,
      })),
      { variant: "years", selectedLabel: `${year}年` }
    )}
  `;
}

function barChart(title, items, options = {}) {
  const max = Math.max(...items.map((item) => numberValue(item.value)), 1);
  const accessibleSummary = items.map((item) => `${item.label} ${yen(item.value)}`).join("、");
  const variant = ["days", "weeks", "years"].includes(options.variant) ? options.variant : "months";
  const chartRole = options.interactive ? "group" : "img";
  return `
    <section class="chart-panel">
      <h3>${escapeHtml(title)}</h3>
      ${options.selectedLabel ? `<p class="chart-note">選択中：${escapeHtml(options.selectedLabel)}</p>` : ""}
      <div class="chart-scroll">
        <div class="bar-chart bar-chart--${variant}" role="${chartRole}" aria-label="${escapeHtml(`${title}。${accessibleSummary}`)}">
          ${items.map((item) => {
            const height = Math.max((numberValue(item.value) / max) * 100, item.value > 0 ? 3 : 0);
            const tag = item.date ? "button" : "div";
            const actionAttributes = item.date
              ? ` type="button" data-jump-date="${escapeHtml(item.date)}" aria-label="${escapeHtml(`${formatDate(item.date)} ${yen(item.value)}。入力画面を開く`)}"`
              : "";
            return `
              <${tag} class="bar-item${item.selected ? " is-selected" : ""}${item.date ? " bar-item-button" : ""}"${actionAttributes}>
                <span class="bar-value">${formatCompactYen(item.value)}</span>
                <div class="bar-track"><span class="bar-fill" style="height:${height}%"></span></div>
                <strong>${escapeHtml(item.label)}</strong>
              </${tag}>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function centerSelectedChartItem(reportElement) {
  const selected = reportElement.querySelector(".bar-item.is-selected");
  const scrollHost = selected?.closest(".chart-scroll");
  if (!selected || !scrollHost) return;
  scrollHost.scrollLeft = Math.max(0, selected.offsetLeft - (scrollHost.clientWidth - selected.offsetWidth) / 2);
}

function comparisonBarChart(title, items, labels) {
  const values = items.flatMap((item) => [numberValue(item.current), numberValue(item.previous)]);
  const max = Math.max(...values, 1);
  const accessibleSummary = items
    .map((item) => `${item.label} ${labels.currentLabel} ${yen(item.current)}、${labels.previousLabel} ${yen(item.previous)}`)
    .join("。 ");
  return `
    <section class="chart-panel">
      <h3>${escapeHtml(title)}</h3>
      <div class="chart-legend" aria-hidden="true">
        <span><i class="legend-current"></i>${escapeHtml(labels.currentLabel)}</span>
        <span><i class="legend-previous"></i>${escapeHtml(labels.previousLabel)}</span>
      </div>
      <div class="chart-scroll">
        <div class="bar-chart comparison-chart" role="img" aria-label="${escapeHtml(`${title}。${accessibleSummary}`)}">
          ${items.map((item) => {
            const currentHeight = Math.max((numberValue(item.current) / max) * 100, item.current > 0 ? 3 : 0);
            const previousHeight = Math.max((numberValue(item.previous) / max) * 100, item.previous > 0 ? 3 : 0);
            return `
              <div class="bar-item comparison-item">
                <span class="bar-value">${formatCompactYen(item.current)}</span>
                <div class="comparison-track">
                  <span class="bar-fill comparison-current" style="height:${currentHeight}%" title="${escapeHtml(`${labels.currentLabel} ${yen(item.current)}`)}"></span>
                  <span class="bar-fill comparison-previous" style="height:${previousHeight}%" title="${escapeHtml(`${labels.previousLabel} ${yen(item.previous)}`)}"></span>
                </div>
                <strong>${escapeHtml(item.label)}</strong>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function yearsWithRecords() {
  return [...new Set(Object.keys(state.records)
    .map((date) => Number(date.slice(0, 4)))
    .filter(Number.isFinite))]
    .sort((left, right) => left - right);
}

function recordsInYear(year) {
  return Object.entries(state.records)
    .filter(([date]) => date.startsWith(`${year}-`))
    .map(([date, record]) => normalizeRecord({ ...(isPlainObject(record) ? record : {}), date }));
}

function summaryGrid(summary, target) {
  const achievement = target > 0 ? summary.sales / target : 0;
  return `
    <div class="summary-grid">
      ${summaryTile("総売上", yen(summary.sales))}
      ${summaryTile("件数", `${summary.count}件`)}
      ${summaryTile("稼働時間", formatHours(summary.workHours))}
      ${summaryTile("時給", yen(summary.hourly))}
      ${summaryTile("走行距離", `${formatNumber(summary.distanceKm)}km`)}
      ${summaryTile("km単価（売上）", summary.kmUnit > 0 ? `${yen(summary.kmUnit)}/km` : "-")}
      ${summaryTile("経費", yen(summary.expense))}
      ${summaryTile("利益", yen(summary.profit))}
      ${summaryTile("目標達成率", achievementMarkup(achievement, target > 0), "achievement-summary-tile")}
    </div>
  `;
}

function analyzeTimeBands(records) {
  const bands = TIME_BANDS.map((band) => ({
    ...band,
    minutes: 0,
    estimatedSales: 0,
    estimatedCount: 0,
    days: new Set(),
  }));
  let analyzedDays = 0;
  let missingTimeDays = 0;
  let activityDays = 0;
  let analyzedSales = 0;
  let activitySales = 0;

  records.map(normalizeRecord).forEach((record) => {
    const sessions = record.workSessions
      .map(normalizeWorkSession)
      .filter((session) => session.startTime && session.endTime);
    const dailySales = Object.values(record.services)
      .reduce((sum, service) => sum + numberValue(service.sales), 0);
    const dailyCount = Object.values(record.services)
      .reduce((sum, service) => sum + integerValue(service.count), 0);
    const hasActivity = dailySales > 0 || dailyCount > 0 || calculateWorkHours(record, record.workHours) > 0;
    if (hasActivity) {
      activityDays += 1;
      activitySales += dailySales;
    }

    if (sessions.length === 0) {
      if (hasActivity) missingTimeDays += 1;
      return;
    }

    const minutesByBand = Object.fromEntries(TIME_BANDS.map((band) => [band.id, 0]));
    sessions.forEach((session) => {
      workSessionSegments(session).forEach(([sessionStart, sessionEnd]) => {
        TIME_BANDS.forEach((band) => {
          band.segments.forEach(([bandStart, bandEnd]) => {
            minutesByBand[band.id] += Math.max(
              Math.min(sessionEnd, bandEnd) - Math.max(sessionStart, bandStart),
              0
            );
          });
        });
      });
    });

    const rawMinutes = Object.values(minutesByBand).reduce((sum, minutes) => sum + minutes, 0);
    if (rawMinutes <= 0) {
      if (hasActivity) missingTimeDays += 1;
      return;
    }

    const effectiveMinutes = calculateWorkHours(record, record.workHours) * 60;
    if (effectiveMinutes <= 0) {
      if (hasActivity) missingTimeDays += 1;
      return;
    }

    analyzedDays += 1;
    analyzedSales += dailySales;
    const netMinutesScale = effectiveMinutes / rawMinutes;
    bands.forEach((band) => {
      const rawBandMinutes = minutesByBand[band.id];
      if (rawBandMinutes <= 0) return;
      const allocation = rawBandMinutes / rawMinutes;
      band.minutes += rawBandMinutes * netMinutesScale;
      band.estimatedSales += dailySales * allocation;
      band.estimatedCount += dailyCount * allocation;
      band.days.add(record.date);
    });
  });

  const populatedBands = bands
    .filter((band) => band.minutes > 0)
    .map((band) => ({
      ...band,
      days: band.days.size,
      hours: band.minutes / 60,
      hourly: band.estimatedSales / (band.minutes / 60),
    }));

  return {
    bands: populatedBands,
    analyzedDays,
    missingTimeDays,
    activityDays,
    analyzedSales,
    activitySales,
  };
}

function timeBandAnalysisMarkup(records) {
  const analysis = analyzeTimeBands(records);
  if (analysis.bands.length === 0) {
    return `
      <section class="time-analysis-panel time-analysis-empty" aria-label="時間帯別の稼働分析">
        <div class="time-analysis-heading">
          <div>
            <h3>時間帯別の稼働傾向（推定）</h3>
            <p>開始・終了時刻がある記録から、朝・ランチ・ディナーなどの傾向を表示します。</p>
          </div>
        </div>
        <p class="empty-state">この期間には分析できる時間帯データがありません。</p>
      </section>
    `;
  }

  const maxHourly = Math.max(...analysis.bands.map((band) => band.hourly), 1);
  const bestBand = analysis.analyzedDays >= 5
    ? analysis.bands
      .filter((band) => band.hours >= 10 && band.days >= 5)
      .sort((left, right) => right.hourly - left.hourly)[0]
    : null;
  const salesCoverage = analysis.activitySales > 0
    ? analysis.analyzedSales / analysis.activitySales
    : analysis.activityDays > 0 ? analysis.analyzedDays / analysis.activityDays : 0;
  const coverage = [
    `分析対象 ${analysis.analyzedDays}/${analysis.activityDays}日`,
    analysis.activitySales > 0 ? `対象売上 ${percent(salesCoverage)}` : "",
    analysis.missingTimeDays > 0 ? `時刻なし ${analysis.missingTimeDays}日は対象外` : "",
  ].filter(Boolean).join("・");

  return `
    <section class="time-analysis-panel" aria-label="時間帯別の稼働分析">
      <div class="time-analysis-heading">
        <div>
          <h3>時間帯別の稼働傾向（推定）</h3>
          <p>${escapeHtml(coverage)}</p>
        </div>
        ${bestBand ? `<p class="time-analysis-insight"><strong>${escapeHtml(bestBand.label)}</strong>の推定時給が高め：${yen(bestBand.hourly)}/h</p>` : ""}
      </div>
      <div class="time-analysis-list">
        ${analysis.bands.map((band) => {
          const width = Math.max((band.hourly / maxHourly) * 100, 3);
          return `
            <article class="time-analysis-row" data-time-band="${escapeHtml(band.id)}">
              <div class="time-band-label">
                <strong>${escapeHtml(band.label)}</strong>
                <span>${escapeHtml(band.time)}</span>
                ${band.days < 5 || band.hours < 10 ? `<span class="time-analysis-sample-note">データ少なめ</span>` : ""}
              </div>
              <div class="time-analysis-bar" aria-hidden="true"><span style="width:${width}%"></span></div>
              <dl>
                <div><dt>稼働</dt><dd>${formatHours(band.hours)}・${band.days}日</dd></div>
                <div><dt>推定売上</dt><dd>${yen(band.estimatedSales)}</dd></div>
                <div><dt>推定件数</dt><dd>${formatNumber(band.estimatedCount)}件</dd></div>
                <div><dt>推定時給</dt><dd class="time-analysis-hourly">${yen(band.hourly)}/h</dd></div>
              </dl>
            </article>
          `;
        }).join("")}
      </div>
      <p class="time-analysis-note">1日の売上・件数を、その日の記録済み稼働分数に応じて各時間帯へ配分した推定です。時間帯ごとの実売上ではありません。</p>
    </section>
  `;
}

function serviceSummaryGrid(summary) {
  const providers = providersForSummary(summary);
  return `
    <div class="service-summary-grid">
      ${providers.map((service) => {
        const item = summary.services[service.id] || { count: 0, sales: 0 };
        return `
          <div class="service-summary">
            <span class="service-summary-provider">
              <b class="summary-service-icon">${escapeHtml(service.icon)}</b>
              <span class="service-summary-name">${escapeHtml(service.label)}</span>
            </span>
            <strong>${item.count}件 / ${yen(item.sales)}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function providersForSummary(summary) {
  const known = new Map(state.providers.map((provider) => [provider.id, provider]));
  Object.keys(summary.services).forEach((id) => {
    if (!known.has(id)) known.set(id, { id, label: id, icon: id.slice(0, 1).toUpperCase() });
  });
  return [...known.values()].filter((provider) => {
    const item = summary.services[provider.id];
    return item && (item.count > 0 || item.sales > 0);
  });
}

function summaryTile(label, value, className = "") {
  return `<div class="summary-tile${className ? ` ${className}` : ""}"><span>${label}</span><strong>${value}</strong></div>`;
}

function achievementMarkup(value, hasTarget = true) {
  const percentage = hasTarget ? `${Math.round(numberValue(value) * 100)}%` : "—";
  return `<span class="achievement-percent">${percentage}</span>`;
}

function renderAchievement(element, value, hasTarget = true) {
  element.innerHTML = achievementMarkup(value, hasTarget);
  delete element.dataset.rank;
}

function lineItem(title, sub, items) {
  return `
    <div class="day-line">
      <div><span>${title}</span><strong>${sub}</strong></div>
      ${items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
    </div>
  `;
}

function getSummaryForView(view) {
  if (view === "day") return summarizeRecords([normalizeRecord(state.records[state.selectedDate] || blankRecord(state.selectedDate))]);
  if (view === "week") {
    const { start, end } = weekRange(state.selectedDate);
    return summarizeRecords(datesBetween(start, end).map((date) => normalizeRecord(state.records[date] || blankRecord(date))));
  }
  if (view === "month") return summarizeRecords(recordsInMonth(monthKey(state.selectedDate)));

  const year = new Date(`${state.selectedDate}T00:00:00`).getFullYear();
  const records = Object.entries(state.records)
    .filter(([date]) => date.startsWith(`${year}-`))
    .map(([date, record]) => normalizeRecord({ ...(isPlainObject(record) ? record : {}), date }));
  return summarizeRecords(records);
}

function summarizeRecords(records) {
  const summary = {
    sales: 0,
    count: 0,
    workHours: 0,
    distanceKm: 0,
    gasCost: 0,
    gasCostForUnit: 0,
    fuelLiters: 0,
    otherExpense: 0,
    expense: 0,
    profit: 0,
    hourly: 0,
    gasUnit: 0,
    kmUnitSales: 0,
    kmUnit: 0,
    services: Object.fromEntries(state.providers.map((provider) => [provider.id, { count: 0, sales: 0 }])),
  };

  records.map(normalizeRecord).forEach((record) => {
    let recordSales = 0;
    Object.entries(record.services).forEach(([id, item]) => {
      if (!summary.services[id]) summary.services[id] = { count: 0, sales: 0 };
      summary.services[id].count += item.count;
      summary.services[id].sales += item.sales;
      summary.count += item.count;
      summary.sales += item.sales;
      recordSales += item.sales;
    });
    summary.workHours += calculateWorkHours(record, record.workHours);
    const recordDistanceKm = record.odometerKm > 0
      ? calculateDailyDistance(record.date, record.odometerKm, record.vehicleId)
      : record.distanceKm;
    summary.distanceKm += recordDistanceKm;
    if (recordDistanceKm > 0) summary.kmUnitSales += recordSales;
    summary.gasCost += record.gasCost;
    summary.gasCostForUnit += record.expenses
      .filter((expense) => expense.type === "gas" && expense.liters > 0)
      .reduce((sum, expense) => sum + expense.amount, 0);
    summary.fuelLiters += record.fuelLiters;
    summary.otherExpense += record.otherExpense;
  });

  summary.expense = summary.gasCost + summary.otherExpense;
  summary.profit = summary.sales - summary.expense;
  summary.hourly = summary.workHours > 0 ? summary.sales / summary.workHours : 0;
  summary.gasUnit = summary.fuelLiters > 0 ? summary.gasCostForUnit / summary.fuelLiters : 0;
  summary.kmUnit = summary.distanceKm > 0 ? summary.kmUnitSales / summary.distanceKm : 0;
  return summary;
}

function calculatePlan(key, target, summary) {
  const [year, month] = key.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  const today = new Date();
  const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  let elapsedDays = days;

  if (key === currentKey) elapsedDays = today.getDate();
  if (key > currentKey) elapsedDays = 0;

  const remainingDays = Math.max(days - elapsedDays + (key === currentKey ? 1 : 0), 1);
  const achievement = target > 0 ? summary.sales / target : 0;
  const remaining = Math.max(target - summary.sales, 0);
  const dailyNeed = remaining / remainingDays;
  const weeklyNeed = dailyNeed * 7;
  const paceBaseDays = Math.max(elapsedDays, 1);
  const forecast = key > currentKey ? 0 : (summary.sales / paceBaseDays) * days;
  const averageTicket = summary.count > 0 ? summary.sales / summary.count : 0;
  const neededCount = averageTicket > 0 ? Math.ceil(remaining / averageTicket) : 0;

  return { achievement, remaining, dailyNeed, weeklyNeed, forecast, neededCount };
}

function recordsInMonth(key) {
  return Object.entries(state.records)
    .filter(([date]) => date.startsWith(`${key}-`))
    .map(([date, record]) => normalizeRecord({ ...(isPlainObject(record) ? record : {}), date }));
}

function recordsBetween(start, end) {
  return Object.entries(state.records)
    .filter(([date]) => date >= start && date <= end)
    .map(([date, record]) => normalizeRecord({ ...(isPlainObject(record) ? record : {}), date }));
}

function targetForYear(year) {
  return Object.entries(state.targets)
    .filter(([key]) => key.startsWith(`${year}-`))
    .reduce((sum, [, value]) => sum + numberValue(value), 0);
}

function targetForDay(dateString) {
  const key = monthKey(dateString);
  const [year, month] = key.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth > 0 ? numberValue(state.targets[key]) / daysInMonth : 0;
}

function targetForWeek(dateString) {
  const { start, end } = weekRange(dateString);
  return datesBetween(start, end).reduce((sum, date) => sum + targetForDay(date), 0);
}

function targetForView(view, dateString) {
  if (view === "day") return targetForDay(dateString);
  if (view === "week") return targetForWeek(dateString);
  if (view === "month") return numberValue(state.targets[monthKey(dateString)]);
  return targetForYear(new Date(`${dateString}T00:00:00`).getFullYear());
}

function movePeriod(direction) {
  if (!confirmDiscardDraft()) return;
  const date = new Date(`${state.selectedDate}T00:00:00`);
  const period = currentScreen === "input" ? "day" : currentScreen === "plan" ? "month" : state.view;
  if (period === "day") date.setDate(date.getDate() + direction);
  if (period === "week") date.setDate(date.getDate() + direction * 7);
  if (period === "month") shiftCalendarMonth(date, direction);
  if (period === "year") shiftCalendarYear(date, direction);
  state.selectedDate = toDateInput(date);
  fillFormForDate(state.selectedDate);
  render();
}

function shiftCalendarMonth(date, direction) {
  const desiredDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + direction);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(desiredDay, lastDay));
}

function shiftCalendarYear(date, direction) {
  const desiredMonth = date.getMonth();
  const desiredDay = date.getDate();
  date.setDate(1);
  date.setFullYear(date.getFullYear() + direction);
  date.setMonth(desiredMonth);
  const lastDay = new Date(date.getFullYear(), desiredMonth + 1, 0).getDate();
  date.setDate(Math.min(desiredDay, lastDay));
}

function moveReportTabFocus(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...document.querySelectorAll(".view-tab")];
  const currentIndex = tabs.indexOf(event.currentTarget);
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

function periodLabel() {
  if (currentScreen === "input") return formatDate(state.selectedDate);
  if (currentScreen === "plan") return monthKey(state.selectedDate).replace("-", "年") + "月";
  if (state.view === "day") return formatDate(state.selectedDate);
  if (state.view === "week") {
    const range = weekRange(state.selectedDate);
    return `${formatDate(range.start)} - ${formatDate(range.end)}`;
  }
  if (state.view === "month") return monthKey(state.selectedDate).replace("-", "年") + "月";
  return `${new Date(`${state.selectedDate}T00:00:00`).getFullYear()}年`;
}

function weekRange(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateInput(start), end: toDateInput(end) };
}

function weekInputValue(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function dateFromWeekInput(value) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - (januaryFourth.getUTCDay() || 7) + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function isoWeeksInYear(year) {
  return Number(weekInputValue(`${year}-12-28`).slice(6));
}

function datesBetween(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    dates.push(toDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function normalizeRecord(record) {
  const normalized = blankRecord(record.date || state.selectedDate);
  const serviceIds = new Set([
    ...state.providers.map((provider) => provider.id),
    ...Object.keys(isPlainObject(record.services) ? record.services : {}),
  ]);
  normalized.services = {};
  serviceIds.forEach((id) => {
    normalized.services[id] = {
      count: integerValue(record.services?.[id]?.count),
      sales: numberValue(record.services?.[id]?.sales),
    };
  });
  const listedSessions = Array.isArray(record.workSessions)
    ? record.workSessions.map(normalizeWorkSession).filter((session) => session.startTime || session.endTime)
    : [];
  const legacySession = normalizeWorkSession({
    startTime: record.startTime,
    endTime: record.endTime,
  });
  normalized.workSessions = listedSessions.length > 0
    ? listedSessions
    : legacySession.startTime && legacySession.endTime
      ? [legacySession]
      : [];
  normalized.workHours = numberValue(record.workHours);
  normalized.workHoursOverride = numberValue(record.workHoursOverride);
  normalized.startTime = legacySession.startTime;
  normalized.endTime = legacySession.endTime;
  normalized.breakHours = numberValue(record.breakHours);
  normalized.vehicleId = typeof record.vehicleId === "string" ? record.vehicleId : "";
  normalized.odometerKm = numberValue(record.odometerKm ?? record.sourceData?.odometerKm);
  normalized.distanceKm = numberValue(record.distanceKm);
  if (Array.isArray(record.expenses)) {
    normalized.expenses = record.expenses
      .map(normalizeExpense)
      .filter((expense) => expense && (expense.amount > 0 || expense.liters > 0));
  } else {
    normalized.expenses = [];
    const legacyGasCost = numberValue(record.gasCost);
    const legacyFuelLiters = numberValue(record.fuelLiters);
    const legacyOtherExpense = numberValue(record.otherExpense);
    if (legacyGasCost > 0 || legacyFuelLiters > 0) {
      normalized.expenses.push(normalizeExpense({
        type: "gas",
        amount: legacyGasCost,
        liters: legacyFuelLiters,
        memo: "",
      }));
    }
    if (legacyOtherExpense > 0) {
      normalized.expenses.push(normalizeExpense({
        type: "other",
        amount: legacyOtherExpense,
        liters: 0,
        memo: "",
      }));
    }
  }
  normalized.gasCost = normalized.expenses
    .filter((expense) => expense.type === "gas")
    .reduce((sum, expense) => sum + expense.amount, 0);
  normalized.fuelLiters = normalized.expenses
    .filter((expense) => expense.type === "gas")
    .reduce((sum, expense) => sum + expense.liters, 0);
  normalized.otherExpense = normalized.expenses
    .filter((expense) => expense.type === "other")
    .reduce((sum, expense) => sum + expense.amount, 0);
  normalized.memo = record.memo || "";
  normalized.sourceData = isPlainObject(record.sourceData) ? { ...record.sourceData } : {};
  return normalized;
}

function normalizeExpense(expense) {
  if (!expense || !["gas", "other"].includes(expense.type)) return null;
  return {
    type: expense.type,
    amount: numberValue(expense.amount),
    liters: expense.type === "gas" ? numberValue(expense.liters ?? expense.fuelLiters) : 0,
    memo: expense.type === "other" && typeof expense.memo === "string" ? expense.memo.trim() : "",
  };
}

function normalizeWorkSession(session) {
  return {
    startTime: normalizeTime(session?.startTime),
    endTime: normalizeTime(session?.endTime),
  };
}

function normalizeTime(value) {
  if (typeof value !== "string") return "";
  const normalizedText = value
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0))
    .replace("：", ":");
  const compactMatch = normalizedText.match(/^\d{3,4}$/);
  const timeText = compactMatch
    ? normalizedText.padStart(4, "0").replace(/^(\d{2})(\d{2})$/, "$1:$2")
    : normalizedText;
  const match = timeText.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const [, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeInputValue(value) {
  return normalizeTime(value).replace(":", "");
}

function calculateWorkHours(record, fallbackHours = 0) {
  const importedOverride = numberValue(record.workHoursOverride);
  if (importedOverride > 0) return importedOverride;

  const sessions = Array.isArray(record.workSessions)
    ? record.workSessions.map(normalizeWorkSession).filter((session) => session.startTime || session.endTime)
    : [];
  const completeSessions = sessions.filter((session) => session.startTime && session.endTime);

  if (completeSessions.length > 0) {
    const totalMinutes = completeSessions.reduce((sum, session) => sum + workSessionMinutes(session), 0);
    const breakMinutes = numberValue(record.breakHours) * 60;
    return Math.max((totalMinutes - breakMinutes) / 60, 0);
  }

  if (sessions.length > 0) return 0;

  const legacySession = normalizeWorkSession(record);
  if (!legacySession.startTime || !legacySession.endTime) return numberValue(fallbackHours);
  const totalMinutes = workSessionMinutes(legacySession) - numberValue(record.breakHours) * 60;
  return Math.max(totalMinutes / 60, 0);
}

function workSessionMinutes(session) {
  const [startHour, startMinute] = session.startTime.split(":").map(Number);
  const [endHour, endMinute] = session.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end < start) end += 24 * 60;
  return end - start;
}

function exportBackup() {
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      records: state.records,
      targets: state.targets,
      providers: state.providers,
      vehicles: state.vehicles,
      taxYear: state.taxYear,
      taxProfiles: state.taxProfiles,
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `okumeter-backup-${todayString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // The file is already downloaded even if the reminder date cannot be saved.
  }
  if (currentScreen === "settings") renderBackupCare();
  showToast("データをファイル保存しました");
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirmDiscardDraft("未保存の入力があります。破棄してバックアップを読み込みますか？")) {
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!isPlainObject(parsed) || !isPlainObject(parsed.records)) throw new Error("Invalid backup");
      if (parsed.targets !== undefined && !isPlainObject(parsed.targets)) throw new Error("Invalid targets");
      if (parsed.providers !== undefined && !Array.isArray(parsed.providers)) throw new Error("Invalid providers");
      if (parsed.vehicles !== undefined && !Array.isArray(parsed.vehicles)) throw new Error("Invalid vehicles");
      if (parsed.taxProfiles !== undefined && !isPlainObject(parsed.taxProfiles)) throw new Error("Invalid tax profiles");
      state.records = parsed.records;
      state.targets = parsed.targets || {};
      state.providers = normalizeProviders(parsed.providers, state.records);
      state.vehicles = normalizeVehicles(parsed.vehicles);
      state.taxYear = Number(parsed.taxYear) || state.taxYear;
      state.taxProfiles = normalizeTaxProfiles(parsed.taxProfiles);
      invalidateOdometerIndex();
      clearTimeout(persistTimer);
      await persist();
      fillFormForDate(state.selectedDate);
      render({ shouldPersist: false });
      showToast("ファイルからデータを読み込みました");
    } catch {
      showToast("データファイルを読み込めませんでした");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function yen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Math.round(numberValue(value)));
}

function formatCompactYen(value) {
  return `¥${new Intl.NumberFormat("ja-JP", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numberValue(value))}`;
}

function percent(value) {
  return `${Math.round(numberValue(value) * 1000) / 10}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(numberValue(value));
}

function formatHours(value) {
  const formatted = new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
  return `${formatted}h`;
}

function formatLiters(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(numberValue(value));
}

function roundHours(value) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function integerValue(value) {
  return Math.floor(numberValue(value));
}

function valueOrEmpty(value) {
  return numberValue(value) > 0 ? String(value) : "";
}

function hoursValueOrEmpty(value) {
  return numberValue(value) > 0 ? numberValue(value).toFixed(2) : "";
}

function todayString() {
  return toDateInput(new Date());
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(dateString) {
  return dateString.slice(0, 7);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function shortDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`;
}

function weekdayLabel(dateString) {
  return ["日", "月", "火", "水", "木", "金", "土"][new Date(`${dateString}T00:00:00`).getDay()];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
