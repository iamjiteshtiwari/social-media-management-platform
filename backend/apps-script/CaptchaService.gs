/**
 * Server-side Google reCAPTCHA verifier.
 *
 * Supports classic checkbox-style responses and score/action responses.
 * The caller must invoke this before any registration/login side effect.
 * A token should be verified once only; Google tokens expire quickly and
 * cannot be safely reused. Never log the token or the private secret.
 */
function verifyCaptcha_(token, purpose) {
  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, code: "CAPTCHA_REQUIRED" };
  }

  const config = getCaptchaConfiguration_(purpose);
  let providerResponse;

  try {
    const response = UrlFetchApp.fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "post",
      payload: {
        secret: config.secret,
        response: token.trim()
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return { ok: false, code: "CAPTCHA_PROVIDER_UNAVAILABLE" };
    }

    providerResponse = JSON.parse(response.getContentText());
  } catch (error) {
    // Restricted diagnostics may record a sanitized error category only.
    console.error("CAPTCHA_PROVIDER_REQUEST_FAILED");
    return { ok: false, code: "CAPTCHA_PROVIDER_UNAVAILABLE" };
  }

  if (!providerResponse || providerResponse.success !== true) {
    return { ok: false, code: "CAPTCHA_INVALID" };
  }

  const actualHostname = String(providerResponse.hostname || "").toLowerCase();
  if (!actualHostname || actualHostname !== config.expectedHostname) {
    return { ok: false, code: "CAPTCHA_HOSTNAME_MISMATCH" };
  }

  // Score-based keys provide score/action fields. Checkbox-style keys may not.
  const hasScore = typeof providerResponse.score === "number";
  if (hasScore && providerResponse.score < config.minScore) {
    return { ok: false, code: "CAPTCHA_SCORE_TOO_LOW" };
  }

  if (config.expectedAction) {
    const actualAction = String(providerResponse.action || "");
    if (!actualAction || actualAction !== config.expectedAction) {
      return { ok: false, code: "CAPTCHA_ACTION_MISMATCH" };
    }
  }

  // Do not return provider payload, token, secret, or detailed error codes.
  return {
    ok: true,
    code: "CAPTCHA_VERIFIED",
    purpose: String(purpose).toLowerCase()
  };
}
