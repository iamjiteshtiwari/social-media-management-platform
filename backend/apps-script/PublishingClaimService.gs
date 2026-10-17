/**
 * Publishing target claims and interrupted-claim inspection.
 *
 * This file deliberately does not publish to a provider, create triggers, or
 * expose a public route. A stale "publishing" target is reported for
 * reconciliation only; it is never automatically returned to the queue.
 */

function claimDuePublishingTarget_(workbook, targetId, nowIso) {
  const targetKey = String(targetId || "").trim();
  if (!workbook || !targetKey) throw new Error("INVALID_PUBLISHING_CLAIM");
  const timestamp = nowIso ? Date.parse(String(nowIso)) : Date.now();
  if (!Number.isFinite(timestamp)) throw new Error("INVALID_PUBLISHING_TIMESTAMP");
  const claimedAt = new Date(timestamp).toISOString();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    assertOperationalWorkbookSchema_(workbook);
    const targets = getRequiredSheet_(workbook, "PostTargets");
    const posts = getRequiredSheet_(workbook, "Posts");
    const match = findRecordByValue_(targets, "target_id", targetKey);
    if (!match) throw new Error("POST_TARGET_NOT_FOUND");
    const target = rowToRecord_(targets, match);
    const status = String(target.platform_status || "").trim().toLowerCase();
    if (status === "publishing") throw new Error("POST_TARGET_ALREADY_CLAIMED");
    if (status !== "scheduled" && status !== "pending") {
      throw new Error("POST_TARGET_NOT_CLAIMABLE");
    }

    const postMatch = findRecordByValue_(posts, "post_id", String(target.post_id || ""));
    if (!postMatch) throw new Error("POST_NOT_FOUND");
    const post = rowToRecord_(posts, postMatch);
    const postStatus = String(post.status || "").trim().toLowerCase();
    if (post.deleted_at || ["cancelled", "deleted", "published", "publishing"].indexOf(postStatus) >= 0) {
      throw new Error("POST_NOT_CLAIMABLE");
    }

    // Reuse the canonical due selector under the lock so a stale queue preview
    // cannot bypass current schedule, retry, or cancellation checks.
    const due = previewDuePublishingTargets_(workbook, claimedAt, 100);
    const eligible = due.targets.some(function (item) { return item.target_id === targetKey; });
    if (!eligible) throw new Error("POST_TARGET_NOT_DUE");

    updateSheetRowFields_(targets, match.rowNumber, {
      platform_status: "publishing",
      updated_at: claimedAt
    });
    return {
      ok: true,
      target_id: targetKey,
      platform_status: "publishing",
      claimed_at: claimedAt,
      note: "Claim only; no provider call was made and attempt_count was not incremented."
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Read-only report of claims older than staleAfterMs. Does not reset status or
 * retry publishing because the provider outcome may be unknown after a crash.
 */
function previewStalePublishingClaims_(workbook, nowIso, staleAfterMs, limit) {
  if (!workbook) throw new Error("OPERATIONAL_WORKBOOK_REQUIRED");
  const nowValue = nowIso === undefined ? Date.now() : Date.parse(String(nowIso));
  if (!Number.isFinite(nowValue)) throw new Error("INVALID_QUEUE_TIMESTAMP");
  const staleMs = staleAfterMs === undefined ? 15 * 60 * 1000 : Number(staleAfterMs);
  const maxItems = limit === undefined ? 25 : Number(limit);
  if (!Number.isFinite(staleMs) || staleMs < 60 * 1000 || staleMs > 24 * 60 * 60 * 1000) {
    throw new Error("INVALID_STALE_CLAIM_AGE");
  }
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) {
    throw new Error("INVALID_QUEUE_LIMIT");
  }

  assertOperationalWorkbookSchema_(workbook);
  const targets = readSheetRecords_(getRequiredSheet_(workbook, "PostTargets"));
  const stale = [];
  targets.forEach(function (target) {
    if (String(target.platform_status || "").trim().toLowerCase() !== "publishing") return;
    const updatedAt = Date.parse(String(target.updated_at || ""));
    if (!Number.isFinite(updatedAt) || nowValue - updatedAt < staleMs) return;
    stale.push({
      target_id: String(target.target_id || ""),
      post_id: String(target.post_id || ""),
      claimed_at_utc: new Date(updatedAt).toISOString(),
      stale_for_ms: nowValue - updatedAt,
      action_required: "RECONCILE_PROVIDER_OUTCOME_BEFORE_RETRY"
    });
  });
  stale.sort(function (a, b) {
    return a.claimed_at_utc.localeCompare(b.claimed_at_utc) ||
      a.target_id.localeCompare(b.target_id);
  });
  return {
    ok: true,
    dryRun: true,
    selected: Math.min(stale.length, maxItems),
    limit: maxItems,
    now_utc: new Date(nowValue).toISOString(),
    targets: stale.slice(0, maxItems),
    note: "Read-only stale-claim report; no status was changed and no retry was queued."
  };
}

/** TEST-only claim/recovery safety test using disposable synthetic rows. */
function testPublishingClaimAndStaleInspection() {
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
  const postId = "TEST_CLAIM_POST_" + suffix;
  const targetId = "TEST_CLAIM_TARGET_" + suffix;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const dueAt = new Date(now - 60 * 1000).toISOString();
  const cleanupErrors = [];
  const checks = {
    dueTargetClaimed: false,
    attemptCountUnchanged: false,
    duplicateClaimRejected: false,
    staleClaimDetected: false,
    staleClaimNotAutomaticallyReset: false,
    cancelledParentRejected: false
  };

  try {
    appendRecord_(posts, {
      post_id: postId, brand_id: "TEST_BRAND_ONLY", caption: "Synthetic claim test",
      first_comment: "", content_type: "text", status: "scheduled",
      scheduled_at_utc: dueAt, timezone: "UTC", created_at: nowIso,
      updated_at: nowIso, deleted_at: ""
    });
    appendRecord_(targets, {
      target_id: targetId, post_id: postId, social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: "scheduled", scheduled_at_utc: dueAt, published_at_utc: "",
      platform_post_id: "", attempt_count: 0, next_retry_at: "", last_error_code: "",
      updated_at: nowIso
    });

    const claimed = claimDuePublishingTarget_(workbook, targetId, nowIso);
    let targetMatch = findRecordByValue_(targets, "target_id", targetId);
    let target = rowToRecord_(targets, targetMatch);
    checks.dueTargetClaimed = claimed.ok === true &&
      String(target.platform_status) === "publishing";
    checks.attemptCountUnchanged = Number(target.attempt_count) === 0;

    try {
      claimDuePublishingTarget_(workbook, targetId, nowIso);
    } catch (error) {
      checks.duplicateClaimRejected = String(error && error.message || "").indexOf("POST_TARGET_ALREADY_CLAIMED") >= 0;
    }

    const oldTime = new Date(now - 20 * 60 * 1000).toISOString();
    updateSheetRowFields_(targets, targetMatch.rowNumber, { updated_at: oldTime });
    const staleReport = previewStalePublishingClaims_(workbook, nowIso, 15 * 60 * 1000, 100);
    checks.staleClaimDetected = staleReport.targets.some(function (item) {
      return item.target_id === targetId &&
        item.action_required === "RECONCILE_PROVIDER_OUTCOME_BEFORE_RETRY";
    });
    targetMatch = findRecordByValue_(targets, "target_id", targetId);
    target = rowToRecord_(targets, targetMatch);
    checks.staleClaimNotAutomaticallyReset = String(target.platform_status) === "publishing";

    updateSheetRowFields_(posts, findRecordByValue_(posts, "post_id", postId).rowNumber, {
      status: "cancelled", updated_at: nowIso
    });
    try {
      // Reset only the disposable test target to a due state to verify the
      // claim gate rejects a cancelled parent post.
      updateSheetRowFields_(targets, targetMatch.rowNumber, {
        platform_status: "scheduled", updated_at: nowIso
      });
      claimDuePublishingTarget_(workbook, targetId, nowIso);
    } catch (error) {
      checks.cancelledParentRejected = String(error && error.message || "").indexOf("POST_NOT_CLAIMABLE") >= 0;
    }
  } catch (error) {
    cleanupErrors.push("TEST_FAILED:" + String(error && error.message || "UNKNOWN").slice(0, 100));
  } finally {
    try {
      let match = findRecordByValue_(targets, "target_id", targetId);
      while (match) {
        targets.deleteRow(match.rowNumber);
        match = findRecordByValue_(targets, "target_id", targetId);
      }
    } catch (error) {
      cleanupErrors.push("TARGET_CLEANUP_FAILED");
    }
    try {
      let match = findRecordByValue_(posts, "post_id", postId);
      while (match) {
        posts.deleteRow(match.rowNumber);
        match = findRecordByValue_(posts, "post_id", postId);
      }
    } catch (error) {
      cleanupErrors.push("POST_CLEANUP_FAILED");
    }
  }

  const passed = Object.keys(checks).filter(function (key) { return checks[key]; }).length;
  const result = {
    ok: passed === Object.keys(checks).length && cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
