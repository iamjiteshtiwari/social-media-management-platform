
/**
 * TEST-only media failure-injection tests.
 *
 * Tests:
 * 1. Failure to write media metadata with confirmed rollback.
 * 2. Failure to write media metadata with unconfirmed rollback.
 *
 * Uses synthetic in-memory objects. Does not open or write to real
 * spreadsheets and does not create or modify real Drive files.
 */

function testMediaFailureInjectionHarness() {
  const originalUpdate = updateSheetRowFields_;
  let injectedFailureObserved = false;
  let restored = false;

  try {
    updateSheetRowFields_ = function () {
      throw new Error("TEST_INJECTED_WRITE_FAILURE");
    };

    try {
      updateSheetRowFields_({}, 2, { status: "test" });
    } catch (error) {
      injectedFailureObserved =
        String(error && error.message || error) ===
        "TEST_INJECTED_WRITE_FAILURE";
    }
  } finally {
    updateSheetRowFields_ = originalUpdate;
    restored = updateSheetRowFields_ === originalUpdate;
  }

  const result = {
    ok: injectedFailureObserved && restored,
    injectedFailureObserved: injectedFailureObserved,
    originalHelperRestored: restored,
    spreadsheetTouched: false,
    driveTouched: false
  };

  console.log("MEDIA FAILURE INJECTION HARNESS:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error("MEDIA_FAILURE_INJECTION_HARNESS_FAILED");
  }

  return result;
}


