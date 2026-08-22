"use strict";

((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root) return;
  root.DeliReferralAnalytics = api;
  api.configure(root);
})(typeof window !== "undefined" ? window : null, () => {
  const SOURCE_PATHS = Object.freeze({
    x: "/referral/x",
    instagram: "/referral/instagram",
  });

  function normalizedSource(value) {
    const source = String(value || "").trim().toLowerCase();
    if (["x", "x.com", "twitter", "twitter.com", "tweet"].includes(source)) return "x";
    if (["instagram", "instagram.com", "insta", "ig"].includes(source)) return "instagram";
    return "";
  }

  function sourceFromReferrer(referrer) {
    if (!referrer) return "";
    try {
      const hostname = new URL(referrer).hostname.toLowerCase();
      if (hostname === "t.co" || hostname === "x.com" || hostname.endsWith(".x.com")
        || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) return "x";
      if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram";
    } catch {
      return "";
    }
    return "";
  }

  function detectSource(locationUrl, referrer = "") {
    try {
      const source = normalizedSource(new URL(locationUrl).searchParams.get("utm_source"));
      if (source) return source;
    } catch {
      // Fall through to the referrer when the location is unavailable or malformed.
    }
    return sourceFromReferrer(referrer);
  }

  function rewriteEvent(event, source) {
    const path = SOURCE_PATHS[source];
    if (!path || !event || typeof event.url !== "string") return event;
    try {
      const url = new URL(event.url);
      url.pathname = path;
      url.search = "";
      url.hash = "";
      return { ...event, url: url.toString() };
    } catch {
      return event;
    }
  }

  function configure(browser) {
    browser.va = browser.va || function queueVercelAnalytics() {
      (browser.vaq = browser.vaq || []).push(arguments);
    };
    const source = detectSource(browser.location?.href || "", browser.document?.referrer || "");
    browser.va("beforeSend", (event) => rewriteEvent(event, source));
    return source;
  }

  return { SOURCE_PATHS, configure, detectSource, rewriteEvent };
});
