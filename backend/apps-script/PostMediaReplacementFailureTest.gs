/**
 * TEST-only regression test for partial failure during post-media replacement.
 * Uses synthetic rows in the disposable operational TEST workbook only.
 * No Drive files, provider calls, deployments, or production workbook access.
 *
 * Expected reproduction: when the second replacement-media metadata write fails,
 * newly-added links are rolled back, but metadata already updated for the first
 * replacement item is not restored by the current service implementation.
 */
function testPostMediaReplacementMetadataRollback() {
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
  const library = getRequiredSheet_(workbook, "MediaLibrary");
  const links = getRequiredSheet_(workbook, "PostMedia");
  const suffix = Utilities.getUuid();
  const userId = "TEST_MEDIA_REPLACE_USER_" + suffix;
  const postId = "TEST_MEDIA_REPLACE_POST_" + suffix;
  const oldMediaId = "TEST_MEDIA_REPLACE_OLD_" + suffix;
  const newMediaAId = "TEST_MEDIA_REPLACE_NEW_A_" + suffix;
  const newMediaBId = "TEST_MEDIA_REPLACE_NEW_B_" + suffix;
  const oldLinkId = "TEST_MEDIA_REPLACE_LINK_OLD_" + suffix;
  const stamp = new Date().toISOString();
  const originalMetadata = {
    last_referenced_at: "TEST_ORIGINAL_REFERENCE_" + suffix,
    cleanup_eligible_at: "TEST_ORIGINAL_CLEANUP_" + suffix
  };
  const cleanupErrors = [];
  const checks = {
    injectedFailureObserved: false,
    originalLinkPreserved: false,
    replacementLinksRolledBack: false,
    firstReplacementMetadataRemainsChanged: false,
    secondReplacementMetadataUnchanged: false,
    helperRestored: false,
    resolverRestored: false
  };

  const originalResolver = getOperationalContextForUser_;
  const originalUpdate = updateSheetRowFields_;
  let injected = false;

  function appendSyntheticMedia(mediaId, driveFileId, metadata) {
    appendRecord_(library, {
      media_id: mediaId,
      drive_file_id: driveFileId,
      file_name: "synthetic-" + mediaId,
      mime_type: "image/png",
      media_type: "image",
      size_bytes: 8,
      alt_text: "",
      status: "available",
      uploaded_at: stamp,
      updated_at: stamp,
      retention_status: "normal",
      cleanup_eligible_at: metadata.cleanup_eligible_at,
      last_referenced_at: metadata.last_referenced_at
    });
  }

  try {
    appendRecord_(posts, {
      post_id: postId,
      brand_id: "TEST_BRAND_ONLY",
      caption: "Synthetic media replacement failure test",
      first_comment: "",
      content_type: "carousel",
      status: "draft",
      scheduled_at_utc: "",
      timezone: "Asia/Kolkata",
      created_at: stamp,
      updated_at: stamp,
      deleted_at: ""
    });

    appendSyntheticMedia(oldMediaId, "TEST_DRIVE_FILE_OLD_ONLY", {
      last_referenced_at: "TEST_OLD_REFERENCE_" + suffix,
      cleanup_eligible_at: ""
    });
    appendSyntheticMedia(newMediaAId, "TEST_DRIVE_FILE_NEW_A_ONLY", originalMetadata);
    appendSyntheticMedia(newMediaBId, "TEST_DRIVE_FILE_NEW_B_ONLY", originalMetadata);

    appendRecord_(links, {
      post_media_id: oldLinkId,
      post_id: postId,
      media_id: oldMediaId,
      sort_order: 1,
      created_at: stamp
    });

    getOperationalContextForUser_ = function () {
      return { user: { user_id: userId }, resource: {}, workbook: workbook };
    };

    // Let the first replacement metadata update succeed, then fail on the
    // second one. This exercises the service's real rollback branch.
    updateSheetRowFields_ = function (sheet, rowNumber, fields) {
      if (sheet.getName() === "MediaLibrary" &&
          Object.prototype.hasOwnProperty.call(fields || {}, "last_referenced_at")) {
        if (injected) {
          // Inject only once so the service's rollback write can succeed.
          injected = false;
          throw new Error("TEST_INJECTED_SECOND_MEDIA_METADATA_FAILURE");
        }
        originalUpdate(sheet, rowNumber, fields);
        injected = true;
        return;
      }
      return originalUpdate(sheet, rowNumber, fields);
    };

    try {
      replaceUserPostMedia_(userId, postId, [newMediaAId, newMediaBId]);
    } catch (error) {
      checks.injectedFailureObserved =
        String(error && error.message || "") === "TEST_INJECTED_SECOND_MEDIA_METADATA_FAILURE";
    }

    const postLinks = readSheetRecords_(links).filter(function (link) {
      return String(link.post_id || "") === postId;
    });
    checks.originalLinkPreserved = postLinks.length === 1 &&
      String(postLinks[0].post_media_id || "") === oldLinkId &&
      String(postLinks[0].media_id || "") === oldMediaId;
    checks.replacementLinksRolledBack = postLinks.every(function (link) {
      return String(link.media_id || "") !== newMediaAId &&
        String(link.media_id || "") !== newMediaBId;
    });

    const newAMatch = findRecordByValue_(library, "media_id", newMediaAId);
    const newBMatch = findRecordByValue_(library, "media_id", newMediaBId);
    const newA = newAMatch ? rowToRecord_(library, newAMatch) : {};
    const newB = newBMatch ? rowToRecord_(library, newBMatch) : {};
    checks.firstReplacementMetadataRestored =
      !!newAMatch &&
      String(newA.last_referenced_at || "") === originalMetadata.last_referenced_at &&
      String(newA.cleanup_eligible_at || "") === originalMetadata.cleanup_eligible_at;
    checks.secondReplacementMetadataUnchanged =
      !!newBMatch &&
      String(newB.last_referenced_at || "") === originalMetadata.last_referenced_at &&
      String(newB.cleanup_eligible_at || "") === originalMetadata.cleanup_eligible_at;
  } catch (error) {
    cleanupErrors.push("TEST_FAILED:" + String(error && error.message || "UNKNOWN").slice(0, 120));
  } finally {
    updateSheetRowFields_ = originalUpdate;
    getOperationalContextForUser_ = originalResolver;
    checks.helperRestored = updateSheetRowFields_ === originalUpdate;
    checks.resolverRestored = getOperationalContextForUser_ === originalResolver;

    // Remove only this test's synthetic rows; no Drive operations are performed.
    [
      { sheet: links, column: "post_media_id", id: oldLinkId },
      { sheet: library, column: "media_id", id: oldMediaId },
      { sheet: library, column: "media_id", id: newMediaAId },
      { sheet: library, column: "media_id", id: newMediaBId },
      { sheet: posts, column: "post_id", id: postId }
    ].forEach(function (item) {
      try {
        let match = findRecordByValue_(item.sheet, item.column, item.id);
        while (match) {
          item.sheet.deleteRow(match.rowNumber);
          match = findRecordByValue_(item.sheet, item.column, item.id);
        }
      } catch (error) {
        cleanupErrors.push("ROW_CLEANUP_FAILED:" + item.column);
      }
    });

    // Also remove any synthetic replacement links if rollback itself failed.
    try {
      let matches = readSheetRecords_(links).filter(function (link) {
        return String(link.post_id || "") === postId;
      });
      matches.reverse().forEach(function (link) {
        const match = findRecordByValue_(links, "post_media_id", String(link.post_media_id || ""));
        if (match) links.deleteRow(match.rowNumber);
      });
    } catch (error) {
      cleanupErrors.push("REPLACEMENT_LINK_CLEANUP_FAILED");
    }
  }

  const passed = Object.keys(checks).filter(function (key) { return checks[key]; }).length;
  const report = {
    ok: passed === Object.keys(checks).length && cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    rollbackVerified: checks.injectedFailureObserved &&
      checks.originalLinkPreserved &&
      checks.replacementLinksRolledBack &&
      checks.firstReplacementMetadataRestored &&
      checks.secondReplacementMetadataUnchanged,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };
  Logger.log("POST MEDIA REPLACEMENT METADATA ROLLBACK TEST:");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
