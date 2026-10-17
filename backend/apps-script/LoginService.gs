/**
 * Login, logout, current-session lookup and login-failure throttling.
 * User identity/lifecycle data lives in Users; password credentials and lockout
 * state live in AuthRecords.
 */

function loginAccount_(input) {
  const captcha = verifyCaptcha_(String((input && input.captchaToken) || ""), "login");
  if (!captcha.ok) return { ok: false, code: "INVALID_CREDENTIALS" };

  const email = normalizeEmail_(input && input.email);
  const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const userMatch = email ? findRecordByValue_(users, "email", email) : null;
  if (!userMatch) {
    verifyPassword_("dummy-password-timing-check", "dummy-salt", "not-a-real-hash", "PBKDF2-HMAC-SHA256", 120000);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const user = rowToRecord_(users, userMatch);
  const authRecords = getRequiredSheet_(getMasterSpreadsheet_(), "AuthRecords");
  const authMatch = findRecordByValue_(authRecords, "user_id", String(user.user_id));
  if (!authMatch) {
    verifyPassword_("dummy-password-timing-check", "dummy-salt", "not-a-real-hash", "PBKDF2-HMAC-SHA256", 120000);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const auth = rowToRecord_(authRecords, authMatch);
  const lockUntil = Date.parse(auth.login_locked_until || "");
  if (Number.isFinite(lockUntil) && Date.now() < lockUntil) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const validPassword = verifyPassword_(
    String((input && input.password) || ""),
    String(auth.password_salt || ""),
    String(auth.password_hash || ""),
    String(auth.password_hash_algorithm || ""),
    Number(auth.password_hash_iterations)
  );
  if (!validPassword) {
    recordLoginFailure_(authMatch.rowNumber);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  if (!canAccountAuthenticate_(user)) return { ok: false, code: "INVALID_CREDENTIALS" };

  const session = createSession_(String(user.user_id));
  try {
    const now = new Date().toISOString();
    updateSheetRowFields_(users, userMatch.rowNumber, {
      last_login_at: now,
      updated_at: now
    });
    updateSheetRowFields_(authRecords, authMatch.rowNumber, {
      failed_login_count: 0,
      login_locked_until: "",
      updated_at: now
    });
    appendAuditEvent_({
      user_id: String(user.user_id),
      action: "login",
      outcome: "success",
      details: { method: "password" }
    });
  } catch (error) {
    revokeSession_(session.token, "login_finalization_failed");
    throw new Error("LOGIN_FINALIZATION_FAILED");
  }

  return {
    ok: true,
    code: "LOGIN_SUCCESS",
    user: {
      user_id: String(user.user_id),
      full_name: String(user.full_name),
      username: String(user.username),
      email: email,
      role: String(user.role)
    },
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
    user: {
      user_id: String(context.user.user_id),
      full_name: String(context.user.full_name),
      username: String(context.user.username),
      email: String(context.user.email),
      role: String(context.user.role)
    },
    expires_at: context.expires_at
  };
}

function recordLoginFailure_(authRowNumber) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const authRecords = getRequiredSheet_(getMasterSpreadsheet_(), "AuthRecords");
    const values = authRecords.getRange(authRowNumber, 1, 1, authRecords.getLastColumn()).getValues()[0];
    const auth = rowToRecord_(authRecords, { values: values });
    const attempts = Number(auth.failed_login_count || 0) + 1;
    const now = Date.now();
    const fields = {
      failed_login_count: attempts,
      updated_at: new Date(now).toISOString()
    };
    if (attempts >= 5) fields.login_locked_until = new Date(now + 15 * 60 * 1000).toISOString();
    updateSheetRowFields_(authRecords, authRowNumber, fields);
    appendAuditEvent_({
      user_id: String(auth.user_id),
      action: "login_failed",
      outcome: "rejected",
      details: { attempts: attempts, locked: attempts >= 5 }
    });
  } finally {
    lock.releaseLock();
  }
}
