/** Setup and native Google Sheet menu actions for TED. */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Track Every Dollar")
    .addItem("Set up budget", "setupBudget")
    .addSeparator()
    .addItem("Check data integrity", "checkBudgetIntegrity")
    .addToUi();
}

function checkBudgetIntegrity() {
  const report = inspectDataIntegrity_(SpreadsheetApp.getActiveSpreadsheet());
  const issues = [];
  Object.keys(report.tables).forEach(function (name) {
    const table = report.tables[name];
    if (table.required && !table.present) issues.push(name + " is missing");
    if (table.present && !table.headersValid) issues.push(name + " headers differ");
    if (table.duplicateIds && table.duplicateIds.length) issues.push(name + " has duplicate IDs");
    if (table.blankIdRows && table.blankIdRows.length) issues.push(name + " has rows with blank IDs");
    if (table.invalidNumbers && table.invalidNumbers.length) issues.push(name + " has invalid numbers");
    if (table.invalidDates && table.invalidDates.length) issues.push(name + " has invalid dates");
  });
  if (report.suspiciousAccountCategoryRows.length)
    issues.push("Accounts has unexpected values in column K");
  SpreadsheetApp.getUi().alert(
    issues.length ? "Integrity issues found" : "Integrity check passed",
    issues.length ? issues.join("\n") : "No structural data problems were detected.",
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
  console.log(JSON.stringify(report));
  return report;
}

function setupBudget() {
  const ui = SpreadsheetApp.getUi();
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet)
      throw new Error("Open the copied budget Sheet before initializing it.");
    initializeSpreadsheet_(spreadsheet);
    const status = getSetupStatus();
    ui.alert(
      "Budget initialized",
      "The normalized budget sheets are ready. Connect the app with the deployed /exec URL.",
      ui.ButtonSet.OK,
    );
    return status;
  } catch (error) {
    ui.alert("Setup failed", errorMessage_(error), ui.ButtonSet.OK);
    throw error;
  }
}

// Development and backward-compatible entry point.
function setup() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet() || getSpreadsheet_();
  initializeSpreadsheet_(spreadsheet);
  return getSetupStatus();
}

function initializeSpreadsheet_(spreadsheet) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = spreadsheet.getId();
  try {
    properties.setProperty(APP.setupStateProperty, "in_progress:" + spreadsheetId);
    // This assignment must happen before model access. A copied bound script can
    // retain the template's properties, but must always use its active copy.
    properties.setProperty(APP.spreadsheetIdProperty, spreadsheetId);
    properties.deleteProperty("API_TOKEN");
    // Remove the deployment URL stored by setup version 1, if present.
    properties.deleteProperty("WEB_APP_URL");
    ensureDataModel_();
    SpreadsheetApp.flush();
    properties.setProperty(APP.setupVersionProperty, APP.setupVersion);
    properties.setProperty(APP.setupStateProperty, "completed:" + spreadsheetId);
  } catch (error) {
    properties.setProperty(APP.setupStateProperty, "failed:" + spreadsheetId);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getSetupStatus() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  const configuredId = properties.getProperty(APP.spreadsheetIdProperty);
  const configuredVersion = properties.getProperty(APP.setupVersionProperty);
  const setupState = properties.getProperty(APP.setupStateProperty);
  const requiredSheets = Object.keys(TABLES).filter(function (key) {
    return key !== "accountActivity";
  }).map(function (key) {
    return TABLES[key].name;
  });
  const missingSheets = spreadsheet
    ? requiredSheets.filter(function (name) {
        return !spreadsheet.getSheetByName(name);
      })
    : requiredSheets;
  const incompatibleSheets = spreadsheet
    ? Object.keys(TABLES)
        .filter(function (key) { return key !== "accountActivity"; })
        .filter(function (key) {
          const spec = TABLES[key];
          const sheet = spreadsheet.getSheetByName(spec.name);
          if (!sheet) return false;
          const headers = sheet.getRange(1, 1, 1, spec.headers.length).getValues()[0];
          return !headersMatch_(headers, spec.headers);
        })
        .map(function (key) { return TABLES[key].name; })
    : [];
  const activeSpreadsheetId = spreadsheet ? spreadsheet.getId() : "";

  return {
    initialized: Boolean(
      spreadsheet &&
      configuredId === activeSpreadsheetId &&
      configuredVersion === APP.setupVersion &&
      setupState === "completed:" + activeSpreadsheetId &&
      missingSheets.length === 0 &&
      incompatibleSheets.length === 0,
    ),
    setupVersion: configuredVersion,
    currentSetupVersion: APP.setupVersion,
    setupState: setupState,
    spreadsheetId: activeSpreadsheetId,
    spreadsheetName: spreadsheet ? spreadsheet.getName() : "",
    missingSheets: missingSheets,
    incompatibleSheets: incompatibleSheets,
  };
}
