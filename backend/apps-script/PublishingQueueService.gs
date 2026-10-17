/**
 * Read-only publishing queue selection.
 *
 * This module selects due work only. It does not call providers, claim targets,
 * change target state, or expose an API route. A separate worker/claim protocol
 * must be reviewed before automatic publishing is enabled.
 */
function previewDuePublishingTargets_(workbook, nowIso, limit) {
  if (!workbook) throw new Error("OPERATIONAL_WORKBOOK_REQUIRED");
  const nowValue = nowIso === undefined ? Date.now() : Date.parse(String(nowIso));
  if (!Number.isFinite(nowValue)) throw new Error("INVALID_QUEUE_TIMESTAMP");
  const maxItems = limit === undefined ? 25 : Number(limit);
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) {
    throw new Error("INVALID_QUEUE_LIMIT");
  }

  assertOperationalWorkbookSchema_(workbook);
  const targets = readSheetRecords_(getRequiredSheet_(workbook, "PostTargets"));
  const posts = readSheetRecords_(getRequiredSheet_(workbook, "Posts"));
  const postsById = {};
  posts.forEach(function (post) {
    const id = String(post.post_id || "").trim();
    if (id) postsById[id] = post;
  });

  const due = [];
  const skipped = {
    terminalTarget: 0,
    missingPost: 0,
    terminalPost: 0,
    invalidSchedule: 0,
    notDue: 0,
    unsupportedState: 0
  };

  targets.forEach(function (target) {
    if (due.length >= maxItems) return;
    const targetId = String(target.target_id || "").trim();
    const postId = String(target.post_id || "").trim();
    const status = String(target.platform_status || "").trim().toLowerCase();
    if (!targetId || !postId) { skipped.missingPost++; return; }
    if (["cancelled", "failed", "published"].indexOf(status) >= 0) {
      skipped.terminalTarget++;
      return;
    }
    if (status !== "scheduled" && status !== "pending") {
      skipped.unsupportedState++;
      return;
    }

    const post = postsById[postId];
    if (!post) { skipped.missingPost++; return; }
    const postStatus = String(post.status || "").trim().toLowerCase();
    if (post.deleted_at || ["cancelled", "deleted", "published", "publishing"].indexOf(postStatus) >= 0) {
      skipped.terminalPost++;
      return;
    }

    let dueAtRaw = "";
    if (status === "scheduled") {
      if (postStatus !== "scheduled") { skipped.unsupportedState++; return; }
      dueAtRaw = target.scheduled_at_utc || post.scheduled_at_utc || "";
    } else {
      // Pending targets are eligible only when explicitly marked for retry.
      // A blank retry time is not an implicit "publish now" instruction.
      dueAtRaw = target.next_retry_at || "";
    }

    const dueAt = dueAtRaw ? Date.parse(String(dueAtRaw)) : NaN;
    if (!Number.isFinite(dueAt)) { skipped.invalidSchedule++; return; }
    if (dueAt > nowValue) { skipped.notDue++; return; }

    due.push({
      target_id: targetId,
      post_id: postId,
      social_connection_id: String(target.social_connection_id || ""),
      queue_reason: status === "scheduled" ? "scheduled_time_due" : "retry_time_due",
      due_at_utc: new Date(dueAt).toISOString(),
      attempt_count: Number(target.attempt_count || 0)
    });
  });

  due.sort(function (a, b) {
    return a.due_at_utc.localeCompare(b.due_at_utc) ||
      a.target_id.localeCompare(b.target_id);
  });

  return {
    ok: true,
    dryRun: true,
    selected: due.length,
    limit: maxItems,
    now_utc: new Date(nowValue).toISOString(),
    targets: due,
    skipped: skipped,
    note: "Read-only preview only; no target was claimed or modified."
  };
}

/**
 * TEST-only selector test. Uses unique synthetic rows in the operational TEST
 * workbook and removes only the rows created by this test.
 */
