/** Google Apps Script web API for the normalized budget ledger. */

const APP = Object.freeze({
  spreadsheetIdProperty: 'SPREADSHEET_ID',
  setupVersionProperty: 'SETUP_VERSION',
  setupVersion: '7',
  apiVersion: 10,
  ledgerDirtyProperty: 'LEDGER_DIRTY',
  incomeCategoryId: '00000000-0000-4000-8000-000000000001',
  sharedAssignmentId: '00000000-0000-4000-8000-000000000101',
});

const TABLES = Object.freeze({
  transactions: {
    name: 'Transactions',
    headers: ['ID', 'Created At', 'Created By', 'Type', 'Amount', 'Date', 'Category ID', 'Vendor ID', 'Assignment ID', 'Notes'],
    fields: ['id', 'createdAt', 'createdBy', 'type', 'amount', 'date', 'categoryId', 'vendorId', 'assignmentId', 'notes'],
  },
  categories: {
    name: 'Categories',
    headers: ['ID', 'Name', 'Type', 'Is Default', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'name', 'type', 'isDefault', 'active', 'createdAt', 'updatedAt'],
  },
  vendors: {
    name: 'Vendors',
    headers: ['ID', 'Name', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'name', 'active', 'createdAt', 'updatedAt'],
  },
  assignments: {
    name: 'Assignments',
    headers: ['ID', 'Name', 'Is Default', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'name', 'isDefault', 'active', 'createdAt', 'updatedAt'],
  },
  users: {
    name: 'Users',
    headers: ['ID', 'First Name', 'Last Name', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'firstName', 'lastName', 'active', 'createdAt', 'updatedAt'],
  },
  investmentAccounts: {
    name: 'InvestmentAccounts',
    headers: ['ID', 'Name', 'Source', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'name', 'source', 'active', 'createdAt', 'updatedAt'],
  },
  investmentBalances: {
    name: 'InvestmentBalances',
    headers: ['ID', 'Account ID', 'Month', 'Ending Balance', 'Notes', 'Created At', 'Created By', 'Updated At', 'Updated By'],
    fields: ['id', 'accountId', 'month', 'balance', 'notes', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  },
  investmentContributions: {
    name: 'InvestmentContributions',
    headers: ['ID', 'Account ID', 'Month', 'Amount', 'Created At', 'Created By', 'Updated At', 'Updated By'],
    fields: ['id', 'accountId', 'month', 'amount', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  },
  importProfiles: {
    name: 'ImportProfiles',
    headers: ['ID', 'Name', 'Target', 'Investment Account ID', 'Header Signature', 'Column Mapping JSON', 'Date Format', 'Amount Mode', 'Amount Multiplier', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'name', 'target', 'investmentAccountId', 'headerSignature', 'columnMappingJson', 'dateFormat', 'amountMode', 'amountMultiplier', 'active', 'createdAt', 'updatedAt'],
  },
  importVendorMappings: {
    name: 'ImportVendorMappings',
    headers: ['ID', 'Import Profile ID', 'Source Description', 'Normalized Source Description', 'Vendor ID', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'importProfileId', 'sourceDescription', 'normalizedSourceDescription', 'vendorId', 'active', 'createdAt', 'updatedAt'],
  },
  importPersonMappings: {
    name: 'ImportPersonMappings',
    headers: ['ID', 'Import Profile ID', 'Source Description', 'Normalized Source Description', 'Assignment ID', 'Active', 'Created At', 'Updated At'],
    fields: ['id', 'importProfileId', 'sourceDescription', 'normalizedSourceDescription', 'assignmentId', 'active', 'createdAt', 'updatedAt'],
  },
  ledger: {
    name: 'Ledger',
    headers: ['Date', 'Type', 'Category', 'Vendor', 'Assignment', 'Created By', 'Notes', 'Amount', 'Transaction ID', 'Category ID', 'Vendor ID', 'Assignment ID', 'Created By ID', 'Created At'],
  },
});

const LEGACY_TRANSACTION_HEADERS = Object.freeze([
  'ID', 'Created At', 'Created By', 'Type', 'Amount', 'Date', 'Category', 'Vendor', 'Assignment', 'Notes',
]);

const DEFAULT_CATEGORIES = Object.freeze([
  { id: APP.incomeCategoryId, name: 'Income', type: 'income' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Groceries', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Dining', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Housing', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Utilities', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Transportation', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000007', name: 'Shopping', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000008', name: 'Entertainment', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000009', name: 'Health', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000010', name: 'Other', type: 'expense' },
]);

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  try {
    return handleRequest_(parsePostBody_(e));
  } catch (error) {
    return json_({ ok: false, error: errorMessage_(error) });
  }
}

function handleRequest_(request) {
  try {
    assertInitialized_();
    switch (String(request.action || '')) {
      case 'health': return success_({ status: 'ok', apiVersion: APP.apiVersion, features: ['bootstrap', 'batchTransactions', 'batchEntities', 'batchTransactionUpdates', 'investmentAccounts', 'investmentMonthlyFlows', 'batchInvestmentMonths', 'importProfiles', 'importMappings'], ledgerNeedsRebuild: isLedgerDirty_() });
      case 'bootstrap': return success_(bootstrap_());
      case 'listTransactions': return success_(listTransactions_());
      case 'addTransaction': return successResult_(addTransaction_(request.transaction));
      case 'addTransactions': return successResult_(addTransactions_(request.transactions));
      case 'updateTransaction': return successResult_(updateTransaction_(request.update || { transaction: request.transaction, base: request.base }));
      case 'updateTransactions': return successResult_(updateTransactions_(request.updates));
      case 'addEntities': return success_(addEntities_(request.entities));
      case 'listUsers': return success_(listUsers_());
      case 'addUser': return success_(withScriptLock_(function () { return addUser_(request.user); }));
      case 'updateUser': return successResult_(withScriptLock_(function () { return updateUser_(request.user); }));
      case 'listCategories': return success_(listActiveRecords_(TABLES.categories));
      case 'addCategory': return success_(addEntityCompatibility_('category', request.category));
      case 'updateCategory': return successResult_(withScriptLock_(function () { return updateCategory_(request.category); }));
      case 'archiveCategory': return success_(withScriptLock_(function () { return archiveRecord_(TABLES.categories, request.id); }));
      case 'listVendors': return success_(listActiveRecords_(TABLES.vendors));
      case 'addVendor': return success_(addEntityCompatibility_('vendor', request.vendor));
      case 'updateVendor': return successResult_(withScriptLock_(function () { return updateNamedRecord_(TABLES.vendors, request.vendor); }));
      case 'archiveVendor': return success_(withScriptLock_(function () { return archiveRecord_(TABLES.vendors, request.id); }));
      case 'listAssignments': return success_(listActiveRecords_(TABLES.assignments));
      case 'addAssignment': return success_(addEntityCompatibility_('assignment', request.assignment));
      case 'updateAssignment': return successResult_(withScriptLock_(function () { return updateNamedRecord_(TABLES.assignments, request.assignment); }));
      case 'archiveAssignment': return success_(withScriptLock_(function () { return archiveRecord_(TABLES.assignments, request.id); }));
      case 'listInvestmentAccounts': return success_(listInvestmentAccounts_());
      case 'addInvestmentAccounts': return success_(addInvestmentAccounts_(request.accounts));
      case 'addInvestmentAccount': return success_(addInvestmentAccounts_([request.account]).saved[0]);
      case 'updateInvestmentAccount': return success_(withScriptLock_(function () { return updateInvestmentAccount_(request.account); }));
      case 'archiveInvestmentAccount': return success_(withScriptLock_(function () { return archiveRecord_(TABLES.investmentAccounts, request.id); }));
      case 'listInvestmentBalances': return success_(listInvestmentBalances_());
      case 'listInvestmentContributions': return success_(listInvestmentContributions_());
      case 'saveInvestmentMonth': return success_(saveInvestmentMonths_([request.month]));
      case 'saveInvestmentMonths': return success_(saveInvestmentMonths_(request.months));
      case 'listImportProfiles': return success_(listImportProfiles_());
      case 'getImportProfileBundle': return success_(getImportProfileBundle_(request.id));
      case 'createImportProfile': return success_(withScriptLock_(function () { return createImportProfile_(request.profile); }));
      case 'updateImportProfile': return success_(withScriptLock_(function () { return updateImportProfile_(request.profile); }));
      case 'archiveImportProfile': return success_(withScriptLock_(function () { return archiveImportProfile_(request.id); }));
      case 'upsertImportMappings': return success_(upsertImportMappings_(request.importProfileId, request.vendorMappings, request.personMappings));
      case 'listInvestmentSnapshots': return success_(listLegacyInvestmentSnapshots_());
      case 'saveInvestmentSnapshots': throw new Error('This app version cannot safely write itemized investment contributions. Update the My Finance app.');
      case 'rebuildLedger': return success_(rebuildLedger());
      default: throw new Error('Unknown action.');
    }
  } catch (error) {
    return json_({ ok: false, error: errorMessage_(error) });
  }
}

function success_(data) { return json_({ ok: true, data: data }); }
function successResult_(result) {
  const payload = { ok: true, data: result.data };
  if (result.warning) payload.warning = result.warning;
  return json_(payload);
}
function withScriptLock_(callback) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function assertInitialized_() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(APP.spreadsheetIdProperty) || properties.getProperty(APP.setupVersionProperty) !== APP.setupVersion) {
    throw new Error('This budget has not been initialized. Run My Finance → Set up budget first.');
  }
}

