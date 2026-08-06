import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import { dateRangeDetail, eventTargetElement, isInvestmentSource, type DateRangePickerElement, type DateRangeValue } from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import type { InvestmentAccount, InvestmentBalance } from "../../api/investment-api";
import { escapeHTML, money, netFlows } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface MutablePageTitle extends HTMLElement { title: string; subtitle: string; }

/** Displays monthly balance history for one investment account. */
export class InvestmentAccountDetailScreen extends HTMLElement implements EventListenerObject {
  #accountId = "";
  #heading!: MutablePageTitle;
  #editButton!: HTMLButtonElement;
  #count!: HTMLElement;
  #body!: HTMLTableSectionElement;
  #wrap!: HTMLElement;
  #empty!: HTMLElement;
  #listening = false;

  /** Initializes the detail screen from the current route parameters. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "investment-account-detail";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    this.#accountId = router.currentParams().accountId ?? "";
    if (this.#listening) return;
    this.#listening = true;
    this.#editButton.addEventListener("click", this);
    this.#body.addEventListener("click", this);
    this.#body.addEventListener("keydown", this);
    window.addEventListener("budget:investments-changed", this);
    window.addEventListener("budget:investments-loaded", this);
    this.#render();
  }

  /** Removes the listeners owned by the account detail screen. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#editButton.removeEventListener("click", this);
    this.#body.removeEventListener("click", this);
    this.#body.removeEventListener("keydown", this);
    window.removeEventListener("budget:investments-changed", this);
    window.removeEventListener("budget:investments-loaded", this);
  }

  /** Routes edit, row, keyboard, and investment events to screen behavior. */
  handleEvent(event: Event): void {
    if (event.type === "click" && event.currentTarget === this.#editButton) this.#handleEdit();
    else if (event.type === "click") this.#handleRowClick(event);
    else if (event.type === "keydown") this.#handleRowKeydown(event);
    else this.#render();
  }

  /** Captures the typed elements cloned from the detail template. */
  #captureElements(): void {
    this.#heading = this.querySelector<MutablePageTitle>("page-title")!;
    this.#editButton = this.querySelector<HTMLButtonElement>("#edit-investment-account")!;
    this.#count = this.querySelector<HTMLElement>("#investment-account-history-count")!;
    this.#body = this.querySelector<HTMLTableSectionElement>("#investment-account-history-body")!;
    this.#wrap = this.querySelector<HTMLElement>("#investment-account-history-wrap")!;
    this.#empty = this.querySelector<HTMLElement>("#investment-account-history-empty")!;
  }

  /** Returns the active account selected by the route. */
  #account(): InvestmentAccount | undefined {
    return APIs.investment.accounts().find((account) => account.id === this.#accountId && account.active !== false);
  }

  /** Renders the selected account and its monthly balance rows. */
  #render(): void {
    const account = this.#account();
    if (!account) {
      if (!APIs.investment.isLoaded()) {
        this.#heading.title = "Loading account…";
        this.#editButton.disabled = true;
        return;
      }
      router.navigate("investment-accounts");
      return;
    }
    this.#heading.title = account.name;
    this.#heading.subtitle = `${InvestmentView.sourceLabel(account.source)} · Monthly balance history`;
    this.#editButton.disabled = false;
    const rows = APIs.investment.balances().filter((item) => item.accountId === this.#accountId).sort((left, right) => right.month.localeCompare(left.month));
    this.#count.textContent = `${rows.length} ${rows.length === 1 ? "balance" : "balances"}`;
    this.#body.replaceChildren(...rows.map((balance) => this.#createBalanceRow(account, balance)));
    this.#empty.hidden = rows.length > 0;
    this.#wrap.hidden = rows.length === 0;
  }

  /** Creates an accessible monthly balance row with contribution totals. */
  #createBalanceRow(account: InvestmentAccount, balance: InvestmentBalance): HTMLTableRowElement {
    const flows = APIs.investment.contributions().filter((item) => item.accountId === this.#accountId && item.month === balance.month);
    const contributions = flows.filter((item) => item.amount > 0).length;
    const withdrawals = flows.filter((item) => item.amount < 0).length;
    const monthLabel = InvestmentView.formatMonth(balance.month);
    const row = document.createElement("tr");
    row.dataset.investmentBalanceMonth = balance.month;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Edit ${account.name} balance for ${monthLabel}`);
    row.innerHTML = `<td><strong>${escapeHTML(monthLabel)}</strong></td><td><strong>${money(netFlows(flows))}</strong><small>${contributions} ${contributions === 1 ? "contribution" : "contributions"} · ${withdrawals} ${withdrawals === 1 ? "withdrawal" : "withdrawals"}</small></td><td class="amount-cell"><strong>${money(balance.balance)}</strong></td>`;
    return row;
  }

  /** Opens the selected investment month in its editor drawer. */
  #openMonth(row: HTMLElement | null): void {
    const month = row?.dataset.investmentBalanceMonth;
    if (month) router.updateParams({ drawer: "investment-month", investmentAccountId: this.#accountId, investmentMonth: month });
  }

  /** Handles pointer activation of a monthly balance row. */
  #handleRowClick(event: Event): void {
    this.#openMonth(eventTargetElement(event)?.closest<HTMLElement>("[data-investment-balance-month]") ?? null);
  }

  /** Handles keyboard activation of a monthly balance row. */
  #handleRowKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
    const row = eventTargetElement(event)?.closest<HTMLElement>("[data-investment-balance-month]") ?? null;
    if (!row) return;
    event.preventDefault();
    this.#openMonth(row);
  }

  /** Opens the selected investment account in its editor drawer. */
  #handleEdit(): void {
    router.updateParams({ drawer: "investment-account", investmentAccountId: this.#accountId });
  }
}

if (!customElements.get("investment-account-detail-screen")) customElements.define("investment-account-detail-screen", InvestmentAccountDetailScreen);