function testDuePublishingQueueSelection() {
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

  const postsSheet = getRequiredSheet_(workbook, "Posts");
  const targetsSheet = getRequiredSheet_(workbook, "PostTargets");
  const suffix = Utilities.getUuid();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const ids = {
    duePost: "TEST_QUEUE_POST_DUE_" + suffix,
    futurePost: "TEST_QUEUE_POST_FUTURE_" + suffix,
    retryPost: "TEST_QUEUE_POST_RETRY_" + suffix,
    blankRetryPost: "TEST_QUEUE_POST_BLANK_" + suffix,
    cancelledPost: "TEST_QUEUE_POST_CANCELLED_" + suffix,
    dueTarget: "TEST_QUEUE_TARGET_DUE_" + suffix,
    futureTarget: "TEST_QUEUE_TARGET_FUTURE_" + suffix,
    retryTarget: "TEST_QUEUE_TARGET_RETRY_" + suffix,
    blankRetryTarget: "TEST_QUEUE_TARGET_BLANK_" + suffix,
    cancelledTarget: "TEST_QUEUE_TARGET_CANCELLED_" + suffix
  };
  const postIds = [ids.duePost, ids.futurePost, ids.retryPost, ids.blankRetryPost, ids.cancelledPost];
  const targetIds = [ids.dueTarget, ids.futureTarget, ids.retryTarget, ids.blankRetryTarget, ids.cancelledTarget];
  const cleanupErrors = [];
  const checks = {
    dueScheduledIncluded: false,
    futureScheduledExcluded: false,
    dueRetryIncluded: false,
    pendingWithoutRetryExcluded: false,
    cancelledTargetExcluded: false
  };

  function addPost(postId, status, scheduledAt) {
    appendRecord_(postsSheet, {
      post_id: postId, brand_id: "TEST_BRAND_ONLY", caption: "Synthetic queue test",
      first_comment: "", content_type: "text", status: status,
      scheduled_at_utc: scheduledAt || "", timezone: "UTC",
      created_at: nowIso, updated_at: nowIso, deleted_at: ""
    });
  }
  function addTarget(targetId, postId, status, scheduledAt, retryAt) {
    appendRecord_(targetsSheet, {
      target_id: targetId, post_id: postId, social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: status, scheduled_at_utc: scheduledAt || "",
      published_at_utc: "", platform_post_id: "", attempt_count: status === "pending" && retryAt ? 1 : 0,
      next_retry_at: retryAt || "", last_error_code: retryAt ? "TEST_TRANSIENT" : "",
      updated_at: nowIso
    });
  }

  try {
    const dueAt = new Date(now - 60 * 1000).toISOString();
    const futureAt = new Date(now + 60 * 60 * 1000).toISOString();
    const retryAt = new Date(now - 30 * 1000).toISOString();

    addPost(ids.duePost, "scheduled", dueAt);
    addPost(ids.futurePost, "scheduled", futureAt);
    addPost(ids.retryPost, "draft", "");
    addPost(ids.blankRetryPost, "draft", "");
    addPost(ids.cancelledPost, "scheduled", dueAt);

    addTarget(ids.dueTarget, ids.duePost, "scheduled", dueAt, "");
    addTarget(ids.futureTarget, ids.futurePost, "scheduled", futureAt, "");
    addTarget(ids.retryTarget, ids.retryPost, "pending", "", retryAt);
    addTarget(ids.blankRetryTarget, ids.blankRetryPost, "pending", "", "");
    addTarget(ids.cancelledTarget, ids.cancelledPost, "cancelled", dueAt, "");

    // The cancelled parent post is also excluded if a target is mistakenly left queued.
    const cancelledPostMatch = findRecordByValue_(postsSheet, "post_id", ids.cancelledPost);
    if (cancelledPostMatch) updateSheetRowFields_(postsSheet, cancelledPostMatch.rowNumber, { status: "cancelled" });

    const result = previewDuePublishingTargets_(workbook, nowIso, 25);
    const selectedIds = result.targets.map(function (target) { return target.target_id; });
    checks.dueScheduledIncluded = selectedIds.indexOf(ids.dueTarget) >= 0 &&
      result.targets.some(function (target) { return target.target_id === ids.dueTarget && target.queue_reason === "scheduled_time_due"; });
    checks.futureScheduledExcluded = selectedIds.indexOf(ids.futureTarget) < 0;
    checks.dueRetryIncluded = selectedIds.indexOf(ids.retryTarget) >= 0 &&
      result.targets.some(function (target) { return target.target_id === ids.retryTarget && target.queue_reason === "retry_time_due"; });
    checks.pendingWithoutRetryExcluded = selectedIds.indexOf(ids.blankRetryTarget) < 0;
    checks.cancelledTargetExcluded = selectedIds.indexOf(ids.cancelledTarget) < 0;
  } catch (error) {
    cleanupErrors.push("TEST_FAILED:" + String(error && error.message || "UNKNOWN").slice(0, 100));
  } finally {
    targetIds.forEach(function (targetId) {
      try {
        let match = findRecordByValue_(targetsSheet, "target_id", targetId);
        while (match) {
          targetsSheet.deleteRow(match.rowNumber);
          match = findRecordByValue_(targetsSheet, "target_id", targetId);
        }
      } catch (error) {
        cleanupErrors.push("TARGET_CLEANUP_FAILED");
      }
    });
    postIds.forEach(function (postId) {
      try {
        let match = findRecordByValue_(postsSheet, "post_id", postId);
        while (match) {
          postsSheet.deleteRow(match.rowNumber);
          match = findRecordByValue_(postsSheet, "post_id", postId);
        }
      } catch (error) {
        cleanupErrors.push("POST_CLEANUP_FAILED");
      }
    });
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
