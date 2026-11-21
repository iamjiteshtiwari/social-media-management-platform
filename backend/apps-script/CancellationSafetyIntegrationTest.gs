
function testOperationalCancellationSafety() {
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

  const context = getOperationalContextForUser_(user.user_id);
  const workbook = context.workbook;

  if (!/test/i.test(workbook.getName())) {
    throw new Error("REFUSING_NON_TEST_OPERATIONAL");
  }

  const brands = getRequiredSheet_(workbook, "Brands");
  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");

  const brandId = "TEST_CANCEL_BRAND_" + Utilities.getUuid();
  const postId = "TEST_CANCEL_POST_" + Utilities.getUuid();
  const queuedTargetId = "TEST_CANCEL_QUEUED_" + Utilities.getUuid();
  const publishingTargetId = "TEST_CANCEL_PUBLISHING_" + Utilities.getUuid();
  const now = new Date().toISOString();
  const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const result = {
    workbookIsTest: true,
    queuedCancellationAllowed: false,
    publishingCancellationBlocked: false,
    publishingTargetUnchanged: false,
    queuedTargetCleanupPassed: false,
    cleanupPassed: false
  };

  try {
    appendRecord_(brands, {
      brand_id: brandId,
      brand_name: "Temporary Cancellation Safety Test",
      description: "Disposable test record",
      website_url: "",
      timezone: "Asia/Kolkata",
      status: "active",
      created_at: now,
      updated_at: now
    });

    appendRecord_(posts, {
      post_id: postId,
      brand_id: brandId,
      caption: "Disposable cancellation safety test",
      first_comment: "",
      content_type: "text",
      status: "scheduled",
      scheduled_at_utc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: "Asia/Kolkata",
      created_at: now,
      updated_at: now,
      deleted_at: ""
    });

    const targetHeaders = getHeaderMap_(targets);

    function makeTarget(targetId, status) {
      const record = {};
      Object.keys(targetHeaders).forEach(function (field) {
        record[field] = "";
      });

      record.target_id = targetId;
      record.post_id = postId;
      record.platform_status = status;
      record.next_retry_at = retryAt;
      record.updated_at = now;

      return record;
    }

    appendRecord_(targets, makeTarget(queuedTargetId, "pending"));
    appendRecord_(targets, makeTarget(publishingTargetId, "publishing"));

    // The guard must reject cancellation while a target is publishing.
    let blocked = false;
    try {
      assertPostCanBeCancelled_(workbook, postId);
    } catch (error) {
      blocked = error.message === "POST_PUBLISH_IN_PROGRESS";
    }

    result.publishingCancellationBlocked = blocked;

    const publishingMatch = findRecordByValue_(
      targets, "target_id", publishingTargetId
    );
    const publishingRecord = publishingMatch
      ? rowToRecord_(targets, publishingMatch) : {};

    result.publishingTargetUnchanged =
      String(publishingRecord.platform_status) === "publishing" &&
      String(publishingRecord.next_retry_at) === retryAt;

    if (!blocked) {
      throw new Error("PUBLISHING_CANCELLATION_GUARD_FAILED");
    }

    // Simulate the cleanup step used after an allowed cancellation.
    // This test does not change the parent post's status.
    const changed = cancelPostTargets_(workbook, postId, now);

    const queuedMatch = findRecordByValue_(
      targets, "target_id", queuedTargetId
    );
    const queuedRecord = queuedMatch
      ? rowToRecord_(targets, queuedMatch) : {};

    const publishingAfterMatch = findRecordByValue_(
      targets, "target_id", publishingTargetId
    );
    const publishingAfter = publishingAfterMatch
      ? rowToRecord_(targets, publishingAfterMatch) : {};

    result.queuedCancellationAllowed =
      changed === 1 &&
      String(queuedRecord.platform_status) === "cancelled" &&
      !String(queuedRecord.next_retry_at || "");

    result.queuedTargetCleanupPassed = result.queuedCancellationAllowed &&
      String(publishingAfter.platform_status) === "publishing" &&
      String(publishingAfter.next_retry_at) === retryAt;

    if (!result.queuedTargetCleanupPassed) {
      throw new Error("TARGET_CLEANUP_CHECK_FAILED");
    }
  } finally {
    // Delete only the uniquely identified test records.
    [publishingTargetId, queuedTargetId].forEach(function (id) {
      const match = findRecordByValue_(targets, "target_id", id);
      if (match) targets.deleteRow(match.rowNumber);
    });

    const postMatch = findRecordByValue_(posts, "post_id", postId);
    if (postMatch) posts.deleteRow(postMatch.rowNumber);

    const brandMatch = findRecordByValue_(brands, "brand_id", brandId);
    if (brandMatch) brands.deleteRow(brandMatch.rowNumber);

    result.cleanupPassed =
      !findRecordByValue_(targets, "target_id", queuedTargetId) &&
      !findRecordByValue_(targets, "target_id", publishingTargetId) &&
      !findRecordByValue_(posts, "post_id", postId) &&
      !findRecordByValue_(brands, "brand_id", brandId);
  }

  result.ok = result.queuedCancellationAllowed &&
    result.publishingCancellationBlocked &&
    result.publishingTargetUnchanged &&
    result.queuedTargetCleanupPassed &&
    result.cleanupPassed;

  console.log("CANCELLATION SAFETY TEST:");
  console.log(JSON.stringify(result, null, 2));
  return result;
}



