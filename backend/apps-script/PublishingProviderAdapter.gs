
/**
 * Mock publishing provider for isolated TEST workflows.
 *
 * No external API calls, credentials, spreadsheet writes,
 * triggers, or public routes.
 */

function mockPublishAttempt_(attemptContext, scenario) {
  if (!attemptContext || attemptContext.ok !== true) {
    throw new Error("INVALID_PUBLISHING_ATTEMPT_CONTEXT");
  }

  if (
    !String(attemptContext.target_id || "").trim() ||
    !String(attemptContext.post_id || "").trim() ||
    !String(attemptContext.social_connection_id || "").trim()
  ) {
    throw new Error("INCOMPLETE_PUBLISHING_ATTEMPT_CONTEXT");
  }

  const mode = String(scenario || "").trim().toLowerCase();

  if (mode === "success") {
    return {
      success: true,
      retryable: false,
      platform_post_id: "MOCK_POST_" + attemptContext.target_id,
      error_code: ""
    };
  }

  if (mode === "retryable_failure") {
    return {
      success: false,
      retryable: true,
      platform_post_id: "",
      error_code: "MOCK_TEMPORARY_FAILURE"
    };
  }

  if (mode === "permanent_failure") {
    return {
      success: false,
      retryable: false,
      platform_post_id: "",
      error_code: "MOCK_PERMANENT_FAILURE"
    };
  }

  throw new Error("UNSUPPORTED_MOCK_PROVIDER_SCENARIO");
}

/**
 * Pure test: does not access or modify any spreadsheet.
 */
function testMockPublishingProvider() {
  const context = {
    ok: true,
    target_id: "TEST_TARGET_ONLY",
    post_id: "TEST_POST_ONLY",
    social_connection_id: "TEST_CONNECTION_ONLY",
    caption: "Synthetic test",
    content_type: "text",
    attempt_count: 0
  };

  const checks = {
    successScenario: false,
    retryableFailureScenario: false,
    permanentFailureScenario: false,
    invalidContextRejected: false,
    unsupportedScenarioRejected: false,
    noCredentialsReturned: false
  };

  const success = mockPublishAttempt_(context, "success");
  const retry = mockPublishAttempt_(context, "retryable_failure");
  const failure = mockPublishAttempt_(context, "permanent_failure");

  checks.successScenario =
    success.success === true &&
    success.platform_post_id === "MOCK_POST_TEST_TARGET_ONLY";

  checks.retryableFailureScenario =
    retry.success === false &&
    retry.retryable === true &&
    retry.error_code === "MOCK_TEMPORARY_FAILURE";

  checks.permanentFailureScenario =
    failure.success === false &&
    failure.retryable === false &&
    failure.error_code === "MOCK_PERMANENT_FAILURE";

  try {
    mockPublishAttempt_(null, "success");
  } catch (error) {
    checks.invalidContextRejected =
      String(error && error.message || "") ===
      "INVALID_PUBLISHING_ATTEMPT_CONTEXT";
  }

  try {
    mockPublishAttempt_(context, "real_publish");
  } catch (error) {
    checks.unsupportedScenarioRejected =
      String(error && error.message || "") ===
      "UNSUPPORTED_MOCK_PROVIDER_SCENARIO";
  }

  checks.noCredentialsReturned =
    !Object.prototype.hasOwnProperty.call(success, "access_token") &&
    !Object.prototype.hasOwnProperty.call(success, "refresh_token") &&
    !Object.prototype.hasOwnProperty.call(success, "token");

  const passed = Object.keys(checks).filter(function (key) {
    return checks[key];
  }).length;

  const report = {
    ok: passed === Object.keys(checks).length,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    note: "Mock only. No external provider or spreadsheet was accessed."
  };

  console.log("MOCK_PUBLISHING_PROVIDER_TEST_RESULT");
  console.log(JSON.stringify(report, null, 2));

  return report;
}
