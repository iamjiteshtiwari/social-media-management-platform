/**
 * Internal publishing outcome persistence and retry state transitions.
 *
 * This module does NOT call social platforms and is not exposed through Api.gs.
 * A future trusted worker may call recordPublishingOutcome_ only after it has
 * performed a real provider attempt and validated the provider response.
 *
 * retry_count in PublishingLogs means retries beyond the first attempt.
 * PostTargets.attempt_count counts all attempts, including the first attempt.
 */

const PUBLISHING_RETRY_BASE_DELAY_MS = 60 * 1000;
const PUBLISHING_RETRY_MAX_DELAY_MS = 60 * 60 * 1000;
const PUBLISHING_DEFAULT_MAX_ATTEMPTS = 3;
const PUBLISHING_HARD_MAX_ATTEMPTS = 10;

/**
 * Persists one completed attempt and updates the target's retry/published state.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} workbook Trusted operational workbook.
 * @param {string} targetId Existing PostTargets.target_id.
 * @param {{success:boolean,retryable?:boolean,error_code?:string,platform_post_id?:string,max_attempts?:number}} outcome Provider result; never pass raw tokens or full provider payloads.
 * @param {string=} nowIso Optional ISO timestamp, used by deterministic tests.
 * @return {{ok:boolean,log_id:string,result_status:string,attempt_count:number,retry_count:number,next_retry_at:string,platform_status:string}}
 */
