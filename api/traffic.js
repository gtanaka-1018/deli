"use strict";

const ANALYTICS_ENDPOINT = "https://api.vercel.com/v1/query/web-analytics/visits/count";
const ANALYTICS_FILTER = "environment eq 'production' and requestPath eq '/'";

function analyticsUrl(projectId, teamId = "") {
  const url = new URL(ANALYTICS_ENDPOINT);
  url.searchParams.set("projectId", projectId);
  if (teamId) url.searchParams.set("teamId", teamId);
  url.searchParams.set("filter", ANALYTICS_FILTER);
  return url;
}

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function normalizeMetrics(payload) {
  const data = payload?.data;
  const pageviews = Number(data?.pageviews);
  const visitors = Number(data?.visitors);
  if (!Number.isFinite(pageviews) || !Number.isFinite(visitors)) return null;
  return {
    pageviews: Math.max(0, Math.trunc(pageviews)),
    visitors: Math.max(0, Math.trunc(visitors)),
    since: typeof payload?.query?.since === "string" ? payload.query.since : null,
  };
}

async function trafficHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { available: false });
  }

  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID || process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID || process.env.VERCEL_ORG_ID;

  if (!token || !projectId) {
    response.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    return json(response, 503, { available: false });
  }

  const url = analyticsUrl(projectId, teamId);

  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`analytics response ${upstream.status}`);

    const metrics = normalizeMetrics(await upstream.json());
    if (!metrics) throw new Error("analytics response shape");

    response.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return json(response, 200, {
      available: true,
      ...metrics,
      scope: "production-root",
      visitorDefinition: "anonymous-request-hash-24h",
      updatedAt: new Date().toISOString(),
    });
  } catch {
    response.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    return json(response, 502, { available: false });
  }
}

module.exports = trafficHandler;
module.exports.normalizeMetrics = normalizeMetrics;
module.exports.analyticsUrl = analyticsUrl;
module.exports.ANALYTICS_FILTER = ANALYTICS_FILTER;
