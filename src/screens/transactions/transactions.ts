import { Breadcrumbs } from "../../components/breadcrumbs/breadcrumbs";
import { getIcon } from "../../icons";
import TransactionScreenTempString from "./template.html" with { type: "text" };

const TransactionScreenTemp = document.createElement("template");
TransactionScreenTemp.innerHTML = TransactionScreenTempString;

class TransactionScreen extends HTMLElement {
  #elementName: HTMLElement | null = null;
  #breadcrumbs!: Breadcrumbs;
  #addButton!: HTMLElement;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
    const clone = TransactionScreenTemp.content.cloneNode(
      true,
    ) as DocumentFragment;
    const container = clone.querySelector("section") as HTMLElement;
    this.append(container);

    this.#breadcrumbs =
      container.querySelector<Breadcrumbs>("breadcrumbs-header")!;

    this.#addButton = container.querySelector("#new-transaction-button")!;

    if (this.#breadcrumbs) {
      this.#breadcrumbs.setPath([
        { title: "Budgeting" },
        { title: "Transactions", key: "transactions" },
      ]);
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      default:
        break;
    }
  }

  disconnectedCallback() {}
}

customElements.define("transaction-list-screen", TransactionScreen);
