
/**
 * TEST ONLY: Verifies cleanup behavior when the MediaLibrary status write
 * fails after a fake Drive file is marked as trashed.
 *
 * Uses an existing TEST user and a synthetic MediaLibrary row.
 * Never intentionally accesses or trashes a real Drive file.
 */

function testMediaCleanupSheetWriteFailure() {
  const master = getMasterSpreadsheet_();
  const userId = "TEST_USER_3477ea53-3489-48cd-b7cd-7e703875d216";
  const resources = getRequiredSheet_(master, "UserResources");
  const resourceMatch = findRecordByValue_(resources, "user_id", userId);

  if (!resourceMatch) throw new Error("TEST_USER_RESOURCE_NOT_FOUND");

  const resource = rowToRecord_(resources, resourceMatch);

  if (
    String(resource.provisioning_status).toLowerCase() !== "ready" ||
    String(resource.spreadsheet_status).toLowerCase() !== "ready" ||
    String(resource.drive_status).toLowerCase() !== "ready" ||
    !resource.user_spreadsheet_id ||
    !resource.media_folder_id
  ) {
    throw new Error("TEST_USER_RESOURCES_NOT_READY");
  }

  const ops = SpreadsheetApp.openById(String(resource.user_spreadsheet_id));

  if (master.getId() === ops.getId()) {
    throw new Error("MASTER_AND_OPERATIONS_WORKBOOKS_MUST_DIFFER");
  }
  if (!/TEST/i.test(ops.getName())) {
    throw new Error("TEST_WORKBOOK_REQUIRED");
  }

  assertOperationalWorkbookSchema_(ops);

  const library = getRequiredSheet_(ops, "MediaLibrary");
  const rawHeaders = library.getRange(
    1, 1, 1, library.getLastColumn()
  ).getDisplayValues()[0];

  const headers = {};
  rawHeaders.forEach(function (name, index) {
    headers[String(name).trim()] = index + 1;
  });

  [
    "media_id",
    "drive_file_id",
    "uploaded_at",
    "status",
    "retention_status"
  ].forEach(function (key) {
    if (!headers[key]) throw new Error("MISSING_MEDIA_HEADER:" + key);
  });

  const original = {
    property: getPrivateProperty_,
    drive: getMediaDriveFile_,
    update: updateSheetRowFields_
  };

  const mediaId = "TEST_CLEANUP_FAILURE_" + Utilities.getUuid();
  const fakeFileId = "FAKE_FILE_" + Utilities.getUuid();
  const now = new Date().toISOString();
  const oldDate = new Date(
    Date.now() - (MEDIA_RETENTION_DAYS + 5) * 86400000
  ).toISOString();

  let rowNumber = 0;
  let fakeTrashObserved = false;
  let injectedFailureObserved = false;
  let pendingStateWrittenBeforeTrash = false;
  let cleanupErrors = [];

  let checks = {};

  try {
    getPrivateProperty_ = function (key) {
      if (key === AppConfig.PROPERTY.ENABLE_MEDIA_CLEANUP) {
        return "YES";
      }
      return original.property(key);
    };

    // All Drive operations in this test are handled by this fake.
    getMediaDriveFile_ = function (requestedFileId) {
      if (String(requestedFileId) !== fakeFileId) {
        throw new Error("BLOCKED_UNEXPECTED_DRIVE_LOOKUP");
      }

      return {
        getId: function () {
          return fakeFileId;
        },
        getName: function () {
          return "synthetic-test-media";
        },
        isTrashed: function () {
          return false;
        },
        getParents: function () {
          let used = false;
          return {
            hasNext: function () {
              return !used;
            },
            next: function () {
              if (used) throw new Error("NO_MORE_FAKE_PARENTS");
              used = true;
              return {
                getId: function () {
                  return String(resource.media_folder_id);
                }
              };
            }
          };
        },
        setTrashed: function (value) {
          if (value !== true) throw new Error("EXPECTED_TRASH_TRUE");

          const match = findRecordByValue_(library, "media_id", mediaId);
          const record = match ? rowToRecord_(library, match) : {};

          pendingStateWrittenBeforeTrash =
            !!match &&
            String(record.status || "").toLowerCase() === "trash_pending";

          fakeTrashObserved = true;
        }
      };
    };

    // MediaLibrary has no user_id column; do not write one.
    const values = new Array(library.getLastColumn()).fill("");
    values[headers.media_id - 1] = mediaId;
    values[headers.drive_file_id - 1] = fakeFileId;
    values[headers.file_name ? headers.file_name - 1 : -1] =
      headers.file_name ? "synthetic-test-media.png" : "";
    values[headers.mime_type ? headers.mime_type - 1 : -1] =
      headers.mime_type ? "image/png" : "";
    values[headers.media_type ? headers.media_type - 1 : -1] =
      headers.media_type ? "image" : "";
    values[headers.size_bytes ? headers.size_bytes - 1 : -1] =
      headers.size_bytes ? 8 : "";
    values[headers.uploaded_at - 1] = oldDate;
    values[headers.status - 1] = "available";
    values[headers.retention_status - 1] = "normal";

    if (headers.updated_at) values[headers.updated_at - 1] = now;
    if (headers.alt_text) values[headers.alt_text - 1] = "";
    if (headers.cleanup_eligible_at) {
      values[headers.cleanup_eligible_at - 1] = "";
    }
    if (headers.last_referenced_at) {
      values[headers.last_referenced_at - 1] = "";
    }

    library.appendRow(values);
    rowNumber = library.getLastRow();

    updateSheetRowFields_ = function (sheet, targetRow, fields) {
      if (
        sheet.getSheetId() === library.getSheetId() &&
        targetRow === rowNumber &&
        fields &&
        String(fields.status || "") === "trashed"
      ) {
        injectedFailureObserved = true;
        throw new Error(
          "TEST_INJECTED_MEDIA_CLEANUP_STATUS_WRITE_FAILURE"
        );
      }

      return original.update(sheet, targetRow, fields);
    };

    const preview = previewMediaCleanupForUser_(
      userId,
      MEDIA_RETENTION_DAYS
    );

    const candidateFound = preview.candidates.some(function (item) {
      return item.mediaId === mediaId &&
        item.rowNumber === rowNumber &&
        item.fileId === fakeFileId;
    });

    if (!candidateFound) {
      throw new Error("SYNTHETIC_MEDIA_NOT_FOUND_IN_PREVIEW");
    }

    const result = runMediaCleanupForUser_(userId);

    const mediaMatch = findRecordByValue_(library, "media_id", mediaId);
    const media = mediaMatch ? rowToRecord_(library, mediaMatch) : {};

    const rowRemainedPending =
      !!mediaMatch &&
      String(media.status || "").toLowerCase() === "trash_pending";

    const cleanupReportedFailure = !!result &&
      Array.isArray(result.results) &&
      result.results.some(function (item) {
        return item.mediaId === mediaId && item.result === "failed";
      });

    checks = {
      syntheticCandidateFound: candidateFound,
      pendingStateWrittenBeforeTrash: pendingStateWrittenBeforeTrash,
      fakeTrashOperationObserved: fakeTrashObserved,
      injectedFailureObserved: injectedFailureObserved,
      cleanupReportedFailure: cleanupReportedFailure,
      mediaRowRemainedPending: rowRemainedPending
    };

    const passed = Object.keys(checks).filter(function (key) {
      return checks[key] === true;
    }).length;

    Logger.log("MEDIA CLEANUP SHEET-WRITE FAILURE TEST:");
    Logger.log(JSON.stringify({
      ok: passed === Object.keys(checks).length,
      passed: passed,
      total: Object.keys(checks).length,
      checks: checks,
      confirmsPartialFailureState:
        checks.injectedFailureObserved &&
        checks.pendingStateWrittenBeforeTrash &&
        checks.fakeTrashOperationObserved &&
        checks.mediaRowRemainedPending,
      realDriveTouched: false
    }, null, 2));

    if (passed !== Object.keys(checks).length) {
      throw new Error("MEDIA_CLEANUP_FAILURE_TEST_FAILED");
    }
  } finally {
    getPrivateProperty_ = original.property;
    getMediaDriveFile_ = original.drive;
    updateSheetRowFields_ = original.update;

    if (rowNumber > 0) {
      try {
        const currentId = String(
          library.getRange(rowNumber, headers.media_id).getDisplayValue()
        );

        if (currentId === mediaId) {
          library.deleteRow(rowNumber);
        } else {
          cleanupErrors.push("SYNTHETIC_ROW_ID_MISMATCH");
        }
      } catch (error) {
        cleanupErrors.push(
          String(error && error.message || error)
        );
      }
    }

    const restoration = {
      propertyHelperRestored: getPrivateProperty_ === original.property,
      driveResolverRestored: getMediaDriveFile_ === original.drive,
      updateHelperRestored: updateSheetRowFields_ === original.update,
      cleanupPassed: cleanupErrors.length === 0,
      cleanupErrors: cleanupErrors
    };

    Logger.log("RESTORATION AND CLEANUP:");
    Logger.log(JSON.stringify(restoration, null, 2));

    if (!restoration.propertyHelperRestored ||
        !restoration.driveResolverRestored ||
        !restoration.updateHelperRestored ||
        !restoration.cleanupPassed) {
      throw new Error("TEST_RESTORATION_OR_CLEANUP_FAILED");
    }
  }
}
