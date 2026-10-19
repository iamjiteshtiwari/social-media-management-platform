/**
 * TEST-only regression test for a failure while removing old post-media links.
 * Uses synthetic rows in the disposable operational TEST workbook only.
 * No Drive file operations, provider calls, deployments, or production access.
 *
 * The test intercepts the TEST workbook's PostMedia.deleteRow method and throws
 * on the second deletion of an old link, after replacement links have been saved.
 */
function testPostMediaReplacementOldLinkRemovalFailure() {
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
  const userId = "TEST_MEDIA_OLD_LINK_FAILURE_USER_" + suffix;
  const postId = "TEST_MEDIA_OLD_LINK_FAILURE_POST_" + suffix;
  const oldMediaAId = "TEST_MEDIA_OLD_A_" + suffix;
  const oldMediaBId = "TEST_MEDIA_OLD_B_" + suffix;
  const newMediaId = "TEST_MEDIA_NEW_" + suffix;
  const oldLinkAId = "TEST_MEDIA_OLD_LINK_A_" + suffix;
  const oldLinkBId = "TEST_MEDIA_OLD_LINK_B_" + suffix;
  const stamp = new Date().toISOString();
  const cleanupErrors = [];
  const checks = {
    injectedFailureObserved: false,
    originalLinksRestored: false,
    replacementLinkRolledBack: false,
    resolverRestored: false,
    failureInjectorRestored: false
  };

  const originalResolver = getOperationalContextForUser_;
  const originalFindRecordByValue = findRecordByValue_;
  let oldDeleteAttempts = 0;
  let failureInjected = false;

  function appendSyntheticMedia(mediaId, marker) {
    appendRecord_(library, {
      media_id: mediaId,
      drive_file_id: "TEST_DRIVE_FILE_ONLY_" + marker,
      file_name: "synthetic-" + marker + ".png",
      mime_type: "image/png",
      media_type: "image",
      size_bytes: 8,
      alt_text: "",
      status: "available",
      uploaded_at: stamp,
      updated_at: stamp,
      retention_status: "normal",
      cleanup_eligible_at: "",
      last_referenced_at: ""
    });
  }

  try {
    appendRecord_(posts, {
      post_id: postId,
      brand_id: "TEST_BRAND_ONLY",
      caption: "Synthetic old-link removal failure test",
      first_comment: "",
      content_type: "carousel",
      status: "draft",
      scheduled_at_utc: "",
      timezone: "Asia/Kolkata",
      created_at: stamp,
      updated_at: stamp,
      deleted_at: ""
    });

    appendSyntheticMedia(oldMediaAId, "OLD_A_" + suffix);
    appendSyntheticMedia(oldMediaBId, "OLD_B_" + suffix);
    appendSyntheticMedia(newMediaId, "NEW_" + suffix);

    appendRecord_(links, {
      post_media_id: oldLinkAId,
      post_id: postId,
      media_id: oldMediaAId,
      sort_order: 1,
      created_at: stamp
    });
    appendRecord_(links, {
      post_media_id: oldLinkBId,
      post_id: postId,
      media_id: oldMediaBId,
      sort_order: 2,
      created_at: stamp
    });

    getOperationalContextForUser_ = function () {
      return { user: { user_id: userId }, resource: {}, workbook: workbook };
    };

    // Inject a one-time lookup failure for the second old link. The first
    // old link has already been deleted and the replacement link is persisted.
    // This avoids monkey-patching Apps Script Sheet methods, which are host APIs.
    findRecordByValue_ = function (sheet, columnName, expectedValue) {
      if (sheet.getSheetId() === links.getSheetId() &&
          columnName === "post_media_id" &&
          String(expectedValue) === oldLinkBId &&
          !failureInjected) {
        oldDeleteAttempts++;
        failureInjected = true;
        throw new Error("TEST_INJECTED_OLD_LINK_DELETE_FAILURE");
      }
      if (sheet.getSheetId() === links.getSheetId() &&
          columnName === "post_media_id" &&
          String(expectedValue) === oldLinkAId) {
        oldDeleteAttempts++;
      }
      return originalFindRecordByValue(sheet, columnName, expectedValue);
    };

    try {
      replaceUserPostMedia_(userId, postId, [newMediaId]);
    } catch (error) {
      checks.injectedFailureObserved =
        String(error && error.message || "") === "TEST_INJECTED_OLD_LINK_DELETE_FAILURE";
    }

    const postLinks = readSheetRecords_(links).filter(function (link) {
      return String(link.post_id || "") === postId;
    });
    const oldLinkIds = postLinks.map(function (link) {
      return String(link.post_media_id || "");
    });
    checks.originalLinksRestored =
      postLinks.length === 2 &&
      oldLinkIds.indexOf(oldLinkAId) >= 0 &&
      oldLinkIds.indexOf(oldLinkBId) >= 0;
    checks.replacementLinkRolledBack = !postLinks.some(function (link) {
      return String(link.media_id || "") === newMediaId;
    });
  } catch (error) {
    cleanupErrors.push("TEST_FAILED:" + String(error && error.message || "UNKNOWN").slice(0, 120));
  } finally {
    findRecordByValue_ = originalFindRecordByValue;
    getOperationalContextForUser_ = originalResolver;
    checks.failureInjectorRestored = findRecordByValue_ === originalFindRecordByValue;
    checks.resolverRestored = getOperationalContextForUser_ === originalResolver;

    // Delete only synthetic spreadsheet rows; no Drive operations.
    [
      { sheet: links, column: "post_media_id", ids: [oldLinkAId, oldLinkBId] },
      { sheet: library, column: "media_id", ids: [oldMediaAId, oldMediaBId, newMediaId] },
      { sheet: posts, column: "post_id", ids: [postId] }
    ].forEach(function (group) {
      group.ids.forEach(function (id) {
        try {
          let match = findRecordByValue_(group.sheet, group.column, id);
          while (match) {
            group.sheet.deleteRow(match.rowNumber);
            match = findRecordByValue_(group.sheet, group.column, id);
          }
        } catch (error) {
          cleanupErrors.push("ROW_CLEANUP_FAILED:" + group.column);
        }
      });
    });

    try {
      const remainingTestLinks = readSheetRecords_(links).filter(function (link) {
        return String(link.post_id || "") === postId;
      });
      remainingTestLinks.forEach(function (link) {
        const match = originalFindRecordByValue(links, "post_media_id", String(link.post_media_id || ""));
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
      checks.originalLinksRestored &&
      checks.replacementLinkRolledBack,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };
  Logger.log("POST MEDIA OLD-LINK REMOVAL FAILURE TEST:");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


/**
 * Removes only synthetic rows left by an earlier failed run of this test.
 * Safe for the TEST workbook: matches this test's unique ID prefixes and
 * the exact synthetic caption. Never accesses Drive.
 */
function cleanupFailedPostMediaOldLinkFailureTestArtifacts() {
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
  const posts = getRequiredSheet_(workbook, "Posts");
  const library = getRequiredSheet_(workbook, "MediaLibrary");
  const links = getRequiredSheet_(workbook, "PostMedia");
  const removed = { links: 0, media: 0, posts: 0 };
  const failures = [];

  [
    { sheet: links, key: "post_media_id", prefixes: ["TEST_MEDIA_OLD_LINK_A_", "TEST_MEDIA_OLD_LINK_B_"], countKey: "links" },
    { sheet: library, key: "media_id", prefixes: ["TEST_MEDIA_OLD_A_", "TEST_MEDIA_OLD_B_", "TEST_MEDIA_NEW_"], countKey: "media" },
    { sheet: posts, key: "post_id", prefixes: ["TEST_MEDIA_OLD_LINK_FAILURE_POST_"], countKey: "posts" }
  ].forEach(function (item) {
    try {
      const rows = readSheetRecords_(item.sheet);
      const matches = [];
      rows.forEach(function (record, index) {
        const value = String(record[item.key] || "");
        if (item.prefixes.some(function (prefix) { return value.indexOf(prefix) === 0; })) {
          matches.push(index + 2);
        }
      });
      matches.reverse().forEach(function (rowNumber) {
        item.sheet.deleteRow(rowNumber);
        removed[item.countKey]++;
      });
    } catch (error) {
      failures.push("CLEANUP_FAILED:" + item.countKey);
    }
  });

  const report = {
    ok: failures.length === 0,
    removed: removed,
    failures: failures,
    driveTouched: false
  };
  Logger.log("STALE OLD-LINK TEST ARTIFACT CLEANUP:");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
