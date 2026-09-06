const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicPath = (name) => path.join(__dirname, "..", "public", name);

test("トップページに検索・共有用のメタ情報と有効な構造化データがある", () => {
  const html = fs.readFileSync(publicPath("index.html"), "utf8");
  assert.match(html, /<link rel="canonical" href="https:\/\/okumeter\.com\/" \/>/);
  assert.match(html, /<meta name="robots" content="index, follow,/);
  assert.match(html, /<meta property="og:image" content="https:\/\/okumeter\.com\/og-image\.png" \/>/);
  assert.match(html, /フードデリバリーの売上・経費・税金を、ひとつの画面で/);
  assert.match(html, /入力内容はこの端末内だけに保存/);

  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "JSON-LDが見つかること");
  const structuredData = JSON.parse(match[1]);
  assert.equal(structuredData["@context"], "https://schema.org");
  assert.ok(structuredData["@graph"].some((item) => item["@type"] === "SoftwareApplication"));
});

test("SNS共有画像の実寸とメタ情報が一致する", () => {
  const html = fs.readFileSync(publicPath("index.html"), "utf8");
  const image = fs.readFileSync(publicPath("og-image.png"));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  assert.equal(width, 1730);
  assert.equal(height, 909);
  assert.match(html, new RegExp(`<meta property="og:image:width" content="${width}" />`));
  assert.match(html, new RegExp(`<meta property="og:image:height" content="${height}" />`));
});

test("初回表示には軽量なベクターブランド画像を使う", () => {
  const html = fs.readFileSync(publicPath("index.html"), "utf8");
  const mark = fs.readFileSync(publicPath("brand-mark.svg"), "utf8");
  assert.match(html, /<link rel="icon" href="\/brand-mark\.svg"/);
  assert.equal((html.match(/src="\/brand-mark\.svg"/g) || []).length, 2);
  assert.ok(Buffer.byteLength(mark) < 5_000);
  assert.match(mark, /^<svg[^>]+viewBox="0 0 64 64"/);
});

test("robots.txtがクロールを許可しサイトマップを案内する", () => {
  const robots = fs.readFileSync(publicPath("robots.txt"), "utf8");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/okumeter\.com\/sitemap\.xml$/m);
});

test("サイトマップは本番canonical URLだけを公開する", () => {
  const sitemap = fs.readFileSync(publicPath("sitemap.xml"), "utf8");
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, ["https://okumeter.com/"]);
  assert.match(sitemap, /<lastmod>2026-08-25<\/lastmod>/);
});

test("IndexNow所有確認キーはファイル名と内容が一致する", () => {
  const key = "e3b6f2c8a1d94f70b54e8c7a29016d43";
  assert.equal(fs.readFileSync(publicPath(`${key}.txt`), "utf8").trim(), key);
});

test("Service Workerは別ページの応答でアプリ本体を上書きしない", () => {
  const worker = fs.readFileSync(publicPath("service-worker.js"), "utf8");
  // キャッシュ名の整合は tests/service-worker.test.js が検証する。ここでは形式だけ確かめる。
  assert.match(worker, /const CACHE_NAME = "okumeter-v\d+-[0-9a-f]{8}"/);
  assert.doesNotMatch(worker, /"\/app-icon\.png"/);
  assert.match(worker, /url\.pathname === "\/" \? "\/index\.html" : request/);
  assert.doesNotMatch(worker, /cache\.put\("\/index\.html", copy\)/);
});

test("読み込むスクリプトとスタイルはService Workerの先読み対象に含まれる", () => {
  const html = fs.readFileSync(publicPath("index.html"), "utf8");
  const worker = fs.readFileSync(publicPath("service-worker.js"), "utf8");
  const referenced = [
    ...[...html.matchAll(/<script defer src="(\/[^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/<link rel="stylesheet" href="(\/[^"]+)"/g)].map((match) => match[1]),
  ].filter((entry) => !entry.startsWith("/_vercel/"));
  const missing = referenced.filter((entry) => !worker.includes(`"${entry}"`));
  assert.deepEqual(missing, [], `APP_SHELLへの追加漏れ: ${missing.join(", ")}`);
});
