// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };
import { PeopleSelect } from "../../components/people-select/people-select";

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
  const root = document.querySelector("investment-account-drawer-screen");
  const backdrop = root.querySelector("#investment-account-drawer-backdrop");
  const drawer = backdrop.querySelector(".side-drawer");
  const form = root.querySelector("#investment-account-edit-form");
  const header = backdrop.querySelector("drawer-header");
  const kindControl = root.querySelector("#investment-account-kind");
  const investmentFields = root.querySelector("#investment-account-fields");
  const debtFields = root.querySelector("#debt-account-fields");
  const sourceSelect = root.querySelector("#investment-account-source");
  const assignmentSelect = root.querySelector("people-select") as PeopleSelect;
  const footnote = root.querySelector("#investment-account-footnote");
  const message = form.querySelector(".form-message");
  const submit = form.querySelector('custom-button[type="submit"]');
  const archive = form.querySelector("[data-account-archive]");
  const appShell = document.querySelector(".app-shell");
  let kind = "investment";
  let accountId = "";
  let initialState = "";
  let openedRouteKey = "";
  let returnFocus = null;

  kindControl.items = [
    { key: "investment", title: "Investment", isDefaultValue: true },
    { key: "debt", title: "Debt" },
  ];

  sourceSelect.items = [
    { key: "manual", title: "Manual transfer", isDefaultValue: true },
    { key: "paycheck", title: "Paycheck deduction" },
  ];

  function formState() {
    return JSON.stringify({
      kind,
      name: form.elements.name.value.trim(),
      source: sourceSelect.selection,
      assignmentId: assignmentSelect.value,
      lender: form.elements.lender.value.trim(),
      interestRate: form.elements.interestRate.value,
    });
  }

  function setKind(next) {
    kind = next === "debt" ? "debt" : "investment";
    kindControl.selection = kind;
    investmentFields.hidden = kind !== "investment";
    debtFields.hidden = kind !== "debt";
    footnote.textContent =
      kind === "debt"
        ? "Debt balances and dated activity are tracked separately from budget expenses."
        : "Paycheck deductions count toward Total savings. Manual transfers allocate savings that the budget has already counted.";
  }

  function show() {
    returnFocus = document.activeElement;
    backdrop.classList.remove("is-closing", "is-open");
    backdrop.hidden = false;
    void drawer.offsetWidth;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      form.elements.name.focus({ preventScroll: true });
    } else {
      drawer.addEventListener("transitionend", handleDrawerOpened);
    }

    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
  }

  function handleDrawerOpened(event) {
    if (event.target !== drawer || event.propertyName !== "transform") {
      return;
    }

    drawer.removeEventListener("transitionend", handleDrawerOpened);
    form.elements.name.focus({ preventScroll: true });
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
    const routeKey = `${nextKind}:${id}`;
    if (routeKey === openedRouteKey && !backdrop.hidden) return;
    kind = nextKind;
    accountId = id;
    const account = id ? APIs.accounts.accounts().find((item) => item.id === id) : null;
    if (id && !account) return;
    setKind(kind);
    kindControl.hidden = Boolean(account);
    form.elements.name.value = account?.name || "";
    sourceSelect.selection = account?.source || "manual";
    form.elements.lender.value = account?.lender || "";
    form.elements.interestRate.value = account?.interestRate || "";
    account?.assignmentId && (assignmentSelect.value = account?.assignmentId);
    archive.hidden = !account;
    header.title = account ? `Edit ${kind} account` : `Add ${kind} account`;
    submit.label = account ? "Save changes" : "Add account";
    message.textContent = "";
    message.className = "form-message";
    initialState = formState();
    openedRouteKey = routeKey;
    if (backdrop.hidden) show();
  }

  kindControl.addEventListener("segmented-control-selection", (event) =>
    setKind(event.detail.value),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.setAttribute("disabled", "");
    try {
      const common = {
        name: form.elements.name.value,
        assignmentId: assignmentSelect.value,
      };
      await APIs.accounts.saveAccount(kind === "debt"
        ? { ...common, type: "debt", lender: form.elements.lender.value, interestRate: Number(form.elements.interestRate.value || 0), ...(accountId ? { id: accountId } : {}) }
        : { ...common, type: "investment", source: sourceSelect.selection, ...(accountId ? { id: accountId } : {}) });
      initialState = formState();
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
  window.addEventListener("budget:investments-loaded", openFromRoute);
  window.addEventListener("budget:debts-changed", openFromRoute);
  window.addEventListener("drawer:close-requested", () => close());
  openFromRoute();
});
