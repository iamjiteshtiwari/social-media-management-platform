/**
 * Account lifecycle policy shared by authentication and admin modules.
 * Administrative mutation must only be called after server-side admin auth.
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

const ACCOUNT_TRANSITIONS = Object.freeze({
  pending_email: ["pending_approval", "disabled", "deletion_pending"],
  pending_approval: ["active", "suspended", "disabled", "deletion_pending"],
  active: ["suspended", "disabled", "deletion_pending"],
  suspended: ["active", "disabled", "deletion_pending"],
  disabled: ["active", "suspended", "deletion_pending"],
  deletion_pending: ["active", "deleted"],
  deleted: []
});

function assertAccountTransition_(fromStatus, toStatus) {
  const allowed = ACCOUNT_TRANSITIONS[String(fromStatus || "")] || [];
  if (allowed.indexOf(String(toStatus || "")) === -1) {
    throw new Error("ACCOUNT_STATUS_TRANSITION_NOT_ALLOWED");
  }
}

function canAccountAuthenticate_(user) {
  return Boolean(user) && String(user.status) === ACCOUNT_STATUS.ACTIVE &&
    !user.disabled_at && !user.suspended_at && !user.deleted_at;
}

function normalizeEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

function normalizeUsername_(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) throw new Error("INVALID_USERNAME");
  return username;
}

function validateRegistrationInput_(input) {
  if (!input || typeof input !== "object") throw new Error("INVALID_REQUEST");
  const fullName = String(input.full_name || "").trim();
  const phone = String(input.phone || "").trim();
  if (fullName.length < 2 || fullName.length > 100) throw new Error("INVALID_FULL_NAME");
  if (phone.length < 7 || phone.length > 25 || !/^[+0-9() .-]+$/.test(phone)) {
    throw new Error("INVALID_PHONE");
  }
  if (input.password !== input.confirm_password) throw new Error("PASSWORD_CONFIRMATION_MISMATCH");
  validatePassword_(input.password);
  return {
    full_name: fullName,
    username: normalizeUsername_(input.username),
    email_normalized: normalizeEmail_(input.email),
    phone: phone
  };
}

/** Call only after authenticating and authorizing an administrator. */
function changeAccountStatus_(userId, nextStatus, reason, adminUserId) {
  if (!userId || !adminUserId) throw new Error("ADMIN_CONTEXT_REQUIRED");
  if (!Object.prototype.hasOwnProperty.call(ACCOUNT_TRANSITIONS, String(nextStatus))) {
    throw new Error("INVALID_ACCOUNT_STATUS");
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
    const found = findRecordByValue_(sheet, "user_id", String(userId));
    if (!found) throw new Error("ACCOUNT_NOT_FOUND");
    const user = rowToRecord_(sheet, found.values);
    assertAccountTransition_(user.status, nextStatus);
    const headers = getHeaderMap_(sheet);
    const now = new Date().toISOString();
    setCellIfColumnExists_(sheet, found.rowNumber, headers, "status", nextStatus);
    setCellIfColumnExists_(sheet, found.rowNumber, headers, "status_reason", String(reason || "").slice(0, 300));
    setCellIfColumnExists_(sheet, found.rowNumber, headers, "updated_at", now);
    if (nextStatus === ACCOUNT_STATUS.SUSPENDED) setCellIfColumnExists_(sheet, found.rowNumber, headers, "suspended_at", now);
    if (nextStatus === ACCOUNT_STATUS.DISABLED) setCellIfColumnExists_(sheet, found.rowNumber, headers, "disabled_at", now);
    if (nextStatus === ACCOUNT_STATUS.DELETED) setCellIfColumnExists_(sheet, found.rowNumber, headers, "deleted_at", now);
    if (nextStatus !== ACCOUNT_STATUS.ACTIVE) revokeUserSessions_(String(userId), "account_" + nextStatus);
    appendAuditEvent_({
      user_id: String(userId), action: "account_status_changed", outcome: "success",
      details: { from_status: user.status, to_status: nextStatus, admin_user_id: String(adminUserId), reason: String(reason || "").slice(0, 200) }
    });
    return { ok: true, status: nextStatus };
  } finally {
    lock.releaseLock();
  }
}

function rowToRecord_(sheet, values) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const record = {};
  headers.forEach(function (header, index) { record[String(header)] = values[index]; });
  return record;
}

function setCellIfColumnExists_(sheet, rowNumber, headerMap, column, value) {
  if (Object.prototype.hasOwnProperty.call(headerMap, column)) {
    sheet.getRange(rowNumber, headerMap[column] + 1).setValue(value);
  }
}
