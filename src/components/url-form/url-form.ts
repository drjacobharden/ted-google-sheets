// @ts-nocheck
import { APIs } from "../../api/api";
import { appController } from "../../state/app-controller";

const urlFormTemplate = () => `
  <form class="settings-form connection-form">
    <div class="settings-form__fields settings-form__fields--single">
      <label class="form-field">
        <span>Apps Script web app URL</span>
        <input
          name="endpoint"
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder="https://script.google.com/macros/s/…/exec"
        />
        <small>
          Use the production web app URL from your Apps Script deployment.
          Leave it blank to store data in this browser.
        </small>
      </label>
    </div>

    <footer class="settings-form__footer">
      <p
        class="settings-form__message settings-message"
        role="status"
        aria-live="polite"
      ></p>
      <button class="settings-form__submit save-connection" type="submit">
        Save sheet link
      </button>
    </footer>
  </form>
`;

(function () {
  class URLForm extends HTMLElement {
    #form = null;
    #message = null;
    #saveButton = null;

    connectedCallback() {
      this.innerHTML = urlFormTemplate();

      this.#form = this.querySelector(".connection-form");
      this.#message = this.querySelector(".settings-message");
      this.#saveButton = this.querySelector(".save-connection");

      this.#form.addEventListener("submit", this);
      window.addEventListener("budget:connection-changed", this);

      this.#loadSettings();
    }

    handleEvent(event) {
      switch (event.type) {
        case "submit":
          this.#handleSubmit(event);
          break;

        case "budget:connection-changed":
          if (event.detail?.endpoint !== undefined) {
            this.#form.elements.endpoint.value = event.detail.endpoint;
          }
          break;

        default:
          break;
      }
    }

    async #handleSubmit(event) {
      event.preventDefault();
      const endpoint = this.#form.elements.endpoint.value.trim();

      this.#message.className = "settings-form__message settings-message";
      this.#message.textContent = "";

      if (endpoint && !endpoint.startsWith("https://script.google.com/")) {
        this.#message.className =
          "settings-form__message settings-message error";
        this.#message.textContent =
          "Use the HTTPS web app URL provided by Google Apps Script.";
        return;
      }

      this.#saveButton.disabled = true;
      this.#saveButton.textContent = "Saving…";
      let settingsSaved = false;

      try {
        APIs.budget.saveConfig({ endpoint });
        settingsSaved = true;
        await appController.initializeData({ refresh: true });
        window.dispatchEvent(
          new CustomEvent("budget:connection-changed", {
            detail: { endpoint },
          }),
        );
        this.#message.className =
          "settings-form__message settings-message success";
        this.#message.textContent = endpoint
          ? "Sheet link saved."
          : "Local browser storage enabled.";
      } catch (error) {
        this.#message.className =
          "settings-form__message settings-message error";
        this.#message.textContent = settingsSaved
          ? `Sheet link saved, but the data refresh failed: ${error.message}`
          : error.message;
      } finally {
        this.#saveButton.disabled = false;
        this.#saveButton.textContent = "Save sheet link";
      }
    }

    disconnectedCallback() {
      this.#form.removeEventListener("submit", this);
      window.removeEventListener("budget:connection-changed", this);
    }

    #loadSettings() {
      this.#form.elements.endpoint.value = APIs.budget.getConfig().endpoint;
      this.#message.textContent = "";
    }
  }

  customElements.define("url-form", URLForm);
})();
