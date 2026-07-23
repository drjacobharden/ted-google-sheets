# Google Sheets backend

`Code.gs` implements the normalized Google Sheets backend. The normalized tabs
are the source of truth; `Ledger` is a rebuildable, human-readable view made of
plain values rather than formulas.

## Sheets created during initialization

- `Transactions`: UUIDs and foreign keys only.
- `Categories`: income and expense categories, including the seeded `Income` category.
- `Vendors`: canonical vendor records.
- `Assignments`: household assignments, including the seeded `Shared` record.
- `Users`: app users referenced by each transaction's `createdBy` UUID.
- `InvestmentAccounts`: UUID-backed accounts with a `paycheck` or `manual` contribution source.
- `ImportProfiles`: reusable budget or investment CSV header and column mappings.
- `ImportVendorMappings`: exact, profile-specific source-description to Vendor UUID mappings.
- `ImportPersonMappings`: exact, profile-specific source-description to Assignment UUID mappings.
- `InvestmentBalances`: one ending balance per account and reporting month.
- `InvestmentContributions`: itemized signed investment flows; contributions are positive and withdrawals are negative.
- `Ledger`: resolved names, native filters, and hidden ID columns.

Default records cannot be archived. Other referenced records are archived
instead of deleted, so historical transactions always remain resolvable.

## One-time template-author workflow

This source-code step is performed only by the person creating the reusable
template. Recipients do not paste or edit Apps Script source.

1. Create a blank Google Sheet and choose **Extensions → Apps Script**.
2. Add this folder's `Code.gs` and `Setup.gs` to the bound Apps Script
   project. Copy the settings from `appsscript.json` into the project manifest.
   The manifest enables the Advanced Sheets v4 service used to batch the
   initial data read. If the project uses a standard Google Cloud project,
   enable the Google Sheets API there as well.
3. Save the project and reload the Sheet.
4. Verify that **My Finance → Set up budget** initializes the Sheet and displays
   a completion message. Remove any sample financial data before distribution.
5. Share a forced-copy link by replacing the Sheet URL's trailing `/edit...`
   with `/copy`. Google includes the bound script when a recipient copies the
   container-bound Sheet.

Each copied Sheet must be initialized from its own **My Finance** menu and must
receive its own web-app deployment.

## Recipient workflow

1. Open the template's `/copy` link and choose **Make a copy**.
2. Reload the new Sheet if the **My Finance** menu is not visible yet.
3. Choose **My Finance → Set up budget** and approve Google's authorization
   prompt. The menu action binds the script to this copied Sheet, creates and
   seeds the normalized tabs, migrates compatible legacy data, rebuilds the
   Ledger, and displays a completion message. It is safe to run again.
4. Choose **Extensions → Apps Script → Deploy → New deployment → Web app**.
   Execute as the deploying user and choose **Anyone** to allow anonymous
   access, then deploy.
5. Copy Google's complete production **Web app URL** ending in `/exec`.
6. Optionally verify it in a private browser window by adding `?action=health`;
   it should return JSON with `"status":"ok"`.
7. Open the budget app. In first-run onboarding, choose **Start a new budget**,
   paste the URL at the connection step, and create the first user profile.
8. Open the Sheet's `Users` tab, confirm the profile appears, and finish setup.

The web app URL acts as a secret because possession of it grants API access.
Keep it private. If it is exposed, replace the deployment and update the app.

If the custom menu does not appear after reloading the Sheet, open **Extensions
→ Apps Script**, choose `setupBudget` from the function selector, and select
**Run**. This fallback performs the same initialization and authorization.

## Additional household computers

Only the household owner performs the template-copy, initialization, and
deployment steps. To connect another computer:

1. On the owner's computer, open the budget app's Settings and choose
   **Copy connection URL**.
2. Send that URL privately to the household member. Possession of the URL grants
   access to the budget API.
3. On the other computer, open the budget app and choose
   **Join an existing budget**.
