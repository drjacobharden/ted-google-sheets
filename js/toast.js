const toastActionTemplate = ({ action, escapeHTML }) => {
  if (action) {
    return `
        <button type="button" data-toast-action>
            ${escapeHTML(action)}
        </button>
    `;
  }

  return "";
};

const toastTemplate = ({ text, options, escapeHTML }) => `
    <p>${escapeHTML(text)}</p>
    <div class="toast-actions">
        ${toastActionTemplate({ action: options.action, escapeHTML })}
        <button
          type="button"
          data-toast-dismiss
          aria-label="Dismiss notification"
        >
          ×
        </button>
    </div>
`;

(function () {
  const { escapeHTML } = window.AppUtils;
  const toastStack = document.getElementById("toast-stack");

  function show(text, options = {}) {
    const toast = document.createElement("div");

    toast.className = `toast${options.type === "error" ? " error" : ""}`;

    toast.innerHTML = toastTemplate({ text, escapeHTML, options });

    toast
      .querySelector("[data-toast-dismiss]")
      .addEventListener("click", () => {
        toast.remove();
      });

    toast
      .querySelector("[data-toast-action]")
      ?.addEventListener("click", () => {
        options.onAction?.();
        toast.remove();
      });

    toastStack.append(toast);

    if (!options.sticky) {
      setTimeout(() => toast.remove(), options.duration || 4500);
    }

    return toast;
  }

  window.ToastUI = {
    show,
  };
})();
