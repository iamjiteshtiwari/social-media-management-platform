
/**
 * Meta OAuth state lifecycle integration test.
 *
 * Run only in the isolated SMM Operations TEST Apps Script project.
 * Uses synthetic user/session identifiers.
 * No Meta API calls, external network calls, or Drive operations.
 *
 * Leaves its synthetic OAuthStates record in the TEST workbook for
 * manual cleanup. Does not delete spreadsheet rows.
 */
function testMetaOAuthStateLifecycle() {
  const TEST_ONLY_CONFIRMATION = false;

  if (TEST_ONLY_CONFIRMATION !== true) {
    throw new Error(
      "TEST_GUARD_DISABLED: Change TEST_ONLY_CONFIRMATION to true " +
      "only after verifying the TEST workbook configuration."
    );
  }

  const testUserId = "synthetic-oauth-test-user";
  const testSessionId = "synthetic-oauth-test-session";
  const results = [];
  let rawState = null;
  let storedHash = null;
  let thrownError = null;

  function assertCheck(name, condition) {
    const passed = condition === true;
    results.push({ name: name, passed: passed });
    Logger.log((passed ? "PASS" : "FAIL") + " - " + name);

    if (!passed) {
      throw new Error("ASSERTION_FAILED: " + name);
    }
  }

  try {
    // Resolve the configured master spreadsheet and check its ID.
    const configuredMasterId =
      getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);

    const approvedTestMasterId =
      getPrivateProperty_("TEST_MASTER_SPREADSHEET_ID");

    if (!approvedTestMasterId) {
      throw new Error(
        "TEST_MASTER_SPREADSHEET_ID_MISSING: Add this property in the " +
        "TEST project with the ID of the confirmed TEST master spreadsheet."
      );
    }

    assertCheck(
      "Configured master ID matches approved TEST master ID",
      configuredMasterId === approvedTestMasterId
    );

    if (configuredMasterId !== approvedTestMasterId) {
      throw new Error("TEST_WORKBOOK_ID_MISMATCH");
    }

    const workbook = SpreadsheetApp.openById(configuredMasterId);
    const sheet = getRequiredSheet_(workbook, "OAuthStates");

    assertCheck(
      "OAuthStates sheet exists in approved TEST workbook",
      !!sheet
    );

    // Create a state using synthetic user/session context.
    const created = createMetaOAuthState_(testUserId, testSessionId);
    rawState = created && created.state;

    assertCheck(
      "State creation returns a non-empty state",
      typeof rawState === "string" && rawState.length > 0
    );

    assertCheck(
      "State creation returns a valid expiry timestamp",
      !!(
        created &&
        created.expires_at &&
        Number.isFinite(Date.parse(created.expires_at))
      )
    );

    storedHash = hashMetaOAuthState_(rawState);

    const match = findRecordByValue_(
      sheet,
      "state_verifier_hash",
      storedHash
    );

    assertCheck("Created state hash exists in OAuthStates", !!match);

    if (match) {
      const storedRecord = rowToRecord_(sheet, match);

      assertCheck(
        "Raw state is not stored in the sheet",
        String(storedRecord.state_verifier_hash || "") !== rawState
      );

      assertCheck(
        "Synthetic user/session context is stored correctly",
        String(storedRecord.user_id) === testUserId &&
        String(storedRecord.session_id) === testSessionId
      );
    }

    const consumed = consumeMetaOAuthState_(rawState);

    assertCheck(
      "First consumption returns expected user/session context",
      !!consumed &&
      consumed.user_id === testUserId &&
      consumed.session_id === testSessionId
    );

    const secondConsumption = consumeMetaOAuthState_(rawState);

    assertCheck(
      "Second consumption is rejected",
      secondConsumption === null
    );

    const afterUse = findRecordByValue_(
      sheet,
      "state_verifier_hash",
      storedHash
    );

    assertCheck(
      "Consumed state is marked in the sheet",
      !!afterUse &&
      !!String(rowToRecord_(sheet, afterUse).consumed_at || "")
    );
  } catch (error) {
    thrownError = error;
  }

  const passed = results.filter(function (item) {
    return item.passed;
  }).length;

  const failed = results.length - passed;

  const summary = {
    test: "Meta OAuth State Lifecycle",
    ok: failed === 0 && !thrownError && results.length === 10,
    passed: passed,
    failed: failed,
    total: results.length,
    checks: results,
    automaticRowDeletion: false,
    metaApiCalls: 0,
    networkCalls: 0,
    driveOperations: 0
  };

  Logger.log("========== LIFECYCLE TEST SUMMARY ==========");
  Logger.log(JSON.stringify(summary, null, 2));

  if (thrownError) {
    throw new Error(
      "LIFECYCLE_TEST_FAILED: " +
      (thrownError.message || String(thrownError)) +
      ". Inspect the execution log."
    );
  }

  if (summary.ok !== true) {
    throw new Error(
      "LIFECYCLE_TEST_FAILED: " + passed + "/" +
      results.length + " checks passed."
    );
  }

  Logger.log("SUCCESS: All lifecycle checks passed.");
  return summary;
}
