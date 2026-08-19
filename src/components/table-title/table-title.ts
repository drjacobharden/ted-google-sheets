// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";
(function () {
  class TableTitle extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized) return;
      this.dataset.initialized = "true";

      const title = this.getAttribute("title");
      const subtitle = this.getAttribute("subtitle");

      const section = document.createElement("div");
      section.className = "settings-card-heading";

      const textColumn = document.createElement("div");
      section.appendChild(textColumn);

      if (title) {
        const heading = document.createElement("h2");
        heading.textContent = title;
        textColumn.appendChild(heading);
      }

      if (subtitle) {
        const paragraph = document.createElement("p");
        paragraph.textContent = subtitle;
        textColumn.appendChild(paragraph);
      }

      while (this.firstChild) {
        section.appendChild(this.firstChild);
      }

      this.appendChild(section);
    }
  }

  customElements.define("table-title", TableTitle);
})();
