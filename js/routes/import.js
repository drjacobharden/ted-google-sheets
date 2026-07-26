(function () {
  const { escapeHTML, money } = window.AppUtils;
  let cleanup = null;
  const PAGE_SIZE = 50;

  function mount(root) {
    const state = {
      parsed: null,
      profiles: [],
      profile: null,
      bundle: { vendorMappings: [], personMappings: [] },
      rows: [],
      pendingVendors: new Map(),
      pendingPeople: new Map(),
      filter: "all",
      target: "budget",
      mappingWizard: null,
      draftEntities: {
        vendor: new Map(),
        category: new Map(),
        assignment: new Map(),
      },
      resolvedCategoryMatches: new Set(),
      expandedInvestmentMonths: new Set(),
      commit: null,
      visibleLimit: PAGE_SIZE,
    };
    root.innerHTML = `
      <header class="import-heading"><div><p class="eyebrow">Google Sheets</p><h1>Import CSV data</h1><p>Map a recurring CSV format, review every row, then commit the ready records together.</p></div><button class="secondary-button" type="button" data-import-action="clear">Clear import</button></header>
      <section class="import-card"><h2>1. Upload CSV</h2><p>Files stay in this browser while you review them.</p><label class="import-field"><span>CSV file</span><input id="import-file" type="file" accept=".csv,text/csv" /></label><p class="import-message" id="import-file-message" role="status"></p><div class="import-preview" id="import-source-preview"></div></section>
      <section class="import-card import-step" id="import-profile-step" hidden><h2>2. Choose a mapping profile</h2><p>Header matches are suggested, but are not applied until you confirm.</p>
        <form id="import-profile-form"><div class="import-grid">
          <label class="import-field wide"><span>Saved profile</span><select name="profileId"><option value="">Create a new profile</option></select></label>
          <label class="import-field"><span>Target</span><select name="target"><option value="budget">Budget transactions</option><option value="investment">Investment months</option></select></label>
          <label class="import-field"><span>Profile name</span><input name="name" maxlength="150" required /></label>
          <label class="import-field wide" data-investment-account-field hidden><span>Investment account</span><select name="investmentAccountId"></select></label>
        </div><div class="import-actions"><button class="primary-button" type="submit">Continue</button><button class="secondary-button" type="button" data-import-action="archive-profile" hidden>Archive profile</button></div></form>
        <p class="import-message" id="import-profile-message" role="status"></p>
      </section>
      <section class="import-card import-step" id="import-mapping-step" hidden><h2>3. Map CSV columns</h2><p>Choose source columns and parsing rules, then verify the preview.</p><form id="import-mapping-form"></form><p class="import-message" id="import-mapping-message" role="status"></p></section>
      <section class="import-card import-step" id="import-review-step" hidden>
        <h2>4. Review staged rows</h2>
        <p>Nothing is saved until you commit the import. Source descriptions are read-only; internal references and imported values remain editable.</p>
        <div id="import-summary"></div>
        <div class="import-filter-row" id="import-filters"></div>
        <div class="import-review-wrap" id="import-budget-review">
          <table class="import-table">
            <thead id="import-review-head"></thead>
            <tbody id="import-review-body"></tbody>
          </table>
        </div>
        <div class="investment-import-review" id="import-investment-review" hidden></div>
        <div class="import-actions">
          <button class="secondary-button" type="button" data-import-action="back-to-mapping">Edit mapping</button>
          <button class="primary-button" type="button" data-import-action="commit">Commit import</button>
          <button class="secondary-button" type="button" data-import-action="load-more">Load more</button>
        </div>
        <p class="import-message" id="import-review-message" role="status"></p>
      </section>
      <section class="import-card import-step import-progress-view" id="import-progress-step" hidden><h2>Committing import</h2><p id="import-progress-summary">Keep this page open while each step is confirmed in Google Sheets.</p><ol class="import-commit-progress" id="import-commit-progress"></ol><div class="import-actions"><button class="primary-button" type="button" data-import-action="retry-commit" hidden>Retry failed step</button><button class="secondary-button" type="button" data-import-action="return-review" hidden>Return to review</button><button class="secondary-button" type="button" data-import-action="finish-import" hidden>Start another import</button><button class="secondary-button" type="button" data-import-action="open-sync" hidden>Open Sync</button></div><p class="import-message" id="import-progress-message" role="status"></p></section>`;

    const fileInput = root.querySelector("#import-file");
    const profileStep = root.querySelector("#import-profile-step");
    const mappingStep = root.querySelector("#import-mapping-step");
    const reviewStep = root.querySelector("#import-review-step");
    const progressStep = root.querySelector("#import-progress-step");
    const profileForm = root.querySelector("#import-profile-form");
    const mappingForm = root.querySelector("#import-mapping-form");
    const profileMessage = root.querySelector("#import-profile-message");
    const mappingMessage = root.querySelector("#import-mapping-message");
    const reviewMessage = root.querySelector("#import-review-message");
    const loadMoreButton = root.querySelector(
      '[data-import-action="load-more"]',
    );

    const message = (element, text, kind = "") => {
      element.textContent = text || "";
      element.className = `import-message${kind ? ` ${kind}` : ""}`;
    };

    function profileOptions() {
      const select = profileForm.elements.profileId;
      const current = select.value;
      select.innerHTML =
        '<option value="">Create a new profile</option>' +
        state.profiles
          .map(
            (profile) =>
              `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.name)} · ${profile.target === "investment" ? "Investments" : "Budget"}</option>`,
          )
          .join("");
      if (state.profiles.some((item) => item.id === current))
        select.value = current;
    }

    function accountOptions() {
      const accounts = window.InvestmentAPI.accounts().filter(
        (item) => item.active !== false,
      );
      profileForm.elements.investmentAccountId.innerHTML =
        '<option value="">Choose an account</option>' +
        accounts
          .map(
            (account) =>
              `<option value="${escapeHTML(account.id)}">${escapeHTML(account.name)}</option>`,
          )
          .join("");
    }

    function updateTargetFields() {
      const investment = profileForm.elements.target.value === "investment";
      root.querySelector("[data-investment-account-field]").hidden =
        !investment;
      profileForm.elements.investmentAccountId.required = investment;
      state.target = investment ? "investment" : "budget";
    }

    function chooseProfileCandidate() {
      const id = profileForm.elements.profileId.value;
      const profile = state.profiles.find((item) => item.id === id);
      root.querySelector('[data-import-action="archive-profile"]').hidden =
        !profile;
      if (!profile) {
        profileForm.elements.name.value = "";
        updateTargetFields();
        return;
      }
      profileForm.elements.name.value = profile.name;
      profileForm.elements.target.value = profile.target;
      profileForm.elements.investmentAccountId.value =
        profile.investmentAccountId || "";
      updateTargetFields();
    }

    function renderSourcePreview() {
      const preview = root.querySelector("#import-source-preview");
      if (!state.parsed) {
        preview.innerHTML = "";
        return;
      }
      preview.innerHTML = `<table><thead><tr>${state.parsed.headers.map((header) => `<th>${escapeHTML(header.label)}</th>`).join("")}</tr></thead><tbody>${state.parsed.rows
        .slice(0, 3)
        .map(
          (row) =>
            `<tr>${row.values.map((value) => `<td>${escapeHTML(value)}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
    }

    const BUDGET_WIZARD_STEPS = [
      "Date",
      "Amount",
      "Vendor",
      "Category",
      "Person",
      "Notes",
    ];
    const INVESTMENT_WIZARD_STEPS = ["Activity date", "Balance", "Cash flows"];

    function createBudgetWizardState() {
      const profile = state.profile;
      const existing = profile.columnMapping || {};
      const suggested = window.ImportUtils.suggestBudgetMapping(state.parsed);
      const pick = (field) =>
        window.ImportUtils.columnIndex(existing[field]) ??
        suggested[field] ??
        null;
      const date = pick("date");
      const formats = window.ImportUtils.validDateFormats(state.parsed, date);
      const existingFormat = formats.includes(profile.dateFormat)
        ? profile.dateFormat
        : null;
      const hasExistingAmountMapping =
        window.ImportUtils.columnIndex(existing.amount) !== null ||
        window.ImportUtils.columnIndex(existing.debit) !== null ||
        window.ImportUtils.columnIndex(existing.credit) !== null;
      const amountMode = hasExistingAmountMapping
        ? profile.amountMode === "debitCredit"
          ? "debitCredit"
          : "unified"
        : suggested.amountMode;
      return {
        profileId: profile.id,
        step: 0,
        maxVisited: 0,
        mapping: {
          date,
          amount: pick("amount"),
          debit: pick("debit"),
          credit: pick("credit"),
          vendorDescription: pick("vendorDescription"),
          categoryDescription: pick("categoryDescription"),
          personDescription: pick("personDescription"),
          notes: pick("notes"),
          amountSignConvention:
            existing.amountSignConvention ||
            (hasExistingAmountMapping
              ? Number(profile.amountMultiplier) === -1
                ? "expensesNegative"
                : "expensesPositive"
              : suggested.amountSignConvention),
        },
        dateFormat: existingFormat || suggested.dateFormat,
        amountMode,
        hasCategory: Object.prototype.hasOwnProperty.call(
          existing,
          "categoryDescription",
        )
          ? window.ImportUtils.columnIndex(existing.categoryDescription) !==
            null
          : suggested.categoryDescription !== null,
        hasPerson: Object.prototype.hasOwnProperty.call(
          existing,
          "personDescription",
        )
          ? window.ImportUtils.columnIndex(existing.personDescription) !== null
          : suggested.personDescription !== null,
        hasNotes: Object.prototype.hasOwnProperty.call(existing, "notes")
          ? window.ImportUtils.columnIndex(existing.notes) !== null
          : suggested.notes !== null,
        autoPopulateVendor: existing.autoPopulateVendor === true,
        autoPopulateCategory: existing.autoPopulateCategory === true,
        autoPopulatePerson: existing.autoPopulatePerson === true,
      };
    }

    function createInvestmentWizardState() {
      const profile = state.profile;
      const existing = profile.columnMapping || {};
      const suggested = window.ImportUtils.suggestInvestmentMapping(
        state.parsed,
      );
      const pick = (field) =>
        window.ImportUtils.columnIndex(existing[field]) ??
        suggested[field] ??
        null;
      const hasSavedContributions = Object.prototype.hasOwnProperty.call(
        existing,
        "contributions",
      );
      const contributions = (
        hasSavedContributions ? existing.contributions : suggested.contributions
      )
        .map(window.ImportUtils.columnIndex)
        .filter((value) => value !== null);
      const month = pick("month");
      const formats = window.ImportUtils.validMonthFormats(state.parsed, month);
      return {
        profileId: profile.id,
        step: 0,
        maxVisited: 0,
        mapping: { month, balance: pick("balance"), contributions },
        dateFormat: formats.includes(profile.dateFormat)
          ? profile.dateFormat
          : suggested.dateFormat,
        hasBalance: Object.prototype.hasOwnProperty.call(existing, "balance")
          ? window.ImportUtils.columnIndex(existing.balance) !== null
          : suggested.balance !== null,
      };
    }

    function wizardSteps() {
      return state.profile?.target === "investment"
        ? INVESTMENT_WIZARD_STEPS
        : BUDGET_WIZARD_STEPS;
    }

    function wizardFields() {
      const map = state.mappingWizard.mapping;
      return {
        date: map.date,
        amount: map.amount,
        debit: map.debit,
        credit: map.credit,
        vendorDescription: map.vendorDescription,
        categoryDescription: map.categoryDescription,
        personDescription: map.personDescription,
        notes: map.notes,
      };
    }

    function wizardHeaderOptions(field, predicate, empty = "Choose a column") {
      const fields = wizardFields();
      const selected = window.ImportUtils.columnIndex(fields[field]);
      const stepFor = {
        date: 0,
        amount: 1,
        debit: 1,
        credit: 1,
        vendorDescription: 2,
        categoryDescription: 3,
        personDescription: 4,
        notes: 5,
      };
      const active = new Set([
        "date",
        state.mappingWizard.amountMode === "debitCredit" ? "debit" : "amount",
        state.mappingWizard.amountMode === "debitCredit" ? "credit" : "amount",
        "vendorDescription",
      ]);
      if (state.mappingWizard.hasCategory) active.add("categoryDescription");
      if (state.mappingWizard.hasPerson) active.add("personDescription");
      if (state.mappingWizard.hasNotes) active.add("notes");
      const used = new Set(
        Object.entries(fields)
          .filter(
            ([name, value]) =>
              name !== field &&
              active.has(name) &&
              window.ImportUtils.columnIndex(value) !== null &&
              (stepFor[name] < stepFor[field] ||
                (stepFor[name] === stepFor[field] &&
                  ["debit", "credit"].includes(name))),
          )
          .map(([, value]) => window.ImportUtils.columnIndex(value)),
      );
      return (
        `<option value="">${empty}</option>` +
        state.parsed.headers
          .filter(
            (header) =>
              header.index === selected ||
              (!used.has(header.index) &&
                (!predicate || predicate(header.index))),
          )
          .sort(
            (left, right) =>
              window.ImportUtils.headerScore(
                right,
                field === "vendorDescription"
                  ? "vendor"
                  : field === "categoryDescription"
                    ? "category"
                    : field === "personDescription"
                      ? "person"
                      : field,
              ) -
                window.ImportUtils.headerScore(
                  left,
                  field === "vendorDescription"
                    ? "vendor"
                    : field === "categoryDescription"
                      ? "category"
                      : field === "personDescription"
                        ? "person"
                        : field,
                ) || left.index - right.index,
          )
          .map(
            (header) =>
              `<option value="${header.index}"${header.index === selected ? " selected" : ""}>${escapeHTML(header.label)}${state.parsed.headers.filter((item) => item.normalized === header.normalized).length > 1 ? ` (column ${header.index + 1})` : ""}</option>`,
          )
          .join("")
      );
    }

    function wizardSamples(mapping, transform) {
      const values = window.ImportUtils.columnValues(
        state.parsed,
        mapping,
      ).slice(0, 5);
      return `<div class="import-wizard-samples"><strong>Sample values</strong>${values.length ? `<ul>${values.map((value) => `<li>${escapeHTML(transform ? `${value} → ${transform(value) || "invalid"}` : value)}</li>`).join("")}</ul>` : "<p>Choose a column to see examples.</p>"}</div>`;
    }

    function wizardNavigation() {
      const wizard = state.mappingWizard;
      const steps = wizardSteps();
      return `<ol class="import-wizard-progress" style="--wizard-step-count: ${steps.length}" aria-label="Column mapping progress">${steps.map((label, index) => `<li><button type="button" data-wizard-step="${index}"${index > wizard.maxVisited ? " disabled" : ""}${index === wizard.step ? ' aria-current="step" class="active"' : ""}><span>${index + 1}</span>${label}</button></li>`).join("")}</ol>`;
    }

    function wizardActions(final = false) {
      return `<div class="import-actions">${state.mappingWizard.step > 0 ? '<button class="secondary-button" type="button" data-import-action="wizard-back">Back</button>' : ""}<button class="primary-button" type="submit">${final ? "Review staged rows" : "Continue"}</button></div>`;
    }

    function renderBudgetWizard() {
      if (
        !state.mappingWizard ||
        state.mappingWizard.profileId !== state.profile.id
      )
        state.mappingWizard = createBudgetWizardState();
      const wizard = state.mappingWizard;
      const map = wizard.mapping;
      let content = "";
      if (wizard.step === 0) {
        const formats = window.ImportUtils.validDateFormats(
          state.parsed,
          map.date,
        );
        if (!formats.includes(wizard.dateFormat))
          wizard.dateFormat = formats.includes("MM/DD/YYYY")
            ? "MM/DD/YYYY"
            : formats.includes("MM/DD/YY")
              ? "MM/DD/YY"
              : formats[0] || "";
        const ambiguity = formats.length > 1;
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 1 of 6 · Date</p><h3>Which column contains the transaction date?</h3><p>We will convert this value to the app’s standard date. Choose the date you want shown on each transaction.</p>
          <label class="import-field"><span>Date column</span><select name="date">${wizardHeaderOptions("date")}</select></label>
          ${wizardSamples(map.date, (value) => window.ImportUtils.parseDate(value, wizard.dateFormat))}
          ${map.date === null ? "" : formats.length ? `<div class="import-inference ${ambiguity ? "ambiguous" : ""}"><strong>${ambiguity ? "This date is ambiguous" : "Date format detected"}</strong><p>${ambiguity ? "All observed month and day values are 12 or lower, so more than one interpretation fits. We selected the US month-first format; confirm it below." : "Only one supported format fits every nonblank value in this column."}</p><label class="import-field"><span>Date format</span><select name="dateFormat">${formats.map((format) => `<option value="${format}"${format === wizard.dateFormat ? " selected" : ""}>${format}</option>`).join("")}</select></label><small>Two-digit years use 00–69 as 2000–2069 and 70–99 as 1970–1999.</small></div>` : '<div class="import-inference error"><strong>We could not read this column as dates</strong><p>Choose another column. Every nonblank value must use one supported date format.</p></div>'}
        </div>${wizardActions()}`;
      }
      if (wizard.step === 1) {
        const numeric = (index) =>
          window.ImportUtils.isNumericColumn(state.parsed, index);
        const sign = window.ImportUtils.inferAmountSignConvention(
          state.parsed,
          map.amount,
        );
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 2 of 6 · Amount</p><h3>How does this CSV record money?</h3><p>Some files use one signed amount column. Others separate withdrawals and deposits into debit and credit columns.</p>
          <fieldset class="import-choice-group"><legend>Amount layout</legend><label><input type="radio" name="amountMode" value="unified"${wizard.amountMode === "unified" ? " checked" : ""} /> One amount column</label><label><input type="radio" name="amountMode" value="debitCredit"${wizard.amountMode === "debitCredit" ? " checked" : ""} /> Separate debit and credit columns</label></fieldset>
          ${wizard.amountMode === "unified" ? `<label class="import-field"><span>Amount column</span><select name="amount">${wizardHeaderOptions("amount", numeric)}</select></label>${wizardSamples(map.amount)}<div class="import-inference"><strong>How are expenses written?</strong><p>We found ${sign.negative} negative and ${sign.positive} positive non-zero sample values. Confirm the convention used by this file.</p><fieldset class="import-choice-group"><legend>Sign convention</legend><label><input type="radio" name="amountSignConvention" value="expensesNegative"${map.amountSignConvention === "expensesNegative" ? " checked" : ""} /> Expenses are negative; deposits are positive</label><label><input type="radio" name="amountSignConvention" value="expensesPositive"${map.amountSignConvention === "expensesPositive" ? " checked" : ""} /> Expenses are positive; deposits are negative</label></fieldset></div>` : `<div class="import-grid"><label class="import-field"><span>Debit / withdrawal column</span><select name="debit">${wizardHeaderOptions("debit", numeric)}</select></label><label class="import-field"><span>Credit / deposit column</span><select name="credit">${wizardHeaderOptions("credit", numeric)}</select></label></div><div class="import-inference"><strong>Direction comes from the populated column</strong><p>Debit rows become expenses and credit rows become income. Credit rows categorized as expenses remain negative refunds; debit rows categorized as income remain negative reversals.</p></div>`}
        </div>${wizardActions()}`;
      }
      if (wizard.step === 2)
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 3 of 6 · Vendor</p><h3>Which column describes the vendor or payee?</h3><p>The source description does not need to match an internal vendor. We can either learn associations during review or use the source values as vendor names now.</p><label class="import-field"><span>Vendor description column</span><select name="vendorDescription">${wizardHeaderOptions("vendorDescription")}</select></label>${wizardSamples(map.vendorDescription)}<label class="import-toggle"><input type="checkbox" name="autoPopulateVendor"${wizard.autoPopulateVendor ? " checked" : ""} /><span><strong>Match or create vendors using these values</strong><small>Existing names are reused. Missing names remain provisional until Commit import.</small></span></label></div>${wizardActions()}`;
      if (wizard.step === 3)
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 4 of 6 · Category</p><h3>Does this CSV already contain budget categories?</h3><p>When importing an existing budget spreadsheet, its category names can prefill the review table and stage any missing categories.</p><fieldset class="import-choice-group"><legend>Category information</legend><label><input type="radio" name="hasCategory" value="no"${!wizard.hasCategory ? " checked" : ""} /> No category column</label><label><input type="radio" name="hasCategory" value="yes"${wizard.hasCategory ? " checked" : ""} /> Yes, choose a column</label></fieldset>${wizard.hasCategory ? `<label class="import-field"><span>Category column</span><select name="categoryDescription">${wizardHeaderOptions("categoryDescription")}</select></label>${wizardSamples(map.categoryDescription)}<label class="import-toggle"><input type="checkbox" name="autoPopulateCategory"${wizard.autoPopulateCategory ? " checked" : ""} /><span><strong>Match or create categories using these values</strong><small>Category type follows an existing match or the amount direction for a new category.</small></span></label>` : ""}</div>${wizardActions()}`;
      if (wizard.step === 4)
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 5 of 6 · Person</p><h3>Does this CSV separate transactions by cardholder or person?</h3><p>If not, imported transactions use the app’s Shared assignment.</p><fieldset class="import-choice-group"><legend>Cardholder information</legend><label><input type="radio" name="hasPerson" value="no"${!wizard.hasPerson ? " checked" : ""} /> No, use Shared</label><label><input type="radio" name="hasPerson" value="yes"${wizard.hasPerson ? " checked" : ""} /> Yes, choose a column</label></fieldset>${wizard.hasPerson ? `<label class="import-field"><span>Person / cardholder column</span><select name="personDescription">${wizardHeaderOptions("personDescription")}</select></label>${wizardSamples(map.personDescription)}<label class="import-toggle"><input type="checkbox" name="autoPopulatePerson"${wizard.autoPopulatePerson ? " checked" : ""} /><span><strong>Match or create people using these values</strong><small>Existing people are reused. Missing names remain provisional until Commit import.</small></span></label>` : ""}</div>${wizardActions()}`;
      if (wizard.step === 5)
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 6 of 6 · Notes</p><h3>Does this CSV include personal notes for each transaction?</h3><p>Notes are optional and are copied into the transaction’s existing Notes field.</p><fieldset class="import-choice-group"><legend>Notes column</legend><label><input type="radio" name="hasNotes" value="no"${!wizard.hasNotes ? " checked" : ""} /> No notes column</label><label><input type="radio" name="hasNotes" value="yes"${wizard.hasNotes ? " checked" : ""} /> Yes, choose a column</label></fieldset>${wizard.hasNotes ? `<label class="import-field"><span>Notes column</span><select name="notes">${wizardHeaderOptions("notes")}</select></label>${wizardSamples(map.notes)}` : ""}</div>${wizardActions(true)}`;
      mappingForm.innerHTML = `${wizardNavigation()}<div class="import-wizard-panel">${content}</div>`;
    }

    function investmentHeaderOptions(
      field,
      predicate,
      empty = "Choose a column",
    ) {
      const wizard = state.mappingWizard;
      const selected = window.ImportUtils.columnIndex(wizard.mapping[field]);
      const used = new Set(
        [
          wizard.mapping.month,
          wizard.mapping.balance,
          ...wizard.mapping.contributions,
        ]
          .map(window.ImportUtils.columnIndex)
          .filter((value) => value !== null && value !== selected),
      );
      const scoreKind = field === "month" ? "month" : field;
      return (
        `<option value="">${empty}</option>` +
        state.parsed.headers
          .filter(
            (header) =>
              header.index === selected ||
              (!used.has(header.index) &&
                (!predicate || predicate(header.index))),
          )
          .sort(
            (left, right) =>
              window.ImportUtils.headerScore(right, scoreKind) -
                window.ImportUtils.headerScore(left, scoreKind) ||
              left.index - right.index,
          )
          .map(
            (header) =>
              `<option value="${header.index}"${header.index === selected ? " selected" : ""}>${escapeHTML(header.label)}${state.parsed.headers.filter((item) => item.normalized === header.normalized).length > 1 ? ` (column ${header.index + 1})` : ""}</option>`,
          )
          .join("")
      );
    }

    function investmentContributionOptions() {
      const wizard = state.mappingWizard;
      const selected = new Set(wizard.mapping.contributions);
      const used = new Set(
        [wizard.mapping.month, wizard.mapping.balance]
          .map(window.ImportUtils.columnIndex)
          .filter((value) => value !== null),
      );
      const headers = state.parsed.headers
        .filter(
          (header) =>
            selected.has(header.index) ||
            (!used.has(header.index) &&
              window.ImportUtils.isNumericColumn(state.parsed, header.index)),
        )
        .sort(
          (left, right) =>
            window.ImportUtils.headerScore(right, "contribution") -
              window.ImportUtils.headerScore(left, "contribution") ||
            left.index - right.index,
        );
      return headers.length
        ? `<div class="import-contribution-options">${headers.map((header) => `<label><input type="checkbox" name="contributions" value="${header.index}"${selected.has(header.index) ? " checked" : ""} />${escapeHTML(header.label)}</label>`).join("")}</div>`
        : '<div class="import-inference error"><strong>No numeric columns are available</strong><p>Choose different activity-date or balance columns.</p></div>';
    }

    function investmentContributionSamples() {
      const selected = state.mappingWizard.mapping.contributions;
      if (!selected.length)
        return '<div class="import-wizard-samples"><strong>Sample values</strong><p>Select one or more columns to see examples.</p></div>';
      return `<div class="import-wizard-samples"><strong>Sample values</strong><ul>${selected
        .flatMap((mapping) => {
          const header =
            state.parsed.headers[window.ImportUtils.columnIndex(mapping)];
          return window.ImportUtils.columnValues(state.parsed, mapping)
            .slice(0, 3)
            .map(
              (value) =>
                `<li>${escapeHTML(`${header?.label || "Column"}: ${value}`)}</li>`,
            );
        })
        .join("")}</ul></div>`;
    }

    function renderInvestmentWizard() {
      if (
        !state.mappingWizard ||
        state.mappingWizard.profileId !== state.profile.id
      )
        state.mappingWizard = createInvestmentWizardState();
      const wizard = state.mappingWizard;
      const map = wizard.mapping;
      let content = "";
      if (wizard.step === 0) {
        const formats = window.ImportUtils.validMonthFormats(
          state.parsed,
          map.month,
        );
        if (!formats.includes(wizard.dateFormat))
          wizard.dateFormat = formats.includes("YYYY-MM")
            ? "YYYY-MM"
            : formats.includes("MM/DD/YYYY")
              ? "MM/DD/YYYY"
              : formats.includes("MM/DD/YY")
                ? "MM/DD/YY"
                : formats[0] || "";
        const ambiguity = formats.length > 1;
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 1 of 3 · Activity date</p><h3>Which column dates each investment activity row?</h3><p>Every row must contain a supported full date or YYYY-MM value. We will group all activity into calendar months.</p>
          <label class="import-field"><span>Activity date column</span><select name="month">${investmentHeaderOptions("month")}</select></label>
          ${wizardSamples(map.month, (value) => {
            const parsed = window.ImportUtils.parseDate(
              value,
              wizard.dateFormat,
            );
            return parsed?.slice(0, 7);
          })}
          ${map.month === null ? "" : formats.length ? `<div class="import-inference ${ambiguity ? "ambiguous" : ""}"><strong>${ambiguity ? "Confirm the date format" : "Date format detected"}</strong><p>${ambiguity ? "More than one supported date interpretation fits these values. Confirm the format used by this file." : "This format fits every nonblank value in the selected column."}</p><label class="import-field"><span>Date format</span><select name="dateFormat">${formats.map((format) => `<option value="${format}"${format === wizard.dateFormat ? " selected" : ""}>${format}</option>`).join("")}</select></label><small>Two-digit years use 00–69 as 2000–2069 and 70–99 as 1970–1999.</small></div>` : '<div class="import-inference error"><strong>We could not read this column as reporting months</strong><p>Choose another column. Every nonblank value must use one supported month or date format.</p></div>'}
        </div>${wizardActions()}`;
      }
      if (wizard.step === 1) {
        const numeric = (index) =>
          window.ImportUtils.isNumericColumn(state.parsed, index);
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 2 of 3 · Ending balance</p><h3>Does this CSV include account balances?</h3><p>When mapped, the latest dated nonblank balance in each month is used. Otherwise, an existing balance is reused or you can enter one during review.</p>
          <fieldset class="import-choice-group"><legend>Balance information</legend><label><input type="radio" name="hasBalance" value="no"${!wizard.hasBalance ? " checked" : ""} /> No balance column</label><label><input type="radio" name="hasBalance" value="yes"${wizard.hasBalance ? " checked" : ""} /> Yes, choose a column</label></fieldset>
          ${wizard.hasBalance ? `<label class="import-field"><span>Ending balance column</span><select name="balance">${investmentHeaderOptions("balance", numeric)}</select></label>${wizardSamples(map.balance)}` : ""}
        </div>${wizardActions()}`;
      }
      if (wizard.step === 2) {
        content = `<div class="import-wizard-question"><p class="eyebrow">Step 3 of 3 · Contributions and withdrawals</p><h3>Which columns contain cash flows?</h3><p>Select one or more contribution, deposit, transfer, or withdrawal columns. Every nonzero value becomes a dated flow within its month.</p>
          ${investmentContributionOptions()}${investmentContributionSamples()}
        </div>${wizardActions(true)}`;
      }
      mappingForm.innerHTML = `${wizardNavigation()}<div class="import-wizard-panel">${content}</div>`;
    }

    function renderMapper() {
      if (state.profile.target === "budget") renderBudgetWizard();
      else renderInvestmentWizard();
    }

    function buildColumnMapping() {
      if (state.profile.target === "budget") {
        const wizard = state.mappingWizard;
        return {
          date: wizard.mapping.date,
          amount:
            wizard.amountMode === "unified" ? wizard.mapping.amount : null,
          debit:
            wizard.amountMode === "debitCredit" ? wizard.mapping.debit : null,
          credit:
            wizard.amountMode === "debitCredit" ? wizard.mapping.credit : null,
          amountSignConvention: wizard.mapping.amountSignConvention,
          vendorDescription: wizard.mapping.vendorDescription,
          categoryDescription: wizard.hasCategory
            ? wizard.mapping.categoryDescription
            : null,
          personDescription: wizard.hasPerson
            ? wizard.mapping.personDescription
            : null,
          notes: wizard.hasNotes ? wizard.mapping.notes : null,
          autoPopulateVendor: wizard.autoPopulateVendor === true,
          autoPopulateCategory:
            wizard.hasCategory && wizard.autoPopulateCategory === true,
          autoPopulatePerson:
            wizard.hasPerson && wizard.autoPopulatePerson === true,
        };
      }
      const wizard = state.mappingWizard;
      return {
        month: wizard.mapping.month,
        balance: wizard.hasBalance ? wizard.mapping.balance : null,
        contributions: wizard.mapping.contributions.slice(),
      };
    }

    function validateMapping(map, amountMode) {
      if (state.profile.target === "investment") {
        if (map.month === null || !(map.contributions || []).length)
          throw new Error(
            "Map an activity date and at least one cash-flow column.",
          );
        const mapped = [
          map.month,
          map.balance,
          ...(map.contributions || []),
        ].filter((value) => window.ImportUtils.columnIndex(value) !== null);
        if (
          new Set(mapped.map(window.ImportUtils.columnIndex)).size !==
          mapped.length
        )
          throw new Error(
            "Each investment field must use a different CSV column.",
          );
        return;
      }
      if (map.date === null || map.vendorDescription === null)
        throw new Error("Map a date and vendor description.");
      if (
        amountMode === "debitCredit" &&
        (map.debit === null || map.credit === null)
      )
        throw new Error("Map both debit and credit columns.");
      if (amountMode !== "debitCredit" && map.amount === null)
        throw new Error("Map an amount column.");
      const required =
        amountMode === "debitCredit"
          ? [map.date, map.vendorDescription, map.debit, map.credit]
          : [map.date, map.vendorDescription, map.amount];
      if (new Set(required).size !== required.length)
        throw new Error("Required fields must use different CSV columns.");
      const allMapped = [
        ...required,
        map.categoryDescription,
        map.personDescription,
        map.notes,
      ].filter((value) => value !== null);
      if (new Set(allMapped).size !== allMapped.length)
        throw new Error(
          "Each transaction field must use a different CSV column.",
        );
    }

    function captureBudgetWizardControls(changedName = "") {
      const wizard = state.mappingWizard;
      if (!wizard) return;
      const numberValue = (name) => {
        const control = mappingForm.elements[name];
        return control && control.value !== "" ? Number(control.value) : null;
      };
      [
        "date",
        "amount",
        "debit",
        "credit",
        "vendorDescription",
        "categoryDescription",
        "personDescription",
        "notes",
      ].forEach((field) => {
        if (mappingForm.elements[field])
          wizard.mapping[field] = numberValue(field);
      });
      if (mappingForm.elements.dateFormat)
        wizard.dateFormat = mappingForm.elements.dateFormat.value;
      const amountMode = mappingForm.querySelector(
        'input[name="amountMode"]:checked',
      );
      if (amountMode) wizard.amountMode = amountMode.value;
      const sign = mappingForm.querySelector(
        'input[name="amountSignConvention"]:checked',
      );
      if (sign) wizard.mapping.amountSignConvention = sign.value;
      const category = mappingForm.querySelector(
        'input[name="hasCategory"]:checked',
      );
      if (category) {
        wizard.hasCategory = category.value === "yes";
        if (!wizard.hasCategory) wizard.mapping.categoryDescription = null;
      }
      const person = mappingForm.querySelector(
        'input[name="hasPerson"]:checked',
      );
      if (person) {
        wizard.hasPerson = person.value === "yes";
        if (!wizard.hasPerson) wizard.mapping.personDescription = null;
      }
      const notes = mappingForm.querySelector('input[name="hasNotes"]:checked');
      if (notes) {
        wizard.hasNotes = notes.value === "yes";
        if (!wizard.hasNotes) wizard.mapping.notes = null;
      }
      if (mappingForm.elements.autoPopulateVendor)
        wizard.autoPopulateVendor =
          mappingForm.elements.autoPopulateVendor.checked;
      if (mappingForm.elements.autoPopulateCategory)
        wizard.autoPopulateCategory =
          mappingForm.elements.autoPopulateCategory.checked;
      if (mappingForm.elements.autoPopulatePerson)
        wizard.autoPopulatePerson =
          mappingForm.elements.autoPopulatePerson.checked;

      const order = {
        date: 0,
        amount: 1,
        debit: 1,
        credit: 1,
        vendorDescription: 2,
        categoryDescription: 3,
        personDescription: 4,
        notes: 5,
      };
      if (changedName in order) {
        const value = wizard.mapping[changedName];
        if (value !== null)
          Object.entries(order).forEach(([field, step]) => {
            if (step > order[changedName] && wizard.mapping[field] === value)
              wizard.mapping[field] = null;
          });
      }
      if (changedName === "date") {
        const formats = window.ImportUtils.validDateFormats(
          state.parsed,
          wizard.mapping.date,
        );
        wizard.dateFormat = formats.includes("MM/DD/YYYY")
          ? "MM/DD/YYYY"
          : formats.includes("MM/DD/YY")
            ? "MM/DD/YY"
            : formats[0] || "";
      }
    }

    function captureInvestmentWizardControls(changedName = "") {
      const wizard = state.mappingWizard;
      if (!wizard) return;
      const numberValue = (name) => {
        const control = mappingForm.elements[name];
        return control && control.value !== "" ? Number(control.value) : null;
      };
      ["month", "balance"].forEach((field) => {
        if (mappingForm.elements[field])
          wizard.mapping[field] = numberValue(field);
      });
      if (mappingForm.elements.dateFormat)
        wizard.dateFormat = mappingForm.elements.dateFormat.value;
      const balance = mappingForm.querySelector(
        'input[name="hasBalance"]:checked',
      );
      if (balance) {
        wizard.hasBalance = balance.value === "yes";
        if (!wizard.hasBalance) wizard.mapping.balance = null;
      }
      if (mappingForm.elements.contributions) {
        wizard.mapping.contributions = [
          ...mappingForm.querySelectorAll(
            'input[name="contributions"]:checked',
          ),
        ].map((input) => Number(input.value));
      }
      if (["month", "balance"].includes(changedName)) {
        const selected = wizard.mapping[changedName];
        if (selected !== null) {
          if (changedName !== "month" && wizard.mapping.month === selected)
            wizard.mapping.month = null;
          if (changedName !== "balance" && wizard.mapping.balance === selected)
            wizard.mapping.balance = null;
          wizard.mapping.contributions = wizard.mapping.contributions.filter(
            (value) => value !== selected,
          );
        }
      }
      if (changedName === "month") {
        const formats = window.ImportUtils.validMonthFormats(
          state.parsed,
          wizard.mapping.month,
        );
        wizard.dateFormat = formats.includes("YYYY-MM")
          ? "YYYY-MM"
          : formats.includes("MM/DD/YYYY")
            ? "MM/DD/YYYY"
            : formats.includes("MM/DD/YY")
              ? "MM/DD/YY"
              : formats[0] || "";
      }
    }

    function captureWizardControls(changedName = "") {
      if (state.profile?.target === "investment")
        captureInvestmentWizardControls(changedName);
      else captureBudgetWizardControls(changedName);
    }

    function validateBudgetWizardStep() {
      const wizard = state.mappingWizard,
        map = wizard.mapping;
      if (wizard.step === 0) {
        if (map.date === null)
          throw new Error("Choose the column containing transaction dates.");
        const formats = window.ImportUtils.validDateFormats(
          state.parsed,
          map.date,
        );
        if (!formats.length || !formats.includes(wizard.dateFormat))
          throw new Error(
            "Choose a date column and format that fit every nonblank value.",
          );
      }
      if (wizard.step === 1) {
        if (wizard.amountMode === "unified") {
          if (
            map.amount === null ||
            !window.ImportUtils.isNumericColumn(state.parsed, map.amount)
          )
            throw new Error("Choose a numeric amount column.");
          if (
            !["expensesNegative", "expensesPositive"].includes(
              map.amountSignConvention,
            )
          )
            throw new Error("Confirm how expenses and deposits are signed.");
        } else {
          if (map.debit === null || map.credit === null)
            throw new Error("Choose both debit and credit columns.");
          if (map.debit === map.credit)
            throw new Error("Debit and credit must use different columns.");
          if (
            !window.ImportUtils.isNumericColumn(state.parsed, map.debit) ||
            !window.ImportUtils.isNumericColumn(state.parsed, map.credit)
          )
            throw new Error("Choose numeric debit and credit columns.");
        }
      }
      if (wizard.step === 2 && map.vendorDescription === null)
        throw new Error("Choose the column describing the vendor or payee.");
      if (
        wizard.step === 3 &&
        wizard.hasCategory &&
        map.categoryDescription === null
      )
        throw new Error("Choose the category column.");
      if (
        wizard.step === 4 &&
        wizard.hasPerson &&
        map.personDescription === null
      )
        throw new Error("Choose the person or cardholder column.");
      if (wizard.step === 5 && wizard.hasNotes && map.notes === null)
        throw new Error("Choose the notes column.");
    }

    function validateInvestmentWizardStep() {
      const wizard = state.mappingWizard,
        map = wizard.mapping;
      if (wizard.step === 0) {
        if (map.month === null)
          throw new Error(
            "Choose the column containing reporting months or dates.",
          );
        const formats = window.ImportUtils.validMonthFormats(
          state.parsed,
          map.month,
        );
        if (!formats.length || !formats.includes(wizard.dateFormat))
          throw new Error(
            "Choose a month/date column and format that fit every nonblank value.",
          );
        if (
          !state.parsed.rows.every((row) =>
            Boolean(
              window.ImportUtils.parseDate(
                window.ImportUtils.valueAt(row, map.month),
                wizard.dateFormat,
              ),
            ),
          )
        ) {
          throw new Error(
            "Every investment row must contain a valid, nonblank activity date.",
          );
        }
      }
      if (wizard.step === 1) {
        if (
          wizard.hasBalance &&
          (map.balance === null ||
            !window.ImportUtils.isNumericColumn(state.parsed, map.balance))
        )
          throw new Error("Choose a numeric ending balance column.");
        if (wizard.hasBalance && map.balance === map.month)
          throw new Error("Month and balance must use different columns.");
      }
      if (wizard.step === 2) {
        if (!map.contributions.length)
          throw new Error(
            "Choose at least one contribution or withdrawal column.",
          );
        if (
          map.contributions.some(
            (column) =>
              !window.ImportUtils.isNumericColumn(state.parsed, column),
          )
        )
          throw new Error(
            "Choose only numeric contribution or withdrawal columns.",
          );
      }
      const mapped = [
        map.month,
        wizard.hasBalance ? map.balance : null,
        ...map.contributions,
      ].filter((value) => window.ImportUtils.columnIndex(value) !== null);
      if (
        new Set(mapped.map(window.ImportUtils.columnIndex)).size !==
        mapped.length
      )
        throw new Error(
          "Each investment field must use a different CSV column.",
        );
    }

    function validateWizardStep() {
      if (state.profile?.target === "investment")
        validateInvestmentWizardStep();
      else validateBudgetWizardStep();
    }

    function references() {
      const provisional = (kind) => [...state.draftEntities[kind].values()];
      return {
        categories: window.BudgetAPI.listCategories().concat(
          provisional("category"),
        ),
        vendors: window.BudgetAPI.listVendors().concat(provisional("vendor")),
        people: window.BudgetAPI.listPeople().concat(provisional("assignment")),
        accounts: window.InvestmentAPI.accounts(),
        sharedAssignmentId: window.BudgetAPI.SHARED_ASSIGNMENT_ID,
      };
    }

    function draftEntityKey(kind, name, type = "") {
      return `${kind === "category" ? `${type}|` : ""}${window.ImportUtils.normalizeDescription(name)}`;
    }

    function stageEntity(kind, name, type = "expense", refs = null) {
      const normalized = window.ImportUtils.normalizeDescription(name);
      if (!normalized) throw new Error("Enter a name before adding this item.");
      const key = draftEntityKey(kind, name, type);
      const existing = state.draftEntities[kind].get(key);
      if (existing) return existing;
      const record = {
        ...window.BudgetAPI.createImportedEntityDraft(kind, {
          name: String(name).trim().replace(/\s+/g, " "),
          type,
        }),
        provisional: true,
      };
      state.draftEntities[kind].set(key, record);
      const list =
        refs &&
        (kind === "category"
          ? refs.categories
          : kind === "vendor"
            ? refs.vendors
            : refs.people);
      if (list && !list.some((item) => item.id === record.id))
        list.push(record);
      return record;
    }

    function resetDraftEntities() {
      state.draftEntities = {
        vendor: new Map(),
        category: new Map(),
        assignment: new Map(),
      };
    }

    function stageRows() {
      resetDraftEntities();
      state.pendingVendors.clear();
      state.pendingPeople.clear();
      const refs = references();
      if (state.profile.target === "budget") {
        // Returns an array of data for each individual row, including the original CSV data, any pre-associated vendor or person ids, and a staging id
        state.rows = window.ImportUtils.createBudgetRows(
          state.parsed,
          state.profile,
          state.bundle,
          refs,
          (kind, name, type) => stageEntity(kind, name, type, refs),
        );

        //
        state.rows.forEach((row) => {
          if (row.vendorResolution === "pending" && row.vendorId)
            state.pendingVendors.set(row.normalizedVendorDescription, {
              sourceDescription: row.vendorDescription,
              vendorId: row.vendorId,
            });
          if (row.personResolution === "pending" && row.personId)
            state.pendingPeople.set(row.normalizedPersonDescription, {
              sourceDescription: row.personDescription,
              assignmentId: row.personId,
            });
        });

        //
        state.resolvedCategoryMatches = new Set(
          state.rows
            .filter((row) => row.categoryId)
            .map(
              (row) =>
                row.normalizedCategoryDescription ||
                row.normalizedVendorDescription,
            )
            .filter(Boolean),
        );
      } else {
        const existing = window.InvestmentAPI.balances()
          .filter(
            (item) => item.accountId === state.profile.investmentAccountId,
          )
          .map((balance) =>
            window.InvestmentAPI.monthData(balance.accountId, balance.month),
          );
        state.rows = window.ImportUtils.createInvestmentMonths(
          state.parsed,
          state.profile,
          existing,
        );
      }
      state.filter = "all";
      state.expandedInvestmentMonths.clear();
      mappingStep.hidden = true;
      reviewStep.hidden = false;
      renderReview();
      if (state.profile.target === "investment") {
        state.rows
          .filter((row) => row.errors.length)
          .forEach((row) => state.expandedInvestmentMonths.add(row.stagingId));
        renderInvestmentRows();
      }
    }

    function validateRows() {
      const refs = references();
      if (state.profile.target === "investment") {
        const months = new Map();
        state.rows.forEach((row) => {
          row.errors = row.errors.filter(
            (error) => !error.includes("more than once"),
          );
          if (row.month)
            months.set(row.month, [...(months.get(row.month) || []), row]);
        });
        months.forEach((rows) => {
          if (rows.length > 1)
            rows.forEach((row) =>
              row.errors.push(
                "This account-month appears more than once in the CSV.",
              ),
            );
        });
      }
      state.rows.forEach((row) => {
        const result =
          state.profile.target === "budget"
            ? window.ImportUtils.validateBudgetRow(row, refs, state.profile)
            : window.ImportUtils.validateInvestmentMonth(
                row,
                refs,
                state.profile,
              );
        row.errors = result.errors;
        row.warnings = result.warnings;
        if ("type" in result) row.type = result.type;
        if ("amount" in result && !row.amountEdited) row.amount = result.amount;
        if (!window.BudgetAPI.getActiveUser())
          row.errors.push("Choose an app user in Settings.");
      });
    }

    function optionList(items, value, emptyLabel) {
      return (
        `<option value="">${emptyLabel}</option>` +
        items
          .map(
            (item) =>
              `<option value="${escapeHTML(item.id)}"${item.id === value ? " selected" : ""}>${escapeHTML(item.name)}</option>`,
          )
          .join("")
      );
    }

    function numericInputValue(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(2) : "";
    }

    function statusMarkup(row) {
      if (row.queued) return "Queued for sync";
      const items = [
        ...row.errors.map(
          (item) => `<span class="error">${escapeHTML(item)}</span>`,
        ),
        ...row.warnings.map(
          (item) => `<span class="warning">${escapeHTML(item)}</span>`,
        ),
      ];
      return items.join("") || "Ready";
    }

    function filteredRows() {
      return state.rows.filter((row) => {
        if (state.filter === "errors") return row.errors.length;
        if (state.filter === "excluded") return !row.include;
        if (state.filter === "ready")
          return row.include && !row.errors.length && !row.queued;
        if (state.filter === "vendors")
          return state.profile.target === "budget" && !row.vendorId;
        if (state.filter === "people")
          return state.profile.target === "budget" && !row.personId;
        if (state.filter === "categories")
          return state.profile.target === "budget" && !row.categoryId;
        return true;
      });
    }

    function visibleRows(items) {
      const total = items.length;
      state.visibleLimit = Math.min(
        Math.max(state.visibleLimit, PAGE_SIZE),
        Math.max(total, PAGE_SIZE),
      );
      return items.slice(0, state.visibleLimit);
    }

    function renderSummary() {
      const included = state.rows.filter((row) => row.include && !row.queued);
      const ready = included.filter((row) => !row.errors.length);
      let stats = [
        [
          state.profile.target === "investment"
            ? state.parsed.rows.length
            : state.rows.length,
          state.profile.target === "investment" ? "Source rows" : "CSV rows",
        ],
        [
          included.length,
          state.profile.target === "investment"
            ? "Included months"
            : "Included",
        ],
        [ready.length, "Ready"],
        [included.filter((row) => row.errors.length).length, "With errors"],
      ];
      if (state.profile.target === "budget") {
        const income = included
          .filter((row) => row.type === "income")
          .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const expenses = included
          .filter((row) => row.type === "expense")
          .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        stats.push(
          [
            included.filter((row) => !row.vendorId && row.type !== "income")
              .length,
            "Unresolved vendors",
          ],
          [included.filter((row) => !row.personId).length, "Unresolved people"],
          [
            included.filter((row) => !row.categoryId).length,
            "Missing categories",
          ],
          [money(income), "Income"],
          [money(expenses), "Expenses"],
        );
      } else {
        stats.splice(1, 0, [state.rows.length, "Grouped months"]);
        const flows = included
          .flatMap((row) => row.flows.map((flow) => flow.amount))
          .filter((value) => Number.isFinite(Number(value)));
        stats.push(
          [included.filter((row) => row.existing).length, "Existing months"],
          [
            money(
              flows
                .filter((value) => value > 0)
                .reduce((sum, value) => sum + value, 0),
            ),
            "Contributions",
          ],
          [
            money(
              Math.abs(
                flows
                  .filter((value) => value < 0)
                  .reduce((sum, value) => sum + value, 0),
              ),
            ),
            "Withdrawals",
          ],
        );
      }
      root.querySelector("#import-summary").innerHTML =
        `<div class="import-summary">${stats.map(([value, label]) => `<div class="import-stat"><strong>${escapeHTML(String(value))}</strong><span>${escapeHTML(label)}</span></div>`).join("")}</div>`;
    }

    function renderFilters() {
      const filters = [
        ["all", "All"],
        ["ready", "Ready"],
        ["errors", "Errors"],
        ["excluded", "Excluded"],
      ];
      if (state.profile.target === "budget")
        filters.splice(
          3,
          0,
          ["vendors", "Vendors"],
          ["people", "People"],
          ["categories", "Categories"],
        );
      root.querySelector("#import-filters").innerHTML = filters
        .map(
          ([key, label]) =>
            `<button class="secondary-button${state.filter === key ? " active" : ""}" type="button" data-import-filter="${key}">${label}</button>`,
        )
        .join("");
    }

    function renderBudgetRows() {
      const filtered = filteredRows();
      const visible = visibleRows(filtered);

      loadMoreButton.visible = state.visibleLimit >= visible.length;

      // const visibleRows = filteredRows();
      root.querySelector(".import-table").classList.add("budget-review-table");
      root.querySelector("#import-review-head").innerHTML =
        '<tr><th class="include-column"><span class="sr-only">Include</span></th><th class="date-column">Date</th><th class="vendor-column">Vendor name</th><th class="category-column">Category</th><th class="person-column">Person</th><th class="amount-column">Amount</th><th class="notes-column">Notes</th><th class="status-column">Status</th></tr>';

      root.querySelector("#import-review-body").innerHTML = visible
        .map(
          (
            row,
          ) => `<tr data-staging-id="${row.stagingId}" class="${row.errors.length ? "has-errors" : ""}${row.queued ? " queued" : ""}">
        <td class="include-column"><input type="checkbox" aria-label="Include CSV row ${row.sourceRowNumber}" data-row-field="include"${row.include ? " checked" : ""}${row.queued ? " disabled" : ""} /></td>
        <td class="date-column"><date-picker allow-empty aria-label="Transaction date" data-row-field="date" value="${escapeHTML(row.date || "")}"${row.queued ? " inert" : ""}></date-picker></td>
        <td class="vendor-column"><vendor-input data-row-field="vendorId" value="${escapeHTML(row.vendorId)}"${row.queued ? " inert" : ""}></vendor-input><span class="import-source-description">${escapeHTML(row.vendorDescription || "No source vendor")}</span></td>
        <td class="category-column"><category-select data-row-field="categoryId" type="all" create-type="${window.ImportUtils.suggestBudgetType(row)}" value="${escapeHTML(row.categoryId)}"${row.queued ? " inert" : ""}></category-select>${row.categoryDescription ? `<span class="import-source-description">${escapeHTML(row.categoryDescription)}</span>` : ""}</td>
        <td class="person-column"><people-select data-row-field="personId" allow-empty value="${escapeHTML(row.personId)}"${row.queued ? " inert" : ""}></people-select><span class="import-source-description">${escapeHTML(row.personDescription || "Shared")}</span></td>
        <td class="amount-column"><input type="number" aria-label="Transaction amount" step="0.01" data-row-field="amount" value="${numericInputValue(row.amount)}"${row.queued ? " disabled" : ""} /></td>
        <td class="notes-column"><input type="text" aria-label="Transaction notes" maxlength="1000" data-row-field="notes" value="${escapeHTML(row.notes)}"${row.queued ? " disabled" : ""} /></td><td class="import-status status-column">${statusMarkup(row)}</td></tr>`,
        )
        .join("");

      visible.forEach((row) => {
        const element = root.querySelector(
          `[data-staging-id="${row.stagingId}"]`,
        );

        const vendorControl = element.querySelector("vendor-input");
        const categoryControl = element.querySelector("category-select");
        const personControl = element.querySelector("people-select");

        vendorControl.configureOptions({
          getOptions: () => references().vendors,
          createOption: (name) => stageEntity("vendor", name),
          onCreate: () => {},
        });
        categoryControl.configureOptions({
          getOptions: () => references().categories,
          createOption: (name) =>
            stageEntity(
              "category",
              name,
              window.ImportUtils.suggestBudgetType(row),
            ),
          onCreate: () => {},
        });
        personControl.configureOptions({
          getOptions: () => references().people,
          createOption: (name) => stageEntity("assignment", name),
          onCreate: () => {},
        });
        vendorControl.value = row.vendorId;
        categoryControl.value = row.categoryId;
        personControl.value = row.personId;
      });
    }

    function renderInvestmentRows() {
      const account = window.InvestmentAPI.accounts().find(
        (item) => item.id === state.profile.investmentAccountId,
      );
      const cards = filteredRows()
        .map((row) => {
          const expanded = state.expandedInvestmentMonths.has(row.stagingId);
          const contributions = row.flows
            .filter((flow) => Number(flow.amount) > 0)
            .reduce((sum, flow) => sum + Number(flow.amount), 0);
          const withdrawals = Math.abs(
            row.flows
              .filter((flow) => Number(flow.amount) < 0)
              .reduce((sum, flow) => sum + Number(flow.amount), 0),
          );
          const netFlow = contributions - withdrawals;
          const netLabel = netFlow < 0 ? "Net withdrawal" : "Net contribution";
          const balanceHint =
            row.balanceOrigin === "csv" && row.balanceSourceDate
              ? `Latest CSV balance from ${row.balanceSourceDate}`
              : row.balanceOrigin === "existing"
                ? "Existing Sheet balance"
                : "";
          return `<article class="investment-import-month-card${row.errors.length ? " has-errors" : ""}${row.queued ? " queued" : ""}" data-staging-id="${row.stagingId}">
          <div class="investment-import-month-header">
            <label class="investment-import-include"><input type="checkbox" aria-label="Include ${escapeHTML(row.month || "investment month")}" data-row-field="include"${row.include ? " checked" : ""}${row.queued ? " disabled" : ""} /><span class="sr-only">Include month</span></label>
            <div class="investment-import-month-field"><month-picker label="Month" data-row-field="month" value="${escapeHTML(row.month || "")}"${row.queued ? " inert" : ""}></month-picker></div>
            <label class="import-field investment-import-balance"><span>Ending balance</span><input type="number" step="0.01" min="0" data-row-field="balance" value="${numericInputValue(row.balance)}"${balanceHint ? ` title="${escapeHTML(balanceHint)}"` : ""}${row.queued ? " disabled" : ""} /></label>
            <div class="investment-import-totals"><span class="positive">+${money(contributions)} contributions</span><span class="negative">−${money(withdrawals)} withdrawals</span><strong class="${netFlow < 0 ? "negative" : "positive"}">${netLabel}: ${money(Math.abs(netFlow))}</strong></div>
            <div class="import-status investment-import-status">${statusMarkup(row)}</div>
            <button class="investment-import-toggle" type="button" data-import-action="toggle-investment-month" aria-expanded="${expanded}" aria-controls="${row.stagingId}-flows"><span aria-hidden="true">${expanded ? "▾" : "▸"}</span><span class="sr-only">${expanded ? "Collapse" : "Expand"} cash flows</span></button>
          </div>
          <div class="investment-import-flow-list" id="${row.stagingId}-flows"${expanded ? "" : " hidden"}>
            ${
              row.flows.length
                ? row.flows
                    .map(
                      (
                        flow,
                      ) => `<div class="investment-import-flow" data-flow-id="${escapeHTML(flow.id)}">
              <time>${escapeHTML(flow.sourceDate || row.month || "No date")}</time>
              <span class="investment-import-flow-source ${Number(flow.amount) < 0 ? "negative" : "positive"}">${Number(flow.amount) < 0 ? "Withdrawal" : "Contribution"}</span>
              <input type="number" step="0.01" data-flow-id="${escapeHTML(flow.id)}" value="${numericInputValue(flow.amount)}" aria-label="${escapeHTML(flow.sourceColumn)} amount"${row.queued ? " disabled" : ""} />
              <button class="text-button" type="button" data-import-action="remove-investment-flow" data-flow-id="${escapeHTML(flow.id)}"${row.queued ? " disabled" : ""}>Remove</button>
            </div>`,
                    )
                    .join("")
                : '<p class="investment-import-empty">No nonzero cash flows remain for this month.</p>'
            }
          </div>
        </article>`;
        })
        .join("");
      root.querySelector("#import-investment-review").innerHTML =
        `<div class="investment-import-account"><span>Importing to</span><strong>${escapeHTML(account?.name || "Unknown account")}</strong></div><div class="investment-import-month-list">${cards || '<p class="investment-import-empty">No months match this filter.</p>'}</div>`;
    }

    function renderReview() {
      validateRows();
      renderSummary();
      renderFilters();
      const budget = state.profile.target === "budget";
      root.querySelector("#import-budget-review").hidden = !budget;
      root.querySelector("#import-investment-review").hidden = budget;
      if (budget) renderBudgetRows();
      else renderInvestmentRows();
      const included = state.rows.filter((row) => row.include && !row.queued);
      const commitButton = root.querySelector('[data-import-action="commit"]');
      const connected = Boolean(window.BudgetAPI.getConfig().endpoint);
      const online =
        typeof navigator === "undefined" || navigator.onLine !== false;
      commitButton.disabled =
        !included.length ||
        included.some((row) => row.errors.length) ||
        !connected ||
        !online;
      commitButton.title = !connected
        ? "Connect a Google Sheet in Settings before importing."
        : !online
          ? "Reconnect to the internet before importing."
          : "";
    }

    async function handleFileChange() {
      const file = fileInput.files?.[0];
      if (!file) return;
      message(root.querySelector("#import-file-message"), "Reading CSV…");
      try {
        state.parsed = window.ImportUtils.parseCSV(await file.text());
        state.profile = null;
        state.rows = [];
        state.mappingWizard = null;
        state.commit = null;
        state.expandedInvestmentMonths.clear();
        resetDraftEntities();
        mappingStep.hidden = true;
        reviewStep.hidden = true;
        progressStep.hidden = true;
        profileStep.hidden = false;
        window.AppRouter.setNavigationGuard(null);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        renderSourcePreview();
        profileOptions();
        const matches = state.profiles.filter(
          (profile) => profile.headerSignature === state.parsed.signature,
        );
        if (matches.length === 1) {
          profileForm.elements.profileId.value = matches[0].id;
          chooseProfileCandidate();
          message(
            profileMessage,
            `Suggested profile: ${matches[0].name}. Confirm to apply it.`,
            "success",
          );
        } else if (matches.length > 1)
          message(
            profileMessage,
            `${matches.length} profiles match these headings. Choose one to continue.`,
          );
        else {
          profileForm.elements.profileId.value = "";
          chooseProfileCandidate();
          message(
            profileMessage,
            "No exact header match. Create a profile or choose one to remap.",
          );
        }
        message(
          root.querySelector("#import-file-message"),
          `${state.parsed.rows.length} data rows and ${state.parsed.headers.length} columns detected.${state.parsed.warnings.length ? ` ${state.parsed.warnings.length} warning(s).` : ""}`,
          state.parsed.warnings.length ? "" : "success",
        );
      } catch (error) {
        message(
          root.querySelector("#import-file-message"),
          error.message,
          "error",
        );
      }
    }

    function profileMappingIsUsable(profile) {
      if (!profile || profile.headerSignature !== state.parsed.signature)
        return false;
      const map = profile.columnMapping || {};
      const indexes =
        profile.target === "investment"
          ? [map.month, map.balance, ...(map.contributions || [])]
          : [
              map.date,
              map.vendorDescription,
              map.categoryDescription,
              map.personDescription,
              map.notes,
              profile.amountMode === "debitCredit" ? map.debit : map.amount,
              profile.amountMode === "debitCredit" ? map.credit : null,
            ];
      if (
        indexes
          .filter((value) => window.ImportUtils.columnIndex(value) !== null)
          .some(
            (value) =>
              window.ImportUtils.columnIndex(value) >=
              state.parsed.headers.length,
          )
      )
        return false;
      try {
        validateMapping(map, profile.amountMode);
        if (
          profile.target === "budget" &&
          !window.ImportUtils.validDateFormats(state.parsed, map.date).includes(
            profile.dateFormat,
          )
        )
          return false;
        if (
          profile.target === "investment" &&
          (!window.ImportUtils.validMonthFormats(
            state.parsed,
            map.month,
          ).includes(profile.dateFormat) ||
            !state.parsed.rows.every((row) =>
              Boolean(
                window.ImportUtils.parseDate(
                  window.ImportUtils.valueAt(row, map.month),
                  profile.dateFormat,
                ),
              ),
            ))
        )
          return false;
        return true;
      } catch {
        return false;
      }
    }

    async function handleProfileSubmit(event) {
      event.preventDefault();
      message(profileMessage, "");
      try {
        if (!state.parsed) throw new Error("Upload a CSV first.");
        const selected = state.profiles.find(
          (item) => item.id === profileForm.elements.profileId.value,
        );
        const target = profileForm.elements.target.value;
        const input = {
          ...(selected || {}),
          name: profileForm.elements.name.value,
          target,
          investmentAccountId:
            target === "investment"
              ? profileForm.elements.investmentAccountId.value
              : "",
          headerSignature: selected?.headerSignature || state.parsed.signature,
          columnMapping: selected?.columnMapping || {},
          dateFormat:
            selected?.dateFormat ||
            (target === "investment" ? "YYYY-MM" : "YYYY-MM-DD"),
          amountMode:
            selected?.amountMode ||
            (target === "budget" ? "unified" : "monthly"),
          amountMultiplier: selected?.amountMultiplier || 1,
        };
        if (selected) {
          state.bundle = await window.ImportAPI.loadProfileBundle(selected.id, {
            refresh: true,
          });
          state.profile = {
            ...state.bundle.profile,
            name: input.name,
            target,
            investmentAccountId: input.investmentAccountId,
          };
          if (profileMappingIsUsable(state.profile)) {
            state.mappingWizard = null;
            stageRows();
            reviewStep.scrollIntoView({ behavior: "smooth", block: "start" });
            message(
              profileMessage,
              `${state.profile.name} matched these headings and was applied.`,
              "success",
            );
            return;
          }
          message(
            profileMessage,
            "This profile does not exactly match the CSV headings or has an incomplete mapping. Review the column mapping before staging rows.",
            "error",
          );
        } else {
          state.profile = window.ImportAPI.createProfileDraft({
            ...input,
            headerSignature: state.parsed.signature,
          });
          state.bundle = {
            profile: state.profile,
            vendorMappings: [],
            personMappings: [],
          };
        }
        state.mappingWizard = null;
        renderMapper();
        mappingStep.hidden = false;
        reviewStep.hidden = true;
        mappingStep.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        message(profileMessage, error.message, "error");
      }
    }

    async function handleMappingSubmit(event) {
      event.preventDefault();
      message(mappingMessage, "");
      try {
        captureWizardControls();
        validateWizardStep();
        if (state.mappingWizard.step < wizardSteps().length - 1) {
          state.mappingWizard.step += 1;
          state.mappingWizard.maxVisited = Math.max(
            state.mappingWizard.maxVisited,
            state.mappingWizard.step,
          );
          renderMapper();
          return;
        }
        const columnMapping = buildColumnMapping();
        const amountMode =
          state.profile.target === "budget"
            ? state.mappingWizard.amountMode
            : "monthly";
        validateMapping(columnMapping, amountMode);
        state.profile = window.ImportAPI.createProfileDraft({
          ...state.profile,
          headerSignature: state.parsed.signature,
          columnMapping,
          dateFormat: state.mappingWizard.dateFormat,
          amountMode,
          amountMultiplier:
            state.profile.target === "budget"
              ? state.mappingWizard.mapping.amountSignConvention ===
                "expensesNegative"
                ? -1
                : 1
              : 1,
        });
        state.bundle = { ...state.bundle, profile: state.profile };
        stageRows();
        reviewStep.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        message(mappingMessage, error.message, "error");
      }
    }

    function rowFromElement(element) {
      return state.rows.find(
        (row) =>
          row.stagingId ===
          element.closest("[data-staging-id]")?.dataset.stagingId,
      );
    }

    function applyReference(row, field, value) {
      const vendor = field === "vendorId";
      const normalized = vendor
        ? row.normalizedVendorDescription
        : row.normalizedPersonDescription;
      const resolutionField = vendor ? "vendorResolution" : "personResolution";
      const target = vendor ? state.pendingVendors : state.pendingPeople;
      const firstResolution = Boolean(
        normalized &&
        value &&
        row[resolutionField] === "unresolved" &&
        !target.has(normalized),
      );
      row[field] = value;
      row[resolutionField] = "custom";
      if (!firstResolution) return;
      window.ImportUtils.fillBlankMatches(
        state.rows,
        field,
        normalized,
        (item) =>
          vendor
            ? item.normalizedVendorDescription
            : item.normalizedPersonDescription,
        value,
        (item) => {
          item[resolutionField] = "pending";
        },
      );
      target.set(
        normalized,
        vendor
          ? { sourceDescription: row.vendorDescription, vendorId: value }
          : { sourceDescription: row.personDescription, assignmentId: value },
      );
    }

    function applyCategory(row, value) {
      row.categoryId = value;
      const category = references().categories.find(
        (item) => item.id === value,
      );
      if (category?.type === "income") row.vendorId = "";
      const key =
        row.normalizedCategoryDescription || row.normalizedVendorDescription;
      if (!value || !key || state.resolvedCategoryMatches.has(key)) return;
      state.resolvedCategoryMatches.add(key);
      window.ImportUtils.fillBlankMatches(
        state.rows,
        "categoryId",
        key,
        (item) =>
          item.normalizedCategoryDescription ||
          item.normalizedVendorDescription,
        value,
        (item) => {
          if (category?.type === "income") item.vendorId = "";
        },
      );
    }

    function handleReviewChange(event) {
      const row = rowFromElement(event.target);
      if (!row || row.queued) return;
      const field = event.target.dataset.rowField;
      const flowId = event.target.dataset.flowId;
      if (!flowId && !field) return;
      if (flowId) {
        const flow = row.flows?.find((item) => item.id === flowId);
        if (flow)
          flow.amount =
            event.target.value === "" ? null : Number(event.target.value);
      }
      if (field === "include") row.include = event.target.checked;
      else if (field === "amount" || field === "balance") {
        row[field] =
          event.target.value === "" ? null : Number(event.target.value);
        if (field === "amount") row.amountEdited = true;
        if (field === "balance") row.balanceOrigin = "manual";
      } else if (field === "vendorId" || field === "personId")
        applyReference(row, field, event.target.value);
      else if (field) {
        const priorMonth = field === "month" ? row.month : "";
        row[field] = event.target.value;
        if (field === "month" && priorMonth !== row.month) {
          row.existing = window.InvestmentAPI.monthData(
            row.accountId,
            row.month,
          );
          if (!row.existing?.balance && !row.existing?.contributions?.length)
            row.existing = null;
          if (row.balanceOrigin === "existing") {
            row.balance = row.existing?.balance
              ? Number(row.existing.balance.balance)
              : null;
            row.balanceOrigin = row.existing?.balance ? "existing" : "";
          }
        }
        if (
          field === "categoryId" &&
          references().categories.find((item) => item.id === row.categoryId)
            ?.type === "income"
        )
          row.vendorId = "";
      }
      renderReview();
    }

    function handleReviewDateChange(event) {
      const row = rowFromElement(event.target);
      if (!row || row.queued || state.profile?.target !== "budget") return;
      row.date = event.detail?.value || "";
      renderReview();
    }

    function handleReviewSelection(event) {
      const row = rowFromElement(event.target);
      if (!row || row.queued) return;
      if (event.type === "vendor-selected")
        applyReference(row, "vendorId", event.target.value);
      if (event.type === "person-selected")
        applyReference(row, "personId", event.target.value);
      if (event.type === "category-selected")
        applyCategory(row, event.target.value);
      queueMicrotask(renderReview);
    }

    function handleMappingChange(event) {
      captureWizardControls(event.target.name);
      const rerender =
        state.profile?.target === "investment"
          ? ["month", "balance", "hasBalance", "contributions"].includes(
              event.target.name,
            )
          : [
              "date",
              "amountMode",
              "amount",
              "debit",
              "credit",
              "hasCategory",
              "hasPerson",
              "hasNotes",
            ].includes(event.target.name);
      if (rerender) renderMapper();
    }

    function handleWizardNavigation(event) {
      const control = event.target.closest("[data-wizard-step]");
      if (!control || !state.mappingWizard || control.disabled) return;
      captureWizardControls();
      state.mappingWizard.step = Number(control.dataset.wizardStep);
      renderMapper();
      mappingStep.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const COMMIT_STEPS = [
      ["profile", "Creating or updating the import profile"],
      ["headers", "Saving column-header and auto-population mappings"],
      ["vendor", "Creating new vendors"],
      ["category", "Creating categories"],
      ["assignment", "Creating people"],
      ["associations", "Saving vendor and person associations"],
      ["records", "Saving imported records"],
    ];

    function renderCommitProgress() {
      if (!state.commit) return;
      root.querySelector("#import-commit-progress").innerHTML =
        state.commit.steps
          .map(
            (step) => `
        <li class="${step.status}">
          <span class="import-progress-icon" aria-hidden="true">${step.status === "complete" ? "✓" : step.status === "running" ? "…" : step.status === "failed" ? "!" : step.status === "skipped" ? "–" : ""}</span>
          <span><strong>${escapeHTML(step.label)}</strong>${step.detail ? `<small>${escapeHTML(step.detail)}</small>` : ""}</span>
        </li>`,
          )
          .join("");
      const retry = root.querySelector('[data-import-action="retry-commit"]');
      const back = root.querySelector('[data-import-action="return-review"]');
      const finish = root.querySelector('[data-import-action="finish-import"]');
      const sync = root.querySelector('[data-import-action="open-sync"]');
      retry.hidden = state.commit.status !== "failed";
      back.hidden =
        state.commit.status !== "failed" ||
        Boolean(state.commit.checkpoint.recordIds?.length);
      finish.hidden = state.commit.status !== "complete";
      sync.hidden = state.commit.status !== "complete";
      root.querySelector("#import-progress-summary").textContent =
        state.commit.status === "complete"
          ? `${state.commit.included.length} ${state.profile.target === "investment" ? (state.commit.included.length === 1 ? "month was" : "months were") : state.commit.included.length === 1 ? "row was" : "rows were"} confirmed in Google Sheets.`
          : "Keep this page open while each step is confirmed in Google Sheets.";
    }

    function updateCommitStep(key, status, detail = "") {
      const step = state.commit.steps.find((item) => item.key === key);
      if (step) Object.assign(step, { status, detail });
      renderCommitProgress();
    }

    function remapEntity(kind, requestedId, record) {
      const field =
        kind === "vendor"
          ? "vendorId"
          : kind === "category"
            ? "categoryId"
            : "personId";
      state.rows.forEach((row) => {
        if (row[field] === requestedId) row[field] = record.id;
      });
      state.pendingVendors.forEach((mapping) => {
        if (kind === "vendor" && mapping.vendorId === requestedId)
          mapping.vendorId = record.id;
      });
      state.pendingPeople.forEach((mapping) => {
        if (kind === "assignment" && mapping.assignmentId === requestedId)
          mapping.assignmentId = record.id;
      });
      const entries = state.draftEntities[kind];
      for (const [key, item] of entries) {
        if (item.id === requestedId) entries.delete(key);
      }
    }

    function usedDraftEntities(kind) {
      const field =
        kind === "vendor"
          ? "vendorId"
          : kind === "category"
            ? "categoryId"
            : "personId";
      const used = new Set(
        state.commit.included.map((row) => row[field]).filter(Boolean),
      );
      return [...state.draftEntities[kind].values()].filter((item) =>
        used.has(item.id),
      );
    }

    async function commitEntityKind(kind) {
      const items = usedDraftEntities(kind);
      if (!items.length) {
        updateCommitStep(kind, "skipped", "No new items needed");
        return;
      }
      updateCommitStep(kind, "running", `0 of ${items.length}`);
      try {
        const resolved = await window.BudgetAPI.commitImportedEntities(
          items.map((record) => ({ kind, record })),
          ({ completed, total }) =>
            updateCommitStep(kind, "running", `${completed} of ${total}`),
        );
        resolved.forEach((item) =>
          remapEntity(item.kind, item.requestedId, item.record),
        );
        updateCommitStep(kind, "complete", `${items.length} confirmed`);
      } catch (error) {
        (error.partialResults || []).forEach((item) =>
          remapEntity(item.kind, item.requestedId, item.record),
        );
        throw error;
      }
    }

    function relevantMappings() {
      const vendorKeys = new Set(
        state.commit.included
          .map((row) => row.normalizedVendorDescription)
          .filter(Boolean),
      );
      const personKeys = new Set(
        state.commit.included
          .map((row) => row.normalizedPersonDescription)
          .filter(Boolean),
      );
      return {
        vendorMappings: [...state.pendingVendors]
          .filter(([key]) => vendorKeys.has(key))
          .map(([, value]) => value),
        personMappings: [...state.pendingPeople]
          .filter(([key]) => personKeys.has(key))
          .map(([, value]) => value),
      };
    }

    async function commitRecords() {
      const checkpoint = state.commit.checkpoint;
      if (state.profile.target === "budget") {
        if (!checkpoint.recordIds) {
          const queued = window.BudgetAPI.queueImportedTransactions(
            state.commit.included.map((row) => ({
              date: row.date,
              amount: row.amount,
              type: row.type,
              categoryId: row.categoryId,
              vendorId: row.type === "income" ? "" : row.vendorId,
              assignmentId: row.personId,
              notes: row.notes,
            })),
          );
          checkpoint.recordIds = queued.map((item) => item.id);
        } else {
          checkpoint.recordIds.forEach((id) => {
            const item = window.BudgetAPI.getTransactionOutboxItem(id);
            if (
              item?.status === "failed" ||
              (item?.status === "pending" && item.attempts > 0)
            )
              window.BudgetAPI.retryTransaction(id);
          });
        }
        await window.BudgetAPI.awaitImportedTransactions(
          checkpoint.recordIds,
          ({ completed, total }) =>
            updateCommitStep(
              "records",
              "running",
              `${completed} of ${total} transactions confirmed`,
            ),
        );
      } else {
        if (!checkpoint.recordIds) {
          const queued = window.InvestmentAPI.queueImportedMonths(
            state.commit.included.map((row) => ({
              accountId: row.accountId,
              month: row.month,
              balance: row.balance,
              balanceId: row.existing?.balance?.id || "",
              existingContributions: row.existing?.contributions || [],
              contributions: row.flows
                .filter(
                  (flow) =>
                    Number.isFinite(Number(flow.amount)) &&
                    Number(flow.amount) !== 0,
                )
                .map((flow) => ({ amount: Number(flow.amount) })),
              notes: row.existing?.balance?.notes || "",
            })),
          );
          checkpoint.recordIds = queued.map((item) => item.syncOperationId);
        } else {
          checkpoint.recordIds.forEach((id) =>
            window.InvestmentAPI.retry("investmentMonth", id),
          );
        }
        await window.InvestmentAPI.awaitImportedMonths(
          checkpoint.recordIds,
          ({ completed, total }) =>
            updateCommitStep(
              "records",
              "running",
              `${completed} of ${total} months confirmed`,
            ),
        );
      }
    }

    function guardNavigation() {
      return (
        !state.commit ||
        state.commit.status === "complete" ||
        window.confirm(
          "This import has not finished committing. Leave and lose the on-screen retry progress?",
        )
      );
    }

    function handleBeforeUnload(event) {
      if (!state.commit || state.commit.status === "complete") return;
      event.preventDefault();
      event.returnValue = "";
    }

    async function commitImport(retry = false) {
      if (!window.BudgetAPI.getConfig().endpoint)
        throw new Error("Connect a Google Sheet in Settings before importing.");
      if (typeof navigator !== "undefined" && navigator.onLine === false)
        throw new Error("Reconnect to the internet before importing.");
      validateRows();
      const included = retry
        ? state.commit.included
        : state.rows.filter((row) => row.include && !row.queued);
      if (!included.length || included.some((row) => row.errors.length))
        throw new Error(
          "Resolve all errors on included rows before importing.",
        );
      if (!retry) {
        state.commit = {
          status: "running",
          included,
          checkpoint: {},
          steps: COMMIT_STEPS.map(([key, label]) => ({
            key,
            label,
            status: "pending",
            detail: "",
          })),
        };
      } else {
        state.commit.status = "running";
        state.commit.steps.forEach((step) => {
          if (step.status === "failed" || step.status === "running")
            Object.assign(step, { status: "pending", detail: "" });
        });
      }
      reviewStep.hidden = true;
      progressStep.hidden = false;
      window.AppRouter.setNavigationGuard(guardNavigation);
      window.addEventListener("beforeunload", handleBeforeUnload);
      renderCommitProgress();
      message(root.querySelector("#import-progress-message"), "");

      try {
        if (!state.commit.checkpoint.profile) {
          updateCommitStep("profile", "running");
          state.profile = await window.ImportAPI.saveProfile(state.profile);
          state.commit.checkpoint.profile = true;
          updateCommitStep("profile", "complete", state.profile.name);
          updateCommitStep(
            "headers",
            "complete",
            `${state.parsed.headers.length} columns mapped`,
          );
        } else {
          updateCommitStep("profile", "complete", state.profile.name);
          updateCommitStep(
            "headers",
            "complete",
            `${state.parsed.headers.length} columns mapped`,
          );
        }

        for (const kind of ["vendor", "category", "assignment"]) {
          if (state.profile.target === "investment")
            updateCommitStep(
              kind,
              "skipped",
              "Not used for investment imports",
            );
          else if (
            state.commit.steps.find((step) => step.key === kind)?.status ===
            "complete"
          )
            continue;
          else await commitEntityKind(kind);
        }

        if (!state.commit.checkpoint.associations) {
          const mappings = relevantMappings();
          if (
            state.profile.target === "investment" ||
            (!mappings.vendorMappings.length && !mappings.personMappings.length)
          ) {
            updateCommitStep(
              "associations",
              "skipped",
              "No new associations needed",
            );
          } else {
            updateCommitStep(
              "associations",
              "running",
              `${mappings.vendorMappings.length + mappings.personMappings.length} associations`,
            );
            state.bundle = {
              ...state.bundle,
              ...(await window.ImportAPI.saveMappings(
                state.profile.id,
                mappings,
              )),
            };
            state.commit.checkpoint.associations = true;
            updateCommitStep(
              "associations",
              "complete",
              `${mappings.vendorMappings.length + mappings.personMappings.length} saved`,
            );
          }
        } else updateCommitStep("associations", "complete");

        updateCommitStep("records", "running", `0 of ${included.length}`);
        await commitRecords();
        updateCommitStep("records", "complete", `${included.length} confirmed`);
        included.forEach((row) => {
          row.queued = true;
        });
        state.commit.status = "complete";
        state.profiles = await window.ImportAPI.listProfiles();
        renderCommitProgress();
        message(
          root.querySelector("#import-progress-message"),
          "Import complete. Every selected row was confirmed in Google Sheets.",
          "success",
        );
        window.AppRouter.setNavigationGuard(null);
        window.removeEventListener("beforeunload", handleBeforeUnload);
      } catch (error) {
        state.commit.status = "failed";
        const active = state.commit.steps.find(
          (step) => step.status === "running",
        );
        if (active)
          Object.assign(active, { status: "failed", detail: error.message });
        renderCommitProgress();
        message(
          root.querySelector("#import-progress-message"),
          error.message,
          "error",
        );
      }
    }

    function handleLoadMore(event) {
      state.visibleLimit += PAGE_SIZE;
      renderBudgetRows();
    }

    async function handleAction(event) {
      const action = event.target.closest("[data-import-action]")?.dataset
        .importAction;
      if (!action) return;

      try {
        if (action === "clear") {
          if (!guardNavigation()) return;
          fileInput.value = "";
          state.parsed = null;
          state.profile = null;
          state.rows = [];
          state.mappingWizard = null;
          state.commit = null;
          state.expandedInvestmentMonths.clear();
          resetDraftEntities();
          profileStep.hidden = true;
          mappingStep.hidden = true;
          reviewStep.hidden = true;
          progressStep.hidden = true;
          renderSourcePreview();
          window.AppRouter.setNavigationGuard(null);
          window.removeEventListener("beforeunload", handleBeforeUnload);
          message(
            root.querySelector("#import-file-message"),
            "Import cleared.",
          );
        }
        if (action === "wizard-back") {
          captureWizardControls();
          state.mappingWizard.step = Math.max(0, state.mappingWizard.step - 1);
          renderMapper();
        }
        if (action === "archive-profile") {
          if (
            !profileForm.elements.profileId.value ||
            !window.confirm(
              "Archive this import profile? Saved mappings will be retained.",
            )
          )
            return;
          await window.ImportAPI.archiveProfile(
            profileForm.elements.profileId.value,
          );
          state.profiles = await window.ImportAPI.listProfiles();
          profileOptions();
          profileForm.elements.profileId.value = "";
          chooseProfileCandidate();
          message(profileMessage, "Profile archived.", "success");
        }
        if (action === "back-to-mapping") {
          reviewStep.hidden = true;
          mappingStep.hidden = false;
          if (state.mappingWizard) state.mappingWizard.step = 0;
          renderMapper();
        }
        if (action === "toggle-investment-month") {
          const row = rowFromElement(event.target);
          if (!row) return;
          if (state.expandedInvestmentMonths.has(row.stagingId))
            state.expandedInvestmentMonths.delete(row.stagingId);
          else state.expandedInvestmentMonths.add(row.stagingId);
          renderInvestmentRows();
        }
        if (action === "remove-investment-flow") {
          const row = rowFromElement(event.target);
          const flowId = event.target.closest("[data-flow-id]")?.dataset.flowId;
          if (!row || row.queued || !flowId) return;
          row.flows = row.flows.filter((flow) => flow.id !== flowId);
          renderReview();
        }
        if (action === "commit") await commitImport(false);
        if (action === "retry-commit") await commitImport(true);
        if (action === "return-review") {
          state.commit = null;
          progressStep.hidden = true;
          reviewStep.hidden = false;
          window.AppRouter.setNavigationGuard(null);
          window.removeEventListener("beforeunload", handleBeforeUnload);
          renderReview();
        }
        if (action === "finish-import") {
          state.commit = null;
          progressStep.hidden = true;
          fileInput.value = "";
          state.parsed = null;
          state.profile = null;
          state.rows = [];
          state.mappingWizard = null;
          state.expandedInvestmentMonths.clear();
          resetDraftEntities();
          profileStep.hidden = true;
          mappingStep.hidden = true;
          reviewStep.hidden = true;
          renderSourcePreview();
          message(
            root.querySelector("#import-file-message"),
            "Ready for another CSV.",
          );
        }
        if (action === "open-sync") window.AppRouter.navigate("sync");
        if (action === "load-more") {
          handleLoadMore(event);
        }
      } catch (error) {
        message(reviewMessage, error.message, "error");
      }
    }

    function handleFilter(event) {
      const filter = event.target.closest("[data-import-filter]")?.dataset
        .importFilter;
      if (!filter) return;
      state.filter = filter;
      renderReview();
    }

    function refreshProfiles() {
      window.ImportAPI.listProfiles()
        .then((profiles) => {
          state.profiles = profiles;
          profileOptions();
        })
        .catch((error) =>
          message(
            root.querySelector("#import-file-message"),
            `Profiles could not be loaded: ${error.message}`,
            "error",
          ),
        );
    }

    fileInput.addEventListener("change", handleFileChange);
    profileForm.addEventListener("submit", handleProfileSubmit);
    profileForm.elements.profileId.addEventListener(
      "change",
      chooseProfileCandidate,
    );
    profileForm.elements.target.addEventListener("change", updateTargetFields);
    mappingForm.addEventListener("submit", handleMappingSubmit);
    mappingForm.addEventListener("change", handleMappingChange);
    root.addEventListener("change", handleReviewChange);
    root.addEventListener("date-change", handleReviewDateChange);
    root.addEventListener("vendor-selected", handleReviewSelection);
    root.addEventListener("person-selected", handleReviewSelection);
    root.addEventListener("category-selected", handleReviewSelection);
    root.addEventListener("click", handleAction);
    root.addEventListener("click", handleFilter);
    root.addEventListener("click", handleWizardNavigation);
    window.addEventListener("budget:import-profiles-changed", refreshProfiles);

    accountOptions();
    updateTargetFields();
    refreshProfiles();

    cleanup = () => {
      fileInput.removeEventListener("change", handleFileChange);
      profileForm.removeEventListener("submit", handleProfileSubmit);
      profileForm.elements.profileId.removeEventListener(
        "change",
        chooseProfileCandidate,
      );
      profileForm.elements.target.removeEventListener(
        "change",
        updateTargetFields,
      );
      mappingForm.removeEventListener("submit", handleMappingSubmit);
      mappingForm.removeEventListener("change", handleMappingChange);
      root.removeEventListener("change", handleReviewChange);
      root.removeEventListener("date-change", handleReviewDateChange);
      root.removeEventListener("vendor-selected", handleReviewSelection);
      root.removeEventListener("person-selected", handleReviewSelection);
      root.removeEventListener("category-selected", handleReviewSelection);
      root.removeEventListener("click", handleAction);
      root.removeEventListener("click", handleFilter);
      root.removeEventListener("click", handleWizardNavigation);
      window.removeEventListener(
        "budget:import-profiles-changed",
        refreshProfiles,
      );
      window.AppRouter.setNavigationGuard(null);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }
  window.ImportRoute = { mount, unmount };
})();
