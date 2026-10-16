/**
 * Apps Script request router.
 *
 * Public registration/OTP routes require an explicit private feature flag.
 * Login/session responses remain disabled until secure browser credential
 * transport is selected and reviewed. Never enable those routes by changing
 * a flag alone.
 */
function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || "health") : "health";
  if (action === "health") return jsonResponse_(getPublicHealth_());
  return jsonResponse_({ ok: false, code: "ACTION_NOT_AVAILABLE", message: "This operation is not enabled." });
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
  if (action === "health") return jsonResponse_(getPublicHealth_());

  try {
    if (action === "register" || action === "verifyEmail" || action === "resendEmailCode") {
      if (getPrivateProperty_(AppConfig.PROPERTY.ENABLE_PUBLIC_REGISTRATION) !== "YES") {
        return jsonResponse_({ ok: false, code: "REGISTRATION_NOT_ENABLED", message: "Account registration is not available yet." });
      }
      if (action === "register") {
        return jsonResponse_(registerAccount_(normalizeCaptchaField_(payload)));
      }
      if (action === "verifyEmail") {
        return jsonResponse_(verifyRegistrationEmailOtp_(payload));
      }
      return jsonResponse_(resendRegistrationEmailOtp_(normalizeCaptchaField_(payload)));
    }

    if (action === "requestPasswordReset" || action === "resetPassword") {
      if (getPrivateProperty_(AppConfig.PROPERTY.ENABLE_PUBLIC_RECOVERY) !== "YES") {
        return jsonResponse_({ ok: false, code: "RECOVERY_NOT_ENABLED", message: "Password recovery is not available yet." });
      }
      return jsonResponse_(action === "requestPasswordReset"
        ? requestPasswordReset_(normalizeCaptchaField_(payload))
        : resetPassword_(normalizeCaptchaField_(payload)));
    }

    if (action === "login" || action === "logout" || action === "getSession" ||
        action === "deleteOwnAccount" || action === "adminApproveUser" ||
        action === "adminSetAccountStatus") {
      return jsonResponse_({
        ok: false,
        code: "AUTH_TRANSPORT_NOT_CONFIGURED",
        message: "Secure account access is not enabled yet."
      });
    }

    return jsonResponse_({ ok: false, code: "ACTION_NOT_AVAILABLE", message: "This operation is not enabled." });
  } catch (error) {
    // Never return exception text, spreadsheet details, or stack traces.
    console.error("API_OPERATION_FAILED:" + action);
    return jsonResponse_({ ok: false, code: "TEMPORARILY_UNAVAILABLE", message: "The request could not be completed. Please try again later." });
  }
}

function normalizeCaptchaField_(payload) {
  const normalized = Object.assign({}, payload);
  if (!normalized.captchaToken) normalized.captchaToken = String(payload.captcha_token || "");
  return normalized;
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
