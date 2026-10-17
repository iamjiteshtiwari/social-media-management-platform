/**
 * Account registration, email verification and OTP resend workflows.
 * Shared data helpers are in SheetRepository.gs; secrets remain in Script Properties.
 */

function registerAccount_(input) {
  const data = normalizeRegistrationInput_(input);
  const captcha = verifyCaptcha_(String(input.captchaToken || ""), "registration");
  if (!captcha.ok) return { ok: false, code: captcha.code };
  if (MailApp.getRemainingDailyQuota() < 1) return { ok: false, code: "VERIFICATION_EMAIL_UNAVAILABLE" };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: "TRY_AGAIN" };

  try {
    const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
    const existingEmailMatch = findRecordByValue_(users, "email", data.email);
    if (existingEmailMatch) {
      const existingUser = rowToRecord_(users, existingEmailMatch);
      const authSheet = getRequiredSheet_(getMasterSpreadsheet_(), "AuthRecords");
      const authMatch = findRecordByValue_(authSheet, "user_id", String(existingUser.user_id || ""));
      if (isIncompletePendingRegistration_(existingUser, Boolean(authMatch))) {
        // Never attach a new password to an existing account without proving
        // mailbox ownership. Record the anomaly for owner-reviewed repair.
        try {
          appendAuditEvent_({
            user_id: String(existingUser.user_id),
            action: "registration_recovery_required",
            outcome: "manual_recovery_required",
            details: { reason: "MISSING_AUTH_RECORD" }
          });
        } catch (auditError) {
          console.error("REGISTRATION_RECOVERY_AUDIT_FAILED");
        }
      }
      // Keep a generic response to prevent account enumeration; never mutate
      // password or identity fields for an existing email address.
      return { ok: true, code: "REGISTRATION_ACCEPTED", nextStep: "check_email" };
    }
    if (findRecordByValue_(users, "username", data.username)) {
      return { ok: false, code: "ACCOUNT_DETAILS_UNAVAILABLE" };
    }

    const password = hashPassword_(data.password);
    const now = new Date().toISOString();
    const userId = Utilities.getUuid();

    appendRecord_(users, {
      user_id: userId,
      full_name: data.fullName,
      username: data.username,
      email: data.email,
      phone: data.phone,
      role: "member",
      account_status: ACCOUNT_STATUS.PENDING_EMAIL,
      registration_status: "pending",
      email_verified: false,
      email_verified_at: "",
      approved_at: "",
      status_reason: "",
      suspended_at: "",
      disabled_at: "",
      deleted_at: "",
      created_at: now,
      updated_at: now,
      last_login_at: ""
    });

    appendRecord_(getRequiredSheet_(getMasterSpreadsheet_(), "AuthRecords"), {
      auth_record_id: Utilities.getUuid(),
      user_id: userId,
      auth_method: "password",
      password_hash: password.hash,
      password_salt: password.salt,
      password_hash_algorithm: password.algorithm,
      password_hash_iterations: password.iterations,
      password_changed_at: now,
      failed_login_count: 0,
      login_locked_until: "",
      created_at: now,
      updated_at: now
    });

    try {
      issueEmailVerificationOtp_(userId, data.email, data.fullName);
    } catch (error) {
      const challengeSheet = getRequiredSheet_(getMasterSpreadsheet_(), "AuthChallenges");
      const failedChallenge = findLatestChallenge_(challengeSheet, userId, "email_verification");
      if (failedChallenge && !failedChallenge.consumed_at) {
        consumeChallenge_(challengeSheet, failedChallenge.rowNumber, new Date().toISOString());
      }
      updateUserFieldsById_(userId, {
        account_status: ACCOUNT_STATUS.PENDING_EMAIL,
        status_reason: "Verification email delivery failed; resend is available",
        updated_at: new Date().toISOString()
      });
      appendAuditEvent_({
        user_id: userId,
        action: "registration_email_delivery",
        outcome: "failed",
        details: { reason: "MAIL_DELIVERY_FAILED" }
      });
      return { ok: false, code: "VERIFICATION_EMAIL_UNAVAILABLE" };
    }

    appendAuditEvent_({
      user_id: userId,
      action: "account_registration",
      outcome: "pending_email",
      details: { method: "password_email_otp" }
    });

    return {
      ok: true,
      code: "VERIFICATION_REQUIRED",
      nextStep: "verify_email"
    };
  } finally {
    lock.releaseLock();
  }
}

