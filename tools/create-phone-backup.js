const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "data", "deli-sales-data.json");
const outputPath = path.join(root, "data", "delilog-sales-2019-2026.json");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const records = Object.fromEntries(
  Object.entries(source.records || {})
    .filter(([date]) => {
      const year = Number(date.slice(0, 4));
      return year >= 2019 && year <= 2026;
    })
    .sort(([left], [right]) => left.localeCompare(right))
);

if (Object.keys(records).length !== 2210) {
  throw new Error(`Expected 2210 records, found ${Object.keys(records).length}`);
}

const backup = {
  exportedAt: new Date().toISOString(),
  records,
  targets: source.targets || {},
  providers: source.providers || [],
  vehicles: source.vehicles || [],
  taxYear: Number(source.taxYear) || 2026,
  taxProfiles: source.taxProfiles || {},
};

fs.writeFileSync(outputPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
console.log(outputPath);