function ensureDataModel_() {
  getTableSheet_(TABLES.categories);
  getTableSheet_(TABLES.vendors);
  getTableSheet_(TABLES.assignments);
  getTableSheet_(TABLES.users);
  getTableSheet_(TABLES.investmentAccounts);
  migrateInvestmentModelV6_();
  getTableSheet_(TABLES.investmentBalances);
  getTableSheet_(TABLES.investmentContributions);
  getTableSheet_(TABLES.importProfiles);
  getTableSheet_(TABLES.importVendorMappings);
  getTableSheet_(TABLES.importPersonMappings);
  seedDefaults_();
  getTransactionSheet_();
  getLedgerSheet_();
}

function seedDefaults_() {
  const timestamp = new Date().toISOString();
  const categorySheet = getTableSheet_(TABLES.categories);
  const categories = readRecords_(TABLES.categories, true);
  const knownCategoryIds = new Set(categories.map(function (item) { return item.id; }));
  const missingCategories = DEFAULT_CATEGORIES.filter(function (item) { return !knownCategoryIds.has(item.id); }).map(function (item) {
    return recordToRow_(TABLES.categories, {
      id: item.id, name: item.name, type: item.type, isDefault: true, active: true,
      createdAt: timestamp, updatedAt: timestamp,
    });
  });
  appendRows_(categorySheet, missingCategories);

  const assignmentSheet = getTableSheet_(TABLES.assignments);
  const assignments = readRecords_(TABLES.assignments, true);
  if (!assignments.some(function (item) { return item.id === APP.sharedAssignmentId; })) {
    appendRows_(assignmentSheet, [recordToRow_(TABLES.assignments, {
      id: APP.sharedAssignmentId, name: 'Shared', isDefault: true, active: true,
      createdAt: timestamp, updatedAt: timestamp,
    })]);
  }
}

function listTransactions_() {
  const spreadsheet = getSpreadsheet_();
  const records = readRecordsFromSheet_(requiredSheet_(spreadsheet, TABLES.transactions), TABLES.transactions, true);
  const references = referenceMapsFromSpreadsheet_(spreadsheet);
  return records.map(function (transaction) { return hydrateTransaction_(transaction, references); });
}

function bootstrap_() {
  let recordsBySheet = null;
  try {
    recordsBySheet = readBootstrapWithSheetsApi_();
  } catch (error) {
    console.warn('Sheets API batch bootstrap failed; using SpreadsheetApp fallback: ' + errorMessage_(error));
  }
  if (!recordsBySheet) recordsBySheet = readBootstrapWithSpreadsheetApp_();
  return buildBootstrapPayload_(recordsBySheet);
}

function bootstrapSpecs_() {
  return [
    TABLES.transactions,
    TABLES.categories,
    TABLES.vendors,
    TABLES.assignments,
    TABLES.users,
    TABLES.investmentAccounts,
    TABLES.investmentBalances,
    TABLES.investmentContributions,
    TABLES.importProfiles,
  ];
}

function readBootstrapWithSheetsApi_() {
  if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) return null;
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(APP.spreadsheetIdProperty);
  if (!spreadsheetId) return null;
  const specs = bootstrapSpecs_();
  const ranges = specs.map(function (spec) {
    return "'" + spec.name.replace(/'/g, "''") + "'!A:" + columnLabel_(spec.headers.length);
  });
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: ranges,
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  const valueRanges = response && response.valueRanges;
  if (!Array.isArray(valueRanges) || valueRanges.length !== specs.length) {
    throw new Error('The Sheets API did not return every bootstrap range.');
  }
  const recordsBySheet = {};
  specs.forEach(function (spec, index) {
    const values = valueRanges[index].values || [];
    if (!values.length || !headersMatch_(values[0], spec.headers)) {
      throw new Error('The ' + spec.name + ' sheet headers do not match the expected schema.');
    }
    recordsBySheet[spec.name] = values.slice(1)
      .filter(function (row) { return row[0] !== '' && row[0] !== undefined && row[0] !== null; })
      .map(function (row) { return rowToRecord_(spec, normalizeBatchRow_(spec, row)); });
  });
  return recordsBySheet;
}

function readBootstrapWithSpreadsheetApp_() {
  const spreadsheet = getSpreadsheet_();
  const recordsBySheet = {};
  bootstrapSpecs_().forEach(function (spec) {
    recordsBySheet[spec.name] = readRecordsFromSheet_(requiredSheet_(spreadsheet, spec), spec, true);
  });
  return recordsBySheet;
}

function buildBootstrapPayload_(recordsBySheet) {
  const transactions = recordsBySheet[TABLES.transactions.name];
  const categories = recordsBySheet[TABLES.categories.name];
  const vendors = recordsBySheet[TABLES.vendors.name];
  const assignments = recordsBySheet[TABLES.assignments.name];
  const users = recordsBySheet[TABLES.users.name];
  const references = {
    categories: new Map(categories.map(function (item) { return [item.id, item]; })),
    vendors: new Map(vendors.map(function (item) { return [item.id, item]; })),
    assignments: new Map(assignments.map(function (item) { return [item.id, item]; })),
    users: new Map(users.map(function (item) { return [item.id, item]; })),
  };
  function active(records) {
    return records.filter(function (record) { return record.active !== false; });
  }
  return {
    transactions: transactions.map(function (transaction) { return hydrateTransaction_(transaction, references); }),
    categories: active(categories),
    vendors: active(vendors),
    assignments: active(assignments),
    users: active(users),
    importProfiles: active(recordsBySheet[TABLES.importProfiles.name]).map(publicImportProfile_),
    investmentAccounts: recordsBySheet[TABLES.investmentAccounts.name],
    investmentBalances: recordsBySheet[TABLES.investmentBalances.name],
    investmentContributions: recordsBySheet[TABLES.investmentContributions.name],
  };
}

function columnLabel_(count) {
  let value = count, label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function normalizeBatchRow_(spec, row) {
  return spec.fields.map(function (field, index) {
    const value = row[index] === undefined || row[index] === null ? '' : row[index];
    if (typeof value !== 'number') return value;
    if (field !== 'date' && field !== 'month' && !/At$/.test(field)) return value;
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (field === 'date') return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
    if (field === 'month') return Utilities.formatDate(date, 'UTC', 'yyyy-MM');
    return Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  });
}

function addTransaction_(input) {
  const result = addTransactions_([input]);
  if (result.data.failed.length) throw new Error(result.data.failed[0].error);
  return { data: result.data.saved[0], warning: result.warning };
}

function addTransactions_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one transaction is required.');
  if (inputs.length > 50) throw new Error('A maximum of 50 transactions can be added at once.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const transactionSheet = requiredSheet_(spreadsheet, TABLES.transactions);
    const ledgerSheet = requiredSheet_(spreadsheet, TABLES.ledger);
    const references = referenceMapsFromSpreadsheet_(spreadsheet);
    const existing = readRecordsFromSheet_(transactionSheet, TABLES.transactions, true);
    const byId = new Map(existing.map(function (transaction) { return [transaction.id, transaction]; }));
    const additions = [];
    const saved = [];
    const failed = [];

    inputs.forEach(function (input) {
      try {
        const transaction = validateTransaction_(input, references);
        const duplicate = byId.get(transaction.id);
        if (duplicate) {
          if (!transactionsMatch_(duplicate, transaction)) throw new Error('That transaction ID is already used by different data.');
          saved.push(hydrateTransaction_(duplicate, references));
          return;
        }
        additions.push(transaction);
        byId.set(transaction.id, transaction);
        saved.push(hydrateTransaction_(transaction, references));
      } catch (error) {
        failed.push({ id: input && input.id ? String(input.id) : '', error: errorMessage_(error) });
      }
    });

    appendRows_(transactionSheet, additions.map(function (transaction) { return recordToRow_(TABLES.transactions, transaction); }));
    let warning = '';
    if (additions.length) {
      try {
        appendRows_(ledgerSheet, additions.map(function (transaction) { return ledgerRow_(hydrateTransaction_(transaction, references)); }));
      } catch (error) {
        markLedgerDirty_();
        warning = 'Transactions were saved, but the Ledger needs to be rebuilt: ' + errorMessage_(error);
      }
    }
    return { data: { saved: saved, failed: failed }, warning: warning };
  } finally {
    lock.releaseLock();
  }
}

function updateTransaction_(input) {
  const result = updateTransactions_([input]);
  if (result.data.failed.length) throw new Error(result.data.failed[0].error);
  return { data: result.data.saved[0], warning: result.warning };
}

