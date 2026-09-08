// @ts-nocheck
import { APIs } from "../../api/api";

const userFormTemplate = () => `
  <form class="settings-form user-form" novalidate>
    <input name="userId" type="hidden" />

    <div class="settings-form__fields">
      <label class="form-field">
        <span>First name</span>
        <input
          name="firstName"
          type="text"
          maxlength="80"
          autocomplete="given-name"
          required
        />
      </label>
      <label class="form-field">
        <span>Last name</span>
        <input
          name="lastName"
          type="text"
          maxlength="80"
          autocomplete="family-name"
          required
        />
      </label>
    </div>

    <footer class="settings-form__footer">
      <p
        class="settings-form__message user-form-message"
        role="status"
        aria-live="polite"
      ></p>
      <custom-button class="primary-button settings-form__submit save-user" type="submit">
        Save name
      </custom-button>
    </footer>
  </form>
`;

(function () {
  class UserForm extends HTMLElement {
    #form = null;
    #message = null;
    #saveButton = null;

    connectedCallback() {
      this.innerHTML = userFormTemplate();

      this.#form = this.querySelector(".user-form");
      this.#message = this.querySelector(".user-form-message");
      this.#saveButton = this.querySelector(".save-user");

      this.#form.addEventListener("submit", this);
      window.addEventListener("budget:active-user-changed", this);
      window.addEventListener("budget:onboarding-complete", this);
      window.addEventListener("budget:connection-changed", this);
      window.addEventListener("budget:reference-data-changed", this);

      this.#renderUser();
    }

    handleEvent(event) {
      switch (event.type) {
        case "submit":
          this.#handleSubmit(event);
          break;

        case "budget:active-user-changed":
          this.#renderUser(event.detail);
          break;

        case "budget:onboarding-complete":
        case "budget:connection-changed":
        case "budget:reference-data-changed":
          this.#renderUser();
          break;

        default:
          break;
      }
    }

    #renderUser(user = APIs.budget.getActiveUser()) {
      this.#form.elements.userId.value = user?.id || "";
      this.#form.elements.firstName.value = user?.firstName || "";
      this.#form.elements.lastName.value = user?.lastName || "";
      this.#message.className = "settings-form__message user-form-message";
      this.#message.textContent = user
        ? ""
        : "Enter your name to create your profile.";
    }

    async #handleSubmit(event) {
      event.preventDefault();
      this.#message.className = "settings-form__message user-form-message";
      this.#message.textContent = "";
      if (!this.#form.checkValidity()) {
        this.#form.reportValidity();
        return;
      }

      const input = {
        id: this.#form.elements.userId.value,
        firstName: this.#form.elements.firstName.value.trim(),
        lastName: this.#form.elements.lastName.value.trim(),
      };

      this.#saveButton.disabled = true;
      this.#saveButton.textContent = input.id ? "Saving…" : "Creating…";

      try {
        const saved = input.id
          ? await APIs.budget.updateUser(input)
          : await APIs.budget.addUser(input);

        if (APIs.budget.getActiveUser()?.id !== saved.id) {
          APIs.budget.setActiveUser(saved.id);
        }
        this.#renderUser(saved);
        this.#message.className =
          "settings-form__message user-form-message success";
        this.#message.textContent = "Name updated.";
      } catch (error) {
        this.#message.className =
          "settings-form__message user-form-message error";
        this.#message.textContent = error.message;
      } finally {
        this.#saveButton.disabled = false;
        this.#saveButton.textContent = "Save name";
      }
    }

    disconnectedCallback() {
      this.#form.removeEventListener("submit", this);
      window.removeEventListener("budget:active-user-changed", this);
      window.removeEventListener("budget:onboarding-complete", this);
      window.removeEventListener("budget:connection-changed", this);
      window.removeEventListener("budget:reference-data-changed", this);
    }
  }

  customElements.define("user-form", UserForm);
})();
