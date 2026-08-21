const test = require("node:test");
const assert = require("node:assert/strict");

const { ANALYTICS_FILTER, analyticsUrl, normalizeMetrics } = require("../api/traffic.js");

test("公開アクセス集計から安全な整数値だけを取り出す", () => {
  assert.deepEqual(normalizeMetrics({
    data: { pageviews: 123.9, visitors: 45 },
    query: { since: "2026-08-01T00:00:00.000Z" },
  }), {
    pageviews: 123,
    visitors: 45,
    since: "2026-08-01T00:00:00.000Z",
  });
});

test("不正な集計レスポンスは公開しない", () => {
  assert.equal(normalizeMetrics({ data: { pageviews: "not-a-number", visitors: 2 } }), null);
  assert.equal(normalizeMetrics(null), null);
});

test("公開集計は本番環境のトップページだけに限定する", () => {
  const url = analyticsUrl("project_123", "team_456");
  assert.equal(url.searchParams.get("projectId"), "project_123");
  assert.equal(url.searchParams.get("teamId"), "team_456");
  assert.equal(url.searchParams.get("filter"), ANALYTICS_FILTER);
  assert.equal(ANALYTICS_FILTER, "environment eq 'production' and requestPath eq '/'");
});
