(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DeliTaxCalculator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BLUE_DEDUCTIONS = Object.freeze({
    white: 0,
    blue10: 100_000,
    blue55: 550_000,
    blue65: 650_000,
  });

  const REGION_DEFINITIONS = Object.freeze([
    ["standard", "未選択（標準税率）", 0],
    ["hokkaido", "北海道", 0], ["aomori", "青森県", 0], ["iwate", "岩手県", 1_000],
    ["miyagi", "宮城県", 1_200], ["akita", "秋田県", 800], ["yamagata", "山形県", 1_000],
    ["fukushima", "福島県", 1_000], ["ibaraki", "茨城県", 1_000], ["tochigi", "栃木県", 700],
    ["gunma", "群馬県", 700], ["saitama", "埼玉県", 0], ["chiba", "千葉県", 0],
    ["tokyo", "東京都", 0],
    ["kanagawa_yokohama", "神奈川県・横浜市", 1_200, 0.00025],
    ["kanagawa_kawasaki", "神奈川県・川崎市", 300, 0.00025],
    ["kanagawa_sagamihara", "神奈川県・相模原市", 300, 0.00025],
    ["kanagawa_other", "神奈川県・その他", 300, 0.00025],
    ["niigata", "新潟県", 0], ["toyama", "富山県", 500], ["ishikawa", "石川県", 500],
    ["fukui", "福井県", 0], ["yamanashi", "山梨県", 500], ["nagano", "長野県", 500],
    ["gifu", "岐阜県", 1_000], ["shizuoka", "静岡県", 400], ["aichi", "愛知県", 500],
    ["mie", "三重県", 1_000], ["shiga", "滋賀県", 800], ["kyoto", "京都府", 600],
    ["osaka", "大阪府", 300], ["hyogo", "兵庫県", 800], ["nara", "奈良県", 500],
    ["wakayama", "和歌山県", 500], ["tottori", "鳥取県", 500], ["shimane", "島根県", 500],
    ["okayama", "岡山県", 500], ["hiroshima", "広島県", 500], ["yamaguchi", "山口県", 500],
    ["tokushima", "徳島県", 0], ["kagawa", "香川県", 0], ["ehime", "愛媛県", 700],
    ["kochi", "高知県", 500], ["fukuoka", "福岡県", 500], ["saga", "佐賀県", 500],
    ["nagasaki", "長崎県", 500], ["kumamoto", "熊本県", 500], ["oita", "大分県", 500],
    ["miyazaki", "宮崎県", 500], ["kagoshima", "鹿児島県", 500], ["okinawa", "沖縄県", 0],
  ].map(([id, label, fixedExtra, incomeRateExtra = 0]) => Object.freeze({
    id,
    label,
    fixedExtra,
    incomeRateExtra,
  })));

  const REGIONS = Object.freeze(Object.fromEntries(REGION_DEFINITIONS.map((region) => [region.id, region])));

  function regionDefinition(regionId, year) {
    const base = REGIONS[regionId] || REGIONS.standard;
    if (!base.id.startsWith("kanagawa_") || Number(year) <= 2025) return base;
    return Object.freeze({ ...base, incomeRateExtra: 0.00018 });
  }

  function money(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(Math.floor(parsed), 0) : 0;
  }

  function floorToThousand(value) {
    return Math.max(Math.floor(Number(value) / 1_000) * 1_000, 0);
  }

  function incomeTaxBasicDeduction(totalIncome, year) {
    const income = money(totalIncome);
    const taxYear = Number(year) || new Date().getFullYear();

    if (taxYear <= 2024) {
      if (income <= 24_000_000) return 480_000;
      if (income <= 24_500_000) return 320_000;
      if (income <= 25_000_000) return 160_000;
      return 0;
    }

    if (taxYear === 2026 || taxYear === 2027) {
      if (income <= 4_890_000) return 1_040_000;
      if (income <= 6_550_000) return 670_000;
      if (income <= 23_500_000) return 620_000;
      if (income <= 24_000_000) return 480_000;
      if (income <= 24_500_000) return 320_000;
      if (income <= 25_000_000) return 160_000;
      return 0;
    }

    if (taxYear === 2025) {
      if (income <= 1_320_000) return 950_000;
      if (income <= 3_360_000) return 880_000;
      if (income <= 4_890_000) return 680_000;
      if (income <= 6_550_000) return 630_000;
    }
    if (taxYear >= 2028 && income <= 1_320_000) return 990_000;
    if (income <= 23_500_000) return taxYear >= 2028 ? 620_000 : 580_000;
    if (income <= 24_000_000) return 480_000;
    if (income <= 24_500_000) return 320_000;
    if (income <= 25_000_000) return 160_000;
    return 0;
  }

  function quarterTruncatedSalaryRevenue(revenue) {
    return Math.floor(revenue / 4_000) * 1_000;
  }

  function salaryIncomeFromRevenue(salaryRevenue, year) {
    const revenue = money(salaryRevenue);
    const taxYear = Number(year) || new Date().getFullYear();

    if (taxYear === 2026 || taxYear === 2027) {
      if (revenue <= 740_999) return 0;
      if (revenue <= 2_190_999) return revenue - 740_000;
      if (revenue <= 2_192_999) return 1_451_000;
      if (revenue <= 2_195_999) return 1_453_000;
      if (revenue <= 2_199_999) return 1_456_000;
    } else if (taxYear === 2025) {
      if (revenue <= 650_999) return 0;
      if (revenue <= 1_899_999) return revenue - 650_000;
    } else if (taxYear >= 2028) {
      if (revenue <= 690_999) return 0;
      if (revenue <= 1_899_999) return revenue - 690_000;
    } else if (taxYear <= 2024) {
      if (revenue <= 550_999) return 0;
      if (revenue <= 1_618_999) return revenue - 550_000;
      if (revenue <= 1_619_999) return 1_069_000;
      if (revenue <= 1_621_999) return 1_070_000;
      if (revenue <= 1_623_999) return 1_072_000;
      if (revenue <= 1_627_999) return 1_074_000;
    }

    const quarterRevenue = quarterTruncatedSalaryRevenue(revenue);
    if (revenue < 3_600_000) return Math.floor(quarterRevenue * 2.8 - 80_000);
    if (revenue < 6_600_000) return Math.floor(quarterRevenue * 3.2 - 440_000);
    if (revenue < 8_500_000) return Math.floor(revenue * 0.9 - 1_100_000);
    return revenue - 1_950_000;
  }

  function residentTaxBasicDeduction(totalIncome) {
    const income = money(totalIncome);
    if (income <= 24_000_000) return 430_000;
    if (income <= 24_500_000) return 290_000;
    if (income <= 25_000_000) return 150_000;
    return 0;
  }

  function incomeTaxFromTaxable(taxableIncome) {
    const taxable = floorToThousand(taxableIncome);
    if (taxable <= 0) return 0;
    if (taxable <= 1_949_000) return Math.floor(taxable * 0.05);
    if (taxable <= 3_299_000) return Math.floor(taxable * 0.10 - 97_500);
    if (taxable <= 6_949_000) return Math.floor(taxable * 0.20 - 427_500);
    if (taxable <= 8_999_000) return Math.floor(taxable * 0.23 - 636_000);
    if (taxable <= 17_999_000) return Math.floor(taxable * 0.33 - 1_536_000);
    if (taxable <= 39_999_000) return Math.floor(taxable * 0.40 - 2_796_000);
    return Math.floor(taxable * 0.45 - 4_796_000);
  }

  function calculateIncomeComponents(totalIncome, year, commonDeductions, region) {
    const normalizedIncome = money(totalIncome);
    const basicDeduction = incomeTaxBasicDeduction(normalizedIncome, year);
    const taxableIncome = floorToThousand(normalizedIncome - basicDeduction - commonDeductions);
    const incomeTax = incomeTaxFromTaxable(taxableIncome);
    const reconstructionTax = Math.floor(incomeTax * 0.021);
    const incomeTaxGross = incomeTax + reconstructionTax;

    const residentBasicDeduction = residentTaxBasicDeduction(normalizedIncome);
    const residentTaxableIncome = floorToThousand(
      normalizedIncome - residentBasicDeduction - commonDeductions,
    );
    const residentIncomeRate = 0.10 + region.incomeRateExtra;
    const residentIncomeLevy = Math.floor(residentTaxableIncome * residentIncomeRate);
    const residentStandardPerCapita = normalizedIncome > 450_000 ? 4_000 : 0;
    const forestEnvironmentTax = normalizedIncome > 450_000 ? 1_000 : 0;
    const regionalFixedExtra = normalizedIncome > 450_000 ? region.fixedExtra : 0;
    const residentPerCapitaLevy = residentStandardPerCapita
      + forestEnvironmentTax
      + regionalFixedExtra;
    const residentTax = residentIncomeLevy + residentPerCapitaLevy;

    return {
      basicDeduction,
      taxableIncome,
      incomeTax,
      reconstructionTax,
      incomeTaxGross,
      residentBasicDeduction,
      residentTaxableIncome,
      residentIncomeRate,
      residentIncomeLevy,
      residentStandardPerCapita,
      forestEnvironmentTax,
      regionalFixedExtra,
      residentPerCapitaLevy,
      residentTax,
    };
  }

  function calculateTaxEstimate(input = {}) {
    const year = Number(input.year) || new Date().getFullYear();
    const employmentMode = input.employmentMode === "side_job" ? "side_job" : "self_employed";
    const sales = money(input.sales);
    const expenses = money(input.expenses);
    const deliveryProfit = sales - expenses;
    const requestedBlueDeduction = BLUE_DEDUCTIONS[input.filingType] || 0;
    const blueDeduction = Math.min(requestedBlueDeduction, Math.max(deliveryProfit, 0));
    const businessIncome = deliveryProfit - blueDeduction;
    const otherIncome = money(input.otherIncome);
    const selfEmployedTotalIncome = Math.max(businessIncome + otherIncome, 0);

    const ideco = money(input.ideco);
    const mutualAid = money(input.mutualAid);
    const socialInsurance = money(input.socialInsurance);
    const otherDeductions = money(input.otherDeductions);
    const commonDeductions = ideco + mutualAid + socialInsurance + otherDeductions;

    if (employmentMode === "side_job") {
      const salaryRevenue = money(input.salaryRevenue);
      const salaryIncome = salaryIncomeFromRevenue(salaryRevenue, year);
      const totalIncome = salaryIncome + businessIncome + otherIncome;
      const nonSalaryIncome = Math.max(businessIncome + otherIncome, 0);
      const salaryWithholding = money(input.salaryWithholding);
      const withholding = money(input.withholding);
      const totalWithholding = salaryWithholding + withholding;
      const fileAnyway = input.fileAnyway === true;
      const residentPaymentMethod = input.residentPaymentMethod === "payroll"
        ? "payroll"
        : "ordinary";
      const region = regionDefinition(input.region, year);
      const salaryOnly = calculateIncomeComponents(
        salaryIncome,
        year,
        commonDeductions,
        region,
      );
      const combined = calculateIncomeComponents(
        totalIncome,
        year,
        commonDeductions,
        region,
      );

      const incomeTaxIncrement = Math.max(combined.incomeTax - salaryOnly.incomeTax, 0);
      const reconstructionIncrement = Math.max(combined.reconstructionTax - salaryOnly.reconstructionTax, 0);
      const incomeTaxIncrementGross = incomeTaxIncrement + reconstructionIncrement;
      const residentTaxIncrement = Math.max(combined.residentTax - salaryOnly.residentTax, 0);
      const incomeTaxBalance = combined.incomeTaxGross - totalWithholding;
      const incomeTaxPayment = Math.max(incomeTaxBalance, 0);
      const incomeTaxRefund = Math.max(-incomeTaxBalance, 0);
      const incomeTaxReturnRequired = salaryRevenue > 20_000_000 || nonSalaryIncome > 200_000;
      const willFileIncomeTaxReturn = incomeTaxReturnRequired || fileAnyway;
      const incomeTaxPaymentForReturn = willFileIncomeTaxReturn ? incomeTaxPayment : 0;

      const businessTaxBase = Math.max(deliveryProfit - 2_900_000, 0);
      const businessTax = input.includeBusinessTax === false
        ? 0
        : Math.floor(businessTaxBase * 0.05);
      const annualTaxBurden = combined.incomeTaxGross + combined.residentTax + businessTax;
      const incrementalTaxBurden = incomeTaxIncrementGross + residentTaxIncrement + businessTax;
      const additionalPayment = incomeTaxPaymentForReturn
        + (residentPaymentMethod === "ordinary" ? residentTaxIncrement : 0)
        + businessTax;
      const monthlyReserve = Math.ceil(additionalPayment / 1_200) * 100;

      return {
        year,
        employmentMode,
        salaryRevenue,
        salaryIncome,
        salaryWithholding,
        sales,
        expenses,
        deliveryProfit,
        requestedBlueDeduction,
        blueDeduction,
        businessIncome,
        otherIncome,
        nonSalaryIncome,
        totalIncome,
        ideco,
        mutualAid,
        socialInsurance,
        otherDeductions,
        commonDeductions,
        ...combined,
        withholding,
        totalWithholding,
        incomeTaxBalance,
        incomeTaxPayment,
        incomeTaxRefund,
        incomeTaxReturnRequired,
        willFileIncomeTaxReturn,
        incomeTaxPaymentForReturn,
        incomeTaxIncrement,
        reconstructionIncrement,
        incomeTaxIncrementGross,
        salaryOnlyIncomeTax: salaryOnly.incomeTax,
        salaryOnlyReconstructionTax: salaryOnly.reconstructionTax,
        salaryOnlyIncomeTaxGross: salaryOnly.incomeTaxGross,
        region,
        salaryOnlyResidentTax: salaryOnly.residentTax,
        residentTaxIncrement,
        residentPaymentMethod,
        fileAnyway,
        businessTaxBase,
        businessTax,
        annualTaxBurden,
        incrementalTaxBurden,
        additionalPayment,
        monthlyReserve,
      };
    }

    const totalIncome = selfEmployedTotalIncome;

    const basicDeduction = incomeTaxBasicDeduction(totalIncome, year);
    const taxableIncome = floorToThousand(totalIncome - basicDeduction - commonDeductions);
    const incomeTax = incomeTaxFromTaxable(taxableIncome);
    const reconstructionTax = Math.floor(incomeTax * 0.021);
    const incomeTaxGross = incomeTax + reconstructionTax;
    const withholding = money(input.withholding);
    const incomeTaxBalance = incomeTaxGross - withholding;
    const incomeTaxPayment = Math.max(incomeTaxBalance, 0);
    const incomeTaxRefund = Math.max(-incomeTaxBalance, 0);

    const region = regionDefinition(input.region, year);
    const residentBasicDeduction = residentTaxBasicDeduction(totalIncome);
    const residentTaxableIncome = floorToThousand(totalIncome - residentBasicDeduction - commonDeductions);
    const residentIncomeRate = 0.10 + region.incomeRateExtra;
    const residentIncomeLevy = Math.floor(residentTaxableIncome * residentIncomeRate);
    const residentStandardPerCapita = totalIncome > 450_000 ? 4_000 : 0;
    const forestEnvironmentTax = totalIncome > 450_000 ? 1_000 : 0;
    const regionalFixedExtra = totalIncome > 450_000 ? region.fixedExtra : 0;
    const residentPerCapitaLevy = residentStandardPerCapita + forestEnvironmentTax + regionalFixedExtra;
    const residentTax = residentIncomeLevy + residentPerCapitaLevy;

    const businessTaxBase = Math.max(deliveryProfit - 2_900_000, 0);
    const businessTax = input.includeBusinessTax === false
      ? 0
      : Math.floor(businessTaxBase * 0.05);

    const annualTaxBurden = incomeTaxGross + residentTax + businessTax;
    const additionalPayment = incomeTaxPayment + residentTax + businessTax;
    const monthlyReserve = Math.ceil(additionalPayment / 1_200) * 100;

    return {
      year,
      sales,
      expenses,
      deliveryProfit,
      requestedBlueDeduction,
      blueDeduction,
      businessIncome,
      otherIncome,
      totalIncome,
      ideco,
      mutualAid,
      socialInsurance,
      otherDeductions,
      commonDeductions,
      basicDeduction,
      taxableIncome,
      incomeTax,
      reconstructionTax,
      incomeTaxGross,
      withholding,
      incomeTaxBalance,
      incomeTaxPayment,
      incomeTaxRefund,
      residentBasicDeduction,
      residentTaxableIncome,
      region,
      residentIncomeRate,
      residentIncomeLevy,
      residentStandardPerCapita,
      forestEnvironmentTax,
      regionalFixedExtra,
      residentPerCapitaLevy,
      residentTax,
      businessTaxBase,
      businessTax,
      annualTaxBurden,
      additionalPayment,
      monthlyReserve,
    };
  }

  return Object.freeze({
    BLUE_DEDUCTIONS,
    REGION_DEFINITIONS,
    REGIONS,
    calculateTaxEstimate,
    incomeTaxBasicDeduction,
    incomeTaxFromTaxable,
    residentTaxBasicDeduction,
    regionDefinition,
    salaryIncomeFromRevenue,
  });
});