function updateTransactions_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one transaction update is required.');
  if (inputs.length > 50) throw new Error('A maximum of 50 transactions can be updated at once.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const transactionSheet = requiredSheet_(spreadsheet, TABLES.transactions);
    const ledgerSheet = requiredSheet_(spreadsheet, TABLES.ledger);
    const references = referenceMapsFromSpreadsheet_(spreadsheet);
    const records = readRecordsFromSheet_(transactionSheet, TABLES.transactions, true);
    const indexes = new Map(records.map(function (transaction, index) { return [transaction.id, index]; }));
    const seen = new Set();
    const saved = [];
    const failed = [];
    const changedIds = new Set();
    let changed = false;

    inputs.forEach(function (input) {
      const requestedId = input && input.transaction && input.transaction.id ? String(input.transaction.id) : '';
      try {
        if (!input || typeof input !== 'object' || !input.transaction || !input.base) throw new Error('Each update requires transaction and base records.');
        const id = requireUuid_(input.transaction.id, 'Transaction ID');
        if (seen.has(id)) throw new Error('A transaction can only appear once in an update batch.');
        seen.add(id);
        const index = indexes.get(id);
        if (index === undefined) throw new Error('That transaction could not be found.');
        const existing = records[index];
        const draft = validateUpdatedTransaction_(input.transaction, existing, references);
        if (editableTransactionsMatch_(existing, draft)) {
          saved.push(hydrateTransaction_(existing, references));
          return;
        }
        if (!editableTransactionsMatch_(existing, input.base)) {
          failed.push({ id: id, code: 'conflict', error: 'This transaction changed in the Sheet after you opened it.', current: hydrateTransaction_(existing, references) });
          return;
        }
        records[index] = draft;
        saved.push(hydrateTransaction_(draft, references));
        changedIds.add(id);
        changed = true;
      } catch (error) {
        failed.push({ id: requestedId, error: errorMessage_(error) });
      }
    });

    if (changed) transactionSheet.getRange(2, 1, records.length, TABLES.transactions.headers.length)
      .setValues(records.map(function (transaction) { return recordToRow_(TABLES.transactions, transaction); }));

    let warning = '';
    if (changed) {
      try {
        const lastRow = ledgerSheet.getLastRow();
        const ledgerRows = lastRow < 2 ? [] : ledgerSheet.getRange(2, 1, lastRow - 1, TABLES.ledger.headers.length).getValues();
        const hydratedById = new Map(saved.filter(function (transaction) { return changedIds.has(transaction.id); }).map(function (transaction) { return [transaction.id, transaction]; }));
        const ledgerMatches = new Set();
        ledgerRows.forEach(function (row, index) {
          const hydrated = hydratedById.get(String(row[8] || ''));
          if (hydrated) { ledgerRows[index] = ledgerRow_(hydrated); ledgerMatches.add(hydrated.id); }
        });
        if (ledgerMatches.size !== changedIds.size) throw new Error('One or more updated transactions are missing from the Ledger.');
        if (ledgerRows.length) ledgerSheet.getRange(2, 1, ledgerRows.length, TABLES.ledger.headers.length).setValues(ledgerRows);
      } catch (error) {
        markLedgerDirty_();
        warning = 'Transactions were updated, but the Ledger needs to be rebuilt: ' + errorMessage_(error);
      }
    }
    return { data: { saved: saved, failed: failed }, warning: warning };
  } finally {
    lock.releaseLock();
  }
}

function validateUpdatedTransaction_(input, existing, references) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A transaction object is required.');
  const type = cleanText_(input.type, 20).toLowerCase();
  if (type !== 'income' && type !== 'expense') throw new Error('Transaction type must be income or expense.');
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount === 0) throw new Error('Amount must be a non-zero value.');
  const date = cleanText_(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate_(date)) throw new Error('Date must be a valid YYYY-MM-DD value.');

  const categoryId = requireUuid_(input.categoryId, 'Category ID');
  const assignmentId = requireUuid_(input.assignmentId, 'Assignment ID');
  const category = references.categories.get(categoryId);
  const assignment = references.assignments.get(assignmentId);
  if (!category || category.type !== type || (category.active === false && categoryId !== existing.categoryId)) {
    throw new Error('Choose an active category matching the transaction type.');
  }
  if (!assignment || (assignment.active === false && assignmentId !== existing.assignmentId)) throw new Error('Choose an active assignment.');

  let vendorId = '';
  if (type === 'expense') {
    vendorId = requireUuid_(input.vendorId, 'Vendor ID');
    const vendor = references.vendors.get(vendorId);
    if (!vendor || (vendor.active === false && vendorId !== existing.vendorId)) throw new Error('Choose an active vendor.');
  }
  return {
    id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy,
    type: type, amount: Math.round(amount * 100) / 100, date: date,
    categoryId: categoryId, vendorId: vendorId, assignmentId: assignmentId,
    notes: cleanText_(input.notes, 1000),
  };
}

function editableTransactionsMatch_(left, right) {
  if (!left || !right) return false;
  return ['type', 'amount', 'date', 'categoryId', 'vendorId', 'assignmentId', 'notes'].every(function (field) {
    return field === 'amount'
      ? Number(left[field]) === Number(right[field])
      : String(left[field] === undefined ? '' : left[field]) === String(right[field] === undefined ? '' : right[field]);
  });
}

function validateTransaction_(input, references) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A transaction object is required.');
  const type = cleanText_(input.type, 20).toLowerCase();
  if (type !== 'income' && type !== 'expense') throw new Error('Transaction type must be income or expense.');
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount === 0) throw new Error('Amount must be a non-zero value.');
  const date = cleanText_(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate_(date)) throw new Error('Date must be a valid YYYY-MM-DD value.');

  const categoryId = requireUuid_(input.categoryId, 'Category ID');
  const assignmentId = requireUuid_(input.assignmentId, 'Assignment ID');
  const createdBy = requireUuid_(input.createdBy, 'createdBy');
  references = references || referenceMaps_();
  const category = references.categories.get(categoryId);
  if (!category || category.active === false || category.type !== type) throw new Error('Choose an active category matching the transaction type.');
  const assignment = references.assignments.get(assignmentId);
  if (!assignment || assignment.active === false) throw new Error('Choose an active assignment.');
  const creator = references.users.get(createdBy);
  if (!creator || creator.active === false) throw new Error('The transaction creator is not an active user.');

  let vendorId = '';
  if (type === 'expense') {
    vendorId = requireUuid_(input.vendorId, 'Vendor ID');
    const vendor = references.vendors.get(vendorId);
    if (!vendor || vendor.active === false) throw new Error('Choose an active vendor.');
  }
  return {
    id: requireUuid_(input.id || Utilities.getUuid(), 'Transaction ID'),
    createdAt: normalizeDateTime_(input.createdAt), createdBy: createdBy, type: type,
    amount: Math.round(amount * 100) / 100, date: date, categoryId: categoryId,
    vendorId: vendorId, assignmentId: assignmentId, notes: cleanText_(input.notes, 1000),
  };
}

function transactionsMatch_(left, right) {
  return TABLES.transactions.fields.every(function (field) {
    return field === 'amount'
      ? Number(left[field]) === Number(right[field])
      : String(left[field] === undefined ? '' : left[field]) === String(right[field] === undefined ? '' : right[field]);
  });
}

function referenceMaps_() {
  function map(spec) {
    return new Map(readRecords_(spec, true).map(function (item) { return [item.id, item]; }));
  }
  return { categories: map(TABLES.categories), vendors: map(TABLES.vendors), assignments: map(TABLES.assignments), users: map(TABLES.users) };
}

function referenceMapsFromSpreadsheet_(spreadsheet) {
  function map(spec) {
    return new Map(readRecordsFromSheet_(requiredSheet_(spreadsheet, spec), spec, true).map(function (item) { return [item.id, item]; }));
  }
  return { categories: map(TABLES.categories), vendors: map(TABLES.vendors), assignments: map(TABLES.assignments), users: map(TABLES.users) };
}

function requiredSheet_(spreadsheet, spec) {
  const sheet = spreadsheet.getSheetByName(spec.name);
  if (!sheet) throw new Error('The ' + spec.name + ' sheet is missing. Run setup again.');
  return sheet;
}

function hydrateTransaction_(transaction, references) {
  const category = references.categories.get(transaction.categoryId);
  const vendor = references.vendors.get(transaction.vendorId);
  const assignment = references.assignments.get(transaction.assignmentId);
  const user = references.users.get(transaction.createdBy);
  return {
    ...transaction,
    category: category ? category.name : 'Unknown',
    vendor: vendor ? vendor.name : '',
    assignment: assignment ? assignment.name : 'Unknown',
    createdByName: user ? fullUserName_(user) : 'Unknown',
  };
}

