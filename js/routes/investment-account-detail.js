(function () {
  const { escapeHTML, money, netFlows } = window.AppUtils;
  let cleanup = null;

  function mount(root, { params = {} } = {}) {
    const accountId = String(params.accountId || "");
    const title = root.querySelector("page-title h1");
    const subtitle = root.querySelector("page-title .heading-copy");
    const editButton = root.querySelector("#edit-investment-account");
    const count = root.querySelector("#investment-account-history-count");
    const body = root.querySelector("#investment-account-history-body");
    const wrap = root.querySelector("#investment-account-history-wrap");
    const empty = root.querySelector("#investment-account-history-empty");

    function account() {
      return window.InvestmentAPI.accounts().find(
        (item) => item.id === accountId && item.active !== false,
      );
    }

    function render() {
      const selected = account();
      if (!selected) {
        if (!window.InvestmentUI.isLoaded()) {
          title.textContent = "Loading account…";
          editButton.disabled = true;
          return;
        }
        window.AppRouter.navigate("investment-accounts");
        return;
      }

      title.textContent = selected.name;
      subtitle.textContent = `${window.InvestmentView.sourceLabel(selected.source)} · Monthly balance history`;
      editButton.disabled = false;
      const rows = window.InvestmentAPI.balances()
        .filter((item) => item.accountId === accountId)
        .sort((a, b) => b.month.localeCompare(a.month));
      count.textContent = `${rows.length} ${rows.length === 1 ? "balance" : "balances"}`;
      body.innerHTML = rows
        .map((balance) => {
          const flows = window.InvestmentAPI.contributions().filter(
            (item) =>
              item.accountId === accountId && item.month === balance.month,
          );
          const contributions = flows.filter((item) => item.amount > 0).length;
          const withdrawals = flows.filter((item) => item.amount < 0).length;
          return `<tr data-investment-balance-month="${balance.month}" role="button" tabindex="0" aria-label="Edit ${escapeHTML(selected.name)} balance for ${balance.month}"><td><strong>${balance.month}</strong></td><td>${money(netFlows(flows))}<small>${contributions} ${contributions === 1 ? "contribution" : "contributions"} · ${withdrawals} ${withdrawals === 1 ? "withdrawal" : "withdrawals"}</small></td><td class="amount-cell">${money(balance.balance)}</td></tr>`;
        })
        .join("");
      empty.hidden = rows.length > 0;
      wrap.hidden = rows.length === 0;
    }

    function openMonth(row) {
      if (!row) return;
      window.AppRouter.updateParams({
        drawer: "investment-month",
        investmentAccountId: accountId,
        investmentMonth: row.dataset.investmentBalanceMonth,
      });
    }

    function handleClick(event) {
      openMonth(event.target.closest("[data-investment-balance-month]"));
    }

    function handleKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-investment-balance-month]");
      if (!row) return;
      event.preventDefault();
      openMonth(row);
    }

    function handleEdit() {
      window.AppRouter.updateParams({
        drawer: "investment-account",
        investmentAccountId: accountId,
      });
    }

    editButton.addEventListener("click", handleEdit);
    body.addEventListener("click", handleClick);
    body.addEventListener("keydown", handleKeydown);
    window.addEventListener("budget:investments-changed", render);
    window.addEventListener("budget:investments-loaded", render);
    render();

    cleanup = () => {
      editButton.removeEventListener("click", handleEdit);
      body.removeEventListener("click", handleClick);
      body.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("budget:investments-changed", render);
      window.removeEventListener("budget:investments-loaded", render);
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.InvestmentAccountDetailRoute = { mount, unmount };
})();
