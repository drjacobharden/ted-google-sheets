// Spreadsheet properties that can be called through the property services
export const APP = {
  spreadsheetIdProperty: "SPREADSHEET_ID",
  setupVersionProperty: "SETUP_VERSION",
  setupVersion: "7",
  apiVersion: 11,
  ledgerDirtyProperty: "LEDGER_DIRTY",
  incomeCategoryId: "00000000-0000-4000-8000-000000000001",
  sharedAssignmentId: "00000000-0000-4000-8000-000000000101",
  cacheKey: "TED_DATA_MASTER",
};

// Current table schema
export const TABLES = {
  transactions: {
    name: "Transactions",
    headers: [
      "ID",
      "Created At",
      "Created By",
      "Type",
      "Amount",
      "Date",
      "Category ID",
      "Vendor ID",
      "Assignment ID",
      "Notes",
    ],
    fields: [
      "id",
      "createdAt",
      "createdBy",
      "type",
      "amount",
      "date",
      "categoryId",
      "vendorId",
      "assignmentId",
      "notes",
    ],
  },
  categories: {
    name: "Categories",
    headers: [
      "ID",
      "Name",
      "Type",
      "Is Default",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "name",
      "type",
      "isDefault",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  vendors: {
    name: "Vendors",
    headers: ["ID", "Name", "Active", "Created At", "Updated At"],
    fields: ["id", "name", "active", "createdAt", "updatedAt"],
  },
  assignments: {
    name: "Assignments",
    headers: ["ID", "Name", "Is Default", "Active", "Created At", "Updated At"],
    fields: ["id", "name", "isDefault", "active", "createdAt", "updatedAt"],
  },
  users: {
    name: "Users",
    headers: [
      "ID",
      "First Name",
      "Last Name",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: ["id", "firstName", "lastName", "active", "createdAt", "updatedAt"],
  },
  investmentAccounts: {
    name: "InvestmentAccounts",
    headers: ["ID", "Name", "Source", "Active", "Created At", "Updated At"],
    fields: ["id", "name", "source", "active", "createdAt", "updatedAt"],
  },
  investmentBalances: {
    name: "InvestmentBalances",
    headers: [
      "ID",
      "Account ID",
      "Month",
      "Ending Balance",
      "Notes",
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
    ],
    fields: [
      "id",
      "accountId",
      "month",
      "balance",
      "notes",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
    ],
  },
  investmentContributions: {
    name: "InvestmentContributions",
    headers: [
      "ID",
      "Account ID",
      "Month",
      "Amount",
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
    ],
    fields: [
      "id",
      "accountId",
      "month",
      "amount",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
    ],
  },
  importProfiles: {
    name: "ImportProfiles",
    headers: [
      "ID",
      "Name",
      "Target",
      "Investment Account ID",
      "Header Signature",
      "Column Mapping JSON",
      "Date Format",
      "Amount Mode",
      "Amount Multiplier",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "name",
      "target",
      "investmentAccountId",
      "headerSignature",
      "columnMappingJson",
      "dateFormat",
      "amountMode",
      "amountMultiplier",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  importVendorMappings: {
    name: "ImportVendorMappings",
    headers: [
      "ID",
      "Import Profile ID",
      "Source Description",
      "Normalized Source Description",
      "Vendor ID",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "importProfileId",
      "sourceDescription",
      "normalizedSourceDescription",
      "vendorId",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  importPersonMappings: {
    name: "ImportPersonMappings",
    headers: [
      "ID",
      "Import Profile ID",
      "Source Description",
      "Normalized Source Description",
      "Assignment ID",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "importProfileId",
      "sourceDescription",
      "normalizedSourceDescription",
      "assignmentId",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  ledger: {
    name: "Ledger",
    headers: [
      "Date",
      "Type",
      "Category",
      "Vendor",
      "Assignment",
      "Created By",
      "Notes",
      "Amount",
      "Transaction ID",
      "Category ID",
      "Vendor ID",
      "Assignment ID",
      "Created By ID",
      "Created At",
    ],
  },
};

// List of tables to look for during bootstrap
export const TABLE_NAMES = [
  "Users",
  "Categories",
  "Vendors",
  "Transactions",
  "Assignments",
];

// Retrieve the id of the spreadsheet attached to the script
export const getSpreadSheetId = () => {
  const id = PropertiesService.getScriptProperties().getProperty(
    APP.spreadsheetIdProperty,
  );

  if (!id)
    throw new Error(
      "No spreadsheet is configured. Set the SPREADSHEET_ID script property.",
    );

  return id;
};

// Retrieves the requested spreadsheet by its id
export const openSpreadsheet = () => {
  const id = getSpreadSheetId();
  const spreadsheet = SpreadsheetApp.openById(id);

  if (!spreadsheet)
    throw new Error(
      "No spreadsheet is configured. Set the SPREADSHEET_ID script property.",
    );

  return { spreadsheet, id };
};
