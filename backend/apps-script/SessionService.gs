/**
 * Server-side fixed-expiry sessions.
 *
 * Raw credentials are returned only to the trusted caller and are never stored
 * or logged. The public API must not expose these functions until a secure
 * browser credential transport has been reviewed and enabled.
 */
const SESSION_ABSOLUTE_LIFETIME_MS = 9 * 60 * 60 * 1000;

/**
 * Creates a new session and invalidates previous sessions for this user.
 * The fixed expiry is calculated once and is never extended by activity.
 */
function createSession_(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) throw new Error("SESSION_USER_REQUIRED");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    // Use the unlocked helper because this function already holds the script lock.
    revokeUserSessionsUnlocked_(normalizedUserId, "replaced_by_new_login");

    const sessionId = Utilities.getUuid();
    const nowMs = Date.now();
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + SESSION_ABSOLUTE_LIFETIME_MS).toISOString();
    const nonce = [
      normalizedUserId,
      Utilities.getUuid(),
      Utilities.getUuid(),
      String(nowMs)
    ].join("|");

    const tokenSecret = getRequiredPrivateProperty_(
      AppConfig.PROPERTY.SESSION_TOKEN_GENERATION_SECRET
    );
    const token = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(nonce, tokenSecret)
    );
    const verifierSecret = getRequiredPrivateProperty_(
      AppConfig.PROPERTY.SESSION_HMAC_SECRET
    );

    appendRecord_(getRequiredSheet_(getMasterSpreadsheet_(), "Sessions"), {
      session_id: sessionId,
      user_id: normalizedUserId,
      credential_verifier: hmacBase64_(verifierSecret, sessionId + "|" + token),
      issued_at: issuedAt,
      expires_at: expiresAt,
      revoked_at: "",
      revoke_reason: "",
      created_at: issuedAt
    });

    return {
      token: token,
      session_id: sessionId,
      issued_at: issuedAt,
      expires_at: expiresAt
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Returns a session context only when the credential, expiry, revocation,
 * user record and account lifecycle status are all valid.
 */
function validateSession_(token) {
  if (
    typeof token !== "string" ||
    token.length < 40 ||
    token.length > 60 ||
    !/^[A-Za-z0-9_\-=]+$/.test(token)
  ) {
    return null;
  }

  const sessions = getRequiredSheet_(getMasterSpreadsheet_(), "Sessions");
  const lastRow = sessions.getLastRow();
  if (lastRow < 2) return null;

  const rows = sessions.getRange(
    2, 1, lastRow - 1, sessions.getLastColumn()
  ).getValues();
  const verifierSecret = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.SESSION_HMAC_SECRET
  );
  const nowMs = Date.now();

  // Newest records are checked first, which is useful for the one-active-session rule.
  for (let index = rows.length - 1; index >= 0; index--) {
    const record = rowToRecord_(sessions, { values: rows[index] });
    if (record.revoked_at || !record.session_id) continue;

    const expiryMs = Date.parse(String(record.expires_at || ""));
    if (!Number.isFinite(expiryMs) || nowMs >= expiryMs) continue;

    const expected = String(record.credential_verifier || "");
    const actual = hmacBase64_(
      verifierSecret,
      String(record.session_id) + "|" + token
    );
    if (!constantTimeStringEquals_(actual, expected)) continue;

    const user = getUserById_(String(record.user_id || ""));
    if (!canAccountAuthenticate_(user)) return null;

    const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
    const userMatch = findRecordByValue_(
      users, "user_id", String(record.user_id || "")
    );
    if (!userMatch) return null;

    return {
      session_id: String(record.session_id),
      user: user,
      userRowNumber: userMatch.rowNumber,
      expires_at: String(record.expires_at)
    };
  }

  return null;
}

/** Revokes the session matching the supplied raw credential. */
function revokeSession_(token, reason) {
  if (typeof token !== "string" || !token) return false;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sessions = getRequiredSheet_(getMasterSpreadsheet_(), "Sessions");
    const lastRow = sessions.getLastRow();
    if (lastRow < 2) return false;

    const rows = sessions.getRange(
      2, 1, lastRow - 1, sessions.getLastColumn()
    ).getValues();
    const verifierSecret = getRequiredPrivateProperty_(
      AppConfig.PROPERTY.SESSION_HMAC_SECRET
    );

    for (let index = rows.length - 1; index >= 0; index--) {
      const record = rowToRecord_(sessions, { values: rows[index] });
      if (record.revoked_at || !record.session_id) continue;

      const expected = String(record.credential_verifier || "");
      const actual = hmacBase64_(
        verifierSecret,
        String(record.session_id) + "|" + token
      );
      if (!constantTimeStringEquals_(actual, expected)) continue;

      const now = new Date().toISOString();
      const safeReason = String(reason || "logout").slice(0, 80);
      updateSheetRowFields_(sessions, index + 2, {
        revoked_at: now,
        revoke_reason: safeReason
      });
      appendAuditEvent_({
        user_id: String(record.user_id || ""),
        action: "session_revoked",
        outcome: "success",
        details: { reason: safeReason }
      });
      return true;
    }

    return false;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Public internal helper for revoking all sessions belonging to a user.
 * This acquires the script lock; use the unlocked variant only while already
 * holding that lock.
 */
function revokeUserSessions_(userId, reason, occurredAt) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return revokeUserSessionsUnlocked_(userId, reason, occurredAt);
  } finally {
    lock.releaseLock();
  }
}

function revokeUserSessionsUnlocked_(userId, reason, occurredAt) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId) return 0;

  const sessions = getRequiredSheet_(getMasterSpreadsheet_(), "Sessions");
  const lastRow = sessions.getLastRow();
  if (lastRow < 2) return 0;

  const rows = sessions.getRange(
    2, 1, lastRow - 1, sessions.getLastColumn()
  ).getValues();
  const now = occurredAt || new Date().toISOString();
  const safeReason = String(reason || "revoked").slice(0, 80);
  let count = 0;

  rows.forEach(function (values, index) {
    const record = rowToRecord_(sessions, { values: values });
    if (String(record.user_id || "") !== normalizedUserId || record.revoked_at) {
      return;
    }

    updateSheetRowFields_(sessions, index + 2, {
      revoked_at: now,
      revoke_reason: safeReason
    });
    count++;
  });

  return count;
}

function getUserById_(userId) {
  const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const match = findRecordByValue_(users, "user_id", String(userId || ""));
  return match ? rowToRecord_(users, match) : null;
}

function hmacBase64_(secret, message) {
  return Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(String(message), String(secret))
  );
}

function validateSessionToken_(token) {
  return validateSession_(token);
}

function revokeSessionsForUser_(userId, reason, occurredAt) {
  return revokeUserSessions_(userId, reason, occurredAt);
}
