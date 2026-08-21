# TED editorial theme

The theme is organized into three layers:

1. `tokens.css` contains primitive palette, type-scale, spacing, and sizing values.
2. `variables.css` registers the local fonts and maps primitives to semantic roles.
3. `elements.css` provides opt-in typography, layout, surface, legend, and index-row classes.

Apply `editorial-theme` to a screen wrapper before using the theme. Its base styles are intentionally scoped so these files can load without changing existing screens.

## Typography classes

| Class | Intended use |
| --- | --- |
| `type-display` | Largest editorial statement or page headline |
| `type-title` | Page title |
| `type-section-title` | Figure and section headings |
| `type-body` | General interface and explanatory copy |
| `type-caption` | Italic figure commentary and narrative notes |
| `type-label` | Uppercase labels and stat headings |
| `type-eyebrow` | Accent-colored kicker above a headline |
| `type-meta` | Dates, figure numbers, ranks, and publication metadata |
| `type-number` | Financial values and primary statistics |
| `type-number--hero` | Largest financial value on the page |
| `type-delta` | Year-over-year and period comparisons |
| `type-muted` | Muted text-color modifier |
| `type-subtle` | Lowest-emphasis text-color modifier |

Place `is-positive` or `is-negative` inside an `editorial-theme` wrapper to apply the corresponding semantic color.

## Layout and element classes

| Class | Intended use |
| --- | --- |
| `editorial-page` | Centered page-width and responsive gutters |
| `editorial-section` | Generously spaced ruled section |
| `editorial-section--compact` | Reduced vertical section spacing |
| `editorial-section-header` | Title/accessory row that stacks on small screens |
| `editorial-surface` | Paper-toned bordered figure surface |
| `editorial-rule` | Thin horizontal rule |
| `editorial-rule--strong` | Strong publication-style rule |
| `editorial-stack` | Vertical content group |
| `editorial-cluster` | Wrapping horizontal content group |
| `editorial-split` | Responsive two-column layout |
| `editorial-prose` | Readable text measure |
| `editorial-index-row` | Ranked category or vendor row |
| `editorial-leader` | Dotted leader between a label and value |
| `editorial-legend` | Wrapping chart legend |
| `editorial-legend-item` | One label/swatch legend pair |
| `editorial-swatch` | Line swatch, with bar/dot/dashed modifiers |
| `visually-hidden` | Accessible content hidden visually |

Prefer semantic variables such as `--color-text`, `--color-rule`, and `--color-chart-trend` in screen and component CSS. Primitive values such as `--paper-400` and `--moss-500` should normally be used only while defining or intentionally overriding a theme.
