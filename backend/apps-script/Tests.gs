
/**
 * Safe local self-tests.
 *
 * These tests do not create Google resources, call providers,
 * write to Sheets, or require private credentials.
 *
 * Run runBackendSelfTests manually in the Apps Script editor.
 */

function runBackendSelfTests() {
  const results = [];

  const check = function (name, fn) {
    try {
      results.push({
        name: name,
        passed: fn() === true
      });
    } catch (error) {
      console.log("Test error in " + name + ": " + String(error));
      results.push({
        name: name,
        passed: false,
        error: "TEST_FAILED"
      });
    }
  };


  check("master schema contains the canonical and supporting tabs", function () {
    const schema = getMasterSchema_();

    const expected = [
      "Users", "UserResources", "SocialConnections", "AppConfig",
      "AuthRecords", "AuditLogs", "Sessions", "AuthChallenges",
      "OAuthStates"
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
        return sheet.name &&
          Array.isArray(sheet.headers) &&
          sheet.headers.length > 0;
      });
  });

  check("Users contains no credential or lockout fields", function () {
    const headers = getMasterSchema_().Users;
    const forbidden = [
      "password_hash", "password_salt", "password_hash_algorithm",
      "password_hash_iterations", "password_changed_at",
      "failed_login_count", "login_locked_until",
      "access_token", "refresh_token"
    ];

    return forbidden.every(function (name) {
      return headers.indexOf(name) < 0;
    }) &&
      [
        "user_id", "email", "role",
        "account_status", "registration_status"
      ].every(function (name) {
        return headers.indexOf(name) >= 0;
      });
  });

  check("AuthRecords contains custom-password and lockout fields", function () {
    const headers = getMasterSchema_().AuthRecords;

    return [
      "auth_record_id", "user_id", "auth_method", "password_hash",
      "password_salt", "password_hash_algorithm",
      "password_hash_iterations", "password_changed_at",
      "failed_login_count", "login_locked_until"
    ].every(function (name) {
      return headers.indexOf(name) >= 0;
    });
  });

  check("session and challenge records contain only verifiers, never raw credentials", function () {
    const schema = getMasterSchema_();

    return schema.Sessions.indexOf("credential_verifier") >= 0 &&
      schema.Sessions.indexOf("token") < 0 &&
      schema.AuthChallenges.indexOf("verifier_hash") >= 0 &&
      schema.AuthChallenges.indexOf("otp") < 0;
  });

  check("PBKDF2-HMAC-SHA-256 matches the standard one-iteration vector", function () {
    const actualBytes = pbkdf2Sha256_("password", "salt", 1, 32);

    const actualHex = actualBytes.map(function (value) {
      return ("0" + ((value + 256) % 256).toString(16)).slice(-2);
    }).join("");

    const expectedHex =
      "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b";

    return actualHex === expectedHex;
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
      !canAccountAuthenticate_(Object.assign({}, base, {
        account_status: ACCOUNT_STATUS.SUSPENDED
      })) &&
      !canAccountAuthenticate_(Object.assign({}, base, {
        approved_at: ""
      }));
  });

  check("missing CAPTCHA token is rejected before configuration lookup", function () {
    const registration = verifyCaptcha_("", "registration");
    const login = verifyCaptcha_("", "login");

    return registration.ok === false &&
      registration.code === "CAPTCHA_REQUIRED" &&
      login.ok === false &&
      login.code === "CAPTCHA_REQUIRED";
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
      [
        "media_id", "drive_file_id", "uploaded_at", "status",
        "retention_status", "cleanup_eligible_at", "last_referenced_at"
      ].every(function (header) {
        return schema.MediaLibrary.indexOf(header) >= 0;
      }) &&
      schema.PostMedia.indexOf("media_id") >= 0 &&
      schema.PostMedia.indexOf("post_id") >= 0;
  });

  check("operational service fields match the canonical schema", function () {
    const schema = getOperationalSchema_();

    return [
      "brand_id", "brand_name", "timezone", "status"
    ].every(function (key) {
      return schema.Brands.indexOf(key) >= 0;
    }) &&
      [
        "post_id", "brand_id", "caption", "first_comment",
        "content_type", "status", "scheduled_at_utc", "deleted_at"
      ].every(function (key) {
        return schema.Posts.indexOf(key) >= 0;
      }) &&
      [
        "post_id", "platform_status", "next_retry_at", "updated_at"
      ].every(function (key) {
        return schema.PostTargets.indexOf(key) >= 0;
      });
  });

  check("media service fields match the canonical storage contract", function () {
    const schema = getOperationalSchema_();

    return [
      "media_id", "drive_file_id", "file_name", "mime_type",
      "media_type", "size_bytes", "status", "uploaded_at",
      "updated_at", "retention_status"
    ].every(function (key) {
      return schema.MediaLibrary.indexOf(key) >= 0;
    }) &&
      schema.PostMedia.indexOf("media_id") >= 0;
  });

  check("media uploads validate declared MIME against file signature", function () {
    return isAllowedMediaSignature_(
      [0xFF, 0xD8, 0xFF, 0x00], "image/jpeg"
    ) &&
      isAllowedMediaSignature_(
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        "image/png"
      ) &&
      isAllowedMediaSignature_(
        [0x1A, 0x45, 0xDF, 0xA3], "video/webm"
      ) &&
      !isAllowedMediaSignature_(
        [0x00, 0x01, 0x02, 0x03], "image/jpeg"
      );
  });

  check("post media replacement preserves a canonical link contract", function () {
    const schema = getOperationalSchema_();

    return [
      "post_media_id", "post_id", "media_id",
      "sort_order", "created_at"
    ].every(function (key) {
      return schema.PostMedia.indexOf(key) >= 0;
    }) &&
      [
        "media_id", "cleanup_eligible_at",
        "last_referenced_at", "updated_at"
      ].every(function (key) {
        return schema.MediaLibrary.indexOf(key) >= 0;
      });
  });

  const passed = results.filter(function (result) {
    return result.passed;
  }).length;

  const summary = {
    ok: passed === results.length,
    passed: passed,
    failed: results.length - passed,
    total: results.length,
    results: results
  };

  console.log("SELF-TEST SUMMARY:\n" + JSON.stringify(summary, null, 2));

  return summary;
}


/**
 * CAPTCHA configuration readiness check.
 *
 * Reports booleans and hostname, never private site secrets.
 * Does not contact Google or enable public routes.
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
    publicRegistrationEnabled:
      getPrivateProperty_(AppConfig.PROPERTY.ENABLE_PUBLIC_REGISTRATION) === "YES",
    note: "Readiness only. No CAPTCHA token was verified, no email was sent, and no public route was enabled."
  };

  result.ready = result.registrationSecretConfigured &&
    result.loginSecretConfigured &&
    result.expectedHostnameConfigured &&
    result.scoreConfigurationValid;

  console.log("CAPTCHA readiness:\n" + JSON.stringify(result, null, 2));

  return result;
}




/**
 * Isolated password-hash performance benchmark.
 * Uses fake input only. Does not save data or log the hash.
 */
