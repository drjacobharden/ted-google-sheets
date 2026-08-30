import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };
import { PeopleSelect } from "../../components/dropdowns/people-select";
import {
  dispatchCustomEvent,
  handleCustomEvent,
} from "../../utilities/event-utilities";
import { SegmentedControl } from "../../components/segmented-control/segmented-control";
import { CustomButton } from "../../components/button/button";
import { CategorySelect } from "../../components/dropdowns/category-select";
import { SourceSelect } from "../../components/dropdowns/source-select";
import { DrawerHeader } from "../../components/drawer-header/drawer-header";

export class InvestmentAccountDrawerScreen extends HTMLElement {
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = templateString;
    }
  }
}

if (!customElements.get("investment-account-drawer-screen")) {
  customElements.define(
    "investment-account-drawer-screen",
    InvestmentAccountDrawerScreen,
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("investment-account-drawer-screen")!;
  const backdrop: HTMLElement = root.querySelector(
    "#investment-account-drawer-backdrop",
  )!;
  const drawer: HTMLElement = backdrop.querySelector(".side-drawer")!;
  const form: HTMLFormElement = root.querySelector(
    "#investment-account-edit-form",
  )!;
  const nameInput: HTMLInputElement = drawer.querySelector(
    "#investment-account-name-input",
  )!;
  const percentageInput: HTMLInputElement = drawer.querySelector(
    "#investment-account-percentage-input",
  )!;
  const header: DrawerHeader = backdrop.querySelector("drawer-header")!;
  const kindControl: SegmentedControl =
    drawer.querySelector("segmented-control")!;
  const debtFields: HTMLElement = root.querySelector("#debt-account-fields")!;
  const sourceSelect: SourceSelect = root.querySelector("source-select")!;
  const debtCategory: CategorySelect = root.querySelector(
    "#debt-account-category",
  )!;
  const assignmentSelect: PeopleSelect = root.querySelector(
    "people-select",
  ) as PeopleSelect;
  const message = form.querySelector(".form-message")!;
  const submit: CustomButton = form.querySelector(
    'custom-button[type="submit"]',
  )!;
  const archive: CustomButton = form.querySelector("[data-account-archive]")!;
  const appShell: HTMLElement = document.querySelector(".app-shell")!;
  let kind: "debt" | "investment" = "investment";
  let accountId = "";
  let initialState = "";
  let openedRouteKey = "";
  let returnFocus: HTMLElement | null = null;

  kindControl.items = [
    { key: "investment", title: "Investment", isDefaultValue: true },
    { key: "debt", title: "Debt" },
  ];

  function formState() {
    return JSON.stringify({
      kind,
      name: nameInput.value.trim(),
      source: sourceSelect.value,
      assignmentId: assignmentSelect.value,
      interestRate: percentageInput.value,
      categoryId: debtCategory.value,
    });
  }

  function setKind(next: "debt" | "investment") {
    kind = next === "debt" ? "debt" : "investment";
    kindControl.selection = kind;
    debtFields.hidden = kind !== "debt";
  }

  function show() {
    returnFocus = document.activeElement as HTMLElement;
    backdrop.classList.remove("is-closing", "is-open");
    backdrop.hidden = false;
    void drawer.offsetWidth;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      nameInput.focus({ preventScroll: true });
    } else {
      drawer.addEventListener("transitionend", handleDrawerOpened);
    }

    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
  }

  function handleDrawerOpened(event: TransitionEvent) {
    if (event.target !== drawer || event.propertyName !== "transform") {
      return;
    }

    drawer.removeEventListener("transitionend", handleDrawerOpened);
    nameInput.focus({ preventScroll: true });
  }

  function finishClose() {
    backdrop.hidden = true;
    backdrop.classList.remove("is-open", "is-closing");
    document.body.classList.remove("drawer-open");
    appShell.inert = false;
    openedRouteKey = "";
    returnFocus?.focus?.();
  }

  function close(force = false, updateRoute = true) {
    if (backdrop.hidden) return true;
    if (
      !force &&
      formState() !== initialState &&
      !window.confirm("Discard your unsaved account changes?")
    )
      return false;
    backdrop.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    window.setTimeout(
      finishClose,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300,
    );
    if (updateRoute)
      router.updateParams({
        drawer: null,
        investmentAccountId: null,
        investmentLedgerSource: null,
        accountDraftName: null,
        accountCreateRequestId: null,
      });
    return true;
  }

  function openFromRoute() {
    const params = router.currentParams();

    if (params.drawer !== "investment-account") {
      if (!backdrop.hidden) close(true, false);
      return;
    }

    const nextKind =
      params.investmentLedgerSource === "debt-account" ? "debt" : "investment";

    const id = params.investmentAccountId || "";
    const draftName = id ? "" : params.accountDraftName || "";
    const requestId = id ? "" : params.accountCreateRequestId || "";

    const routeKey = `${nextKind}:${id}:${requestId}:${draftName}`;
    if (routeKey === openedRouteKey && !backdrop.hidden) return;

    kind = nextKind;
    accountId = id;

    const account = id
      ? APIs.accounts.accounts().find((item) => item.id === id)
      : null;

    if (id && !account) return;

    setKind(kind);
    kindControl.hidden = Boolean(account);
    nameInput.value = account?.name || draftName;
    sourceSelect.value = account?.source || "manual";
    debtCategory.type = "expense";
    const linkedCategory = APIs.budget
      .listAllCategories()
      .find((item) => item.id === account?.categoryId);
    debtCategory.setFallbackSelection(
      linkedCategory
        ? {
            id: linkedCategory.id,
            name: linkedCategory.name,
            archived: linkedCategory.active === false,
          }
        : null,
    );
    debtCategory.value = account?.categoryId || "";
    percentageInput.value = account?.interestRate
      ? String(account.interestRate)
      : "";
    assignmentSelect.value =
      account?.assignmentId || APIs.budget.SHARED_ASSIGNMENT_ID;
    archive.hidden = !account;
    header.title = account ? `Edit account` : `Add account`;
    submit.label = account ? "Save changes" : "Add account";
    message.textContent = "";
    message.className = "form-message";
    initialState = formState();
    openedRouteKey = routeKey;
    if (backdrop.hidden) show();
  }

  kindControl.addListener({
    handleEvent: (event) => {
      handleCustomEvent("segmented-control-selection", event, ({ value }) => {
        setKind(value as "debt" | "investment");
      });
    },
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.setAttribute("disabled", "");

    try {
      const common = {
        name: nameInput.value,
        assignmentId: assignmentSelect.value,
      };
      const savedAccount = await APIs.accounts.saveAccount(
        kind === "debt"
          ? {
              ...common,
              type: "debt",
              source: sourceSelect.value,
              categoryId: debtCategory.value,
              interestRate: Number(percentageInput.value || 0),
              ...(accountId ? { id: accountId } : {}),
            }
          : {
              ...common,
              type: "investment",
              source: sourceSelect.value,
              ...(accountId ? { id: accountId } : {}),
            },
      );
      initialState = formState();
      const requestId = router.currentParams().accountCreateRequestId || "";
      if (!accountId && requestId) {
        dispatchCustomEvent("budget:account-created", window, {
          account: savedAccount,
          requestId,
        });
      }
      showToast(
        `${kind === "debt" ? "Debt" : "Investment"} account ${accountId ? "updated" : "added"}.`,
      );
      close(true);
    } catch (error) {
      message.className = "form-message error";
      message.textContent =
        error instanceof Error ? error.message : "Unable to save account.";
    } finally {
      submit.removeAttribute("disabled");
    }
  });
  archive.addEventListener("click", async () => {
    if (
      !accountId ||
      !window.confirm(
        "Archive this account? Its history will remain available.",
      )
    )
      return;
    await APIs.accounts.archiveAccount(accountId);
    initialState = formState();
    close(true);
    showToast("Account archived.");
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) close();
  });
  window.addEventListener("app:route-changed", openFromRoute);
  window.addEventListener("budget:accounts-loaded", openFromRoute);
  window.addEventListener("budget:accounts-changed", openFromRoute);
  window.addEventListener("drawer:close-requested", () => close());
  openFromRoute();
});