function testMediaUploadRollbackFailureInjection() {
  const originalContext = getOperationalContextForUser_;
  const originalFolder = getMediaUploadFolder_;
  const originalGetSheet = getRequiredSheet_;
  const originalAppendRecord = appendRecord_;

  const checks = [];

  const syntheticUserId = "TEST_UPLOAD_ROLLBACK_USER";
  const syntheticFolderId = "TEST_UPLOAD_ROLLBACK_FOLDER";
  const syntheticFileId = "TEST_UPLOAD_ROLLBACK_FILE";

  let realDriveTouched = false;
  let realSpreadsheetTouched = false;
  let metadataWriteAttempts = 0;
  let helpersRestored = false;

  function runScenario(rollbackSucceeds, expectedCode) {
    let trashed = false;
    let fileCreated = false;
    let observedError = "";

    const fakeFile = {
      getId: function () {
        return syntheticFileId;
      },

      setTrashed: function (value) {
        if (!rollbackSucceeds) {
          throw new Error("TEST_INJECTED_TRASH_FAILURE");
        }

        trashed = value === true;
      },

      isTrashed: function () {
        return trashed;
      }
    };

    // Supply a synthetic account context. No real account is looked up.
    getOperationalContextForUser_ = function (userId) {
      if (userId !== syntheticUserId) {
        throw new Error("UNEXPECTED_TEST_USER");
      }

      return {
        user: {
          user_id: syntheticUserId
        },
        resource: {
          media_folder_id: syntheticFolderId,
          published_media_folder_id: "TEST_OTHER_FOLDER"
        },
        workbook: {
          testOnly: true
        }
      };
    };

    // Supply a fake folder and fake file.
    getMediaUploadFolder_ = function (folderId) {
      if (folderId !== syntheticFolderId) {
        throw new Error("UNEXPECTED_TEST_FOLDER");
      }

      return {
        createFile: function () {
          fileCreated = true;
          return fakeFile;
        }
      };
    };

    // Supply a synthetic MediaLibrary sheet.
    getRequiredSheet_ = function (workbook, sheetName) {
      if (
        !workbook ||
        workbook.testOnly !== true ||
        sheetName !== "MediaLibrary"
      ) {
        throw new Error("UNEXPECTED_TEST_SHEET");
      }

      return {
        testOnly: true
      };
    };

    // Inject metadata-write failure before any actual sheet write.
    appendRecord_ = function () {
      metadataWriteAttempts++;
      throw new Error("TEST_INJECTED_METADATA_WRITE_FAILURE");
    };

    try {
      uploadUserMedia_(syntheticUserId, {
        file_name: "rollback-test.png",
        mime_type: "image/png",
        base64_data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZQAAAABJRU5ErkJggg==",
        alt_text: "Synthetic rollback test"
      });
    } catch (error) {
      observedError = String(error && error.message || error);
    }

    const expectedTrashed = rollbackSucceeds;
    const correctError = observedError === expectedCode;
    const rollbackStateCorrect = trashed === expectedTrashed;

    return {
      expectedError: expectedCode,
      actualError: observedError,
      correctError: correctError,
      fakeFileCreated: fileCreated,
      rollbackStateCorrect: rollbackStateCorrect,
      metadataWriteAttempted: metadataWriteAttempts > 0,
      passed:
        fileCreated &&
        correctError &&
        rollbackStateCorrect &&
        metadataWriteAttempts > 0
    };
  }

  let result;

  try {
    if (
      !Object.prototype.hasOwnProperty.call(
        ALLOWED_MEDIA_MIME_TYPES,
        "image/png"
      )
    ) {
      throw new Error("TEST_PREREQUISITE_IMAGE_PNG_NOT_ALLOWED");
    }

    const pngBytes = Utilities.base64Decode(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZQAAAABJRU5ErkJggg=="
    );

    if (!isAllowedMediaSignature_(pngBytes, "image/png")) {
      throw new Error("TEST_PREREQUISITE_PNG_SIGNATURE_REJECTED");
    }

    const confirmed = runScenario(
      true,
      "MEDIA_RECORD_WRITE_FAILED"
    );

    checks.push({
      scenario: "rollback_confirmed",
      result: confirmed
    });

    const unconfirmed = runScenario(
      false,
      "MEDIA_ROLLBACK_FAILED_RECONCILIATION_REQUIRED"
    );

    checks.push({
      scenario: "rollback_unconfirmed",
      result: unconfirmed
    });
  } finally {
    // Always restore every overridden helper.
    getOperationalContextForUser_ = originalContext;
    getMediaUploadFolder_ = originalFolder;
    getRequiredSheet_ = originalGetSheet;
    appendRecord_ = originalAppendRecord;

    helpersRestored =
      getOperationalContextForUser_ === originalContext &&
      getMediaUploadFolder_ === originalFolder &&
      getRequiredSheet_ === originalGetSheet &&
      appendRecord_ === originalAppendRecord;
  }

  const allScenariosPassed =
    checks.length === 2 &&
    checks.every(function (item) {
      return item.result.passed === true;
    });

  result = {
    ok: allScenariosPassed && helpersRestored,
    scenarios: checks,
    originalHelpersRestored: helpersRestored,
    metadataWriteAttempts: metadataWriteAttempts,
    realDriveTouched: realDriveTouched,
    realSpreadsheetTouched: realSpreadsheetTouched
  };

  console.log("MEDIA UPLOAD ROLLBACK FAILURE-INJECTION TEST:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error(
      "MEDIA_UPLOAD_ROLLBACK_FAILURE_INJECTION_TEST_FAILED"
    );
  }

  return result;
}