function verifyRegistrationEmailOtp_(input) {
  const email = normalizeEmail_(input && input.email);
  const otp = String((input && input.otp) || "").trim();
  if (!email || !/^\d{6}$/.test(otp)) return { ok: false, code: "INVALID_VERIFICATION" };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: "TRY_AGAIN" };

  try {
    const master = getMasterSpreadsheet_();
    const usersSheet = getRequiredSheet_(master, "Users");
    const match = findRecordByValue_(usersSheet, "email", email);
    if (!match) return { ok: false, code: "INVALID_VERIFICATION" };

    const user = rowToRecord_(usersSheet, match);
    if (user.account_status !== ACCOUNT_STATUS.PENDING_EMAIL) {
      return { ok: false, code: "INVALID_VERIFICATION" };
    }

    const authRecords = getRequiredSheet_(master, "AuthRecords");
    const authMatch = findRecordByValue_(authRecords, "user_id", String(user.user_id || ""));
    if (isIncompletePendingRegistration_(user, Boolean(authMatch))) {
      auditIncompletePendingRegistration_(user);
      return { ok: false, code: "INVALID_VERIFICATION" };
    }

    const challenges = getRequiredSheet_(master, "AuthChallenges");
    const latest = findLatestChallenge_(challenges, user.user_id, "email_verification");
    if (!latest || latest.consumed_at) return { ok: false, code: "INVALID_VERIFICATION" };

    const nowMs = Date.now();
    if (new Date(latest.expires_at).getTime() <= nowMs ||
        Number(latest.attempt_count) >= Number(latest.max_attempts)) {
      consumeChallenge_(challenges, latest.rowNumber, new Date(nowMs).toISOString());
      return { ok: false, code: "INVALID_VERIFICATION" };
    }

    const nextAttemptCount = Number(latest.attempt_count || 0) + 1;
    updateSheetRowFields_(challenges, latest.rowNumber, {
      attempt_count: nextAttemptCount
    });

    const expected = hashOtp_(otp, latest.challenge_id, user.user_id);
    if (!constantTimeStringEquals_(expected, String(latest.verifier_hash || ""))) {
      if (nextAttemptCount >= EMAIL_OTP_MAX_ATTEMPTS) {
        consumeChallenge_(challenges, latest.rowNumber, new Date(nowMs).toISOString());
      }
      appendAuditEvent_({
        user_id: user.user_id,
        action: "email_otp_verification",
        outcome: "failed",
        details: { reason: "INVALID_CODE", attempt: nextAttemptCount }
      });
      return { ok: false, code: "INVALID_VERIFICATION" };
    }

    const now = new Date(nowMs).toISOString();
    consumeChallenge_(challenges, latest.rowNumber, now);
    updateUserFieldsById_(user.user_id, {
      email_verified: true,
      email_verified_at: now,
      account_status: ACCOUNT_STATUS.PENDING_APPROVAL,
      updated_at: now
    });
    appendAuditEvent_({
      user_id: user.user_id,
      action: "email_otp_verification",
      outcome: "verified",
      details: { next_status: ACCOUNT_STATUS.PENDING_APPROVAL }
    });

    return { ok: true, code: "EMAIL_VERIFIED", nextStep: "await_approval" };
  } finally {
    lock.releaseLock();
  }
}

