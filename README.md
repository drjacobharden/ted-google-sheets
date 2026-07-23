# google-sheets-budget-wrapper

## CSV imports

Open **Import** from the Budgeting navigation to upload a CSV, select or create a reusable profile, map its columns, and review staged rows. Budget mapping can optionally reuse source Vendor, Category, and Person names, staging any missing records for the final commit. Exact saved profile matches jump directly to review. Investment imports map one ending balance plus any number of contribution/withdrawal columns into the existing monthly account model.

CSV files are parsed entirely in the browser and staging is discarded on refresh. Profiles, mappings, new reference records, and rows remain in memory until **Commit import**. The progress view creates dependencies in order, queues records through the existing local-first Sync workflow, and reports completion only after every selected row is confirmed in Google Sheets. Writes remain limited to batches of 50.

After updating an existing Google Sheet backend, replace both Apps Script source files, run **My Finance → Set up budget** once to create `ImportProfiles`, `ImportVendorMappings`, and `ImportPersonMappings`, then publish a new web-app deployment version. Existing normalized data is preserved.
