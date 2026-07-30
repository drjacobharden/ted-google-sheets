import dashboardIcon from "./dashboard.html" with { type: "text" };
import transcationsIcon from "./transactions.html" with { type: "text" };
import labelIcon from "./label.html" with { type: "text" };
import peopleIcon from "./people.html" with { type: "text" };
import chartIcon from "./chart.html" with { type: "text" };
import boxIcon from "./box.html" with { type: "text" };
import plusIcon from "./plus.html" with { type: "text" };
import importIcon from "./import.html" with { type: "text" };
import syncIcon from "./sync.html" with { type: "text" };
import settingsIcon from "./settings.html" with { type: "text" };
import cartIcon from "./cart.html" with { type: "text" };
import sidebarIcon from "./sidebar.html" with { type: "text" };
import chevronRightIcon from "./chevron-right.html" with { type: "text" };

export type IconKeys = keyof typeof iconStrings;

const iconStrings = {
  dashboard: dashboardIcon,
  transactions: transcationsIcon,
  label: labelIcon,
  people: peopleIcon,
  chart: chartIcon,
  box: boxIcon,
  plus: plusIcon,
  import: importIcon,
  sync: syncIcon,
  settings: settingsIcon,
  cart: cartIcon,
  sidebar: sidebarIcon,
  chevronRight: chevronRightIcon,
};

const iconTemplateCache = new Map();

for (const [name, svgString] of Object.entries(iconStrings)) {
  const template = document.createElement("template");
  template.innerHTML = svgString.trim();
  iconTemplateCache.set(name, template);
}

export function getIcon(name: IconKeys) {
  const template = iconTemplateCache.get(name);
  if (!template) return null;

  return template.content.firstElementChild.cloneNode(true);
}