function runPasswordHashBenchmark() {
  const testPassword = "benchmark-only-not-a-real-password";
  const testSalt = "benchmark-salt-only";

  const iterations = 120000;
  const keyLength = 32;

  const start = Date.now();

  const derivedKey = pbkdf2Sha256_(
    testPassword,
    testSalt,
    iterations,
    keyLength
  );

  const elapsedMs = Date.now() - start;

  const result = {
    benchmarkOnly: true,
    algorithm: "PBKDF2-HMAC-SHA256",
    iterations: iterations,
    elapsedMs: elapsedMs,
    outputLengthBytes: derivedKey.length,
    hashValueLogged: false,
    dataSaved: false
  };

  console.log("PASSWORD HASH BENCHMARK:");
  console.log(JSON.stringify(result, null, 2));

  return result;
}


function checkMasterSpreadsheetTarget() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty("MASTER_SPREADSHEET_ID");

  if (!id || !id.trim()) {
    console.log("RESULT: MASTER_SPREADSHEET_ID is missing.");
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(id.trim());
    const name = ss.getName();

    console.log(JSON.stringify({
      propertyPresent: true,
      spreadsheetAccessible: true,
      isDisposableTestWorkbook: name === "SMM Master TEST",
      workbookName: name,
      sheetCount: ss.getSheets().length,
      noDataChanged: true
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      propertyPresent: true,
      spreadsheetAccessible: false,
      error: "Unable to open the configured spreadsheet.",
      noDataChanged: true
    }, null, 2));
  }
}



function verifyMasterTestSchema() {
  const ss = getMasterSpreadsheet_();
  const schema = getMasterSchema_();

  const results = Object.keys(schema).map(function (name) {
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      return { sheet: name, exists: false, headersMatch: false };
    }

    const expected = schema[name];
    const actual = sheet.getRange(1, 1, 1, expected.length)
      .getDisplayValues()[0];

    return {
      sheet: name,
      exists: true,
      headersMatch: expected.every(function (header, index) {
        return actual[index] === header;
      })
    };
  });

  const passed = results.every(function (item) {
    return item.exists && item.headersMatch;
  });

  console.log(JSON.stringify({
    ok: passed,
    passed: results.filter(function (item) {
      return item.exists && item.headersMatch;
    }).length,
    total: results.length,
    results: results
  }, null, 2));

  return { ok: passed, results: results };
}