function testMediaUploadValidationFailures() {
  const originalContext = getOperationalContextForUser_;
  const originalFolder = getMediaUploadFolder_;
  const originalGetSheet = getRequiredSheet_;
  const originalAppendRecord = appendRecord_;

  let unexpectedOperationalCalls = 0;
  let helpersRestored = false;
  const checks = [];

  const validPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZQAAAABJRU5ErkJggg==";

  function rejectUnexpectedAccess() {
    unexpectedOperationalCalls++;
    throw new Error("TEST_UNEXPECTED_OPERATIONAL_ACCESS");
  }

  const cases = [
    {
      name: "missing_filename",
      input: {
        mime_type: "image/png",
        base64_data: validPng
      },
      expected: "INVALID_MEDIA_UPLOAD"
    },
    {
      name: "unsupported_mime_type",
      input: {
        file_name: "test.bin",
        mime_type: "application/x-test-unsupported",
        base64_data: validPng
      },
      expected: "INVALID_MEDIA_UPLOAD"
    },
    {
      name: "empty_payload",
      input: {
        file_name: "test.png",
        mime_type: "image/png",
        base64_data: ""
      },
      expected: "INVALID_MEDIA_UPLOAD"
    },
    {
      name: "invalid_base64",
      input: {
        file_name: "test.png",
        mime_type: "image/png",
        base64_data: "%%%"
      },
      expected: "INVALID_MEDIA_UPLOAD"
    },
    {
      name: "wrong_file_signature",
      input: {
        file_name: "test.png",
        mime_type: "image/png",
        base64_data: "aGVsbG8="
      },
      expected: "MEDIA_CONTENT_TYPE_MISMATCH"
    }
  ];

  try {
    getOperationalContextForUser_ = rejectUnexpectedAccess;
    getMediaUploadFolder_ = rejectUnexpectedAccess;
    getRequiredSheet_ = rejectUnexpectedAccess;
    appendRecord_ = rejectUnexpectedAccess;

    cases.forEach(function (testCase) {
      let actualError = "";

      try {
        uploadUserMedia_("TEST_VALIDATION_USER", testCase.input);
      } catch (error) {
        actualError = String(error && error.message || error);
      }

      checks.push({
        scenario: testCase.name,
        expectedError: testCase.expected,
        actualError: actualError,
        passed: actualError === testCase.expected
      });
    });
  } finally {
    getOperationalContextForUser_ = originalContext;
    getMediaUploadFolder_ = originalFolder;
    getRequiredSheet_ = originalGetSheet;
    appendRecord_ = originalAppendRecord;

    helpersRestored =
      getOperationalContextForUser_ === originalContext &&
      getMediaUploadFolder_ === originalFolder &&
      getRequiredSheet_ === originalGetSheet &&
      appendRecord_ === originalAppendRecord;
  }

  const result = {
    ok:
      checks.length === cases.length &&
      checks.every(function (item) {
        return item.passed;
      }) &&
      unexpectedOperationalCalls === 0 &&
      helpersRestored,
    scenarios: checks,
    unexpectedOperationalCalls: unexpectedOperationalCalls,
    originalHelpersRestored: helpersRestored,
    realDriveTouched: false,
    realSpreadsheetTouched: false
  };

  console.log("MEDIA UPLOAD VALIDATION FAILURE TEST:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error("MEDIA_UPLOAD_VALIDATION_FAILURE_TEST_FAILED");
  }

  return result;
}