function listUsers_() { return listActiveRecords_(TABLES.users); }
function addUser_(input) {
  const timestamp = new Date().toISOString();
  const user = validateUser_(input, {
    id: input && input.id ? input.id : Utilities.getUuid(), active: true,
    createdAt: timestamp, updatedAt: timestamp,
  });
  ensureUniqueIdAndName_(TABLES.users, user.id, fullUserName_(user), '');
  appendRows_(getTableSheet_(TABLES.users), [recordToRow_(TABLES.users, user)]);
  return user;
}
function updateUser_(input) {
  const sheet = getTableSheet_(TABLES.users);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error('That user could not be found.');
  const existing = rowToRecord_(TABLES.users, sheet.getRange(row, 1, 1, TABLES.users.headers.length).getValues()[0]);
  const user = validateUser_(input, { ...existing, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
  const oldName = fullUserName_(existing), newName = fullUserName_(user);
  sheet.getRange(row, 1, 1, TABLES.users.headers.length).setValues([recordToRow_(TABLES.users, user)]);
  return { data: user, warning: oldName === newName ? '' : safeSyncLedgerName_(13, 6, user.id, newName) };
}
function validateUser_(input, base) {
  if (!input || typeof input !== 'object') throw new Error('A user object is required.');
  const firstName = cleanText_(input.firstName, 80), lastName = cleanText_(input.lastName, 80);
  if (!firstName || !lastName) throw new Error('First and last name are required.');
  return { ...base, id: requireUuid_(base.id, 'User ID'), firstName: firstName, lastName: lastName, active: input.active !== false };
}
function fullUserName_(user) { return (user.firstName + ' ' + user.lastName).trim(); }

const INVESTMENT_SOURCES = Object.freeze(['paycheck', 'manual']);

function listInvestmentAccounts_() {
  return readRecords_(TABLES.investmentAccounts, true);
}

function normalizeInvestmentAccount_(input, existing) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('An investment account is required.');
  const timestamp = new Date().toISOString();
  const source = cleanText_(input.source, 20).toLowerCase();
  if (INVESTMENT_SOURCES.indexOf(source) < 0) throw new Error('Choose paycheck deduction or manual transfer as the account source.');
  return {
    id: requireUuid_((existing && existing.id) || input.id || Utilities.getUuid(), 'Investment account ID'),
    name: requiredName_(input.name), source: source, active: existing ? existing.active !== false : true,
    createdAt: existing ? existing.createdAt : normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
  };
}

function investmentAccountKey_(account) {
  return String(account.name).trim().toLowerCase();
}

function investmentAccountsMatch_(left, right) {
  return TABLES.investmentAccounts.fields.every(function (field) {
    return String(left[field] === undefined ? '' : left[field]) === String(right[field] === undefined ? '' : right[field]);
  });
}

function addInvestmentAccounts_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one investment account is required.');
  if (inputs.length > 50) throw new Error('A maximum of 50 investment accounts can be added at once.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sheet = requiredSheet_(getSpreadsheet_(), TABLES.investmentAccounts);
    const records = readRecordsFromSheet_(sheet, TABLES.investmentAccounts, true);
    const byId = new Map(records.map(function (item) { return [item.id, item]; }));
    const byName = new Map(records.filter(function (item) { return item.active !== false; }).map(function (item) { return [investmentAccountKey_(item), item]; }));
    const additions = [], saved = [], reconciled = [], failed = [];
    inputs.forEach(function (input) {
      const requestedId = input && input.id ? String(input.id) : '';
      try {
        const record = normalizeInvestmentAccount_(input);
        const sameId = byId.get(record.id);
        if (sameId) {
          if (!investmentAccountsMatch_(sameId, record)) throw new Error('That investment account ID is already used by different data.');
          saved.push(sameId); return;
        }
        const sameName = byName.get(investmentAccountKey_(record));
        if (sameName) { reconciled.push({ requestedId: record.id, record: sameName }); return; }
        additions.push(record); saved.push(record); byId.set(record.id, record); byName.set(investmentAccountKey_(record), record);
      } catch (error) { failed.push({ id: requestedId, error: errorMessage_(error) }); }
    });
    appendRows_(sheet, additions.map(function (item) { return recordToRow_(TABLES.investmentAccounts, item); }));
    return { saved: saved, reconciled: reconciled, failed: failed };
  } finally { lock.releaseLock(); }
}

function updateInvestmentAccount_(input) {
  const sheet = getTableSheet_(TABLES.investmentAccounts);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error('That investment account could not be found.');
  const existing = rowToRecord_(TABLES.investmentAccounts, sheet.getRange(row, 1, 1, TABLES.investmentAccounts.headers.length).getValues()[0]);
  const account = normalizeInvestmentAccount_(input, existing);
  const duplicate = readRecords_(TABLES.investmentAccounts, true).find(function (item) { return item.id !== account.id && item.active !== false && investmentAccountKey_(item) === investmentAccountKey_(account); });
  if (duplicate) throw new Error('An investment account with that name already exists.');
  sheet.getRange(row, 1, 1, TABLES.investmentAccounts.headers.length).setValues([recordToRow_(TABLES.investmentAccounts, account)]);
  return account;
}

function validMonth_(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

function listInvestmentBalances_() { return readRecords_(TABLES.investmentBalances, true); }
function listInvestmentContributions_() { return readRecords_(TABLES.investmentContributions, true); }

function investmentRecordMatches_(left, right, fields, numericFields) {
  if (!left || !right) return false;
  return fields.every(function (field) {
    return numericFields.indexOf(field) >= 0
      ? Number(left[field]) === Number(right[field])
      : String(left[field] === undefined ? '' : left[field]) === String(right[field] === undefined ? '' : right[field]);
  });
}

function normalizeInvestmentBalance_(input, existing, accounts, users) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('An investment balance is required.');
  const month = cleanText_(input.month, 7);
  if (!validMonth_(month)) throw new Error('Month must be a valid YYYY-MM value.');
  const accountId = requireUuid_(input.accountId, 'Investment account ID');
  const account = accounts.get(accountId);
  if (!account || (account.active === false && (!existing || existing.accountId !== accountId))) throw new Error('Choose an active investment account.');
  const balance = Number(input.balance || 0);
  if (!isFinite(balance) || balance < 0) throw new Error('Investment balances cannot be negative.');
  const timestamp = new Date().toISOString();
  const createdBy = existing ? existing.createdBy : requireUuid_(input.createdBy, 'createdBy');
  const updatedBy = requireUuid_(input.updatedBy || createdBy, 'updatedBy');
  if (!users.has(createdBy) || !users.has(updatedBy)) throw new Error('Choose an active app user.');
  return {
    id: requireUuid_((existing && existing.id) || input.id || Utilities.getUuid(), 'Investment balance ID'),
    accountId: accountId, month: month,
    balance: Math.round(balance * 100) / 100,
    notes: cleanText_(input.notes, 1000),
    createdAt: existing ? existing.createdAt : normalizeDateTime_(input.createdAt || timestamp), createdBy: createdBy,
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp), updatedBy: updatedBy,
  };
}

function normalizeInvestmentContribution_(input, existing, accounts, users) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('An investment contribution is required.');
  const month = cleanText_(input.month, 7);
  if (!validMonth_(month)) throw new Error('Month must be a valid YYYY-MM value.');
  const accountId = requireUuid_(input.accountId, 'Investment account ID');
  const account = accounts.get(accountId);
  if (!account || (account.active === false && (!existing || existing.accountId !== accountId))) throw new Error('Choose an active investment account.');
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount === 0) throw new Error('Investment contribution amounts must be nonzero.');
  const timestamp = new Date().toISOString();
  const createdBy = existing ? existing.createdBy : requireUuid_(input.createdBy, 'createdBy');
  const updatedBy = requireUuid_(input.updatedBy || createdBy, 'updatedBy');
  if (!users.has(createdBy) || !users.has(updatedBy)) throw new Error('Choose an active app user.');
  return {
    id: requireUuid_((existing && existing.id) || input.id || Utilities.getUuid(), 'Investment contribution ID'),
    accountId: accountId, month: month, amount: Math.round(amount * 100) / 100,
    createdAt: existing ? existing.createdAt : normalizeDateTime_(input.createdAt || timestamp), createdBy: createdBy,
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp), updatedBy: updatedBy,
  };
}

function currentInvestmentMonth_(accountId, month, balances, contributions) {
  return {
    accountId: accountId,
    month: month,
    balance: [...balances.values()].find(function (item) { return item.accountId === accountId && item.month === month; }) || null,
    contributions: [...contributions.values()].filter(function (item) { return item.accountId === accountId && item.month === month; }),
  };
}

function writeInvestmentRecords_(sheet, spec, records, previousCount) {
  const count = records.length;
  if (count) sheet.getRange(2, 1, count, spec.headers.length).setValues(records.map(function (item) { return recordToRow_(spec, item); }));
  if (previousCount > count) sheet.getRange(2 + count, 1, previousCount - count, spec.headers.length).clearContent();
}

