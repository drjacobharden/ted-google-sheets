import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { createTransactionRow } from "../../utilities/transaction-row";
import { DateUtils } from "../../utilities/date-utilities";
import {
  dateRangeDetail,
  eventTargetElement,
  isInvestmentSource,
  type DateRangePickerElement,
  type DateRangeValue,
} from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import type {
  BudgetEntity,
  EntityKind,
  ImportedEntityResolution,
  TransactionType,
} from "../../api/budget-api";
import type {
  AmountMode,
  ImportColumnMapping,
  ImportMapping,
  ImportProfile,
  ImportTarget,
} from "../../api/import-api";
import {
  importUtilities,
  type ImportColumnKey,
  type ImportColumnReference,
  type ImportReferences,
  type ParsedImport,
  type StagedImportRow,
} from "../../utilities/import-runtime";
import {
  applyGroupSelection,
  BudgetImportSummary,
  groupBudgetRows,
  groupHasBlockingErrors,
  groupSelectionState,
  summarizeBudgetImport,
  transactionBalanceEffect,
  vendorGroupProgress,
  type VendorReviewGroup,
} from "../../utilities/import-review-groups";
import {
  parsePayeeKey,
  payeeKey,
} from "../../components/dropdowns/payee-select-options";
import {
  escapeHTML,
  messageFromError,
  money,
} from "../../utilities/view-formatters";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;
let cleanup: (() => void) | null = null;
const PAGE_SIZE = 50;
const WORKFLOW_STEPS = ["upload", "mapping", "review", "summary"] as const;
type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

type ImportFilter =
  | "all"
  | "errors"
  | "excluded"
  | "ready"
  | "vendors"
  | "people"
  | "categories";
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
  amountSignConvention:
    | "expensesNegative"
    | "expensesPositive"
    | "allPositiveRefundsNegative";
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
  configureOptions(options: any): void;
}

interface ImportSegmentedControl extends HTMLElement {
  items: Array<{ key: string; title: string; disabled?: boolean }>;
  selection: string | null;
}

interface ImportMappingSelect extends HTMLElement {
  value: string;
  configureOptions(getOptions: () => ImportProfile[]): void;
}

interface ImportCommitStep {
  key: string;
  label: string;
  status: CommitStatus;
  detail: string;
}
interface ImportCommit {
  status: "running" | "failed" | "complete";
  included: StagedImportRow[];
  checkpoint: {
    profile?: boolean;
    associations?: boolean;
    recordIds?: string[];
  };
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
  workflowStep: WorkflowStep;
  maxWorkflowStep: number;
  vendorGroups: VendorReviewGroup[];
  activeVendorGroupIndex: number;
  completedVendorGroups: Set<string>;
  reviewDirty: boolean;
}

interface ImportProfileControls extends HTMLFormControlsCollection {
  profileId: HTMLSelectElement;
  target: HTMLInputElement | HTMLSelectElement;
  name: HTMLInputElement;
  investmentAccountId: HTMLSelectElement;
}

interface ImportProfileForm extends HTMLFormElement {
  readonly elements: ImportProfileControls;
}

interface ImportMappingForm extends HTMLFormElement {
  readonly elements: HTMLFormControlsCollection &
    Record<string, HTMLInputElement>;
}

type WizardField = Exclude<ImportColumnKey, "month" | "balance">;
type ImportControlEvent = Event & { target: HTMLInputElement };
type ImportDateEvent = CustomEvent<{ value?: string }> & {
  target: HTMLInputElement;
};

