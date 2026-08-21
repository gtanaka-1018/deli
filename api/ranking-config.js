"use strict";

function publicRankingConfig(environment = process.env) {
  const url = String(environment.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const publishableKey = String(
    environment.SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY || ""
  ).trim();

  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url) || publishableKey.length < 20) return null;
  return { url, publishableKey };
}

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function rankingConfigHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { available: false });
  }

  const config = publicRankingConfig();
  if (!config) {
    response.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    return json(response, 503, { available: false });
  }

  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return json(response, 200, { available: true, ...config });
}

module.exports = rankingConfigHandler;
module.exports.publicRankingConfig = publicRankingConfig;
