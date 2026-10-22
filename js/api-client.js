/* Frontend API boundary for the Social Media Management Platform.
 * Configure window.SMM_CONFIG.apiUrl only after the backend transport is reviewed.
 * Never store credentials, session tokens, or provider secrets in this file.
 */
"use strict";
(() => {
  const config = () => window.SMM_CONFIG && typeof window.SMM_CONFIG === "object" ? window.SMM_CONFIG : {};
  const safeMessage = (code) => ({
    API_NOT_CONFIGURED: "This account action is not available yet. Your information has not been sent.",
    INVALID_REQUEST: "Please check the information and try again.",
    REGISTRATION_NOT_ENABLED: "Account registration is not available yet.",
    RECOVERY_NOT_ENABLED: "Password recovery is not available yet.",
    AUTH_TRANSPORT_NOT_CONFIGURED: "Secure sign-in is not enabled yet.",
    ACTION_NOT_AVAILABLE: "This action is not available yet.",
    TEMPORARILY_UNAVAILABLE: "The service is temporarily unavailable. Please try again later."
  }[code] || "The request could not be completed. Please try again later.");

  async function request(action, payload = {}) {
    const endpoint = String(config().apiUrl || "").trim();
    if (!endpoint) {
      return { ok: false, code: "API_NOT_CONFIGURED", message: safeMessage("API_NOT_CONFIGURED") };
    }
    let url;
    try {
      url = new URL(endpoint);
      if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
    } catch (_) {
      return { ok: false, code: "API_NOT_CONFIGURED", message: safeMessage("API_NOT_CONFIGURED") };
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : null;
    try {
      const response = await fetch(url.href, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, action }),
        signal: controller ? controller.signal : undefined,
        cache: "no-store",
        redirect: "follow"
      });
      let result;
      try { result = await response.json(); }
      catch (_) { return { ok: false, code: "INVALID_RESPONSE", message: "The service returned an unreadable response." }; }
      if (!response.ok) return { ok: false, code: "HTTP_ERROR", message: safeMessage("TEMPORARILY_UNAVAILABLE") };
      return result && typeof result === "object" ? result : { ok: false, code: "INVALID_RESPONSE", message: "The service returned an unreadable response." };
    } catch (error) {
      const aborted = error && error.name === "AbortError";
      return { ok: false, code: aborted ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", message: aborted ? "The request timed out. Please try again." : "Could not reach the service. Check your connection and try again." };
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  }

  window.SMMApi = Object.freeze({ request });
})();