function saveInvestmentMonths_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one investment month is required.');
  if (inputs.length > 50) throw new Error('A maximum of 50 investment months can be saved at once.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const balanceSheet = requiredSheet_(spreadsheet, TABLES.investmentBalances);
    const contributionSheet = requiredSheet_(spreadsheet, TABLES.investmentContributions);
    const balanceRecords = readRecordsFromSheet_(balanceSheet, TABLES.investmentBalances, true);
    const contributionRecords = readRecordsFromSheet_(contributionSheet, TABLES.investmentContributions, true);
    const accounts = new Map(readRecordsFromSheet_(requiredSheet_(spreadsheet, TABLES.investmentAccounts), TABLES.investmentAccounts, true).map(function (item) { return [item.id, item]; }));
    const users = new Map(readRecordsFromSheet_(requiredSheet_(spreadsheet, TABLES.users), TABLES.users, true).filter(function (item) { return item.active !== false; }).map(function (item) { return [item.id, item]; }));
    const balances = new Map(balanceRecords.map(function (item) { return [item.id, item]; }));
    const contributions = new Map(contributionRecords.map(function (item) { return [item.id, item]; }));
    const balanceByMonth = new Map(balanceRecords.map(function (item) { return [item.accountId + '|' + item.month, item]; }));
    const saved = [], failed = [], seenMonths = new Set();
    inputs.forEach(function (operation) {
      const operationId = String(operation && operation.id || '');
      try {
        if (!operation || typeof operation !== 'object') throw new Error('An investment month operation is required.');
        const accountId = requireUuid_(operation.accountId, 'Investment account ID');
        const month = cleanText_(operation.month, 7);
        if (!validMonth_(month)) throw new Error('Month must be a valid YYYY-MM value.');
        const monthKey = accountId + '|' + month;
        if (seenMonths.has(monthKey)) throw new Error('An account can only appear once per month in a batch.');
        seenMonths.add(monthKey);
        const balanceEntry = operation.balance || {};
        const existingBalance = balanceEntry.record && balances.get(String(balanceEntry.record.id || '')) || balanceByMonth.get(monthKey) || null;
        const balance = normalizeInvestmentBalance_({ ...balanceEntry.record, accountId: accountId, month: month }, existingBalance, accounts, users);
        if (existingBalance && !balanceEntry.base && !investmentRecordMatches_(existingBalance, balance, ['accountId', 'month', 'balance', 'notes'], ['balance'])) {
          failed.push({ id: operationId, code: 'conflict', error: 'This ending balance already exists with different values.', current: currentInvestmentMonth_(accountId, month, balances, contributions) }); return;
        }
        if (existingBalance && balanceEntry.base && !investmentRecordMatches_(existingBalance, balanceEntry.base, ['accountId', 'month', 'balance', 'notes'], ['balance'])) {
          failed.push({ id: operationId, code: 'conflict', error: 'This ending balance changed in the Sheet after you opened it.', current: currentInvestmentMonth_(accountId, month, balances, contributions) }); return;
        }
        if (!existingBalance && balanceByMonth.has(monthKey)) {
          failed.push({ id: operationId, code: 'conflict', error: 'That account already has an ending balance for this month.', current: currentInvestmentMonth_(accountId, month, balances, contributions) }); return;
        }
        const normalizedUpserts = [], seenContributionIds = new Set();
        for (const entry of (operation.upserts || [])) {
          const existing = contributions.get(String(entry && entry.record && entry.record.id || '')) || null;
          const record = normalizeInvestmentContribution_({ ...entry.record, accountId: accountId, month: month }, existing, accounts, users);
          if (seenContributionIds.has(record.id)) throw new Error('A contribution can only appear once in a monthly update.');
          seenContributionIds.add(record.id);
          if (existing && !entry.base && !investmentRecordMatches_(existing, record, ['accountId', 'month', 'amount'], ['amount'])) {
            failed.push({ id: operationId, code: 'conflict', error: 'That contribution ID already exists with different values.', current: currentInvestmentMonth_(accountId, month, balances, contributions) }); return;
          }
          if (existing && entry.base && !investmentRecordMatches_(existing, entry.base, ['accountId', 'month', 'amount'], ['amount'])) {
            failed.push({ id: operationId, code: 'conflict', error: 'A contribution changed in the Sheet after you opened it.', current: currentInvestmentMonth_(accountId, month, balances, contributions) }); return;
          }
          if (existing && (existing.accountId !== accountId || existing.month !== month)) throw new Error('A contribution cannot be moved to another account or month.');
          normalizedUpserts.push(record);
        }
        const normalizedDeletes = [], seenDeleteIds = new Set();
        for (const entry of (operation.deletes || [])) {
          const id = requireUuid_(entry && entry.id, 'Investment contribution ID');
          if (seenDeleteIds.has(id) || seenContributionIds.has(id)) throw new Error('A contribution cannot be updated and deleted in the same operation.');
          seenDeleteIds.add(id);
          const existing = contributions.get(id) || null;
          if (!existing && !entry.base) throw new Error('A confirmed contribution base is required for deletion.');
          if (existing && (!entry.base || !investmentRecordMatches_(existing, entry.base, ['accountId', 'month', 'amount'], ['amount']))) {
            failed.push({ id: operationId, code: 'conflict', error: 'A contribution changed before it could be deleted.', current: currentInvestmentMonth_(accountId, month, balances, contributions) }); return;
          }
          if (existing && (existing.accountId !== accountId || existing.month !== month)) throw new Error('That contribution belongs to another account or month.');
          normalizedDeletes.push(id);
        }
        balances.set(balance.id, balance); balanceByMonth.set(monthKey, balance);
        normalizedUpserts.forEach(function (record) { contributions.set(record.id, record); });
        normalizedDeletes.forEach(function (id) { contributions.delete(id); });
        saved.push({ id: operationId, ...currentInvestmentMonth_(accountId, month, balances, contributions) });
      } catch (error) { failed.push({ id: operationId, error: errorMessage_(error) }); }
    });
    if (saved.length) {
      writeInvestmentRecords_(balanceSheet, TABLES.investmentBalances, [...balances.values()], balanceRecords.length);
      writeInvestmentRecords_(contributionSheet, TABLES.investmentContributions, [...contributions.values()], contributionRecords.length);
    }
    return { saved: saved, failed: failed };
  } finally { lock.releaseLock(); }
}

function listLegacyInvestmentSnapshots_() {
  const balances = listInvestmentBalances_();
  const contributions = listInvestmentContributions_();
  return balances.map(function (balance) {
    return { ...balance, contribution: contributions.filter(function (item) { return item.accountId === balance.accountId && item.month === balance.month; }).reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0) };
  });
}

function publicImportProfile_(record) {
  let columnMapping = {};
  try { columnMapping = JSON.parse(record.columnMappingJson || '{}'); }
  catch (error) { columnMapping = {}; }
  return {
    id: record.id, name: record.name, target: record.target,
    investmentAccountId: record.investmentAccountId || '',
    headerSignature: record.headerSignature || '[]', columnMapping: columnMapping,
    dateFormat: record.dateFormat, amountMode: record.amountMode,
    amountMultiplier: Number(record.amountMultiplier) || 1,
    active: record.active !== false, createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

function listImportProfiles_() {
  return listActiveRecords_(TABLES.importProfiles).map(publicImportProfile_);
}

function getImportProfileBundle_(id) {
  const profile = getRecordById_(TABLES.importProfiles, requireUuid_(id, 'Import profile ID'));
  if (!profile || profile.active === false) throw new Error('That import profile could not be found.');
  return {
    profile: publicImportProfile_(profile),
    vendorMappings: readRecords_(TABLES.importVendorMappings, false).filter(function (item) { return item.importProfileId === profile.id; }),
    personMappings: readRecords_(TABLES.importPersonMappings, false).filter(function (item) { return item.importProfileId === profile.id; }),
  };
}

function parseImportJson_(value, label, fallback) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value === undefined ? fallback : value);
  if (serialized.length > 50000) throw new Error(label + ' is too large.');
  try { return { value: JSON.parse(serialized), serialized: serialized }; }
  catch (error) { throw new Error(label + ' must be valid JSON.'); }
}