/** Extracts successfully committed entity records from an API failure. */
function partialEntityResults(error: unknown): ImportedEntityResolution[] {
  if (
    typeof error !== "object" ||
    error === null ||
    !("partialResults" in error)
  ) {
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
    target: "transaction",
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
    workflowStep: "upload",
    maxWorkflowStep: 0,
    vendorGroups: [],
    activeVendorGroupIndex: 0,
    completedVendorGroups: new Set(),
    reviewDirty: false,
  };
  root.append(template.content.cloneNode(true));

  const html = {
    upload: "",
    map: "",
    input: "",
    review: (p: {
      summary: BudgetImportSummary;
      invalidIncluded: boolean;
      disabled: boolean;
      connected: boolean;
      online: boolean;
      sign: string;
    }) => `
      <header class="import-pane-heading">
        <p class="type-label">Import summary</p>
        <h2>Ready to import</h2>
        <p>Review the totals below before writing these transactions to Google Sheets.</p>
      </header>
      <div class="editorial-surface import-surface">
        <dl class="import-summary-grid">
          <div>
            <dt>Ready transactions</dt>
            <dd>${p.summary.readyCount}</dd>
          </div>
          <div>
            <dt>Vendor groups</dt>
            <dd>${p.summary.groupCount}</dd>
          </div>
          <div>
            <dt>Excluded</dt>
            <dd>${p.summary.excludedCount}</dd>
          </div>
          <div>
            <dt>Net balance</dt>
            <dd class="${p.summary.netBalance < 0 ? "negative" : "positive"}">${p.sign}${money(Math.abs(p.summary.netBalance))}</dd>
          </div>
        </dl>
        ${p.invalidIncluded ? '<p class="import-summary-note error">Some included transactions still need attention.</p>' : ""}
        <div class="import-actions">
          <button class="secondary-button" type="button" data-import-action="summary-back">← Back to review</button>
          <button class="primary-button" type="button" data-import-action="commit"${p.disabled ? " disabled" : ""}${!p.connected ? ' title="Connect a Google Sheet in Settings before importing."' : !p.online ? ' title="Reconnect to the internet before importing."' : ""}>Import ${p.summary.readyCount} transaction${p.summary.readyCount === 1 ? "" : "s"} →</button>
        </div>
      </div>
    `,
  };

  const fileInput = root.querySelector<HTMLInputElement>("#import-file")!;
  const fileControl = root.querySelector<HTMLElement>(".import-file-control")!;
  const uploadSurface = root.querySelector<HTMLElement>(
    "#import-upload-surface",
  )!;
  const fileButton = root.querySelector<HTMLElement>(
    "#import-upload-surface custom-button",
  )!;
  const mappingSelect = root.querySelector<ImportMappingSelect>(
    "#import-profile-select",
  )!;
  const useProfileButton = root.querySelector<HTMLElement>(
    '[data-import-action="use-profile"]',
  )!;
  const profileStep = root.querySelector<HTMLElement>("#import-profile-step")!;
  const mappingStep = root.querySelector<HTMLElement>("#import-mapping-step")!;
  const reviewStep = root.querySelector<HTMLElement>("#import-review-step")!;
  const progressStep = root.querySelector<HTMLElement>(
    "#import-progress-step",
  )!;
  const summaryStep = root.querySelector<HTMLElement>("#import-summary-step")!;
  const summaryContent = root.querySelector<HTMLElement>(
    "#import-summary-content",
  )!;
  const groupReview = root.querySelector<HTMLElement>(
    "#import-budget-group-review",
  )!;
  const groupFooter = root.querySelector<HTMLElement>("#import-group-footer")!;
  const workflowStepper = root.querySelector<ImportSegmentedControl>(
    "#import-workflow-stepper",
  )!;
  const profileForm = root.querySelector<ImportProfileForm>(
    "#import-profile-form",
  )!;
  const mappingForm = root.querySelector<ImportMappingForm>(
    "#import-mapping-form",
  )!;
  const mappingMessage = root.querySelector<HTMLElement>(
    "#import-mapping-message",
  )!;
  const loadMoreButton = root.querySelector<HTMLButtonElement>(
    '[data-import-action="load-more"]',
  )!;

  /** Keeps the upload control's label and action in sync with import state. */
  function renderFileControl(): void {
    const hasFile = Boolean(state.parsed);
    fileInput.disabled = hasFile;
    fileControl.classList.toggle("has-file", hasFile);
    fileButton.removeAttribute("data-import-action");
    fileButton.setAttribute("aria-hidden", hasFile ? "false" : "true");
    (fileButton as HTMLElement & { label: string }).label = hasFile
      ? "Clear import"
      : "Choose a file";
    if (hasFile) fileButton.dataset.importAction = "clear";
  }

  /** Shows the profile fetch state inside the primary card action. */
  function renderProfileFetchState(fetching: boolean): void {
    const arrow = useProfileButton.querySelector<HTMLElement>(
      ".custom-button-icon",
    );
    let spinner = useProfileButton.querySelector<HTMLElement>(
      ".import-profile-spinner",
    );
    if (fetching) {
      useProfileButton.setAttribute("disabled", "");
      useProfileButton.setAttribute("aria-busy", "true");
      (useProfileButton as HTMLElement & { label: string }).label =
        "Fetching profile";
      arrow?.setAttribute("hidden", "");
      if (!spinner) {
        spinner = document.createElement("span");
        spinner.className = "import-profile-spinner";
        spinner.setAttribute("aria-hidden", "true");
        useProfileButton.prepend(spinner);
      }
      return;
    }
    useProfileButton.removeAttribute("disabled");
    useProfileButton.removeAttribute("aria-busy");
    (useProfileButton as HTMLElement & { label: string }).label =
      "Use this profile";
    arrow?.removeAttribute("hidden");
    spinner?.remove();
  }

  /** Displays a status message with an optional visual state. */
  const message = (element: HTMLElement, text: string, kind = ""): void => {
    element.textContent = text || "";
    element.className = `import-message${kind ? ` ${kind}` : ""}`;
  };

  /** Synchronizes the shared tab control with reachable workflow panes. */
  function renderWorkflowStepper(): void {
    const labels: Record<WorkflowStep, string> = {
      upload: "1  Upload & Profile",
      mapping: "2  Map columns",
      review: "3  Review vendors",
      summary: "4  Summary",
    };
    workflowStepper.items = WORKFLOW_STEPS.map((key, index) => ({
      key,
      title: labels[key],
      disabled: index > state.maxWorkflowStep,
    }));
    workflowStepper.selection = state.workflowStep;
  }

  /** Shows one importer pane while retaining prior steps for revisiting. */
  function showWorkflowStep(step: WorkflowStep, maxStep?: number): void {
    state.workflowStep = step;
    if (maxStep !== undefined)
      state.maxWorkflowStep = Math.max(state.maxWorkflowStep, maxStep);
    root
      .querySelectorAll<HTMLElement>("[data-workflow-step]")
      .forEach((pane) => {
        pane.hidden = pane.dataset.workflowStep !== step;
      });
    renderWorkflowStepper();
  }

  /** Renders the saved import profiles in the profile selector. */
  function availableProfiles(): ImportProfile[] {
    return state.profiles;
  }

  function renderProfileCard(): void {
    const profiles = availableProfiles();
    const card = root.querySelector<HTMLElement>("#import-saved-profile-card")!;
    const title = root.querySelector<HTMLElement>(
      "#import-profile-card-title",
    )!;
    const description = root.querySelector<HTMLElement>(
      "#import-profile-card-description",
    )!;
    const actions = root.querySelector<HTMLElement>(
      "#import-profile-card-actions",
    )!;
    const selected = profiles.find(
      (profile) => profile.id === profileForm.elements.profileId.value,
    );
    card.hidden = profiles.length === 0;
    if (!profiles.length) return;

    if (!selected) {
      title.textContent = "Choose a profile";
      description.textContent =
        "Select an existing import profile to get started";
      actions.hidden = true;
      mappingSelect.hidden = false;
      mappingSelect.value = "";
      return;
    }

    title.textContent = selected.name;
    description.textContent = profileMappingIsUsable(selected)
      ? "Matched to this profile"
      : "Needs re-mapping to match current CSV";
    actions.hidden = false;
    mappingSelect.hidden = true;
    mappingSelect.value = selected.id;
  }

  function profileOptions(): void {
    const select = profileForm.elements.profileId;
    const current = select.value;
    mappingSelect.configureOptions(availableProfiles);
    select.innerHTML =
      '<option value="">Create a new profile</option>' +
      availableProfiles()
        .map(
          (profile) =>
            `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.name)}</option>`,
        )
        .join("");
    if (
      state.profiles.some(
        (item) => item.id === current,
      )
    )
      select.value = current;
    renderProfileCard();
  }

  /** Renders active investment accounts in the target-account selector. */
  function accountOptions(): void {
    const accounts = APIs.accounts
      .accounts()
      .filter((item) => item.type === "investment" && item.active !== false);
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
    root.querySelector("[data-investment-account-field]").hidden = true;
    profileForm.elements.investmentAccountId.required = false;
    state.target = "transaction";
  }

  /** Applies the selected profile's values to the profile form. */
  function chooseProfileCandidate(): void {
    const id = profileForm.elements.profileId.value;
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) {
      profileForm.elements.name.value = "";
      updateTargetFields();
      renderProfileCard();
      return;
    }
    profileForm.elements.name.value = profile.name;
    profileForm.elements.target.value = "transaction";
    profileForm.elements.investmentAccountId.value =
      profile.investmentAccountId || "";
    updateTargetFields();
    renderProfileCard();
  }

  /** Renders a short preview of the uploaded CSV. */
  function renderSourcePreview(): void {
    const preview = root.querySelector<HTMLElement>("#import-source-preview")!;
    preview.hidden = !state.parsed;
    if (!state.parsed) {
      preview.innerHTML = "";
      return;
    }
    preview.innerHTML = `
      <div class="import-section-rule">
        <span class="type-label">CSV preview</span>
        <small>${state.parsed.rows.length} rows · ${state.parsed.headers.length} columns</small>
      </div>
      <div class="import-preview-scroll">
        <table>
          <thead>
            <tr>${state.parsed.headers.map((header) => `<th>${escapeHTML(header.label)}</th>`).join("")}</tr>
          </thead>
          <tbody>${state.parsed.rows
            .slice(0, 3)
            .map(
              (row) =>
                `<tr>${row.values.map((value) => `<td>${escapeHTML(value)}</td>`).join("")}</tr>`,
            )
            .join("")}
          </tbody>
        </table>
      </div>`;
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
        ? importUtils.columnIndex(existing.categoryDescription) !== null
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
    const suggested = importUtils.suggestInvestmentMapping(state.parsed);
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
    const contributions = (
      Array.isArray(contributionSource) ? contributionSource : []
    )
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
    return BUDGET_WIZARD_STEPS;
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
        .filter(([rawName, value]) => {
          const name = rawName as WizardField;
          return (
            name !== field &&
            active.has(name) &&
            importUtils.columnIndex(value) !== null &&
            (stepFor[name] < stepFor[field] ||
              (stepFor[name] === stepFor[field] &&
                ["debit", "credit"].includes(name)))
          );
        })
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
    const values = importUtils.columnValues(state.parsed, mapping).slice(0, 3);
    return `<div class="import-wizard-samples"><strong>Sample values</strong>${values.length ? `<ul>${values.map((value) => `<li>${escapeHTML(transform ? `${value} → ${transform(value) || "invalid"}` : value)}</li>`).join("")}</ul>` : "<p>Choose a column to see examples.</p>"}</div>`;
  }

  /** Renders a dropdown-menu backed by a hidden form value for the mapping wizard. */
  function wizardDropdown(
    name: string,
    label: string,
    optionsMarkup: string,
  ): string {
    const select = document.createElement("select");
    select.innerHTML = optionsMarkup;
    const items = [...select.options]
      .filter((option) => option.value !== "")
      .map((option) => ({
        key: option.value,
        title: option.textContent || option.value,
        isDefaultValue: option.selected,
      }));
    const value = select.value;
    return `<input type="hidden" name="${escapeHTML(name)}" value="${escapeHTML(value)}" /><dropdown-menu bubbles variant="editorial" data-wizard-field="${escapeHTML(name)}" label="${escapeHTML(label)}" items="${escapeHTML(JSON.stringify(items))}" align-start></dropdown-menu>`;
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
      const formats = importUtils.validDateFormats(state.parsed, map.date);
      if (!formats.includes(wizard.dateFormat))
        wizard.dateFormat = formats.includes("MM/DD/YYYY")
          ? "MM/DD/YYYY"
          : formats.includes("MM/DD/YY")
            ? "MM/DD/YY"
            : formats[0] || "";
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 1 of 6 · Date</p><h3>Which column contains the transaction date?</h3><p>We will convert this value to the app’s standard date. Choose the date you want shown on each transaction.</p>
          <div class="import-grid import-date-mapping-fields"><label class="import-field"><span>Date column</span>${wizardDropdown("date", "Choose a column", wizardHeaderOptions("date"))}</label>${formats.length ? `<label class="import-field"><span>Date format</span>${wizardDropdown("dateFormat", "Choose a date format", formats.map((format) => `<option value="${format}"${format === wizard.dateFormat ? " selected" : ""}>${format}</option>`).join(""))}</label>` : ""}</div>
          ${wizardSamples(map.date, (value) => importUtils.parseDate(value, wizard.dateFormat))}
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
          ${wizard.amountMode === "unified" ? `<label class="import-field"><span>Amount column</span>${wizardDropdown("amount", "Choose a column", wizardHeaderOptions("amount", numeric))}</label>${wizardSamples(map.amount)}<div class="import-inference"><strong>How are expenses written?</strong><p>We found ${sign.negative} negative and ${sign.positive} positive non-zero sample values. Confirm the convention used by this file.</p><fieldset class="import-choice-group"><legend>Sign convention</legend><label><input type="radio" name="amountSignConvention" value="expensesNegative"${map.amountSignConvention === "expensesNegative" ? " checked" : ""} /> Expenses are negative; deposits are positive</label><label><input type="radio" name="amountSignConvention" value="expensesPositive"${map.amountSignConvention === "expensesPositive" ? " checked" : ""} /> Expenses are positive; deposits are negative</label></fieldset></div>` : `<div class="import-grid"><label class="import-field"><span>Debit / withdrawal column</span>${wizardDropdown("debit", "Choose a column", wizardHeaderOptions("debit", numeric))}</label><label class="import-field"><span>Credit / deposit column</span>${wizardDropdown("credit", "Choose a column", wizardHeaderOptions("credit", numeric))}</label></div><div class="import-inference"><strong>Direction comes from the populated column</strong><p>Debit rows become expenses and credit rows become income. Credit rows categorized as expenses remain negative refunds; debit rows categorized as income remain negative reversals.</p></div>`}
        </div>${wizardActions()}`;
      const allPositiveRefundsNegativeOption =
        '<label><input type="radio" name="amountSignConvention" value="allPositiveRefundsNegative"' +
        (map.amountSignConvention === "allPositiveRefundsNegative"
          ? " checked"
          : "") +
        " /> All inputs are positive. All refunds are negative.</label>";
      content = content.replace(
        /(<input type="radio" name="amountSignConvention" value="expensesPositive"[\s\S]*?<\/label>)(<\/fieldset>)/,
        `$1${allPositiveRefundsNegativeOption}$2`,
      );
    }
    if (wizard.step === 2)
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 3 of 6 · Vendor</p><h3>Which column describes the vendor or payee?</h3><p>The source description does not need to match an internal vendor. We can either learn associations during review or use the source values as vendor names now.</p><label class="import-field"><span>Vendor description column</span>${wizardDropdown("vendorDescription", "Choose a column", wizardHeaderOptions("vendorDescription"))}</label>${wizardSamples(map.vendorDescription)}<label class="import-toggle"><input type="checkbox" name="autoPopulateVendor"${wizard.autoPopulateVendor ? " checked" : ""} /><span><strong>Match or create vendors using these values</strong><small>Existing names are reused. Missing names remain provisional until Commit import.</small></span></label></div>${wizardActions()}`;
    if (wizard.step === 3)
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 4 of 6 · Category</p><h3>Does this CSV already contain budget categories?</h3><p>When importing an existing budget spreadsheet, its category names can prefill the review table and stage any missing categories.</p><fieldset class="import-choice-group"><legend>Category information</legend><label><input type="radio" name="hasCategory" value="no"${!wizard.hasCategory ? " checked" : ""} /> No category column</label><label><input type="radio" name="hasCategory" value="yes"${wizard.hasCategory ? " checked" : ""} /> Yes, choose a column</label></fieldset>${wizard.hasCategory ? `<label class="import-field"><span>Category column</span>${wizardDropdown("categoryDescription", "Choose a column", wizardHeaderOptions("categoryDescription"))}</label>${wizardSamples(map.categoryDescription)}<label class="import-toggle"><input type="checkbox" name="autoPopulateCategory"${wizard.autoPopulateCategory ? " checked" : ""} /><span><strong>Match or create categories using these values</strong><small>Category type follows an existing match or the amount direction for a new category.</small></span></label>` : ""}</div>${wizardActions()}`;
    if (wizard.step === 4)
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 5 of 6 · Person</p><h3>Does this CSV separate transactions by cardholder or person?</h3><p>If not, imported transactions use the app’s Shared assignment.</p><fieldset class="import-choice-group"><legend>Cardholder information</legend><label><input type="radio" name="hasPerson" value="no"${!wizard.hasPerson ? " checked" : ""} /> No, use Shared</label><label><input type="radio" name="hasPerson" value="yes"${wizard.hasPerson ? " checked" : ""} /> Yes, choose a column</label></fieldset>${wizard.hasPerson ? `<label class="import-field"><span>Person / cardholder column</span>${wizardDropdown("personDescription", "Choose a column", wizardHeaderOptions("personDescription"))}</label>${wizardSamples(map.personDescription)}<label class="import-toggle"><input type="checkbox" name="autoPopulatePerson"${wizard.autoPopulatePerson ? " checked" : ""} /><span><strong>Match or create people using these values</strong><small>Existing people are reused. Missing names remain provisional until Commit import.</small></span></label>` : ""}</div>${wizardActions()}`;
    if (wizard.step === 5)
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 6 of 6 · Notes</p><h3>Does this CSV include personal notes for each transaction?</h3><p>Notes are optional and are copied into the transaction’s existing Notes field.</p><fieldset class="import-choice-group"><legend>Notes column</legend><label><input type="radio" name="hasNotes" value="no"${!wizard.hasNotes ? " checked" : ""} /> No notes column</label><label><input type="radio" name="hasNotes" value="yes"${wizard.hasNotes ? " checked" : ""} /> Yes, choose a column</label></fieldset>${wizard.hasNotes ? `<label class="import-field"><span>Notes column</span>${wizardDropdown("notes", "Choose a column", wizardHeaderOptions("notes"))}</label>${wizardSamples(map.notes)}` : ""}</div>${wizardActions(true)}`;
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
        return importUtils
          .columnValues(state.parsed, mapping)
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
      const formats = importUtils.validMonthFormats(state.parsed, map.month);
      if (!formats.includes(wizard.dateFormat))
        wizard.dateFormat = formats.includes("YYYY-MM")
          ? "YYYY-MM"
          : formats.includes("MM/DD/YYYY")
            ? "MM/DD/YYYY"
            : formats.includes("MM/DD/YY")
              ? "MM/DD/YY"
              : formats[0] || "";
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 1 of 3 · Activity date</p><h3>Which column dates each investment activity row?</h3><p>Every row must contain a supported full date or YYYY-MM value. We will group all activity into calendar months.</p>
          <div class="import-grid import-date-mapping-fields"><label class="import-field"><span>Activity date column</span>${wizardDropdown("month", "Choose a column", investmentHeaderOptions("month"))}</label>${formats.length ? `<label class="import-field"><span>Date format</span>${wizardDropdown("dateFormat", "Choose a date format", formats.map((format) => `<option value="${format}"${format === wizard.dateFormat ? " selected" : ""}>${format}</option>`).join(""))}</label>` : ""}</div>
          ${wizardSamples(map.month, (value) => {
            const parsed = importUtils.parseDate(value, wizard.dateFormat);
            return parsed?.slice(0, 7);
          })}
        </div>${wizardActions()}`;
    }
    if (wizard.step === 1) {
      /** Checks whether a candidate investment column is numeric. */
      const numeric = (index: number): boolean =>
        importUtils.isNumericColumn(state.parsed, index);
      content = `<div class="import-wizard-question"><p class="eyebrow">Step 2 of 3 · Ending balance</p><h3>Does this CSV include account balances?</h3><p>When mapped, the latest dated nonblank balance in each month is used. Otherwise, an existing balance is reused or you can enter one during review.</p>
          <fieldset class="import-choice-group"><legend>Balance information</legend><label><input type="radio" name="hasBalance" value="no"${!wizard.hasBalance ? " checked" : ""} /> No balance column</label><label><input type="radio" name="hasBalance" value="yes"${wizard.hasBalance ? " checked" : ""} /> Yes, choose a column</label></fieldset>
          ${wizard.hasBalance ? `<label class="import-field"><span>Ending balance column</span>${wizardDropdown("balance", "Choose a column", investmentHeaderOptions("balance", numeric))}</label>${wizardSamples(map.balance)}` : ""}
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
    renderBudgetWizard();
  }

  /** Builds the persisted column mapping from wizard state. */
  function buildColumnMapping(): Record<
    string,
    ImportColumnReference | number[] | boolean | string
  > {
    if (state.profile.target !== "investment") {
      const wizard = state.mappingWizard;
      return {
        date: wizard.mapping.date,
        amount: wizard.amountMode === "unified" ? wizard.mapping.amount : null,
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
    target: ImportTarget = state.profile?.target ?? state.target,
  ): void {
    if (target === "investment") {
      const contributions = Array.isArray(map.contributions)
        ? map.contributions
        : [];
      if (map.month === null || !contributions.length)
        throw new Error(
          "Map an activity date and at least one cash-flow column.",
        );
      const mapped = [map.month, map.balance, ...contributions].filter(
        (value) => importUtils.columnIndex(value) !== null,
      );
      if (new Set(mapped.map(importUtils.columnIndex)).size !== mapped.length)
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
    (
      [
        "date",
        "amount",
        "debit",
        "credit",
        "vendorDescription",
        "categoryDescription",
        "personDescription",
        "notes",
      ] as WizardField[]
    ).forEach((field) => {
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
        sign.value === "allPositiveRefundsNegative"
          ? "allPositiveRefundsNegative"
          : sign.value === "expensesPositive"
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
    const notes = mappingForm.querySelector<HTMLInputElement>(
      'input[name="hasNotes"]:checked',
    );
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
          if (
            step > order[changedField] &&
            wizard.mapping[wizardField] === value
          )
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
    captureBudgetWizardControls(changedName);
  }

  /** Validates the active budget mapping step. */
  function validateBudgetWizardStep(): void {
    const wizard = state.mappingWizard,
      map = wizard.mapping;
    if (wizard.step === 0) {
      if (map.date === null)
        throw new Error("Choose the column containing transaction dates.");
      const formats = importUtils.validDateFormats(state.parsed, map.date);
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
          ![
            "expensesNegative",
            "expensesPositive",
            "allPositiveRefundsNegative",
          ].includes(
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
    if (wizard.step === 4 && wizard.hasPerson && map.personDescription === null)
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
      const formats = importUtils.validMonthFormats(state.parsed, map.month);
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
          (column) => !importUtils.isNumericColumn(state.parsed, column),
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
    if (new Set(mapped.map(importUtils.columnIndex)).size !== mapped.length)
      throw new Error("Each investment field must use a different CSV column.");
  }

  /** Validates the active target's mapping step. */
  function validateWizardStep(): void {
    validateBudgetWizardStep();
  }

  /** Collects persisted and provisional entities used during staging. */
  function references(): ImportReferences {
    /** Returns provisional entities of a requested kind. */
    const provisional = (kind: EntityKind): BudgetEntity[] => [
      ...state.draftEntities[kind].values(),
    ];
    return {
      categories: APIs.budget.listCategories().concat(provisional("category")),
      vendors: APIs.budget.listVendors().concat(provisional("vendor")),
      people: APIs.budget.listPeople().concat(provisional("assignment")),
      accounts: APIs.accounts.accounts(),
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
    if (list && !list.some((item) => item.id === record.id)) list.push(record);
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
    state.rows = importUtils.createBudgetRows(
      state.parsed,
      state.profile,
      { ...state.bundle, profile: state.profile },
      refs,
      (kind, name, type) => stageEntity(kind, name, type, refs),
    );

    state.rows.forEach((row) => {
      if (row.vendorResolution === "pending" && (row.vendorId || row.accountId))
        state.pendingVendors.set(row.normalizedVendorDescription ?? "", {
          sourceDescription: row.vendorDescription ?? "",
          vendorId: row.vendorId,
          accountId: row.accountId,
        });
      if (row.personResolution === "pending" && row.personId)
        state.pendingPeople.set(row.normalizedPersonDescription ?? "", {
          sourceDescription: row.personDescription ?? "",
          assignmentId: row.personId,
        });
    });

    state.resolvedCategoryMatches = new Set(
      state.rows
        .filter((row) => row.categoryId)
        .map(
          (row) =>
            row.normalizedCategoryDescription || row.normalizedVendorDescription,
        )
        .filter((value): value is string => Boolean(value)),
    );
    state.vendorGroups = groupBudgetRows(state.rows);
    state.activeVendorGroupIndex = 0;
    state.completedVendorGroups.clear();
    state.reviewDirty = false;
    state.filter = "all";
    state.expandedInvestmentMonths.clear();
    showWorkflowStep("review", 2);
    renderReview();
  }

  /** Revalidates every staged row against current mappings and entities. */
  function validateRows(): void {
    const refs = references();
    state.rows.forEach((row) => {
      const result = importUtils.validateBudgetRow(row, refs, state.profile);
      row.errors = result.errors;
      row.warnings = result.warnings;
      row.type = result.type;
      if (!row.amountEdited) row.amount = result.amount;
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

  /** Formats an import date for people while preserving the ISO date ID in datetime. */
  function readableImportDate(value: unknown): string {
    const dateId = String(value || "");
    if (!dateId) return "—";
    const date = new Date(`${dateId}T00:00:00Z`);
    return Number.isNaN(date.getTime())
      ? dateId
      : DateUtils.longDateFormatter.format(date);
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
        return state.profile.target !== "investment" && !row.vendorId && !row.accountId;
      if (state.filter === "people")
        return state.profile.target !== "investment" && !row.accountId && !row.personId;
      if (state.filter === "categories")
        return state.profile.target !== "investment" && !row.accountId && !row.categoryId;
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
        state.profile.target === "investment" ? "Included months" : "Included",
      ],
      [ready.length, "Ready"],
      [included.filter((row) => row.errors.length).length, "With errors"],
    ];
    if (state.profile.target !== "investment") {
      const income = included
        .filter((row) => row.type === "income")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const expenses = included
        .filter((row) => row.type === "expense")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      stats.push(
        [
          included.filter((row) => !row.vendorId && !row.accountId).length,
          "Unresolved vendors / accounts",
        ],
        [included.filter((row) => !row.accountId && !row.personId).length, "Unresolved people"],
        [
          included.filter((row) => !row.accountId && !row.categoryId).length,
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
    if (state.profile.target !== "investment")
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
        <td class="vendor-column"><vendor-select data-row-field="vendorId" value="${escapeHTML(row.vendorId)}"${row.queued ? " inert" : ""}></vendor-select><span class="import-source-description">${escapeHTML(row.vendorDescription || "No source vendor")}</span></td>
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

      const vendorControl =
        element.querySelector<ImportSelectControl>("vendor-select")!;
      const categoryControl =
        element.querySelector<ImportSelectControl>("category-select")!;
      const personControl =
        element.querySelector<ImportSelectControl>("people-select")!;

      vendorControl.configureOptions({
        getOptions: () => references().vendors,
        createOption: (name: string) => stageEntity("vendor", name),
        onCreate: () => {},
      });
      categoryControl.configureOptions({
        getOptions: () => references().categories,
        createOption: (name: string) =>
          stageEntity("category", name, importUtils.suggestBudgetType(row)),
        onCreate: () => {},
      });
      personControl.configureOptions({
        getOptions: () => references().people,
        createOption: (name: string) => stageEntity("assignment", name),
        onCreate: () => {},
      });
      vendorControl.value = row.vendorId ?? "";
      categoryControl.value = row.categoryId ?? "";
      personControl.value = row.personId ?? "";
    });
  }

  /** Returns the vendor group currently being reviewed. */
  function currentVendorGroup(): VendorReviewGroup | undefined {
    return state.vendorGroups[state.activeVendorGroupIndex];
  }

  function rowPayeeKey(row: StagedImportRow): string {
    return row.accountId
      ? payeeKey("account", row.accountId)
      : row.vendorId
        ? payeeKey("vendor", row.vendorId)
        : "";
  }

  function groupPayeeState(group: VendorReviewGroup): { value: string; mixed: boolean } {
    const values = new Set(group.rows.map(rowPayeeKey));
    return values.size === 1
      ? { value: [...values][0] || "", mixed: false }
      : { value: "", mixed: true };
  }

  function accountForRow(row: StagedImportRow) {
    return row.accountId
      ? references().accounts.find((item) => item.id === row.accountId)
      : undefined;
  }

  function derivedCategory(row: StagedImportRow): { id: string; label: string } {
    const account = accountForRow(row);
    if (!account) return { id: row.categoryId || "", label: "" };
    if (account.type === "investment") return { id: "", label: "Investment" };
    const category = references().categories.find((item) => item.id === account.categoryId);
    return { id: category?.id || "", label: category?.name || "Missing debt category" };
  }

  function derivedAssignment(row: StagedImportRow): { id: string; label: string } {
    const account = accountForRow(row);
    if (!account) return { id: row.personId || "", label: "" };
    const assignment = references().people.find((item) => item.id === account.assignmentId);
    return { id: assignment?.id || "", label: assignment?.name || "Missing assignment" };
  }

  /** Configures searchable group-level and row-level reference controls. */
  function configureBudgetGroupControls(group: VendorReviewGroup): void {
    const payeeControl = groupReview.querySelector<ImportSelectControl>(
      'payee-select[data-group-field="payeeKey"]',
    );
    if (payeeControl) {
      payeeControl.configureOptions({
        getVendors: () => references().vendors,
        createVendor: (name: string) => stageEntity("vendor", name),
        onCreate: () => {},
      });
      payeeControl.value = groupPayeeState(group).value;
    }
    const categoryControls =
      groupReview.querySelectorAll<ImportSelectControl>("category-select");
    categoryControls.forEach((control) => {
      const row = rowFromElement(control) || group.rows[0];
      const derived = derivedCategory(row);
      control.configureOptions({
        getOptions: () => references().categories,
        createOption: (name: string) =>
          stageEntity("category", name, importUtils.suggestBudgetType(row)),
        onCreate: () => {},
      });
      control.value = row.accountId
        ? derived.id
        : control.dataset.groupField
          ? groupSelectionState(group.rows, "categoryId").value
          : row.categoryId || "";
    });

    groupReview
      .querySelectorAll<ImportSelectControl>("people-select")
      .forEach((control) => {
        const row = rowFromElement(control) || group.rows[0];
        const derived = derivedAssignment(row);
        control.configureOptions({
          getOptions: () => references().people,
          createOption: (name: string) => stageEntity("assignment", name),
          onCreate: () => {},
        });
        control.value = row.accountId
          ? derived.id
          : control.dataset.groupField
            ? groupSelectionState(group.rows, "personId").value
            : row.personId || "";
      });

    groupReview
      .querySelectorAll<ImportSelectControl>("payee-select[data-row-field]")
      .forEach((control) => {
        const row = rowFromElement(control);
        control.configureOptions({
          getVendors: () => references().vendors,
          createVendor: (name: string) => stageEntity("vendor", name),
          onCreate: () => {},
        });
        if (row) control.value = rowPayeeKey(row);
      });
  }

  /** Renders the weighted, noninteractive group progress footer. */
  function renderGroupFooter(group: VendorReviewGroup): void {
    groupFooter.hidden = false;
    const percentages = vendorGroupProgress(state.vendorGroups);
    root.querySelector("#import-group-progress").innerHTML = state.vendorGroups
      .map((item, index) => {
        const status = state.completedVendorGroups.has(item.key)
          ? "complete"
          : index === state.activeVendorGroupIndex
            ? "current"
            : "upcoming";
        return `<span class="${status}" style="flex-basis:${percentages[index]}%"></span>`;
      })
      .join("");
    root.querySelector("#import-group-footer-name").textContent =
      group.sourceDescription;
    const includedRows = group.rows.filter((row) => row.include && !row.queued);
    const missingPayee = includedRows.some(
      (row) => !row.vendorId && !row.accountId && row.type !== "income",
    );
    const missingCategoryRows = includedRows.filter((row) => !row.accountId && !row.categoryId);
    const footerMessage = missingPayee
      ? "Vendor / Account selection needed"
      : missingCategoryRows.length === includedRows.length &&
          includedRows.length
        ? "Category selection needed"
        : missingCategoryRows.length
          ? `${missingCategoryRows.length} transaction${missingCategoryRows.length === 1 ? "" : "s"} need${missingCategoryRows.length === 1 ? "s" : ""} a category`
          : `${group.rows.length} transaction${group.rows.length === 1 ? "" : "s"}`;
    root.querySelector("#import-group-footer-meta").textContent = footerMessage;
    root.querySelector("#import-group-position").textContent =
      `Group ${state.activeVendorGroupIndex + 1} of ${state.vendorGroups.length}`;
    const previous = root.querySelector<HTMLButtonElement>(
      '[data-import-action="group-prev"]',
    );
    previous.disabled = state.activeVendorGroupIndex === 0;
    const next = root.querySelector<HTMLButtonElement>(
      '[data-import-action="group-next"]',
    );
    next.textContent =
      state.activeVendorGroupIndex === state.vendorGroups.length - 1
        ? "Review summary →"
        : "Next group →";
  }

  /** Renders one editable vendor group using the ledger table grammar. */
  function renderBudgetGroupReview(): void {
    const group = currentVendorGroup();
    if (!group) {
      groupReview.innerHTML =
        '<p class="import-empty">No transactions were staged.</p>';
      groupFooter.hidden = true;
      return;
    }
    const refs = references();
    const payeeState = groupPayeeState(group);
    const selectedPayee = parsePayeeKey(payeeState.value);
    const selectedRecord = selectedPayee?.kind === "account"
      ? refs.accounts.find((item) => item.id === selectedPayee.id)
      : refs.vendors.find((item) => item.id === selectedPayee?.id);
    const categoryState = groupSelectionState(group.rows, "categoryId");
    const personState = groupSelectionState(group.rows, "personId");
    const commonAccountRow = !payeeState.mixed && selectedPayee?.kind === "account"
      ? group.rows[0]
      : undefined;
    const groupCategory = commonAccountRow ? derivedCategory(commonAccountRow) : null;
    const groupAssignment = commonAccountRow ? derivedAssignment(commonAccountRow) : null;

    groupReview.innerHTML = `
      <header class="import-group-heading">
        <div>
          <div class="import-group-title-line">
            <h2>${escapeHTML(selectedRecord?.name || group.sourceDescription)}</h2>
          </div>
          <p class="import-source-description">CSV description: ${escapeHTML(group.sourceDescription)}</p>
        </div>
        <span class="import-count-tag">${group.rows.length} transaction${group.rows.length === 1 ? "" : "s"}</span>
      </header>

      <div class="import-group-fields">
        <div class="import-field import-vendor-name-field">
          <span>Vendor / Account</span>
          <payee-select data-group-field="payeeKey" value="${escapeHTML(payeeState.value)}"></payee-select>
        </div>
        <div class="import-field">
          <div class="import-bulk-control"><category-select data-group-field="categoryId" trigger-label="${escapeHTML(groupCategory?.label || (categoryState.mixed ? "Mixed" : "Apply category to all"))}" type="all" create-type="${escapeHTML(importUtils.suggestBudgetType(group.rows[0]))}" value="${escapeHTML(groupCategory?.id || categoryState.value)}"${commonAccountRow ? " inert" : ""}></category-select></div>
        </div>
        <div class="import-field">
          <div class="import-bulk-control"><people-select data-group-field="personId" trigger-label="${escapeHTML(groupAssignment?.label || (personState.mixed ? "Mixed" : "Apply person to all"))}" allow-empty value="${escapeHTML(groupAssignment?.id || personState.value)}"${commonAccountRow ? " inert" : ""}></people-select></div>
        </div>
      </div>

      <div class="import-group-table-wrap">
        <table class="import-group-table">
          <thead><tr><th class="include-column"><span class="sr-only">Include</span></th><th>Date</th><th>Vendor / Account</th><th>Category</th><th>Person</th><th class="description-column">Description</th><th class="amount-column">Amount</th></tr></thead>
          <tbody>${group.rows
            .map((row) => {
              const inert = !row.include || row.queued;
              const errors = row.include && row.errors.length;
              const balanceEffect = transactionBalanceEffect(row);
              const category = derivedCategory(row);
              const assignment = derivedAssignment(row);
              return `<tr data-staging-id="${escapeHTML(row.stagingId)}" class="${inert ? "excluded" : ""}${errors ? " has-errors" : ""}">
                <td class="include-column"><check-box aria-label="Include transaction from ${escapeHTML(row.date || "unknown date")}" data-row-field="include"${row.include ? " active" : ""}${row.queued ? " disabled" : ""}></check-box></td>
                <td class="date-column"><time datetime="${escapeHTML(row.date || "")}">${escapeHTML(readableImportDate(row.date))}</time></td>
                <td class="payee-column"><payee-select data-row-field="payeeKey" value="${escapeHTML(rowPayeeKey(row))}"${inert ? " inert" : ""}></payee-select></td>
                <td class="category-column"><category-select data-row-field="categoryId" trigger-label="${escapeHTML(category.label || "Select a category")}" type="all" create-type="${escapeHTML(importUtils.suggestBudgetType(row))}" value="${escapeHTML(category.id)}"${inert || Boolean(row.accountId) ? " inert" : ""}></category-select></td>
                <td class="person-column"><people-select data-row-field="personId" trigger-label="${escapeHTML(assignment.label || "Select a person")}" allow-empty value="${escapeHTML(assignment.id)}"${inert || Boolean(row.accountId) ? " inert" : ""}></people-select></td>
                <td class="description-column"><input type="text" aria-label="Short description" placeholder="Add description" maxlength="240" data-row-field="notes" value="${escapeHTML(row.notes || "")}"${row.queued ? " disabled" : ""} /></td>
                <td class="amount-column ${balanceEffect < 0 ? "negative" : "positive"}">${balanceEffect > 0 ? "+" : balanceEffect < 0 ? "−" : ""}${money(Math.abs(balanceEffect))}</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table>
      </div>`;

    configureBudgetGroupControls(group);
    renderGroupFooter(group);
  }

  /** Renders editable staged investment months and flows. */
  function renderInvestmentRows(): void {
    const account = APIs.accounts
      .accounts()
      .find((item) => item.id === state.profile.investmentAccountId);
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

  /** Renders the final budget-import totals and commit controls. */
  function renderFinalSummary(): void {
    validateRows();
    const summary = summarizeBudgetImport(
      state.rows,
      state.vendorGroups.filter((group) =>
        group.rows.some((row) => row.include && !row.queued),
      ).length,
    );
    const connected = Boolean(APIs.budget.getConfig().endpoint);
    const online =
      typeof navigator === "undefined" || navigator.onLine !== false;
    const invalidIncluded = state.rows.some(
      (row) => row.include && !row.queued && row.errors.length,
    );
    const disabled =
      !summary.readyCount || invalidIncluded || !connected || !online;
    const sign =
      summary.netBalance > 0 ? "+" : summary.netBalance < 0 ? "−" : "";

    summaryContent.hidden = false;
    progressStep.hidden = true;
    summaryContent.innerHTML = `
      <div class="editorial-surface import-surface">
        <dl class="import-summary-grid">
          <div><dt>Transactions</dt><dd>${summary.readyCount}</dd></div>
          <div><dt>Vendor groups</dt><dd>${summary.groupCount}</dd></div>
          <div><dt>Excluded</dt><dd>${summary.excludedCount}</dd></div>
          <div><dt>Net balance</dt><dd class="${summary.netBalance < 0 ? "negative" : "positive"}">${sign}${money(Math.abs(summary.netBalance))}</dd></div>
        </dl>
        ${invalidIncluded ? '<p class="import-summary-note error">Some included transactions still need attention.</p>' : ""}
      </div>
      <div class="import-actions">
        <custom-button class="secondary-button" type="button" data-import-action="summary-back">← Back to review</custom-button>
        <custom-button class="primary-button" type="button" data-import-action="commit"${disabled ? " disabled" : ""}${!connected ? ' title="Connect a Google Sheet in Settings before importing."' : !online ? ' title="Reconnect to the internet before importing."' : ""}>Import ${summary.readyCount} transaction${summary.readyCount === 1 ? "" : "s"} →</custom-button>
      </div>`;
  }

  /** Revalidates and renders the complete review step. */
  function renderReview(): void {
    validateRows();
    renderBudgetGroupReview();
  }

  /** Parses a CSV and prepares profile selection. */
  async function handleFile(file: File): Promise<void> {
    message(root.querySelector("#import-file-message"), "Reading CSV…");
    try {
      state.parsed = importUtils.parseCSV(await file.text());
      state.profile = null as unknown as ImportProfile;
      state.rows = [];
      state.mappingWizard = null as unknown as MappingWizard;
      state.commit = null as unknown as ImportCommit;
      state.vendorGroups = [];
      state.activeVendorGroupIndex = 0;
      state.completedVendorGroups.clear();
      state.reviewDirty = false;
      state.expandedInvestmentMonths.clear();
      resetDraftEntities();
      progressStep.hidden = true;
      root.querySelector("[data-profile-options]").hidden = false;
      root.querySelector("#import-file-name").textContent = file.name;
      renderFileControl();
      showWorkflowStep("upload", 0);
      router.setNavigationGuard(null);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      renderSourcePreview();
      profileOptions();
      const matches = state.profiles.filter(
        (profile) =>
          profile.target !== "investment" &&
          profile.headerSignature === state.parsed.signature,
      );
      if (matches.length === 1) {
        profileForm.elements.profileId.value = matches[0].id;
        chooseProfileCandidate();
      } else if (matches.length > 1) {
        profileForm.elements.profileId.value = "";
        chooseProfileCandidate();
      } else {
        profileForm.elements.profileId.value = "";
        chooseProfileCandidate();
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

  /** Parses the file selected through the native file input. */
  function handleFileChange(): void {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  }

  /** Highlights the upload surface while a file is dragged over it. */
  function handleDragEnter(event: DragEvent): void {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      uploadSurface.classList.add("is-dragging");
    }
  }

  function handleDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    uploadSurface.classList.add("is-dragging");
  }

  function handleDragLeave(event: DragEvent): void {
    if (!uploadSurface.contains(event.relatedTarget as Node | null))
      uploadSurface.classList.remove("is-dragging");
  }

  /** Loads the first dropped file through the same parser as file selection. */
  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    uploadSurface.classList.remove("is-dragging");
    const file = event.dataTransfer?.files[0];
    if (file) void handleFile(file);
  }

  /** Applies a profile chosen from the saved-profile dropdown. */
  function handleMappingSelection(event: CustomEvent): void {
    const value = String((event.target as ImportMappingSelect).value || "");
    profileForm.elements.profileId.value = value;
    chooseProfileCandidate();
  }

  /** Checks whether a saved profile can map the uploaded CSV unchanged. */
  function profileMappingIsUsable(profile: ImportProfile): boolean {
    if (profile?.target === "investment") return false;
    if (!profile || profile.headerSignature !== state.parsed.signature)
      return false;
    const map = profile.columnMapping || {};
    const indexes = [
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
      validateMapping(map, profile.amountMode, profile.target);
      if (!importUtils.validDateFormats(state.parsed, map.date).includes(profile.dateFormat))
        return false;
      return true;
    } catch {
      return false;
    }
  }

  /** Applies or creates the profile selected by the user. */
  async function handleProfileSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    try {
      if (!state.parsed) throw new Error("Upload a CSV first.");
      const selected = state.profiles.find(
        (item) => item.id === profileForm.elements.profileId.value,
      );
      const target: ImportTarget = "transaction";
      const input = {
        ...(selected || {}),
        name: profileForm.elements.name.value,
        target,
        investmentAccountId: "",
        headerSignature: selected?.headerSignature || state.parsed.signature,
        columnMapping: selected?.columnMapping || {},
        dateFormat: selected?.dateFormat || "YYYY-MM-DD",
        amountMode: selected?.amountMode || "unified",
        amountMultiplier: selected?.amountMultiplier || 1,
      };
      if (selected) {
        const bundle = await APIs.imports.loadProfileBundle(selected.id);
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
          return;
        }
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
      showWorkflowStep("mapping", 1);
      mappingStep.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      message(
        root.querySelector("#import-file-message"),
        messageFromError(error),
        "error",
      );
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
      const amountMode = state.mappingWizard.amountMode;
      validateMapping(columnMapping, amountMode);
      state.profile = APIs.imports.createProfileDraft({
        ...state.profile,
        headerSignature: state.parsed.signature,
        columnMapping,
        dateFormat: state.mappingWizard.dateFormat,
        amountMode,
        amountMultiplier:
          state.mappingWizard.mapping.amountSignConvention ===
          "expensesNegative"
            ? -1
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
        (element.closest("[data-staging-id]") as HTMLElement | null)?.dataset
          .stagingId,
    );
  }

  /** Applies a person selection and learns matching associations. */
  function applyReference(
    row: StagedImportRow,
    field: "personId",
    value: string,
  ): void {
    const normalized = row.normalizedPersonDescription;
    const resolutionField = "personResolution";
    const target = state.pendingPeople;
    row[field] = value;
    row[resolutionField] = "custom";
    if (!value || !normalized) return;
    importUtils.fillBlankMatches(
      state.rows,
      field,
      normalized,
      (item) => item.normalizedPersonDescription,
      value,
      (item) => {
        item[resolutionField] = "pending";
      },
    );
    target.set(
      normalized,
      { sourceDescription: row.personDescription ?? "", assignmentId: value },
    );
  }

  /** Applies a mutually exclusive vendor or account destination. */
  function applyPayee(row: StagedImportRow, value: string): void {
    const selection = parsePayeeKey(value);
    row.vendorId = selection?.kind === "vendor" ? selection.id : "";
    row.accountId = selection?.kind === "account" ? selection.id : "";
    row.payeeKind = selection?.kind || "";
    row.vendorResolution = "custom";
    if (selection?.kind === "account") {
      const account = references().accounts.find((item) => item.id === selection.id);
      row.accountType = account?.type;
      row.source = account?.source === "deduction" ? "deduction" : "manual";
      row.categoryId = "";
      row.personId = "";
    } else {
      row.accountType = undefined;
      row.source = "manual";
      if (!row.personId) {
        row.personId = row.normalizedPersonDescription
          ? state.bundle.personMappings.find(
              (item) =>
                item.active !== false &&
                item.normalizedSourceDescription === row.normalizedPersonDescription,
            )?.assignmentId || ""
          : APIs.budget.SHARED_ASSIGNMENT_ID;
      }
    }
    const normalized = row.normalizedVendorDescription;
    if (!selection || !normalized) return;
    state.pendingVendors.set(normalized, {
      sourceDescription: row.vendorDescription ?? "",
      vendorId: selection.kind === "vendor" ? selection.id : "",
      accountId: selection.kind === "account" ? selection.id : "",
    });
  }

  /** Applies a category selection to matching staged rows. */
  function applyCategory(row: StagedImportRow, value: string): void {
    if (row.accountId) return;
    row.categoryId = value;
    const category = references().categories.find((item) => item.id === value);
    if (category?.type === "income") row.vendorId = "";
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
    } else if (field === "personId")
      applyReference(row, field, event.target.value);
    else if (field) {
      const priorMonth = field === "month" ? row.month : "";
      row[field] = event.target.value;
      if (field === "month" && priorMonth !== row.month) {
        row.existing = APIs.accounts.monthData(
          row.accountId ?? "",
          row.month ?? "",
        ) as any;
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
    state.reviewDirty = true;
    renderReview();
  }

  /** Applies accessible checkbox selection events to staged rows. */
  function handleCheckboxSelection(
    event: CustomEvent<{ isOn?: boolean }>,
  ): void {
    const row = rowFromElement(event.target as Element);
    if (!row || row.queued) return;
    row.include = event.detail?.isOn === true;
    state.reviewDirty = true;
    renderReview();
  }

  /** Applies a custom date-picker change to a staged transaction. */
  function handleReviewDateChange(event: ImportDateEvent): void {
    const row = rowFromElement(event.target);
    if (!row || row.queued || state.profile?.target === "investment") return;
    row.date = event.detail?.value || "";
    renderReview();
  }

  /** Applies custom vendor, person, or category selection events. */
  function handleReviewSelection(event: ImportControlEvent): void {
    const groupField = event.target.dataset.groupField;
    const group = currentVendorGroup();
    if (
      group &&
      state.profile?.target !== "investment" &&
      (groupField === "payeeKey" ||
        groupField === "categoryId" ||
        groupField === "personId")
    ) {
      if (groupField === "payeeKey") {
        group.rows.forEach((row) => applyPayee(row, event.target.value));
      } else if (groupField === "categoryId") {
        applyGroupSelection(group, "categoryId", event.target.value);
        const category = references().categories.find(
          (item) => item.id === event.target.value,
        );
        if (category?.type === "income")
          group.rows.forEach((row) => {
            row.vendorId = "";
          });
      } else {
        group.rows.forEach((row) =>
          applyReference(row, "personId", event.target.value),
        );
      }
      state.reviewDirty = true;
      queueMicrotask(renderReview);
      return;
    }
    const row = rowFromElement(event.target);
    if (!row || row.queued) return;
    if (event.type === "payee-selected")
      applyPayee(row, event.target.value);
    if (event.type === "person-selected")
      applyReference(row, "personId", event.target.value);
    if (event.type === "category-selected")
      applyCategory(row, event.target.value);
    state.reviewDirty = true;
    queueMicrotask(renderReview);
  }

  /** Captures mapping changes and rerenders dependent wizard fields. */
  function handleMappingChange(event: ImportControlEvent): void {
    const changedName =
      event.target.name ||
      (event.target as HTMLElement).dataset.wizardField ||
      "";
    captureWizardControls(changedName);
    const rerender =
      state.profile?.target === "investment"
        ? ["month", "balance", "hasBalance", "contributions"].includes(
            changedName,
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
          ].includes(changedName);
    if (rerender) renderMapper();
  }

  /** Copies a mapping dropdown selection into its hidden form field. */
  function handleMappingDropdownSelection(event: CustomEvent): void {
    const dropdown = event.target as HTMLElement;
    const name = dropdown.dataset.wizardField;
    const input = name
      ? mappingForm.elements.namedItem(name)
      : null;
    if (!(input instanceof HTMLInputElement)) return;
    input.value = String(event.detail?.value || "");
    handleMappingChange({ target: input } as ImportControlEvent);
  }

  /** Navigates to an already visited mapping-wizard step. */
  function handleWizardNavigation(event: ImportControlEvent): void {
    const control =
      event.target.closest<HTMLButtonElement>("[data-wizard-step]");
    if (!control || !state.mappingWizard || control.disabled) return;
    captureWizardControls();
    state.mappingWizard.step = Number(control.dataset.wizardStep);
    renderMapper();
    mappingStep.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Focuses the first unresolved control in the active vendor group. */
  function focusFirstGroupError(): void {
    requestAnimationFrame(() => {
      const group = currentVendorGroup();
      const invalid = group?.rows.find(
        (row) => row.include && !row.queued && row.errors.length,
      );
      if (!invalid) return;
      const row = groupReview.querySelector<HTMLElement>(
        `[data-staging-id="${CSS.escape(invalid.stagingId)}"]`,
      );
      const errorText = invalid.errors.join(" ").toLowerCase();
      const focusTarget = errorText.includes("vendor")
        ? groupReview.querySelector<HTMLElement>(
            'payee-select[data-group-field="payeeKey"]',
          )
        : errorText.includes("category")
          ? row?.querySelector<HTMLElement>("category-select")
          : errorText.includes("assignment")
            ? row?.querySelector<HTMLElement>("people-select")
            : row?.querySelector<HTMLElement>("check-box");
      const shadowButton = focusTarget?.shadowRoot?.querySelector<HTMLElement>(
        "button, [tabindex='0']",
      );
      (shadowButton || focusTarget || row)?.focus();
    });
  }

  /** Moves between vendor groups or advances to the summary. */
  function navigateVendorGroup(direction: "previous" | "next"): void {
    if (direction === "previous") {
      state.activeVendorGroupIndex = Math.max(
        0,
        state.activeVendorGroupIndex - 1,
      );
      renderReview();
      return;
    }

    validateRows();
    const group = currentVendorGroup();
    if (!group) return;
    if (groupHasBlockingErrors(group)) {
      renderReview();
      focusFirstGroupError();
      return;
    }

    state.completedVendorGroups.add(group.key);
    if (state.activeVendorGroupIndex < state.vendorGroups.length - 1) {
      state.activeVendorGroupIndex += 1;
      renderReview();
      return;
    }
    showWorkflowStep("summary", 3);
    renderFinalSummary();
  }

  /** Handles selection of a reachable top-level importer step. */
  function handleWorkflowSelection(
    event: CustomEvent<{ value?: string }>,
  ): void {
    const step = event.detail?.value as WorkflowStep;
    const index = WORKFLOW_STEPS.indexOf(step);
    if (
      index < 0 ||
      index > state.maxWorkflowStep ||
      state.commit?.status === "running"
    ) {
      renderWorkflowStepper();
      return;
    }
    if (
      step === "mapping" &&
      state.rows.length &&
      state.reviewDirty &&
      !window.confirm(
        "Changing the column mapping will reset vendor review edits when you restage this CSV. Continue?",
      )
    ) {
      renderWorkflowStepper();
      return;
    }
    showWorkflowStep(step);
    if (step === "mapping") {
      if (!state.mappingWizard)
        state.mappingWizard =
          state.profile.target === "investment"
            ? createInvestmentWizardState()
            : createBudgetWizardState();
      renderMapper();
    }
    if (step === "review") renderReview();
    if (step === "summary") {
      const group = currentVendorGroup();
      renderFinalSummary();
    }
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
    root.querySelector("#import-commit-progress").innerHTML = state.commit.steps
      .map(
        (step) => `
        <li class="${step.status}">
          <span class="import-progress-icon" aria-hidden="true">
            ${step.status === "complete" || step.status === "skipped" ? '<custom-icon icon="checkmark"></custom-icon>' : step.status === "running" ? "…" : step.status === "failed" ? "!" : ""}
          </span>
          <span>
            <strong>${escapeHTML(step.label)}</strong>
            ${step.detail ? `<small>${escapeHTML(step.detail)}</small>` : ""}
          </span>
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
      state.vendorGroups.flatMap((group) => {
        const rows = group.rows.filter((row) => state.commit.included.includes(row));
        const payees = new Set(rows.map(rowPayeeKey).filter(Boolean));
        return rows.length && payees.size === 1 ? [group.key] : [];
      }),
    );
    const personKeys = new Set(
      state.commit.included
        .filter((row) => !row.accountId)
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
    if (!checkpoint.recordIds) {
      const queued = APIs.budget.queueImportedTransactions(
        state.commit.included.map((row) => ({
          date: row.date ?? "",
          amount: row.amount ?? 0,
          type: row.accountId
            ? undefined
            : row.type === "income"
              ? "income"
              : "expense",
          categoryId: row.accountId ? "" : (row.categoryId ?? ""),
          vendorId:
            row.accountId || row.type === "income" ? "" : (row.vendorId ?? ""),
          assignmentId: row.accountId ? "" : (row.personId ?? ""),
          accountId: row.accountId ?? "",
          source: row.accountId ? row.source ?? "manual" : "manual",
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
      throw new Error("Resolve all errors on included rows before importing.");
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
    showWorkflowStep("summary", 3);
    summaryContent.hidden = true;
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
        if (
          state.commit.steps.find((step) => step.key === kind)?.status ===
          "complete"
        )
          continue;
        else await commitEntityKind(kind);
      }

      if (!state.commit.checkpoint.associations) {
        const mappings = relevantMappings();
        if (!mappings.vendorMappings.length && !mappings.personMappings.length) {
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
            ...(await APIs.imports.saveMappings(state.profile.id, mappings)),
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
        Object.assign(active, {
          status: "failed",
          detail: messageFromError(error),
        });
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
    const action = (
      event.target.closest("[data-import-action]") as HTMLElement | null
    )?.dataset.importAction;
    if (!action) return;

    try {
      if (action === "use-profile") {
        if (!profileForm.reportValidity()) return;
        if (useProfileButton.hasAttribute("disabled")) return;
        renderProfileFetchState(true);
        try {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          await handleProfileSubmit(
            new SubmitEvent("submit", { bubbles: true, cancelable: true }),
          );
        } finally {
          renderProfileFetchState(false);
        }
        return;
      }
      if (action === "choose-another") {
        profileForm.elements.profileId.value = "";
        chooseProfileCandidate();
      }
      if (action === "setup-profile") {
        profileForm.elements.profileId.value = "";
        renderProfileCard();
        if (!profileForm.reportValidity()) return;
        await handleProfileSubmit(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        );
        return;
      }
      if (action === "clear") {
        if (
          (event.target as Element).closest(
            "custom-button[data-import-action='clear']",
          )
        )
          event.preventDefault();
        if (!guardNavigation()) return;
        fileInput.value = "";
        state.parsed = null as unknown as ParsedImport;
        state.profile = null as unknown as ImportProfile;
        state.rows = [];
        state.mappingWizard = null as unknown as MappingWizard;
        state.commit = null as unknown as ImportCommit;
        state.vendorGroups = [];
        state.activeVendorGroupIndex = 0;
        state.completedVendorGroups.clear();
        state.reviewDirty = false;
        state.expandedInvestmentMonths.clear();
        resetDraftEntities();
        progressStep.hidden = true;
        summaryContent.hidden = false;
        root.querySelector("[data-profile-options]").hidden = true;
        root.querySelector("#import-file-name").textContent = "Choose a file";
        state.maxWorkflowStep = 0;
        showWorkflowStep("upload", 0);
        renderSourcePreview();
        renderFileControl();
        router.setNavigationGuard(null);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        message(root.querySelector("#import-file-message"), "Import cleared.");
      }
      if (action === "wizard-back") {
        captureWizardControls();
        state.mappingWizard.step = Math.max(0, state.mappingWizard.step - 1);
        renderMapper();
      }
      if (action === "back-to-mapping") {
        showWorkflowStep("mapping", 1);
        if (state.mappingWizard) state.mappingWizard.step = 0;
        renderMapper();
      }
      if (action === "group-prev") navigateVendorGroup("previous");
      if (action === "group-next") navigateVendorGroup("next");
      if (action === "summary-back") {
        state.activeVendorGroupIndex = Math.max(
          0,
          state.vendorGroups.length - 1,
        );
        showWorkflowStep("review", 2);
        renderReview();
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
        const flowId = (
          event.target.closest("[data-flow-id]") as HTMLElement | null
        )?.dataset.flowId;
        if (!row || row.queued || !flowId) return;
        row.flows = row.flows.filter((flow) => flow.id !== flowId);
        renderReview();
      }
      if (action === "commit") await commitImport(false);
      if (action === "retry-commit") await commitImport(true);
      if (action === "return-review") {
        state.commit = null as unknown as ImportCommit;
        progressStep.hidden = true;
        summaryContent.hidden = false;
        showWorkflowStep("review", 2);
        router.setNavigationGuard(null);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        renderReview();
      }
      if (action === "finish-import") {
        state.commit = null as unknown as ImportCommit;
        progressStep.hidden = true;
        summaryContent.hidden = false;
        fileInput.value = "";
        state.parsed = null as unknown as ParsedImport;
        state.profile = null as unknown as ImportProfile;
        state.rows = [];
        state.mappingWizard = null as unknown as MappingWizard;
        state.vendorGroups = [];
        state.completedVendorGroups.clear();
        state.activeVendorGroupIndex = 0;
        state.reviewDirty = false;
        state.expandedInvestmentMonths.clear();
        resetDraftEntities();
        root.querySelector("[data-profile-options]").hidden = true;
        root.querySelector("#import-file-name").textContent = "Choose a file";
        state.maxWorkflowStep = 0;
        showWorkflowStep("upload", 0);
        renderSourcePreview();
        renderFileControl();
        message(
          root.querySelector("#import-file-message"),
          "Ready for another CSV.",
        );
      }
      if (action === "open-sync") router.navigate("settings", { section: "sync" });
      if (action === "load-more") {
        handleLoadMore(event);
      }
    } catch (error) {
      showToast(messageFromError(error), { type: "error" });
    }
  }

  /** Applies a selected review filter. */
  function handleFilter(event: ImportControlEvent): void {
    const filter = (
      event.target.closest("[data-import-filter]") as HTMLElement | null
    )?.dataset.importFilter;
    if (
      !filter ||
      ![
        "all",
        "errors",
        "excluded",
        "ready",
        "vendors",
        "people",
        "categories",
      ].includes(filter)
    )
      return;
    state.filter = filter as ImportFilter;
    renderReview();
  }

  /** Reloads cached profiles and refreshes the profile selector. */
  function refreshProfiles(): void {
    APIs.imports
      .listProfiles()
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
  const onMappingDropdownSelection: EventListener = (event) =>
    handleMappingDropdownSelection(event as CustomEvent);
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
  const onCheckboxSelection: EventListener = (event) =>
    handleCheckboxSelection(event as CustomEvent<{ isOn?: boolean }>);
  const onWorkflowSelection: EventListener = (event) =>
    handleWorkflowSelection(event as CustomEvent<{ value?: string }>);
  const onMappingSelection: EventListener = (event) =>
    handleMappingSelection(event as CustomEvent);

  fileInput.addEventListener("change", handleFileChange);
  uploadSurface.addEventListener("dragenter", handleDragEnter);
  uploadSurface.addEventListener("dragover", handleDragOver);
  uploadSurface.addEventListener("dragleave", handleDragLeave);
  uploadSurface.addEventListener("drop", handleDrop);
  mappingSelect.addEventListener("mapping-selected", onMappingSelection);
  profileForm.addEventListener("submit", handleProfileSubmit);
  profileForm.elements.profileId.addEventListener(
    "change",
    chooseProfileCandidate,
  );
  profileForm.elements.target.addEventListener("change", updateTargetFields);
  mappingForm.addEventListener("submit", handleMappingSubmit);
  mappingForm.addEventListener("change", onMappingChange);
  mappingForm.addEventListener(
    "dropdown-selection",
    onMappingDropdownSelection,
  );
  root.addEventListener("change", onReviewChange);
  root.addEventListener("date-change", onReviewDateChange);
  root.addEventListener("vendor-selected", onReviewSelection);
  root.addEventListener("payee-selected", onReviewSelection);
  root.addEventListener("person-selected", onReviewSelection);
  root.addEventListener("category-selected", onReviewSelection);
  root.addEventListener("checkbox-selection", onCheckboxSelection);
  workflowStepper.addEventListener(
    "segmented-control-selection",
    onWorkflowSelection,
  );
  root.addEventListener("click", onAction);
  root.addEventListener("click", onFilter);
  root.addEventListener("click", onWizardNavigation);
  window.addEventListener("budget:import-profiles-changed", refreshProfiles);

  accountOptions();
  mappingSelect.configureOptions(availableProfiles);
  updateTargetFields();
  refreshProfiles();
  renderWorkflowStepper();
  renderSourcePreview();
  renderFileControl();

  cleanup = () => {
    fileInput.removeEventListener("change", handleFileChange);
    uploadSurface.removeEventListener("dragenter", handleDragEnter);
    uploadSurface.removeEventListener("dragover", handleDragOver);
    uploadSurface.removeEventListener("dragleave", handleDragLeave);
    uploadSurface.removeEventListener("drop", handleDrop);
    mappingSelect.removeEventListener("mapping-selected", onMappingSelection);
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
    mappingForm.removeEventListener(
      "dropdown-selection",
      onMappingDropdownSelection,
    );
    root.removeEventListener("change", onReviewChange);
    root.removeEventListener("date-change", onReviewDateChange);
    root.removeEventListener("vendor-selected", onReviewSelection);
    root.removeEventListener("payee-selected", onReviewSelection);
    root.removeEventListener("person-selected", onReviewSelection);
    root.removeEventListener("category-selected", onReviewSelection);
    root.removeEventListener("checkbox-selection", onCheckboxSelection);
    workflowStepper.removeEventListener(
      "segmented-control-selection",
      onWorkflowSelection,
    );
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

if (!customElements.get("import-screen"))
  customElements.define("import-screen", ImportScreen);
