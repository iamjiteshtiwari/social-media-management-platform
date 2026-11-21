
/**
 * Cancellation safety rule.
 * A post cannot be cancelled while any target is publishing.
 * Test-only first step: no spreadsheet writes or provider calls.
 */
function assertNoPublishingTargetsForCancellation_(targets) {
  const rows = Array.isArray(targets) ? targets : [];

  const hasPublishingTarget = rows.some(function (target) {
    return String(target.platform_status || "").trim().toLowerCase() === "publishing";
  });

  if (hasPublishingTarget) {
    throw new Error("POST_PUBLISH_IN_PROGRESS");
  }

  return true;
}

function testCancellationSafetyRule() {
  const results = [];

  function check(name, fn) {
    try {
      results.push({ name: name, passed: fn() === true });
    } catch (error) {
      results.push({ name: name, passed: false, error: String(error.message || "TEST_FAILED") });
    }
  }

  check("queued targets permit cancellation", function () {
    return assertNoPublishingTargetsForCancellation_([
      { platform_status: "pending" },
      { platform_status: "scheduled" }
    ]) === true;
  });

  check("no targets permit cancellation", function () {
    return assertNoPublishingTargetsForCancellation_([]) === true;
  });

  check("publishing target blocks cancellation", function () {
    try {
      assertNoPublishingTargetsForCancellation_([
        { platform_status: "pending" },
        { platform_status: "publishing" }
      ]);
      return false;
    } catch (error) {
      return error.message === "POST_PUBLISH_IN_PROGRESS";
    }
  });

  check("status matching is case-insensitive", function () {
    try {
      assertNoPublishingTargetsForCancellation_([
        { platform_status: "PUBLISHING" }
      ]);
      return false;
    } catch (error) {
      return error.message === "POST_PUBLISH_IN_PROGRESS";
    }
  });

  const passed = results.filter(function (result) {
    return result.passed;
  }).length;

  const summary = {
    ok: passed === results.length,
    passed: passed,
    total: results.length,
    results: results
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