function normalizeImportProfile_(input, existing) {
  if (!input || typeof input !== 'object') throw new Error('An import profile is required.');
  const timestamp = new Date().toISOString();
  const target = String(input.target || '').toLowerCase();
  if (target !== 'budget' && target !== 'investment') throw new Error('Import target must be budget or investment.');
  const signature = parseImportJson_(input.headerSignature || '[]', 'Header signature', []);
  if (!Array.isArray(signature.value)) throw new Error('Header signature must be an array.');
  const mapping = parseImportJson_(input.columnMapping === undefined ? input.columnMappingJson || '{}' : input.columnMapping, 'Column mapping', {});
  if (!mapping.value || typeof mapping.value !== 'object' || Array.isArray(mapping.value)) throw new Error('Column mapping must be an object.');
  let investmentAccountId = '';
  if (target === 'investment') {
    investmentAccountId = requireUuid_(input.investmentAccountId, 'Investment account ID');
    const account = getRecordById_(TABLES.investmentAccounts, investmentAccountId);
    if (!account || account.active === false) throw new Error('Choose an active investment account.');
  }
  const dateFormats = ['YYYY-MM-DD', 'MM/DD/YYYY', 'MM/DD/YY', 'DD/MM/YYYY', 'DD/MM/YY', 'YYYY-MM'];
  const dateFormat = String(input.dateFormat || (target === 'investment' ? 'YYYY-MM' : 'YYYY-MM-DD'));
  if (dateFormats.indexOf(dateFormat) < 0) throw new Error('Choose a supported date format.');
  const amountMode = target === 'investment' ? 'monthly' : input.amountMode === 'debitCredit' ? 'debitCredit' : 'unified';
  const multiplier = Number(input.amountMultiplier);
  if (multiplier !== 1 && multiplier !== -1) throw new Error('Amount multiplier must be 1 or -1.');
  return {
    id: existing ? existing.id : requireUuid_(input.id || Utilities.getUuid(), 'Import profile ID'),
    name: requiredName_(input.name), target: target, investmentAccountId: investmentAccountId,
    headerSignature: signature.serialized, columnMappingJson: mapping.serialized,
    dateFormat: dateFormat, amountMode: amountMode, amountMultiplier: multiplier,
    active: input.active !== false, createdAt: existing ? existing.createdAt : normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
}

function assertUniqueImportProfileName_(record) {
  const name = record.name.toLowerCase();
  readRecords_(TABLES.importProfiles, true).forEach(function (item) {
    if (item.id !== record.id && item.active !== false && item.name.toLowerCase() === name) throw new Error('That import profile name already exists.');
  });
}

function createImportProfile_(input) {
  const record = normalizeImportProfile_(input, null);
  if (getRecordById_(TABLES.importProfiles, record.id)) throw new Error('That import profile ID already exists.');
  assertUniqueImportProfileName_(record);
  appendRows_(getTableSheet_(TABLES.importProfiles), [recordToRow_(TABLES.importProfiles, record)]);
  return publicImportProfile_(record);
}

function updateImportProfile_(input) {
  const sheet = getTableSheet_(TABLES.importProfiles);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error('That import profile could not be found.');
  const existing = rowToRecord_(TABLES.importProfiles, sheet.getRange(row, 1, 1, TABLES.importProfiles.headers.length).getValues()[0]);
  const record = normalizeImportProfile_({ ...publicImportProfile_(existing), ...input }, existing);
  assertUniqueImportProfileName_(record);
  sheet.getRange(row, 1, 1, TABLES.importProfiles.headers.length).setValues([recordToRow_(TABLES.importProfiles, record)]);
  return publicImportProfile_(record);
}

function archiveImportProfile_(id) {
  return publicImportProfile_(archiveRecord_(TABLES.importProfiles, id));
}

function normalizeImportDescription_(value) {
  return String(value === null || value === undefined ? '' : value).trim().toUpperCase().replace(/\s+/g, ' ');
}

function plainImportText_(value, maxLength) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (text.length > maxLength) throw new Error('An import mapping field is too long.');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function validateImportMappingInputs_(inputs, idField, references) {
  if (!Array.isArray(inputs)) throw new Error('Import mappings must be an array.');
  if (inputs.length > 500) throw new Error('A maximum of 500 mappings of each type can be saved at once.');
  const seen = new Set();
  inputs.forEach(function (input) {
    const source = plainImportText_(input && input.sourceDescription, 500);
    const normalized = normalizeImportDescription_(input && (input.normalizedSourceDescription || source));
    if (!normalized) throw new Error('A source description is required.');
    if (seen.has(normalized)) throw new Error('A source description can only appear once in a mapping batch.');
    seen.add(normalized);
    if (input && input.id) requireUuid_(input.id, 'Import mapping ID');
    const referenceId = requireUuid_(input && input[idField], idField === 'vendorId' ? 'Vendor ID' : 'Assignment ID');
    const reference = references.get(referenceId);
    if (!reference || reference.active === false) throw new Error('Choose an active ' + (idField === 'vendorId' ? 'vendor.' : 'assignment.'));
  });
}

function upsertImportMappingKind_(spec, profileId, inputs, idField, references) {
  if (!Array.isArray(inputs)) throw new Error('Import mappings must be an array.');
  if (inputs.length > 500) throw new Error('A maximum of 500 mappings of each type can be saved at once.');
  const sheet = getTableSheet_(spec);
  const records = readRecords_(spec, true);
  const byKey = new Map(records.map(function (item, index) { return [item.importProfileId + '|' + item.normalizedSourceDescription, { item: item, index: index }]; }));
  const seen = new Set();
  const timestamp = new Date().toISOString();
  inputs.forEach(function (input) {
    const sourceDescription = plainImportText_(input && input.sourceDescription, 500);
    const normalized = normalizeImportDescription_(input && (input.normalizedSourceDescription || sourceDescription));
    if (!normalized) throw new Error('A source description is required.');
    const key = profileId + '|' + normalized;
    if (seen.has(key)) throw new Error('A source description can only appear once in a mapping batch.');
    seen.add(key);
    const referenceId = requireUuid_(input && input[idField], idField === 'vendorId' ? 'Vendor ID' : 'Assignment ID');
    const reference = references.get(referenceId);
    if (!reference || reference.active === false) throw new Error('Choose an active ' + (idField === 'vendorId' ? 'vendor.' : 'assignment.'));
    const existing = byKey.get(key);
    const record = {
      id: existing ? existing.item.id : requireUuid_(input.id || Utilities.getUuid(), 'Import mapping ID'),
      importProfileId: profileId, sourceDescription: sourceDescription,
      normalizedSourceDescription: normalized, active: true,
      createdAt: existing ? existing.item.createdAt : timestamp, updatedAt: timestamp,
    };
    record[idField] = referenceId;
    if (existing) records[existing.index] = record;
    else { byKey.set(key, { item: record, index: records.length }); records.push(record); }
  });
  writeInvestmentRecords_(sheet, spec, records, Math.max(0, sheet.getLastRow() - 1));
  return records.filter(function (item) { return item.importProfileId === profileId && item.active !== false; });
}

function upsertImportMappings_(profileId, vendorInputs, personInputs) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    profileId = requireUuid_(profileId, 'Import profile ID');
    const profile = getRecordById_(TABLES.importProfiles, profileId);
    if (!profile || profile.active === false) throw new Error('That import profile could not be found.');
    const vendors = new Map(readRecords_(TABLES.vendors, true).map(function (item) { return [item.id, item]; }));
    const assignments = new Map(readRecords_(TABLES.assignments, true).map(function (item) { return [item.id, item]; }));
    validateImportMappingInputs_(vendorInputs || [], 'vendorId', vendors);
    validateImportMappingInputs_(personInputs || [], 'assignmentId', assignments);
    return {
      vendorMappings: upsertImportMappingKind_(TABLES.importVendorMappings, profileId, vendorInputs || [], 'vendorId', vendors),
      personMappings: upsertImportMappingKind_(TABLES.importPersonMappings, profileId, personInputs || [], 'assignmentId', assignments),
    };
  } finally { lock.releaseLock(); }
}

function addEntityCompatibility_(kind, input) {
  const result = addEntities_([{ kind: kind, record: input }]);
  if (result.failed.length) throw new Error(result.failed[0].error);
  if (result.saved.length) return result.saved[0].record;
  return result.reconciled[0].record;
}

function addEntities_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one entity is required.');
  if (inputs.length > 50) throw new Error('A maximum of 50 entities can be added at once.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const definitions = {
      category: { spec: TABLES.categories },
      vendor: { spec: TABLES.vendors },
      assignment: { spec: TABLES.assignments },
    };
    const involvedKinds = [...new Set(inputs.map(function (input) { return String(input && input.kind || ''); }).filter(function (kind) { return definitions[kind]; }))];
    involvedKinds.forEach(function (kind) {
      const definition = definitions[kind];
      definition.sheet = requiredSheet_(spreadsheet, definition.spec);
      definition.records = readRecordsFromSheet_(definition.sheet, definition.spec, true);
      definition.byId = new Map(definition.records.map(function (record) { return [record.id, record]; }));
      definition.byName = new Map(definition.records.filter(function (record) { return record.active !== false; }).map(function (record) {
        return [entityNameKey_(kind, record), record];
      }));
      definition.additions = [];
    });

    const saved = [], reconciled = [], failed = [];
    inputs.forEach(function (input) {
      const kind = String(input && input.kind || '');
      const requestedId = input && input.record && input.record.id ? String(input.record.id) : '';
      try {
        if (!definitions[kind]) throw new Error('Entity kind must be category, vendor, or assignment.');
        const definition = definitions[kind];
        const record = normalizeNewEntity_(kind, input.record);
        const existingId = definition.byId.get(record.id);
        if (existingId) {
          if (!entitiesMatch_(kind, existingId, record)) throw new Error('That entity ID is already used by different data.');
          saved.push({ kind: kind, record: existingId });
          return;
        }
        const existingName = definition.byName.get(entityNameKey_(kind, record));
        if (existingName) {
          reconciled.push({ kind: kind, requestedId: record.id, record: existingName });
          return;
        }
        definition.additions.push(record);
        definition.byId.set(record.id, record);
        definition.byName.set(entityNameKey_(kind, record), record);
        saved.push({ kind: kind, record: record });
      } catch (error) {
        failed.push({ kind: kind, id: requestedId, error: errorMessage_(error) });
      }
    });

    involvedKinds.forEach(function (kind) {
      const definition = definitions[kind];
      appendRows_(definition.sheet, definition.additions.map(function (record) { return recordToRow_(definition.spec, record); }));
    });
    return { saved: saved, reconciled: reconciled, failed: failed };
  } finally {
    lock.releaseLock();
  }
}

function normalizeNewEntity_(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('An entity record is required.');
  const timestamp = new Date().toISOString();
  const record = {
    id: requireUuid_(input.id || Utilities.getUuid(), 'Entity ID'),
    name: requiredName_(input.name), active: true, isDefault: false,
    createdAt: normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
  };
  if (kind === 'category') {
    const type = cleanText_(input.type, 20).toLowerCase();
    if (type !== 'income' && type !== 'expense') throw new Error('Category type must be income or expense.');
    record.type = type;
  }
  if (kind === 'vendor') delete record.isDefault;
  return record;
}

function entityNameKey_(kind, record) {
  return (kind === 'category' ? String(record.type || '') + '|' : '') + String(record.name || '').trim().toLowerCase();
}

function entitiesMatch_(kind, left, right) {
  const fields = kind === 'category'
    ? ['id', 'name', 'type', 'isDefault', 'active', 'createdAt', 'updatedAt']
    : kind === 'assignment'
      ? ['id', 'name', 'isDefault', 'active', 'createdAt', 'updatedAt']
      : ['id', 'name', 'active', 'createdAt', 'updatedAt'];
  return fields.every(function (field) { return String(left[field]) === String(right[field]); });
}

function addCategory_(input) {
  const type = cleanText_(input && input.type, 20).toLowerCase();
  if (type !== 'income' && type !== 'expense') throw new Error('Category type must be income or expense.');
  return addNamedRecord_(TABLES.categories, { ...input, type: type, isDefault: false });
}
function updateCategory_(input) {
  const existing = getRecordById_(TABLES.categories, input && input.id);
  if (!existing) throw new Error('That category could not be found.');
  if (input.type && input.type !== existing.type) throw new Error('A category type cannot be changed after creation.');
  return updateNamedRecord_(TABLES.categories, { ...input, type: existing.type, isDefault: existing.isDefault });
}

function addNamedRecord_(spec, input) {
  if (!input || typeof input !== 'object') throw new Error('An entity object is required.');
  const timestamp = new Date().toISOString();
  const record = {
    id: requireUuid_(input.id || Utilities.getUuid(), spec.name + ' ID'),
    name: requiredName_(input.name), active: true,
    createdAt: normalizeDateTime_(input.createdAt || timestamp), updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
  };
  if (spec === TABLES.categories) { record.type = input.type; record.isDefault = Boolean(input.isDefault); }
  if (spec === TABLES.assignments) record.isDefault = Boolean(input.isDefault);
  ensureUniqueIdAndName_(spec, record.id, record.name, spec === TABLES.categories ? record.type : '');
  appendRows_(getTableSheet_(spec), [recordToRow_(spec, record)]);
  return record;
}

