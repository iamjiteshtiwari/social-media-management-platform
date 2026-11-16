/**
 * TEST-only regression test for Drive trash failure during user media deletion.
 *
 * Uses a synthetic MediaLibrary row and an in-memory fake Drive file.
 * It never resolves or modifies a real Drive file.
 *
 * Run only against the isolated Operational TEST workbook.
 */
function testMediaDeleteDriveTrashFailure() {
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
  const userId = "TEST_MEDIA_DELETE_DRIVE_FAILURE_USER_" + suffix;
  const mediaId = "TEST_MEDIA_DELETE_DRIVE_FAILURE_MEDIA_" + suffix;
  const fakeFileId = "TEST_FAKE_DRIVE_FAILURE_FILE_" + suffix;
  const folderId = "TEST_FAKE_DRIVE_FAILURE_FOLDER_" + suffix;
  const stamp = new Date().toISOString();
  const cleanupErrors = [];

  const checks = {
    injectedDriveFailureObserved: false,
    fakeTrashAttemptObserved: false,
    mediaRowRemainedAvailable: false,
    retentionStateUnchanged: false,
    auditNotWritten: false,
    contextResolverRestored: false,
    driveResolverRestored: false,
    auditHelperRestored: false
  };

  let trashAttempted = false;
  let auditCalls = 0;
  const fakeFile = {
    setTrashed: function (value) {
      trashAttempted = value === true;
      throw new Error("TEST_INJECTED_DRIVE_TRASH_FAILURE");
    },
    getParents: function () {
      let returned = false;
      return {
        hasNext: function () { return !returned; },
        next: function () {
          if (returned) throw new Error("NO_MORE_PARENTS");
          returned = true;
          return { getId: function () { return folderId; } };
        }
      };
    }
  };

  const originalContext = getOperationalContextForUser_;
  const originalDrive = getMediaDriveFile_;
  const originalAudit = appendAuditEvent_;

  try {
    if (readSheetRecords_(links).some(function (row) {
      return String(row.media_id || "") === mediaId;
    })) {
      throw new Error("UNEXPECTED_SYNTHETIC_MEDIA_LINK");
    }

    appendRecord_(library, {
      media_id: mediaId,
      drive_file_id: fakeFileId,
      file_name: "synthetic-drive-trash-failure.png",
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
      if (String(requestedId) !== fakeFileId) {
        throw new Error("UNEXPECTED_FAKE_FILE_ID");
      }
      return fakeFile;
    };

    appendAuditEvent_ = function () {
      auditCalls++;
    };

    try {
      deleteUserMedia_(userId, mediaId);
    } catch (error) {
      checks.injectedDriveFailureObserved =
        String(error && error.message || "") ===
        "TEST_INJECTED_DRIVE_TRASH_FAILURE";
    }

    checks.fakeTrashAttemptObserved = trashAttempted === true;

    const match = findRecordByValue_(library, "media_id", mediaId);
    const media = match ? rowToRecord_(library, match) : {};
    checks.mediaRowRemainedAvailable =
      !!match && String(media.status || "").toLowerCase() === "available";
    checks.retentionStateUnchanged =
      !!match && String(media.retention_status || "").toLowerCase() === "normal";
    checks.auditNotWritten = auditCalls === 0;
  } catch (error) {
    cleanupErrors.push(
      "TEST_FAILED:" +
      String(error && error.message || "UNKNOWN").slice(0, 140)
    );
  } finally {
    getOperationalContextForUser_ = originalContext;
    getMediaDriveFile_ = originalDrive;
    appendAuditEvent_ = originalAudit;

    checks.contextResolverRestored =
      getOperationalContextForUser_ === originalContext;
    checks.driveResolverRestored = getMediaDriveFile_ === originalDrive;
    checks.auditHelperRestored = appendAuditEvent_ === originalAudit;

    // Delete only the synthetic TEST row. The fake Drive file exists in memory.
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
    return checks[key] === true;
  }).length;

  const report = {
    ok: passed === Object.keys(checks).length && cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    confirmsDriveFailureDoesNotFinalizeRecord:
      checks.injectedDriveFailureObserved &&
      checks.fakeTrashAttemptObserved &&
      checks.mediaRowRemainedAvailable &&
      checks.retentionStateUnchanged &&
      checks.auditNotWritten,
    realDriveTouched: false,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };

  Logger.log("MEDIA DELETE DRIVE-TRASH FAILURE TEST:");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
