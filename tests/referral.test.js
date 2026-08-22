const test = require("node:test");
const assert = require("node:assert/strict");

const { detectSource, rewriteEvent } = require("../public/referral.js");

test("UTMパラメーターからXとInstagramの流入を識別する", () => {
  assert.equal(detectSource("https://okumeter.com/?utm_source=x"), "x");
  assert.equal(detectSource("https://okumeter.com/?utm_source=twitter"), "x");
  assert.equal(detectSource("https://okumeter.com/?utm_source=instagram"), "instagram");
  assert.equal(detectSource("https://okumeter.com/?utm_source=ig"), "instagram");
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
});