function testMediaUploadSizeLimit() {
  const originalContext = getOperationalContextForUser_;
  const originalFolder = getMediaUploadFolder_;
  const originalGetSheet = getRequiredSheet_;
  const originalAppendRecord = appendRecord_;

  let unexpectedOperationalCalls = 0;
  let helpersRestored = false;
  let actualError = "";

  function rejectUnexpectedAccess() {
    unexpectedOperationalCalls++;
    throw new Error("TEST_UNEXPECTED_OPERATIONAL_ACCESS");
  }

  try {
    getOperationalContextForUser_ = rejectUnexpectedAccess;
    getMediaUploadFolder_ = rejectUnexpectedAccess;
    getRequiredSheet_ = rejectUnexpectedAccess;
    appendRecord_ = rejectUnexpectedAccess;

    if (
      !Number.isFinite(MAX_MEDIA_UPLOAD_BYTES) ||
      MAX_MEDIA_UPLOAD_BYTES <= 0
    ) {
      throw new Error("TEST_INVALID_MAX_MEDIA_UPLOAD_BYTES");
    }

    // Create a Base64 payload that decodes to one byte over the limit.
    // This stays in memory; no Drive or spreadsheet calls are made.
    const oversizedBytes = new Array(MAX_MEDIA_UPLOAD_BYTES + 1).fill(65);
    const encoded = Utilities.base64Encode(oversizedBytes);

    try {
      uploadUserMedia_("TEST_SIZE_LIMIT_USER", {
        file_name: "oversized-test.png",
        mime_type: "image/png",
        base64_data: encoded
      });
    } catch (error) {
      actualError = String(error && error.message || error);
    }
  } finally {
    getOperationalContextForUser_ = originalContext;
    getMediaUploadFolder_ = originalFolder;
    getRequiredSheet_ = originalGetSheet;
    appendRecord_ = originalAppendRecord;

    helpersRestored =
      getOperationalContextForUser_ === originalContext &&
      getMediaUploadFolder_ === originalFolder &&
      getRequiredSheet_ === originalGetSheet &&
      appendRecord_ === originalAppendRecord;
  }

  const result = {
    ok:
      actualError === "MEDIA_SIZE_LIMIT" &&
      unexpectedOperationalCalls === 0 &&
      helpersRestored,
    expectedError: "MEDIA_SIZE_LIMIT",
    actualError: actualError,
    unexpectedOperationalCalls: unexpectedOperationalCalls,
    originalHelpersRestored: helpersRestored,
    realDriveTouched: false,
    realSpreadsheetTouched: false
  };

  console.log("MEDIA UPLOAD SIZE LIMIT TEST:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error("MEDIA_UPLOAD_SIZE_LIMIT_TEST_FAILED");
  }

  return result;
}



function testMediaUploadFolderReadiness() {
  const originalContext = getOperationalContextForUser_;
  const originalFolder = getMediaUploadFolder_;
  const originalGetSheet = getRequiredSheet_;
  const originalAppendRecord = appendRecord_;

  const syntheticUserId = "TEST_FOLDER_READINESS_USER";
  const validPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZQAAAABJRU5ErkJggg==";

  const cases = [
    {
      name: "missing_media_folder",
      mediaFolderId: "",
      publishedFolderId: "TEST_PUBLISHED_FOLDER"
    },
    {
      name: "media_folder_is_published_folder",
      mediaFolderId: "TEST_PUBLISHED_FOLDER",
      publishedFolderId: "TEST_PUBLISHED_FOLDER"
    }
  ];

  const checks = [];
  let folderLookupCalls = 0;
  let unexpectedSheetCalls = 0;
  let helpersRestored = false;

  try {
    getOperationalContextForUser_ = function (userId) {
      if (userId !== syntheticUserId) {
        throw new Error("UNEXPECTED_TEST_USER");
      }

      return {
        user: { user_id: syntheticUserId },
        resource: {
          media_folder_id: currentCase.mediaFolderId,
          published_media_folder_id: currentCase.publishedFolderId
        },
        workbook: { testOnly: true }
      };
    };

    getMediaUploadFolder_ = function () {
      folderLookupCalls++;
      throw new Error("TEST_FOLDER_LOOKUP_SHOULD_NOT_OCCUR");
    };

    getRequiredSheet_ = function () {
      unexpectedSheetCalls++;
      throw new Error("TEST_SHEET_LOOKUP_SHOULD_NOT_OCCUR");
    };

    appendRecord_ = function () {
      throw new Error("TEST_METADATA_WRITE_SHOULD_NOT_OCCUR");
    };

    var currentCase = null;

    cases.forEach(function (testCase) {
      currentCase = testCase;
      let actualError = "";

      try {
        uploadUserMedia_(syntheticUserId, {
          file_name: "folder-readiness-test.png",
          mime_type: "image/png",
          base64_data: validPng
        });
      } catch (error) {
        actualError = String(error && error.message || error);
      }

      checks.push({
        scenario: testCase.name,
        expectedError: "MEDIA_FOLDER_NOT_READY",
        actualError: actualError,
        passed: actualError === "MEDIA_FOLDER_NOT_READY"
      });
    });
  } finally {
    getOperationalContextForUser_ = originalContext;
    getMediaUploadFolder_ = originalFolder;
    getRequiredSheet_ = originalGetSheet;
    appendRecord_ = originalAppendRecord;

    helpersRestored =
      getOperationalContextForUser_ === originalContext &&
      getMediaUploadFolder_ === originalFolder &&
      getRequiredSheet_ === originalGetSheet &&
      appendRecord_ === originalAppendRecord;
  }

  const result = {
    ok:
      checks.length === cases.length &&
      checks.every(function (item) {
        return item.passed;
      }) &&
      folderLookupCalls === 0 &&
      unexpectedSheetCalls === 0 &&
      helpersRestored,
    scenarios: checks,
    folderLookupCalls: folderLookupCalls,
    unexpectedSheetCalls: unexpectedSheetCalls,
    originalHelpersRestored: helpersRestored,
    realDriveTouched: false,
    realSpreadsheetTouched: false
  };

  console.log("MEDIA UPLOAD FOLDER READINESS TEST:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error("MEDIA_UPLOAD_FOLDER_READINESS_TEST_FAILED");
  }

  return result;
}





