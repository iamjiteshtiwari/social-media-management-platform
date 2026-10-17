/**
 * Safe local self-tests. These tests do not create Google resources, call
 * providers, write to Sheets, or require private credentials.
 * Run runBackendSelfTests manually in the Apps Script editor after import.
 */
function runBackendSelfTests() {
  const results = [];
  const check = function (name, fn) {
    try {
      results.push({ name: name, passed: fn() === true });
    } catch (error) {
      results.push({ name: name, passed: false, error: "TEST_FAILED" });
    }
  };

  check("master schema contains the canonical and supporting tabs", function () {
    const schema = getMasterSchema_();
    const expected = [
      "Users", "UserResources", "SocialConnections", "AppConfig",
      "AuthRecords", "AuditLogs", "Sessions", "AuthChallenges"
    ];
    return expected.length === Object.keys(schema).length &&
      expected.every(function (name) {
        return Array.isArray(schema[name]) && schema[name].length > 0;
      });
  });

  check("all master schema headers are unique and non-empty", function () {
    const schema = getMasterSchema_();
    return Object.keys(schema).every(function (name) {
      const headers = schema[name];
      return headers.every(function (header) {
        return typeof header === "string" && header.length > 0;
      }) && new Set(headers).size === headers.length;
    });
  });

  check("operational schema matches the seven approved tabs", function () {
    const schema = getOperationalSchema_();
    const expected = [
      "Brands", "Posts", "PostTargets", "MediaLibrary",
      "PostMedia", "PublishingLogs", "Settings"
    ];
    return expected.length === Object.keys(schema).length &&
      expected.every(function (name) {
        return Array.isArray(schema[name]) && schema[name].length > 0;
      });
  });

  check("operational preview reflects the canonical contract version", function () {
    const preview = previewOperationalSchema();
    return preview.version === MASTER_SCHEMA_VERSION &&
      preview.sheets.length === Object.keys(getOperationalSchema_()).length &&
      preview.sheets.every(function (sheet) {
        return sheet.name && Array.isArray(sheet.headers) && sheet.headers.length > 0;
      });
  });

  check("Users contains no credential or lockout fields", function () {
    const headers = getMasterSchema_().Users;
    const forbidden = [
      "password_hash", "password_salt", "password_hash_algorithm",
      "password_hash_iterations", "password_changed_at",
      "failed_login_count", "login_locked_until", "access_token", "refresh_token"
    ];
    return forbidden.every(function (name) { return headers.indexOf(name) < 0; }) &&
      ["user_id", "email", "role", "account_status", "registration_status"].every(function (name) {
        return headers.indexOf(name) >= 0;
      });
  });

  check("AuthRecords contains custom-password and lockout fields", function () {
    const headers = getMasterSchema_().AuthRecords;
    return [
      "auth_record_id", "user_id", "auth_method", "password_hash",
      "password_salt", "password_hash_algorithm", "password_hash_iterations",
      "password_changed_at", "failed_login_count", "login_locked_until"
    ].every(function (name) { return headers.indexOf(name) >= 0; });
  });

  check("session and challenge records contain only verifiers, never raw credentials", function () {
    const schema = getMasterSchema_();
    return schema.Sessions.indexOf("credential_verifier") >= 0 &&
      schema.Sessions.indexOf("token") < 0 &&
      schema.AuthChallenges.indexOf("verifier_hash") >= 0 &&
      schema.AuthChallenges.indexOf("otp") < 0;
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
    const base = {
      account_status: ACCOUNT_STATUS.ACTIVE,
      email_verified: true,
      email_verified_at: "2026-01-01T00:00:00.000Z",
      approved_at: "2026-01-01T00:00:00.000Z",
      disabled_at: "",
      suspended_at: "",
      deleted_at: ""
    };
    return canAccountAuthenticate_(base) &&
      !canAccountAuthenticate_(Object.assign({}, base, { account_status: ACCOUNT_STATUS.SUSPENDED })) &&
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

  check("incomplete registration is detected without permitting credential takeover", function () {
    const pending = {
      user_id: "user-test",
      account_status: ACCOUNT_STATUS.PENDING_EMAIL,
      email_verified: false
    };
    return isIncompletePendingRegistration_(pending, false) === true &&
      isIncompletePendingRegistration_(pending, true) === false &&
      isIncompletePendingRegistration_(Object.assign({}, pending, {
        account_status: ACCOUNT_STATUS.ACTIVE
      }), false) === false &&
      isIncompletePendingRegistration_(Object.assign({}, pending, {
        email_verified: true
      }), false) === false &&
      isIncompletePendingRegistration_(null, false) === false;
  });

  check("media retention schema supports protected cleanup", function () {
    const schema = getOperationalSchema_();
    return MEDIA_RETENTION_DAYS === 30 &&
      ["media_id", "drive_file_id", "uploaded_at", "status", "retention_status", "cleanup_eligible_at", "last_referenced_at"]
        .every(function (header) { return schema.MediaLibrary.indexOf(header) >= 0; }) &&
      schema.PostMedia.indexOf("media_id") >= 0 &&
      schema.PostMedia.indexOf("post_id") >= 0;
  });

  check("operational service fields match the canonical schema", function () {
    const schema = getOperationalSchema_();
    return ["brand_id", "brand_name", "timezone", "status"].every(function (key) {
      return schema.Brands.indexOf(key) >= 0;
    }) &&
      ["post_id", "brand_id", "caption", "first_comment", "content_type", "status", "scheduled_at_utc", "deleted_at"]
        .every(function (key) { return schema.Posts.indexOf(key) >= 0; }) &&
      ["post_id", "platform_status", "next_retry_at", "updated_at"]
        .every(function (key) { return schema.PostTargets.indexOf(key) >= 0; });
  });

  check("media service fields match the canonical storage contract", function () {
    const schema = getOperationalSchema_();
    return ["media_id", "drive_file_id", "file_name", "mime_type", "media_type", "size_bytes",
      "status", "uploaded_at", "updated_at", "retention_status"].every(function (key) {
        return schema.MediaLibrary.indexOf(key) >= 0;
      }) && schema.PostMedia.indexOf("media_id") >= 0;
  });

  check("media uploads validate declared MIME against file signature", function () {
    return isAllowedMediaSignature_([0xFF, 0xD8, 0xFF, 0x00], "image/jpeg") &&
      isAllowedMediaSignature_([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png") &&
      isAllowedMediaSignature_([0x1A, 0x45, 0xDF, 0xA3], "video/webm") &&
      !isAllowedMediaSignature_([0x00, 0x01, 0x02, 0x03], "image/jpeg");
  });

  const passed = results.filter(function (result) { return result.passed; }).length;
  return {
    ok: passed === results.length,
    passed: passed,
    total: results.length,
    results: results
  };
}


/**
 * Safe deployment-readiness check for CAPTCHA configuration.
 * Reports only booleans and a hostname; never returns private site secrets.
 * This does not contact Google or enable public routes.
 */
function testCaptchaConfigurationReadiness() {
  const properties = PropertiesService.getScriptProperties();
  const registrationSecret = String(
    properties.getProperty(AppConfig.PROPERTY.REGISTRATION_CAPTCHA_SECRET) || ""
  ).trim();
  const loginSecret = String(
    properties.getProperty(AppConfig.PROPERTY.LOGIN_CAPTCHA_SECRET) || ""
  ).trim();
  const hostname = getAllowedHostname_();
  let scoreValid = false;

  try {
    const score = parseCaptchaMinScore_();
    scoreValid = Number.isFinite(score) && score >= 0 && score <= 1;
  } catch (error) {
    scoreValid = false;
  }

  const result = {
    registrationSecretConfigured: registrationSecret.length > 0,
    loginSecretConfigured: loginSecret.length > 0,
    expectedHostnameConfigured: hostname === AppConfig.APP_HOSTNAME_DEFAULT,
    expectedHostname: hostname,
    scoreConfigurationValid: scoreValid,
    publicRegistrationEnabled: getPrivateProperty_(AppConfig.PROPERTY.ENABLE_PUBLIC_REGISTRATION) === "YES",
    note: "Readiness only. No CAPTCHA token was verified, no email was sent, and no public route was enabled."
  };

  result.ready = result.registrationSecretConfigured &&
    result.loginSecretConfigured &&
    result.expectedHostnameConfigured &&
    result.scoreConfigurationValid;

  return result;
}
