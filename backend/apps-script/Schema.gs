/**
 * Versioned data contracts. These definitions do not create spreadsheets
 * or tabs by themselves.
 *
 * Never store plaintext passwords, raw session tokens, OAuth tokens, CAPTCHA
 * secrets, OTP values, or provider refresh tokens. Password hash fields contain
 * only the output of the configured password-hashing adapter.
 */
const MASTER_SCHEMA_VERSION = 1;

function getMasterSchema_() {
  return {
    Users: [
      "user_id", "auth_provider", "auth_subject", "full_name", "username",
      "email_normalized", "phone", "password_hash", "password_salt",
      "password_hash_algorithm", "password_hash_iterations", "password_changed_at",
      "role", "status", "status_reason", "email_verified_at", "approved_at",
      "suspended_at", "disabled_at", "deleted_at", "created_at", "updated_at", "last_login_at"
    ],
    ResourceMap: [
      "mapping_id", "user_id", "resource_type", "resource_id",
      "owner_account_label", "status", "created_at", "updated_at"
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
    AuditLog: [
      "event_id", "user_id", "action", "outcome", "occurred_at",
      "request_id", "details_json"
    ]
  };
}

function getOperationalSchema_() {
  return {
    Brands: [
      "brand_id", "user_id", "name", "description", "website_url",
      "status", "created_at", "updated_at"
    ],
    SocialAccounts: [
      "social_account_id", "user_id", "brand_id", "platform",
      "provider_account_id", "display_name", "connection_status",
      "token_reference", "connected_at", "updated_at"
    ],
    Content: [
      "content_id", "user_id", "brand_id", "title", "caption",
      "media_ids_json", "platforms_json", "status", "created_at",
      "updated_at", "created_by"
    ],
    PublishingQueue: [
      "queue_id", "user_id", "content_id", "social_account_id",
      "scheduled_at", "status", "attempt_count", "last_attempt_at",
      "next_attempt_at", "last_error_code", "created_at", "updated_at"
    ],
    PublishingLogs: [
      "log_id", "user_id", "content_id", "social_account_id", "event_type",
      "status", "provider_post_id", "occurred_at", "error_code",
      "safe_details_json"
    ],
    MediaLibrary: [
      "media_id", "user_id", "brand_id", "drive_file_id", "file_name",
      "mime_type", "size_bytes", "storage_status", "created_at", "updated_at"
    ],
    Notifications: [
      "notification_id", "user_id", "type", "title", "message",
      "read_at", "created_at", "related_entity_type", "related_entity_id"
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
 * Manual-only setup helper.
 * It refuses to run unless the owner deliberately sets
 * ENABLE_SCHEMA_INITIALIZATION=YES in Script Properties.
 * Run only against a disposable TEST master spreadsheet first.
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
  const schema = getMasterSchema_();
  validateSchemaCompatibility_(spreadsheet, schema);

  Object.keys(schema).forEach(function (sheetName) {
    const headers = schema[sheetName];
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return;
    }

    const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
      .getDisplayValues()[0]
      .slice(0, headers.length);

    const matches = headers.every(function (header, index) {
      return existing[index] === header;
    });

    if (!matches) {
      throw new Error("SCHEMA_HEADER_MISMATCH:" + sheetName);
    }
  });

  return { ok: true, version: MASTER_SCHEMA_VERSION, sheets: Object.keys(schema) };
}


/**
 * Preflight all existing tabs before any initializer writes. This avoids a
 * partially initialized workbook when a later tab has incompatible headers.
 */
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
    if (!matches) {
      throw new Error("SCHEMA_HEADER_MISMATCH:" + sheetName);
    }
  });
}
