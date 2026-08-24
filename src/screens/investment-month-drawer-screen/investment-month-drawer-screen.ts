// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { InvestmentView } from "../../utilities/investment-view";
import { monthEnd } from "../../utilities/investment-returns";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };
import {
  addListener,
  handleCustomEvent,
} from "../../utilities/event-utilities";

export class InvestmentMonthDrawerScreen extends HTMLElement {
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = templateString;
    }
  }
}

if (!customElements.get("investment-month-drawer-screen")) {
  customElements.define(
    "investment-month-drawer-screen",
    InvestmentMonthDrawerScreen,
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("investment-month-drawer-screen");
  const backdrop = root.querySelector("#investment-month-drawer-backdrop");
  const drawer = backdrop.querySelector(".side-drawer");
  const form = root.querySelector("#investment-month-form");
  const header = backdrop.querySelector("drawer-header");
  const investmentAccountSelect = root.querySelector("investment-account-select");
  const debtAccountSelect = root.querySelector("debt-account-select");
  const monthPicker = form.querySelector("month-picker");
  const balanceInput = form?.querySelector(".investment-month-balance");
  const investmentFields = root.querySelector(
    "#investment-month-investment-fields",
  );
  const debtFields = root.querySelector("#investment-month-debt-fields");
  const contributionList = root.querySelector("#investment-contribution-list");
  const withdrawalList = root.querySelector("#investment-withdrawal-list");
  const paymentList = root.querySelector("#debt-payment-list");
  const borrowingList = root.querySelector("#debt-borrowing-list");
  const message = root.querySelector("#investment-month-message");
  const submit = form.querySelector('custom-button[type="submit"]');
  const batchToggle = root.querySelector("#investment-batch-toggle");
  const batchInput = form.elements.batchEntry;
  const metadata = root.querySelector("#investment-balance-metadata");
  const balanceId = root.querySelector("#investment-balance-id");
  const appShell = document.querySelector(".app-shell");

  let kind = "investment";
  let existingBalance = null;
  let initialState = "";
  let openedRouteKey = "";
  let returnFocus = null;

  function activeAccountSelect() {
    return kind === "debt" ? debtAccountSelect : investmentAccountSelect;
  }

  const defaultDate = () =>
    `${monthPicker.value || InvestmentView.currentMonth()}-15`;

  function flowRow(record, label) {
    return `
    <div class="investment-flow-row" data-flow-id="${record?.id || ""}">
      <currency-input data-flow-amount value="${Math.abs(Number(record?.amount || 0)) || ""}" aria-label="${label} amount"></currency-input>
      <date-picker data-flow-date optional alignment="center" value="${record?.date || ""}" aria-label="${label} date"></date-picker>
      <custom-button class="tertiary square" data-remove-flow leading-icon="close" aria-label="Remove ${label.toLowerCase()}" type="button"></custom-button>
    </div>`;
  }

  function flowAmountInput(row) {
    return row.querySelector("currency-input input");
  }

  function state() {
    return JSON.stringify({
      kind,
      accountId: activeAccountSelect().value,
      month: monthPicker.value,
      balance: balanceInput.value,
      flows: [...form.querySelectorAll(".investment-flow-row")].map((row) => ({
        id: row.dataset.flowId,
        amount: flowAmountInput(row).value,
        date: row.querySelector("[data-flow-date]").value,
      })),
    });
  }

  function isDirty() {
    return !backdrop.hidden && state() !== initialState;
  }

  function populateAccounts(selected = "") {
    investmentAccountSelect.value = kind === "investment" ? selected : "";
    debtAccountSelect.value = kind === "debt" ? selected : "";
  }

  function clearLists() {
    contributionList.replaceChildren();
    withdrawalList.replaceChildren();
    paymentList.replaceChildren();
    borrowingList.replaceChildren();
  }

  function populateTarget(accountId, month) {
    monthPicker.value = month || InvestmentView.currentMonth();
    populateAccounts(accountId);
    clearLists();
    existingBalance = null;

    if (kind === "investment" && accountId) {
      const value = APIs.investment.monthData(accountId, monthPicker.value);
      existingBalance = value?.balance || null;
      balanceInput.value = value?.balance?.balance ?? "";
      contributionList.innerHTML = (value?.contributions || [])
        .filter((item) => item.amount > 0)
        .map((item) => flowRow(item, "Contribution"))
        .join("");
      withdrawalList.innerHTML = (value?.contributions || [])
        .filter((item) => item.amount < 0)
        .map((item) => flowRow(item, "Withdrawal"))
        .join("");
    } else if (kind === "debt" && accountId) {
      existingBalance =
        APIs.debt
          .balances()
          .find(
            (item) =>
              item.debtAccountId === accountId &&
              item.month === monthPicker.value,
          ) || null;
      balanceInput.value = existingBalance?.balance ?? "";
      const flows = APIs.debt
        .payments()
        .filter(
          (item) =>
            item.debtAccountId === accountId &&
            item.month === monthPicker.value,
        );
      paymentList.innerHTML = flows
        .filter((item) => item.kind !== "borrowing")
        .map((item) => flowRow(item, "Payment"))
        .join("");
      borrowingList.innerHTML = flows
        .filter((item) => item.kind === "borrowing")
        .map((item) => flowRow(item, "New borrowing"))
        .join("");
    } else balanceInput.value = "";

    const existing = Boolean(existingBalance);
    header.title = existing ? `Edit ${kind} month` : `New ${kind} entry`;
    submit.label = existing ? "Save changes" : "Add entry";
    metadata.hidden = !existing;
    balanceId.textContent = existingBalance?.id || "";
    batchToggle.hidden = existing;
    if (existing) batchInput.checked = false;
    message.textContent = "";
    message.className = "form-message";
    initialState = state();
  }

  function setKind(nextKind, accountId = "") {
    kind = nextKind === "debt" ? "debt" : "investment";
    investmentFields.hidden = kind !== "investment";
    debtFields.hidden = kind !== "debt";
    investmentAccountSelect.hidden = kind !== "investment";
    debtAccountSelect.hidden = kind !== "debt";

    balanceInput.label =
      kind === "debt" ? "Outstanding balance" : "Ending balance";

    populateTarget(
      accountId,
      monthPicker.value || InvestmentView.currentMonth(),
    );
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
      (activeAccountSelect().value ? balanceInput : activeAccountSelect()).focus({
        preventScroll: true,
      });
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
    (activeAccountSelect().value ? balanceInput : activeAccountSelect()).focus({
      preventScroll: true,
    });
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
      isDirty() &&
      !window.confirm("Discard your unsaved ledger changes?")
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
        investmentMonth: null,
        investmentReviewId: null,
        investmentLedgerSource: null,
      });
    return true;
  }

  function openFromRoute() {
    const params = router.currentParams();
    if (params.drawer !== "investment-month") {
      if (!backdrop.hidden) close(true, false);
      return;
    }
    const nextKind =
      params.investmentLedgerSource === "debt" ? "debt" : "investment";
    const month = params.investmentMonth || InvestmentView.currentMonth();
    const accountId = params.investmentAccountId || "";
    const routeKey = `${nextKind}:${accountId}:${month}`;
    if (routeKey === openedRouteKey && !backdrop.hidden) return;
    kind = nextKind;
    monthPicker.value = month;
    setKind(kind, accountId);
    openedRouteKey = routeKey;
    if (backdrop.hidden) show();
  }

  function addFlow(list, label) {
    list.insertAdjacentHTML("beforeend", flowRow(null, label));
    list
      .querySelector(".investment-flow-row:last-child currency-input input")
      ?.focus();
  }

  function collect(list, sign = 1) {
    return [...list.querySelectorAll(".investment-flow-row")].flatMap((row) => {
      const amount = Number(flowAmountInput(row).value || 0);
      if (!amount) return [];
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Enter flow amounts as positive values.");
      return [
        {
          id: row.dataset.flowId || undefined,
          amount: sign * amount,
          date: row.querySelector("[data-flow-date]").value || defaultDate(),
        },
      ];
    });
  }

  async function saveDebtMonth() {
    const accountId = activeAccountSelect().value;
    const month = monthPicker.value;
    await APIs.debt.saveBalance({
      id: existingBalance?.id,
      debtAccountId: accountId,
      asOfDate: monthEnd(month),
      balance: balanceInput.value,
    });
    const existing = APIs.debt
      .payments()
      .filter(
        (item) => item.debtAccountId === accountId && item.month === month,
      );
    const drafts = [
      ...collect(paymentList).map((item) => ({ ...item, kind: "payment" })),
      ...collect(borrowingList).map((item) => ({ ...item, kind: "borrowing" })),
    ];
    const retained = new Set(drafts.map((item) => item.id).filter(Boolean));
    await Promise.all(
      existing
        .filter((item) => !retained.has(item.id))
        .map((item) => APIs.debt.deletePayment(item.id)),
    );
    await Promise.all(
      drafts.map((item) =>
        APIs.debt.savePayment({ ...item, debtAccountId: accountId }),
      ),
    );
  }

  addListener("segmented-control-selection", drawer, (event) => {
    handleCustomEvent("segmented-control-selection", event, ({ value }) => {
      if (value === kind) return;
      if (
        isDirty() &&
        !window.confirm("Discard this draft and change entry type?")
      ) {
        return;
      }

      setKind(event.detail.value);
    });
  });

  function handleAccountSelection() {
    populateTarget(activeAccountSelect().value, monthPicker.value);
  }
  investmentAccountSelect.addEventListener("investment-account-selected", handleAccountSelection);
  debtAccountSelect.addEventListener("debt-account-selected", handleAccountSelection);
  monthPicker.addEventListener("change", () =>
    populateTarget(activeAccountSelect().value, monthPicker.value),
  );
  root
    .querySelector("#add-investment-contribution")
    .addEventListener("click", () => addFlow(contributionList, "Contribution"));
  root
    .querySelector("#add-investment-withdrawal")
    .addEventListener("click", () => addFlow(withdrawalList, "Withdrawal"));
  root
    .querySelector("#add-debt-payment")
    .addEventListener("click", () => addFlow(paymentList, "Payment"));
  root
    .querySelector("#add-debt-borrowing")
    .addEventListener("click", () => addFlow(borrowingList, "New borrowing"));
  form.addEventListener("click", (event) =>
    event.target
      .closest("[data-remove-flow]")
      ?.closest(".investment-flow-row")
      ?.remove(),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeAccountSelect().value || !monthPicker.value || !form.reportValidity())
      return;
    submit.setAttribute("disabled", "");
    try {
      if (kind === "investment") {
        const current = APIs.investment.monthData(
          activeAccountSelect().value,
          monthPicker.value,
        );
        APIs.investment.queueMonth({
          accountId: activeAccountSelect().value,
          month: monthPicker.value,
          balance: balanceInput.value,
          asOfDate: monthEnd(monthPicker.value),
          balanceId: current?.balance?.id,
          existingContributions: current?.contributions || [],
          contributions: [
            ...collect(contributionList, 1),
            ...collect(withdrawalList, -1),
          ].map((item) => ({ ...item, flowType: "external" })),
        });
      } else await saveDebtMonth();
      initialState = state();
      showToast(`${kind === "debt" ? "Debt" : "Investment"} month saved.`);
      if (!existingBalance && batchInput.checked) {
        const preservedMonth = monthPicker.value;
        populateTarget("", preservedMonth);
        batchInput.checked = true;
        message.className = "form-message success";
        message.textContent = "Entry added. Choose the next account.";
        initialState = state();
        activeAccountSelect().focus();
        router.updateParams({
          investmentAccountId: null,
          investmentMonth: preservedMonth,
          investmentLedgerSource: kind,
        });
      } else close(true);
    } catch (error) {
      message.className = "form-message error";
      message.textContent =
        error instanceof Error ? error.message : "Unable to save this month.";
    } finally {
      submit.removeAttribute("disabled");
    }
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) close();
  });
  window.addEventListener("app:route-changed", openFromRoute);
  window.addEventListener("budget:investments-loaded", openFromRoute);
  window.addEventListener("drawer:close-requested", () => close());
  openFromRoute();
});
