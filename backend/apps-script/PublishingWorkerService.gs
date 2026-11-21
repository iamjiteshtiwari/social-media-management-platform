/**
 * Internal batch coordinator for due publishing target claims.
 *
 * This is not a provider worker yet: it makes no social-platform API calls,
 * creates no triggers, and exposes no public route. Claimed targets remain in
 * "publishing" until a separately reviewed worker records a real outcome.
 * Do not run against production workbooks.
 */

/**
 * Claims the earliest due targets up to limit.
 *
 * Queue preview is read-only; each candidate is then revalidated and claimed
 * by claimDuePublishingTarget_ under its own script lock. Concurrent workers
 * may win a claim first; those conflicts are reported per target and do not
 * stop other candidates from being processed.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} workbook Operational workbook.
 * @param {string=} nowIso Optional deterministic timestamp for tests.
 * @param {number=} limit Maximum number of candidates to claim (1-25).
 * @param {string[]=} allowedTargetIds Optional explicit allowlist for controlled tests.
 * @return {{ok:boolean,dryRun:boolean,selected:number,claimed:Array,skipped:Array,now_utc:string,note:string}}
 */
function claimDuePublishingBatch_(workbook, nowIso, limit, allowedTargetIds) {
  if (!workbook) throw new Error("OPERATIONAL_WORKBOOK_REQUIRED");
  const nowValue = nowIso === undefined ? Date.now() : Date.parse(String(nowIso));
  if (!Number.isFinite(nowValue)) throw new Error("INVALID_QUEUE_TIMESTAMP");
  const maxItems = limit === undefined ? 10 : Number(limit);
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 25) {
    throw new Error("INVALID_PUBLISHING_BATCH_LIMIT");
  }
  assertOperationalWorkbookSchema_(workbook);

  if (allowedTargetIds !== undefined && (!Array.isArray(allowedTargetIds) ||
      allowedTargetIds.some(function (id) { return typeof id !== "string" || !id.trim(); }))) {
    throw new Error("INVALID_PUBLISHING_TARGET_ALLOWLIST");
  }
  const timestamp = new Date(nowValue).toISOString();
  const queue = previewDuePublishingTargets_(workbook, timestamp, 100);
  const allowed = allowedTargetIds === undefined ? null : {};
  if (allowed) allowedTargetIds.forEach(function (id) { allowed[String(id).trim()] = true; });
  const candidates = queue.targets.filter(function (candidate) {
    return !allowed || allowed[candidate.target_id] === true;
  }).slice(0, maxItems);
  const claimed = [];
  const skipped = [];

  candidates.forEach(function (candidate) {
    try {
      const result = claimDuePublishingTarget_(workbook, candidate.target_id, timestamp);
      claimed.push({
        target_id: result.target_id,
        post_id: candidate.post_id,
        queue_reason: candidate.queue_reason,
        due_at_utc: candidate.due_at_utc,
        claimed_at: result.claimed_at,
        attempt_count: candidate.attempt_count
      });
    } catch (error) {
      skipped.push({
        target_id: candidate.target_id,
        code: String(error && error.message || "CLAIM_FAILED").slice(0, 80)
      });
    }
  });

  return {
    ok: skipped.length === 0,
    dryRun: false,
    selected: candidates.length,
    claimed: claimed,
    skipped: skipped,
    now_utc: timestamp,
    note: "Claims only. No provider API calls were made. Claimed targets remain in publishing until a provider outcome is reconciled and recorded."
  };
}