4. Paste and test the URL, then select an existing Sheet profile or create a new
   first- and last-name profile.
5. Confirm the selected profile appears on the Sheet's `Users` tab and finish.

Each computer stores its active-profile selection locally, so household members
can use different profiles with the same deployment. Sharing the Google Sheet
itself is optional and separate from sharing the connection URL.

## Maintenance and development

Use **My Finance → Rebuild Ledger** to regenerate the presentation sheet from
normalized data. The menu refuses to rebuild an uninitialized copy. Entity and
transaction data in the normalized sheets remain authoritative.

`setup()` remains available for development and backward compatibility. In a
bound project it initializes the active Sheet just like `setupBudget`. For a
standalone script, set the `SPREADSHEET_ID` script property to the Sheet ID
before running it.

After changing `Code.gs`, edit the existing deployment and publish a new
version; its `/exec` URL remains unchanged. Run
**My Finance → Rebuild Ledger** whenever the Ledger reports that it needs
repair.

## Web actions

- Transactions: `listTransactions`, `addTransactions`, `addTransaction`, `updateTransactions`, `updateTransaction`
- Users: `listUsers`, `addUser`, `updateUser`
- Entities: `addEntities` for mixed category, vendor, and assignment batches
- Categories: `listCategories`, `addCategory`, `updateCategory`, `archiveCategory`
- Vendors: `listVendors`, `addVendor`, `updateVendor`, `archiveVendor`
- Assignments: `listAssignments`, `addAssignment`, `updateAssignment`, `archiveAssignment`
- Investments: `listInvestmentAccounts`, `addInvestmentAccounts`, `updateInvestmentAccount`, `archiveInvestmentAccount`, `listInvestmentBalances`, `listInvestmentContributions`, `saveInvestmentMonths`
- Imports: `listImportProfiles`, `getImportProfileBundle`, `createImportProfile`, `updateImportProfile`, `archiveImportProfile`, `upsertImportMappings`
- Maintenance: `health`, `rebuildLedger`

POST bodies use `{ "action": "...", ... }`. Transaction responses contain
both normalized IDs and hydrated current names. Entity renames batch-update the
corresponding Ledger display column in one write.

`addTransactions` accepts up to 50 normalized records, returns per-record
`saved` and `failed` arrays, and treats an exact UUID retry as successful.
`addTransaction` remains available for older app versions. The local app keeps
new entries in a durable outbox so the form is immediately ready for the next
transaction while Google Sheets synchronization continues in the background.

`updateTransactions` accepts up to 50 `{ transaction, base }` updates. It
preserves the original UUID, creator, and creation timestamp, detects changes
made from another computer by comparing the base values, and updates both the
normalized transaction and materialized Ledger. The local outbox stores
optimistic edits with revision tokens so a slower response cannot overwrite a
newer local change.

`addEntities` accepts up to 50 mixed entity records and returns `saved`,
`reconciled`, and `failed` results. The app displays new categories, vendors,
and assignments immediately, then synchronizes them before any transaction
that references their UUID. Same-name conflicts use the canonical Sheet UUID
and remap dependent queued transactions automatically.

`saveInvestmentMonths` accepts up to 50 account/month operations. Each operation
contains one ending balance plus contribution upserts and permanent deletes.
Conflicts are detected per balance or flow record, so a contribution independently
added from another computer is retained. The drawer accepts positive values in
separate Contribution and Withdrawal sections; withdrawals are stored as negative
amounts for net-flow and contribution-adjusted growth calculations.

After upgrading an existing template, save both Apps Script files and run
**My Finance → Set up budget** once. Setup version 6 creates the balance and
contribution tabs and migrates every prior investment snapshot layout. Each old
aggregate becomes one signed flow record, while zero aggregates create no flow.
The old snapshot tab is retained as a hidden legacy archive after migration.
Review account sources afterward, then publish a new version of the existing
web-app deployment. API version 8 rejects legacy aggregate writes to protect the
new itemized contribution history.
