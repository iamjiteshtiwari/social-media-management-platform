
/**
 * TEST ONLY: End-to-end publishing workflow using the mock provider.
 *
 * Runs preflight -> mock provider -> outcome recorder.
 * Uses only synthetic records in TEST spreadsheets.
 * No real provider calls, triggers, or public endpoints.
 */
function testPublishingEndToEndMockOnly() {
  const operationalId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID
  );
  const masterId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.MASTER_SPREADSHEET_ID
  );

  if (operationalId === masterId) {
    throw new Error("OPERATIONAL_AND_MASTER_IDS_MUST_DIFFER");
  }

  const workbook = SpreadsheetApp.openById(operationalId);
  const master = SpreadsheetApp.openById(masterId);

  if (
    !/test/i.test(workbook.getName()) ||
    !/test/i.test(master.getName())
  ) {
    throw new Error("TEST_SPREADSHEET_NAMES_REQUIRED");
  }

  assertOperationalWorkbookSchema_(workbook);

  const posts = getRequiredSheet_(workbook, "Posts");
  const targets = getRequiredSheet_(workbook, "PostTargets");
  const logs = getRequiredSheet_(workbook, "PublishingLogs");
  const connections = getRequiredSheet_(master, "SocialConnections");

  const suffix = Utilities.getUuid();
  const brandId = "TEST_E2E_BRAND_" + suffix;
  const connectionId = "TEST_E2E_CONNECTION_" + suffix;

  const scenarios = [
    {
      key: "success",
      mode: "success",
      expectedStatus: "published",
      expectedLogStatus: "success"
    },
    {
      key: "retryable",
      mode: "retryable_failure",
      expectedStatus: "pending",
      expectedLogStatus: "retry_scheduled"
    },
    {
      key: "permanent",
      mode: "permanent_failure",
      expectedStatus: "failed",
      expectedLogStatus: "failed"
    }
  ];

  scenarios.forEach(function (scenario) {
    scenario.postId = "TEST_E2E_POST_" + scenario.key + "_" + suffix;
    scenario.targetId = "TEST_E2E_TARGET_" + scenario.key + "_" + suffix;
  });

  const checks = {
    successWorkflowCompleted: false,
    retryWorkflowCompleted: false,
    permanentFailureWorkflowCompleted: false,
    successAttemptCountIncremented: false,
    retryAttemptCountIncremented: false,
    permanentAttemptCountIncremented: false,
    retryTimeScheduled: false,
    publishingLogsVerified: false,
    noProviderSecretsReturned: false
  };

  const cleanupErrors = [];

  function readTarget(targetId) {
    const match = findRecordByValue_(
      targets, "target_id", targetId
    );
    if (!match) throw new Error("TEST_TARGET_NOT_FOUND");
    return rowToRecord_(targets, match);
  }

  function readPublishingLog(targetId) {
    const match = findRecordByValue_(
      logs, "target_id", targetId
    );
    if (!match) throw new Error("TEST_PUBLISHING_LOG_NOT_FOUND");
    return rowToRecord_(logs, match);
  }

  try {
    const nowIso = new Date().toISOString();

    appendRecord_(connections, {
      social_connection_id: connectionId,
      user_id: "TEST_E2E_USER_" + suffix,
      brand_id: brandId,
      platform: "test",
      platform_account_id: "TEST_E2E_ACCOUNT_" + suffix,
      account_display_name: "Synthetic E2E connection",
      connection_status: "connected",
      granted_scopes: "",
      connected_at: nowIso,
      updated_at: nowIso,
      token_reference: "TEST_REFERENCE_ONLY",
      token_expires_at: "",
      last_validated_at: nowIso,
      last_error_code: "",
      disconnected_at: ""
    });

    scenarios.forEach(function (scenario) {
      appendRecord_(posts, {
        post_id: scenario.postId,
        brand_id: brandId,
        caption: "Synthetic end-to-end test: " + scenario.key,
        first_comment: "",
        content_type: "text",
        status: "scheduled",
        scheduled_at_utc: nowIso,
        timezone: "UTC",
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: ""
      });

      appendRecord_(targets, {
        target_id: scenario.targetId,
        post_id: scenario.postId,
        social_connection_id: connectionId,
        platform_status: "publishing",
        scheduled_at_utc: nowIso,
        published_at_utc: "",
        platform_post_id: "",
        attempt_count: 0,
        next_retry_at: "",
        last_error_code: "",
        updated_at: nowIso
      });
    });

    scenarios.forEach(function (scenario) {
      // 1. Validate the synthetic target and connection.
      const context = preparePublishingAttempt_(
        workbook, scenario.targetId
      );

      if (context.ok !== true) {
        throw new Error("PREFLIGHT_FAILED_" + scenario.key);
      }

      // 2. Simulate the provider response. This function makes no API calls.
      const providerResult = mockPublishAttempt_(
        context, scenario.mode
      );

      if (
        Object.prototype.hasOwnProperty.call(providerResult, "access_token") ||
        Object.prototype.hasOwnProperty.call(providerResult, "refresh_token") ||
        Object.prototype.hasOwnProperty.call(providerResult, "token")
      ) {
        throw new Error("MOCK_PROVIDER_RETURNED_SECRET");
      }

      checks.noProviderSecretsReturned = true;

      // 3. Record the simulated outcome using the existing service.
      const outcome = recordPublishingOutcome_(
        workbook,
        scenario.targetId,
        providerResult,
        new Date().toISOString()
      );

      const savedTarget = readTarget(scenario.targetId);
      const savedLog = readPublishingLog(scenario.targetId);

      const correctWorkflow =
        outcome.ok === true &&
        outcome.platform_status === scenario.expectedStatus &&
        savedTarget.platform_status === scenario.expectedStatus &&
        savedLog.result_status === scenario.expectedLogStatus;

      if (scenario.key === "success") {
        checks.successWorkflowCompleted = correctWorkflow;
        checks.successAttemptCountIncremented =
          Number(savedTarget.attempt_count) === 1 &&
          outcome.attempt_count === 1 &&
          Boolean(savedTarget.platform_post_id) &&
          Boolean(savedTarget.published_at_utc) &&
          !savedTarget.next_retry_at;
      }

      if (scenario.key === "retryable") {
        checks.retryWorkflowCompleted = correctWorkflow;
        checks.retryAttemptCountIncremented =
          Number(savedTarget.attempt_count) === 1 &&
          outcome.attempt_count === 1 &&
          savedTarget.last_error_code === "MOCK_TEMPORARY_FAILURE";

        checks.retryTimeScheduled =
          Boolean(savedTarget.next_retry_at) &&
          Date.parse(savedTarget.next_retry_at) > Date.now() &&
          outcome.next_retry_at === savedTarget.next_retry_at;
      }

      if (scenario.key === "permanent") {
        checks.permanentFailureWorkflowCompleted = correctWorkflow;
        checks.permanentAttemptCountIncremented =
          Number(savedTarget.attempt_count) === 1 &&
          outcome.attempt_count === 1 &&
          savedTarget.last_error_code === "MOCK_PERMANENT_FAILURE" &&
          !savedTarget.next_retry_at;
      }
    });

    checks.publishingLogsVerified = scenarios.every(function (scenario) {
      const match = findRecordByValue_(
        logs, "target_id", scenario.targetId
      );
      if (!match) return false;

      const log = rowToRecord_(logs, match);
      return (
        log.target_id === scenario.targetId &&
        log.post_id === scenario.postId &&
        log.result_status === scenario.expectedLogStatus
      );
    });

  } catch (error) {
    cleanupErrors.push(
      "TEST_FAILED:" +
      String(error && error.message || "UNKNOWN").slice(0, 160)
    );
  } finally {
    // Remove only records created by this test.
    scenarios.forEach(function (scenario) {
      try {
        let match = findRecordByValue_(
          logs, "target_id", scenario.targetId
        );
        while (match) {
          logs.deleteRow(match.rowNumber);
          match = findRecordByValue_(
            logs, "target_id", scenario.targetId
          );
        }
      } catch (error) {
        cleanupErrors.push("CLEANUP_FAILED:PublishingLogs");
      }
    });

    scenarios.forEach(function (scenario) {
      [
        { sheet: targets, column: "target_id", value: scenario.targetId },
        { sheet: posts, column: "post_id", value: scenario.postId }
      ].forEach(function (item) {
        try {
          let match = findRecordByValue_(
            item.sheet, item.column, item.value
          );
          while (match) {
            item.sheet.deleteRow(match.rowNumber);
            match = findRecordByValue_(
              item.sheet, item.column, item.value
            );
          }
        } catch (error) {
          cleanupErrors.push("CLEANUP_FAILED:" + item.column);
        }
      });
    });

    try {
      let match = findRecordByValue_(
        connections, "social_connection_id", connectionId
      );
      while (match) {
        connections.deleteRow(match.rowNumber);
        match = findRecordByValue_(
          connections, "social_connection_id", connectionId
        );
      }
    } catch (error) {
      cleanupErrors.push("CLEANUP_FAILED:SocialConnections");
    }
  }

  const passed = Object.keys(checks).filter(function (key) {
    return checks[key];
  }).length;

  const report = {
    ok:
      passed === Object.keys(checks).length &&
      cleanupErrors.length === 0,
    passed: passed,
    total: Object.keys(checks).length,
    checks: checks,
    cleanupPassed: cleanupErrors.length === 0,
    cleanupErrors: cleanupErrors,
    note: "TEST only. Mock provider; no external publishing calls."
  };

  console.log("PUBLISHING_END_TO_END_TEST_RESULT");
  console.log(JSON.stringify(report, null, 2));
  return report;
}