function testMediaUploadLockUnavailable() {
  const originalUploadLock = getMediaUploadScriptLock_;
  const originalContext = getOperationalContextForUser_;
  const originalFolder = getMediaUploadFolder_;
  const originalGetSheet = getRequiredSheet_;
  const originalAppendRecord = appendRecord_;

  let tryLockCalls = 0;
  let unexpectedOperationalCalls = 0;
  let helpersRestored = false;
  let actualError = "";

  try {
    // Simulate a lock that is already held by another execution.
    getMediaUploadScriptLock_ = function () {
      return {
        tryLock: function (timeoutMs) {
          tryLockCalls++;

          if (timeoutMs !== 10000) {
            throw new Error("UNEXPECTED_LOCK_TIMEOUT");
          }

          return false;
        },
        releaseLock: function () {
          throw new Error("LOCK_SHOULD_NOT_BE_RELEASED");
        }
      };
    };

    function rejectUnexpectedAccess() {
      unexpectedOperationalCalls++;
      throw new Error("TEST_UNEXPECTED_OPERATIONAL_ACCESS");
    }

    getOperationalContextForUser_ = rejectUnexpectedAccess;
    getMediaUploadFolder_ = rejectUnexpectedAccess;
    getRequiredSheet_ = rejectUnexpectedAccess;
    appendRecord_ = rejectUnexpectedAccess;

    try {
      uploadUserMedia_("TEST_LOCK_USER", {
        file_name: "lock-test.png",
        mime_type: "image/png",
        base64_data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZQAAAABJRU5ErkJggg=="
      });
    } catch (error) {
      actualError = String(error && error.message || error);
    }
  } finally {
    getMediaUploadScriptLock_ = originalUploadLock;
    getOperationalContextForUser_ = originalContext;
    getMediaUploadFolder_ = originalFolder;
    getRequiredSheet_ = originalGetSheet;
    appendRecord_ = originalAppendRecord;

    helpersRestored =
      getMediaUploadScriptLock_ === originalUploadLock &&
      getOperationalContextForUser_ === originalContext &&
      getMediaUploadFolder_ === originalFolder &&
      getRequiredSheet_ === originalGetSheet &&
      appendRecord_ === originalAppendRecord;
  }

  const result = {
    ok:
      actualError === "TRY_AGAIN" &&
      tryLockCalls === 1 &&
      unexpectedOperationalCalls === 0 &&
      helpersRestored,
    expectedError: "TRY_AGAIN",
    actualError: actualError,
    tryLockCalls: tryLockCalls,
    unexpectedOperationalCalls: unexpectedOperationalCalls,
    originalHelpersRestored: helpersRestored,
    realDriveTouched: false,
    realSpreadsheetTouched: false
  };

  console.log("MEDIA UPLOAD LOCK UNAVAILABLE TEST:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error("MEDIA_UPLOAD_LOCK_UNAVAILABLE_TEST_FAILED");
  }

  return result;
}




