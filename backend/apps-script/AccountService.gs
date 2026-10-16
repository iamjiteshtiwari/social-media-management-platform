/**
 * Account registration and email-verification workflow.
 *
 * These functions are server-side modules only. Do not expose them through the
 * public API until session transport and cross-origin behavior are resolved.
 * All public-facing errors should be mapped to generic API messages.
 */
const ACCOUNT_STATUS = Object.freeze({
  PENDING_EMAIL: "pending_email",
  PENDING_APPROVAL: "pending_approval",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DISABLED: "disabled",
  DELETION_PENDING: "deletion_pending",
  DELETED: "deleted"
});

const EMAIL_OTP_TTL_MS = 5 * 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 5;
const EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function registerAccount_(input) {
  const data = normalizeRegistrationInput_(input);
  const captcha = verifyCaptcha_(String(input.captchaToken || ""), "registration");
  if (!captcha.ok) return { ok: false, code: captcha.code };
  if (MailApp.getRemainingDailyQuota() < 1) return { ok: false, code: "VERIFICATION_EMAIL_UNAVAILABLE" };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: "TRY_AGAIN" };

  try {
    const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
    if (findRecordByValue_(users, "email_normalized", data.email)) {
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
      auth_provider: "password",
      auth_subject: "",
      full_name: data.fullName,
      username: data.username,
      email_normalized: data.email,
      phone: data.phone,
      password_hash: password.hash,
      password_salt: password.salt,
      password_hash_algorithm: password.algorithm,
      password_hash_iterations: password.iterations,
      password_changed_at: now,
      role: "member",
      status: ACCOUNT_STATUS.PENDING_EMAIL,
      status_reason: "",
      email_verified_at: "",
      approved_at: "",
      suspended_at: "",
      disabled_at: "",
      deleted_at: "",
      created_at: now,
      updated_at: now,
      last_login_at: ""
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
        status: ACCOUNT_STATUS.PENDING_EMAIL,
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
    const match = findRecordByValue_(usersSheet, "email_normalized", email);
    if (!match) return { ok: false, code: "INVALID_VERIFICATION" };

    const user = rowToRecord_(usersSheet, match);
    if (user.status !== ACCOUNT_STATUS.PENDING_EMAIL) {
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
      email_verified_at: now,
      status: ACCOUNT_STATUS.PENDING_APPROVAL,
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
    const match = findRecordByValue_(usersSheet, "email_normalized", email);
    if (!match) return { ok: true, code: "VERIFICATION_SENT" };

    const user = rowToRecord_(usersSheet, match);
    if (user.status !== ACCOUNT_STATUS.PENDING_EMAIL) {
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

function issueEmailVerificationOtp_(userId, email, fullName) {
  const master = getMasterSpreadsheet_();
  const challenges = getRequiredSheet_(master, "AuthChallenges");
  const previous = findLatestChallenge_(challenges, userId, "email_verification");
  const now = new Date();
  const nowIso = now.toISOString();

  if (previous && !previous.consumed_at) {
    consumeChallenge_(challenges, previous.rowNumber, nowIso);
  }

  // UUID digits provide a non-sequential code; the code is never persisted.
  const otp = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16) % 1000000).padStart(6, "0");

  appendRecord_(challenges, {
    challenge_id: Utilities.getUuid(),
    user_id: userId,
    challenge_type: "email_verification",
    verifier_hash: hashOtp_(otp),
    expires_at: new Date(now.getTime() + EMAIL_OTP_TTL_MS).toISOString(),
    attempt_count: 0,
    max_attempts: EMAIL_OTP_MAX_ATTEMPTS,
    last_sent_at: nowIso,
    consumed_at: "",
    created_at: nowIso
  });

  try {
    MailApp.sendEmail({
      to: email,
      subject: "Verify your Social Media Management Platform account",
      name: "Social Media Management Platform",
      body: "Hello " + String(fullName || "there") + ",\n\n" +
        "Your email verification code is: " + otp + "\n\n" +
        "This code expires in 5 minutes and can be used once. If you did not request this, ignore this email.\n\n" +
        "Social Media Management Platform"
    });
  } catch (error) {
    const failed = findLatestChallenge_(challenges, userId, "email_verification");
    if (failed && !failed.consumed_at) consumeChallenge_(challenges, failed.rowNumber, new Date().toISOString());
    throw new Error("VERIFICATION_EMAIL_UNAVAILABLE");
  }
}

function hashOtp_(otp, challengeId, userId) {
  const secret = getRequiredPrivateProperty_(AppConfig.PROPERTY.OTP_HMAC_SECRET);
  const message = String(challengeId || "") + "|" + String(userId || "") + "|" + String(otp);
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(message, secret));
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

function normalizeEmail_(email) {
  const value = String(email || "").trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function findLatestChallenge_(sheet, userId, challengeType) {
  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let found = null;
  rows.forEach(function (values, index) {
    const record = {};
    Object.keys(map).forEach(function (key) { record[key] = values[map[key]]; });
    if (String(record.user_id) === String(userId) &&
        String(record.challenge_type) === String(challengeType)) {
      found = Object.assign({ rowNumber: index + 2 }, record);
    }
  });
  return found;
}

function rowToRecord_(sheet, match) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const record = {};
  headers.forEach(function (header, index) {
    record[String(header).trim()] = match.values[index];
  });
  return record;
}

function updateUserFieldsById_(userId, fields) {
  const sheet = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const match = findRecordByValue_(sheet, "user_id", userId);
  if (!match) throw new Error("USER_NOT_FOUND");
  updateSheetRowFields_(sheet, match.rowNumber, fields);
}

function updateSheetRowFields_(sheet, rowNumber, fields) {
  const headerMap = getHeaderMap_(sheet);
  Object.keys(fields).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(headerMap, key)) {
      throw new Error("SHEET_FIELD_NOT_FOUND:" + key);
    }
    sheet.getRange(rowNumber, headerMap[key] + 1).setValue(fields[key]);
  });
}

function consumeChallenge_(sheet, rowNumber, consumedAt) {
  updateSheetRowFields_(sheet, rowNumber, { consumed_at: consumedAt });
}

function canAccountAuthenticate_(user) {
  return Boolean(user) && String(user.status) === ACCOUNT_STATUS.ACTIVE &&
    Boolean(user.email_verified_at) && Boolean(user.approved_at) &&
    !user.disabled_at && !user.suspended_at && !user.deleted_at;
}

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
  const validPassword = verifyPassword_(
    String((input && input.password) || ""),
    String(user.password_salt || ""),
    String(user.password_hash || ""),
    String(user.password_hash_algorithm || ""),
    Number(user.password_hash_iterations)
  );
  if (!validPassword || !canAccountAuthenticate_(user)) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  const session = createSession_(String(user.user_id));
  updateSheetRowFields_(sheet, match.rowNumber, { last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  appendAuditEvent_({ user_id: String(user.user_id), action: "login", outcome: "success", details: { session_id: session.session_id } });
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
