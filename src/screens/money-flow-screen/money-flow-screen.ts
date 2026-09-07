import { APIs } from "../../api/api";
import type { MoneyFlowChart } from "../../components/money-flow-chart/money-flow-chart";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { appState } from "../../state/app-state";
import type { HorizontalBarChart } from "../../components/chart-horizontal-bars/horizontal-bar-chart";
import type { TreemapChart } from "../../components/chart-treemap/treemap-chart";
import type { CategoryScatterChart } from "../../components/vendor-scatter-chart/vendor-scatter-chart";
import { buildAnnualMoneyFlow } from "../../utilities/annual-money-flow";
import {
  buildAnnualCategoryScatter,
  buildAnnualCategorySpending,
} from "../../utilities/annual-category-spending";
import {
  buildAnnualVendorSpending,
  collapseVendorSpending,
} from "../../utilities/annual-vendor-spending";
import { messageFromError, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export class MoneyFlowScreen
  extends HTMLElement
  implements EventListenerObject
{
  #chart!: MoneyFlowChart;
  #frame!: HTMLElement;
  #scroll!: HTMLElement;
  #status!: HTMLElement;
  #treemap!: TreemapChart;
  #vendorChart!: HorizontalBarChart;
  #categoryScatter!: CategoryScatterChart;
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.append(template.content.cloneNode(true));
      this.#chart = this.querySelector("#money-flow-chart")!;
      this.#frame = this.querySelector("#money-flow-frame")!;
      this.#scroll = this.querySelector("#money-flow-scroll")!;
      this.#status = this.querySelector("#money-flow-status")!;
      this.#treemap = this.querySelector("#spending-treemap")!;
      this.#vendorChart = this.querySelector("#vendor-spending-chart")!;
      this.#categoryScatter = this.querySelector("#category-spending-scatter")!;
    }
    if (!this.#listening) {
      this.#listening = true;
      window.addEventListener("budget:transactions-loaded", this);
      window.addEventListener("budget:accounts-changed", this);
      window.addEventListener("budget:reference-data-changed", this);
    }
    if (appController.areTransactionsLoaded()) this.#render();
    else void this.#load();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    window.removeEventListener("budget:transactions-loaded", this);
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("budget:reference-data-changed", this);
  }

  handleEvent(): void {
    this.#render();
  }

  async #load(): Promise<void> {
    this.#setStatus("Loading annual money flow…", true);
    try {
      await appController.loadTransactions();
      this.#render();
    } catch (error) {
      this.#setStatus(
        `Couldn’t load the annual money flow. ${messageFromError(error)}`,
      );
    }
  }

  #year(): number {
    const requested = Number(router.currentParams().year);
    return Number.isInteger(requested)
      ? requested
      : appState.get("budgetingContext").year;
  }

  #render(): void {
    const year = this.#year();
    const flow = buildAnnualMoneyFlow(
      appController.getTransactions(),
      APIs.accounts.accounts(),
      APIs.budget.listAllCategories(),
      year,
    );
    this.#chart.data = flow;
    this.#treemap.data = buildAnnualCategorySpending(
      appController.getTransactions(),
      APIs.accounts.accounts(),
      APIs.budget.listAllCategories(),
      year,
    );
    const vendorSpending = buildAnnualVendorSpending(
      appController.getTransactions(),
      APIs.accounts.accounts(),
      APIs.budget.listAllVendors(),
      year,
    );
    this.#vendorChart.data = collapseVendorSpending(
      vendorSpending,
    ).map(({ id, label, amount, chartValue, isInterval }) => ({
      id,
      label,
      value: chartValue ?? amount,
      tooltipAmount: isInterval ? amount : undefined,
      isInterval,
    }));
    this.#categoryScatter.data = buildAnnualCategoryScatter(
      appController.getTransactions(),
      APIs.accounts.accounts(),
      APIs.budget.listAllCategories(),
      year,
    );
    this.#frame.setAttribute("aria-busy", "false");

    if (!flow.hasData) {
      this.#setStatus(`No money flow exists for ${year}.`);
      return;
    }

    this.#status.hidden = true;
    this.#scroll.hidden = false;
  }

  #setStatus(message: string, busy = false): void {
    this.#chart.data = null;
    this.#treemap.data = [];
    this.#vendorChart.data = [];
    this.#categoryScatter.data = [];
    this.#frame.setAttribute("aria-busy", String(busy));
    this.#scroll.hidden = true;
    this.#status.textContent = message;
    this.#status.hidden = false;
  }
}

if (!customElements.get("money-flow-screen")) {
  customElements.define("money-flow-screen", MoneyFlowScreen);
}
