/**
 * Password reset request and one-time-code password reset.
 * Shared data helpers are in SheetRepository.gs; secrets remain in Script Properties.
 */

function requestPasswordReset_(input) {
  const captcha = verifyCaptcha_(String((input && input.captchaToken) || ""), "login");
  if (!captcha.ok) return { ok: false, code: "RESET_REQUEST_ACCEPTED" };
  if (MailApp.getRemainingDailyQuota() < 1) return { ok: true, code: "RESET_REQUEST_ACCEPTED" };
  const email = normalizeEmail_(input && input.email);
  if (!email) return { ok: true, code: "RESET_REQUEST_ACCEPTED" };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: true, code: "RESET_REQUEST_ACCEPTED" };
  try {
    const master = getMasterSpreadsheet_();
    const users = getRequiredSheet_(master, "Users");
    const match = findRecordByValue_(users, "email_normalized", email);
    if (!match) return { ok: true, code: "RESET_REQUEST_ACCEPTED" };
    const user = rowToRecord_(users, match);
    if (!canAccountAuthenticate_(user)) return { ok: true, code: "RESET_REQUEST_ACCEPTED" };

    const challenges = getRequiredSheet_(master, "AuthChallenges");
    const latest = findLatestChallenge_(challenges, user.user_id, "password_reset");
    const now = Date.now();
    if (latest && !latest.consumed_at && now - new Date(latest.last_sent_at || latest.created_at).getTime() < EMAIL_OTP_RESEND_COOLDOWN_MS) {
      return { ok: true, code: "RESET_REQUEST_ACCEPTED" };
    }
    if (latest && !latest.consumed_at) consumeChallenge_(challenges, latest.rowNumber, new Date(now).toISOString());

    const otp = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16) % 1000000).padStart(6, "0");
    const challengeId = Utilities.getUuid();
    const nowIso = new Date(now).toISOString();
    appendRecord_(challenges, {
      challenge_id: challengeId,
      user_id: String(user.user_id),
      challenge_type: "password_reset",
      verifier_hash: hashOtp_(otp, challengeId, user.user_id),
      expires_at: new Date(now + EMAIL_OTP_TTL_MS).toISOString(),
      attempt_count: 0,
      max_attempts: EMAIL_OTP_MAX_ATTEMPTS,
      last_sent_at: nowIso,
      consumed_at: "",
      created_at: nowIso
    });
    try {
      MailApp.sendEmail({
        to: email,
        subject: "Password reset code",
        name: "Social Media Management Platform",
        body: "Your password reset code is: " + otp + "\n\nIt expires in 5 minutes and can be used once. If you did not request this, ignore this email."
      });
    } catch (error) {
      const failed = findLatestChallenge_(challenges, user.user_id, "password_reset");
      if (failed && !failed.consumed_at) consumeChallenge_(challenges, failed.rowNumber, new Date().toISOString());
      appendAuditEvent_({ user_id: String(user.user_id), action: "password_reset_requested", outcome: "delivery_failed", details: {} });
      return { ok: true, code: "RESET_REQUEST_ACCEPTED" };
    }
    appendAuditEvent_({ user_id: String(user.user_id), action: "password_reset_requested", outcome: "sent", details: {} });
    return { ok: true, code: "RESET_REQUEST_ACCEPTED" };
  } finally {
    lock.releaseLock();
  }
}

function resetPassword_(input) {
  const captcha = verifyCaptcha_(String((input && input.captchaToken) || ""), "login");
  if (!captcha.ok) return { ok: false, code: "INVALID_RESET" };
  const email = normalizeEmail_(input && input.email);
  const otp = String((input && input.otp) || "").trim();
  const password = String((input && input.password) || "");
  if (!email || !/^\d{6}$/.test(otp) || password.length < 12 || password.length > 128 ||
      password !== String((input && input.confirm_password) || "")) {
    return { ok: false, code: "INVALID_RESET" };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: "TRY_AGAIN" };
  try {
    const master = getMasterSpreadsheet_();
    const users = getRequiredSheet_(master, "Users");
    const match = findRecordByValue_(users, "email_normalized", email);
    if (!match) return { ok: false, code: "INVALID_RESET" };
    const user = rowToRecord_(users, match);
    if (!canAccountAuthenticate_(user)) return { ok: false, code: "INVALID_RESET" };

    const challenges = getRequiredSheet_(master, "AuthChallenges");
    const latest = findLatestChallenge_(challenges, user.user_id, "password_reset");
    if (!latest || latest.consumed_at) return { ok: false, code: "INVALID_RESET" };
    const now = Date.now();
    const attempts = Number(latest.attempt_count || 0);
    if (now >= new Date(latest.expires_at).getTime() || attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      consumeChallenge_(challenges, latest.rowNumber, new Date(now).toISOString());
      return { ok: false, code: "INVALID_RESET" };
    }
    updateSheetRowFields_(challenges, latest.rowNumber, { attempt_count: attempts + 1 });
    if (!constantTimeStringEquals_(hashOtp_(otp, latest.challenge_id, user.user_id), String(latest.verifier_hash || ""))) {
      if (attempts + 1 >= EMAIL_OTP_MAX_ATTEMPTS) consumeChallenge_(challenges, latest.rowNumber, new Date(now).toISOString());
      return { ok: false, code: "INVALID_RESET" };
    }

    const hashed = hashPassword_(password);
    const nowIso = new Date(now).toISOString();
    // Consume the one-time challenge before changing credentials. If a later
    // write fails, the user can request a fresh code rather than replay this one.
    consumeChallenge_(challenges, latest.rowNumber, nowIso);
    // Revoke sessions before updating the password. This workflow already holds
    // the script lock, so call the unlocked helper to avoid reacquiring it.
    revokeUserSessionsUnlocked_(user.user_id, "password_reset", nowIso);
    updateSheetRowFields_(users, match.rowNumber, {
      password_hash: hashed.hash,
      password_salt: hashed.salt,
      password_hash_algorithm: hashed.algorithm,
      password_hash_iterations: hashed.iterations,
      password_changed_at: nowIso,
      login_failed_count: 0,
      login_locked_until: "",
      updated_at: nowIso
    });
    // This workflow already holds the script lock; avoid reacquiring it.
    appendAuditEvent_({ user_id: String(user.user_id), action: "password_reset_completed", outcome: "success", details: {} });
    return { ok: true, code: "PASSWORD_RESET_COMPLETE" };
  } finally {
    lock.releaseLock();
  }
}
