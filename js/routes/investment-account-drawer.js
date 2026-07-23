document.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.getElementById(
    "investment-account-drawer-backdrop",
  );
  const drawer = document.getElementById("investment-account-drawer");
  const form = document.getElementById("investment-account-edit-form");
  const message = form.querySelector(".form-message");
  const submit = form.querySelector('[type="submit"]');
  const appShell = document.querySelector(".app-shell");
  let accountId = "";
  let initialState = "";
  let openedRouteKey = "";
  let returnFocus = null;
  let closing = false;
  let closeTimer = 0;
  let closeAnimationHandler = null;

  function formState() {
    return JSON.stringify({
      name: form.elements.name.value.trim(),
      source: form.elements.source.value,
    });
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
    accountId = "";
    initialState = "";
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.getElementById("edit-investment-account")
    )?.focus();
  }

  function close(force = false, { updateRoute = true } = {}) {
    if (closing || backdrop.hidden) return true;
    if (
      !force &&
      formState() !== initialState &&
      !window.confirm("Discard your unsaved account changes?")
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
      window.AppRouter.currentParams().drawer === "investment-account"
    ) {
      window.AppRouter.updateParams({
        drawer: null,
        investmentAccountId: null,
      });
    }
    return true;
  }

  function handleOpened(event) {
    if (event.target !== drawer || event.propertyName !== "transform") return;
    drawer.removeEventListener("transitionend", handleOpened);
    form.elements.name.select();
  }

  function open(id) {
    const account = window.InvestmentAPI.accounts().find(
      (item) => item.id === id && item.active !== false,
    );
    if (!account) return false;
    accountId = id;
    returnFocus = document.activeElement;
    form.elements.name.value = account.name;
    form.elements.source.value = account.source;
    message.textContent = "";
    message.className = "form-message";
    submit.disabled = false;
    initialState = formState();

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
      form.elements.name.select();
    } else {
      drawer.addEventListener("transitionend", handleOpened);
    }
    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
    return true;
  }

  function clearRoute() {
    window.AppRouter.updateParams({
      drawer: null,
      investmentAccountId: null,
    });
  }

  function openFromRoute() {
    const params = window.AppRouter.currentParams();
    const routeKey = `${params.drawer || ""}:${params.investmentAccountId || ""}`;
    if (params.drawer !== "investment-account") {
      openedRouteKey = "";
      if (!backdrop.hidden) close(true, { updateRoute: false });
      return;
    }
    if (routeKey === openedRouteKey && !backdrop.hidden) return;
    if (!params.investmentAccountId) {
      clearRoute();
      return;
    }
    const exists = window.InvestmentAPI.accounts().some(
      (item) => item.id === params.investmentAccountId,
    );
    if (!exists && !window.InvestmentAPI.isLoaded()) return;
    if (open(params.investmentAccountId)) openedRouteKey = routeKey;
    else clearRoute();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submit.disabled = true;
    message.textContent = "";
    try {
      await window.InvestmentAPI.updateAccount({
        id: accountId,
        name: form.elements.name.value,
        source: form.elements.source.value,
      });
      initialState = formState();
      close(true);
      window.ToastUI?.show("Investment account updated.");
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  form
    .querySelector("[data-account-archive]")
    .addEventListener("click", async () => {
      if (
        !window.confirm(
          "Archive this investment account? Its history will remain available.",
        )
      ) {
        return;
      }
      try {
        await window.InvestmentAPI.archiveAccount(accountId);
        close(true, { updateRoute: false });
        window.AppRouter.navigate("investment-accounts");
        window.ToastUI?.show("Investment account archived.");
      } catch (error) {
        message.className = "form-message error";
        message.textContent = error.message;
      }
    });

  form
    .querySelector("[data-account-cancel]")
    .addEventListener("click", () => close());

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
