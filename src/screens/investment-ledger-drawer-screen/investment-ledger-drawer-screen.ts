// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { investmentLedgerRows } from "../../utilities/investment-ledger";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };

export class InvestmentLedgerDrawerScreen extends HTMLElement {
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = templateString;
    }
  }
}

if (!customElements.get("investment-ledger-drawer-screen")) {
  customElements.define(
    "investment-ledger-drawer-screen",
    InvestmentLedgerDrawerScreen,
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("investment-ledger-drawer-screen");
  const backdrop = root.querySelector("#investment-ledger-drawer-backdrop");
  const drawer = backdrop.querySelector(".side-drawer");
  const form = root.querySelector("#investment-ledger-entry-form");
  const header = backdrop.querySelector("drawer-header");
  const typeControl = root.querySelector("#investment-ledger-type-control");
  const typeInput = form.elements.type;
  const accountSelect = form.elements.accountId;
  const datePicker = form.querySelector('date-picker[name="date"]');
  const message = root.querySelector("#investment-ledger-entry-message");
  const deleteButton = root.querySelector("#delete-investment-ledger-entry");
  const saveButton = form.querySelector('custom-button[type="submit"]');
  const metadata = root.querySelector("#investment-ledger-entry-metadata");
  const idLabel = root.querySelector("#investment-ledger-entry-id");
  const createdFootnote = root.querySelector(
    "#investment-ledger-created-footnote",
  );
  const appShell = document.querySelector(".app-shell");
  const amountInput = form.elements.amount;
  const createdDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  root.querySelector("currency-input > span").textContent = "Amount";
  typeControl.items = [
    { key: "investment", title: "Contribution", isDefaultValue: true },
    { key: "withdrawal", title: "Withdrawal" },
    { key: "debt-payment", title: "Debt payment" },
    { key: "borrowing", title: "New borrowing" },
  ];

  let current = null;
  let returnFocus = null;
  let initialFormState = "";
  let openedRouteKey = "";
  let closing = false;
  let closeTimer = 0;
  let closeAnimationHandler = null;

  function accountOptions(type, selectedId = "") {
    const values = APIs.accounts.accounts().filter((item) =>
      ["debt-payment", "borrowing"].includes(type)
        ? item.type === "debt"
        : item.type === "investment",
    );
    accountSelect.replaceChildren(
      new Option("Choose an account", ""),
      ...values
        .filter((item) => item.active !== false || item.id === selectedId)
        .map((item) => new Option(item.name, item.id)),
    );
  }

  function setType(type, selectedId = accountSelect.value) {
    const nextType = ["investment", "withdrawal", "debt-payment", "borrowing"].includes(type)
      ? type
      : "investment";
    typeInput.value = nextType;
    typeControl.selection = nextType;
    accountOptions(nextType, selectedId);
    accountSelect.value = selectedId;
  }

  function rowType(row) {
    if (row?.type === "Withdrawal") return "withdrawal";
    if (row?.type === "Debt payment") return "debt-payment";
    if (row?.type === "New borrowing") return "borrowing";
    return "investment";
  }

  function rawRecord(row) {
    if (!row) return null;
    return APIs.accounts.activity().find((item) => item.id === row.id);
  }

  function formState() {
    return JSON.stringify({
      type: typeInput.value,
      amount: amountInput.value,
      date: datePicker.value,
      accountId: accountSelect.value,
    });
  }

  function isDirty() {
    return !backdrop.hidden && formState() !== initialFormState;
  }

  function handleDrawerOpened(event) {
    if (event.target !== drawer || event.propertyName !== "transform") return;
    drawer.removeEventListener("transitionend", handleDrawerOpened);
    amountInput.focus({ preventScroll: true });
  }

  function showDrawer() {
    message.textContent = "";
    message.className = "form-message";
    if (closeTimer) window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    drawer.removeEventListener("transitionend", handleDrawerOpened);
    closing = false;
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.classList.remove("is-closing", "is-open");
    backdrop.hidden = false;
    void drawer.offsetWidth;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      amountInput.focus({ preventScroll: true });
    } else {
      drawer.addEventListener("transitionend", handleDrawerOpened);
    }

    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
  }

  function populateFromRoute() {
    const params = router.currentParams();
    if (params.drawer !== "investment-ledger-entry") {
      if (!backdrop.hidden) close(true, { updateRoute: false });
      return;
    }

    const routeKey = `${params.investmentLedgerSource || "new"}:${params.investmentLedgerId || "new"}`;
    if (openedRouteKey === routeKey && !backdrop.hidden) return;

    returnFocus = document.activeElement;
    current = params.investmentLedgerId
      ? investmentLedgerRows().find(
          (item) =>
            item.id === params.investmentLedgerId &&
            item.source === params.investmentLedgerSource,
        )
      : null;

    if (params.investmentLedgerId && !current) {
      showToast("That ledger entry is no longer available.", { type: "error" });
      router.updateParams({
        drawer: null,
        investmentLedgerId: null,
        investmentLedgerSource: null,
      });
      return;
    }

    const type = rowType(current);
    setType(type, current?.accountId || "");
    amountInput.value = current ? Math.abs(current.amount) : "";
    datePicker.value = current?.date || new Date().toISOString().slice(0, 10);
    accountSelect.value = current?.accountId || "";
    header.title = current ? "Edit ledger entry" : "New ledger entry";
    saveButton.label = current ? "Save changes" : "Add entry";
    deleteButton.hidden = !current;
    metadata.hidden = !current;
    idLabel.textContent = current?.id || "";

    const record = rawRecord(current);
    const createdAt = record?.createdAt ? new Date(record.createdAt) : null;
    createdFootnote.textContent =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? `Created on ${createdDateFormatter.format(createdAt)}`
        : "";

    initialFormState = formState();
    openedRouteKey = routeKey;
    showDrawer();
    window.setTimeout(() => {
      if (!backdrop.hidden && openedRouteKey === routeKey) {
        initialFormState = formState();
      }
    }, 0);
  }

  function finishClose() {
    if (!closing) return;
    closing = false;
    if (closeTimer) window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    drawer.removeEventListener("transitionend", handleDrawerOpened);
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.hidden = true;
    backdrop.classList.remove("is-closing", "is-open");
    document.body.classList.remove("drawer-open");
    appShell.inert = false;
    current = null;
    openedRouteKey = "";
    initialFormState = "";
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.querySelector('[data-investment-subtab="ledger"]')
    )?.focus();
  }

  function close(force = false, { updateRoute = true } = {}) {
    if (closing || backdrop.hidden) return true;
    if (
      !force &&
      isDirty() &&
      !window.confirm("Discard your unsaved ledger changes?")
    ) {
      return false;
    }

    closing = true;
    backdrop.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    closeAnimationHandler = (event) => {
      if (event.target === drawer && event.propertyName === "transform") {
        finishClose();
      }
    };
    drawer.addEventListener("transitionend", closeAnimationHandler);
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    closeTimer = window.setTimeout(finishClose, reducedMotion ? 0 : 320);

    if (updateRoute && router.currentParams().drawer) {
      router.updateParams({
        drawer: null,
        investmentLedgerId: null,
        investmentLedgerSource: null,
      });
    }
    return true;
  }

  function monthDataOrThrow(accountId, date) {
    const month = date.slice(0, 7);
    const value = APIs.accounts.monthData(accountId, month);
    if (!value?.balance) {
      throw new Error(
        "Record this account’s monthly balance before adding an investment flow.",
      );
    }
    return value;
  }

  function saveInvestment(accountId, date, amount, id = "") {
    const value = monthDataOrThrow(accountId, date);
    const activity = [
      ...value.activity.filter((item) => item.id !== id),
      { id: id || undefined, amount, date, activityType: "contribution", flowType: "external" },
    ];
    APIs.accounts.saveMonth({
      accountId,
      month: date.slice(0, 7),
      balance: value.balance.balance,
      asOfDate: value.balance.asOfDate,
      balanceId: value.balance.id,
      notes: value.balance.notes,
      existingActivity: value.activity,
      activity,
    });
  }

  function removeInvestment(row) {
    const value = APIs.accounts.monthData(row.accountId, row.month);
    if (!value?.balance) return;
    APIs.accounts.saveMonth({
      accountId: row.accountId,
      month: row.month,
      balance: value.balance.balance,
      asOfDate: value.balance.asOfDate,
      balanceId: value.balance.id,
      notes: value.balance.notes,
      existingActivity: value.activity,
      activity: value.activity.filter((item) => item.id !== row.id),
    });
  }

  typeControl.addEventListener("dropdown-selection", (event) => {
    setType(event.detail.value, "");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    message.className = "form-message";

    if (!form.reportValidity()) return;

    const type = typeInput.value;
    const defaultMonth = current?.month || new Date().toISOString().slice(0, 7);
    const date = datePicker.value || `${defaultMonth}-15`;
    const accountId = accountSelect.value;
    const amount = Math.abs(Number(amountInput.value));
    if (!Number.isFinite(amount) || amount <= 0) {
      message.textContent = "Enter a positive amount.";
      message.className = "form-message error";
      return;
    }

    try {
      if (!["debt-payment", "borrowing"].includes(type)) monthDataOrThrow(accountId, date);
      const sameInvestment =
        current?.source === "investment" &&
        !["debt-payment", "borrowing"].includes(type) &&
        current.accountId === accountId &&
        current.month === date.slice(0, 7);
      const sameDebt = current?.source === "debt" && ["debt-payment", "borrowing"].includes(type);

      if (current && !sameInvestment && !sameDebt) {
        if (current.source === "investment") removeInvestment(current);
        else await APIs.accounts.deleteActivity(current.id);
      }

      if (["debt-payment", "borrowing"].includes(type)) {
        await APIs.accounts.saveMonth({ accountId, month: date.slice(0, 7), balance: APIs.accounts.monthData(accountId, date.slice(0, 7))?.balance?.balance || 0, existingActivity: APIs.accounts.monthData(accountId, date.slice(0, 7))?.activity || [], activity: [{
          id: sameDebt ? current.id : undefined,
          date,
          amount,
          activityType: type === "borrowing" ? "borrowing" : "payment",
        }] });
      } else {
        saveInvestment(
          accountId,
          date,
          type === "withdrawal" ? -amount : amount,
          sameInvestment ? current.id : "",
        );
      }

      initialFormState = formState();
      showToast(current ? "Ledger entry updated." : "Ledger entry added.");
      close(true);
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : "Unable to save entry.";
      message.className = "form-message error";
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (
      !current ||
      !window.confirm("Delete this ledger entry? This cannot be undone.")
    ) {
      return;
    }
    deleteButton.setAttribute("disabled", "");
    try {
      if (current.source === "investment") removeInvestment(current);
      else await APIs.accounts.deleteActivity(current.id);
      initialFormState = formState();
      showToast("Ledger entry deleted.");
      close(true);
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : "Unable to delete entry.";
      message.className = "form-message error";
    } finally {
      deleteButton.removeAttribute("disabled");
    }
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) close();
  });
  window.addEventListener("app:route-changed", populateFromRoute);
  window.addEventListener("drawer:close-requested", () => close());
  populateFromRoute();
});
