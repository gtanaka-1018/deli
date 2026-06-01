const storageKey = "deli-invest-simulator";
const services = [
  { id: "uber", label: "サービスA" },
  { id: "demae", label: "サービスB" },
  { id: "rocket", label: "サービスC" },
  { id: "menu", label: "サービスD" },
  { id: "other", label: "その他" },
];

const el = (id) => document.getElementById(id);

const formatCurrency = (value) => {
  return `¥${Number(value).toLocaleString("ja-JP")}`;
};

const getSaved = () => {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
};

const save = (state) => {
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const getInputNumber = (id) => {
  const value = Number(el(id).value);
  return Number.isFinite(value) ? value : 0;
};

const calculateTotalSales = () => {
  return services.reduce((sum, service) => {
    const amount = getInputNumber(`sales-${service.id}`);
    return sum + amount;
  }, 0);
};

const calculateTotalCount = () => {
  return services.reduce((sum, service) => {
    const count = getInputNumber(`count-${service.id}`);
    return sum + count;
  }, 0);
};

const calculateMonthlyInvestment = (salesTotal) => {
  const mode = el("investment-mode").value;
  if (mode === "percent") {
    const percent = getInputNumber("investment-percent");
    return Math.round(salesTotal * (percent / 100));
  }
  return getInputNumber("investment-amount");
};

const calculateFutureValue = (monthlyAmount, annualRate, years) => {
  const monthlyRate = annualRate / 100 / 12;
  const periods = years * 12;
  if (monthlyRate === 0) {
    return monthlyAmount * periods;
  }
  const factor = (Math.pow(1 + monthlyRate, periods) - 1) / monthlyRate;
  return monthlyAmount * factor;
};

const updateSummary = () => {
  const totalSales = calculateTotalSales();
  const totalCount = calculateTotalCount();
  const averageTicket = totalCount > 0 ? Math.round(totalSales / totalCount) : 0;
  el("total-sales").textContent = formatCurrency(totalSales);
  el("total-count").textContent = `${totalCount}件`;
  el("average-ticket").textContent = formatCurrency(averageTicket);
  return { totalSales, totalCount, averageTicket };
};

const updateInvestment = () => {
  const totalSales = calculateTotalSales();
  const monthlyInvestment = calculateMonthlyInvestment(totalSales);
  el("monthly-investment").textContent = formatCurrency(monthlyInvestment);

  const annualYield = getInputNumber("annual-yield");
  el("fv-5").textContent = formatCurrency(Math.round(calculateFutureValue(monthlyInvestment, annualYield, 5)));
  el("fv-10").textContent = formatCurrency(Math.round(calculateFutureValue(monthlyInvestment, annualYield, 10)));
  el("fv-20").textContent = formatCurrency(Math.round(calculateFutureValue(monthlyInvestment, annualYield, 20)));

  return { monthlyInvestment, annualYield };
};

const syncModeFields = () => {
  const mode = el("investment-mode").value;
  if (mode === "percent") {
    el("investment-percent").disabled = false;
    el("investment-amount").disabled = true;
  } else {
    el("investment-percent").disabled = true;
    el("investment-amount").disabled = false;
  }
};

const saveCurrentState = () => {
  const state = {
    sales: {},
    counts: {},
    investmentMode: el("investment-mode").value,
    investmentAmount: getInputNumber("investment-amount"),
    investmentPercent: getInputNumber("investment-percent"),
    annualYield: getInputNumber("annual-yield"),
  };
  services.forEach((service) => {
    state.sales[service.id] = getInputNumber(`sales-${service.id}`);
    state.counts[service.id] = getInputNumber(`count-${service.id}`);
  });
  save(state);
};

const loadState = () => {
  const saved = getSaved();
  if (!saved) return;
  services.forEach((service) => {
    if (saved.sales && service.id in saved.sales) {
      el(`sales-${service.id}`).value = saved.sales[service.id];
    }
    if (saved.counts && service.id in saved.counts) {
      el(`count-${service.id}`).value = saved.counts[service.id];
    }
  });
  if (saved.investmentMode) el("investment-mode").value = saved.investmentMode;
  if (saved.investmentAmount != null) el("investment-amount").value = saved.investmentAmount;
  if (saved.investmentPercent != null) el("investment-percent").value = saved.investmentPercent;
  if (saved.annualYield != null) el("annual-yield").value = saved.annualYield;
};

const bindEvents = () => {
  const inputs = [
    ...services.flatMap((service) => [
      `sales-${service.id}`,
      `count-${service.id}`,
    ]),
    "investment-mode",
    "investment-amount",
    "investment-percent",
    "annual-yield",
  ];

  inputs.forEach((id) => {
    el(id).addEventListener("input", () => {
      syncModeFields();
      updateSummary();
      updateInvestment();
      saveCurrentState();
    });
  });
};

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  syncModeFields();
  updateSummary();
  updateInvestment();
  bindEvents();
});
