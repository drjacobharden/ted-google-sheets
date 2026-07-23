document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("user-form");
  const switcher = document.getElementById("user-switcher");
  const message = form.querySelector(".user-form-message");
  const saveButton = document.getElementById("save-user");
  let users = [];

  function fullName(user) {
    return user ? `${user.firstName} ${user.lastName}`.trim() : "";
  }

  function monogram(user) {
    if (!user) return "?";
    return `${user.firstName?.charAt(0) || ""}${user.lastName?.charAt(0) || ""}`.toUpperCase() || "?";
  }

  function renderProfile(user = window.BudgetAPI.getActiveUser()) {
    document.getElementById("profile-monogram").textContent = monogram(user);
    document.getElementById("profile-name").textContent = user ? fullName(user) : "Choose user";
    document.getElementById("settings-monogram").textContent = monogram(user);
  }

  function populateForm(user) {
    form.elements.userId.value = user?.id || "";
    form.elements.firstName.value = user?.firstName || "";
    form.elements.lastName.value = user?.lastName || "";
    saveButton.textContent = user ? "Save name" : "Add user";
  }

  function renderUsers() {
    const active = window.BudgetAPI.getActiveUser();
    switcher.replaceChildren(
      new Option(users.length ? "Choose a user" : "No users added yet", ""),
      ...users
        .slice()
        .sort((a, b) => fullName(a).localeCompare(fullName(b)))
        .map((user) => new Option(fullName(user), user.id)),
    );
    switcher.value = active?.id || "";
    populateForm(active);
    renderProfile(active);
  }

  async function load() {
    switcher.disabled = true;
    message.textContent = "";
    try {
      users = await window.BudgetAPI.listUsers();
      if (!window.BudgetAPI.getActiveUser() && users.length === 1) {
        window.BudgetAPI.setActiveUser(users[0].id);
      }
      renderUsers();
    } catch (error) {
      message.className = "user-form-message error";
      message.textContent = `Couldn’t load users: ${error.message}`;
      renderProfile();
    } finally {
      switcher.disabled = false;
    }
  }

  switcher.addEventListener("change", () => {
    message.textContent = "";
    if (!switcher.value) {
      localStorage.removeItem("myFinance.activeUser.v1");
      populateForm(null);
      renderProfile(null);
      return;
    }
    const user = window.BudgetAPI.setActiveUser(switcher.value);
    populateForm(user);
    renderProfile(user);
  });

  document.getElementById("new-user").addEventListener("click", () => {
    switcher.value = "";
    populateForm(null);
    message.textContent = "";
    form.elements.firstName.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const input = {
      id: form.elements.userId.value,
      firstName: form.elements.firstName.value,
      lastName: form.elements.lastName.value,
    };
    saveButton.disabled = true;
    saveButton.textContent = input.id ? "Saving…" : "Adding…";
    try {
      const saved = input.id
        ? await window.BudgetAPI.updateUser(input)
        : await window.BudgetAPI.addUser(input);
      users = await window.BudgetAPI.listUsers();
      if (window.BudgetAPI.getActiveUser()?.id !== saved.id) {
        window.BudgetAPI.setActiveUser(saved.id);
      }
      renderUsers();
      message.className = "user-form-message success";
      message.textContent = input.id ? "Name updated." : `${fullName(saved)} was added.`;
    } catch (error) {
      message.className = "user-form-message error";
      message.textContent = error.message;
      saveButton.textContent = input.id ? "Save name" : "Add user";
    } finally {
      saveButton.disabled = false;
    }
  });

  window.addEventListener("budget:active-user-changed", (event) => renderProfile(event.detail));
  window.addEventListener("budget:onboarding-complete", load);
  window.UserUI = { load, renderProfile };
  renderProfile();
  if (!window.OnboardingUI?.isBlocking()) load();
});
