(function () {
  const { escapeHTML, money } = window.AppUtils;
  const { latestByAccount, sourceLabel } = window.InvestmentView;
  let cleanup = null;

  function mount(root) {
    const form = root.querySelector("#investment-account-form");
    const message = form.querySelector(".settings-message");
    const list = root.querySelector("#investment-account-list");
    const count = root.querySelector("#investment-account-count");

    function render() {
      const accounts = window.InvestmentAPI.accounts().filter(
        (item) => item.active !== false,
      );
      const latest = latestByAccount();
      count.textContent = `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`;
      list.innerHTML = accounts.length
        ? accounts
            .map(
              (account) =>
                `<article class="category-item investment-account-row" role="button" tabindex="0" data-investment-account="${account.id}" aria-label="View ${escapeHTML(account.name)} balance history"><span class="category-icon">${escapeHTML(account.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(account.name)}</strong><p>${sourceLabel(account.source)}</p></div><strong class="account-balance">${money(latest.get(account.id)?.balance || 0)}</strong></article>`,
            )
            .join("")
        : '<div class="investment-empty">Add your first investment account.</div>';
    }

    function openAccount(row) {
      if (!row) return;
      window.AppRouter.navigate("investment-account-detail", {
        accountId: row.dataset.investmentAccount,
      });
    }

    function handleListClick(event) {
      openAccount(event.target.closest("[data-investment-account]"));
    }

    function handleListKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-investment-account]");
      if (!row) return;
      event.preventDefault();
      openAccount(row);
    }

    function handleSubmit(event) {
      event.preventDefault();
      message.textContent = "";
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      try {
        const record = window.InvestmentAPI.addAccount(
          Object.fromEntries(new FormData(form)),
        );
        form.reset();
        form.elements.name.focus();
        message.className = "settings-message success";
        message.textContent = `${record.name} added. Syncing…`;
        render();
      } catch (error) {
        message.className = "settings-message error";
        message.textContent = error.message;
      }
    }

    form.addEventListener("submit", handleSubmit);
    list.addEventListener("click", handleListClick);
    list.addEventListener("keydown", handleListKeydown);
    window.addEventListener("budget:investments-changed", render);
    window.addEventListener("budget:investments-loaded", render);
    render();

    cleanup = () => {
      form.removeEventListener("submit", handleSubmit);
      list.removeEventListener("click", handleListClick);
      list.removeEventListener("keydown", handleListKeydown);
      window.removeEventListener("budget:investments-changed", render);
      window.removeEventListener("budget:investments-loaded", render);
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.InvestmentAccountsRoute = { mount, unmount };
})();