function testMediaUploadReleasesLockAfterFailure() {
  const originalUploadLock = getMediaUploadScriptLock_;
  const originalContext = getOperationalContextForUser_;
  const originalFolder = getMediaUploadFolder_;
  const originalGetSheet = getRequiredSheet_;
  const originalAppendRecord = appendRecord_;

  let tryLockCalls = 0;
  let releaseLockCalls = 0;
  let unexpectedOperationalCalls = 0;
  let helpersRestored = false;
  let actualError = "";

  try {
    getMediaUploadScriptLock_ = function () {
      return {
        tryLock: function (timeoutMs) {
          tryLockCalls++;

          if (timeoutMs !== 10000) {
            throw new Error("UNEXPECTED_LOCK_TIMEOUT");
          }

          return true;
        },
        releaseLock: function () {
          releaseLockCalls++;
        }
      };
    };

    getOperationalContextForUser_ = function (userId) {
      if (userId !== "TEST_LOCK_RELEASE_USER") {
        unexpectedOperationalCalls++;
        throw new Error("UNEXPECTED_TEST_USER");
      }

      return {
        user: { user_id: userId },
        resource: {
          media_folder_id: "",
          published_media_folder_id: "TEST_PUBLISHED_FOLDER"
        },
        workbook: { testOnly: true }
      };
    };

    getMediaUploadFolder_ = function () {
      unexpectedOperationalCalls++;
      throw new Error("TEST_FOLDER_LOOKUP_SHOULD_NOT_OCCUR");
    };

    getRequiredSheet_ = function () {
      unexpectedOperationalCalls++;
      throw new Error("TEST_SHEET_LOOKUP_SHOULD_NOT_OCCUR");
    };

    appendRecord_ = function () {
      unexpectedOperationalCalls++;
      throw new Error("TEST_METADATA_WRITE_SHOULD_NOT_OCCUR");
    };

    try {
      uploadUserMedia_("TEST_LOCK_RELEASE_USER", {
        file_name: "lock-release-test.png",
        mime_type: "image/png",
        base64_data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZQAAAABJRU5ErkJggg=="
      });
    } catch (error) {
      actualError = String(error && error.message || error);
    }
  } finally {
    getMediaUploadScriptLock_ = originalUploadLock;
    getOperationalContextForUser_ = originalContext;
    getMediaUploadFolder_ = originalFolder;
    getRequiredSheet_ = originalGetSheet;
    appendRecord_ = originalAppendRecord;

    helpersRestored =
      getMediaUploadScriptLock_ === originalUploadLock &&
      getOperationalContextForUser_ === originalContext &&
      getMediaUploadFolder_ === originalFolder &&
      getRequiredSheet_ === originalGetSheet &&
      appendRecord_ === originalAppendRecord;
  }

  const result = {
    ok:
      actualError === "MEDIA_FOLDER_NOT_READY" &&
      tryLockCalls === 1 &&
      releaseLockCalls === 1 &&
      unexpectedOperationalCalls === 0 &&
      helpersRestored,
    expectedError: "MEDIA_FOLDER_NOT_READY",
    actualError: actualError,
    tryLockCalls: tryLockCalls,
    releaseLockCalls: releaseLockCalls,
    unexpectedOperationalCalls: unexpectedOperationalCalls,
    originalHelpersRestored: helpersRestored,
    realDriveTouched: false,
    realSpreadsheetTouched: false
  };

  console.log("MEDIA UPLOAD LOCK RELEASE TEST:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error("MEDIA_UPLOAD_LOCK_RELEASE_TEST_FAILED");
  }

  return result;
}



