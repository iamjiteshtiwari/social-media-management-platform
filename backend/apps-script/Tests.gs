/**
 * Safe local self-tests. These tests do not create Google resources, call
 * providers, write to Sheets, or require any private credentials.
 * Run runBackendSelfTests manually in the Apps Script editor after importing.
 */
function runBackendSelfTests() {
  const results = [];
  const check = function (name, fn) {
    try {
      const passed = fn() === true;
      results.push({ name: name, passed: passed });
    } catch (error) {
      results.push({ name: name, passed: false, error: "TEST_FAILED" });
    }
  };

  check("master schemas have unique non-empty headers", function () {
    const schema = getMasterSchema_();
    return Object.keys(schema).length >= 4 &&
      Object.keys(schema).every(function (name) {
        const headers = schema[name];
        return Array.isArray(headers) && headers.length > 0 &&
          headers.every(function (header) { return typeof header === "string" && header.length > 0; }) &&
          new Set(headers).size === headers.length;
      });
  });

  check("operational schema includes the seven planned tabs", function () {
    const schema = getOperationalSchema_();
    const expected = [
      "Brands", "SocialAccounts", "Content", "PublishingQueue",
      "PublishingLogs", "MediaLibrary", "Notifications"
    ];
    return expected.every(function (name) {
      return Array.isArray(schema[name]) && schema[name].length > 0;
    }) && Object.keys(schema).length === expected.length;
  });

  check("operational schema preview matches the operational contract", function () {
    const preview = previewOperationalSchema();
    return preview.version === MASTER_SCHEMA_VERSION &&
      preview.sheets.length === Object.keys(getOperationalSchema_()).length &&
      preview.sheets.every(function (sheet) {
        return sheet.name && Array.isArray(sheet.headers) && sheet.headers.length > 0;
      });
  });

  check("user schema does not store raw passwords or provider tokens", function () {
    const headers = getMasterSchema_().Users.map(function (header) {
      return header.toLowerCase();
    });
    return !headers.some(function (header) {
      return header === "password" || header === "password_plaintext" ||
        header === "access_token" || header === "refresh_token";
    });
  });

  check("account schema supports login throttling and OTP challenges", function () {
    const schema = getMasterSchema_();
    return schema.Users.indexOf("login_failed_count") >= 0 &&
      schema.Users.indexOf("login_locked_until") >= 0 &&
      Array.isArray(schema.AuthChallenges) &&
      ["challenge_id", "user_id", "verifier_hash", "expires_at", "attempt_count", "consumed_at"].every(function (name) {
        return schema.AuthChallenges.indexOf(name) >= 0;
      });
  });

  check("PBKDF2-HMAC-SHA-256 matches the standard one-iteration vector", function () {
    const bytes = pbkdf2Sha256_("password", "salt", 1, 32);
    const hex = bytes.map(function (value) {
      return ("0" + ((value + 256) % 256).toString(16)).slice(-2);
    }).join("");
    return hex === "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17";
  });

  check("email normalization rejects malformed addresses", function () {
    return normalizeEmail_("USER@example.com") === "user@example.com" &&
      normalizeEmail_("not-an-email") === "";
  });

  check("only active, verified, approved accounts authenticate", function () {
    const base = { status: ACCOUNT_STATUS.ACTIVE, email_verified_at: "2026-01-01T00:00:00.000Z", approved_at: "2026-01-01T00:00:00.000Z", disabled_at: "", suspended_at: "", deleted_at: "" };
    return canAccountAuthenticate_(base) &&
      !canAccountAuthenticate_(Object.assign({}, base, { status: ACCOUNT_STATUS.SUSPENDED })) &&
      !canAccountAuthenticate_(Object.assign({}, base, { approved_at: "" }));
  });

  check("missing CAPTCHA token is rejected before configuration lookup", function () {
    const registration = verifyCaptcha_("", "registration");
    const login = verifyCaptcha_("", "login");
    return registration.ok === false && registration.code === "CAPTCHA_REQUIRED" &&
      login.ok === false && login.code === "CAPTCHA_REQUIRED";
  });

  check("public health response does not claim production readiness", function () {
    const health = getPublicHealth_();
    return health.ok === true &&
      health.status === "source_scaffold" &&
      health.capabilities.login === false &&
      health.capabilities.sessions === false &&
      health.capabilities.accountAdministration === false;
  });

  check("constant-time string comparison handles matching and non-matching values", function () {
    return constantTimeStringEquals_("same-value", "same-value") &&
      !constantTimeStringEquals_("same-value", "different-value") &&
      !constantTimeStringEquals_("", "non-empty");
  });

  check("account security policies match the agreed workflow", function () {
    return EMAIL_OTP_TTL_MS === 5 * 60 * 1000 &&
      EMAIL_OTP_MAX_ATTEMPTS === 5 &&
      EMAIL_OTP_RESEND_COOLDOWN_MS === 60 * 1000 &&
      SESSION_ABSOLUTE_LIFETIME_MS === 9 * 60 * 60 * 1000 &&
      PASSWORD_HASH_ALGORITHM === "PBKDF2-HMAC-SHA256" &&
      PASSWORD_HASH_ITERATIONS >= 100000;
  });

  const passed = results.filter(function (result) { return result.passed; }).length;
  return {
    ok: passed === results.length,
    passed: passed,
    total: results.length,
    results: results
  };
}