function updateNamedRecord_(spec, input) {
  const sheet = getTableSheet_(spec);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error('That ' + spec.name.toLowerCase().replace(/s$/, '') + ' could not be found.');
  const existing = rowToRecord_(spec, sheet.getRange(row, 1, 1, spec.headers.length).getValues()[0]);
  const name = requiredName_(input.name);
  const record = { ...existing, ...input, id: existing.id, name: name, active: input.active !== false, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
  ensureUniqueIdAndName_(spec, record.id, record.name, spec === TABLES.categories ? record.type : '', record.id);
  sheet.getRange(row, 1, 1, spec.headers.length).setValues([recordToRow_(spec, record)]);
  let warning = '';
  if (existing.name !== record.name) {
    const ledgerColumns = spec === TABLES.categories ? [10, 3] : spec === TABLES.vendors ? [11, 4] : [12, 5];
    warning = safeSyncLedgerName_(ledgerColumns[0], ledgerColumns[1], record.id, record.name);
  }
  return { data: record, warning: warning };
}

function archiveRecord_(spec, id) {
  const sheet = getTableSheet_(spec), row = findRowById_(sheet, id);
  if (!row) throw new Error('That record could not be found.');
  const record = rowToRecord_(spec, sheet.getRange(row, 1, 1, spec.headers.length).getValues()[0]);
  if (record.isDefault) throw new Error('Default records cannot be archived.');
  record.active = false; record.updatedAt = new Date().toISOString();
  sheet.getRange(row, 1, 1, spec.headers.length).setValues([recordToRow_(spec, record)]);
  return record;
}

function listActiveRecords_(spec) { return readRecords_(spec, false); }
function readRecords_(spec, includeInactive) {
  return readRecordsFromSheet_(getTableSheet_(spec), spec, includeInactive);
}
function readRecordsFromSheet_(sheet, spec, includeInactive) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, spec.headers.length).getValues()
    .filter(function (row) { return row[0] !== ''; })
    .map(function (row) { return rowToRecord_(spec, row); })
    .filter(function (record) { return includeInactive || record.active !== false; });
}
function getRecordById_(spec, id) { return readRecords_(spec, true).find(function (item) { return item.id === id; }); }

function ensureUniqueIdAndName_(spec, id, name, type, excludeId) {
  const lowerName = name.toLowerCase();
  readRecords_(spec, true).forEach(function (item) {
    if (item.id === excludeId) return;
    if (item.id === id) throw new Error('That ID already exists.');
    const sameType = spec !== TABLES.categories || item.type === type;
    if (item.active !== false && sameType && String(item.name || fullUserName_(item)).toLowerCase() === lowerName) throw new Error('That name already exists.');
  });
}

function rebuildLedger() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return rebuildLedger_(); } finally { lock.releaseLock(); }
}
function rebuildLedger_() {
  const ledger = getLedgerSheet_(), transactions = listTransactions_();
  if (ledger.getLastRow() > 1) ledger.getRange(2, 1, ledger.getLastRow() - 1, TABLES.ledger.headers.length).clearContent();
  appendRows_(ledger, transactions.map(ledgerRow_));
  configureLedger_(ledger);
  PropertiesService.getScriptProperties().deleteProperty(APP.ledgerDirtyProperty);
  SpreadsheetApp.flush();
  return { rows: transactions.length, status: 'rebuilt' };
}
function appendLedgerRow_(transaction) {
  const ledger = getLedgerSheet_(); appendRows_(ledger, [ledgerRow_(transaction)]); configureLedger_(ledger);
}
function ledgerRow_(transaction) {
  return [transaction.date, transaction.type, transaction.category, transaction.vendor, transaction.assignment, transaction.createdByName, transaction.notes, transaction.amount, transaction.id, transaction.categoryId, transaction.vendorId, transaction.assignmentId, transaction.createdBy, transaction.createdAt];
}
function safeSyncLedgerName_(idColumn, displayColumn, id, name) {
  try {
    const count = syncLedgerName_(idColumn, displayColumn, id, name);
    return count ? '' : '';
  } catch (error) {
    markLedgerDirty_();
    return 'The record was updated, but the Ledger needs to be rebuilt: ' + errorMessage_(error);
  }
}
function syncLedgerName_(idColumn, displayColumn, id, name) {
  const sheet = getLedgerSheet_(), lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
  const names = sheet.getRange(2, displayColumn, lastRow - 1, 1).getValues();
  let changed = 0;
  ids.forEach(function (row, index) { if (row[0] === id) { names[index][0] = name; changed += 1; } });
  if (changed) sheet.getRange(2, displayColumn, lastRow - 1, 1).setValues(names);
  return changed;
}
function markLedgerDirty_() { PropertiesService.getScriptProperties().setProperty(APP.ledgerDirtyProperty, new Date().toISOString()); }
function isLedgerDirty_() { return Boolean(PropertiesService.getScriptProperties().getProperty(APP.ledgerDirtyProperty)); }

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP.spreadsheetIdProperty);
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('No spreadsheet is configured. Set the SPREADSHEET_ID script property.');
  return spreadsheet;
}
function getTableSheet_(spec) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(spec.name);
  if (!sheet) sheet = spreadsheet.insertSheet(spec.name);
  if (spec === TABLES.users) migrateLegacyUserHeaders_(sheet);
  if (spec === TABLES.investmentAccounts) migrateLegacyInvestmentHeaders_(sheet, spec);
  ensureSheetHeaders_(sheet, spec.headers, spec.name);
  sheet.setFrozenRows(1);
  return sheet;
}
function migrateLegacyInvestmentHeaders_(sheet, spec) {
  const accountHeaders = ['ID', 'Name', 'Institution', 'Account Type', 'Assignment ID', 'Active', 'Created At', 'Updated At'];
  let oldHeaders = accountHeaders;
  const accountCurrent = sheet.getRange(1, 1, 1, accountHeaders.length).getValues()[0];
  if (!headersMatch_(accountCurrent, accountHeaders)) oldHeaders = null;
  if (!oldHeaders) return;
  const lastRow = sheet.getLastRow();
  const oldRows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, oldHeaders.length).getValues();
  sheet.getRange(1, 1, Math.max(lastRow, 1), oldHeaders.length).clearContent();
  sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
  if (!oldRows.length) return;
  const migrated = oldRows.filter(function (row) { return row[0] !== ''; }).map(function (row) {
    return [row[0], row[1], 'manual', row[5] === '' ? true : row[5], row[6], row[7]];
  });
  sheet.getRange(2, 1, migrated.length, spec.headers.length).setValues(migrated);
}

function derivedInvestmentContributionId_(snapshotId) {
  const compact = requireUuid_(snapshotId, 'Investment snapshot ID').replace(/-/g, '').split('');
  compact[0] = ((parseInt(compact[0], 16) + 1) % 16).toString(16);
  compact[12] = '4'; compact[16] = '8';
  return compact.slice(0, 8).join('') + '-' + compact.slice(8, 12).join('') + '-' + compact.slice(12, 16).join('') + '-' + compact.slice(16, 20).join('') + '-' + compact.slice(20).join('');
}