/** TEST-only batch-claim test; synthetic rows are removed in finally. */
function testPublishingBatchClaimCoordinator() {
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

  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");
  const suffix = Utilities.getUuid();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const postIds = [
    "TEST_BATCH_CLAIM_OLDEST_POST_" + suffix,
    "TEST_BATCH_CLAIM_NEWEST_POST_" + suffix
  ];
  const targetIds = [
    "TEST_BATCH_CLAIM_OLDEST_TARGET_" + suffix,
    "TEST_BATCH_CLAIM_NEWEST_TARGET_" + suffix
  ];
  const cleanupErrors = [];
  const checks = {
    earliestCandidateClaimedFirst: false,
    allEligibleCandidatesClaimed: false,
    claimedTargetsSetPublishing: false,
    attemptCountsRemainUnchanged: false,
    noProviderOutcomeWasInvented: false
  };

  function addPost(postId, dueAt) {
    appendRecord_(posts, {
      post_id: postId, brand_id: "TEST_BRAND_ONLY",
      caption: "Synthetic batch claim test", first_comment: "",
      content_type: "text", status: "scheduled", scheduled_at_utc: dueAt,
      timezone: "UTC", created_at: nowIso, updated_at: nowIso, deleted_at: ""
    });
  }
  function addTarget(targetId, postId, dueAt) {
    appendRecord_(targets, {
      target_id: targetId, post_id: postId,
      social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: "scheduled", scheduled_at_utc: dueAt,
      published_at_utc: "", platform_post_id: "", attempt_count: 0,
      next_retry_at: "", last_error_code: "", updated_at: nowIso
    });
  }

  try {
    const oldestAt = new Date(now - 5 * 60 * 1000).toISOString();
    const newestAt = new Date(now - 1 * 60 * 1000).toISOString();

    // Insert newest first to prove the coordinator follows due-time ordering.
    addPost(postIds[1], newestAt);
    addPost(postIds[0], oldestAt);
    addTarget(targetIds[1], postIds[1], newestAt);
    addTarget(targetIds[0], postIds[0], oldestAt);

    const result = claimDuePublishingBatch_(workbook, nowIso, 2, targetIds);
    checks.earliestCandidateClaimedFirst = result.claimed.length === 2 &&
      result.claimed[0].target_id === targetIds[0] &&
      result.claimed[1].target_id === targetIds[1];
    checks.allEligibleCandidatesClaimed = result.selected === 2 &&
      result.claimed.length === 2 && result.skipped.length === 0;

    const oldestMatch = findRecordByValue_(targets, "target_id", targetIds[0]);
    const newestMatch = findRecordByValue_(targets, "target_id", targetIds[1]);
    const oldest = rowToRecord_(targets, oldestMatch);
    const newest = rowToRecord_(targets, newestMatch);
    checks.claimedTargetsSetPublishing =
      String(oldest.platform_status) === "publishing" &&
      String(newest.platform_status) === "publishing";
    checks.attemptCountsRemainUnchanged =
      Number(oldest.attempt_count) === 0 && Number(newest.attempt_count) === 0;
    checks.noProviderOutcomeWasInvented =
      !String(oldest.platform_post_id || "") &&
      !String(newest.platform_post_id || "") &&
      !String(oldest.published_at_utc || "") &&
      !String(newest.published_at_utc || "");
  } catch (error) {
    cleanupErrors.push("TEST_FAILED:" + String(error && error.message || "UNKNOWN").slice(0, 100));
  } finally {
    targetIds.forEach(function (targetId) {
      try {
        let match = findRecordByValue_(targets, "target_id", targetId);
        while (match) {
          targets.deleteRow(match.rowNumber);
          match = findRecordByValue_(targets, "target_id", targetId);
        }
      } catch (error) {
        cleanupErrors.push("TARGET_CLEANUP_FAILED");
      }
    });
    postIds.forEach(function (postId) {
      try {
        let match = findRecordByValue_(posts, "post_id", postId);
        while (match) {
          posts.deleteRow(match.rowNumber);
          match = findRecordByValue_(posts, "post_id", postId);
        }
      } catch (error) {
        cleanupErrors.push("POST_CLEANUP_FAILED");
      }
    });
  }

  const passed = Object.keys(checks).filter(function (key) { return checks[key]; }).length;
  const report = {
    ok: passed === Object.keys(checks).length && cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


/**
 * Preflight only: validates a claimed publishing target before any provider
 * attempt. Does not call a platform, change rows, or increment attempts.
 */


function preparePublishingAttempt_(workbook, targetId) {
  const targetKey = String(targetId || "").trim();

  if (!workbook || !targetKey) {
    throw new Error("INVALID_PUBLISHING_PREFLIGHT");
  }

  assertOperationalWorkbookSchema_(workbook);

  const targets = getRequiredSheet_(workbook, "PostTargets");
  const posts = getRequiredSheet_(workbook, "Posts");

  const targetMatch = findRecordByValue_(
    targets, "target_id", targetKey
  );
  if (!targetMatch) throw new Error("POST_TARGET_NOT_FOUND");

  const target = rowToRecord_(targets, targetMatch);

  if (
    String(target.platform_status || "").trim().toLowerCase()
    !== "publishing"
  ) {
    throw new Error("POST_TARGET_NOT_CLAIMED");
  }

  const postId = String(target.post_id || "").trim();
  if (!postId) throw new Error("POST_ID_REQUIRED");

  const postMatch = findRecordByValue_(posts, "post_id", postId);
  if (!postMatch) throw new Error("POST_NOT_FOUND");

  const post = rowToRecord_(posts, postMatch);
  const postStatus = String(post.status || "").trim().toLowerCase();

  if (
    post.deleted_at ||
    ["cancelled", "deleted", "published", "publishing"]
      .indexOf(postStatus) >= 0
  ) {
    throw new Error("POST_NOT_ELIGIBLE");
  }

  const connectionId = String(
    target.social_connection_id || ""
  ).trim();

  if (!connectionId) {
    throw new Error("SOCIAL_CONNECTION_REQUIRED");
  }

  // Read the canonical connection from the configured TEST master.
  const master = getMasterSpreadsheet_();
  const connections = getRequiredSheet_(master, "SocialConnections");

  const connectionMatch = findRecordByValue_(
    connections, "social_connection_id", connectionId
  );

  if (!connectionMatch) {
    throw new Error("SOCIAL_CONNECTION_NOT_AVAILABLE");
  }

  const connection = rowToRecord_(connections, connectionMatch);

  const connectionBrandId = String(
    connection.brand_id || ""
  ).trim();
  const postBrandId = String(post.brand_id || "").trim();

  if (
    !postBrandId ||
    connectionBrandId !== postBrandId ||
    String(connection.connection_status || "").trim().toLowerCase()
      !== "connected" ||
    !String(connection.token_reference || "").trim() ||
    String(connection.disconnected_at || "").trim()
  ) {
    throw new Error("SOCIAL_CONNECTION_NOT_AVAILABLE");
  }

  const expiryValue = connection.token_expires_at;

  if (
    expiryValue !== "" &&
    expiryValue !== null &&
    typeof expiryValue !== "undefined"
  ) {
    const expiryMs = expiryValue instanceof Date
      ? expiryValue.getTime()
      : Date.parse(String(expiryValue));

    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
      throw new Error("SOCIAL_CONNECTION_TOKEN_EXPIRED");
    }
  }

  const caption = String(post.caption || "");
  const contentType = String(post.content_type || "").trim();

  if (!caption.trim() && contentType.toLowerCase() !== "media") {
    throw new Error("POST_CONTENT_REQUIRED");
  }

  const attemptCount = Number(target.attempt_count || 0);

  if (!Number.isInteger(attemptCount) || attemptCount < 0) {
    throw new Error("POST_TARGET_ATTEMPT_COUNT_INVALID");
  }

  return {
    ok: true,
    target_id: targetKey,
    post_id: postId,
    social_connection_id: connectionId,
    caption: caption,
    first_comment: String(post.first_comment || ""),
    content_type: contentType,
    attempt_count: attemptCount,
    note: "Preflight only. No provider call or spreadsheet mutation occurred."
  };
}


/** TEST-only checks for the publishing preflight safety boundary. */

function testPublishingAttemptPreflight() {
  const operationalId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID
  );
  const masterId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.MASTER_SPREADSHEET_ID
  );

  if (operationalId === masterId) {
    throw new Error("OPERATIONAL_AND_MASTER_IDS_MUST_DIFFER");
  }

  const workbook = SpreadsheetApp.openById(operationalId);
  const master = SpreadsheetApp.openById(masterId);

  if (!/test/i.test(workbook.getName()) ||
      !/test/i.test(master.getName())) {
    throw new Error("TEST_SPREADSHEET_NAMES_REQUIRED");
  }

  assertOperationalWorkbookSchema_(workbook);

  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");
  const connections = getRequiredSheet_(master, "SocialConnections");

  const suffix = Utilities.getUuid();
  const postId = "TEST_PREFLIGHT_POST_" + suffix;
  const targetId = "TEST_PREFLIGHT_TARGET_" + suffix;
  const connectionId = "TEST_PREFLIGHT_CONNECTION_" + suffix;
  const brandId = "TEST_PREFLIGHT_BRAND_" + suffix;
  const userId = "TEST_PREFLIGHT_USER_" + suffix;
  const now = new Date();
  const nowIso = now.toISOString();

  const checks = {
    validConnectionAccepted: false,
    noProviderSecretsReturned: false,
    attemptCountUnchanged: false,
    targetStatusUnchanged: false,
    unclaimedTargetRejected: false,
    cancelledParentRejected: false,
    wrongBrandRejected: false,
    disconnectedConnectionRejected: false,
    missingTokenReferenceRejected: false,
    expiredConnectionRejected: false
  };

  const cleanupErrors = [];

  try {
    appendRecord_(connections, {
      social_connection_id: connectionId,
      user_id: userId,
      brand_id: brandId,
      platform: "test",
      platform_account_id: "TEST_ACCOUNT_" + suffix,
      account_display_name: "Synthetic test connection",
      connection_status: "connected",
      granted_scopes: "",
      connected_at: nowIso,
      updated_at: nowIso,
      token_reference: "TEST_REFERENCE_ONLY",
      token_expires_at: "",
      last_validated_at: nowIso,
      last_error_code: "",
      disconnected_at: ""
    });

    appendRecord_(posts, {
      post_id: postId,
      brand_id: brandId,
      caption: "Synthetic preflight test",
      first_comment: "",
      content_type: "text",
      status: "scheduled",
      scheduled_at_utc: nowIso,
      timezone: "UTC",
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: ""
    });

    appendRecord_(targets, {
      target_id: targetId,
      post_id: postId,
      social_connection_id: connectionId,
      platform_status: "publishing",
      scheduled_at_utc: nowIso,
      published_at_utc: "",
      platform_post_id: "",
      attempt_count: 0,
      next_retry_at: "",
      last_error_code: "",
      updated_at: nowIso
    });

    let prepared = preparePublishingAttempt_(workbook, targetId);

    checks.validConnectionAccepted =
      prepared.ok === true &&
      prepared.target_id === targetId &&
      prepared.post_id === postId;

    checks.noProviderSecretsReturned =
      !Object.prototype.hasOwnProperty.call(prepared, "access_token") &&
      !Object.prototype.hasOwnProperty.call(prepared, "refresh_token") &&
      !Object.prototype.hasOwnProperty.call(prepared, "token_reference");

    let targetMatch = findRecordByValue_(
      targets, "target_id", targetId
    );
    let target = rowToRecord_(targets, targetMatch);

    checks.attemptCountUnchanged =
      Number(target.attempt_count) === 0;
    checks.targetStatusUnchanged =
      String(target.platform_status) === "publishing";

    updateSheetRowFields_(
      targets, targetMatch.rowNumber,
      { platform_status: "pending" }
    );

    try {
      preparePublishingAttempt_(workbook, targetId);
    } catch (error) {
      checks.unclaimedTargetRejected =
        String(error && error.message || "") ===
        "POST_TARGET_NOT_CLAIMED";
    }

    targetMatch = findRecordByValue_(
      targets, "target_id", targetId
    );
    updateSheetRowFields_(
      targets, targetMatch.rowNumber,
      { platform_status: "publishing" }
    );

    const postMatch = findRecordByValue_(posts, "post_id", postId);
    updateSheetRowFields_(
      posts, postMatch.rowNumber, { status: "cancelled" }
    );

    try {
      preparePublishingAttempt_(workbook, targetId);
    } catch (error) {
      checks.cancelledParentRejected =
        String(error && error.message || "") === "POST_NOT_ELIGIBLE";
    }

    updateSheetRowFields_(
      posts, postMatch.rowNumber, { status: "scheduled" }
    );

    function expectConnectionFailure_(fields, expectedCode) {
      const match = findRecordByValue_(
        connections, "social_connection_id", connectionId
      );
      updateSheetRowFields_(connections, match.rowNumber, fields);

      try {
        preparePublishingAttempt_(workbook, targetId);
      } catch (error) {
        return String(error && error.message || "") === expectedCode;
      }
      return false;
    }

    checks.wrongBrandRejected = expectConnectionFailure_(
      { brand_id: "TEST_WRONG_BRAND_" + suffix },
      "SOCIAL_CONNECTION_NOT_AVAILABLE"
    );

    checks.disconnectedConnectionRejected = expectConnectionFailure_(
      { brand_id: brandId, connection_status: "disconnected",
        disconnected_at: nowIso },
      "SOCIAL_CONNECTION_NOT_AVAILABLE"
    );

    checks.missingTokenReferenceRejected = expectConnectionFailure_(
      { connection_status: "connected", disconnected_at: "",
        token_reference: "" },
      "SOCIAL_CONNECTION_NOT_AVAILABLE"
    );

    checks.expiredConnectionRejected = expectConnectionFailure_(
      { token_reference: "TEST_REFERENCE_ONLY",
        token_expires_at: new Date(Date.now() - 60000).toISOString() },
      "SOCIAL_CONNECTION_TOKEN_EXPIRED"
    );

  } catch (error) {
    cleanupErrors.push(
      "TEST_FAILED:" +
      String(error && error.message || "UNKNOWN").slice(0, 100)
    );
  } finally {
    [
      { sheet: targets, column: "target_id", value: targetId },
      { sheet: posts, column: "post_id", value: postId },
      {
        sheet: connections,
        column: "social_connection_id",
        value: connectionId
      }
    ].forEach(function (item) {
      try {
        let match = findRecordByValue_(
          item.sheet, item.column, item.value
        );
        while (match) {
          item.sheet.deleteRow(match.rowNumber);
          match = findRecordByValue_(
            item.sheet, item.column, item.value
          );
        }
      } catch (error) {
        cleanupErrors.push("CLEANUP_FAILED:" + item.column);
      }
    });
  }

  const passed = Object.keys(checks).filter(function (key) {
    return checks[key];
  }).length;

  const report = {
    ok: passed === Object.keys(checks).length &&
        cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };

  console.log("PUBLISHING_PREFLIGHT_TEST_RESULT");
  console.log(JSON.stringify(report, null, 2));
  return report;
}