function recordPublishingOutcome_(workbook, targetId, outcome, nowIso) {
  const targetKey = String(targetId || "").trim();
  const value = outcome || {};
  if (!workbook || !targetKey || typeof value.success !== "boolean") {
    throw new Error("INVALID_PUBLISHING_OUTCOME");
  }

  const timestamp = nowIso ? Date.parse(String(nowIso)) : Date.now();
  if (!Number.isFinite(timestamp)) throw new Error("INVALID_PUBLISHING_TIMESTAMP");
  const attemptedAt = new Date(timestamp).toISOString();

  let maxAttempts = value.max_attempts === undefined
    ? PUBLISHING_DEFAULT_MAX_ATTEMPTS : Number(value.max_attempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 ||
      maxAttempts > PUBLISHING_HARD_MAX_ATTEMPTS) {
    throw new Error("INVALID_PUBLISHING_MAX_ATTEMPTS");
  }

  let platformPostId = String(value.platform_post_id || "").trim();
  if (platformPostId.length > 200) throw new Error("INVALID_PLATFORM_POST_ID");
  if (value.success && !platformPostId) throw new Error("PLATFORM_POST_ID_REQUIRED");

  let errorCode = String(value.error_code || "").trim().toUpperCase();
  if (!value.success) {
    if (!errorCode) errorCode = "PUBLISH_FAILED";
    if (!/^[A-Z0-9_]{1,80}$/.test(errorCode)) throw new Error("INVALID_PUBLISHING_ERROR_CODE");
  } else {
    errorCode = "";
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    assertOperationalWorkbookSchema_(workbook);
    const targets = getRequiredSheet_(workbook, "PostTargets");
    const logs = getRequiredSheet_(workbook, "PublishingLogs");
    const targetMatch = findRecordByValue_(targets, "target_id", targetKey);
    if (!targetMatch) throw new Error("POST_TARGET_NOT_FOUND");

    const target = rowToRecord_(targets, targetMatch);
    const currentStatus = String(target.platform_status || "").toLowerCase();
    // Outcomes may be recorded only for a claimed target. Requiring the
    // publishing state prevents an unclaimed pending row from being marked
    // published or failed by a direct internal call.
    if (currentStatus !== "publishing") {
      throw new Error("POST_TARGET_NOT_CLAIMED");
    }

    const currentAttemptCount = Number(target.attempt_count || 0);
    if (!Number.isInteger(currentAttemptCount) || currentAttemptCount < 0) {
      throw new Error("POST_TARGET_ATTEMPT_COUNT_INVALID");
    }
    const attemptCount = currentAttemptCount + 1;
    const retryCount = Math.max(0, attemptCount - 1);
    let resultStatus;
    let nextStatus;
    let nextRetryAt = "";

    if (value.success) {
      resultStatus = "success";
      nextStatus = "published";
    } else if (value.retryable === true && attemptCount < maxAttempts) {
      resultStatus = "retry_scheduled";
      nextStatus = "pending";
      const delay = Math.min(
        PUBLISHING_RETRY_BASE_DELAY_MS * Math.pow(2, attemptCount - 1),
        PUBLISHING_RETRY_MAX_DELAY_MS
      );
      nextRetryAt = new Date(timestamp + delay).toISOString();
    } else {
      resultStatus = "failed";
      nextStatus = "failed";
    }

    const logId = Utilities.getUuid();
    appendRecord_(logs, {
      log_id: logId,
      post_id: String(target.post_id || ""),
      target_id: targetKey,
      attempted_at: attemptedAt,
      result_status: resultStatus,
      platform_post_id: value.success ? platformPostId : "",
      error_code: errorCode,
      retry_count: retryCount
    });

    const targetFields = {
      platform_status: nextStatus,
      attempt_count: attemptCount,
      next_retry_at: nextRetryAt,
      last_error_code: value.success ? "" : errorCode,
      updated_at: attemptedAt
    };
    if (value.success) {
      targetFields.published_at_utc = attemptedAt;
      targetFields.platform_post_id = platformPostId;
    }

    try {
      updateSheetRowFields_(targets, targetMatch.rowNumber, targetFields);
    } catch (writeError) {
      // Best-effort rollback prevents a log from claiming a transition that
      // failed to persist. If rollback itself fails, retain the original error.
      try {
        const logMatch = findRecordByValue_(logs, "log_id", logId);
        if (logMatch) logs.deleteRow(logMatch.rowNumber);
      } catch (rollbackError) {
        // Preserve the original update failure.
      }
      throw writeError;
    }

    return {
      ok: true,
      log_id: logId,
      result_status: resultStatus,
      attempt_count: attemptCount,
      retry_count: retryCount,
      next_retry_at: nextRetryAt,
      platform_status: nextStatus
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Focused integration test against the disposable operational TEST workbook.
 * Creates unique synthetic target rows, verifies retry/success/terminal failure,
 * and removes every test target/log it created. It never calls a social platform.
 */
function testPublishingOutcomeLifecycle() {
  const testSpreadsheetId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID
  );
  const masterSpreadsheetId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.MASTER_SPREADSHEET_ID
  );
  if (testSpreadsheetId === masterSpreadsheetId) {
    throw new Error("OPERATIONAL_AND_MASTER_IDS_MUST_DIFFER");
  }

  const workbook = SpreadsheetApp.openById(testSpreadsheetId);
  if (!/test/i.test(workbook.getName())) {
    throw new Error("OPERATIONAL_TEST_SHEET_NAME_MUST_INCLUDE_TEST");
  }
  assertOperationalWorkbookSchema_(workbook);

  const targets = getRequiredSheet_(workbook, "PostTargets");
  const logs = getRequiredSheet_(workbook, "PublishingLogs");
  const retryTargetId = "TEST_TARGET_" + Utilities.getUuid();
  const terminalTargetId = "TEST_TARGET_" + Utilities.getUuid();
  const testPostId = "TEST_POST_" + Utilities.getUuid();
  const cleanupErrors = [];
  const checks = {
    pendingOutcomeRejected: false,
    retryScheduled: false,
    successRecorded: false,
    terminalFailureRecorded: false
  };
  let failureCode = "";

  function appendSyntheticTarget(targetId) {
    appendRecord_(targets, {
      target_id: targetId,
      post_id: testPostId,
      social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: "pending",
      scheduled_at_utc: "",
      published_at_utc: "",
      platform_post_id: "",
      attempt_count: 0,
      next_retry_at: "",
      last_error_code: "",
      updated_at: new Date().toISOString()
    });
  }

  try {
    appendSyntheticTarget(retryTargetId);
    appendSyntheticTarget(terminalTargetId);

    const start = Date.now();
    try {
      recordPublishingOutcome_(workbook, retryTargetId, {
        success: true,
        platform_post_id: "SHOULD_NOT_BE_ACCEPTED"
      }, new Date(start).toISOString());
    } catch (error) {
      checks.pendingOutcomeRejected = String(error && error.message || "") === "POST_TARGET_NOT_CLAIMED";
    }
    const retryTargetMatchBeforeClaim = findRecordByValue_(targets, "target_id", retryTargetId);
    updateSheetRowFields_(targets, retryTargetMatchBeforeClaim.rowNumber, { platform_status: "publishing" });
    const first = recordPublishingOutcome_(workbook, retryTargetId, {
      success: false,
      retryable: true,
      error_code: "TEST_TRANSIENT",
      max_attempts: 3
    }, new Date(start).toISOString());

    const retryMatch = findRecordByValue_(targets, "target_id", retryTargetId);
    const retryRecord = rowToRecord_(targets, retryMatch);
    const firstLogMatch = findRecordByValue_(logs, "log_id", first.log_id);
    const firstLog = firstLogMatch ? rowToRecord_(logs, firstLogMatch) : null;
    checks.retryScheduled = first.result_status === "retry_scheduled" &&
      first.platform_status === "pending" &&
      first.attempt_count === 1 &&
      Date.parse(first.next_retry_at) === start + PUBLISHING_RETRY_BASE_DELAY_MS &&
      Number(retryRecord.attempt_count) === 1 &&
      String(retryRecord.last_error_code) === "TEST_TRANSIENT" &&
      firstLog && String(firstLog.result_status) === "retry_scheduled" &&
      Number(firstLog.retry_count) === 0;

    const successTime = Date.parse(first.next_retry_at) + 1000;
    const retryTargetMatchBeforeSecondAttempt = findRecordByValue_(targets, "target_id", retryTargetId);
    updateSheetRowFields_(targets, retryTargetMatchBeforeSecondAttempt.rowNumber, { platform_status: "publishing" });
    const second = recordPublishingOutcome_(workbook, retryTargetId, {
      success: true,
      platform_post_id: "TEST_PLATFORM_POST_ONLY",
      max_attempts: 3
    }, new Date(successTime).toISOString());
    const successMatch = findRecordByValue_(targets, "target_id", retryTargetId);
    const successTarget = rowToRecord_(targets, successMatch);
    const secondLogMatch = findRecordByValue_(logs, "log_id", second.log_id);
    const secondLog = secondLogMatch ? rowToRecord_(logs, secondLogMatch) : null;
    checks.successRecorded = second.result_status === "success" &&
      second.platform_status === "published" &&
      second.attempt_count === 2 &&
      second.retry_count === 1 &&
      String(successTarget.platform_status) === "published" &&
      String(successTarget.platform_post_id) === "TEST_PLATFORM_POST_ONLY" &&
      !String(successTarget.next_retry_at || "") &&
      secondLog && String(secondLog.result_status) === "success" &&
      Number(secondLog.retry_count) === 1;

    const terminalTargetMatchBeforeAttempt = findRecordByValue_(targets, "target_id", terminalTargetId);
    updateSheetRowFields_(targets, terminalTargetMatchBeforeAttempt.rowNumber, { platform_status: "publishing" });
    const terminal = recordPublishingOutcome_(workbook, terminalTargetId, {
      success: false,
      retryable: false,
      error_code: "TEST_PERMANENT",
      max_attempts: 3
    }, new Date(start).toISOString());
    const terminalMatch = findRecordByValue_(targets, "target_id", terminalTargetId);
    const terminalTarget = rowToRecord_(targets, terminalMatch);
    const terminalLogMatch = findRecordByValue_(logs, "log_id", terminal.log_id);
    const terminalLog = terminalLogMatch ? rowToRecord_(logs, terminalLogMatch) : null;
    checks.terminalFailureRecorded = terminal.result_status === "failed" &&
      terminal.platform_status === "failed" &&
      String(terminalTarget.platform_status) === "failed" &&
      String(terminalTarget.last_error_code) === "TEST_PERMANENT" &&
      !String(terminalTarget.next_retry_at || "") &&
      terminalLog && String(terminalLog.result_status) === "failed" &&
      String(terminalLog.error_code) === "TEST_PERMANENT";
  } catch (error) {
    failureCode = String(error && error.message || "TEST_FAILED").slice(0, 120);
  } finally {
    [retryTargetId, terminalTargetId].forEach(function (targetId) {
      try {
        let match = findRecordByValue_(logs, "target_id", targetId);
        while (match) {
          logs.deleteRow(match.rowNumber);
          match = findRecordByValue_(logs, "target_id", targetId);
        }
      } catch (error) {
        cleanupErrors.push("LOG_CLEANUP_FAILED");
      }
      try {
        const match = findRecordByValue_(targets, "target_id", targetId);
        if (match) targets.deleteRow(match.rowNumber);
      } catch (error) {
        cleanupErrors.push("TARGET_CLEANUP_FAILED");
      }
    });
  }

  const passed = Object.keys(checks).filter(function (key) { return checks[key]; }).length;
  return {
    ok: passed === Object.keys(checks).length && !failureCode && cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    failureCode: failureCode,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };
}
