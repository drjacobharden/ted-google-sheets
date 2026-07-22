// First-run setup for creating a new Sheet-backed budget or joining a household.
(function () {
  const STORAGE_KEY = "myFinance.onboarding.v1";
  const TEMPLATE_URL =
    "https://docs.google.com/spreadsheets/d/1bmbGwKNEgo7i4zhEFFaC3jE4Vyik692orS-mM8-EyD8/copy";
  const STEPS = Object.freeze({
    new: Object.freeze([
      { key: "sheet", label: "Copy Sheet" },
      { key: "initialize", label: "Initialize" },
      { key: "deploy", label: "Deploy" },
      { key: "connect", label: "Connect" },
      { key: "profile", label: "Profile" },
      { key: "verify", label: "Verify" },
    ]),
    join: Object.freeze([
      { key: "connect", label: "Connect" },
      { key: "profile", label: "Profile" },
      { key: "verify", label: "Verify" },
    ]),
  });

  let progress = readProgress();
  let blocking = shouldStart();
  let connectedUsers = null;
  let profileMode = "select";
  let elements = null;

  function readProgress() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return value && value.active === true ? value : null;
    } catch {
      return null;
    }
  }

  function defaultProgress() {
    return { active: true, flow: "", step: 0, confirmations: {} };
  }

  function writeProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function shouldStart() {
    return Boolean(
      readProgress()?.active ||
      (!window.BudgetAPI.getConfig().endpoint &&
        !window.BudgetAPI.getActiveUser()),
    );
  }

  function flowSteps(flow) {
    return (STEPS[flow] || []).map((step) => ({ ...step }));
  }

  function stepIndex(flow, key) {
    return (STEPS[flow] || []).findIndex((step) => step.key === key);
  }

  function normalizeProgress() {
    if (!progress?.flow) return;
    const endpoint = window.BudgetAPI.getConfig().endpoint;
    const activeUser = window.BudgetAPI.getActiveUser();
    if (endpoint)
      progress.step = Math.max(
        progress.step,
        stepIndex(progress.flow, "profile"),
      );
    if (activeUser)
      progress.step = Math.max(
        progress.step,
        stepIndex(progress.flow, "verify"),
      );
    progress.step = Math.min(progress.step, STEPS[progress.flow].length - 1);
  }

  async function connectEndpoint(endpoint) {
    const value = String(endpoint || "").trim();
    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
        value,
      )
    ) {
      throw new Error(
        "Paste Google’s complete production Web app URL ending in /exec.",
      );
    }
    const previous = window.BudgetAPI.getConfig();
    await window.BudgetAPI.testConnection(value);
    window.BudgetAPI.saveConfig({ endpoint: value });
    try {
      await window.BudgetAPI.loadReferenceData();
      const users = window.BudgetAPI.listUsers();
      window.dispatchEvent(
        new CustomEvent("budget:connection-changed", {
          detail: { endpoint: value },
        }),
      );
      return users;
    } catch (error) {
      window.BudgetAPI.saveConfig(previous);
      throw new Error(
        `The endpoint responded, but its budget data could not be loaded: ${error.message}`,
      );
    }
  }

  function escapeHTML(value) {
    return String(value).replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );
  }

  function fullName(user) {
    return user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "";
  }

  function setMessage(text = "", type = "") {
    elements.message.textContent = text;
    elements.message.className = `onboarding-message${type ? ` ${type}` : ""}`;
  }

  function setBusy(busy, text) {
    elements.next.disabled = busy;
    elements.next.textContent = busy ? text : elements.next.dataset.idleText;
  }

  function setPrimary(label, handler, disabled = false) {
    elements.next.textContent = label;
    elements.next.dataset.idleText = label;
    elements.next.disabled = disabled;
    elements.next.onclick = handler;
  }

  function focusFirst() {
    setTimeout(() => {
      const target = elements.dialog.querySelector(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])",
      );
      (target || elements.dialog).focus();
    }, 0);
  }

  function renderChoice() {
    elements.stepper.hidden = true;
    elements.actions.hidden = true;
    setMessage();
    elements.content.innerHTML = `
      <h2>How are you setting up this app?</h2>
      <p>Start with a new spreadsheet or connect to a household that already has one.</p>
      <div class="onboarding-choice-grid">
        <button class="onboarding-choice" type="button" data-onboarding-flow="new">
          <strong>Start a new budget</strong>
          <span>Copy the template, initialize it, and create your household’s deployment.</span>
        </button>
        <button class="onboarding-choice" type="button" data-onboarding-flow="join">
          <strong>Join an existing budget</strong>
          <span>Use a private connection URL from someone in your household.</span>
        </button>
      </div>`;
    elements.content
      .querySelectorAll("[data-onboarding-flow]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          progress.flow = button.dataset.onboardingFlow;
          progress.step = 0;
          progress.confirmations = {};
          writeProgress();
          render();
        });
      });
    focusFirst();
  }

  function renderStepper() {
    const steps = STEPS[progress.flow];
    elements.stepper.style.setProperty("--step-count", steps.length);
    elements.stepper.replaceChildren(
      ...steps.map((step, index) => {
        const item = document.createElement("li");
        item.textContent = step.label;
        if (index < progress.step) item.className = "complete";
        if (index === progress.step) {
          item.className = "current";
          item.setAttribute("aria-current", "step");
        }
        return item;
      }),
    );
    elements.stepper.hidden = false;
  }

  function confirmationStep(options) {
    const checked = Boolean(progress.confirmations[options.key]);
    elements.content.innerHTML = options.html;
    const checkbox = elements.content.querySelector(
      "[data-onboarding-confirm]",
    );
    checkbox.checked = checked;
    setPrimary(
      "Continue",
      () => {
        progress.step += 1;
        writeProgress();
        render();
      },
      !checked,
    );
    checkbox.addEventListener("change", () => {
      progress.confirmations[options.key] = checkbox.checked;
      writeProgress();
      elements.next.disabled = !checkbox.checked;
    });
  }

  function renderSheetStep() {
    confirmationStep({
      key: "sheetReady",
      html: `
        <h2>Make your private budget Sheet</h2>
        <p>Google will create a copy in your Drive. If you already made one, you can use that copy.</p>
        <a class="onboarding-link" href="${TEMPLATE_URL}" target="_blank" rel="noopener noreferrer">Open spreadsheet template</a>
        <label class="onboarding-check"><input type="checkbox" data-onboarding-confirm><span>My budget Sheet is open in my Google Drive.</span></label>`,
    });
  }

  function renderInitializeStep() {
    confirmationStep({
      key: "initialized",
      html: `
        <h2>Initialize the copied Sheet</h2>
        <p>In the Google Sheet, use the custom menu to create the normalized budget tabs and Ledger.</p>
        <ol class="onboarding-instructions">
          <li>Reload the copied Sheet.</li>
          <li>Choose <strong>My Finance → Set up budget</strong>.</li>
          <li>Continue through Google’s authorization screens.</li>
          <li>Wait for the <strong>Budget initialized</strong> message.</li>
        </ol>
        <label class="onboarding-check"><input type="checkbox" data-onboarding-confirm><span>I saw the Budget initialized message.</span></label>`,
    });
  }

  function renderDeployStep() {
    confirmationStep({
      key: "deployed",
      html: `
        <h2>Deploy the Sheet’s web app</h2>
        <p>This creates the private connection URL used by My Finance.</p>
        <ol class="onboarding-instructions">
          <li>Choose <strong>Extensions → Apps Script</strong>.</li>
          <li>Choose <strong>Deploy → New deployment → Web app</strong>.</li>
          <li>Set <strong>Execute as</strong> to <strong>Me</strong>.</li>
          <li>Set access to <strong>Anyone</strong>, then deploy.</li>
          <li>Copy Google’s <strong>Web app URL</strong> ending in <code>/exec</code>.</li>
        </ol>
        <label class="onboarding-check"><input type="checkbox" data-onboarding-confirm><span>I deployed the web app and copied its URL.</span></label>`,
    });
  }

  function renderConnectStep() {
    const joining = progress.flow === "join";
    elements.content.innerHTML = `
      <h2>${joining ? "Connect to your household" : "Connect My Finance"}</h2>
      <p>${joining ? "Ask the household owner to send the private production connection URL." : "Paste the production Web app URL supplied by Google."}</p>
      <div class="onboarding-fields">
        <label class="form-field full-width"><span>Web app URL</span><input id="onboarding-endpoint" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec"></label>
      </div>
      <p class="onboarding-secret-note">Keep this URL private. Anyone who has it can access this household’s budget API.</p>`;
    const endpointInput = elements.content.querySelector(
      "#onboarding-endpoint",
    );
    setPrimary("Test and connect", async () => {
      setMessage();
      setBusy(true, "Connecting…");
      try {
        connectedUsers = await connectEndpoint(endpointInput.value);
        profileMode = connectedUsers.length ? "select" : "create";
        progress.step += 1;
        writeProgress();
        render();
      } catch (error) {
        setMessage(error.message, "error");
        setBusy(false);
      }
    });
    endpointInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.next.click();
      }
    });
  }

  function renderProfileForm() {
    elements.content.innerHTML = `
      <h2>Create your profile</h2>
      <p>Your UUID-backed profile will be stored in the shared Sheet and used to identify transactions you create.</p>
      <div class="onboarding-fields">
        <label class="form-field"><span>First name</span><input id="onboarding-first-name" maxlength="80" autocomplete="given-name" required></label>
        <label class="form-field"><span>Last name</span><input id="onboarding-last-name" maxlength="80" autocomplete="family-name" required></label>
      </div>
      ${connectedUsers?.length ? '<button class="onboarding-profile-switch" id="choose-existing-profile" type="button">Choose an existing profile instead</button>' : ""}`;
    elements.content
      .querySelector("#choose-existing-profile")
      ?.addEventListener("click", () => {
        profileMode = "select";
        renderProfileStep();
      });
    setPrimary("Create profile", async () => {
      const firstName = elements.content
        .querySelector("#onboarding-first-name")
        .value.trim();
      const lastName = elements.content
        .querySelector("#onboarding-last-name")
        .value.trim();
      if (!firstName || !lastName) {
        setMessage("Enter your first and last name.", "error");
        return;
      }
      setBusy(true, "Creating…");
      setMessage();
      try {
        const saved = await window.BudgetAPI.addUser({ firstName, lastName });
        connectedUsers = [
          ...(connectedUsers || []).filter((user) => user.id !== saved.id),
          saved,
        ];
        if (window.BudgetAPI.getActiveUser()?.id !== saved.id) {
          window.BudgetAPI.setActiveUser(saved.id);
        }
        progress.step += 1;
        writeProgress();
        render();
      } catch (error) {
        setMessage(error.message, "error");
        setBusy(false);
      }
    });
  }

  function renderProfilePicker() {
    elements.content.innerHTML = `
      <h2>Who is using this computer?</h2>
      <p>Profiles are shared in the Sheet, but the active selection stays on this computer.</p>
      <div class="onboarding-fields">
        <label class="form-field full-width"><span>Profile</span><select id="onboarding-user"><option value="">Choose a profile</option></select></label>
      </div>
      <button class="onboarding-profile-switch" id="create-onboarding-profile" type="button">Add a new profile</button>`;
    const select = elements.content.querySelector("#onboarding-user");
    connectedUsers
      .slice()
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
      .forEach((user) => select.add(new Option(fullName(user), user.id)));
    elements.content
      .querySelector("#create-onboarding-profile")
      .addEventListener("click", () => {
        profileMode = "create";
        renderProfileStep();
      });
    setPrimary("Use this profile", () => {
      if (!select.value) {
        setMessage("Choose your profile or add a new one.", "error");
        return;
      }
      try {
        window.BudgetAPI.setActiveUser(select.value);
        progress.step += 1;
        writeProgress();
        render();
      } catch (error) {
        setMessage(error.message, "error");
      }
    });
  }

  async function renderProfileStep() {
    if (!connectedUsers) {
      elements.content.innerHTML =
        '<div class="spinner" aria-hidden="true"></div><p>Loading household profiles…</p>';
      elements.next.disabled = true;
      try {
        connectedUsers = window.BudgetAPI.listUsers();
        profileMode = connectedUsers.length ? "select" : "create";
      } catch (error) {
        setMessage(`Couldn’t load profiles: ${error.message}`, "error");
        return;
      }
    }
    if (profileMode === "select" && connectedUsers.length)
      renderProfilePicker();
    else renderProfileForm();
    focusFirst();
  }

  function finishOnboarding() {
    const activeUser = window.BudgetAPI.getActiveUser();
    localStorage.removeItem(STORAGE_KEY);
    progress = null;
    blocking = false;
    elements.overlay.hidden = true;
    document.body.classList.remove("onboarding-open");
    elements.appShell.inert = false;
    elements.appShell.removeAttribute("aria-hidden");
    window.dispatchEvent(
      new CustomEvent("budget:onboarding-complete", {
        detail: { user: activeUser },
      }),
    );
  }

  function renderVerifyStep() {
    const user = window.BudgetAPI.getActiveUser();
    const name = fullName(user) || "Your profile";
    elements.content.innerHTML = `
      <h2>Confirm the Sheet received your profile</h2>
      <p>Return to the shared Google Sheet and open the <strong>Users</strong> tab. Confirm that <strong>${escapeHTML(name)}</strong> appears there.</p>
      <label class="onboarding-check"><input type="checkbox" id="onboarding-verified"><span>I can see ${escapeHTML(name)} in the Users tab.</span></label>`;
    const checkbox = elements.content.querySelector("#onboarding-verified");
    checkbox.checked = Boolean(progress.confirmations.profileVerified);
    setPrimary("Finish setup", finishOnboarding, !checkbox.checked);
    checkbox.addEventListener("change", () => {
      progress.confirmations.profileVerified = checkbox.checked;
      writeProgress();
      elements.next.disabled = !checkbox.checked;
    });
  }

  function renderBackButton(stepKey) {
    const endpointSaved = Boolean(window.BudgetAPI.getConfig().endpoint);
    const canGoBack =
      !endpointSaved && stepKey !== "profile" && stepKey !== "verify";
    elements.back.hidden = !canGoBack;
    elements.back.onclick = () => {
      setMessage();
      if (progress.step === 0) {
        progress.flow = "";
      } else {
        progress.step -= 1;
      }
      writeProgress();
      render();
    };
  }

  function render() {
    if (!progress.flow) {
      renderChoice();
      return;
    }
    normalizeProgress();
    writeProgress();
    const step = STEPS[progress.flow][progress.step];
    setMessage();
    elements.actions.hidden = false;
    renderStepper();
    renderBackButton(step.key);
    if (step.key === "sheet") renderSheetStep();
    if (step.key === "initialize") renderInitializeStep();
    if (step.key === "deploy") renderDeployStep();
    if (step.key === "connect") renderConnectStep();
    if (step.key === "profile") renderProfileStep();
    if (step.key === "verify") renderVerifyStep();
    focusFirst();
  }

  function trapFocus(event) {
    if (!blocking) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...elements.dialog.querySelectorAll(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ].filter((element) => !element.hidden);
    if (!focusable.length) {
      event.preventDefault();
      elements.dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function initialize() {
    if (!blocking) return;
    progress = progress || defaultProgress();
    normalizeProgress();
    writeProgress();
    elements = {
      overlay: document.getElementById("onboarding-overlay"),
      dialog: document.getElementById("onboarding-dialog"),
      stepper: document.getElementById("onboarding-stepper"),
      content: document.getElementById("onboarding-content"),
      message: document.getElementById("onboarding-message"),
      actions: document.getElementById("onboarding-actions"),
      back: document.getElementById("onboarding-back"),
      next: document.getElementById("onboarding-next"),
      appShell: document.querySelector(".app-shell"),
    };
    elements.overlay.hidden = false;
    elements.appShell.inert = true;
    elements.appShell.setAttribute("aria-hidden", "true");
    document.body.classList.add("onboarding-open");
    document.addEventListener("keydown", trapFocus, true);
    render();
  }

  window.OnboardingUI = {
    STORAGE_KEY,
    TEMPLATE_URL,
    isBlocking: () => blocking,
    shouldStart,
    flowSteps,
    connectEndpoint,
  };
  document.addEventListener("DOMContentLoaded", initialize);
})();
