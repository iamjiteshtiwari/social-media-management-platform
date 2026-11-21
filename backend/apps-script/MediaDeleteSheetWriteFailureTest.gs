
/**
 * TEST-only regression test for Drive-trash success followed by MediaLibrary
 * status-write failure. Uses a fake Drive file and synthetic TEST workbook row.
 * It does not create, trash, or modify any real Drive file.
 *
 * Requires getMediaDriveFile_ test seam in MediaService.gs.
 */

function testMediaDeleteSheetWriteFailure() {
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

  const library = getRequiredSheet_(workbook, "MediaLibrary");
  const links = getRequiredSheet_(workbook, "PostMedia");
  const suffix = Utilities.getUuid();
  const userId = "TEST_MEDIA_DELETE_WRITE_FAILURE_USER_" + suffix;
  const mediaId = "TEST_MEDIA_DELETE_WRITE_FAILURE_MEDIA_" + suffix;
  const fakeDriveFileId = "TEST_FAKE_DRIVE_FILE_" + suffix;
  const folderId = "TEST_FAKE_MEDIA_FOLDER_" + suffix;
  const stamp = new Date().toISOString();
  const cleanupErrors = [];

  const checks = {
    injectedFailureObserved: false,
    pendingStateWrittenBeforeDriveTrash: false,
    fakeTrashOperationObserved: false,
    mediaRowRemainedPending: false,
    driveResolverRestored: false,
    updateHelperRestored: false,
    contextResolverRestored: false
  };

  let fakeTrashed = false;
  let pendingWasWrittenBeforeTrash = false;

  const fakeFile = {
    setTrashed: function (value) {
      if (value === true) {
        pendingWasWrittenBeforeTrash = pendingWasWrittenBeforeTrash &&
          (function () {
            const match = findRecordByValue_(library, "media_id", mediaId);
            if (!match) return false;
            const record = rowToRecord_(library, match);
            return String(record.status || "").toLowerCase() ===
              "trash_pending";
          })();
      }

      fakeTrashed = value === true;
    },

    getParents: function () {
      let returned = false;

      return {
        hasNext: function () {
          return !returned;
        },
        next: function () {
          if (returned) throw new Error("NO_MORE_PARENTS");
          returned = true;

          return {
            getId: function () {
              return folderId;
            }
          };
        }
      };
    }
  };

  const originalContextResolver = getOperationalContextForUser_;
  const originalDriveResolver = getMediaDriveFile_;
  const originalUpdate = updateSheetRowFields_;

  try {
    if (readSheetRecords_(links).some(function (row) {
      return String(row.media_id || "") === mediaId;
    })) {
      throw new Error("UNEXPECTED_SYNTHETIC_MEDIA_LINK");
    }

    appendRecord_(library, {
      media_id: mediaId,
      drive_file_id: fakeDriveFileId,
      file_name: "synthetic-media-delete-write-failure.png",
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

    getOperationalContextForUser_ = function () {
      return {
        user: { user_id: userId },
        resource: {
          media_folder_id: folderId,
          published_media_folder_id: "TEST_PUBLISHED_FOLDER_ONLY"
        },
        workbook: workbook
      };
    };

    getMediaDriveFile_ = function (requestedId) {
      if (String(requestedId) !== fakeDriveFileId) {
        throw new Error("UNEXPECTED_FAKE_FILE_ID");
      }
      return fakeFile;
    };

    updateSheetRowFields_ = function (sheet, rowNumber, fields) {
      if (
        sheet.getSheetId() === library.getSheetId() &&
        String(fields && fields.status || "") === "trash_pending"
      ) {
        const result = originalUpdate(sheet, rowNumber, fields);

        const match = findRecordByValue_(library, "media_id", mediaId);
        const record = match ? rowToRecord_(library, match) : {};

        pendingWasWrittenBeforeTrash =
          !!match &&
          String(record.status || "").toLowerCase() === "trash_pending";

        checks.pendingStateWrittenBeforeDriveTrash =
          pendingWasWrittenBeforeTrash;

        return result;
      }

      if (
        sheet.getSheetId() === library.getSheetId() &&
        String(fields && fields.status || "") === "trashed"
      ) {
        throw new Error(
          "TEST_INJECTED_MEDIA_LIBRARY_STATUS_WRITE_FAILURE"
        );
      }

      return originalUpdate(sheet, rowNumber, fields);
    };

    try {
      deleteUserMedia_(userId, mediaId);
    } catch (error) {
      checks.injectedFailureObserved =
        String(error && error.message || "") ===
        "TEST_INJECTED_MEDIA_LIBRARY_STATUS_WRITE_FAILURE";
    }

    checks.fakeTrashOperationObserved = fakeTrashed === true;

    const mediaMatch = findRecordByValue_(library, "media_id", mediaId);
    const media = mediaMatch ? rowToRecord_(library, mediaMatch) : {};

    checks.mediaRowRemainedPending =
      !!mediaMatch &&
      String(media.status || "").toLowerCase() === "trash_pending";
  } catch (error) {
    cleanupErrors.push(
      "TEST_FAILED:" +
      String(error && error.message || "UNKNOWN").slice(0, 140)
    );
  } finally {
    updateSheetRowFields_ = originalUpdate;
    getMediaDriveFile_ = originalDriveResolver;
    getOperationalContextForUser_ = originalContextResolver;

    checks.updateHelperRestored =
      updateSheetRowFields_ === originalUpdate;
    checks.driveResolverRestored =
      getMediaDriveFile_ === originalDriveResolver;
    checks.contextResolverRestored =
      getOperationalContextForUser_ === originalContextResolver;

    try {
      let match = findRecordByValue_(library, "media_id", mediaId);

      while (match) {
        library.deleteRow(match.rowNumber);
        match = findRecordByValue_(library, "media_id", mediaId);
      }
    } catch (error) {
      cleanupErrors.push("SYNTHETIC_MEDIA_ROW_CLEANUP_FAILED");
    }
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
    confirmsPartialFailureState:
      checks.injectedFailureObserved &&
      checks.pendingStateWrittenBeforeDriveTrash &&
      checks.fakeTrashOperationObserved &&
      checks.mediaRowRemainedPending,
    realDriveTouched: false,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };

  Logger.log("MEDIA DELETE SHEET-WRITE FAILURE TEST:");
  Logger.log(JSON.stringify(report, null, 2));

  return report;
}

