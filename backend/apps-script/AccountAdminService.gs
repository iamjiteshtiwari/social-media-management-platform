/**
 * Account lifecycle administration.
 *
 * Every administrative action resolves the actor from a server-validated
 * session. Never accept actor IDs or role names supplied by the browser.
 */
function approvePendingAccount_(sessionToken, targetUserId) {
  const actor = requireActiveAdmin_(sessionToken);
  if (!actor) return { ok: false, code: "FORBIDDEN" };

  const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const match = findRecordByValue_(users, "user_id", String(targetUserId || ""));
  if (!match) return { ok: false, code: "ACCOUNT_NOT_AVAILABLE" };

  const target = rowToRecord_(users, match);
  if (target.status !== ACCOUNT_STATUS.PENDING_APPROVAL || !target.email_verified_at) {
    return { ok: false, code: "ACCOUNT_NOT_AVAILABLE" };
  }

  const now = new Date().toISOString();
  updateSheetRowFields_(users, match.rowNumber, {
    status: ACCOUNT_STATUS.ACTIVE,
    status_reason: "",
    approved_at: now,
    updated_at: now
  });
  appendAuditEvent_({
    user_id: target.user_id,
    action: "account_approved",
    outcome: "success",
    details: { actor_user_id: actor.user.user_id }
  });
  return { ok: true, code: "ACCOUNT_APPROVED" };
}

function adminSetAccountStatus_(sessionToken, targetUserId, nextStatus, reason) {
  const actor = requireActiveAdmin_(sessionToken);
  if (!actor) return { ok: false, code: "FORBIDDEN" };

  const allowed = [
    ACCOUNT_STATUS.ACTIVE,
    ACCOUNT_STATUS.SUSPENDED,
    ACCOUNT_STATUS.DISABLED
  ];
  if (allowed.indexOf(String(nextStatus)) < 0) {
    return { ok: false, code: "INVALID_STATUS" };
  }

  const users = getRequiredSheet_(getMasterSpreadsheet_(), "Users");
  const match = findRecordByValue_(users, "user_id", String(targetUserId || ""));
  if (!match) return { ok: false, code: "ACCOUNT_NOT_AVAILABLE" };

  const target = rowToRecord_(users, match);
  if (target.status === ACCOUNT_STATUS.DELETED) {
    return { ok: false, code: "ACCOUNT_NOT_AVAILABLE" };
  }
  if (String(target.user_id) === String(actor.user.user_id) &&
      nextStatus !== ACCOUNT_STATUS.ACTIVE) {
    return { ok: false, code: "CANNOT_CHANGE_OWN_ADMIN_ACCESS" };
  }
  if (nextStatus === ACCOUNT_STATUS.ACTIVE &&
      (!target.email_verified_at || !target.approved_at)) {
    return { ok: false, code: "VERIFICATION_AND_APPROVAL_REQUIRED" };
  }

  const now = new Date().toISOString();
  const fields = {
    status: String(nextStatus),
    status_reason: String(reason || "").trim().slice(0, 300),
    updated_at: now
  };
  if (nextStatus === ACCOUNT_STATUS.SUSPENDED) fields.suspended_at = now;
  if (nextStatus === ACCOUNT_STATUS.DISABLED) fields.disabled_at = now;
  if (nextStatus === ACCOUNT_STATUS.ACTIVE) {
    fields.suspended_at = "";
    fields.disabled_at = "";
  }
  updateSheetRowFields_(users, match.rowNumber, fields);

  if (nextStatus !== ACCOUNT_STATUS.ACTIVE) {
    revokeSessionsForUser_(target.user_id, "account_" + nextStatus, now);
  }
  appendAuditEvent_({
    user_id: target.user_id,
    action: "account_status_changed",
    outcome: "success",
    details: {
      actor_user_id: actor.user.user_id,
      previous_status: target.status,
      next_status: nextStatus,
      reason: String(reason || "").trim().slice(0, 300)
    }
  });
  return { ok: true, code: "ACCOUNT_STATUS_UPDATED", status: nextStatus };
}

function deleteOwnAccount_(sessionToken, password) {
  const context = validateSessionToken_(sessionToken);
  if (!context) return { ok: false, code: "SESSION_INVALID" };

  const user = context.user;
  const passwordOk = verifyPassword_(
    String(password || ""),
    String(user.password_salt || ""),
    String(user.password_hash || ""),
    String(user.password_hash_algorithm || ""),
    Number(user.password_hash_iterations)
  );
  if (!passwordOk) return { ok: false, code: "REAUTHENTICATION_REQUIRED" };

  const now = new Date().toISOString();
  const deletedUsername = "deleted_" + String(user.user_id).replace(/-/g, "").slice(0, 20);
  updateSheetRowFields_(getRequiredSheet_(getMasterSpreadsheet_(), "Users"),
    context.userRowNumber, {
      full_name: "Deleted account",
      username: deletedUsername,
      email_normalized: "",
      phone: "",
      password_hash: "",
      password_salt: "",
      password_hash_algorithm: "",
      password_hash_iterations: "",
      password_changed_at: "",
      role: "member",
      status: ACCOUNT_STATUS.DELETED,
      status_reason: "Deleted by account owner",
      deleted_at: now,
      updated_at: now
    });
  revokeSessionsForUser_(user.user_id, "account_deleted", now);
  appendAuditEvent_({
    user_id: user.user_id,
    action: "account_deleted",
    outcome: "success",
    details: { deletion_type: "soft_delete_with_profile_anonymization" }
  });
  return { ok: true, code: "ACCOUNT_DELETED" };
}

function requireActiveAdmin_(sessionToken) {
  const context = validateSessionToken_(sessionToken);
  if (!context || String(context.user.role) !== "admin") return null;
  return context;
}
