/** Setup and native Google Sheet menu actions for My Finance. */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('My Finance')
    .addItem('Set up budget', 'setupBudget')
    .addSeparator()
    .addItem('Rebuild Ledger', 'rebuildLedgerFromMenu')
    .addToUi();
}

function setupBudget() {
  const ui = SpreadsheetApp.getUi();
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('Open the copied budget Sheet before initializing it.');
    initializeSpreadsheet_(spreadsheet);
    const status = getSetupStatus();
    ui.alert(
      'Budget initialized',
      'The normalized budget sheets are ready and the Ledger has been rebuilt.',
      ui.ButtonSet.OK
    );
    return status;
  } catch (error) {
    ui.alert('Setup failed', errorMessage_(error), ui.ButtonSet.OK);
    throw error;
  }
}

// Development and backward-compatible entry point.
function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet() || getSpreadsheet_();
  initializeSpreadsheet_(spreadsheet);
  return getSetupStatus();
}

function initializeSpreadsheet_(spreadsheet) {
  const properties = PropertiesService.getScriptProperties();
  // This assignment must happen before model access. A copied bound script can
  // retain the template's properties, but must always use its active copy.
  properties.setProperty(APP.spreadsheetIdProperty, spreadsheet.getId());
  // Remove the deployment URL stored by setup version 1, if present.
  properties.deleteProperty('WEB_APP_URL');
  ensureDataModel_();
  rebuildLedger_();
  properties.setProperty(APP.setupVersionProperty, APP.setupVersion);
}

function getSetupStatus() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  const configuredId = properties.getProperty(APP.spreadsheetIdProperty);
  const configuredVersion = properties.getProperty(APP.setupVersionProperty);
  const requiredSheets = Object.keys(TABLES).map(function (key) { return TABLES[key].name; });
  const missingSheets = spreadsheet
    ? requiredSheets.filter(function (name) { return !spreadsheet.getSheetByName(name); })
    : requiredSheets;
  const activeSpreadsheetId = spreadsheet ? spreadsheet.getId() : '';

  return {
    initialized: Boolean(
      spreadsheet &&
      configuredId === activeSpreadsheetId &&
      configuredVersion === APP.setupVersion &&
      missingSheets.length === 0
    ),
    setupVersion: configuredVersion,
    currentSetupVersion: APP.setupVersion,
    spreadsheetId: activeSpreadsheetId,
    spreadsheetName: spreadsheet ? spreadsheet.getName() : '',
    missingSheets: missingSheets,
    ledgerNeedsRebuild: isLedgerDirty_(),
  };
}

function rebuildLedgerFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const status = getSetupStatus();
    if (!status.initialized) {
      throw new Error('Initialize this budget from My Finance \u2192 Set up budget first.');
    }
    const result = rebuildLedger();
    ui.alert('Ledger rebuilt', result.rows + ' transaction rows were rebuilt.', ui.ButtonSet.OK);
    return result;
  } catch (error) {
    ui.alert('Ledger rebuild failed', errorMessage_(error), ui.ButtonSet.OK);
    throw error;
  }
}
