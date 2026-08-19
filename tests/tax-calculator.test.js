const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateTaxEstimate,
  incomeTaxBasicDeduction,
  incomeTaxFromTaxable,
  salaryIncomeFromRevenue,
} = require("../public/tax-calculator.js");

test("2025年分は従来の拡大された基礎控除を使う", () => {
  assert.equal(incomeTaxBasicDeduction(1_320_000, 2025), 950_000);
  assert.equal(incomeTaxBasicDeduction(3_000_000, 2025), 880_000);
  assert.equal(incomeTaxBasicDeduction(4_000_000, 2025), 680_000);
  assert.equal(incomeTaxBasicDeduction(6_000_000, 2025), 630_000);
});

test("2026年分の基礎控除を所得境界ごとに切り替える", () => {
  assert.equal(incomeTaxBasicDeduction(4_890_000, 2026), 1_040_000);
  assert.equal(incomeTaxBasicDeduction(4_890_001, 2026), 670_000);
  assert.equal(incomeTaxBasicDeduction(6_550_000, 2026), 670_000);
  assert.equal(incomeTaxBasicDeduction(6_550_001, 2026), 620_000);
  assert.equal(incomeTaxBasicDeduction(23_500_000, 2026), 620_000);
  assert.equal(incomeTaxBasicDeduction(23_500_001, 2026), 480_000);
  assert.equal(incomeTaxBasicDeduction(24_000_001, 2026), 320_000);
  assert.equal(incomeTaxBasicDeduction(24_500_001, 2026), 160_000);
  assert.equal(incomeTaxBasicDeduction(25_000_001, 2026), 0);
});

test("2027年分は2026年改正の時限加算、2028年分以後は恒久加算を使う", () => {
  assert.equal(incomeTaxBasicDeduction(3_000_000, 2027), 1_040_000);
  assert.equal(incomeTaxBasicDeduction(1_320_000, 2028), 990_000);
  assert.equal(incomeTaxBasicDeduction(3_000_000, 2028), 620_000);
});

test("所得税の速算表を適用する", () => {
  assert.equal(incomeTaxFromTaxable(1_000_000), 50_000);
  assert.equal(incomeTaxFromTaxable(3_000_000), 202_500);
  assert.equal(incomeTaxFromTaxable(6_500_000), 872_500);
});

test("iDeCo・小規模企業共済・青色控除を税額に反映する", () => {
  const withoutDeductions = calculateTaxEstimate({
    year: 2026,
    sales: 5_500_000,
    expenses: 500_000,
    filingType: "white",
  });
  const withDeductions = calculateTaxEstimate({
    year: 2026,
    sales: 5_500_000,
    expenses: 500_000,
    filingType: "blue65",
    ideco: 276_000,
    mutualAid: 840_000,
    socialInsurance: 300_000,
  });

  assert.equal(withDeductions.blueDeduction, 650_000);
  assert.equal(withDeductions.commonDeductions, 1_416_000);
  assert.ok(withDeductions.annualTaxBurden < withoutDeductions.annualTaxBurden);
});

test("源泉徴収額が所得税額を超える場合は還付見込みにする", () => {
  const estimate = calculateTaxEstimate({
    year: 2026,
    sales: 2_000_000,
    expenses: 500_000,
    withholding: 100_000,
    includeBusinessTax: false,
  });

  assert.equal(estimate.incomeTaxPayment, 0);
  assert.ok(estimate.incomeTaxRefund > 0);
  assert.equal(estimate.additionalPayment, estimate.residentTax);
});

test("地域独自の住民税を反映する", () => {
  const standard = calculateTaxEstimate({
    year: 2026,
    sales: 5_000_000,
    expenses: 1_000_000,
    region: "standard",
    includeBusinessTax: false,
  });
  const yokohama = calculateTaxEstimate({
    year: 2026,
    sales: 5_000_000,
    expenses: 1_000_000,
    region: "kanagawa_yokohama",
    includeBusinessTax: false,
  });

  assert.equal(yokohama.region.label, "神奈川県・横浜市");
  assert.equal(yokohama.regionalFixedExtra, 1_200);
  assert.equal(yokohama.residentIncomeRate, 0.10018);
  assert.ok(yokohama.residentTax > standard.residentTax);
});

test("年収600万円の2026年給与所得は436万円になる", () => {
  assert.equal(salaryIncomeFromRevenue(6_000_000, 2026), 4_360_000);
});

