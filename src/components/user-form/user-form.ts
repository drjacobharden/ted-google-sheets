// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";
import { OnboardingUI } from "../onboarding/onboarding";
const userFormTemplate = () => `
  <form class="settings-card user-settings-card user-form" novalidate>
    <table-title
      title="User profile"
      subtitle="Select or create your profile"
    >
      <span
        class="profile-monogram settings-monogram"
        id="settings-monogram"
        aria-hidden="true"
      >
        ?
      </span>
    </table-title>

    <label class="form-field">
      <span>Active user</span>
      <select class="user-switcher" name="activeUser">
        <option value="">Choose a user</option>
      </select>
    </label>

    <input name="userId" type="hidden" />
    <div class="user-name-fields">
      <label class="form-field">
        <span>First name</span>
        <input
          class="settings-form-first-name"
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
          class="settings-form-last-name"
          name="lastName"
          type="text"
          maxlength="80"
          autocomplete="family-name"
          required
        />
      </label>
    </div>

    <p class="user-form-message" aria-live="polite"></p>

    <div class="form-actions left-aligned">
      <button class="secondary-button new-user" type="button">
        Add another user
      </button>
      <button class="primary-button save-user" type="submit">
        Add user
      </button>
    </div>
  </form>
`;

(function () {
  function fullName(user) {
    return user ? `${user.firstName} ${user.lastName}`.trim() : "";
  }

  function monogram(user) {
    if (!user) return "?";
    return (
      `${user.firstName?.charAt(0) || ""}${user.lastName?.charAt(0) || ""}`.toUpperCase() ||
      "?"
    );
  }

  class UserForm extends HTMLElement {
    #form = null;
    #list = null;
    #monogram = null;
    #message = null;
    #addButton = null;
    #saveButton = null;

    connectedCallback() {
      this.innerHTML = userFormTemplate();

      this.#form = this.querySelector(".user-form");
      this.#list = this.querySelector(".user-switcher");
      this.#monogram = this.querySelector(".settings-monogram");
      this.#message = this.querySelector(".user-form-message");
      this.#addButton = this.querySelector(".new-user");
      this.#saveButton = this.querySelector(".save-user");

      this.#list.addEventListener("change", this);
      this.#addButton.addEventListener("click", this);
      this.#form.addEventListener("submit", this);
      window.addEventListener("budget:active-user-changed", this);
      window.addEventListener("budget:onboarding-complete", this);
      window.addEventListener("budget:connection-changed", this);
      window.addEventListener("budget:reference-data-changed", this);

      this.#renderProfile();

      if (!OnboardingUI?.isBlocking()) {
        this.#renderCachedUsers();
      }
    }

    handleEvent(event) {
      switch (event.type) {
        case "change":
          this.#handleSelectUser(event);
          break;

        case "click":
          this.#handleChooseToAddNewUser(event);
          break;

        case "submit":
          this.#handleSubmit(event);
          break;

        case "budget:onboarding-complete":
          this.#renderCachedUsers();
          break;

        case "budget:active-user-changed":
          this.#renderProfile(event.detail);
          break;

        case "budget:connection-changed":
        case "budget:reference-data-changed":
          this.#renderCachedUsers();
          break;

        default:
          break;
      }
    }

    #renderProfile(user = APIs.budget.getActiveUser()) {
      this.#monogram.textContent = monogram(user);
    }

    #populateForm(user) {
      this.#form.elements.userId.value = user?.id || "";
      this.#form.elements.firstName.value = user?.firstName || "";
      this.#form.elements.lastName.value = user?.lastName || "";
      this.#saveButton.textContent = user ? "Save name" : "Add user";
    }

    #renderUsers(users) {
      const active = APIs.budget.getActiveUser();
      this.#list.replaceChildren(
        new Option(users.length ? "Choose a user" : "No users added yet", ""),
        ...users
          .slice()
          .sort((a, b) => fullName(a).localeCompare(fullName(b)))
          .map((user) => new Option(fullName(user), user.id)),
      );
      this.#list.value = active?.id || "";
      this.#populateForm(active);
      this.#renderProfile(active);
    }

    #renderCachedUsers() {
      this.#message.textContent = "";
      const users = APIs.budget.listUsers();
      if (!APIs.budget.getActiveUser() && users.length === 1) {
        APIs.budget.setActiveUser(users[0].id);
      }
      this.#renderUsers(users);
    }

    #handleSelectUser() {
      this.#message.textContent = "";
      if (!this.#list.value) {
        localStorage.removeItem("myFinance.activeUser.v1");
        this.#populateForm(null);
        this.#renderProfile(null);
        return;
      }
      const user = APIs.budget.setActiveUser(this.#list.value);
      this.#populateForm(user);
      this.#renderProfile(user);
    }

    #handleChooseToAddNewUser() {
      this.#list.value = "";
      this.#populateForm(null);
      this.#message.textContent = "";
      this.#form.elements.firstName.focus();
    }

    async #handleSubmit(event) {
      event.preventDefault();
      this.#message.textContent = "";
      if (!this.#form.checkValidity()) {
        this.#form.reportValidity();
        return;
      }

      const input = {
        id: this.#form.elements.userId.value,
        firstName: this.#form.elements.firstName.value,
        lastName: this.#form.elements.lastName.value,
      };

      this.#saveButton.disabled = true;
      this.#saveButton.textContent = input.id ? "Saving…" : "Adding…";

      try {
        const saved = input.id
          ? await APIs.budget.updateUser(input)
          : await APIs.budget.addUser(input);

        const users = APIs.budget.listUsers();
        if (APIs.budget.getActiveUser()?.id !== saved.id) {
          APIs.budget.setActiveUser(saved.id);
        }
        this.#renderUsers(users);

        this.#message.className = "user-form-message success";
        this.#message.textContent = input.id
          ? "Name updated."
          : `${fullName(saved)} was added.`;
      } catch (error) {
        this.#message.className = "user-form-message error";
        this.#message.textContent = error.message;
        this.#saveButton.textContent = input.id ? "Save name" : "Add user";
      } finally {
        this.#saveButton.disabled = false;
      }
    }

    disconnectedCallback() {
      this.#list.removeEventListener("change", this);
      this.#addButton.removeEventListener("click", this);
      this.#form.removeEventListener("submit", this);
      window.removeEventListener("budget:active-user-changed", this);
      window.removeEventListener("budget:onboarding-complete", this);
      window.removeEventListener("budget:connection-changed", this);
      window.removeEventListener("budget:reference-data-changed", this);
    }
  }

  customElements.define("user-form", UserForm);
})();
