const test = require("node:test");
const assert = require("node:assert/strict");

const { detectSource, rewriteEvent } = require("../public/referral.js");

test("UTMパラメーターからX・Instagram・アプリ共有の流入を識別する", () => {
  assert.equal(detectSource("https://okumeter.com/?utm_source=x"), "x");
  assert.equal(detectSource("https://okumeter.com/?utm_source=twitter"), "x");
  assert.equal(detectSource("https://okumeter.com/?utm_source=instagram"), "instagram");
  assert.equal(detectSource("https://okumeter.com/?utm_source=ig"), "instagram");
  assert.equal(detectSource("https://okumeter.com/?utm_source=share"), "share");
});

test("UTMがない場合は参照元ドメインから流入を識別する", () => {
  assert.equal(detectSource("https://okumeter.com/", "https://t.co/example"), "x");
  assert.equal(detectSource("https://okumeter.com/", "https://l.instagram.com/redirect"), "instagram");
  assert.equal(detectSource("https://okumeter.com/", "https://example.com/"), "");
});

test("識別した流入元を匿名の分析用パスへ置き換える", () => {
  const rewritten = rewriteEvent({ url: "https://okumeter.com/?utm_source=x&utm_campaign=launch", type: "pageview" }, "x");
  assert.equal(rewritten.url, "https://okumeter.com/referral/x");
  assert.equal(rewritten.type, "pageview");

  const shared = rewriteEvent({ url: "https://okumeter.com/?utm_source=share&utm_medium=referral", type: "pageview" }, "share");
  assert.equal(shared.url, "https://okumeter.com/referral/share");
});

test("エラビベース流入は固定パスへ集約し、クエリやフラグメントを分析URLへ残さない", () => {
  const landing = "https://okumeter.com/?utm_source=erabibase&utm_content=gear#private-note";
  assert.equal(detectSource(landing), "erabibase");
  assert.equal(detectSource("https://okumeter.com/", "https://erabibase.com/nmax125-vs-pcx125/"), "erabibase");
  assert.equal(detectSource("https://okumeter.com/", "https://erabibase.com.example.org/"), "");
  assert.equal(rewriteEvent({ url: landing, type: "pageview" }, "erabibase").url, "https://okumeter.com/referral/erabibase");
});
