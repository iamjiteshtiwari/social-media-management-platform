
/**
 * Synthetic-only tests for Meta OAuth state rules.
 *
 * Tests the existing isUsableMetaOAuthStateRecord_() validation helper.
 *
 * Safety:
 * - No Sheets access
 * - No Drive access
 * - No Script Properties access
 * - No network calls
 * - No Meta API calls
 * - Uses synthetic records only
 *
 * Expected result: 9/9 checks passed.
 */
function testMetaOAuthStateValidation() {
  const testName = "Meta OAuth State Validation";
  const now = Date.parse("2026-10-22T12:00:00.000Z");

  const base = {
    provider: "meta",
    user_id: "user-test-001",
    session_id: "session-test-001",
    state_verifier_hash: "synthetic-hash-only",
    created_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(
      now + META_OAUTH_STATE_TTL_MS - 1000
    ).toISOString(),
    consumed_at: "",
    failure_reason: ""
  };

  const checks = [
    {
      name: "Valid state record accepted",
      run: function () {
        return isUsableMetaOAuthStateRecord_(base, now) === true;
      }
    },
    {
      name: "Consumed state rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            consumed_at: new Date(now - 100).toISOString()
          }),
          now
        ) === false;
      }
    },
    {
      name: "Expired state rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            expires_at: new Date(now).toISOString()
          }),
          now
        ) === false;
      }
    },
    {
      name: "Wrong provider rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            provider: "other"
          }),
          now
        ) === false;
      }
    },
    {
      name: "Missing user context rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            user_id: ""
          }),
          now
        ) === false;
      }
    },
    {
      name: "Missing session context rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            session_id: ""
          }),
          now
        ) === false;
      }
    },
    {
      name: "Excessive lifetime rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            expires_at: new Date(
              now + META_OAUTH_STATE_TTL_MS + 1000
            ).toISOString()
          }),
          now
        ) === false;
      }
    },
    {
      name: "Future-created state rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            created_at: new Date(now + 1000).toISOString()
          }),
          now
        ) === false;
      }
    },
    {
      name: "Malformed timestamps rejected",
      run: function () {
        return isUsableMetaOAuthStateRecord_(
          Object.assign({}, base, {
            expires_at: "not-a-date"
          }),
          now
        ) === false;
      }
    }
  ];

  const results = [];
  let unexpectedErrors = 0;

  Logger.log("========== " + testName + " ==========");
  Logger.log("Mode: synthetic validation only");
  Logger.log("Total checks: " + checks.length);

  checks.forEach(function (check, index) {
    let passed = false;
    let errorMessage = "";

    try {
      passed = check.run() === true;
    } catch (error) {
      unexpectedErrors++;
      errorMessage = error && error.message
        ? error.message
        : String(error);
    }

    const result = {
      number: index + 1,
      name: check.name,
      passed: passed
    };

    if (errorMessage) {
      result.error = errorMessage;
    }

    results.push(result);

    Logger.log(
      (passed ? "PASS" : "FAIL") +
      " " + (index + 1) + "/" + checks.length +
      " - " + check.name +
      (errorMessage ? " | Error: " + errorMessage : "")
    );
  });

  const passedCount = results.filter(function (result) {
    return result.passed;
  }).length;

  const failedCount = results.length - passedCount;

  const summary = {
    test: testName,
    ok: failedCount === 0,
    passed: passedCount,
    failed: failedCount,
    total: checks.length,
    checks: results,
    realSheetsTouched: false,
    realDriveTouched: false,
    scriptPropertiesTouched: false,
    networkCalls: 0,
    metaApiCalls: 0
  };

  Logger.log("========== SUMMARY ==========");
  Logger.log(JSON.stringify(summary, null, 2));

  if (failedCount > 0) {
    throw new Error(
      testName + " FAILED: " +
      passedCount + "/" + checks.length +
      " passed; " + failedCount + " failed. " +
      "See execution logs for details."
    );
  }

  Logger.log(
    "SUCCESS: All " + checks.length +
    " validation checks passed."
  );

  return summary;
}
