/**
 * TEST-only regression test for deleteUserPost_ while a target is publishing.
 * Uses only OPERATIONAL_TEST_SPREADSHEET_ID and synthetic rows.
 * No API calls, provider calls, deployments, or production workbook access.
 */
function testDeletePostBlockedDuringPublishing() {
  const testId = getRequiredPrivateProperty_(AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID);
  const masterId = getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);
  if (testId === masterId) throw new Error("OPERATIONAL_AND_MASTER_IDS_MUST_DIFFER");

  const workbook = SpreadsheetApp.openById(testId);
  if (!/test/i.test(workbook.getName())) throw new Error("OPERATIONAL_TEST_SHEET_NAME_MUST_INCLUDE_TEST");
  assertOperationalWorkbookSchema_(workbook);

  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");
  const suffix = Utilities.getUuid();
  const postId = "TEST_DELETE_PUBLISHING_POST_" + suffix;
  const targetId = "TEST_DELETE_PUBLISHING_TARGET_" + suffix;
  const now = new Date().toISOString();
  const cleanupErrors = [];
  const checks = {
    deleteRejectedDuringPublishing: false,
    parentPostRemainsUnchanged: false,
    publishingTargetRemainsUnchanged: false
  };

  // Temporarily provide the isolated workbook to the service under test.
  // Restore the original resolver even if an assertion or service call fails.
  const originalResolver = getOperationalContextForUser_;
  try {
    appendRecord_(posts, {
      post_id: postId, brand_id: "TEST_BRAND_ONLY",
      caption: "Synthetic delete safety test", first_comment: "",
      content_type: "text", status: "scheduled",
      scheduled_at_utc: "", timezone: "UTC",
      created_at: now, updated_at: now, deleted_at: ""
    });
    appendRecord_(targets, {
      target_id: targetId, post_id: postId,
      social_connection_id: "TEST_CONNECTION_ONLY",
      platform_status: "publishing", scheduled_at_utc: now,
      published_at_utc: "", platform_post_id: "", attempt_count: 0,
      next_retry_at: "", last_error_code: "", updated_at: now
    });

    getOperationalContextForUser_ = function () {
      return { user: { user_id: "TEST_DELETE_USER" }, resource: {}, workbook: workbook };
    };

    try {
      deleteUserPost_("TEST_DELETE_USER", postId);
    } catch (error) {
      checks.deleteRejectedDuringPublishing =
        String(error && error.message || "") === "POST_PUBLISH_IN_PROGRESS";
    }

    const postMatch = findRecordByValue_(posts, "post_id", postId);
    const targetMatch = findRecordByValue_(targets, "target_id", targetId);
    const post = postMatch ? rowToRecord_(posts, postMatch) : {};
    const target = targetMatch ? rowToRecord_(targets, targetMatch) : {};
    checks.parentPostRemainsUnchanged =
      !!postMatch && String(post.status) === "scheduled" && !String(post.deleted_at || "");
    checks.publishingTargetRemainsUnchanged =
      !!targetMatch && String(target.platform_status) === "publishing";
  } catch (error) {
    cleanupErrors.push("TEST_FAILED:" + String(error && error.message || "UNKNOWN").slice(0, 100));
  } finally {
    getOperationalContextForUser_ = originalResolver;
    [targetId].forEach(function (id) {
      try {
        let match = findRecordByValue_(targets, "target_id", id);
        while (match) {
          targets.deleteRow(match.rowNumber);
          match = findRecordByValue_(targets, "target_id", id);
        }
      } catch (error) {
        cleanupErrors.push("TARGET_CLEANUP_FAILED");
      }
    });
    [postId].forEach(function (id) {
      try {
        let match = findRecordByValue_(posts, "post_id", id);
        while (match) {
          posts.deleteRow(match.rowNumber);
          match = findRecordByValue_(posts, "post_id", id);
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
