# Copilot Instructions — custom.deposits

SAPUI5 Freestyle app (v1.147.2) — Flexible Column Layout deposit rate grid and history viewer for a banking treasury suite. Deployed to CF via MTA; two FLP inbounds (`Deposits-display`, `Deposits-history`).

## Architecture

- **MVC:** XML views in `webapp/view/`, controllers in `webapp/controller/` (extend `BaseController`).
- **FCL routing:** `sap.f.routing.Router` with `flexibleColumnLayout`. Two columns max. Begin column = list (`DepositsList`), mid column = detail (`DepositDetail`). See [webapp/manifest.json](../webapp/manifest.json).
- **Intent model:** `onInit` detects FLP hash (`Deposits-display` vs `Deposits-history`) and writes an `intent` JSONModel (`{ isDisplay, isHistory, isSantander }`). All conditional visibility/enabled bindings read from `intent>/…`.
- **OData V4 only:** Single data source `mainService` → `/odata/` (`sap.ui.model.odata.v4.ODataModel`). Use `bindList(…).requestContexts(…)` for programmatic reads. Always probe with a temporary binding before the real bind to catch auth errors asynchronously.
- **Programmatic table rows:** `sap.m.Table#items` has no static `<items>` aggregation — rows are built by `_buildRowTemplate(aColumnKeys)` at runtime in [DepositsList.controller.js](../webapp/controller/DepositsList.controller.js). Follow this factory pattern when adding new columns.

## Code Style

- JavaScript only (no TypeScript). All UI5 modules declared via `sap.ui.define` — **never** access `sap.*` as a global.
- All user-visible text via `{i18n>key}`. Maintain both `i18n.properties`, `i18n_en.properties`, and `i18n_es.properties` in sync.
- Custom formatters live in [webapp/model/formatter.js](../webapp/model/formatter.js). Call `Formatter.init(oResourceBundle)` once in `onInit` before using i18n-dependent formatters (`formatDepositTitle`).
- Use `sap.ui.core.format.NumberFormat` / `DateFormat` for formatting. Only write custom formatters for logic not covered by built-in OData types.
- Date arithmetic uses the `Temporal` API with a `Date`-based fallback — never raw millisecond math.

## SmartVariantManagement & FilterBar

- Uses `sap.ui.comp.smartvariants.SmartVariantManagement` + `sap.ui.comp.filterbar.FilterBar`. Per-intent `persistencyKey` (`DepositsDisplayFilterBar` / `DepositsHistoryFilterBar`).
- Implement custom `fetchData` / `applyData` / `getFiltersWithValues` callbacks — do **not** rely on default control serialization for date range or token-based (Rate) filters.

## Fragment-Based Dialogs

- Load via `Fragment.load(…)`, add as `dependent`, destroy on close.
- Dialog state lives in a dedicated named JSONModel (e.g., `customRequest`).
- Example: [webapp/view/CustomRequestDialog.fragment.xml](../webapp/view/CustomRequestDialog.fragment.xml) + wizard state in `DepositsList.controller.js`.

## Forms

- Always use `sap.ui.layout.form.Form` with `sap.ui.layout.form.ColumnLayout`. Default columns: M=2, L=3, XL=4. Never use `SimpleForm`.

## Build & Test

```bash
npm start             # dev server (no mock) → http://localhost:8080/index.html
npm run start-mock    # dev server with mock data (ui5-mock.yaml)
npm run lint          # ESLint
npm run build         # unoptimized dist/
npm run build:opt     # optimized self-contained dist/
```

OData proxy: `/odata` → destination `Deposits_Destination` (configured in [ui5.yaml](../ui5.yaml)).

## Known Linter Issues (do not regress)

The following deprecations exist in the codebase and should be fixed — do not introduce further:

| File | Issue |
|---|---|
| `webapp/view/DepositsList.view.xml:153` | `valueHelpOnly` property on `sap.m.Input` deprecated since 1.119 |

Update: `webapp/controller/BaseController.js` replaced the deprecated `getLanguage()` call with `sap/base/i18n/Localization.getLanguage()`.

**After every code change, run the UI5 linter** (`mcp_ui5_run_ui5_linter`) to verify no new issues are introduced.

## Integration Points

- OData V4 service at `/odata/` proxied to destination `Deposits_Destination` (CF).
- Static JSON models: `model/data/Banks.json` (bank list), `localService/data/` for mock data.
- FLP integration: `sap.cloud.service: treasury-suite`; two inbounds defined in manifest `crossNavigation`.
- MTA deployment: two tenant targets (BackOffice `bo`, CLI `cli`) via `build:mta:bo` / `build:mta:cli` scripts that swap destination names with `sed`.

## Security

- No inline `<script>` in HTML — all logic in dedicated JS files (CSP compliance).
- `sapuxLayer: CUSTOMER_BASE` — this is a customer-layer extension; respect SAP extensibility boundaries.
- Auth errors from OData V4 are caught via async probe binding before the real binding is established.
