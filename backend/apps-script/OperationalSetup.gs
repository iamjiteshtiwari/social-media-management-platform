/**
 * Controlled setup/access checks for a disposable work-owned operational test sheet.
 *
 * This module never accepts spreadsheet IDs from browser requests. The ID must
 * be set privately in Script Properties, and schema creation requires an
 * explicit manual opt-in plus a spreadsheet name containing "TEST".
 */

function previewOperationalSchema() {
  const schema = getOperationalSchema_();
  return {
    version: MASTER_SCHEMA_VERSION,
    sheets: Object.keys(schema).map(function (name) {
      return { name: name, headers: schema[name].slice() };
    })
  };
}

/**
 * Read-only cross-account access test. Does not create or modify anything.
 * Use only with a disposable sheet shared by the work account with the
 * personal account that owns this Apps Script project.
 */
function testOperationalSheetAccess() {
  const spreadsheetId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID
  );
  const masterId = getRequiredPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID);
  if (spreadsheetId === masterId) {
    throw new Error("OPERATIONAL_AND_MASTER_IDS_MUST_DIFFER");
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const name = spreadsheet.getName();
  if (!/test/i.test(name)) {
    throw new Error("OPERATIONAL_TEST_SHEET_NAME_MUST_INCLUDE_TEST");
  }

  return {
    ok: true,
    access: "read",
    spreadsheetName: name,
    existingTabs: spreadsheet.getSheets().map(function (sheet) {
      return sheet.getName();
    })
  };
}

/**
 * Manual-only initializer. The configured sheet must be a disposable
 * work-owned test spreadsheet shared with the personal account.
 */
function initializeOperationalTestSchema() {
  if (getPrivateProperty_(AppConfig.PROPERTY.ENABLE_OPERATIONAL_SCHEMA_INITIALIZATION) !== "YES") {
    throw new Error("OPERATIONAL_SCHEMA_INITIALIZATION_NOT_ENABLED");
  }

  const access = testOperationalSheetAccess();
  const spreadsheetId = getRequiredPrivateProperty_(
    AppConfig.PROPERTY.OPERATIONAL_TEST_SPREADSHEET_ID
  );
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const schema = getOperationalSchema_();

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

  return {
    ok: true,
    version: MASTER_SCHEMA_VERSION,
    spreadsheetName: access.spreadsheetName,
    sheets: Object.keys(schema)
  };
}
