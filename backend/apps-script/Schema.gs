/**
 * Versioned canonical data contracts.
 *
 * Master workbook: account registry, resource map, social connections,
 * non-secret configuration, authentication records, audit trail and the
 * supporting session/challenge records required by custom authentication.
 * Per-user workbook: the seven approved operational tabs.
 *
 * These definitions do not create or modify spreadsheets by themselves.
 * Initializers remain manual-only and guarded by private opt-in properties.
 * Never store plaintext passwords, raw session tokens, OTP values, OAuth
 * tokens, CAPTCHA secrets or provider refresh tokens in spreadsheet cells.
 */
const MASTER_SCHEMA_VERSION = 2;

function getMasterSchema_() {
  return {
    Users: [
      "user_id", "full_name", "username", "email", "phone", "role",
      "account_status", "registration_status", "email_verified",
      "email_verified_at", "approved_at", "status_reason", "suspended_at",
      "disabled_at", "deleted_at", "created_at", "updated_at", "last_login_at"
    ],
    UserResources: [
      "user_id", "user_spreadsheet_id", "drive_root_folder_id", "media_folder_id",
      "published_media_folder_id", "provisioning_status", "spreadsheet_status",
      "drive_status", "schema_version", "created_at", "updated_at", "retry_count",
      "last_error_code"
    ],
    SocialConnections: [
      "social_connection_id", "user_id", "brand_id", "platform",
      "platform_account_id", "account_display_name", "connection_status",
      "granted_scopes", "connected_at", "updated_at", "token_reference",
      "token_expires_at", "last_validated_at", "last_error_code", "disconnected_at"
    ],
    AppConfig: [
      "config_key", "config_value", "value_type", "environment", "is_enabled",
      "updated_at", "updated_by"
    ],
    AuthRecords: [
      "auth_record_id", "user_id", "auth_method", "password_hash", "password_salt",
      "password_hash_algorithm", "password_hash_iterations", "password_changed_at",
      "failed_login_count", "login_locked_until", "created_at", "updated_at"
    ],
    AuditLogs: [
      "audit_event_id", "occurred_at", "actor_type", "actor_id", "action",
      "target_type", "target_id", "outcome", "reason_code", "request_id",
      "metadata_json"
    ],
    Sessions: [
      "session_id", "user_id", "credential_verifier", "issued_at",
      "expires_at", "revoked_at", "revoke_reason", "created_at"
    ],
    AuthChallenges: [
      "challenge_id", "user_id", "challenge_type", "verifier_hash",
      "expires_at", "attempt_count", "max_attempts", "last_sent_at",
      "consumed_at", "created_at"
    ],
    OAuthStates: [
      "oauth_state_id", "provider", "user_id", "session_id",
      "state_verifier_hash", "created_at", "expires_at", "consumed_at",
      "failure_reason"
    ]
  };
}

function getOperationalSchema_() {
  return {
    Brands: [
      "brand_id", "brand_name", "description", "website_url", "timezone",
      "status", "created_at", "updated_at"
    ],
    Posts: [
      "post_id", "brand_id", "caption", "first_comment", "content_type",
      "status", "scheduled_at_utc", "timezone", "created_at", "updated_at",
      "deleted_at"
    ],
    PostTargets: [
      "target_id", "post_id", "social_connection_id", "platform_status",
      "scheduled_at_utc", "published_at_utc", "platform_post_id",
      "attempt_count", "next_retry_at", "last_error_code", "updated_at"
    ],
    MediaLibrary: [
      "media_id", "drive_file_id", "file_name", "mime_type", "media_type",
      "size_bytes", "alt_text", "status", "uploaded_at", "updated_at",
      "retention_status", "cleanup_eligible_at", "last_referenced_at"
    ],
    PostMedia: [
      "post_media_id", "post_id", "media_id", "sort_order", "created_at"
    ],
    PublishingLogs: [
      "log_id", "post_id", "target_id", "attempted_at", "result_status",
      "platform_post_id", "error_code", "retry_count"
    ],
    Settings: [
      "setting_key", "setting_value", "value_type", "updated_at", "updated_by"
    ]
  };
}

function getSchemaPreview() {
  return {
    version: MASTER_SCHEMA_VERSION,
    master: getMasterSchema_(),
    operational: getOperationalSchema_()
  };
}

/**
 * Manual-only master setup helper.
 * Requires ENABLE_SCHEMA_INITIALIZATION=YES and a spreadsheet name containing
 * TEST. Run only against a disposable test workbook. This function is not
 * called automatically by the API.
 */
function initializeMasterSchema() {
  if (getPrivateProperty_(AppConfig.PROPERTY.ENABLE_SCHEMA_INITIALIZATION) !== "YES") {
    throw new Error("SCHEMA_INITIALIZATION_NOT_ENABLED");
  }

  const spreadsheetId = getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  if (!/test/i.test(spreadsheet.getName())) {
    throw new Error("MASTER_TEST_SHEET_NAME_MUST_INCLUDE_TEST");
  }

  validateNoLegacySchemaTabs_(spreadsheet, ["ResourceMap", "AuditLog", "SocialAccounts", "Content", "PublishingQueue", "Notifications"]);
  const schema = getMasterSchema_();
  validateSchemaCompatibility_(spreadsheet, schema);

  Object.keys(schema).forEach(function (sheetName) {
    const headers = schema[sheetName];
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return;
    }

    const existing = sheet.getRange(
      1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)
    ).getDisplayValues()[0].slice(0, headers.length);

    const matches = headers.every(function (header, index) {
      return existing[index] === header;
    });
    if (!matches) throw new Error("SCHEMA_HEADER_MISMATCH:" + sheetName);
  });

  return {
    ok: true,
    version: MASTER_SCHEMA_VERSION,
    sheets: Object.keys(schema)
  };
}

/**
 * Preflight all existing tabs before any initializer writes. This prevents
 * known header mismatches from causing a partial schema initialization.
 */
/**
 * Stops initialization when legacy tab names are present. Legacy tabs may
 * contain data that the canonical contract does not read; never leave them
 * silently beside the new schema or attempt an automatic destructive migration.
 */
function validateNoLegacySchemaTabs_(spreadsheet, legacyNames) {
  const existingNames = spreadsheet.getSheets().map(function (sheet) {
    return sheet.getName();
  });
  const found = legacyNames.filter(function (name) {
    return existingNames.indexOf(name) >= 0;
  });
  if (found.length) {
    throw new Error("LEGACY_SCHEMA_TABS_PRESENT:" + found.join(","));
  }
}

function validateSchemaCompatibility_(spreadsheet, schema) {
  Object.keys(schema).forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() === 0) return;

    const expectedHeaders = schema[sheetName];
    const width = Math.max(sheet.getLastColumn(), expectedHeaders.length);
    const existing = sheet.getRange(1, 1, 1, width)
      .getDisplayValues()[0]
      .slice(0, expectedHeaders.length);

    const matches = expectedHeaders.every(function (header, index) {
      return existing[index] === header;
    });
    if (!matches) throw new Error("SCHEMA_HEADER_MISMATCH:" + sheetName);
  });
}
