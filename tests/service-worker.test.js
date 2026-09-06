"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Service Worker は配信ファイルをキャッシュ優先で返す。キャッシュ名を変えずに
// 中身だけ差し替えると、利用者の端末には古い画面が残り続ける。
// ここでキャッシュ名と配信内容を突き合わせ、更新漏れを検出する。
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const WORKER_PATH = path.join(PUBLIC_DIR, "service-worker.js");

function readWorker() {
  return fs.readFileSync(WORKER_PATH, "utf8");
}

function appShellPaths(worker) {
  const start = worker.indexOf("APP_SHELL");
  const list = worker.slice(start, worker.indexOf("];", start));
  return [...list.matchAll(/"\/([^"]*)"/g)].map((match) => match[1]).filter((entry) => entry !== "");
}

function appShellHash(paths) {
  const hash = crypto.createHash("sha256");
  [...paths].sort().forEach((entry) => {
    hash.update(entry);
    hash.update(fs.readFileSync(path.join(PUBLIC_DIR, entry)));
  });
  return hash.digest("hex").slice(0, 8);
}

test("先読み対象のファイルはすべて存在する", () => {
  const paths = appShellPaths(readWorker());
  assert.ok(paths.length > 0, "APP_SHELLを読み取れませんでした");
  const missing = paths.filter((entry) => !fs.existsSync(path.join(PUBLIC_DIR, entry)));
  assert.deepEqual(missing, [], `存在しないファイル: ${missing.join(", ")}`);
});

test("キャッシュ名は配信内容と一致している", () => {
  const worker = readWorker();
  const declared = worker.match(/const CACHE_NAME = "([^"]+)"/);
  assert.ok(declared, "CACHE_NAMEを読み取れませんでした");

  const expected = appShellHash(appShellPaths(worker));
  const actual = declared[1];

  assert.ok(
    actual.endsWith(`-${expected}`),
    [
      "配信ファイルを変更したのにキャッシュ名が更新されていません。",
      "このままだと利用者の端末に古い画面が残ります。",
      `public/service-worker.js の CACHE_NAME を "okumeter-vXX-${expected}" に更新してください`,
      `（XX は現在の版数以上。今の値: ${actual}）`,
    ].join("\n")
  );
});