function testMasterRepositoryRoundTrip() {
  const ss = getMasterSpreadsheet_();

  // Safety guard: refuse to run against a non-test workbook.
  if (!/test/i.test(ss.getName())) {
    throw new Error("REFUSED: workbook name must include TEST.");
  }

  const sheet = getRequiredSheet_(ss, "Users");
  const testId = "repo-test-" + Utilities.getUuid();
  const testEmail = testId + "@example.invalid";
  let rowNumber = 0;

  const result = {
    workbookIsTest: true,
    appendPassed: false,
    readPassed: false,
    updatePassed: false,
    cleanupPassed: false
  };

  try {
    // 1. Insert a synthetic record, not a real account.
    rowNumber = appendRecord_(sheet, {
      user_id: testId,
      full_name: "Temporary Repository Test",
      username: testId,
      email: testEmail,
      role: "test_only",
      account_status: "TEST_CREATED",
      registration_status: "TEST_ONLY",
      email_verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    result.appendPassed = rowNumber > 1;

    // 2. Read the record back by its unique ID.
    let match = findRecordByValue_(sheet, "user_id", testId);
    result.readPassed = !!match &&
      match.values[sheet.getRange(1, 1, 1, sheet.getLastColumn())
        .getDisplayValues()[0].indexOf("email")] === testEmail;

    if (!match) throw new Error("TEST_RECORD_NOT_FOUND");

    // 3. Update one field and verify the new value.
    updateSheetRowFields_(sheet, match.rowNumber, {
      account_status: "TEST_UPDATED"
    });

    match = findRecordByValue_(sheet, "user_id", testId);
    result.updatePassed = !!match &&
      rowToRecord_(sheet, match).account_status === "TEST_UPDATED";

  } finally {
    // 4. Remove only the synthetic row identified by our unique test ID.
    const match = findRecordByValue_(sheet, "user_id", testId);

    if (match) {
      const record = rowToRecord_(sheet, match);

      if (record.email === testEmail &&
          record.full_name === "Temporary Repository Test") {
        sheet.deleteRow(match.rowNumber);
      } else {
        throw new Error("CLEANUP_REFUSED: test row identity mismatch.");
      }
    }

    result.cleanupPassed =
      findRecordByValue_(sheet, "user_id", testId) === null;
  }

  result.ok = result.appendPassed &&
    result.readPassed &&
    result.updatePassed &&
    result.cleanupPassed;

  console.log("MASTER REPOSITORY ROUND-TRIP TEST:");
  console.log(JSON.stringify(result, null, 2));

  return result;
}


function testMasterAuditIntegration() {
  const ss = getMasterSpreadsheet_();

  if (!/test/i.test(ss.getName())) {
    throw new Error("REFUSED: workbook name must include TEST.");
  }

  const sheet = getRequiredSheet_(ss, "AuditLogs");
  const testId = "audit-test-" + Utilities.getUuid();
  let result = {
    workbookIsTest: true,
    writePassed: false,
    readbackPassed: false,
    cleanupPassed: false
  };

  try {
    appendAuditEvent_({
      audit_event_id: testId,
      action: "repository_integration_test",
      outcome: "success",
      target_type: "test",
      target_id: testId,
      details: { method: "automated_test" }
    });

    const match = findRecordByValue_(
      sheet, "audit_event_id", testId
    );

    result.writePassed = !!match;

    if (match) {
      const record = rowToRecord_(sheet, match);
      result.readbackPassed =
        record.action === "repository_integration_test" &&
        record.outcome === "success" &&
        record.target_id === testId;
    }
  } finally {
    const match = findRecordByValue_(
      sheet, "audit_event_id", testId
    );

    if (match) {
      const record = rowToRecord_(sheet, match);

      if (record.target_id === testId &&
          record.action === "repository_integration_test") {
        sheet.deleteRow(match.rowNumber);
      } else {
        throw new Error("CLEANUP_REFUSED: audit identity mismatch.");
      }
    }

    result.cleanupPassed =
      findRecordByValue_(sheet, "audit_event_id", testId) === null;
  }

  result.ok = result.writePassed &&
    result.readbackPassed &&
    result.cleanupPassed;

  console.log("MASTER AUDIT INTEGRATION TEST:");
  console.log(JSON.stringify(result, null, 2));

  return result;
}


function testOperationalBrandsRoundTrip() {
  const properties = PropertiesService.getScriptProperties();
  const testId = properties.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );
  const masterId = properties.getProperty("MASTER_SPREADSHEET_ID");

  if (!testId || !masterId || testId === masterId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const spreadsheet = SpreadsheetApp.openById(testId);

  if (!/test/i.test(spreadsheet.getName())) {
    throw new Error("TEST_WORKBOOK_NAME_NOT_CONFIRMED");
  }

  const sheet = getRequiredSheet_(spreadsheet, "Brands");
  const brandId = "TEST_BRAND_" + Utilities.getUuid();
  let rowNumber = null;

  const result = {
    workbook: spreadsheet.getName(),
    appendPassed: false,
    readPassed: false,
    updatePassed: false,
    cleanupPassed: false
  };

  try {
    // Create a synthetic record using only existing schema fields.
    rowNumber = appendRecord_(sheet, {
      brand_id: brandId,
      brand_name: "Temporary Repository Test",
      description: "Disposable automated test record",
      website_url: "",
      timezone: "Asia/Kolkata",
      status: "test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    result.appendPassed = rowNumber > 1;

    // Read the record back using the repository helper.
    let match = findRecordByValue_(sheet, "brand_id", brandId);
    result.readPassed = !!match &&
      String(rowToRecord_(sheet, match).brand_name) ===
        "Temporary Repository Test";

    if (!match) {
      throw new Error("TEST_RECORD_NOT_FOUND_AFTER_APPEND");
    }

    // Update one field and confirm the updated value.
    updateSheetRowFields_(sheet, match.rowNumber, {
      brand_name: "Temporary Repository Test Updated",
      updated_at: new Date().toISOString()
    });

    match = findRecordByValue_(sheet, "brand_id", brandId);
    result.updatePassed = !!match &&
      String(rowToRecord_(sheet, match).brand_name) ===
        "Temporary Repository Test Updated";
  } finally {
    // Delete only the unique record created by this test.
    const match = findRecordByValue_(sheet, "brand_id", brandId);

    if (match) {
      sheet.deleteRow(match.rowNumber);
    }

    result.cleanupPassed =
      findRecordByValue_(sheet, "brand_id", brandId) === null;
  }

  result.ok = result.appendPassed &&
    result.readPassed &&
    result.updatePassed &&
    result.cleanupPassed;

  console.log("OPERATIONAL BRANDS ROUND-TRIP TEST:");
  console.log(JSON.stringify(result, null, 2));

  return result;
}



function testOperationalPostsRoundTrip() {
  const properties = PropertiesService.getScriptProperties();
  const testId = properties.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );
  const masterId = properties.getProperty("MASTER_SPREADSHEET_ID");

  if (!testId || !masterId || testId === masterId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const spreadsheet = SpreadsheetApp.openById(testId);
  if (!/test/i.test(spreadsheet.getName())) {
    throw new Error("TEST_WORKBOOK_NAME_NOT_CONFIRMED");
  }

  const sheet = getRequiredSheet_(spreadsheet, "Posts");
  const postId = "TEST_POST_" + Utilities.getUuid();
  let result = {
    workbook: spreadsheet.getName(),
    createPassed: false,
    readPassed: false,
    updatePassed: false,
    cleanupPassed: false
  };

  try {
    const now = new Date().toISOString();

    const rowNumber = appendRecord_(sheet, {
      post_id: postId,
      brand_id: "TEST_BRAND_REFERENCE",
      caption: "Temporary post repository test",
      first_comment: "",
      content_type: "text",
      status: "draft",
      scheduled_at_utc: "",
      timezone: "Asia/Kolkata",
      created_at: now,
      updated_at: now,
      deleted_at: ""
    });

    result.createPassed = rowNumber > 1;

    let match = findRecordByValue_(sheet, "post_id", postId);
    result.readPassed = !!match &&
      String(rowToRecord_(sheet, match).status) === "draft";

    if (!match) throw new Error("TEST_POST_NOT_FOUND");

    updateSheetRowFields_(sheet, match.rowNumber, {
      caption: "Updated temporary post test",
      updated_at: new Date().toISOString()
    });

    match = findRecordByValue_(sheet, "post_id", postId);
    result.updatePassed = !!match &&
      String(rowToRecord_(sheet, match).caption) ===
        "Updated temporary post test";
  } finally {
    const match = findRecordByValue_(sheet, "post_id", postId);
    if (match) sheet.deleteRow(match.rowNumber);

    result.cleanupPassed =
      findRecordByValue_(sheet, "post_id", postId) === null;
  }

  result.ok = result.createPassed &&
    result.readPassed &&
    result.updatePassed &&
    result.cleanupPassed;

  console.log("OPERATIONAL POSTS ROUND-TRIP TEST:");
  console.log(JSON.stringify(result, null, 2));
  return result;
}


function inspectOperationalTestSetup() {
  const props = PropertiesService.getScriptProperties();
  const masterId = props.getProperty("MASTER_SPREADSHEET_ID");
  const operationsId = props.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );

  if (!masterId || !operationsId || masterId === operationsId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const master = SpreadsheetApp.openById(masterId);

  if (!/test/i.test(master.getName())) {
    throw new Error("MASTER_WORKBOOK_IS_NOT_A_TEST_WORKBOOK");
  }

  const users = master.getSheetByName("Users");
  const resources = master.getSheetByName("UserResources");

  const result = {
    masterWorkbook: master.getName(),
    usersTabExists: !!users,
    userResourcesTabExists: !!resources,
    userRows: users ? Math.max(0, users.getLastRow() - 1) : null,
    resourceRows: resources
      ? Math.max(0, resources.getLastRow() - 1)
      : null,
    dataChanged: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}



function createOperationalServiceTestFixture() {
  const props = PropertiesService.getScriptProperties();
  const masterId = props.getProperty("MASTER_SPREADSHEET_ID");
  const operationalId = props.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );

  if (!masterId || !operationalId || masterId === operationalId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const master = SpreadsheetApp.openById(masterId);
  const operational = SpreadsheetApp.openById(operationalId);

  if (!/test/i.test(master.getName()) ||
      !/test/i.test(operational.getName())) {
    throw new Error("TEST_WORKBOOK_NAME_NOT_CONFIRMED");
  }

  const users = getRequiredSheet_(master, "Users");
  const resources = getRequiredSheet_(master, "UserResources");

  const userId = "TEST_USER_" + Utilities.getUuid();
  const now = new Date().toISOString();

  const result = {
    masterWorkbook: master.getName(),
    operationalWorkbook: operational.getName(),
    userId: userId,
    userCreated: false,
    resourcesCreated: false
  };

  appendRecord_(users, {
    user_id: userId,
    full_name: "Disposable Test User",
    username: userId.toLowerCase(),
    email: userId.toLowerCase() + "@example.invalid",
    phone: "",
    role: "user",
    account_status: ACCOUNT_STATUS.ACTIVE,
    registration_status: "approved",
    email_verified: true,
    email_verified_at: now,
    approved_at: now,
    status_reason: "",
    suspended_at: "",
    disabled_at: "",
    deleted_at: "",
    created_at: now,
    updated_at: now,
    last_login_at: ""
  });
  result.userCreated = true;

  try {
    appendRecord_(resources, {
      user_id: userId,
      user_spreadsheet_id: operational.getId(),
      drive_root_folder_id: "",
      media_folder_id: "",
      published_media_folder_id: "",
      provisioning_status: "ready",
      spreadsheet_status: "ready",
      drive_status: "pending",
      schema_version: MASTER_SCHEMA_VERSION,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      last_error_code: ""
    });

    result.resourcesCreated = true;
  } catch (error) {
    const match = findRecordByValue_(users, "user_id", userId);
    if (match) users.deleteRow(match.rowNumber);
    throw error;
  }

  result.ok = result.userCreated && result.resourcesCreated;
  console.log(JSON.stringify(result, null, 2));
  return result;
}




function testOperationalPostService() {
  const props = PropertiesService.getScriptProperties();
  const masterId = props.getProperty("MASTER_SPREADSHEET_ID");
  const operationsId = props.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );

  if (!masterId || !operationsId || masterId === operationsId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const master = SpreadsheetApp.openById(masterId);
  const operations = SpreadsheetApp.openById(operationsId);

  if (!/test/i.test(master.getName()) ||
      !/test/i.test(operations.getName())) {
    throw new Error("TEST_WORKBOOK_NAME_NOT_CONFIRMED");
  }

  const users = getRequiredSheet_(master, "Users");
  const resources = getRequiredSheet_(master, "UserResources");

  const lastUserRow = users.getLastRow();
  const lastResourceRow = resources.getLastRow();

  if (lastUserRow < 2 || lastResourceRow < 2) {
    throw new Error("TEST_USER_FIXTURE_MISSING");
  }

  const userValues = users.getRange(
    2, 1, lastUserRow - 1, users.getLastColumn()
  ).getValues();
  const userHeaders = users.getRange(
    1, 1, 1, users.getLastColumn()
  ).getDisplayValues()[0];

  let userId = "";
  userValues.forEach(function (row) {
    const record = {};
    userHeaders.forEach(function (header, index) {
      record[header] = row[index];
    });

    if (String(record.username || "").indexOf("test_user_") === 0) {
      userId = String(record.user_id || "");
    }
  });

  if (!userId) throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");

  const brands = getRequiredSheet_(operations, "Brands");
  const brandId = "TEST_BRAND_" + Utilities.getUuid();
  const now = new Date().toISOString();
  let postId = "";
  let result = {
    userFixtureFound: true,
    brandCreated: false,
    draftCreated: false,
    draftListed: false,
    cleanupPassed: false
  };

  try {
    appendRecord_(brands, {
      brand_id: brandId,
      brand_name: "Temporary Service Test Brand",
      description: "Disposable test fixture",
      website_url: "",
      timezone: "Asia/Kolkata",
      status: "active",
      created_at: now,
      updated_at: now
    });
    result.brandCreated = true;

    const created = createUserPost_(userId, {
      brand_id: brandId,
      caption: "Temporary service-level draft test",
      content_type: "text",
      status: "draft",
      timezone: "Asia/Kolkata"
    });

    if (!created || !created.ok || !created.post_id) {
      throw new Error("POST_SERVICE_CREATE_FAILED");
    }

    postId = created.post_id;
    result.draftCreated = true;

    const listed = listUserPosts_(userId, {
      status: "draft",
      brand_id: brandId,
      limit: 10
    });

    result.draftListed = !!listed.ok && listed.posts.some(function (post) {
      return post.post_id === postId &&
        post.caption === "Temporary service-level draft test";
    });
  } finally {
    if (postId) {
      const posts = getRequiredSheet_(operations, "Posts");
      const postMatch = findRecordByValue_(posts, "post_id", postId);
      if (postMatch) posts.deleteRow(postMatch.rowNumber);
    }

    const brandMatch = findRecordByValue_(brands, "brand_id", brandId);
    if (brandMatch) brands.deleteRow(brandMatch.rowNumber);

    result.cleanupPassed =
      !findRecordByValue_(brands, "brand_id", brandId) &&
      (!postId ||
        !findRecordByValue_(
          getRequiredSheet_(operations, "Posts"), "post_id", postId
        ));
  }

  result.ok = result.userFixtureFound &&
    result.brandCreated &&
    result.draftCreated &&
    result.draftListed &&
    result.cleanupPassed;

  console.log("OPERATIONAL POST SERVICE TEST:");
  console.log(JSON.stringify(result, null, 2));
  return result;
}



function testOperationalPostLifecycle() {
  const props = PropertiesService.getScriptProperties();
  const masterId = props.getProperty("MASTER_SPREADSHEET_ID");
  const operationsId = props.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );

  if (!masterId || !operationsId || masterId === operationsId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const master = SpreadsheetApp.openById(masterId);
  const operations = SpreadsheetApp.openById(operationsId);

  if (!/test/i.test(master.getName()) ||
      !/test/i.test(operations.getName())) {
    throw new Error("TEST_WORKBOOK_NAME_NOT_CONFIRMED");
  }

  const users = getRequiredSheet_(master, "Users");
  const userHeaders = users.getRange(
    1, 1, 1, users.getLastColumn()
  ).getDisplayValues()[0];

  let userId = "";
  if (users.getLastRow() > 1) {
    const rows = users.getRange(
      2, 1, users.getLastRow() - 1, users.getLastColumn()
    ).getValues();

    rows.forEach(function (row) {
      const record = {};
      userHeaders.forEach(function (header, i) {
        record[header] = row[i];
      });
      if (String(record.username || "").indexOf("test_user_") === 0) {
        userId = String(record.user_id || "");
      }
    });
  }

  if (!userId) throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");

  const brands = getRequiredSheet_(operations, "Brands");
  const posts = getRequiredSheet_(operations, "Posts");
  const brandId = "TEST_BRAND_" + Utilities.getUuid();
  const now = new Date().toISOString();
  const createdPostIds = [];
  const result = {
    updatePassed: false,
    schedulePassed: false,
    cancelPassed: false,
    cleanupPassed: false
  };

  try {
    appendRecord_(brands, {
      brand_id: brandId,
      brand_name: "Temporary Lifecycle Test",
      description: "Disposable test brand",
      website_url: "",
      timezone: "Asia/Kolkata",
      status: "active",
      created_at: now,
      updated_at: now
    });

    const draft = createUserPost_(userId, {
      brand_id: brandId,
      caption: "Lifecycle test draft",
      content_type: "text",
      status: "draft",
      timezone: "Asia/Kolkata"
    });

    if (!draft || !draft.ok || !draft.post_id) {
      throw new Error("DRAFT_CREATION_FAILED");
    }
    createdPostIds.push(draft.post_id);

    const updated = updateUserPost_(userId, draft.post_id, {
      caption: "Lifecycle test updated caption"
    });

    const draftMatch = findRecordByValue_(
      posts, "post_id", draft.post_id
    );
    result.updatePassed = !!updated.ok && !!draftMatch &&
      String(rowToRecord_(posts, draftMatch).caption) ===
        "Lifecycle test updated caption";

    const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const scheduled = updateUserPost_(userId, draft.post_id, {
      status: "scheduled",
      scheduled_at_utc: futureTime
    });

    const scheduledMatch = findRecordByValue_(
      posts, "post_id", draft.post_id
    );
    const scheduledRecord = scheduledMatch
      ? rowToRecord_(posts, scheduledMatch) : {};

    result.schedulePassed = !!scheduled.ok &&
      String(scheduledRecord.status) === "scheduled" &&
      Boolean(scheduledRecord.scheduled_at_utc);

    const cancelled = updateUserPost_(userId, draft.post_id, {
      status: "cancelled"
    });

    const cancelledMatch = findRecordByValue_(
      posts, "post_id", draft.post_id
    );
    result.cancelPassed = !!cancelled.ok && !!cancelledMatch &&
      String(rowToRecord_(posts, cancelledMatch).status) === "cancelled";
  } finally {
    createdPostIds.forEach(function (id) {
      const match = findRecordByValue_(posts, "post_id", id);
      if (match) posts.deleteRow(match.rowNumber);
    });

    const brandMatch = findRecordByValue_(brands, "brand_id", brandId);
    if (brandMatch) brands.deleteRow(brandMatch.rowNumber);

    result.cleanupPassed =
      !findRecordByValue_(brands, "brand_id", brandId) &&
      createdPostIds.every(function (id) {
        return !findRecordByValue_(posts, "post_id", id);
      });
  }

  result.ok = result.updatePassed &&
    result.schedulePassed &&
    result.cancelPassed &&
    result.cleanupPassed;

  console.log("OPERATIONAL POST LIFECYCLE TEST:");
  console.log(JSON.stringify(result, null, 2));
  return result;
}



function testOperationalPostDeletionAudit() {
  const props = PropertiesService.getScriptProperties();
  const masterId = props.getProperty("MASTER_SPREADSHEET_ID");
  const operationsId = props.getProperty(
    "OPERATIONAL_TEST_SPREADSHEET_ID"
  );

  if (!masterId || !operationsId || masterId === operationsId) {
    throw new Error("TEST_WORKBOOK_CONFIGURATION_INVALID");
  }

  const master = SpreadsheetApp.openById(masterId);
  const operations = SpreadsheetApp.openById(operationsId);

  if (!/test/i.test(master.getName()) ||
      !/test/i.test(operations.getName())) {
    throw new Error("TEST_WORKBOOK_NAME_NOT_CONFIRMED");
  }

  const users = getRequiredSheet_(master, "Users");
  const userHeaders = users.getRange(
    1, 1, 1, users.getLastColumn()
  ).getDisplayValues()[0];

  let userId = "";
  if (users.getLastRow() > 1) {
    const rows = users.getRange(
      2, 1, users.getLastRow() - 1, users.getLastColumn()
    ).getValues();

    rows.forEach(function (row) {
      const record = {};
      userHeaders.forEach(function (header, i) {
        record[header] = row[i];
      });

      if (String(record.username || "").indexOf("test_user_") === 0) {
        userId = String(record.user_id || "");
      }
    });
  }

  if (!userId) throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");

  const brands = getRequiredSheet_(operations, "Brands");
  const posts = getRequiredSheet_(operations, "Posts");
  const audit = getRequiredSheet_(master, "AuditLogs");

  const brandId = "TEST_BRAND_" + Utilities.getUuid();
  const now = new Date().toISOString();
  let postId = "";
  let auditId = "";
  const result = {
    brandCreated: false,
    postCreated: false,
    softDeletePassed: false,
    auditPassed: false,
    cleanupPassed: false
  };

  try {
    appendRecord_(brands, {
      brand_id: brandId,
      brand_name: "Temporary Delete Audit Test",
      description: "Disposable test brand",
      website_url: "",
      timezone: "Asia/Kolkata",
      status: "active",
      created_at: now,
      updated_at: now
    });
    result.brandCreated = true;

    const created = createUserPost_(userId, {
      brand_id: brandId,
      caption: "Temporary deletion audit test",
      content_type: "text",
      status: "draft",
      timezone: "Asia/Kolkata"
    });

    if (!created || !created.ok || !created.post_id) {
      throw new Error("TEST_POST_CREATION_FAILED");
    }

    postId = created.post_id;
    result.postCreated = true;

    const beforeAuditRows = audit.getLastRow();

    const deleted = deleteUserPost_(userId, postId);
    const postMatch = findRecordByValue_(posts, "post_id", postId);
    const post = postMatch ? rowToRecord_(posts, postMatch) : {};

    result.softDeletePassed = !!deleted.ok &&
      String(post.status) === "deleted" &&
      Boolean(post.deleted_at);

    // Identify only audit rows created by this test after the call.
    if (audit.getLastRow() > beforeAuditRows) {
      const headers = audit.getRange(
        1, 1, 1, audit.getLastColumn()
      ).getDisplayValues()[0];

      const rows = audit.getRange(
        beforeAuditRows + 1, 1,
        audit.getLastRow() - beforeAuditRows,
        audit.getLastColumn()
      ).getValues();

      rows.forEach(function (row) {
        const record = {};
        headers.forEach(function (header, index) {
          record[header] = row[index];
        });

        if (String(record.action) === "post_soft_deleted" &&
            String(record.target_id) === userId) {
          auditId = String(record.audit_event_id || "");
        }
      });
    }

    result.auditPassed = Boolean(auditId);
  } finally {
    // Remove only the uniquely identified audit event created by this test.
    if (auditId) {
      const match = findRecordByValue_(
        audit, "audit_event_id", auditId
      );
      if (match) audit.deleteRow(match.rowNumber);
    }

    // The post is soft-deleted by the service; remove only this test post.
    if (postId) {
      const match = findRecordByValue_(posts, "post_id", postId);
      if (match) posts.deleteRow(match.rowNumber);
    }

    const brandMatch = findRecordByValue_(brands, "brand_id", brandId);
    if (brandMatch) brands.deleteRow(brandMatch.rowNumber);

    result.cleanupPassed =
      !findRecordByValue_(brands, "brand_id", brandId) &&
      (!postId || !findRecordByValue_(posts, "post_id", postId)) &&
      (!auditId || !findRecordByValue_(audit, "audit_event_id", auditId));
  }

  result.ok = result.brandCreated &&
    result.postCreated &&
    result.softDeletePassed &&
    result.auditPassed &&
    result.cleanupPassed;

  console.log("POST DELETION AND AUDIT TEST:");
  console.log(JSON.stringify(result, null, 2));
  return result;
}


function inspectTestMediaFolder() {
  const master = getMasterSpreadsheet_();
  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const users = getRequiredSheet_(master, "Users");
  const resources = getRequiredSheet_(master, "UserResources");

  const userRows = readSheetRecords_(users);
  const resourceRows = readSheetRecords_(resources);

  const testUser = userRows.find(function (user) {
    return String(user.username || "").toLowerCase().startsWith("test_user_");
  });

  if (!testUser) {
    throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");
  }

  const resource = resourceRows.find(function (row) {
    return String(row.user_id) === String(testUser.user_id);
  });

  if (!resource) {
    throw new Error("TEST_USER_RESOURCES_NOT_FOUND");
  }

  const folderId = String(resource.media_folder_id || "").trim();
  const result = {
    masterWorkbook: master.getName(),
    testUserFound: true,
    resourceFound: true,
    provisioningStatus: resource.provisioning_status,
    driveStatus: resource.drive_status,
    mediaFolderConfigured: Boolean(folderId),
    mediaFolderAccessible: false,
    folderIsPublishedFolder: Boolean(folderId) &&
      folderId === String(resource.published_media_folder_id || "")
  };

  if (folderId) {
    try {
      const folder = DriveApp.getFolderById(folderId);
      result.mediaFolderAccessible = true;
      result.folderName = folder.getName();
    } catch (error) {
      result.mediaFolderError = String(error.message || error);
    }
  }

  console.log(JSON.stringify(result, null, 2));
  return result;
}


function createTestMediaFolderFixture() {
  const master = getMasterSpreadsheet_();

  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const operationalId = PropertiesService.getScriptProperties()
    .getProperty("OPERATIONAL_TEST_SPREADSHEET_ID");

  if (!operationalId) {
    throw new Error("TEST_OPERATIONAL_ID_NOT_CONFIGURED");
  }

  const operational = SpreadsheetApp.openById(operationalId);

  if (!/test/i.test(operational.getName())) {
    throw new Error("REFUSING_NON_TEST_OPERATIONAL");
  }

  const users = getRequiredSheet_(master, "Users");
  const resources = getRequiredSheet_(master, "UserResources");
  const userRecords = readSheetRecords_(users);
  const resourceRecords = readSheetRecords_(resources);

  const testUser = userRecords.find(function (user) {
    return String(user.username || "").toLowerCase()
      .startsWith("test_user_");
  });

  if (!testUser) {
    throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");
  }

  const resource = resourceRecords.find(function (row) {
    return String(row.user_id) === String(testUser.user_id);
  });

  if (!resource) {
    throw new Error("TEST_USER_RESOURCES_NOT_FOUND");
  }

  const resourceMatch = findRecordByValue_(
    resources, "user_id", testUser.user_id
  );

  if (!resourceMatch) {
    throw new Error("TEST_RESOURCE_ROW_NOT_FOUND");
  }

  const existingFolderId = String(
    resource.media_folder_id || ""
  ).trim();

  if (existingFolderId) {
    const existingFolder = DriveApp.getFolderById(existingFolderId);

    if (existingFolder.isTrashed()) {
      throw new Error("EXISTING_TEST_MEDIA_FOLDER_IS_TRASHED");
    }

    console.log(JSON.stringify({
      ok: true,
      reusedExistingFolder: true,
      folderName: existingFolder.getName(),
      folderAccessible: true,
      dataChanged: false
    }, null, 2));

    return {
      ok: true,
      reusedExistingFolder: true,
      folderName: existingFolder.getName(),
      dataChanged: false
    };
  }

  const rootFolder = DriveApp.createFolder(
    "SMM TEST MEDIA " + Utilities.getUuid()
  );

  let mediaFolder = null;
  let publishedFolder = null;

  try {
    mediaFolder = rootFolder.createFolder("media");
    publishedFolder = rootFolder.createFolder("published-media");

    updateSheetRowFields_(resources, resourceMatch.rowNumber, {
      drive_root_folder_id: rootFolder.getId(),
      media_folder_id: mediaFolder.getId(),
      published_media_folder_id: publishedFolder.getId(),
      drive_status: "ready",
      updated_at: new Date().toISOString(),
      last_error_code: ""
    });

    const result = {
      ok: true,
      workbook: master.getName(),
      operationalWorkbook: operational.getName(),
      testUserFound: true,
      mediaFolderCreated: true,
      publishedFolderCreated: true,
      driveStatus: "ready",
      folderIdsLogged: false
    };

    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    if (rootFolder) {
      rootFolder.setTrashed(true);
    }
    throw error;
  }
}




function testOperationalMediaUploadAndDelete() {
  const master = getMasterSpreadsheet_();

  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const users = readSheetRecords_(getRequiredSheet_(master, "Users"));
  const user = users.find(function (row) {
    return String(row.username || "").toLowerCase()
      .startsWith("test_user_");
  });

  if (!user) throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");

  // A tiny PNG image used only for this disposable test.
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=";

  let mediaId = "";
  let uploadPassed = false;
  let libraryRecordPassed = false;
  let deletePassed = false;
  let auditPassed = false;

  try {

    
    const uploaded = uploadUserMedia_(user.user_id, {
      file_name: "disposable-media-test.png",
      mime_type: "image/png",
      base64_data: pngBase64,
      alt_text: "Disposable backend test image"
    });

    if (!uploaded || uploaded.ok !== true ||
        !uploaded.media || !uploaded.media.media_id) {
      throw new Error("MEDIA_UPLOAD_RESULT_INVALID");
    }

    mediaId = uploaded.media.media_id;
    uploadPassed = true;

    const context = getOperationalContextForUser_(user.user_id);
    const library = getRequiredSheet_(context.workbook, "MediaLibrary");
    const match = findRecordByValue_(library, "media_id", mediaId);

    libraryRecordPassed = Boolean(match);

    if (!libraryRecordPassed) {
      throw new Error("MEDIA_LIBRARY_RECORD_NOT_FOUND");
    }

    const deleted = deleteUserMedia_(user.user_id, mediaId);
    deletePassed = Boolean(deleted && deleted.ok === true);

    if (!deletePassed) {
      throw new Error("MEDIA_DELETE_RESULT_INVALID");
    }

    const afterDelete = findRecordByValue_(library, "media_id", mediaId);

    if (!afterDelete) {
      throw new Error("MEDIA_RECORD_MISSING_AFTER_DELETE");
    }

    const record = rowToRecord_(library, afterDelete);

    if (String(record.status) !== "trashed" ||
        String(record.retention_status) !== "cleaned") {
      throw new Error("MEDIA_RECORD_CLEANUP_STATE_INVALID");
    }

    const auditSheet = getRequiredSheet_(master, "AuditLogs");
    const auditRows = readSheetRecords_(auditSheet);

    // AuditLogs uses actor_id, not user_id.
    auditPassed = auditRows.some(function (row) {
      return String(row.actor_id) === String(user.user_id) &&
        String(row.action) === "media_deleted" &&
        String(row.target_id) === String(mediaId) &&
        String(row.outcome) === "success";
    });

    if (!auditPassed) {
      throw new Error("MEDIA_DELETE_AUDIT_NOT_FOUND");
    }

    const result = {
      ok: true,
      uploadPassed: uploadPassed,
      libraryRecordPassed: libraryRecordPassed,
      deletePassed: deletePassed,
      auditPassed: auditPassed,
      testMediaIdLogged: false
    };

    console.log(JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    // Best-effort cleanup if upload succeeded but a later check failed.
    if (mediaId) {
      try {
        const context = getOperationalContextForUser_(user.user_id);
        const library = getRequiredSheet_(context.workbook, "MediaLibrary");
        const match = findRecordByValue_(library, "media_id", mediaId);

        if (match) {
          const record = rowToRecord_(library, match);

          if (String(record.status) === "available") {
            deleteUserMedia_(user.user_id, mediaId);
          }
        }
      } catch (cleanupError) {
        console.log("TEST_CLEANUP_REQUIRES_REVIEW");
      }
    }

    throw error;
  }
}




function inspectLatestMediaDeleteAudit() {
  const master = getMasterSpreadsheet_();

  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const sheet = getRequiredSheet_(master, "AuditLogs");
  const records = readSheetRecords_(sheet);

  const matches = records.filter(function (row) {
    return String(row.action || "").toLowerCase().indexOf("media") !== -1;
  });

  const result = {
    workbook: master.getName(),
    auditRowsFound: matches.length,
    recentMediaAuditEvents: matches.slice(-10).map(function (row) {
      return {
        action: row.action || "",
        outcome: row.outcome || "",
        target_type: row.target_type || "",
        user_id_present: Boolean(row.user_id),
        target_id_present: Boolean(row.target_id)
      };
    }),
    dataChanged: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}



function inspectAuditHeaders() {
  const master = getMasterSpreadsheet_();

  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const sheet = getRequiredSheet_(master, "AuditLogs");

  const result = {
    workbook: master.getName(),
    headers: sheet.getRange(
      1, 1, 1, sheet.getLastColumn()
    ).getDisplayValues()[0],
    dataChanged: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}




function testOperationalPostMediaLifecycle() {
  const master = getMasterSpreadsheet_();

  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const users = readSheetRecords_(getRequiredSheet_(master, "Users"));
  const user = users.find(function (row) {
    return String(row.username || "").toLowerCase()
      .startsWith("test_user_");
  });

  if (!user) throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");

  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=";

  let brandId = "";
  let postId = "";
  const mediaIds = [];
  let attachPassed = false;
  let replacePassed = false;
  let removePassed = false;
  let cleanupPassed = false;

  function getPostMediaLinks(workbook, id) {
    return readSheetRecords_(
      getRequiredSheet_(workbook, "PostMedia")
    ).filter(function (row) {
      return String(row.post_id || "") === String(id);
    });
  }

  try {
    const brandResult = createUserBrand_(user.user_id, {
      brand_name: "Disposable Media Lifecycle Test",
      description: "Temporary automated backend test",
      timezone: "Asia/Kolkata"
    });

    brandId = brandResult.brand_id;

    const postResult = createUserPost_(user.user_id, {
      brand_id: brandId,
      caption: "Disposable post media lifecycle test",
      content_type: "image",
      status: "draft",
      timezone: "Asia/Kolkata"
    });

    postId = postResult.post_id;

    // Upload two disposable images through the real media service.
    [1, 2].forEach(function (number) {
      const uploaded = uploadUserMedia_(user.user_id, {
        file_name: "disposable-post-media-" + number + ".png",
        mime_type: "image/png",
        base64_data: pngBase64,
        alt_text: "Disposable post media test " + number
      });

      if (!uploaded || !uploaded.ok ||
          !uploaded.media || !uploaded.media.media_id) {
        throw new Error("TEST_MEDIA_UPLOAD_FAILED");
      }

      mediaIds.push(uploaded.media.media_id);
    });

    // 1. Attach the first image.
    const attached = addUserPostMedia_(
      user.user_id, postId, [mediaIds[0]]
    );

    let context = getOperationalContextForUser_(user.user_id);
    let links = getPostMediaLinks(context.workbook, postId);

    attachPassed = Boolean(
      attached.ok &&
      links.length === 1 &&
      String(links[0].media_id) === mediaIds[0]
    );

    if (!attachPassed) throw new Error("MEDIA_ATTACH_CHECK_FAILED");

    // 2. Replace the first image with the second.
    const replaced = replaceUserPostMedia_(
      user.user_id, postId, [mediaIds[1]]
    );

    context = getOperationalContextForUser_(user.user_id);
    links = getPostMediaLinks(context.workbook, postId);

    replacePassed = Boolean(
      replaced.ok &&
      links.length === 1 &&
      String(links[0].media_id) === mediaIds[1]
    );

    if (!replacePassed) throw new Error("MEDIA_REPLACE_CHECK_FAILED");

    // 3. Remove all media links without deleting the media files.
    const removed = replaceUserPostMedia_(user.user_id, postId, []);

    context = getOperationalContextForUser_(user.user_id);
    links = getPostMediaLinks(context.workbook, postId);

    removePassed = Boolean(removed.ok && links.length === 0);

    if (!removePassed) throw new Error("MEDIA_REMOVE_CHECK_FAILED");

    // Both media records should remain available until explicit deletion.
    const library = getRequiredSheet_(context.workbook, "MediaLibrary");

    mediaIds.forEach(function (id) {
      const match = findRecordByValue_(library, "media_id", id);
      if (!match) throw new Error("MEDIA_RECORD_MISSING_AFTER_UNLINK");

      const media = rowToRecord_(library, match);
      if (String(media.status) !== "available") {
        throw new Error("MEDIA_FILE_CHANGED_DURING_UNLINK");
      }
    });

    const result = {
      ok: true,
      attachPassed: attachPassed,
      replacePassed: replacePassed,
      removePassed: removePassed,
      cleanupPassed: false
    };

    console.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    // Cleanup only the disposable records created by this test.
    let cleanupErrors = [];

    try {
      if (postId) {
        const context = getOperationalContextForUser_(user.user_id);
        const links = getPostMediaLinks(context.workbook, postId);

        if (links.length) {
          replaceUserPostMedia_(user.user_id, postId, []);
        }
      }
    } catch (error) {
      cleanupErrors.push("POST_MEDIA_LINK_CLEANUP_FAILED");
    }

    mediaIds.forEach(function (id) {
      try {
        const context = getOperationalContextForUser_(user.user_id);
        const library = getRequiredSheet_(context.workbook, "MediaLibrary");
        const match = findRecordByValue_(library, "media_id", id);

        if (match) {
          const media = rowToRecord_(library, match);

          if (String(media.status) === "available") {
            deleteUserMedia_(user.user_id, id);
          }
        }
      } catch (error) {
        cleanupErrors.push("MEDIA_CLEANUP_FAILED");
      }
    });

    try {
      const context = getOperationalContextForUser_(user.user_id);

      if (postId) {
        const posts = getRequiredSheet_(context.workbook, "Posts");
        const match = findRecordByValue_(posts, "post_id", postId);
        if (match) posts.deleteRow(match.rowNumber);
      }

      if (brandId) {
        const brands = getRequiredSheet_(context.workbook, "Brands");
        const match = findRecordByValue_(brands, "brand_id", brandId);
        if (match) brands.deleteRow(match.rowNumber);
      }
    } catch (error) {
      cleanupErrors.push("POST_OR_BRAND_CLEANUP_FAILED");
    }

    cleanupPassed = cleanupErrors.length === 0;

    console.log(JSON.stringify({
      testCleanupPassed: cleanupPassed,
      cleanupErrors: cleanupErrors
    }, null, 2));
  }
}



function testOperationalPostTargetLifecycle() {
  const master = getMasterSpreadsheet_();

  if (master.getName() !== "SMM Master TEST") {
    throw new Error("REFUSING_NON_TEST_MASTER");
  }

  const users = readSheetRecords_(getRequiredSheet_(master, "Users"));
  const user = users.find(function (row) {
    return String(row.username || "").toLowerCase()
      .startsWith("test_user_");
  });

  if (!user) throw new Error("SYNTHETIC_TEST_USER_NOT_FOUND");

  const connections = getRequiredSheet_(master, "SocialConnections");
  const connectionHeaders = getHeaderMap_(connections);
  const requiredConnectionFields = [
    "social_connection_id", "user_id", "brand_id",
    "connection_status", "token_reference"
  ];

  requiredConnectionFields.forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(connectionHeaders, field)) {
      throw new Error("SOCIAL_CONNECTION_SCHEMA_MISMATCH:" + field);
    }
  });

  let brandId = "";
  let postId = "";
  let connectionId = "";
  let targetId = "";
  let connectionRowNumber = 0;
  let postTargetCreated = false;
  let targetVerified = false;
  let cancellationPassed = false;
  const cleanupErrors = [];

  try {
    const brand = createUserBrand_(user.user_id, {
      brand_name: "Disposable Target Lifecycle Test",
      description: "Temporary backend test",
      timezone: "Asia/Kolkata"
    });
    brandId = brand.brand_id;

    const post = createUserPost_(user.user_id, {
      brand_id: brandId,
      caption: "Disposable post-target lifecycle test",
      content_type: "text",
      status: "draft",
      timezone: "Asia/Kolkata"
    });
    postId = post.post_id;

    connectionId = Utilities.getUuid();

    const connection = {
      social_connection_id: connectionId,
      user_id: user.user_id,
      brand_id: brandId,
      connection_status: "connected",
      token_reference: "test-token-reference"
    };

    // Fill any additional required schema fields with safe empty values.
    Object.keys(connectionHeaders).forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(connection, field)) {
        connection[field] = "";
      }
    });

    appendRecord_(connections, connection);
    const connectionMatch = findRecordByValue_(
      connections, "social_connection_id", connectionId
    );

    if (!connectionMatch) {
      throw new Error("TEST_CONNECTION_WRITE_FAILED");
    }
    connectionRowNumber = connectionMatch.rowNumber;

    const created = createUserPostTarget_(
      user.user_id, postId, connectionId
    );

    if (!created || created.ok !== true || !created.target_id) {
      throw new Error("POST_TARGET_CREATE_FAILED");
    }

    targetId = created.target_id;
    postTargetCreated = true;

    const context = getOperationalContextForUser_(user.user_id);
    const targetsSheet = getRequiredSheet_(context.workbook, "PostTargets");
    const targetMatch = findRecordByValue_(
      targetsSheet, "target_id", targetId
    );

    if (!targetMatch) throw new Error("POST_TARGET_NOT_FOUND");

    const target = rowToRecord_(targetsSheet, targetMatch);
    targetVerified =
      String(target.post_id) === String(postId) &&
      String(target.social_connection_id) === String(connectionId) &&
      String(target.platform_status) === "pending";

    if (!targetVerified) throw new Error("POST_TARGET_DATA_MISMATCH");

    updateUserPost_(user.user_id, postId, { status: "cancelled" });

    const afterCancel = findRecordByValue_(
      targetsSheet, "target_id", targetId
    );

    if (!afterCancel) throw new Error("POST_TARGET_MISSING_AFTER_CANCEL");

    const cancelledTarget = rowToRecord_(targetsSheet, afterCancel);
    cancellationPassed =
      String(cancelledTarget.platform_status) === "cancelled";

    if (!cancellationPassed) {
      throw new Error("POST_TARGET_CANCELLATION_FAILED");
    }

    console.log(JSON.stringify({
      ok: true,
      postTargetCreated: postTargetCreated,
      targetVerified: targetVerified,
      cancellationPassed: cancellationPassed
    }, null, 2));

  } finally {
    // Remove only the records created by this disposable test.
    try {
      const context = getOperationalContextForUser_(user.user_id);
      const targetsSheet = getRequiredSheet_(context.workbook, "PostTargets");

      if (targetId) {
        const match = findRecordByValue_(targetsSheet, "target_id", targetId);
        if (match) targetsSheet.deleteRow(match.rowNumber);
      }

      if (postId) {
        const postsSheet = getRequiredSheet_(context.workbook, "Posts");
        const match = findRecordByValue_(postsSheet, "post_id", postId);
        if (match) postsSheet.deleteRow(match.rowNumber);
      }

      if (brandId) {
        const brandsSheet = getRequiredSheet_(context.workbook, "Brands");
        const match = findRecordByValue_(brandsSheet, "brand_id", brandId);
        if (match) brandsSheet.deleteRow(match.rowNumber);
      }
    } catch (error) {
      cleanupErrors.push("OPERATIONAL_RECORD_CLEANUP_FAILED");
    }

    try {
      if (connectionRowNumber) {
        const match = findRecordByValue_(
          connections, "social_connection_id", connectionId
        );
        if (match) connections.deleteRow(match.rowNumber);
      }
    } catch (error) {
      cleanupErrors.push("TEST_CONNECTION_CLEANUP_FAILED");
    }

    console.log(JSON.stringify({
      testCleanupPassed: cleanupErrors.length === 0,
      cleanupErrors: cleanupErrors
    }, null, 2));
  }
}

