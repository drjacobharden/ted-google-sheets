const urlFormTemplate = () =>
  `
  <form class="settings-card connection-form">
    <table-title
      title="Google Apps Script"
      subtitle="Copy the production Web app URL from your Apps Script deployment, then paste it here."
    >
      <span class="mode-badge" data-connection-label>
        Local mode
      </span>
    </table-title>

    <label class="form-field">
      <span>Web app URL</span>
      <input
        name="endpoint"
        type="url"
        placeholder="https://script.google.com/macros/s/…/exec"
      />
      <small>
        Keep this URL private. Leave it blank to use browser storage while
        developing.
      </small>
    </label>

    <p class="settings-message" aria-live="polite"></p>

    <div class="form-actions left-aligned">
      <button class="secondary-button copy-connection" type="button" disabled>
        Copy connection URL
      </button>
      <button class="secondary-button test-connection" type="button">
        Test connection
      </button>
      <button class="primary-button" type="submit">
        Save settings
      </button>
    </div>
  </form>
`;

(function () {
  class URLForm extends HTMLElement {
    #form = null;
    #message = null;
    #modeBadge = null;
    #copyButton = null;
    #testButton = null;
    #saveButton = null;

    connectedCallback() {
      this.innerHTML = urlFormTemplate();

      this.#form = this.querySelector(".connection-form");
      this.#modeBadge = this.querySelector(".mode-badge");
      this.#message = this.querySelector(".settings-message");
      this.#copyButton = this.querySelector(".copy-connection");
      this.#testButton = this.querySelector(".test-connection");
      this.#saveButton = this.querySelector(".primary-button");

      this.#form.addEventListener("submit", this);
      this.#testButton.addEventListener("click", this);
      this.#copyButton.addEventListener("click", this);
      window.addEventListener("budget:connection-changed", this);

      this.#loadSettings();
      this.#updateConnectionUI();
    }

    handleEvent(event) {
      switch (event.type) {
        case "submit":
          this.#handleSubmit(event);
          break;

        case "click":
          if (event.currentTarget === this.#testButton) {
            this.#handleTestConnection(event);
          } else if (event.currentTarget === this.#copyButton) {
            this.#handleCopyUrl(event);
          }
          break;

        case "budget:connection-changed":
          this.#updateConnectionUI();
          break;

        default:
          break;
      }
    }

    async #handleSubmit(event) {
      event.preventDefault();
      const endpoint = this.#form.elements.endpoint.value.trim();

      if (endpoint && !endpoint.startsWith("https://script.google.com/")) {
        this.#message.className = "settings-message error";
        this.#message.textContent =
          "Use the HTTPS web app URL provided by Google Apps Script.";
        return;
      }

      this.#saveButton.disabled = true;
      this.#saveButton.textContent = "Getting connection...";
      let settingsSaved = false;

      try {
        window.BudgetAPI.saveConfig({ endpoint });
        settingsSaved = true;
        this.#updateConnectionUI();
        await window.BudgetUI.initializeData({ refresh: true });
        window.dispatchEvent(
          new CustomEvent("budget:connection-changed", {
            detail: { endpoint },
          }),
        );
        this.#message.className = "settings-message success";
        this.#message.textContent = endpoint
          ? "Settings saved. New requests will use your sheet."
          : "Settings saved. Using local mode.";
      } catch (error) {
        this.#message.className = "settings-message error";
        this.#message.textContent = settingsSaved
          ? `Settings saved, but data refresh failed: ${error.message}`
          : error.message;
      } finally {
        this.#saveButton.disabled = false;
        this.#saveButton.textContent = "Save settings";
      }
    }

    async #handleTestConnection(event) {
      const endpoint = this.#form.elements.endpoint.value.trim();
      if (!endpoint) {
        this.#message.className = "settings-message error";
        this.#message.textContent = "Paste a web app URL before testing.";
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Testing…";
      this.#message.textContent = "";
      try {
        await window.BudgetAPI.testConnection(endpoint);
        this.#message.className = "settings-message success";
        this.#message.textContent = "Connection successful.";
      } catch (error) {
        this.#message.className = "settings-message error";
        this.#message.textContent = `Connection failed: ${error.message}`;
      } finally {
        button.disabled = false;
        button.textContent = "Test connection";
      }
    }

    async #handleCopyUrl() {
      const endpoint = window.BudgetAPI.getConfig().endpoint;

      if (!endpoint) {
        this.#message.className = "settings-message error";
        this.#message.textContent = "Save a connection URL before copying it.";
        return;
      }

      try {
        await navigator.clipboard.writeText(endpoint);
        this.#message.className = "settings-message success";
        this.#message.textContent =
          "Connection URL copied. Share it only with trusted household members.";
      } catch (error) {
        this.#form.elements.endpoint.value = endpoint;
        this.#form.elements.endpoint.focus();
        this.#form.elements.endpoint.select();
        try {
          if (document.execCommand("copy")) {
            this.#message.className = "settings-message success";
            this.#message.textContent =
              "Connection URL copied. Share it only with trusted household members.";
          } else {
            this.#message.textContent =
              "The URL is selected. Press Ctrl+C or Command+C to copy it.";
          }
        } catch (fallbackError) {
          this.#message.textContent =
            "The URL is selected. Press Ctrl+C or Command+C to copy it.";
        }
      }
    }

    #updateConnectionUI() {
      const connected = Boolean(window.BudgetAPI.getConfig().endpoint);
      this.#copyButton.disabled = !connected;
      this.#modeBadge.textContent = connected
        ? "Sheet connected"
        : "Local mode";
    }

    disconnectedCallback() {
      this.#form.removeEventListener("submit", this);
      this.#testButton.removeEventListener("click", this);
      this.#copyButton.removeEventListener("click", this);
      window.removeEventListener("budget:connection-changed", this);
    }

    #loadSettings() {
      this.#form.elements.endpoint.value =
        window.BudgetAPI.getConfig().endpoint;
      this.#message.textContent = "";
    }
  }

  customElements.define("url-form", URLForm);
})();
