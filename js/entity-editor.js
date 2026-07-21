document.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.getElementById("entity-drawer-backdrop");
  const drawer = document.getElementById("entity-drawer");
  const form = document.getElementById("entity-edit-form");
  const message = form.querySelector(".form-message");
  const submit = form.querySelector('[type="submit"]');
  let opened = null;
  let openedName = "";
  let returnFocus = null;
  const config = {
    category: { label: "category", records: () => window.BudgetAPI.listCategories({ type: "expense" }), update: (input) => window.BudgetAPI.updateCategory(input) },
    vendor: { label: "vendor", records: () => window.BudgetAPI.listVendors(), update: (input) => window.BudgetAPI.updateVendor(input) },
    assignment: { label: "person", records: () => window.BudgetAPI.listPeople(), update: (input) => window.BudgetAPI.updatePerson(input) },
  };
  function dirty() { return opened && form.elements.name.value.trim() !== openedName; }
  function close(force = false) {
    if (!force && dirty() && !window.confirm("Discard your unsaved changes?")) return false;
    backdrop.hidden = true; document.body.classList.remove("drawer-open"); opened = null;
    returnFocus?.focus(); return true;
  }
  function open(kind, id) {
    const settings = config[kind];
    const entity = settings?.records().find((item) => item.id === id);
    if (!entity) throw new Error("That item could not be found.");
    if (window.BudgetAPI.getEntitySyncStatus(kind, id)) {
      window.ToastUI?.show("This item can be edited after it finishes syncing.", { type: "error", sticky: true });
      return;
    }
    opened = { kind, id }; openedName = entity.name; returnFocus = document.activeElement;
    document.getElementById("entity-drawer-title").textContent = `Edit ${settings.label}`;
    form.elements.name.maxLength = kind === "category" ? 50 : 80;
    form.elements.name.value = entity.name; message.textContent = ""; submit.disabled = false; submit.textContent = "Save changes";
    backdrop.hidden = false; document.body.classList.add("drawer-open"); drawer.focus();
    requestAnimationFrame(() => form.elements.name.select());
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!opened || !form.checkValidity()) { form.reportValidity(); return; }
    const name = form.elements.name.value.trim();
    if (!name) return;
    submit.disabled = true; submit.textContent = "Saving…"; message.textContent = "";
    try {
      const saved = await config[opened.kind].update({ id: opened.id, name });
      window.BudgetUI.renameEntityTransactions(opened.kind, opened.id, saved.name);
      const label = config[opened.kind].label;
      close(true);
      window.ToastUI?.show(`${label.charAt(0).toUpperCase() + label.slice(1)} updated.`);
    } catch (error) {
      message.className = "form-message error"; message.textContent = error.message;
      submit.disabled = false; submit.textContent = "Save changes";
    }
  });
  document.getElementById("close-entity-drawer").addEventListener("click", () => close());
  document.getElementById("cancel-entity-edit").addEventListener("click", () => close());
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", (event) => {
    if (backdrop.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.EntityEditor = { open, close };
});
