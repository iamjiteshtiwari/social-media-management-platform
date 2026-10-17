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
