/**
 * TEST-only regression coverage for parent Posts.status aggregation.
 * Uses synthetic rows in the disposable operational TEST workbook only.
 * No provider calls, production writes, or live publishing.
 */
function testPostAggregateStatusLifecycle() {
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
  const stamp = new Date().toISOString();
  const cases = [
    { name: "activeTargetKeepsParentScheduled", initial: "scheduled", statuses: ["published", "pending"], expected: "scheduled" },
    { name: "allPublishedMarksParentPublished", initial: "scheduled", statuses: ["published", "published"], expected: "published" },
    { name: "terminalFailureMarksParentFailed", initial: "scheduled", statuses: ["published", "failed"], expected: "failed" },
    { name: "mixedPublishedAndCancelledMarksParentFailed", initial: "scheduled", statuses: ["published", "cancelled"], expected: "failed" },
    { name: "allCancelledPreservesParentStatus", initial: "cancelled", statuses: ["cancelled", "cancelled"], expected: "cancelled" },
    { name: "noTargetsLeavesParentUnchanged", initial: "draft", statuses: [], expected: "draft" }
  ];
  const postIds = cases.map(function () { return "TEST_POST_AGG_" + Utilities.getUuid(); });
  const targetIds = [];
  const cleanupErrors = [];
  const checks = {};
  let failureCode = "";

  function appendSyntheticPost(postId, status) {
    appendRecord_(posts, {
      post_id: postId,
      brand_id: "TEST_BRAND_ONLY",
      caption: "Synthetic aggregate status test",
      first_comment: "",
      content_type: "text",
      status: status,
      scheduled_at_utc: "",
      timezone: "Asia/Kolkata",
      created_at: stamp,
      updated_at: stamp,
      deleted_at: ""
    });
  }

  function appendSyntheticTarget(postId, status) {
    const targetId = "TEST_TARGET_AGG_" + Utilities.getUuid();
    targetIds.push(targetId);
    appendRecord_(targets, {
      target_id: targetId,
      post_id: postId,
      social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: status,
      scheduled_at_utc: "",
      published_at_utc: status === "published" ? stamp : "",
      platform_post_id: status === "published" ? "TEST_PLATFORM_POST_ONLY" : "",
      attempt_count: status === "published" || status === "failed" ? 1 : 0,
      next_retry_at: "",
      last_error_code: status === "failed" ? "TEST_FAILURE" : "",
      updated_at: stamp
    });
  }

  try {
    cases.forEach(function (testCase, index) {
      const postId = postIds[index];
      appendSyntheticPost(postId, testCase.initial);
      testCase.statuses.forEach(function (status) {
        appendSyntheticTarget(postId, status);
      });
    });

    cases.forEach(function (testCase, index) {
      const result = syncParentPostStatusFromTargets_(workbook, postIds[index], stamp);
      const match = findRecordByValue_(posts, "post_id", postIds[index]);
      const actual = match ? String(rowToRecord_(posts, match).status || "") : "";
      checks[testCase.name] = actual === testCase.expected && result.status === testCase.expected;
    });
  } catch (error) {
    failureCode = String(error && error.message || "TEST_FAILED").slice(0, 120);
  } finally {
    targetIds.forEach(function (targetId) {
      try {
        const match = findRecordByValue_(targets, "target_id", targetId);
        if (match) targets.deleteRow(match.rowNumber);
      } catch (error) {
        cleanupErrors.push("TARGET_CLEANUP_FAILED");
      }
    });
    postIds.forEach(function (postId) {
      try {
        const match = findRecordByValue_(posts, "post_id", postId);
        if (match) posts.deleteRow(match.rowNumber);
      } catch (error) {
        cleanupErrors.push("POST_CLEANUP_FAILED");
      }
    });
  }

  const passed = Object.keys(checks).filter(function (key) { return checks[key]; }).length;
  return {
    ok: passed === cases.length && !failureCode && cleanupErrors.length === 0,
    passed: passed,
    total: cases.length,
    checks: checks,
    failureCode: failureCode,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };
}
