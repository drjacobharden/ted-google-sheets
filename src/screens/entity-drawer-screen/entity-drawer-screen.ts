// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { InvestmentView } from "../../utilities/investment-view";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };
export class EntityDrawerScreen extends HTMLElement { connectedCallback(): void { if (!this.dataset.initialized) { this.dataset.initialized = "true"; this.innerHTML = templateString; } } }
if (!customElements.get("entity-drawer-screen")) customElements.define("entity-drawer-screen", EntityDrawerScreen);
document.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.getElementById("entity-drawer-backdrop");
  const drawer = document.getElementById("entity-drawer");
  const form = document.getElementById("entity-edit-form");
  const header = document.getElementById("entity-drawer-header");
  const message = form.querySelector(".form-message");
  const submit = form.querySelector('[type="submit"]');
  const archiveButton = document.getElementById("archive-entity");
  const appShell = document.querySelector(".app-shell");

  const config = {
    category: {
      label: "category",
      record: (id) => APIs.budget.getEntity("category", id),
      update: (input) => APIs.budget.updateCategory(input),
      reactivate: (input) => APIs.budget.reactivateCategory(input),
      archive: (id) => APIs.budget.archiveCategory(id),
    },
    vendor: {
      label: "vendor",
      record: (id) => APIs.budget.getEntity("vendor", id),
      update: (input) => APIs.budget.updateVendor(input),
      reactivate: (input) => APIs.budget.reactivateVendor(input),
      archive: (id) => APIs.budget.archiveVendor(id),
    },
    assignment: {
      label: "person",
      record: (id) => APIs.budget.getEntity("assignment", id),
      update: (input) => APIs.budget.updatePerson(input),
      reactivate: (input) => APIs.budget.reactivatePerson(input),
      archive: (id) => APIs.budget.archivePerson(id),
    },
  };

  let opened = null;
  let openedName = "";
  let openedRouteKey = "";
  let returnFocus = null;
  let closing = false;
  let closeTimer = 0;
  let closeAnimationHandler = null;

  function dirty() {
    return opened && form.elements.name.value.trim() !== openedName;
  }

  function finishClose() {
    if (!closing) return;
    closing = false;
    if (closeTimer) window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.hidden = true;
    backdrop.classList.remove("is-closing", "is-open");
    document.body.classList.remove("drawer-open");
    appShell.inert = false;
    opened = null;
    openedName = "";
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.getElementById("edit-entity")
    )?.focus();
  }

  function close(force = false, { updateRoute = true } = {}) {
    if (closing || backdrop.hidden) return true;
    if (!force && dirty() && !window.confirm("Discard your unsaved changes?")) {
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
      router.currentParams().drawer === "entity-edit"
    ) {
      router.updateParams({
        drawer: null,
        entityKind: null,
        entityId: null,
      });
    }

    return true;
  }

  function handleDrawerOpened(event) {
    if (event.target !== drawer || event.propertyName !== "transform") return;
    drawer.removeEventListener("transitionend", handleDrawerOpened);
    form.elements.name.select();
  }

  function open(kind, id) {
    const settings = config[kind];
    const entity = settings?.record(id);
    if (!entity) throw new Error("That item could not be found.");
    if (APIs.budget.getEntitySyncStatus(kind, id)) {
      showToast(
        "This item can be edited after it finishes syncing.",
        { type: "error", sticky: true },
      );
      return false;
    }

    opened = {
      kind,
      id,
      archived: entity.active === false,
      isDefault: entity.isDefault === true,
    };
    openedName = entity.name;
    returnFocus = document.activeElement;
    header.title = entity.active === false
      ? `Reactivate ${settings.label}`
      : `Edit ${settings.label}`;
    form.elements.name.maxLength = kind === "category" ? 50 : 80;
    form.elements.name.value = entity.name;
    message.textContent = "";
    message.className = "form-message";
    submit.disabled = false;
    submit.textContent = entity.active === false ? "Reactivate" : "Save changes";
    archiveButton.hidden = entity.active === false || entity.isDefault === true;

    if (closeTimer) window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    closing = false;
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.classList.remove("is-closing", "is-open");
    backdrop.hidden = false;

    // Focus while the panel is moving can interrupt its transform. Commit the
    // off-screen state first, then select the input after the transition ends.
    void drawer.offsetWidth;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      form.elements.name.select();
    } else {
      drawer.addEventListener("transitionend", handleDrawerOpened);
    }

    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
    return true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!opened || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const name = form.elements.name.value.trim();
    if (!name) return;
    submit.disabled = true;
    submit.textContent = "Saving…";
    message.textContent = "";

    try {
      const wasArchived = opened.archived;
      const action = wasArchived
        ? config[opened.kind].reactivate
        : config[opened.kind].update;
      const saved = await action({
        id: opened.id,
        name,
      });
      appController.renameEntityTransactions(
        opened.kind,
        opened.id,
        saved.name,
      );
      const label = config[opened.kind].label;
      close(true);
      showToast(
        wasArchived
          ? `${label.charAt(0).toUpperCase() + label.slice(1)} reactivated.`
          : `${label.charAt(0).toUpperCase() + label.slice(1)} updated.`,
      );
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
      submit.disabled = false;
      submit.textContent = opened?.archived ? "Reactivate" : "Save changes";
    }
  });

  archiveButton.addEventListener("click", async () => {
    if (
      !opened ||
      opened.archived ||
      opened.isDefault ||
      !window.confirm(`Archive this ${config[opened.kind].label}?`)
    ) {
      return;
    }
    const current = { ...opened };
    archiveButton.disabled = true;
    message.textContent = "";
    try {
      await config[current.kind].archive(current.id);
      const label = config[current.kind].label;
      close(true);
      showToast(
        `${label.charAt(0).toUpperCase() + label.slice(1)} archived.`,
      );
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    } finally {
      archiveButton.disabled = false;
    }
  });

  document
    .getElementById("cancel-entity-edit")
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
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function clearRouteParams() {
    router.updateParams({
      drawer: null,
      entityKind: null,
      entityId: null,
    });
  }

  function openDrawerFromCurrentRoute() {
    const params = router.currentParams();
    const action = params.drawer;
    const kind = params.entityKind;
    const id = params.entityId;
    const routeKey = `${action || ""}:${kind || ""}:${id || ""}`;

    if (action !== "entity-edit") {
      openedRouteKey = "";
      if (!backdrop.hidden) close(true, { updateRoute: false });
      return;
    }

    if (routeKey === openedRouteKey && !backdrop.hidden) return;
    if (!config[kind] || !id) {
      clearRouteParams();
      return;
    }

    const entityIsAvailable = Boolean(config[kind].record(id));
    if (!entityIsAvailable && !appController.isReferenceDataLoaded()) return;

    try {
      if (open(kind, id)) {
        openedRouteKey = routeKey;
      } else {
        clearRouteParams();
      }
    } catch (error) {
      showToast(error.message, { type: "error" });
      clearRouteParams();
    }
  }

  window.addEventListener("app:route-changed", openDrawerFromCurrentRoute);
  window.addEventListener(
    "budget:reference-data-changed",
    openDrawerFromCurrentRoute,
  );
  window.addEventListener("drawer:close-requested", close);
});
