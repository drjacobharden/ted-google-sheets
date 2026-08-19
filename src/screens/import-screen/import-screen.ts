import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import { dateRangeDetail, eventTargetElement, isInvestmentSource, type DateRangePickerElement, type DateRangeValue } from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import type { BudgetEntity, EntityKind, ImportedEntityResolution, TransactionType } from "../../api/budget-api";
import type { AmountMode, ImportColumnMapping, ImportMapping, ImportProfile, ImportTarget } from "../../api/import-api";
import { importUtilities, type ImportColumnKey, type ImportColumnReference, type ImportReferences, type ParsedImport, type StagedImportRow } from "../../utilities/import-runtime";
import { escapeHTML, messageFromError, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;
let cleanup: (() => void) | null = null;
const PAGE_SIZE = 50;

type ImportFilter = "all" | "errors" | "excluded" | "ready" | "vendors" | "people" | "categories";
type CommitStatus = "pending" | "running" | "failed" | "complete" | "skipped";

interface WizardMapping {
  date: ImportColumnReference;
  amount: ImportColumnReference;
  debit: ImportColumnReference;
  credit: ImportColumnReference;
  vendorDescription: ImportColumnReference;
  categoryDescription: ImportColumnReference;
  personDescription: ImportColumnReference;
  notes: ImportColumnReference;
  month: ImportColumnReference;
  balance: ImportColumnReference;
  contributions: number[];
  amountSignConvention: "expensesNegative" | "expensesPositive";
}

interface MappingWizard {
  profileId: string;
  step: number;
  maxVisited: number;
  mapping: WizardMapping;
  dateFormat: string;
  amountMode: "unified" | "debitCredit";
  hasCategory: boolean;
  hasPerson: boolean;
  hasNotes: boolean;
  hasBalance: boolean;
  autoPopulateVendor: boolean;
  autoPopulateCategory: boolean;
  autoPopulatePerson: boolean;
}

interface ImportBundleState {
  profile?: ImportProfile;
  vendorMappings: ImportMapping[];
  personMappings: ImportMapping[];
}

interface ImportRoot extends HTMLElement {
  querySelector<E extends HTMLElement = HTMLElement>(selectors: string): E;
}

interface ImportSelectControl extends HTMLElement {
  value: string;
  configureOptions(options: {
    getOptions: () => BudgetEntity[];
    createOption: (name: string) => BudgetEntity;
    onCreate: () => void;
  }): void;
}

interface ImportCommitStep { key: string; label: string; status: CommitStatus; detail: string; }
interface ImportCommit {
  status: "running" | "failed" | "complete";
  included: StagedImportRow[];
  checkpoint: { profile?: boolean; associations?: boolean; recordIds?: string[] };
  steps: ImportCommitStep[];
}

interface ImportState {
  parsed: ParsedImport;
  profiles: ImportProfile[];
  profile: ImportProfile;
  bundle: ImportBundleState;
  rows: StagedImportRow[];
  pendingVendors: Map<string, ImportMapping>;
  pendingPeople: Map<string, ImportMapping>;
  filter: ImportFilter;
  target: ImportTarget;
  mappingWizard: MappingWizard;
  draftEntities: Record<EntityKind, Map<string, BudgetEntity>>;
  resolvedCategoryMatches: Set<string>;
  expandedInvestmentMonths: Set<string>;
  commit: ImportCommit;
  visibleLimit: number;
}

interface ImportProfileControls extends HTMLFormControlsCollection {
  profileId: HTMLSelectElement;
  target: HTMLSelectElement;
  name: HTMLInputElement;
  investmentAccountId: HTMLSelectElement;
}

interface ImportProfileForm extends HTMLFormElement { readonly elements: ImportProfileControls; }

interface ImportMappingForm extends HTMLFormElement {
  readonly elements: HTMLFormControlsCollection & Record<string, HTMLInputElement>;
}

type WizardField = Exclude<ImportColumnKey, "month" | "balance">;
type ImportControlEvent = Event & { target: HTMLInputElement };
type ImportDateEvent = CustomEvent<{ value?: string }> & { target: HTMLInputElement };

/** Extracts successfully committed entity records from an API failure. */
function partialEntityResults(error: unknown): ImportedEntityResolution[] {
  if (typeof error !== "object" || error === null || !("partialResults" in error)) {
    return [];
  }
  const results = error.partialResults;
  if (!Array.isArray(results)) return [];
  return results.filter((item): item is ImportedEntityResolution => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Record<string, unknown>;
    return (
      (candidate.kind === "vendor" ||
        candidate.kind === "category" ||
        candidate.kind === "assignment") &&
      typeof candidate.requestedId === "string" &&
      typeof candidate.record === "object" &&
      candidate.record !== null
    );
  });
}

  /** Mounts the complete CSV import workflow into its route component. */
  function mount(root: ImportRoot): void {
    const importUtils = importUtilities();
    const state: ImportState = {
      parsed: null as unknown as ParsedImport,
      profiles: [],
      profile: null as unknown as ImportProfile,
      bundle: { vendorMappings: [], personMappings: [] },
      rows: [],
      pendingVendors: new Map(),
      pendingPeople: new Map(),
      filter: "all",
      target: "budget",
      mappingWizard: null as unknown as MappingWizard,
      draftEntities: {
        vendor: new Map(),
        category: new Map(),
        assignment: new Map(),
      },
      resolvedCategoryMatches: new Set(),
      expandedInvestmentMonths: new Set(),
      commit: null as unknown as ImportCommit,
      visibleLimit: PAGE_SIZE,
    };
    root.append(template.content.cloneNode(true));

    const fileInput = root.querySelector<HTMLInputElement>("#import-file")!;
    const profileStep = root.querySelector<HTMLElement>("#import-profile-step")!;
    const mappingStep = root.querySelector<HTMLElement>("#import-mapping-step")!;
    const reviewStep = root.querySelector<HTMLElement>("#import-review-step")!;
    const progressStep = root.querySelector<HTMLElement>("#import-progress-step")!;
    const profileForm = root.querySelector<ImportProfileForm>("#import-profile-form")!;
    const mappingForm = root.querySelector<ImportMappingForm>("#import-mapping-form")!;
    const profileMessage = root.querySelector<HTMLElement>("#import-profile-message")!;
    const mappingMessage = root.querySelector<HTMLElement>("#import-mapping-message")!;
    const reviewMessage = root.querySelector<HTMLElement>("#import-review-message")!;
    const loadMoreButton = root.querySelector<HTMLButtonElement>(
      '[data-import-action="load-more"]',
    )!;

    /** Displays a status message with an optional visual state. */
    const message = (element: HTMLElement, text: string, kind = ""): void => {
      element.textContent = text || "";
      element.className = `import-message${kind ? ` ${kind}` : ""}`;
    };

    /** Renders the saved import profiles in the profile selector. */
    function profileOptions(): void {
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

    /** Renders active investment accounts in the target-account selector. */
    function accountOptions(): void {
      const accounts = APIs.investment.accounts().filter(
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

    /** Updates target-specific profile fields and validation. */
    function updateTargetFields(): void {
      const investment = profileForm.elements.target.value === "investment";
      root.querySelector("[data-investment-account-field]").hidden =
        !investment;
      profileForm.elements.investmentAccountId.required = investment;
      state.target = investment ? "investment" : "budget";
    }

    /** Applies the selected profile's values to the profile form. */
    function chooseProfileCandidate(): void {
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

    /** Renders a short preview of the uploaded CSV. */
    function renderSourcePreview(): void {
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

    /** Creates budget mapping-wizard state from saved and inferred mappings. */
    function createBudgetWizardState(): MappingWizard {
      const profile = state.profile;
      const existing = profile.columnMapping || {};
      const suggested = importUtils.suggestBudgetMapping(state.parsed);
      /** Chooses a saved or inferred budget column index. */
      const pick = (field: WizardField): ImportColumnReference =>
        importUtils.columnIndex(existing[field]) ??
        importUtils.columnIndex(suggested[field]) ??
        null;
      const date = pick("date");
      const formats = importUtils.validDateFormats(state.parsed, date);
      const existingFormat = formats.includes(profile.dateFormat)
        ? profile.dateFormat
        : null;
      const hasExistingAmountMapping =
        importUtils.columnIndex(existing.amount) !== null ||
        importUtils.columnIndex(existing.debit) !== null ||
        importUtils.columnIndex(existing.credit) !== null;
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
          ? importUtils.columnIndex(existing.categoryDescription) !==
            null
          : suggested.categoryDescription !== null,
        hasPerson: Object.prototype.hasOwnProperty.call(
          existing,
          "personDescription",
        )
          ? importUtils.columnIndex(existing.personDescription) !== null
          : suggested.personDescription !== null,
        hasNotes: Object.prototype.hasOwnProperty.call(existing, "notes")
          ? importUtils.columnIndex(existing.notes) !== null
          : suggested.notes !== null,
        autoPopulateVendor: existing.autoPopulateVendor === true,
        autoPopulateCategory: existing.autoPopulateCategory === true,
        autoPopulatePerson: existing.autoPopulatePerson === true,
      } as MappingWizard;
    }

    /** Creates investment mapping-wizard state from saved and inferred mappings. */
    function createInvestmentWizardState(): MappingWizard {
      const profile = state.profile;
      const existing = profile.columnMapping || {};
      const suggested = importUtils.suggestInvestmentMapping(
        state.parsed,
      );
      /** Chooses a saved or inferred investment column index. */
      const pick = (field: "month" | "balance"): ImportColumnReference =>
        importUtils.columnIndex(existing[field]) ??
        importUtils.columnIndex(suggested[field]) ??
        null;
      const hasSavedContributions = Object.prototype.hasOwnProperty.call(
        existing,
        "contributions",
      );
      const contributionSource = hasSavedContributions
        ? existing.contributions
        : suggested.contributions;
      const contributions = (Array.isArray(contributionSource) ? contributionSource : [])
        .map(importUtils.columnIndex)
        .filter((value): value is number => value !== null);
      const month = pick("month");
      const formats = importUtils.validMonthFormats(state.parsed, month);
      return {
        profileId: profile.id,
        step: 0,
        maxVisited: 0,
        mapping: { month, balance: pick("balance"), contributions },
        dateFormat: formats.includes(profile.dateFormat)
          ? profile.dateFormat
          : suggested.dateFormat,
        hasBalance: Object.prototype.hasOwnProperty.call(existing, "balance")
          ? importUtils.columnIndex(existing.balance) !== null
          : suggested.balance !== null,
      } as MappingWizard;
    }

    /** Returns the step labels for the current import target. */
    function wizardSteps(): string[] {
      return state.profile?.target === "investment"
        ? INVESTMENT_WIZARD_STEPS
        : BUDGET_WIZARD_STEPS;
    }

    /** Returns the budget fields currently selected in the wizard. */
    function wizardFields(): Record<WizardField, ImportColumnReference> {
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

    /** Renders eligible CSV header options for a budget field. */
    function wizardHeaderOptions(
      field: WizardField,
      predicate?: (index: number) => boolean,
      empty = "Choose a column",
    ): string {
      const fields = wizardFields();
      const selected = importUtils.columnIndex(fields[field]);
      const stepFor: Record<WizardField, number> = {
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
            ([rawName, value]) => {
              const name = rawName as WizardField;
              return (
              name !== field &&
              active.has(name) &&
              importUtils.columnIndex(value) !== null &&
              (stepFor[name] < stepFor[field] ||
                (stepFor[name] === stepFor[field] &&
                  ["debit", "credit"].includes(name)))
              );
            },
          )
          .map(([, value]) => importUtils.columnIndex(value)),
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
              importUtils.headerScore(
                right,
                field === "vendorDescription"
                  ? "vendor"
                  : field === "categoryDescription"
                    ? "category"
                    : field === "personDescription"
                      ? "person"
                      : field,
              ) -
                importUtils.headerScore(
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

    /** Renders sample values for a mapped CSV column. */
    function wizardSamples(
      mapping: ImportColumnReference,
      transform?: (value: string) => string | null | undefined,
    ): string {
      const values = importUtils.columnValues(
        state.parsed,
        mapping,
      ).slice(0, 5);
      return `<div class="import-wizard-samples"><strong>Sample values</strong>${values.length ? `<ul>${values.map((value) => `<li>${escapeHTML(transform ? `${value} → ${transform(value) || "invalid"}` : value)}</li>`).join("")}</ul>` : "<p>Choose a column to see examples.</p>"}</div>`;
    }

    /** Renders the mapping wizard's progress navigation. */
    function wizardNavigation(): string {
      const wizard = state.mappingWizard;
      const steps = wizardSteps();
      return `<ol class="import-wizard-progress" style="--wizard-step-count: ${steps.length}" aria-label="Column mapping progress">${steps.map((label, index) => `<li><button type="button" data-wizard-step="${index}"${index > wizard.maxVisited ? " disabled" : ""}${index === wizard.step ? ' aria-current="step" class="active"' : ""}><span>${index + 1}</span>${label}</button></li>`).join("")}</ol>`;
    }

    /** Renders mapping wizard navigation actions. */
    function wizardActions(final = false): string {
      return `<div class="import-actions">${state.mappingWizard.step > 0 ? '<button class="secondary-button" type="button" data-import-action="wizard-back">Back</button>' : ""}<button class="primary-button" type="submit">${final ? "Review staged rows" : "Continue"}</button></div>`;
    }

    /** Renders the active budget mapping step. */
    function renderBudgetWizard(): void {
      if (
        !state.mappingWizard ||
        state.mappingWizard.profileId !== state.profile.id
      )
        state.mappingWizard = createBudgetWizardState();
      const wizard = state.mappingWizard;
      const map = wizard.mapping;
      let content = "";
      if (wizard.step === 0) {
        const formats = importUtils.validDateFormats(
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
          ${wizardSamples(map.date, (value) => importUtils.parseDate(value, wizard.dateFormat))}
          ${map.date === null ? "" : formats.length ? `<div class="import-inference ${ambiguity ? "ambiguous" : ""}"><strong>${ambiguity ? "This date is ambiguous" : "Date format detected"}</strong><p>${ambiguity ? "All observed month and day values are 12 or lower, so more than one interpretation fits. We selected the US month-first format; confirm it below." : "Only one supported format fits every nonblank value in this column."}</p><label class="import-field"><span>Date format</span><select name="dateFormat">${formats.map((format) => `<option value="${format}"${format === wizard.dateFormat ? " selected" : ""}>${format}</option>`).join("")}</select></label><small>Two-digit years use 00–69 as 2000–2069 and 70–99 as 1970–1999.</small></div>` : '<div class="import-inference error"><strong>We could not read this column as dates</strong><p>Choose another column. Every nonblank value must use one supported date format.</p></div>'}
        </div>${wizardActions()}`;
      }
      if (wizard.step === 1) {
        /** Checks whether a candidate budget column is numeric. */
        const numeric = (index: number): boolean =>
          importUtils.isNumericColumn(state.parsed, index);
        const sign = importUtils.inferAmountSignConvention(
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

    /** Renders eligible CSV header options for an investment field. */
    function investmentHeaderOptions(
      field: "month" | "balance",
      predicate?: (index: number) => boolean,
      empty = "Choose a column",
    ): string {
      const wizard = state.mappingWizard;
      const selected = importUtils.columnIndex(wizard.mapping[field]);
      const used = new Set(
        [
          wizard.mapping.month,
          wizard.mapping.balance,
          ...wizard.mapping.contributions,
        ]
          .map(importUtils.columnIndex)
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
              importUtils.headerScore(right, scoreKind) -
                importUtils.headerScore(left, scoreKind) ||
              left.index - right.index,
          )
          .map(
            (header) =>
              `<option value="${header.index}"${header.index === selected ? " selected" : ""}>${escapeHTML(header.label)}${state.parsed.headers.filter((item) => item.normalized === header.normalized).length > 1 ? ` (column ${header.index + 1})` : ""}</option>`,
          )
          .join("")
      );
    }

    /** Renders selectable contribution and withdrawal columns. */
    function investmentContributionOptions(): string {
      const wizard = state.mappingWizard;
      const selected = new Set(wizard.mapping.contributions);
      const used = new Set(
        [wizard.mapping.month, wizard.mapping.balance]
          .map(importUtils.columnIndex)
          .filter((value) => value !== null),
      );
      const headers = state.parsed.headers
        .filter(
          (header) =>
            selected.has(header.index) ||
            (!used.has(header.index) &&
              importUtils.isNumericColumn(state.parsed, header.index)),
        )
        .sort(
          (left, right) =>
            importUtils.headerScore(right, "contribution") -
              importUtils.headerScore(left, "contribution") ||
            left.index - right.index,
        );
      return headers.length
        ? `<div class="import-contribution-options">${headers.map((header) => `<label><input type="checkbox" name="contributions" value="${header.index}"${selected.has(header.index) ? " checked" : ""} />${escapeHTML(header.label)}</label>`).join("")}</div>`
        : '<div class="import-inference error"><strong>No numeric columns are available</strong><p>Choose different activity-date or balance columns.</p></div>';
    }

    /** Renders samples from selected investment flow columns. */
    function investmentContributionSamples(): string {
      const selected = state.mappingWizard.mapping.contributions;
      if (!selected.length)
        return '<div class="import-wizard-samples"><strong>Sample values</strong><p>Select one or more columns to see examples.</p></div>';
      return `<div class="import-wizard-samples"><strong>Sample values</strong><ul>${selected
        .flatMap((mapping) => {
          const header =
            state.parsed.headers[importUtils.columnIndex(mapping) ?? -1];
          return importUtils.columnValues(state.parsed, mapping)
            .slice(0, 3)
            .map(
              (value) =>
                `<li>${escapeHTML(`${header?.label || "Column"}: ${value}`)}</li>`,
            );
        })
        .join("")}</ul></div>`;
    }

    /** Renders the active investment mapping step. */
    function renderInvestmentWizard(): void {
      if (
        !state.mappingWizard ||
        state.mappingWizard.profileId !== state.profile.id
      )
        state.mappingWizard = createInvestmentWizardState();
      const wizard = state.mappingWizard;
      const map = wizard.mapping;
      let content = "";
      if (wizard.step === 0) {
        const formats = importUtils.validMonthFormats(
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
            const parsed = importUtils.parseDate(
              value,
              wizard.dateFormat,
            );
            return parsed?.slice(0, 7);
          })}
          ${map.month === null ? "" : formats.length ? `<div class="import-inference ${ambiguity ? "ambiguous" : ""}"><strong>${ambiguity ? "Confirm the date format" : "Date format detected"}</strong><p>${ambiguity ? "More than one supported date interpretation fits these values. Confirm the format used by this file." : "This format fits every nonblank value in the selected column."}</p><label class="import-field"><span>Date format</span><select name="dateFormat">${formats.map((format) => `<option value="${format}"${format === wizard.dateFormat ? " selected" : ""}>${format}</option>`).join("")}</select></label><small>Two-digit years use 00–69 as 2000–2069 and 70–99 as 1970–1999.</small></div>` : '<div class="import-inference error"><strong>We could not read this column as reporting months</strong><p>Choose another column. Every nonblank value must use one supported month or date format.</p></div>'}
        </div>${wizardActions()}`;
      }
      if (wizard.step === 1) {
        /** Checks whether a candidate investment column is numeric. */
        const numeric = (index: number): boolean =>
          importUtils.isNumericColumn(state.parsed, index);
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

    /** Renders the mapping workflow for the selected target. */
    function renderMapper(): void {
      if (state.profile.target === "budget") renderBudgetWizard();
      else renderInvestmentWizard();
    }

    /** Builds the persisted column mapping from wizard state. */
    function buildColumnMapping(): Record<string, ImportColumnReference | number[] | boolean | string> {
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

    /** Validates required and unique column mappings. */
    function validateMapping(
      map: ImportColumnMapping,
      amountMode: AmountMode,
    ): void {
      if (state.profile.target === "investment") {
        const contributions = Array.isArray(map.contributions)
          ? map.contributions
          : [];
        if (map.month === null || !contributions.length)
          throw new Error(
            "Map an activity date and at least one cash-flow column.",
          );
        const mapped = [
          map.month,
          map.balance,
          ...contributions,
        ].filter((value) => importUtils.columnIndex(value) !== null);
        if (
          new Set(mapped.map(importUtils.columnIndex)).size !==
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

    /** Copies budget wizard controls into state and removes conflicts. */
    function captureBudgetWizardControls(changedName = ""): void {
      const wizard = state.mappingWizard;
      if (!wizard) return;
      /** Reads a nullable numeric column index from a budget control. */
      const numberValue = (name: WizardField): number | null => {
        const control = mappingForm.elements[name];
        return control && control.value !== "" ? Number(control.value) : null;
      };
      ([
        "date",
        "amount",
        "debit",
        "credit",
        "vendorDescription",
        "categoryDescription",
        "personDescription",
        "notes",
      ] as WizardField[]).forEach((field) => {
        if (mappingForm.elements[field])
          wizard.mapping[field] = numberValue(field);
      });
      if (mappingForm.elements.dateFormat)
        wizard.dateFormat = mappingForm.elements.dateFormat.value;
      const amountMode = mappingForm.querySelector<HTMLInputElement>(
        'input[name="amountMode"]:checked',
      );
      if (amountMode)
        wizard.amountMode =
          amountMode.value === "debitCredit" ? "debitCredit" : "unified";
      const sign = mappingForm.querySelector<HTMLInputElement>(
        'input[name="amountSignConvention"]:checked',
      );
      if (sign)
        wizard.mapping.amountSignConvention =
          sign.value === "expensesPositive"
            ? "expensesPositive"
            : "expensesNegative";
      const category = mappingForm.querySelector<HTMLInputElement>(
        'input[name="hasCategory"]:checked',
      );
      if (category) {
        wizard.hasCategory = category.value === "yes";
        if (!wizard.hasCategory) wizard.mapping.categoryDescription = null;
      }
      const person = mappingForm.querySelector<HTMLInputElement>(
        'input[name="hasPerson"]:checked',
      );
      if (person) {
        wizard.hasPerson = person.value === "yes";
        if (!wizard.hasPerson) wizard.mapping.personDescription = null;
      }
      const notes = mappingForm.querySelector<HTMLInputElement>('input[name="hasNotes"]:checked');
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

      const order: Record<WizardField, number> = {
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
        const changedField = changedName as WizardField;
        const value = wizard.mapping[changedField];
        if (value !== null)
          Object.entries(order).forEach(([field, step]) => {
            const wizardField = field as WizardField;
            if (step > order[changedField] && wizard.mapping[wizardField] === value)
              wizard.mapping[wizardField] = null;
          });
      }
      if (changedName === "date") {
        const formats = importUtils.validDateFormats(
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

    /** Copies investment wizard controls into state and removes conflicts. */
    function captureInvestmentWizardControls(changedName = ""): void {
      const wizard = state.mappingWizard;
      if (!wizard) return;
      /** Reads a nullable numeric column index from an investment control. */
      const numberValue = (name: "month" | "balance"): number | null => {
        const control = mappingForm.elements[name];
        return control && control.value !== "" ? Number(control.value) : null;
      };
      ["month", "balance"].forEach((field) => {
        const mappingField = field as "month" | "balance";
        if (mappingForm.elements[field])
          wizard.mapping[mappingField] = numberValue(mappingField);
      });
      if (mappingForm.elements.dateFormat)
        wizard.dateFormat = mappingForm.elements.dateFormat.value;
      const balance = mappingForm.querySelector<HTMLInputElement>(
        'input[name="hasBalance"]:checked',
      );
      if (balance) {
        wizard.hasBalance = balance.value === "yes";
        if (!wizard.hasBalance) wizard.mapping.balance = null;
      }
      if (mappingForm.elements.contributions) {
        wizard.mapping.contributions = [
          ...mappingForm.querySelectorAll<HTMLInputElement>(
            'input[name="contributions"]:checked',
          ),
        ].map((input) => Number(input.value));
      }
      if (["month", "balance"].includes(changedName)) {
        const changedField = changedName as "month" | "balance";
        const selected = wizard.mapping[changedField];
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
        const formats = importUtils.validMonthFormats(
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

    /** Captures controls for the active import target. */
    function captureWizardControls(changedName = ""): void {
      if (state.profile?.target === "investment")
        captureInvestmentWizardControls(changedName);
      else captureBudgetWizardControls(changedName);
    }

    /** Validates the active budget mapping step. */
    function validateBudgetWizardStep(): void {
      const wizard = state.mappingWizard,
        map = wizard.mapping;
      if (wizard.step === 0) {
        if (map.date === null)
          throw new Error("Choose the column containing transaction dates.");
        const formats = importUtils.validDateFormats(
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
            !importUtils.isNumericColumn(state.parsed, map.amount)
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
            !importUtils.isNumericColumn(state.parsed, map.debit) ||
            !importUtils.isNumericColumn(state.parsed, map.credit)
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

    /** Validates the active investment mapping step. */
    function validateInvestmentWizardStep(): void {
      const wizard = state.mappingWizard,
        map = wizard.mapping;
      if (wizard.step === 0) {
        if (map.month === null)
          throw new Error(
            "Choose the column containing reporting months or dates.",
          );
        const formats = importUtils.validMonthFormats(
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
              importUtils.parseDate(
                importUtils.valueAt(row, map.month),
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
            !importUtils.isNumericColumn(state.parsed, map.balance))
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
              !importUtils.isNumericColumn(state.parsed, column),
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
      ].filter((value) => importUtils.columnIndex(value) !== null);
      if (
        new Set(mapped.map(importUtils.columnIndex)).size !==
        mapped.length
      )
        throw new Error(
          "Each investment field must use a different CSV column.",
        );
    }

    /** Validates the active target's mapping step. */
    function validateWizardStep(): void {
      if (state.profile?.target === "investment")
        validateInvestmentWizardStep();
      else validateBudgetWizardStep();
    }

    /** Collects persisted and provisional entities used during staging. */
    function references(): ImportReferences {
      /** Returns provisional entities of a requested kind. */
      const provisional = (kind: EntityKind): BudgetEntity[] => [
        ...state.draftEntities[kind].values(),
      ];
      return {
        categories: APIs.budget.listCategories().concat(
          provisional("category"),
        ),
        vendors: APIs.budget.listVendors().concat(provisional("vendor")),
        people: APIs.budget.listPeople().concat(provisional("assignment")),
        accounts: APIs.investment.accounts(),
        sharedAssignmentId: APIs.budget.SHARED_ASSIGNMENT_ID,
      };
    }

    /** Builds a stable key for a provisional imported entity. */
    function draftEntityKey(
      kind: EntityKind,
      name: string,
      type: TransactionType | "" = "",
    ): string {
      return `${kind === "category" ? `${type}|` : ""}${importUtils.normalizeDescription(name)}`;
    }

    /** Creates or reuses a provisional entity during CSV review. */
    function stageEntity(
      kind: EntityKind,
      name: string,
      type: TransactionType = "expense",
      refs: ImportReferences | null = null,
    ): BudgetEntity {
      const normalized = importUtils.normalizeDescription(name);
      if (!normalized) throw new Error("Enter a name before adding this item.");
      const key = draftEntityKey(kind, name, type);
      const existing = state.draftEntities[kind].get(key);
      if (existing) return existing;
      const record = {
        ...APIs.budget.createImportedEntityDraft(kind, {
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

    /** Clears all provisional entities from import state. */
    function resetDraftEntities(): void {
      state.draftEntities = {
        vendor: new Map(),
        category: new Map(),
        assignment: new Map(),
      };
    }

    /** Converts parsed CSV data into editable staged rows. */
    function stageRows(): void {
      resetDraftEntities();
      state.pendingVendors.clear();
      state.pendingPeople.clear();
      const refs = references();
      if (state.profile.target === "budget") {
        // Returns an array of data for each individual row, including the original CSV data, any pre-associated vendor or person ids, and a staging id
        state.rows = importUtils.createBudgetRows(
          state.parsed,
          state.profile,
          { ...state.bundle, profile: state.profile },
          refs,
          (kind, name, type) => stageEntity(kind, name, type, refs),
        );

        //
        state.rows.forEach((row) => {
          if (row.vendorResolution === "pending" && row.vendorId)
            state.pendingVendors.set(row.normalizedVendorDescription ?? "", {
              sourceDescription: row.vendorDescription ?? "",
              vendorId: row.vendorId,
            });
          if (row.personResolution === "pending" && row.personId)
            state.pendingPeople.set(row.normalizedPersonDescription ?? "", {
              sourceDescription: row.personDescription ?? "",
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
            .filter((value): value is string => Boolean(value)),
        );
      } else {
        const existing = APIs.investment.balances()
          .filter(
            (item) => item.accountId === state.profile.investmentAccountId,
          )
          .map((balance) => APIs.investment.monthData(balance.accountId, balance.month))
          .filter((month): month is NonNullable<typeof month> => month !== null);
        state.rows = importUtils.createInvestmentMonths(
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

    /** Revalidates every staged row against current mappings and entities. */
    function validateRows(): void {
      const refs = references();
      if (state.profile.target === "investment") {
        const months = new Map<string, StagedImportRow[]>();
        state.rows.forEach((row) => {
          row.errors = row.errors.filter(
            (error) => !error.includes("more than once"),
          );
          if (row.month)
            months.set(row.month, [...(months.get(row.month) || []), row]);
        });
        months.forEach((rows: StagedImportRow[]) => {
          if (rows.length > 1)
            rows.forEach((row) =>
              row.errors.push(
                "This account-month appears more than once in the CSV.",
              ),
            );
        });
      }
      state.rows.forEach((row) => {
        if (state.profile.target === "budget") {
          const result = importUtils.validateBudgetRow(row, refs, state.profile);
          row.errors = result.errors;
          row.warnings = result.warnings;
          row.type = result.type;
          if (!row.amountEdited) row.amount = result.amount;
        } else {
          const result = importUtils.validateInvestmentMonth(row, refs, state.profile);
          row.errors = result.errors;
          row.warnings = result.warnings;
        }
        if (!APIs.budget.getActiveUser())
          row.errors.push("Choose an app user in Settings.");
      });
    }

    /** Renders entity options for a native select control. */
    function optionList(
      items: BudgetEntity[],
      value: string | undefined,
      emptyLabel: string,
    ): string {
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

    /** Formats an unknown numeric value for a money input. */
    function numericInputValue(value: unknown): string {
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(2) : "";
    }

    /** Renders validation and queue status for a staged row. */
    function statusMarkup(row: StagedImportRow): string {
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

    /** Returns staged rows matching the active review filter. */
    function filteredRows(): StagedImportRow[] {
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

    /** Limits staged rows to the current incremental page size. */
    function visibleRows(items: StagedImportRow[]): StagedImportRow[] {
      const total = items.length;
      state.visibleLimit = Math.min(
        Math.max(state.visibleLimit, PAGE_SIZE),
        Math.max(total, PAGE_SIZE),
      );
      return items.slice(0, state.visibleLimit);
    }

    /** Renders aggregate counts and amounts for the staged import. */
    function renderSummary(): void {
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
          .map(Number)
          .filter(Number.isFinite);
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

    /** Renders the review filter controls for the current target. */
    function renderFilters(): void {
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

    /** Renders editable staged budget transactions. */
    function renderBudgetRows(): void {
      const filtered = filteredRows();
      const visible = visibleRows(filtered);

      loadMoreButton.hidden = state.visibleLimit >= filtered.length;

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
        <td class="category-column"><category-select data-row-field="categoryId" type="all" create-type="${importUtils.suggestBudgetType(row)}" value="${escapeHTML(row.categoryId)}"${row.queued ? " inert" : ""}></category-select>${row.categoryDescription ? `<span class="import-source-description">${escapeHTML(row.categoryDescription)}</span>` : ""}</td>
        <td class="person-column"><people-select data-row-field="personId" allow-empty value="${escapeHTML(row.personId)}"${row.queued ? " inert" : ""}></people-select><span class="import-source-description">${escapeHTML(row.personDescription || "Shared")}</span></td>
        <td class="amount-column"><input type="number" aria-label="Transaction amount" step="0.01" data-row-field="amount" value="${numericInputValue(row.amount)}"${row.queued ? " disabled" : ""} /></td>
        <td class="notes-column"><input type="text" aria-label="Transaction notes" maxlength="1000" data-row-field="notes" value="${escapeHTML(row.notes)}"${row.queued ? " disabled" : ""} /></td><td class="import-status status-column">${statusMarkup(row)}</td></tr>`,
        )
        .join("");

      visible.forEach((row) => {
        const element = root.querySelector(
          `[data-staging-id="${row.stagingId}"]`,
        );

        const vendorControl = element.querySelector<ImportSelectControl>("vendor-input")!;
        const categoryControl = element.querySelector<ImportSelectControl>("category-select")!;
        const personControl = element.querySelector<ImportSelectControl>("people-select")!;

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
              importUtils.suggestBudgetType(row),
            ),
          onCreate: () => {},
        });
        personControl.configureOptions({
          getOptions: () => references().people,
          createOption: (name) => stageEntity("assignment", name),
          onCreate: () => {},
        });
        vendorControl.value = row.vendorId ?? "";
        categoryControl.value = row.categoryId ?? "";
        personControl.value = row.personId ?? "";
      });
    }

    /** Renders editable staged investment months and flows. */
    function renderInvestmentRows(): void {
      const account = APIs.investment.accounts().find(
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

    /** Revalidates and renders the complete review step. */
    function renderReview(): void {
      validateRows();
      renderSummary();
      renderFilters();
      const budget = state.profile.target === "budget";
      root.querySelector("#import-budget-review").hidden = !budget;
      root.querySelector("#import-investment-review").hidden = budget;
      if (budget) renderBudgetRows();
      else renderInvestmentRows();
      const included = state.rows.filter((row) => row.include && !row.queued);
      const commitButton = root.querySelector<HTMLButtonElement>('[data-import-action="commit"]');
      const connected = Boolean(APIs.budget.getConfig().endpoint);
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

    /** Parses a selected CSV and prepares profile selection. */
    async function handleFileChange(): Promise<void> {
      const file = fileInput.files?.[0];
      if (!file) return;
      message(root.querySelector("#import-file-message"), "Reading CSV…");
      try {
        state.parsed = importUtils.parseCSV(await file.text());
        state.profile = null as unknown as ImportProfile;
        state.rows = [];
        state.mappingWizard = null as unknown as MappingWizard;
        state.commit = null as unknown as ImportCommit;
        state.expandedInvestmentMonths.clear();
        resetDraftEntities();
        mappingStep.hidden = true;
        reviewStep.hidden = true;
        progressStep.hidden = true;
        profileStep.hidden = false;
        router.setNavigationGuard(null);
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
          messageFromError(error),
          "error",
        );
      }
    }

    /** Checks whether a saved profile can map the uploaded CSV unchanged. */
    function profileMappingIsUsable(profile: ImportProfile): boolean {
      if (!profile || profile.headerSignature !== state.parsed.signature)
        return false;
      const map = profile.columnMapping || {};
      const indexes =
        profile.target === "investment"
          ? [
              map.month,
              map.balance,
              ...(Array.isArray(map.contributions) ? map.contributions : []),
            ]
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
          .filter((value) => importUtils.columnIndex(value) !== null)
          .some((value) => {
            const index = importUtils.columnIndex(value);
            return index !== null && index >= state.parsed.headers.length;
          })
      )
        return false;
      try {
        validateMapping(map, profile.amountMode);
        if (
          profile.target === "budget" &&
          !importUtils.validDateFormats(state.parsed, map.date).includes(
            profile.dateFormat,
          )
        )
          return false;
        if (
          profile.target === "investment" &&
          (!importUtils.validMonthFormats(
            state.parsed,
            map.month,
          ).includes(profile.dateFormat) ||
            !state.parsed.rows.every((row) =>
              Boolean(
                importUtils.parseDate(
                  importUtils.valueAt(row, map.month),
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

    /** Applies or creates the profile selected by the user. */
    async function handleProfileSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      message(profileMessage, "");
      try {
        if (!state.parsed) throw new Error("Upload a CSV first.");
        const selected = state.profiles.find(
          (item) => item.id === profileForm.elements.profileId.value,
        );
        const target: ImportTarget =
          profileForm.elements.target.value === "investment"
            ? "investment"
            : "budget";
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
          const bundle = await APIs.imports.loadProfileBundle(selected.id, {
            refresh: true,
          });
          state.bundle = bundle;
          state.profile = {
            ...bundle.profile,
            name: input.name,
            target,
            investmentAccountId: input.investmentAccountId,
          };
          if (profileMappingIsUsable(state.profile)) {
            state.mappingWizard = null as unknown as MappingWizard;
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
          state.profile = APIs.imports.createProfileDraft({
            ...input,
            headerSignature: state.parsed.signature,
          });
          state.bundle = {
            profile: state.profile,
            vendorMappings: [],
            personMappings: [],
          };
        }
        state.mappingWizard = null as unknown as MappingWizard;
        renderMapper();
        mappingStep.hidden = false;
        reviewStep.hidden = true;
        mappingStep.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        message(profileMessage, messageFromError(error), "error");
      }
    }

    /** Advances or completes the column-mapping wizard. */
    async function handleMappingSubmit(event: SubmitEvent): Promise<void> {
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
        state.profile = APIs.imports.createProfileDraft({
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
        message(mappingMessage, messageFromError(error), "error");
      }
    }

    /** Resolves the staged row associated with a review element. */
    function rowFromElement(element: Element): StagedImportRow | undefined {
      return state.rows.find(
        (row) =>
          row.stagingId ===
          (element.closest("[data-staging-id]") as HTMLElement | null)?.dataset.stagingId,
      );
    }

    /** Applies a vendor or person selection and learns matching associations. */
    function applyReference(
      row: StagedImportRow,
      field: "vendorId" | "personId",
      value: string,
    ): void {
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
      if (!firstResolution || !normalized) return;
      importUtils.fillBlankMatches(
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
          ? { sourceDescription: row.vendorDescription ?? "", vendorId: value }
          : { sourceDescription: row.personDescription ?? "", assignmentId: value },
      );
    }

    /** Applies a category selection to matching staged rows. */
    function applyCategory(row: StagedImportRow, value: string): void {
      row.categoryId = value;
      const category = references().categories.find(
        (item) => item.id === value,
      );
      if (category?.type === "income") row.vendorId = "";
      const key =
        row.normalizedCategoryDescription || row.normalizedVendorDescription;
      if (!value || !key || state.resolvedCategoryMatches.has(key)) return;
      state.resolvedCategoryMatches.add(key);
      importUtils.fillBlankMatches(
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

    /** Applies edits made to staged review controls. */
    function handleReviewChange(event: ImportControlEvent): void {
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
          row.existing = APIs.investment.monthData(
            row.accountId ?? "",
            row.month ?? "",
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

    /** Applies a custom date-picker change to a staged transaction. */
    function handleReviewDateChange(event: ImportDateEvent): void {
      const row = rowFromElement(event.target);
      if (!row || row.queued || state.profile?.target !== "budget") return;
      row.date = event.detail?.value || "";
      renderReview();
    }

    /** Applies custom vendor, person, or category selection events. */
    function handleReviewSelection(event: ImportControlEvent): void {
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

    /** Captures mapping changes and rerenders dependent wizard fields. */
    function handleMappingChange(event: ImportControlEvent): void {
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

    /** Navigates to an already visited mapping-wizard step. */
    function handleWizardNavigation(event: ImportControlEvent): void {
      const control = event.target.closest<HTMLButtonElement>("[data-wizard-step]");
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

    /** Renders the current multi-step commit progress. */
    function renderCommitProgress(): void {
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

    /** Updates one commit step and refreshes its progress display. */
    function updateCommitStep(
      key: string,
      status: CommitStatus,
      detail = "",
    ): void {
      const step = state.commit.steps.find((item) => item.key === key);
      if (step) Object.assign(step, { status, detail });
      renderCommitProgress();
    }

    /** Replaces a provisional entity ID with its persisted ID. */
    function remapEntity(
      kind: EntityKind,
      requestedId: string,
      record: BudgetEntity,
    ): void {
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

    /** Returns provisional entities referenced by included rows. */
    function usedDraftEntities(kind: EntityKind): BudgetEntity[] {
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

    /** Persists referenced provisional entities of one kind. */
    async function commitEntityKind(kind: EntityKind): Promise<void> {
      const items = usedDraftEntities(kind);
      if (!items.length) {
        updateCommitStep(kind, "skipped", "No new items needed");
        return;
      }
      updateCommitStep(kind, "running", `0 of ${items.length}`);
      try {
        const resolved = await APIs.budget.commitImportedEntities(
          items.map((record) => ({ kind, record })),
          ({ completed, total }) =>
            updateCommitStep(kind, "running", `${completed} of ${total}`),
        );
        resolved.forEach((item) =>
          remapEntity(item.kind, item.requestedId, item.record),
        );
        updateCommitStep(kind, "complete", `${items.length} confirmed`);
      } catch (error) {
        partialEntityResults(error).forEach((item) =>
          remapEntity(item.kind, item.requestedId, item.record),
        );
        throw error;
      }
    }

    /** Returns learned associations used by included rows. */
    function relevantMappings(): {
      vendorMappings: ImportMapping[];
      personMappings: ImportMapping[];
    } {
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

    /** Queues and awaits imported budget or investment records. */
    async function commitRecords(): Promise<void> {
      const checkpoint = state.commit.checkpoint;
      if (state.profile.target === "budget") {
        if (!checkpoint.recordIds) {
          const queued = APIs.budget.queueImportedTransactions(
            state.commit.included.map((row) => ({
              date: row.date ?? "",
              amount: row.amount ?? 0,
              type: row.type === "income" ? "income" : "expense",
              categoryId: row.categoryId ?? "",
              vendorId: row.type === "income" ? "" : (row.vendorId ?? ""),
              assignmentId: row.personId ?? "",
              notes: row.notes,
            })),
          );
          checkpoint.recordIds = queued.map((item) => item.id);
        } else {
          checkpoint.recordIds.forEach((id) => {
            const item = APIs.budget.getTransactionOutboxItem(id);
            if (
              item?.status === "failed" ||
              (item?.status === "pending" && Number(item.attempts) > 0)
            )
              APIs.budget.retryTransaction(id);
          });
        }
        await APIs.budget.awaitImportedTransactions(
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
          const queued = APIs.investment.queueImportedMonths(
            state.commit.included.map((row) => ({
              accountId: row.accountId ?? "",
              month: row.month ?? "",
              balance: row.balance ?? 0,
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
          checkpoint.recordIds = queued
            .map((item) => item.syncOperationId)
            .filter((id): id is string => Boolean(id));
        } else {
          checkpoint.recordIds.forEach((id) =>
            APIs.investment.retry("investmentMonth", id),
          );
        }
        await APIs.investment.awaitImportedMonths(
          checkpoint.recordIds ?? [],
          ({ completed, total }) =>
            updateCommitStep(
              "records",
              "running",
              `${completed} of ${total} months confirmed`,
            ),
        );
      }
    }

    /** Confirms navigation while an import commit remains unfinished. */
    function guardNavigation(): boolean {
      return (
        !state.commit ||
        state.commit.status === "complete" ||
        window.confirm(
          "This import has not finished committing. Leave and lose the on-screen retry progress?",
        )
      );
    }

    /** Warns before closing the page during an unfinished commit. */
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!state.commit || state.commit.status === "complete") return;
      event.preventDefault();
      event.returnValue = "";
    }

    /** Executes or retries the complete remote import transaction. */
    async function commitImport(retry = false): Promise<void> {
      if (!APIs.budget.getConfig().endpoint)
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
      router.setNavigationGuard(guardNavigation);
      window.addEventListener("beforeunload", handleBeforeUnload);
      renderCommitProgress();
      message(root.querySelector("#import-progress-message"), "");

      try {
        if (!state.commit.checkpoint.profile) {
          updateCommitStep("profile", "running");
          state.profile = await APIs.imports.saveProfile(state.profile);
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

        for (const kind of ["vendor", "category", "assignment"] as EntityKind[]) {
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
              ...(await APIs.imports.saveMappings(
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
        state.profiles = await APIs.imports.listProfiles();
        renderCommitProgress();
        message(
          root.querySelector("#import-progress-message"),
          "Import complete. Every selected row was confirmed in Google Sheets.",
          "success",
        );
        router.setNavigationGuard(null);
        window.removeEventListener("beforeunload", handleBeforeUnload);
      } catch (error) {
        state.commit.status = "failed";
        const active = state.commit.steps.find(
          (step) => step.status === "running",
        );
        if (active)
          Object.assign(active, { status: "failed", detail: messageFromError(error) });
        renderCommitProgress();
        message(
          root.querySelector("#import-progress-message"),
          messageFromError(error),
          "error",
        );
      }
    }

    /** Extends the visible budget-row page. */
    function handleLoadMore(_event: Event): void {
      state.visibleLimit += PAGE_SIZE;
      renderBudgetRows();
    }

    /** Handles click actions across the import workflow. */
    async function handleAction(event: ImportControlEvent): Promise<void> {
      const action = (event.target.closest("[data-import-action]") as HTMLElement | null)?.dataset
        .importAction;
      if (!action) return;

      try {
        if (action === "clear") {
          if (!guardNavigation()) return;
          fileInput.value = "";
          state.parsed = null as unknown as ParsedImport;
          state.profile = null as unknown as ImportProfile;
          state.rows = [];
          state.mappingWizard = null as unknown as MappingWizard;
          state.commit = null as unknown as ImportCommit;
          state.expandedInvestmentMonths.clear();
          resetDraftEntities();
          profileStep.hidden = true;
          mappingStep.hidden = true;
          reviewStep.hidden = true;
          progressStep.hidden = true;
          renderSourcePreview();
          router.setNavigationGuard(null);
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
          await APIs.imports.archiveProfile(
            profileForm.elements.profileId.value,
          );
          state.profiles = await APIs.imports.listProfiles();
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
          const flowId = (event.target.closest("[data-flow-id]") as HTMLElement | null)?.dataset.flowId;
          if (!row || row.queued || !flowId) return;
          row.flows = row.flows.filter((flow) => flow.id !== flowId);
          renderReview();
        }
        if (action === "commit") await commitImport(false);
        if (action === "retry-commit") await commitImport(true);
        if (action === "return-review") {
          state.commit = null as unknown as ImportCommit;
          progressStep.hidden = true;
          reviewStep.hidden = false;
          router.setNavigationGuard(null);
          window.removeEventListener("beforeunload", handleBeforeUnload);
          renderReview();
        }
        if (action === "finish-import") {
          state.commit = null as unknown as ImportCommit;
          progressStep.hidden = true;
          fileInput.value = "";
          state.parsed = null as unknown as ParsedImport;
          state.profile = null as unknown as ImportProfile;
          state.rows = [];
          state.mappingWizard = null as unknown as MappingWizard;
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
        if (action === "open-sync") router.navigate("sync");
        if (action === "load-more") {
          handleLoadMore(event);
        }
      } catch (error) {
        message(reviewMessage, messageFromError(error), "error");
      }
    }

    /** Applies a selected review filter. */
    function handleFilter(event: ImportControlEvent): void {
      const filter = (event.target.closest("[data-import-filter]") as HTMLElement | null)?.dataset
        .importFilter;
      if (!filter || !["all", "errors", "excluded", "ready", "vendors", "people", "categories"].includes(filter)) return;
      state.filter = filter as ImportFilter;
      renderReview();
    }

    /** Reloads cached profiles and refreshes the profile selector. */
    function refreshProfiles(): void {
      APIs.imports.listProfiles()
        .then((profiles) => {
          state.profiles = profiles;
          profileOptions();
        })
        .catch((error) =>
          message(
            root.querySelector("#import-file-message"),
            `Profiles could not be loaded: ${messageFromError(error)}`,
            "error",
          ),
        );
    }

    /** Adapts native change events to typed mapping-control events. */
    const onMappingChange: EventListener = (event) =>
      handleMappingChange(event as ImportControlEvent);
    /** Adapts native change events to typed row-control events. */
    const onReviewChange: EventListener = (event) =>
      handleReviewChange(event as ImportControlEvent);
    /** Adapts date-picker events to typed date events. */
    const onReviewDateChange: EventListener = (event) =>
      handleReviewDateChange(event as ImportDateEvent);
    /** Adapts selection events to typed selection-control events. */
    const onReviewSelection: EventListener = (event) =>
      handleReviewSelection(event as ImportControlEvent);
    /** Adapts click events to typed import-action events. */
    const onAction: EventListener = (event) =>
      void handleAction(event as ImportControlEvent);
    /** Adapts click events to typed filter events. */
    const onFilter: EventListener = (event) =>
      handleFilter(event as ImportControlEvent);
    /** Adapts click events to typed wizard navigation events. */
    const onWizardNavigation: EventListener = (event) =>
      handleWizardNavigation(event as ImportControlEvent);

    fileInput.addEventListener("change", handleFileChange);
    profileForm.addEventListener("submit", handleProfileSubmit);
    profileForm.elements.profileId.addEventListener(
      "change",
      chooseProfileCandidate,
    );
    profileForm.elements.target.addEventListener("change", updateTargetFields);
    mappingForm.addEventListener("submit", handleMappingSubmit);
    mappingForm.addEventListener("change", onMappingChange);
    root.addEventListener("change", onReviewChange);
    root.addEventListener("date-change", onReviewDateChange);
    root.addEventListener("vendor-selected", onReviewSelection);
    root.addEventListener("person-selected", onReviewSelection);
    root.addEventListener("category-selected", onReviewSelection);
    root.addEventListener("click", onAction);
    root.addEventListener("click", onFilter);
    root.addEventListener("click", onWizardNavigation);
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
      mappingForm.removeEventListener("change", onMappingChange);
      root.removeEventListener("change", onReviewChange);
      root.removeEventListener("date-change", onReviewDateChange);
      root.removeEventListener("vendor-selected", onReviewSelection);
      root.removeEventListener("person-selected", onReviewSelection);
      root.removeEventListener("category-selected", onReviewSelection);
      root.removeEventListener("click", onAction);
      root.removeEventListener("click", onFilter);
      root.removeEventListener("click", onWizardNavigation);
      window.removeEventListener(
        "budget:import-profiles-changed",
        refreshProfiles,
      );
      router.setNavigationGuard(null);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }

  /** Removes all listeners and navigation guards owned by the import workflow. */
  function unmount(): void {
    cleanup?.();
    cleanup = null;
  }

/** Hosts the complete CSV import workflow as a routed web component. */
export class ImportScreen extends HTMLElement {
  /** Mounts the import workflow when the router connects the screen. */
  connectedCallback(): void {
    if (this.dataset.initialized) return;
    this.dataset.initialized = "true";
    this.classList.add("screen", "import-screen");
    this.dataset.screen = "import";
    mount(this);
  }

  /** Unmounts the import workflow when the router removes the screen. */
  disconnectedCallback(): void {
    unmount();
  }
}

if (!customElements.get("import-screen")) customElements.define("import-screen", ImportScreen);
