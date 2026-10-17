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

function normalizeEmail_(email) {
  const value = String(email || "").trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function updateUserFieldsById_(userId, fields) {
  const sheet = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const match = findRecordByValue_(sheet, "user_id", userId);
  if (!match) throw new Error("USER_NOT_FOUND");
  updateSheetRowFields_(sheet, match.rowNumber, fields);
}

function canAccountAuthenticate_(user) {
  return Boolean(user) && String(user.account_status) === ACCOUNT_STATUS.ACTIVE &&
    (user.email_verified === true || String(user.email_verified) === "true") &&
    Boolean(user.email_verified_at) && Boolean(user.approved_at) &&
    !user.disabled_at && !user.suspended_at && !user.deleted_at;
}