function testUpdateUserPostCancellationEndToEnd() {
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

  const context = getOperationalContextForUser_(user.user_id);
  const workbook = context.workbook;

  if (!/test/i.test(workbook.getName())) {
    throw new Error("REFUSING_NON_TEST_OPERATIONAL");
  }

  const brands = getRequiredSheet_(workbook, "Brands");
  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");

  const brandId = "TEST_E2E_CANCEL_BRAND_" + Utilities.getUuid();
  const postId = "TEST_E2E_CANCEL_POST_" + Utilities.getUuid();
  const queuedTargetId = "TEST_E2E_CANCEL_QUEUED_" + Utilities.getUuid();
  const publishingTargetId = "TEST_E2E_CANCEL_PUBLISHING_" + Utilities.getUuid();

  const now = new Date().toISOString();
  const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const result = {
    workbookIsTest: true,
    testRecordsCreated: false,
    publishingCancellationBlocked: false,
    parentUnchangedAfterBlockedCancellation: false,
    targetsUnchangedAfterBlockedCancellation: false,
    allowedCancellationSucceeded: false,
    parentPostCancelled: false,
    queuedTargetCancelled: false,
    publishingTargetCancelledAfterReturningToPending: false,
    retryTimesCleared: false,
    cleanupPassed: false,
    ok: false
  };

  function getRecord(sheet, key, value) {
    const match = findRecordByValue_(sheet, key, value);
    return match ? rowToRecord_(sheet, match) : null;
  }

  function makeTarget(targetId, status) {
    const headers = getHeaderMap_(targets);
    const record = {};

    Object.keys(headers).forEach(function (field) {
      record[field] = "";
    });

    record.target_id = targetId;
    record.post_id = postId;
    record.platform_status = status;
    record.next_retry_at = retryAt;
    record.updated_at = now;

    return record;
  }

  try {
    // Create isolated fixtures in the TEST operational workbook.
    appendRecord_(brands, {
      brand_id: brandId,
      brand_name: "Temporary E2E Cancellation Test",
      description: "Disposable automated test record",
      website_url: "",
      timezone: "Asia/Kolkata",
      status: "active",
      created_at: now,
      updated_at: now
    });

    appendRecord_(posts, {
      post_id: postId,
      brand_id: brandId,
      caption: "Disposable end-to-end cancellation test",
      first_comment: "",
      content_type: "text",
      status: "scheduled",
      scheduled_at_utc: new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString(),
      timezone: "Asia/Kolkata",
      created_at: now,
      updated_at: now,
      deleted_at: ""
    });

    appendRecord_(targets, makeTarget(queuedTargetId, "pending"));
    appendRecord_(targets, makeTarget(publishingTargetId, "publishing"));

    result.testRecordsCreated =
      !!getRecord(brands, "brand_id", brandId) &&
      !!getRecord(posts, "post_id", postId) &&
      !!getRecord(targets, "target_id", queuedTargetId) &&
      !!getRecord(targets, "target_id", publishingTargetId);

    if (!result.testRecordsCreated) {
      throw new Error("TEST_FIXTURE_CREATION_FAILED");
    }

    // Phase 1: cancellation must be rejected while a target is publishing.
    let blockedError = "";

    try {
      updateUserPost_(user.user_id, postId, {
        status: "cancelled"
      });
    } catch (error) {
      blockedError = String(error.message || error);
    }

    result.publishingCancellationBlocked =
      blockedError === "POST_PUBLISH_IN_PROGRESS";

    const parentAfterBlocked = getRecord(posts, "post_id", postId);
    const queuedAfterBlocked = getRecord(
      targets, "target_id", queuedTargetId
    );
    const publishingAfterBlocked = getRecord(
      targets, "target_id", publishingTargetId
    );

    result.parentUnchangedAfterBlockedCancellation =
      !!parentAfterBlocked &&
      String(parentAfterBlocked.status) === "scheduled";

    result.targetsUnchangedAfterBlockedCancellation =
      !!queuedAfterBlocked &&
      String(queuedAfterBlocked.platform_status) === "pending" &&
      String(queuedAfterBlocked.next_retry_at) === retryAt &&
      !!publishingAfterBlocked &&
      String(publishingAfterBlocked.platform_status) === "publishing" &&
      String(publishingAfterBlocked.next_retry_at) === retryAt;

    if (!result.publishingCancellationBlocked) {
      throw new Error("PUBLISHING_CANCELLATION_NOT_BLOCKED");
    }

    if (!result.parentUnchangedAfterBlockedCancellation) {
      throw new Error("PARENT_CHANGED_AFTER_BLOCKED_CANCELLATION");
    }

    if (!result.targetsUnchangedAfterBlockedCancellation) {
      throw new Error("TARGETS_CHANGED_AFTER_BLOCKED_CANCELLATION");
    }

    // Phase 2: simulate the publishing target returning to the pending queue.
    const publishingMatch = findRecordByValue_(
      targets, "target_id", publishingTargetId
    );

    if (!publishingMatch) {
      throw new Error("PUBLISHING_TEST_TARGET_NOT_FOUND");
    }

    updateSheetRowFields_(targets, publishingMatch.rowNumber, {
      platform_status: "pending",
      updated_at: new Date().toISOString()
    });

    // Exercise the actual service function, not the cancellation helpers.
    const cancellationResponse = updateUserPost_(
      user.user_id,
      postId,
      { status: "cancelled" }
    );

    result.allowedCancellationSucceeded =
      !!cancellationResponse &&
      cancellationResponse.ok === true &&
      cancellationResponse.code === "POST_UPDATED" &&
      String(cancellationResponse.post_id) === postId;

    const parentAfterAllowed = getRecord(posts, "post_id", postId);
    const queuedAfterAllowed = getRecord(
      targets, "target_id", queuedTargetId
    );
    const publishingAfterAllowed = getRecord(
      targets, "target_id", publishingTargetId
    );

    result.parentPostCancelled =
      !!parentAfterAllowed &&
      String(parentAfterAllowed.status) === "cancelled";

    result.queuedTargetCancelled =
      !!queuedAfterAllowed &&
      String(queuedAfterAllowed.platform_status) === "cancelled";

    result.publishingTargetCancelledAfterReturningToPending =
      !!publishingAfterAllowed &&
      String(publishingAfterAllowed.platform_status) === "cancelled";

    result.retryTimesCleared =
      !!queuedAfterAllowed &&
      !!publishingAfterAllowed &&
      !String(queuedAfterAllowed.next_retry_at || "").trim() &&
      !String(publishingAfterAllowed.next_retry_at || "").trim();

  } catch (error) {
    result.error = String(error.message || error);

  } finally {
    // Best-effort cleanup: delete only this test's unique record IDs.
    const cleanupErrors = [];

    function safelyDelete(sheet, key, value) {
      try {
        const match = findRecordByValue_(sheet, key, value);
        if (match) sheet.deleteRow(match.rowNumber);
      } catch (error) {
        cleanupErrors.push(
          key + ": " + String(error.message || error)
        );
      }
    }

    safelyDelete(targets, "target_id", publishingTargetId);
    safelyDelete(targets, "target_id", queuedTargetId);
    safelyDelete(posts, "post_id", postId);
    safelyDelete(brands, "brand_id", brandId);

    result.cleanupPassed =
      !getRecord(targets, "target_id", publishingTargetId) &&
      !getRecord(targets, "target_id", queuedTargetId) &&
      !getRecord(posts, "post_id", postId) &&
      !getRecord(brands, "brand_id", brandId) &&
      cleanupErrors.length === 0;

    if (cleanupErrors.length) {
      result.cleanupError = cleanupErrors.join("; ");
    }
  }

  result.ok =
    result.workbookIsTest &&
    result.testRecordsCreated &&
    result.publishingCancellationBlocked &&
    result.parentUnchangedAfterBlockedCancellation &&
    result.targetsUnchangedAfterBlockedCancellation &&
    result.allowedCancellationSucceeded &&
    result.parentPostCancelled &&
    result.queuedTargetCancelled &&
    result.publishingTargetCancelledAfterReturningToPending &&
    result.retryTimesCleared &&
    result.cleanupPassed;

  console.log("END-TO-END CANCELLATION TEST:");
  console.log(JSON.stringify(result, null, 2));

  return result;
}

