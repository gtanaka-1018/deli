const test = require("node:test");
const assert = require("node:assert/strict");

const { publicRankingConfig } = require("../api/ranking-config.js");

test("公開可能なSupabase接続情報だけを返す", () => {
  assert.deepEqual(publicRankingConfig({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_12345678901234567890",
    SUPABASE_SERVICE_ROLE_KEY: "never-publish-this",
  }), {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_12345678901234567890",
  });
});

test("接続情報が不正または不足している場合は公開しない", () => {
  assert.equal(publicRankingConfig({}), null);
  assert.equal(publicRankingConfig({
    SUPABASE_URL: "http://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "too-short",
  }), null);
});
