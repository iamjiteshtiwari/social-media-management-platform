/**
 * Meta OAuth state lifecycle — server-side foundation only.
 *
 * This module deliberately does not build login URLs, exchange authorization
 * codes, call Meta, or expose public routes. Those steps must remain disabled
 * until a deployed backend callback URL and secure browser authorization path
 * have been reviewed.
 *
 * Call createMetaOAuthState_ only from a trusted server-side handler after it
 * has authenticated the current session and derived userId/sessionId itself.
 * Never accept those identifiers as authorization proof from browser input.
 */
const META_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const META_OAUTH_PROVIDER = "meta";

/**
 * Creates a short-lived, single-use OAuth state value and stores only its
 * SHA-256 digest in the master workbook. No provider call is made.
 *
 * Returns the raw state only to the trusted server-side caller so it can later
 * be placed in an authorization URL. Do not log or persist the raw state.
 */
function createMetaOAuthState_(userId, sessionId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedUserId || !normalizedSessionId) {
    throw new Error("META_OAUTH_AUTH_CONTEXT_REQUIRED");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const nowMs = Date.now();
    const state = Utilities.getUuid() + "." + Utilities.getUuid();
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + META_OAUTH_STATE_TTL_MS).toISOString();
    const sheet = getRequiredSheet_(getMasterSpreadsheet_(), "OAuthStates");

    appendRecord_(sheet, {
      oauth_state_id: Utilities.getUuid(),
      provider: META_OAUTH_PROVIDER,
      user_id: normalizedUserId,
      session_id: normalizedSessionId,
      state_verifier_hash: hashMetaOAuthState_(state),
      created_at: createdAt,
      expires_at: expiresAt,
      consumed_at: "",
      failure_reason: ""
    });

    return { state: state, expires_at: expiresAt };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atomically validates and consumes an OAuth state. Returns the server-stored
 * user/session context once, or null for missing, wrong-provider, expired,
 * malformed, or already-consumed state. It never calls Meta or exchanges code.
 */
function consumeMetaOAuthState_(state) {
  const normalizedState = String(state || "").trim();
  if (!normalizedState || normalizedState.length > 200 ||
      !/^[A-Za-z0-9._-]+$/.test(normalizedState)) {
    return null;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getRequiredSheet_(getMasterSpreadsheet_(), "OAuthStates");
    const match = findRecordByValue_(
      sheet, "state_verifier_hash", hashMetaOAuthState_(normalizedState)
    );
    if (!match) return null;

    const record = rowToRecord_(sheet, match);
    const nowMs = Date.now();
    if (!isUsableMetaOAuthStateRecord_(record, nowMs)) return null;

    const consumedAt = new Date(nowMs).toISOString();
    updateSheetRowFields_(sheet, match.rowNumber, { consumed_at: consumedAt });
    return {
      user_id: String(record.user_id || ""),
      session_id: String(record.session_id || ""),
      consumed_at: consumedAt
    };
  } finally {
    lock.releaseLock();
  }
}

function hashMetaOAuthState_(state) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(state),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

/** Pure validation helper so state rules can be tested with synthetic records. */
function isUsableMetaOAuthStateRecord_(record, nowMs) {
  if (!record || String(record.provider || "") !== META_OAUTH_PROVIDER) return false;
  if (!String(record.user_id || "").trim() || !String(record.session_id || "").trim()) return false;
  if (!String(record.state_verifier_hash || "").trim()) return false;
  if (String(record.consumed_at || "").trim()) return false;

  const expiresAtMs = Date.parse(String(record.expires_at || ""));
  const createdAtMs = Date.parse(String(record.created_at || ""));
  const currentMs = Number(nowMs);
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(createdAtMs) ||
      !Number.isFinite(currentMs)) return false;
  if (expiresAtMs <= currentMs || createdAtMs > currentMs) return false;
  if (expiresAtMs - createdAtMs > META_OAUTH_STATE_TTL_MS) return false;
  return true;
}