test("2026年給与所得表の各段階を適用する", () => {
  assert.equal(salaryIncomeFromRevenue(740_999, 2026), 0);
  assert.equal(salaryIncomeFromRevenue(741_000, 2026), 1_000);
  assert.equal(salaryIncomeFromRevenue(2_190_999, 2026), 1_450_999);
  assert.equal(salaryIncomeFromRevenue(2_191_000, 2026), 1_451_000);
  assert.equal(salaryIncomeFromRevenue(2_193_000, 2026), 1_453_000);
  assert.equal(salaryIncomeFromRevenue(2_196_000, 2026), 1_456_000);
  assert.equal(salaryIncomeFromRevenue(2_200_000, 2026), 1_460_000);
  assert.equal(salaryIncomeFromRevenue(3_600_000, 2026), 2_440_000);
  assert.equal(salaryIncomeFromRevenue(6_600_000, 2026), 4_840_000);
  assert.equal(salaryIncomeFromRevenue(8_500_000, 2026), 6_550_000);
});

test("2025年以前の給与所得控除の最低保障額を使う", () => {
  assert.equal(salaryIncomeFromRevenue(650_000, 2025), 0);
  assert.equal(salaryIncomeFromRevenue(740_000, 2027), 0);
  assert.equal(salaryIncomeFromRevenue(690_000, 2028), 0);
  assert.equal(salaryIncomeFromRevenue(650_000, 2024), 100_000);
});

test("副業会社員は給与のみとの差額を増分税額として返す", () => {
  const estimate = calculateTaxEstimate({
    year: 2026,
    employmentMode: "side_job",
    salaryRevenue: 6_000_000,
    salaryWithholding: 250_000,
    sales: 1_000_000,
    expenses: 300_000,
    filingType: "white",
    includeBusinessTax: false,
  });

  assert.equal(estimate.salaryIncome, 4_360_000);
  assert.equal(estimate.totalIncome, 5_060_000);
  assert.equal(
    estimate.incomeTaxIncrement,
    estimate.incomeTax - estimate.salaryOnlyIncomeTax,
  );
  assert.equal(
    estimate.reconstructionIncrement,
    estimate.reconstructionTax - estimate.salaryOnlyReconstructionTax,
  );
  assert.equal(
    estimate.incrementalTaxBurden,
    estimate.incomeTaxIncrementGross + estimate.residentTaxIncrement,
  );
});

test("給与以外の所得が20万円以下なら所得税の申告納付をゼロにする", () => {
  const exempt = calculateTaxEstimate({
    year: 2026,
    employmentMode: "side_job",
    salaryRevenue: 6_000_000,
    salaryWithholding: 100_000,
    sales: 200_000,
    filingType: "white",
    includeBusinessTax: false,
  });
  const filing = calculateTaxEstimate({
    year: 2026,
    employmentMode: "side_job",
    salaryRevenue: 6_000_000,
    salaryWithholding: 100_000,
    sales: 200_000,
    filingType: "white",
    fileAnyway: true,
    includeBusinessTax: false,
  });

  assert.equal(exempt.nonSalaryIncome, 200_000);
  assert.equal(exempt.incomeTaxReturnRequired, false);
  assert.equal(exempt.incomeTaxPaymentForReturn, 0);
  assert.equal(exempt.additionalPayment, exempt.residentTaxIncrement);
  assert.equal(filing.incomeTaxReturnRequired, false);
  assert.equal(filing.willFileIncomeTaxReturn, true);
  assert.equal(filing.incomeTaxPaymentForReturn, filing.incomeTaxPayment);
});

test("給与と副業の源泉徴収税額を合算税額から控除する", () => {
  const estimate = calculateTaxEstimate({
    year: 2026,
    employmentMode: "side_job",
    salaryRevenue: 6_000_000,
    salaryWithholding: 900_000,
    withholding: 50_000,
    sales: 500_000,
    fileAnyway: true,
    includeBusinessTax: false,
  });

  assert.equal(estimate.totalWithholding, 950_000);
  assert.equal(estimate.incomeTaxBalance, estimate.incomeTaxGross - 950_000);
  assert.equal(estimate.incomeTaxPayment, 0);
  assert.equal(estimate.incomeTaxRefund, 950_000 - estimate.incomeTaxGross);
});

test("住民税の増分に均等割と森林環境税を重複加算しない", () => {
  const estimate = calculateTaxEstimate({
    year: 2026,
    employmentMode: "side_job",
    salaryRevenue: 6_000_000,
    salaryWithholding: 250_000,
    sales: 1_000_000,
    filingType: "white",
    region: "standard",
    residentPaymentMethod: "payroll",
    includeBusinessTax: false,
  });

  assert.equal(estimate.residentTaxIncrement, 100_000);
  assert.equal(estimate.additionalPayment, estimate.incomeTaxPaymentForReturn);
});