function migrateInvestmentModelV6_() {
  const spreadsheet = getSpreadsheet_();
  const legacy = spreadsheet.getSheetByName('InvestmentSnapshots');
  let balanceSheet = spreadsheet.getSheetByName(TABLES.investmentBalances.name);
  let contributionSheet = spreadsheet.getSheetByName(TABLES.investmentContributions.name);
  if (!balanceSheet) balanceSheet = spreadsheet.insertSheet(TABLES.investmentBalances.name);
  if (!contributionSheet) contributionSheet = spreadsheet.insertSheet(TABLES.investmentContributions.name);
  ensureSheetHeaders_(balanceSheet, TABLES.investmentBalances.headers, TABLES.investmentBalances.name);
  ensureSheetHeaders_(contributionSheet, TABLES.investmentContributions.headers, TABLES.investmentContributions.name);
  if (!legacy || legacy.getLastRow() < 1) return;

  const originalHeaders = ['ID', 'Account ID', 'Month', 'Balance Date', 'Balance', 'Employee Payroll', 'Employer Match', 'Manual Deposits', 'Withdrawals', 'Notes', 'Created At', 'Created By', 'Updated At', 'Updated By'];
  const datedHeaders = ['ID', 'Account ID', 'Month', 'Balance Date', 'Balance', 'Contribution', 'Notes', 'Created At', 'Created By', 'Updated At', 'Updated By'];
  const monthlyHeaders = ['ID', 'Account ID', 'Month', 'Balance', 'Contribution', 'Notes', 'Created At', 'Created By', 'Updated At', 'Updated By'];
  const originalCurrent = legacy.getRange(1, 1, 1, originalHeaders.length).getValues()[0];
  const datedCurrent = legacy.getRange(1, 1, 1, datedHeaders.length).getValues()[0];
  const monthlyCurrent = legacy.getRange(1, 1, 1, monthlyHeaders.length).getValues()[0];
  const headers = headersMatch_(originalCurrent, originalHeaders) ? originalHeaders
    : headersMatch_(datedCurrent, datedHeaders) ? datedHeaders
      : headersMatch_(monthlyCurrent, monthlyHeaders) ? monthlyHeaders : null;
  if (!headers) return;
  const rows = legacy.getLastRow() < 2 ? [] : legacy.getRange(2, 1, legacy.getLastRow() - 1, headers.length).getValues();
  const balances = new Map(readRecordsFromSheet_(balanceSheet, TABLES.investmentBalances, true).map(function (item) { return [item.id, item]; }));
  const contributions = new Map(readRecordsFromSheet_(contributionSheet, TABLES.investmentContributions, true).map(function (item) { return [item.id, item]; }));
  rows.filter(function (row) { return row[0] !== ''; }).forEach(function (row) {
    const original = headers === originalHeaders;
    const dated = headers === datedHeaders;
    const balance = Number(row[original || dated ? 4 : 3] || 0);
    const amount = original
      ? Number(row[5] || 0) + Number(row[6] || 0) + Number(row[7] || 0) - Number(row[8] || 0)
      : Number(row[dated ? 5 : 4] || 0);
    const notesIndex = original ? 9 : dated ? 6 : 5;
    const metadataIndex = original ? 10 : dated ? 7 : 6;
    balances.set(row[0], {
      id: row[0], accountId: row[1], month: row[2], balance: balance, notes: row[notesIndex] || '',
      createdAt: row[metadataIndex], createdBy: row[metadataIndex + 1], updatedAt: row[metadataIndex + 2], updatedBy: row[metadataIndex + 3],
    });
    if (amount !== 0) {
      const id = derivedInvestmentContributionId_(row[0]);
      contributions.set(id, {
        id: id, accountId: row[1], month: row[2], amount: amount,
        createdAt: row[metadataIndex], createdBy: row[metadataIndex + 1], updatedAt: row[metadataIndex + 2], updatedBy: row[metadataIndex + 3],
      });
    }
  });
  writeInvestmentRecords_(balanceSheet, TABLES.investmentBalances, [...balances.values()], Math.max(0, balanceSheet.getLastRow() - 1));
  writeInvestmentRecords_(contributionSheet, TABLES.investmentContributions, [...contributions.values()], Math.max(0, contributionSheet.getLastRow() - 1));
  const archiveName = 'InvestmentSnapshots_Legacy_v5';
  if (!spreadsheet.getSheetByName(archiveName) && typeof legacy.setName === 'function') legacy.setName(archiveName);
  if (typeof legacy.hideSheet === 'function') legacy.hideSheet();
}
function migrateLegacyUserHeaders_(sheet) {
  const oldHeaders = ['ID', 'First Name', 'Last Name', 'Created At', 'Updated At'];
  const current = sheet.getRange(1, 1, 1, TABLES.users.headers.length).getValues()[0];
  if (!headersMatch_(current, oldHeaders)) return;
  const lastRow = sheet.getLastRow();
  const oldRows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, oldHeaders.length).getValues();
  sheet.getRange(1, 1, Math.max(lastRow, 1), TABLES.users.headers.length).clearContent();
  sheet.getRange(1, 1, 1, TABLES.users.headers.length).setValues([TABLES.users.headers]);
  if (oldRows.length) {
    sheet.getRange(2, 1, oldRows.length, TABLES.users.headers.length).setValues(oldRows.map(function (row) {
      return [row[0], row[1], row[2], true, row[3], row[4]];
    }));
  }
}
function getTransactionSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TABLES.transactions.name);
  if (!sheet) sheet = spreadsheet.insertSheet(TABLES.transactions.name);
  const existing = sheet.getRange(1, 1, 1, TABLES.transactions.headers.length).getValues()[0];
  if (headersMatch_(existing, LEGACY_TRANSACTION_HEADERS)) migrateLegacyTransactions_(sheet);
  ensureSheetHeaders_(sheet, TABLES.transactions.headers, TABLES.transactions.name);
  sheet.setFrozenRows(1); sheet.getRange('E:E').setNumberFormat('$#,##0.00');
  return sheet;
}
function getLedgerSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TABLES.ledger.name);
  if (!sheet) sheet = spreadsheet.insertSheet(TABLES.ledger.name);
  ensureSheetHeaders_(sheet, TABLES.ledger.headers, TABLES.ledger.name);
  configureLedger_(sheet); return sheet;
}
function configureLedger_(sheet) {
  sheet.setFrozenRows(1); sheet.getRange('H:H').setNumberFormat('$#,##0.00');
  sheet.hideColumns(9, 6);
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), TABLES.ledger.headers.length).createFilter();
}

function migrateLegacyTransactions_(sheet) {
  const lastRow = sheet.getLastRow();
  const rows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, LEGACY_TRANSACTION_HEADERS.length).getValues();
  const migrated = rows.filter(function (row) { return row[0] !== ''; }).map(function (row) {
    const legacy = {}; LEGACY_TRANSACTION_HEADERS.forEach(function (header, index) { legacy[header] = row[index]; });
    const type = String(legacy.Type).toLowerCase() === 'income' ? 'income' : 'expense';
    const category = type === 'income' ? getRecordById_(TABLES.categories, APP.incomeCategoryId) : findOrCreateNamed_(TABLES.categories, legacy.Category || 'Other', { type: 'expense', isDefault: false });
    const vendor = type === 'income' ? null : findOrCreateNamed_(TABLES.vendors, legacy.Vendor || 'Unknown', {});
    const assignment = findOrCreateNamed_(TABLES.assignments, legacy.Assignment || 'Shared', {});
    return recordToRow_(TABLES.transactions, {
      id: isUuid_(legacy.ID) ? String(legacy.ID) : Utilities.getUuid(),
      createdAt: normalizeDateTime_(legacy['Created At']), createdBy: String(legacy['Created By'] || ''),
      type: type, amount: Number(legacy.Amount) || 0, date: serializeCell_(legacy.Date, 'date'),
      categoryId: category.id, vendorId: vendor ? vendor.id : '', assignmentId: assignment.id, notes: String(legacy.Notes || ''),
    });
  });
  sheet.getRange(1, 1, Math.max(lastRow, 1), Math.max(LEGACY_TRANSACTION_HEADERS.length, TABLES.transactions.headers.length)).clearContent();
  sheet.getRange(1, 1, 1, TABLES.transactions.headers.length).setValues([TABLES.transactions.headers]);
  appendRows_(sheet, migrated);
}
function findOrCreateNamed_(spec, name, extras) {
  const text = String(name || '').trim();
  const existing = readRecords_(spec, true).find(function (item) { return item.name.toLowerCase() === text.toLowerCase() && (!extras.type || item.type === extras.type); });
  return existing || addNamedRecord_(spec, { name: text, ...extras });
}

function ensureSheetHeaders_(sheet, headers, label) {
  const range = sheet.getRange(1, 1, 1, headers.length), current = range.getValues()[0];
  const hasAny = current.some(function (value) { return value !== ''; });
  if (!hasAny) { range.setValues([headers]); return; }
  if (headersMatch_(current, headers)) return;
  const prefixMatches = headers.every(function (header, index) { return current[index] === header || current[index] === ''; });
  if (prefixMatches) {
    range.setValues([headers]);
    const activeIndex = headers.indexOf('Active');
    if (activeIndex >= 0 && sheet.getLastRow() > 1) {
      const activeRange = sheet.getRange(2, activeIndex + 1, sheet.getLastRow() - 1, 1);
      const values = activeRange.getValues().map(function (row) { return [row[0] === '' ? true : row[0]]; });
      activeRange.setValues(values);
    }
    return;
  }
  throw new Error('The ' + label + ' sheet headers do not match the expected schema.');
}
function headersMatch_(actual, expected) { return expected.every(function (header, index) { return actual[index] === header; }); }

function rowToRecord_(spec, row) {
  const record = {};
  spec.fields.forEach(function (field, index) { record[field] = serializeCell_(row[index], field); });
  ['active', 'isDefault'].forEach(function (field) { if (field in record) record[field] = record[field] === true || String(record[field]).toLowerCase() === 'true'; });
  if ('amount' in record) record.amount = Number(record.amount) || 0;
  ['balance', 'contribution'].forEach(function (field) {
    if (field in record) record[field] = Number(record[field]) || 0;
  });
  return record;
}
function recordToRow_(spec, record) { return spec.fields.map(function (field) { return record[field] === undefined || record[field] === null ? '' : record[field]; }); }
function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}
function findRowById_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const index = ids.findIndex(function (row) { return row[0] === id; });
  return index < 0 ? 0 : index + 2;
}

function parsePostBody_(e) {
  const contents = e && e.postData && e.postData.contents;
  if (!contents) throw new Error('The request body is empty.');
  try { return JSON.parse(contents); } catch (error) { throw new Error('The request body is not valid JSON.'); }
}
function serializeCell_(value, field) {
  if (field === 'amount') return value === '' ? 0 : Number(value);
  if (value instanceof Date) {
    const format = field === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX";
    return Utilities.formatDate(value, Session.getScriptTimeZone(), format);
  }
  return value === null || value === undefined ? '' : String(value);
}
function normalizeDateTime_(value) {
  const text = cleanText_(value, 50), parsed = text ? new Date(text) : new Date();
  if (isNaN(parsed.getTime())) throw new Error('A timestamp is invalid.');
  return parsed.toISOString();
}
function isValidISODate_(value) {
  const parts = value.split('-').map(Number), date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}
function requiredName_(value) { const name = cleanText_(value, 150); if (!name) throw new Error('A name is required.'); return name; }
function requireUuid_(value, label) { const id = cleanText_(value, 100).toLowerCase(); if (!isUuid_(id)) throw new Error(label + ' must be a valid UUID.'); return id; }
function isUuid_(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function cleanText_(value, maxLength) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (text.length > maxLength) throw new Error('A field is too long.');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
function errorMessage_(error) { return error && error.message ? error.message : String(error || 'Unexpected server error.'); }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
