/**
 * Apps Script JSON entry point.
 *
 * Public registration/OTP routes are feature-gated and remain off until the
 * owner has configured Script Properties and explicitly enables them.
 * Login is not exposed yet: the browser-safe session transport is unresolved.
 */
function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || "health") : "health";
  if (action !== "health") {
    return jsonResponse_({ ok: false, code: "ACTION_NOT_AVAILABLE", message: "This operation is not enabled." });
  }
  return jsonResponse_(getPublicHealth_());
}

function doPost(e) {
  let payload;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error("EMPTY_BODY");
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_BODY");
  } catch (error) {
    return jsonResponse_({ ok: false, code: "INVALID_REQUEST", message: "A valid JSON request body is required." });
  }

  const action = String(payload.action || "");
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;

  try {
    if (action === "health") return jsonResponse_(getPublicHealth_());

    if (action === "register" || action === "verify_email_otp" || action === "resend_email_otp") {
      if (getPrivateProperty_(AppConfig.PROPERTY.ENABLE_PUBLIC_REGISTRATION) !== "YES") {
        return jsonResponse_({ ok: false, code: "OPERATION_NOT_ENABLED", message: "Account registration is not enabled yet." });
      }

      let result;
      if (action === "register") {
        result = registerAccount_(data);
      } else if (action === "verify_email_otp") {
        result = verifyRegistrationEmailOtp_(data);
      } else {
        result = resendRegistrationEmailOtp_(data);
      }
      return jsonResponse_(publicAuthResponse_(result));
    }

    // Never expose a session token until the selected browser transport is safe.
    if (action === "login" || action === "logout" || action === "session") {
      return jsonResponse_({
        ok: false,
        code: "AUTH_TRANSPORT_NOT_CONFIGURED",
        message: "Secure account access is not enabled yet."
      });
    }

    return jsonResponse_({ ok: false, code: "OPERATION_NOT_ENABLED", message: "This operation is not enabled yet." });
  } catch (error) {
    const errorCode = String(error && error.message || "");
    if (errorCode === "INVALID_REGISTRATION" || errorCode === "PASSWORD_POLICY_FAILED") {
      return jsonResponse_({ ok: false, code: "INVALID_REGISTRATION", message: "Please review the required account details." });
    }
    // Keep configuration errors, spreadsheet details and provider diagnostics private.
    console.error("AUTH_REQUEST_FAILED:" + safeErrorCategory_(errorCode));
    return jsonResponse_({ ok: false, code: "SERVICE_NOT_READY", message: "The account service is temporarily unavailable." });
  }
}

function publicAuthResponse_(result) {
  if (!result || typeof result !== "object") {
    return { ok: false, code: "REQUEST_NOT_AVAILABLE", message: "The request could not be completed." };
  }
  const allowedCodes = {
    VERIFICATION_REQUIRED: "Check your email for the verification code.",
    EMAIL_VERIFIED: "Your email is verified. Your account is waiting for approval.",
    VERIFICATION_SENT: "If the account is eligible, a verification code has been sent.",
    CAPTCHA_REQUIRED: "Please complete the CAPTCHA.",
    CAPTCHA_INVALID: "CAPTCHA verification failed. Please try again.",
    CAPTCHA_PROVIDER_UNAVAILABLE: "CAPTCHA verification is temporarily unavailable.",
    CAPTCHA_HOSTNAME_MISMATCH: "CAPTCHA verification failed. Please refresh and try again.",
    CAPTCHA_SCORE_TOO_LOW: "CAPTCHA verification failed. Please try again.",
    CAPTCHA_ACTION_MISMATCH: "CAPTCHA verification failed. Please try again.",
    RESEND_COOLDOWN: "Please wait before requesting another code.",
    INVALID_VERIFICATION: "The code is invalid or expired. Request a new code and try again.",
    ACCOUNT_DETAILS_UNAVAILABLE: "Those account details cannot be used. Try signing in or use different details.",
    REQUEST_NOT_AVAILABLE: "The request could not be completed."
  };
  const code = String(result.code || "REQUEST_NOT_AVAILABLE");
  return {
    ok: result.ok === true,
    code: code,
    message: allowedCodes[code] || (result.ok ? "Request completed." : "The request could not be completed."),
    nextStep: result.nextStep || undefined
  };
}

function safeErrorCategory_(message) {
  const value = String(message || "");
  if (value.indexOf("MISSING_PRIVATE_CONFIGURATION:") === 0) return "MISSING_CONFIGURATION";
  if (value.indexOf("REQUIRED_SHEET_MISSING:") === 0) return "SHEET_NOT_READY";
  if (value.indexOf("SHEET_SCHEMA_MISSING:") === 0 || value.indexOf("SHEET_FIELD_NOT_FOUND:") === 0) return "SCHEMA_NOT_READY";
  if (value.indexOf("Exception") >= 0 || value.indexOf("Service") >= 0) return "GOOGLE_SERVICE_ERROR";
  return "INTERNAL_ERROR";
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