function testPublishingClaimRetrySuccessOrchestration() {
  const testId = getRequiredPrivateProperty_(AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID);
  const masterId = getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);
  if (testId === masterId) throw new Error("OPERATIONAL_AND_MASTER_IDS_MUST_DIFFER");

  const workbook = SpreadsheetApp.openById(testId);
  if (!/test/i.test(workbook.getName())) {
    throw new Error("OPERATIONAL_TEST_SHEET_NAME_MUST_INCLUDE_TEST");
  }

  assertOperationalWorkbookSchema_(workbook);

  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");
  const logs = getRequiredSheet_(workbook, "PublishingLogs");

  const suffix = Utilities.getUuid();
  const postId = "TEST_ORCH_POST_" + suffix;
  const targetId = "TEST_ORCH_TARGET_" + suffix;
  const t1 = Date.now();
  const iso1 = new Date(t1).toISOString();
  const due = new Date(t1 - 10 * 60 * 1000).toISOString();

  const checks = {
    firstClaim: false,
    claimDoesNotIncrementAttempt: false,
    retryScheduled: false,
    retryClaim: false,
    successRecorded: false,
    attemptsAndLogsCorrect: false,
    duplicateOutcomeRejected: false,
    duplicateDidNotChangeState: false
  };

  const cleanupErrors = [];

  function get(sheet, key, value) {
    const m = findRecordByValue_(sheet, key, value);
    return m ? rowToRecord_(sheet, m) : null;
  }

  function ownLogs() {
    return readSheetRecords_(logs).filter(function (row) {
      return String(row.target_id || "") === targetId;
    });
  }

  try {
    appendRecord_(posts, {
      post_id: postId,
      brand_id: "TEST_BRAND_ONLY",
      caption: "Synthetic orchestration test",
      first_comment: "",
      content_type: "text",
      status: "scheduled",
      scheduled_at_utc: due,
      timezone: "UTC",
      created_at: iso1,
      updated_at: iso1,
      deleted_at: ""
    });

    appendRecord_(targets, {
      target_id: targetId,
      post_id: postId,
      social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: "scheduled",
      scheduled_at_utc: due,
      published_at_utc: "",
      platform_post_id: "",
      attempt_count: 0,
      next_retry_at: "",
      last_error_code: "",
      updated_at: iso1
    });

    const c1 = claimDuePublishingTarget_(workbook, targetId, iso1);
    let target = get(targets, "target_id", targetId);

    checks.firstClaim =
      c1.ok === true &&
      String(target.platform_status) === "publishing";

    checks.claimDoesNotIncrementAttempt =
      Number(target.attempt_count) === 0;

    const o1 = recordPublishingOutcome_(workbook, targetId, {
      success: false,
      retryable: true,
      error_code: "TEST_TRANSIENT",
      max_attempts: 3
    }, iso1);

    target = get(targets, "target_id", targetId);

    checks.retryScheduled =
      o1.result_status === "retry_scheduled" &&
      String(target.platform_status) === "pending" &&
      Number(target.attempt_count) === 1 &&
      String(target.last_error_code) === "TEST_TRANSIENT" &&
      Date.parse(String(target.next_retry_at)) ===
        t1 + PUBLISHING_RETRY_BASE_DELAY_MS &&
      ownLogs().length === 1;

    const retryTime = Date.parse(String(target.next_retry_at || ""));
    if (!Number.isFinite(retryTime)) {
      throw new Error("RETRY_TIMESTAMP_MISSING");
    }

    const t2 = retryTime + 1000;
    const iso2 = new Date(t2).toISOString();

    const c2 = claimDuePublishingTarget_(workbook, targetId, iso2);
    target = get(targets, "target_id", targetId);

    checks.retryClaim =
      c2.ok === true &&
      String(target.platform_status) === "publishing" &&
      Number(target.attempt_count) === 1;

    const o2 = recordPublishingOutcome_(workbook, targetId, {
      success: true,
      platform_post_id: "TEST_PLATFORM_POST_ONLY",
      max_attempts: 3
    }, iso2);

    target = get(targets, "target_id", targetId);

    checks.successRecorded =
      o2.result_status === "success" &&
      String(target.platform_status) === "published" &&
      String(target.platform_post_id) === "TEST_PLATFORM_POST_ONLY" &&
      String(target.published_at_utc) === iso2 &&
      !String(target.next_retry_at || "") &&
      ownLogs().length === 2;

    const rows = ownLogs();

    checks.attemptsAndLogsCorrect =
      Number(target.attempt_count) === 2 &&
      rows.filter(function (row) {
        return row.result_status === "retry_scheduled";
      }).length === 1 &&
      rows.filter(function (row) {
        return row.result_status === "success";
      }).length === 1;

    let duplicateError = "";

    try {
      recordPublishingOutcome_(workbook, targetId, {
        success: true,
        platform_post_id: "TEST_DUPLICATE_ONLY"
      }, new Date(t2 + 1000).toISOString());
    } catch (error) {
      duplicateError = String(error && error.message || error);
    }

    checks.duplicateOutcomeRejected =
      duplicateError === "POST_TARGET_NOT_CLAIMED";

    target = get(targets, "target_id", targetId);

    checks.duplicateDidNotChangeState =
      ownLogs().length === 2 &&
      String(target.platform_post_id) === "TEST_PLATFORM_POST_ONLY" &&
      Number(target.attempt_count) === 2;

  } catch (error) {
    checks.failureCode =
      String(error && error.message || "TEST_FAILED").slice(0, 120);

  } finally {
    try {
      let m = findRecordByValue_(logs, "target_id", targetId);
      while (m) {
        logs.deleteRow(m.rowNumber);
        m = findRecordByValue_(logs, "target_id", targetId);
      }
    } catch (error) {
      cleanupErrors.push("LOG_CLEANUP_FAILED");
    }

    try {
      let m = findRecordByValue_(targets, "target_id", targetId);
      while (m) {
        targets.deleteRow(m.rowNumber);
        m = findRecordByValue_(targets, "target_id", targetId);
      }
    } catch (error) {
      cleanupErrors.push("TARGET_CLEANUP_FAILED");
    }

    try {
      let m = findRecordByValue_(posts, "post_id", postId);
      while (m) {
        posts.deleteRow(m.rowNumber);
        m = findRecordByValue_(posts, "post_id", postId);
      }
    } catch (error) {
      cleanupErrors.push("POST_CLEANUP_FAILED");
    }
  }

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
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

