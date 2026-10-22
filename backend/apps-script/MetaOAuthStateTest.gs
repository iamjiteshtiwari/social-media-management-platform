/**
 * Synthetic-only tests for Meta OAuth state rules.
 * No Sheets, Drive, Script Properties, network calls, or Meta API calls.
 */
function testMetaOAuthStateValidation() {
  const now = Date.parse("2026-10-22T12:00:00.000Z");
  const base = {
    provider: "meta",
    user_id: "user-test-001",
    session_id: "session-test-001",
    state_verifier_hash: "synthetic-hash-only",
    created_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + META_OAUTH_STATE_TTL_MS - 1000).toISOString(),
    consumed_at: "",
    failure_reason: ""
  };
  const checks = [
    ["valid state record accepted", isUsableMetaOAuthStateRecord_(base, now) === true],
    ["consumed state rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      consumed_at: new Date(now - 100).toISOString()
    }), now) === false],
    ["expired state rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      expires_at: new Date(now).toISOString()
    }), now) === false],
    ["wrong provider rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      provider: "other"
    }), now) === false],
    ["missing user context rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      user_id: ""
    }), now) === false],
    ["missing session context rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      session_id: ""
    }), now) === false],
    ["excessive lifetime rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      expires_at: new Date(now + META_OAUTH_STATE_TTL_MS + 1000).toISOString()
    }), now) === false],
    ["future-created state rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      created_at: new Date(now + 1000).toISOString()
    }), now) === false],
    ["malformed timestamps rejected", isUsableMetaOAuthStateRecord_(Object.assign({}, base, {
      expires_at: "not-a-date"
    }), now) === false]
  ];
  const failed = checks.filter(function (check) { return check[1] !== true; });
  return {
    ok: failed.length === 0,
    passed: checks.length - failed.length,
    total: checks.length,
    checks: checks.map(function (check) {
      return { name: check[0], passed: check[1] === true };
    }),
    realSheetsTouched: false,
    realDriveTouched: false,
    networkCalls: 0
  };
}
