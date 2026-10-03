/* First-party pageviews. Only active when a self-hosted endpoint is configured. */
(function () {
  "use strict";
  var script = document.currentScript;
  var endpoint = script && script.getAttribute("data-endpoint");
  if (!endpoint || window.navigator.doNotTrack === "1" || window.navigator.globalPrivacyControl || window.navigator.webdriver) return;
  var localHosts = ["localhost", "127.0.0.1", "::1"];
  if (localHosts.indexOf(window.location.hostname) !== -1 && script.getAttribute("data-allow-local") !== "true") return;
  var key = "owned-analytics-v1";
  var state = null;
  var preference = new URLSearchParams(window.location.search).get("analytics");
  try {
    if (preference === "off") {
      window.localStorage.setItem("owned-analytics-opt-out", "1");
      window.localStorage.removeItem(key);
    } else if (preference === "on") window.localStorage.removeItem("owned-analytics-opt-out");
  } catch (error) { /* The query preference still applies to this page. */ }
  if (preference === "off") return;
  function identifier() {
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    var bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }
  function send() {
    if (document.visibilityState === "prerender" || document.visibilityState === "hidden") return;
    try {
      if (window.localStorage.getItem("owned-analytics-opt-out") === "1") return;
    } catch (error) { /* Storage may be unavailable; use an in-memory identity. */ }
    var now = Date.now();
    try { state = JSON.parse(window.localStorage.getItem(key)) || state; } catch (error) { /* Keep the in-memory state. */ }
    if (!state || typeof state !== "object" || !state.visitor || !state.created || now - state.created > 365 * 86400000) {
      state = { visitor: identifier(), created: now };
    }
    var params = new URLSearchParams(window.location.search);
    if (!state.session || !state.last || now - state.last > 30 * 60000) {
      state.session = identifier();
      try { state.referrer = document.referrer ? new URL(document.referrer).origin : ""; }
      catch (error) { state.referrer = ""; }
      state.source = params.get("utm_source") || "";
      state.medium = params.get("utm_medium") || "";
      state.campaign = params.get("utm_campaign") || "";
    }
    state.last = now;
    try { window.localStorage.setItem(key, JSON.stringify(state)); } catch (error) { /* Still count this page. */ }
    var event = {
      event_id: identifier(), visitor_id: state.visitor, session_id: state.session,
      path: window.location.pathname, referrer: state.referrer || "",
      utm_source: state.source || "", utm_medium: state.medium || "",
      utm_campaign: state.campaign || "", language: window.navigator.language || ""
    };
    // text/plain allows a simple cross-origin request, without a preflight.
    window.fetch(endpoint, {
      method: "POST", body: JSON.stringify(event),
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      credentials: "omit", keepalive: true, mode: "cors"
    }).catch(function () { /* Analytics failure must not affect the page. */ });
  }
  var recorded = false;
  function recordVisiblePage() {
    if (!recorded && document.visibilityState !== "hidden" && document.visibilityState !== "prerender") {
      recorded = true;
      try { send(); } catch (error) { /* Missing browser APIs must not break the page. */ }
    }
  }
  recordVisiblePage();
  document.addEventListener("visibilitychange", recordVisiblePage);
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) { recorded = false; recordVisiblePage(); }
  });
}());
