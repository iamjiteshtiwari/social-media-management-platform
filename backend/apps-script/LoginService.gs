/**
 * Login, logout, current-session lookup and login-failure throttling.
 * Shared data helpers are in SheetRepository.gs; secrets remain in Script Properties.
 */

function loginAccount_(input) {
  const captcha = verifyCaptcha_(String((input && input.captchaToken) || ""), "login");
  if (!captcha.ok) return { ok: false, code: "INVALID_CREDENTIALS" };
  const email = normalizeEmail_(input && input.email);
  const sheet = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const match = email ? findRecordByValue_(sheet, "email_normalized", email) : null;
  if (!match) {
    verifyPassword_("dummy-password-timing-check", "dummy-salt", "not-a-real-hash", "PBKDF2-HMAC-SHA256", 120000);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  const user = rowToRecord_(sheet, match);
  const lockUntil = Date.parse(user.login_locked_until || "");
  if (Number.isFinite(lockUntil) && Date.now() < lockUntil) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  const validPassword = verifyPassword_(
    String((input && input.password) || ""),
    String(user.password_salt || ""),
    String(user.password_hash || ""),
    String(user.password_hash_algorithm || ""),
    Number(user.password_hash_iterations)
  );
  if (!validPassword) {
    recordLoginFailure_(match.rowNumber);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  if (!canAccountAuthenticate_(user)) return { ok: false, code: "INVALID_CREDENTIALS" };
  const session = createSession_(String(user.user_id));
  try {
    updateSheetRowFields_(sheet, match.rowNumber, {
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_failed_count: 0,
      login_locked_until: ""
    });
    appendAuditEvent_({ user_id: String(user.user_id), action: "login", outcome: "success", details: { session_id: session.session_id } });
  } catch (error) {
    revokeSession_(session.token, "login_finalization_failed");
    throw new Error("LOGIN_FINALIZATION_FAILED");
  }
  return {
    ok: true,
    code: "LOGIN_SUCCESS",
    user: { user_id: String(user.user_id), full_name: String(user.full_name), username: String(user.username), email: email, role: String(user.role) },
    session: session
  };
}

function logoutAccount_(sessionToken) {
  const context = validateSessionToken_(sessionToken);
  if (!context) return { ok: true, code: "LOGOUT_COMPLETE" };
  revokeSession_(String(sessionToken), "user_logout");
  return { ok: true, code: "LOGOUT_COMPLETE" };
}

function getCurrentSession_(sessionToken) {
  const context = validateSessionToken_(sessionToken);
  if (!context) return { ok: false, code: "SESSION_INVALID" };
  return {
    ok: true,
    user: { user_id: String(context.user.user_id), full_name: String(context.user.full_name), username: String(context.user.username), email: String(context.user.email_normalized), role: String(context.user.role) },
    expires_at: context.expires_at
  };
}

function recordLoginFailure_(userRowNumber) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
    const values = users.getRange(userRowNumber, 1, 1, users.getLastColumn()).getValues()[0];
    const user = rowToRecord_(users, { values: values });
    const attempts = Number(user.login_failed_count || 0) + 1;
    const now = Date.now();
    const fields = { login_failed_count: attempts, updated_at: new Date(now).toISOString() };
    if (attempts >= 5) fields.login_locked_until = new Date(now + 15 * 60 * 1000).toISOString();
    updateSheetRowFields_(users, userRowNumber, fields);
    appendAuditEvent_({ user_id: String(user.user_id), action: "login_failed", outcome: "rejected", details: { attempts: attempts, locked: attempts >= 5 } });
  } finally {
    lock.releaseLock();
  }
}
