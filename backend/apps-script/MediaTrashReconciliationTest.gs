
function testReconcilePendingMediaTrash() {
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
  const userId = "TEST_MEDIA_RECONCILE_USER_" + suffix;
  const folderId = "TEST_MEDIA_RECONCILE_FOLDER_" + suffix;
  const stamp = new Date().toISOString();
  const cleanupErrors = [];

  const cases = [
    {
      mediaId: "TEST_MEDIA_RECONCILE_TRASHED_" + suffix,
      fileId: "TEST_FAKE_TRASHED_FILE_" + suffix,
      isTrashed: true
    },
    {
      mediaId: "TEST_MEDIA_RECONCILE_NOT_TRASHED_" + suffix,
      fileId: "TEST_FAKE_NOT_TRASHED_FILE_" + suffix,
      isTrashed: false
    }
  ];

  const checks = {
    alreadyTrashedRecordFinalized: false,
    notTrashedRecordRemainedPending: false,
    noTrashOperationAttempted: false,
    driveResolverRestored: false,
    contextResolverRestored: false,
    auditHelperRestored: false
  };

  const originalContext = getOperationalContextForUser_;
  const originalDrive = getMediaDriveFile_;
  const originalAudit = appendAuditEvent_;

  const fakeFiles = {};
  let trashCalls = 0;

  cases.forEach(function (item) {
    fakeFiles[item.fileId] = {
      isTrashed: function () {
        return item.isTrashed;
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
      },
      setTrashed: function () {
        trashCalls++;
        throw new Error("UNEXPECTED_TRASH_OPERATION");
      }
    };
  });

  try {
    if (readSheetRecords_(links).some(function (row) {
      return cases.some(function (item) {
        return String(row.media_id || "") === item.mediaId;
      });
    })) {
      throw new Error("UNEXPECTED_SYNTHETIC_MEDIA_LINK");
    }

    cases.forEach(function (item) {
      appendRecord_(library, {
        media_id: item.mediaId,
        drive_file_id: item.fileId,
        file_name: "synthetic-reconcile-test.png",
        mime_type: "image/png",
        media_type: "image",
        size_bytes: 8,
        alt_text: "",
        status: "trash_pending",
        uploaded_at: stamp,
        updated_at: stamp,
        retention_status: "normal",
        cleanup_eligible_at: "",
        last_referenced_at: ""
      });
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

    getMediaDriveFile_ = function (fileId) {
      const file = fakeFiles[String(fileId)];
      if (!file) throw new Error("BLOCKED_UNEXPECTED_DRIVE_LOOKUP");
      return file;
    };

    appendAuditEvent_ = function () {
      // Keep audit writes isolated from the real audit destination.
    };

    // Case 1: Drive confirms the file is already trashed.
    const first = reconcilePendingMediaTrash_(userId, cases[0].mediaId);
    const firstMatch = findRecordByValue_(library, "media_id", cases[0].mediaId);
    const firstRecord = firstMatch ? rowToRecord_(library, firstMatch) : {};

    checks.alreadyTrashedRecordFinalized =
      first.ok === true &&
      String(firstRecord.status || "").toLowerCase() === "trashed" &&
      String(firstRecord.retention_status || "").toLowerCase() === "cleaned";

    // Case 2: Drive does not confirm Trash state.
    let expectedError = false;
    try {
      reconcilePendingMediaTrash_(userId, cases[1].mediaId);
    } catch (error) {
      expectedError =
        String(error && error.message || "") ===
        "MEDIA_TRASH_STATE_UNCONFIRMED";
    }

    const secondMatch = findRecordByValue_(library, "media_id", cases[1].mediaId);
    const secondRecord = secondMatch ? rowToRecord_(library, secondMatch) : {};

    checks.notTrashedRecordRemainedPending =
      expectedError &&
      !!secondMatch &&
      String(secondRecord.status || "").toLowerCase() === "trash_pending";

    checks.noTrashOperationAttempted = trashCalls === 0;
  } finally {
    getOperationalContextForUser_ = originalContext;
    getMediaDriveFile_ = originalDrive;
    appendAuditEvent_ = originalAudit;

    checks.contextResolverRestored =
      getOperationalContextForUser_ === originalContext;
    checks.driveResolverRestored = getMediaDriveFile_ === originalDrive;
    checks.auditHelperRestored = appendAuditEvent_ === originalAudit;

    cases.forEach(function (item) {
      try {
        let match = findRecordByValue_(library, "media_id", item.mediaId);
        while (match) {
          library.deleteRow(match.rowNumber);
          match = findRecordByValue_(library, "media_id", item.mediaId);
        }
      } catch (error) {
        cleanupErrors.push(
          String(error && error.message || error)
        );
      }
    });
  }

  const passed = Object.keys(checks).filter(function (key) {
    return checks[key] === true;
  }).length;

  const report = {
    ok: passed === Object.keys(checks).length &&
      cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    realDriveTouched: false,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors
  };

  Logger.log("PENDING MEDIA TRASH RECONCILIATION TEST:");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