function resendRegistrationEmailOtp_(input) {
  const email = normalizeEmail_(input && input.email);
  const captcha = verifyCaptcha_(String((input && input.captchaToken) || ""), "registration");
  if (!captcha.ok) return { ok: false, code: captcha.code };
  if (MailApp.getRemainingDailyQuota() < 1) return { ok: false, code: "VERIFICATION_EMAIL_UNAVAILABLE" };
  if (!email) return { ok: true, code: "VERIFICATION_SENT" };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: "TRY_AGAIN" };

  try {
    const master = getMasterSpreadsheet_();
    const usersSheet = getRequiredSheet_(master, "Users");
    const match = findRecordByValue_(usersSheet, "email", email);
    if (!match) return { ok: true, code: "VERIFICATION_SENT" };

    const user = rowToRecord_(usersSheet, match);
    if (user.account_status !== ACCOUNT_STATUS.PENDING_EMAIL) {
      return { ok: true, code: "VERIFICATION_SENT" };
    }

    const authRecords = getRequiredSheet_(master, "AuthRecords");
    const authMatch = findRecordByValue_(authRecords, "user_id", String(user.user_id || ""));
    if (isIncompletePendingRegistration_(user, Boolean(authMatch))) {
      auditIncompletePendingRegistration_(user);
      return { ok: true, code: "VERIFICATION_SENT" };
    }

    const challenges = getRequiredSheet_(master, "AuthChallenges");
    const latest = findLatestChallenge_(challenges, user.user_id, "email_verification");
    const nowMs = Date.now();
    if (latest && !latest.consumed_at &&
        nowMs - new Date(latest.last_sent_at || latest.created_at).getTime() < EMAIL_OTP_RESEND_COOLDOWN_MS) {
      return { ok: false, code: "RESEND_COOLDOWN" };
    }

    try {
      issueEmailVerificationOtp_(user.user_id, email, user.full_name);
    } catch (error) {
      appendAuditEvent_({ user_id: user.user_id, action: "email_otp_resend", outcome: "failed", details: { reason: "MAIL_DELIVERY_FAILED" } });
      return { ok: false, code: "VERIFICATION_EMAIL_UNAVAILABLE" };
    }
    appendAuditEvent_({
      user_id: user.user_id,
      action: "email_otp_resend",
      outcome: "sent",
      details: { latest_challenge_only: true }
    });
    return { ok: true, code: "VERIFICATION_SENT" };
  } finally {
    lock.releaseLock();
  }
}

function normalizeRegistrationInput_(input) {
  const value = input || {};
  const fullName = String(value.full_name || "").trim().replace(/\s+/g, " ");
  const username = String(value.username || "").trim().toLowerCase();
  const email = normalizeEmail_(value.email);
  const phone = String(value.phone || "").trim().replace(/[\s()-]/g, "");
  const password = String(value.password || "");

  if (fullName.length < 2 || fullName.length > 100) throw new Error("INVALID_REGISTRATION");
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error("INVALID_REGISTRATION");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("INVALID_REGISTRATION");
  }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) throw new Error("INVALID_REGISTRATION");
  if (password.length < 12 || password.length > 128) throw new Error("INVALID_REGISTRATION");

  return { fullName: fullName, username: username, email: email, phone: phone, password: password };
}


/** Pure detector for a pending account whose credential record is missing. */
function isIncompletePendingRegistration_(user, hasAuthRecord) {
  if (!user || typeof user !== "object") return false;
  const userId = String(user.user_id || "").trim();
  const status = String(user.account_status || "");
  const verified = user.email_verified === true || String(user.email_verified).toLowerCase() === "true";
  return Boolean(userId) && status === ACCOUNT_STATUS.PENDING_EMAIL && !verified && !hasAuthRecord;
}

function auditIncompletePendingRegistration_(user) {
  try {
    appendAuditEvent_({
      user_id: String(user && user.user_id || ""),
      action: "registration_recovery_required",
      outcome: "manual_recovery_required",
      details: { reason: "MISSING_AUTH_RECORD" }
    });
  } catch (error) {
    console.error("REGISTRATION_RECOVERY_AUDIT_FAILED");
  }
}
