/**
 * TEST-only session lifecycle verification.
 * Uses only the configured TEST master workbook and synthetic account data.
 * Never deploy or run against a production workbook.
 */
function testSessionLifecycleOnTestWorkbook() {
  const masterId = getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);
  const operationalTestId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID
  );
  if (masterId === operationalTestId) {
    throw new Error("MASTER_AND_OPERATIONAL_TEST_IDS_MUST_DIFFER");
  }

  const workbook = SpreadsheetApp.openById(masterId);
  if (!/test/i.test(workbook.getName())) {
    throw new Error("MASTER_WORKBOOK_NAME_MUST_INCLUDE_TEST");
  }

  const masterSchema = getMasterSchema_();
  Object.keys(masterSchema).forEach(function (sheetName) {
    const sheet = getRequiredSheet_(workbook, sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0].map(function (header) { return String(header || "").trim(); });
    if (!masterSchema[sheetName].every(function (header) {
      return headers.indexOf(header) >= 0;
    })) {
      throw new Error("MASTER_SCHEMA_INVALID_" + sheetName);
    }
  });

  const users = getRequiredSheet_(workbook, "Users");
  const sessions = getRequiredSheet_(workbook, "Sessions");
  const auditLogs = getRequiredSheet_(workbook, "AuditLogs");
  const userId = "TEST_SESSION_USER_" + Utilities.getUuid();
  const nowIso = new Date().toISOString();
  const sessionIds = [];
  const cleanupErrors = [];
  const checks = {
    firstSessionValid: false,
    newLoginInvalidatesPreviousSession: false,
    replacementSessionValid: false,
    explicitRevocationWorks: false,
    expiredSessionRejected: false,
    cleanupSafe: false
  };

  function sessionRow(sessionId) {
    return findRecordByValue_(sessions, "session_id", sessionId);
  }

  try {
    appendRecord_(users, {
      user_id: userId,
      username: "test_session_" + Utilities.getUuid().slice(0, 8),
      full_name: "Synthetic Session Test",
      email: "session-test-" + Utilities.getUuid() + "@example.invalid",
      phone: "",
      role: "user",
      account_status: ACCOUNT_STATUS.ACTIVE,
      registration_status: "active",
      email_verified: true,
      email_verified_at: nowIso,
      approved_at: nowIso,
      disabled_at: "",
      suspended_at: "",
      deleted_at: "",
      created_at: nowIso,
      updated_at: nowIso
    });

    const first = createSession_(userId);
    sessionIds.push(first.session_id);
    checks.firstSessionValid = Boolean(validateSession_(first.token)) &&
      Boolean(sessionRow(first.session_id));

    const second = createSession_(userId);
    sessionIds.push(second.session_id);
    checks.newLoginInvalidatesPreviousSession =
      validateSession_(first.token) === null;
    checks.replacementSessionValid =
      Boolean(validateSession_(second.token));

    const revoked = revokeSession_(second.token, "TEST_SESSION_LIFECYCLE");
    checks.explicitRevocationWorks =
      revoked === true && validateSession_(second.token) === null;

    const third = createSession_(userId);
    sessionIds.push(third.session_id);
    const thirdMatch = sessionRow(third.session_id);
    if (!thirdMatch) throw new Error("TEST_SESSION_ROW_MISSING");
    updateSheetRowFields_(sessions, thirdMatch.rowNumber, {
      expires_at: new Date(Date.now() - 1000).toISOString()
    });
    checks.expiredSessionRejected = validateSession_(third.token) === null;

  } catch (error) {
    checks.failureCode =
      String(error && error.message || "TEST_FAILED").slice(0, 120);

  } finally {
    try {
      const sessionRows = readSheetRecords_(sessions);
      for (let i = sessionRows.length - 1; i >= 0; i--) {
        if (sessionIds.indexOf(String(sessionRows[i].session_id || "")) >= 0) {
          const match = findRecordByValue_(
            sessions, "session_id", String(sessionRows[i].session_id)
          );
          if (match) sessions.deleteRow(match.rowNumber);
        }
      }
    } catch (error) {
      cleanupErrors.push("SESSION_CLEANUP_FAILED");
    }

    try {
      const auditRows = readSheetRecords_(auditLogs);
      for (let i = auditRows.length - 1; i >= 0; i--) {
        if (String(auditRows[i].user_id || "") === userId) {
          const rowNumber = i + 2;
          auditLogs.deleteRow(rowNumber);
        }
      }
    } catch (error) {
      cleanupErrors.push("AUDIT_CLEANUP_FAILED");
    }

    try {
      const userMatch = findRecordByValue_(users, "user_id", userId);
      if (userMatch) users.deleteRow(userMatch.rowNumber);
    } catch (error) {
      cleanupErrors.push("USER_CLEANUP_FAILED");
    }
  }

  checks.cleanupSafe = cleanupErrors.length === 0;
  const names = Object.keys(checks).filter(function (key) {
    return key !== "failureCode";
  });
  const passed = names.filter(function (key) {
    return checks[key] === true;
  }).length;

  const result = {
    ok: passed === names.length &&
      !checks.failureCode &&
      cleanupErrors.length === 0,
    passed: passed,
    total: names.length,
    checks: checks,
    failureCode: checks.failureCode || "",
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
