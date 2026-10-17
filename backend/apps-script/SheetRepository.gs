/**
 * Spreadsheet repository helpers.
 *
 * Spreadsheet IDs must come from Script Properties or trusted master mappings,
 * never from an untrusted browser request. Keep operations small and batch reads
 * / writes where possible to reduce Apps Script quota and latency.
 */
function getMasterSpreadsheet_() {
  const id = getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);
  return SpreadsheetApp.openById(id);
}

function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("REQUIRED_SHEET_MISSING:" + sheetName);
  return sheet;
}

function getHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1 || sheet.getLastRow() < 1) {
    throw new Error("SHEET_SCHEMA_MISSING:" + sheet.getName());
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};
  headers.forEach(function (header, index) {
    const key = String(header || "").trim();
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      throw new Error("DUPLICATE_SHEET_HEADER:" + sheet.getName());
    }
    map[key] = index;
  });
  return map;
}

function appendRecord_(sheet, record) {
  const headerMap = getHeaderMap_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const row = headers.map(function (header) {
    const key = String(header || "").trim();
    return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : "";
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function findRecordByValue_(sheet, columnName, expectedValue) {
  const headerMap = getHeaderMap_(sheet);
  if (!Object.prototype.hasOwnProperty.call(headerMap, columnName)) {
    throw new Error("SEARCH_COLUMN_NOT_FOUND");
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const columnIndex = headerMap[columnName] + 1;
  const values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getDisplayValues();
  const expected = String(expectedValue);

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === expected) {
      return {
        rowNumber: i + 2,
        values: sheet.getRange(i + 2, 1, 1, sheet.getLastColumn()).getValues()[0]
      };
    }
  }
  return null;
}

function appendAuditEvent_(event) {
  const spreadsheet = getMasterSpreadsheet_();
  const sheet = getRequiredSheet_(spreadsheet, "AuditLogs");
  const details = event.details && typeof event.details === "object" ? event.details : {};
  const actorId = String(event.actor_id || details.actor_user_id || event.user_id || "");
  const safeMetadata = {};
  const allowedMetadataKeys = [
    "method", "reason", "attempt", "locked", "next_status", "previous_status",
    "deletion_type", "latest_challenge_only", "actor_user_id"
  ];
  allowedMetadataKeys.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(details, key)) safeMetadata[key] = details[key];
  });
  const safeEvent = {
    audit_event_id: event.audit_event_id || Utilities.getUuid(),
    occurred_at: event.occurred_at || new Date().toISOString(),
    actor_type: String(event.actor_type || (details.actor_user_id ? "admin" : (event.user_id ? "user" : "system"))).slice(0, 20),
    actor_id: actorId.slice(0, 100),
    action: String(event.action || "unknown").slice(0, 80),
    target_type: String(event.target_type || (event.user_id ? "user" : "")).slice(0, 40),
    target_id: String(event.target_id || event.user_id || "").slice(0, 100),
    outcome: String(event.outcome || "unknown").slice(0, 40),
    reason_code: String(event.reason_code || details.reason || "").slice(0, 80),
    request_id: String(event.request_id || "").slice(0, 80),
    metadata_json: JSON.stringify(safeMetadata).slice(0, 1500)
  };
  return appendRecord_(sheet, safeEvent);
}

/**
 * Converts a repository row match into an object keyed by the sheet headers.
 * A match is the { values, rowNumber } object returned by findRecordByValue_.
 */
function rowToRecord_(sheet, match) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const record = {};
  headers.forEach(function (header, index) {
    const key = String(header || "").trim();
    if (key) record[key] = match.values[index];
  });
  return record;
}

/**
 * Updates only explicitly named columns and fails if the sheet schema is wrong.
 * Keep this generic data-access helper out of individual business services.
 */
function updateSheetRowFields_(sheet, rowNumber, fields) {
  const headerMap = getHeaderMap_(sheet);
  Object.keys(fields).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(headerMap, key)) {
      throw new Error("SHEET_FIELD_NOT_FOUND:" + key);
    }
    sheet.getRange(rowNumber, headerMap[key] + 1).setValue(fields[key]);
  });
}
