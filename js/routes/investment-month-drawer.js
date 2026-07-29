document.addEventListener("DOMContentLoaded", () => {
  const { money } = window.AppUtils;
  const { createdDateTimeFormatter } = window.DateUtils;
  const backdrop = document.getElementById("investment-month-drawer-backdrop");
  const drawer = document.getElementById("investment-month-drawer");
  const form = document.getElementById("investment-month-form");
  const header = document.getElementById("investment-drawer-header");
  const accountSelect = form.elements.accountId;
  const monthPicker = form.querySelector("month-picker");
  const balanceInput = form.elements.balance;
  const contributionList = document.getElementById(
    "investment-contribution-list",
  );
  const withdrawalList = document.getElementById("investment-withdrawal-list");
  const message = document.getElementById("investment-month-message");
  const existingNotice = document.getElementById("investment-month-existing");
  const conflictPanel = document.getElementById("investment-month-conflict");
  const metadata = document.getElementById("investment-balance-metadata");
  const createdLabel = document.getElementById("investment-balance-created");
  const batchToggle = document.getElementById("investment-batch-toggle");
  const batchInput = form.elements.batchEntry;
  const submit = form.querySelector('[type="submit"]');
  const appShell = document.querySelector(".app-shell");
  let mode = "create";
  let target = { accountId: "", month: "" };
  let reviewId = "";
  let initialDraftState = "";
  let openedRouteKey = "";
  let returnFocus = null;
  let closing = false;
  let closeTimer = 0;
  let closeAnimationHandler = null;
  let suppressSingleDefault = false;

  function flowRow(record, type) {
    const amount = Math.abs(Number(record?.amount || 0));
    return `<div class="investment-flow-row" data-flow-id="${record?.id || ""}"><label><span class="sr-only">${type} amount</span><span class="currency-prefix">$</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${amount || ""}" aria-label="${type} amount" /></label><button type="button" data-remove-flow aria-label="Remove ${type.toLowerCase()}">×</button></div>`;
  }

  function flowTotal(value) {
    return (value?.contributions || []).reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
  }

  function draftState() {
    return JSON.stringify({
      balance: balanceInput.value,
      contributions: [...contributionList.querySelectorAll("input")].map(
        (input) => input.value,
      ),
      withdrawals: [...withdrawalList.querySelectorAll("input")].map(
        (input) => input.value,
      ),
    });
  }

  function isDirty() {
    return !backdrop.hidden && draftState() !== initialDraftState;
  }

  function collectFlows() {
    const collect = (list, sign) =>
      [...list.querySelectorAll(".investment-flow-row")].flatMap((row) => {
        const raw = row.querySelector("input").value;
        if (raw === "" || Number(raw) === 0) return [];
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(
            "Enter contribution and withdrawal amounts as positive values.",
          );
        }
        return [{ id: row.dataset.flowId || "", amount: sign * amount }];
      });
    return [...collect(contributionList, 1), ...collect(withdrawalList, -1)];
  }

  function updateTotals() {
    const contributions = [
      ...contributionList.querySelectorAll("input"),
    ].reduce((sum, input) => sum + Number(input.value || 0), 0);
    const withdrawals = [...withdrawalList.querySelectorAll("input")].reduce(
      (sum, input) => sum + Number(input.value || 0),
      0,
    );
    document.getElementById("investment-gross-contributions").textContent =
      money(contributions);
    document.getElementById("investment-total-withdrawals").textContent =
      money(withdrawals);
    document.getElementById("investment-net-contribution").textContent = money(
      contributions - withdrawals,
    );
  }

  function setEntryDisabled(disabled) {
    balanceInput.disabled = disabled;
    form
      .querySelectorAll(
        "#add-investment-contribution, #add-investment-withdrawal, .investment-flow-list input, .investment-flow-list button",
      )
      .forEach((element) => {
        element.disabled = disabled;
      });
    submit.disabled = disabled;
  }

  function populateAccounts() {
    const active = window.InvestmentAPI.accounts().filter(
      (item) => item.active !== false,
    );
    accountSelect.replaceChildren(
      new Option("Choose an account", ""),
      ...active.map((account) => new Option(account.name, account.id)),
    );
    return active;
  }

  function clearValues() {
    balanceInput.value = "";
    contributionList.replaceChildren();
    withdrawalList.replaceChildren();
    conflictPanel.hidden = true;
    existingNotice.hidden = true;
    metadata.hidden = true;
    message.textContent = "";
    message.className = "form-message";
    updateTotals();
  }

  function populateConflict(conflict) {
    conflictPanel.hidden = !conflict;
    if (!conflict) return;
    document.getElementById("investment-month-sheet-balance").textContent =
      money(conflict.current.balance?.balance);
    document.getElementById("investment-month-sheet-flow").textContent =
      `${money(flowTotal(conflict.current))} net contribution`;
    document.getElementById("investment-month-draft-balance").textContent =
      money(conflict.draft.balance?.balance);
    document.getElementById("investment-month-draft-flow").textContent =
      `${money(flowTotal(conflict.draft))} net contribution`;
  }

  function populateTarget(accountId, month, conflict = null) {
    const checked = batchInput.checked;
    const value =
      conflict?.draft || window.InvestmentAPI.monthData(accountId, month);
    target = { accountId, month };
    reviewId = conflict?.id || "";
    accountSelect.value = accountId;
    monthPicker.value = month;
    clearValues();

    if (!accountId) {
      mode = "create";
      batchToggle.hidden = false;
      batchInput.checked = checked;
      header.title = "Add monthly balance";
      submit.textContent = "Add balance";
      setEntryDisabled(true);
      initialDraftState = draftState();
      return;
    }

    const existing = Boolean(value.balance);
    mode = existing ? "edit" : "create";
    balanceInput.value = value.balance?.balance ?? "";
    contributionList.innerHTML = value.contributions
      .filter((item) => item.amount > 0)
      .map((item) => flowRow(item, "Contribution"))
      .join("");
    withdrawalList.innerHTML = value.contributions
      .filter((item) => item.amount < 0)
      .map((item) => flowRow(item, "Withdrawal"))
      .join("");
    populateConflict(conflict);
    existingNotice.hidden = !existing;
    batchToggle.hidden = existing;
    if (existing) batchInput.checked = false;
    else batchInput.checked = checked;
    metadata.hidden = !existing;
    if (existing) {
      const createdAt = new Date(value.balance.createdAt);
      const createdWhen = Number.isNaN(createdAt.getTime())
        ? "unknown date"
        : createdDateTimeFormatter.format(createdAt);
      createdLabel.textContent = `Created by ${value.balance.createdByName || "Unknown"} on ${createdWhen}`;
    }
    const account = window.InvestmentAPI.accounts().find(
      (item) => item.id === accountId,
    );
    header.title = existing
      ? `Edit ${account?.name || "investment"} balance`
      : "Add monthly balance";
    submit.textContent = existing ? "Save changes" : "Add balance";
    setEntryDisabled(false);
    updateTotals();
    initialDraftState = draftState();
  }

  function finishClose() {
    if (!closing) return;
    closing = false;
    window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.hidden = true;
    backdrop.classList.remove("is-open", "is-closing");
    document.body.classList.remove("drawer-open");
    appShell.inert = false;
    target = { accountId: "", month: "" };
    reviewId = "";
    initialDraftState = "";
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.querySelector("[data-balance]")
    )?.focus();
  }

  function close(force = false, { updateRoute = true } = {}) {
    if (closing || backdrop.hidden) return true;
    if (
      !force &&
      isDirty() &&
      !window.confirm("Discard your unsaved investment changes?")
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
    if (
      updateRoute &&
      window.AppRouter.currentParams().drawer === "investment-month"
    ) {
      window.AppRouter.updateParams({
        drawer: null,
        investmentAccountId: null,
        investmentMonth: null,
        investmentReviewId: null,
      });
    }
    return true;
  }

  function focusFirstField() {
    (accountSelect.value ? balanceInput : accountSelect).focus({
      preventScroll: true,
    });
  }

  function handleOpened(event) {
    if (event.target !== drawer || event.propertyName !== "transform") return;
    drawer.removeEventListener("transitionend", handleOpened);
    focusFirstField();
  }

  function showDrawer() {
    if (!backdrop.hidden) return;
    returnFocus = document.activeElement;
    window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    closing = false;
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.classList.remove("is-open", "is-closing");
    backdrop.hidden = false;
    void drawer.offsetWidth;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      focusFirstField();
    } else {
      drawer.addEventListener("transitionend", handleOpened);
    }
    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
  }

  function clearRoute() {
    window.AppRouter.updateParams({
      drawer: null,
      investmentAccountId: null,
      investmentMonth: null,
      investmentReviewId: null,
    });
  }

  function openFromRoute() {
    const params = window.AppRouter.currentParams();
    if (params.drawer !== "investment-month") {
      openedRouteKey = "";
      if (!backdrop.hidden) close(true, { updateRoute: false });
      return;
    }
    if (!window.InvestmentAPI.isLoaded()) {
      window.InvestmentAPI.load().catch(() => {});
      return;
    }
    const accounts = populateAccounts();
    let accountId = params.investmentAccountId || "";
    let month = params.investmentMonth || window.InvestmentView.currentMonth();
    let conflict = null;
    if (params.investmentReviewId) {
      conflict = window.InvestmentAPI.getConflict(params.investmentReviewId);
      if (!conflict?.current) {
        window.ToastUI?.show("That conflict is no longer available.", {
          type: "error",
          sticky: true,
        });
        clearRoute();
        return;
      }
      conflict.id = params.investmentReviewId;
      accountId = conflict.draft.accountId;
      month = conflict.draft.month;
    } else if (!accountId && accounts.length === 1 && !suppressSingleDefault) {
      accountId = accounts[0].id;
    }
    suppressSingleDefault = false;
    const routeKey = `${params.drawer}:${accountId}:${month}:${params.investmentReviewId || ""}`;
    if (routeKey === openedRouteKey && !backdrop.hidden) return;
    if (accountId && !accounts.some((item) => item.id === accountId)) {
      clearRoute();
      return;
    }
    populateTarget(accountId, month, conflict);
    showDrawer();
    openedRouteKey = routeKey;
  }

  function changeTarget() {
    const next = { accountId: accountSelect.value, month: monthPicker.value };
    if (
      isDirty() &&
      !window.confirm("Discard this draft and load another account or month?")
    ) {
      accountSelect.value = target.accountId;
      monthPicker.value = target.month;
      return;
    }
    reviewId = "";
    window.AppRouter.updateParams({
      investmentAccountId: next.accountId || null,
      investmentMonth: next.month,
      investmentReviewId: null,
    });
  }

  function addFlow(type) {
    const list = type === "Contribution" ? contributionList : withdrawalList;
    list.insertAdjacentHTML("beforeend", flowRow(null, type));
    list.querySelector(".investment-flow-row:last-child input")?.focus();
    updateTotals();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-balance]");
    if (!button) return;
    event.preventDefault();
    const accounts = window.InvestmentAPI.accounts().filter(
      (item) => item.active !== false,
    );
    window.AppRouter.updateParams({
      drawer: "investment-month",
      investmentAccountId: accounts.length === 1 ? accounts[0].id : null,
      investmentMonth: window.InvestmentView.currentMonth(),
      investmentReviewId: null,
    });
  });
  accountSelect.addEventListener("change", changeTarget);
  monthPicker.addEventListener("change", changeTarget);
  document
    .getElementById("add-investment-contribution")
    .addEventListener("click", () => addFlow("Contribution"));
  document
    .getElementById("add-investment-withdrawal")
    .addEventListener("click", () => addFlow("Withdrawal"));
  form.addEventListener("input", updateTotals);
  form.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-flow]");
    if (!remove) return;
    remove.closest(".investment-flow-row").remove();
    updateTotals();
  });
  drawer.addEventListener("click", (event) => {
    if (monthPicker.contains(event.target)) return;
    const trigger = monthPicker.querySelector(".month-picker-trigger");
    if (trigger?.getAttribute("aria-expanded") === "true") trigger.click();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "";
    if (!accountSelect.value) {
      accountSelect.focus();
      return;
    }
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    try {
      const input = {
        accountId: accountSelect.value,
        month: monthPicker.value,
        balance: balanceInput.value,
        contributions: collectFlows(),
      };
      if (reviewId) window.InvestmentAPI.resolveConflict(reviewId, input);
      else window.InvestmentAPI.queueMonth(input);
      initialDraftState = draftState();
      window.ToastUI?.show(
        "Monthly investment update saved locally and syncing.",
      );
      if (mode === "create" && batchInput.checked) {
        const preservedMonth = monthPicker.value;
        suppressSingleDefault = true;
        populateAccounts();
        populateTarget("", preservedMonth);
        batchInput.checked = true;
        message.className = "form-message success";
        message.textContent = "Balance added. Choose the next account.";
        initialDraftState = draftState();
        accountSelect.focus({ preventScroll: true });
        window.AppRouter.updateParams({
          investmentAccountId: null,
          investmentMonth: preservedMonth,
          investmentReviewId: null,
        });
      } else {
        close(true);
      }
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    }
  });
  document
    .getElementById("investment-month-use-sheet")
    .addEventListener("click", () => {
      if (!reviewId) return;
      window.InvestmentAPI.discard("investmentMonth", reviewId);
      initialDraftState = draftState();
      close(true);
      window.ToastUI?.show("Google Sheet values restored.");
    });
  document
    .getElementById("cancel-investment-month")
    .addEventListener("click", () => close());
  // document
  //   .getElementById("close-investment-month-drawer")
  //   .addEventListener("click", () => close());
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", (event) => {
    if (backdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...drawer.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("app:route-changed", openFromRoute);
  window.addEventListener("budget:investments-loaded", openFromRoute);
  window.addEventListener("drawer:close-requested", close);
});
