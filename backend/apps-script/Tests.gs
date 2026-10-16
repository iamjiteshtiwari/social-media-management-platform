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

  check("missing CAPTCHA token is rejected before configuration lookup", function () {
    const registration = verifyCaptcha_("", "registration");
    const login = verifyCaptcha_("", "login");
    return registration.ok === false && registration.code === "CAPTCHA_REQUIRED" &&
      login.ok === false && login.code === "CAPTCHA_REQUIRED";
  });

  check("public health response does not claim production readiness", function () {
    const health = getPublicHealth_();
    return health.ok === true &&
      health.status === "scaffold" &&
      health.capabilities.registration === false &&
      health.capabilities.login === false &&
      health.capabilities.sessions === false;
  });

  const passed = results.filter(function (result) { return result.passed; }).length;
  return {
    ok: passed === results.length,
    passed: passed,
    total: results.length,
    results: results
  };
}
