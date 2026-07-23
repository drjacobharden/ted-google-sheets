# Track Every Dollar

Track Every Dollar (or TED for short) provides a front end wrapper around Google Sheets for budgeting and financial management.

Spreadsheets have long been the go to choice for people tracking their finances, but data entry can be cumbersome for those not used to working with the format. TED removes the need for understanding sheets and formulas and instead provides you with a simple interface to see everything you need.

V1 of the app is currently split into two main features...Budgeting and Investments.

### Budgeting

At the core of tracking every dollar is logging every transaction you make.

You will track how much you paid, who you paid, and what category it falls into. This will then let you see exactly where your money is going. And in a future release, we will allow you to set targets for categories and vendors so that you can adjust your spending habits with accountability.

### Investments

Every investment account you have can be added. You will track your total contributions to each account and the balance at the end of the month. This will let you see your growth and rate of return over time.

Future releases will let you set investment targets and calculate how much time is left until you can retire based on your current balance.

## Starting a new spreadsheet

If you are starting a new spreadsheet from scratch, you will need to go through the following steps.

1. When you first open the app, you will be presented with an onboarding screen. Select the option to "Start a new budget".

<table>
    <tr>
        <td width="50%"><img src="images/onboarding-1.png" alt="Onboarding welcome"></td>
    </tr>
</table>

2. This will bring you into the onboarding process for a new spreadsheet. The first step here is to make a copy of the spreadsheet template. The spreadsheet will be where all your data is stored. And because it is on Google Sheets, you can inspect it at any time.\

   Hit the button to "Open the spreadsheet template".\

   This will take you to a screen asking if you would like to copy the document and the App Script file associated with it. The App Script is what connects TED to the spreadsheet.\

   Click "Make a copy" to move forward.

<table>
    <tr>
        <td width="50%"><img src="images/onboarding-2.png" alt="Onboarding copy spreadsheet screen"></td>
        <td width="50%"><img src="images/google-copy.png" alt="Onboarding copy spreadsheet screen"></td>
    </tr>
</table>

<img src="images/onboarding-2.png" alt="Onboarding copy spreadsheet screen" width="400">

## CSV imports

Open **Import** from the Budgeting navigation to upload a CSV, select or create a reusable profile, map its columns, and review staged rows. Budget mapping can optionally reuse source Vendor, Category, and Person names, staging any missing records for the final commit. Exact saved profile matches jump directly to review. Investment imports map one ending balance plus any number of contribution/withdrawal columns into the existing monthly account model.

CSV files are parsed entirely in the browser and staging is discarded on refresh. Profiles, mappings, new reference records, and rows remain in memory until **Commit import**. The progress view creates dependencies in order, queues records through the existing local-first Sync workflow, and reports completion only after every selected row is confirmed in Google Sheets. Writes remain limited to batches of 50.

After updating an existing Google Sheet backend, replace both Apps Script source files, run **Track Every Dollar → Set up budget** once to create `ImportProfiles`, `ImportVendorMappings`, and `ImportPersonMappings`, then publish a new web-app deployment version. Existing normalized data is preserved.
