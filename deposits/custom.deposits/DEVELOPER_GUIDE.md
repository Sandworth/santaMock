# Developer Guide — custom.deposits

> A comprehensive technical guide for SAPUI5 developers joining the **custom.deposits** project.  
> This document explains the architecture, navigation model, view structure, data flow, and every controller function in detail.

---

## Table of Contents

1. [Application Overview](#application-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Flexible Column Layout (FCL) — Component.js](#flexible-column-layout-fcl--componentjs)
4. [Intent-Based Navigation](#intent-based-navigation)
5. [Routing & Navigation Flow](#routing--navigation-flow)
6. [Views](#views)
7. [Models & Data Sources](#models--data-sources)
8. [Formatters](#formatters)
9. [Controllers — Detailed Reference](#controllers--detailed-reference)
   - [App.controller.js](#appcontrollerjs)
   - [BaseController.js](#basecontrollerjs)
   - [DepositsList.controller.js](#depositslistcontrollerjs)
   - [DepositDetail.controller.js](#depositdetailcontrollerjs)
10. [Custom Request Dialog](#custom-request-dialog)
11. [FilterBar & SmartVariantManagement](#filterbar--smartvariantmanagement)
12. [OData V4 Patterns](#odata-v4-patterns)
13. [Build & Deployment](#build--deployment)

---

## Application Overview

**custom.deposits** is a SAPUI5 Freestyle application (v1.147.2) built for a banking treasury suite. It serves two distinct user experiences from a single codebase, determined by the Fiori Launchpad (FLP) tile the user selects:

| FLP Tile | Intent Hash | Purpose |
|---|---|---|
| **SANdepo** | `#Deposits-display` | End-user view: displays the current **rate grid** (interest rates by tenor and currency). Users can simulate returns and request deposits. |
| **SANdepo History** | `#Deposits-history` | Back-office view: shows the full **deposit request history** — all submitted requests with start/maturity dates, amounts, and status. |

Both tiles render the same application but the UI dynamically adapts column visibility, available filters, OData entity bindings, and action buttons based on the detected **intent**.

---

## Architecture & Technology Stack

| Aspect | Implementation |
|---|---|
| **Framework** | SAPUI5 1.147.2 (Freestyle — no Fiori Elements) |
| **Pattern** | MVC — XML Views + JS Controllers |
| **Layout** | `sap.f.FlexibleColumnLayout` (FCL) — two-column max |
| **Router** | `sap.f.routing.Router` (FCL-aware) |
| **OData** | V4 only (`sap.ui.model.odata.v4.ODataModel`) |
| **Variant Mgmt** | `sap.ui.comp.smartvariants.SmartVariantManagement` + `sap.ui.comp.filterbar.FilterBar` |
| **i18n** | Three property files: default, `_en`, `_es` |
| **Deployment** | Cloud Foundry via MTA; two tenants (BackOffice / CLI) |

---

## Flexible Column Layout (FCL) — Component.js

The **`Component.js`** file is the application entry point and manages the FCL lifecycle. Its key responsibilities are:

### 1. Layout State Model

```javascript
var oModel = new JSONModel({ layout: "OneColumn" });
this.setModel(oModel);
```

A **default (unnamed) JSON model** is created to hold the current FCL layout state (e.g., `"OneColumn"`, `"TwoColumnsBeginExpanded"`). This model is bound to the `<FlexibleColumnLayout layout="{/layout}" />` in `App.view.xml`, so any change to `/layout` triggers the FCL to animate between column states.

### 2. `_onBeforeRouteMatched(oEvent)`

Attached to the router's `beforeRouteMatched` event. Before any view renders:

- If the URL contains an explicit `layout` parameter → sets it directly in the model.
- If no `layout` is provided (first load, direct URL to list) → asks the `FlexibleColumnLayoutSemanticHelper` for the default "level 0" state (OneColumn).

This ensures the FCL always has a valid layout **before** views are instantiated.

### 3. `getHelper()` — FCL Semantic Helper

Returns a **Promise** resolving to the `FlexibleColumnLayoutSemanticHelper` singleton for the application's FCL control. The helper provides:

- `getNextUIState(iLevel)` — determines what layout to apply when navigating to a given column depth (0 = list only, 1 = list + detail).
- `getCurrentUIState()` — exposes which columns are visible and which action buttons (close, fullscreen) should be shown.

Configuration applied to the helper:
- Default two-column layout: `TwoColumnsBeginExpanded` (list remains visible but compressed).
- FCL limited to **two columns** (no end/third column).

### 4. `_getFcl()` — Safe FCL Reference

Returns a Promise resolving to the actual `sap.f.FlexibleColumnLayout` control instance. Handles the async timing when `IAsyncContentCreation` is used (root control may not exist yet during `init`).

### How Navigation Triggers Layout Changes

1. **List → Detail:** `DepositsList` calls `oHelper.getNextUIState(1)` which returns `TwoColumnsBeginExpanded`. It passes this as the `layout` route parameter.
2. **Detail → List (close):** `DepositDetail.handleClose()` reads `/actionButtonsInfo/midColumn/closeColumn` from the layout model (set by the helper), which is `"OneColumn"`.
3. **FCL Arrow buttons:** `App.controller.onStateChanged` re-routes with the new layout value from the arrow click, preserving the current route name and key.

---

## Intent-Based Navigation

### How It Works

The application detects which FLP tile launched it by inspecting `window.location.hash`:

```javascript
const sHash = (window.location.hash || "").replace(/^#/, "").split("?")[0];
const bIsHistory = sHash === "Deposits-history";
const bIsDisplay = !bIsHistory;
```

An additional environment flag checks the hostname:

```javascript
const bIsSantander = window.location.host.startsWith("santander");
```

These booleans are stored in a **named JSON model** called `"intent"`:

```javascript
new JSONModel({ isDisplay: bIsDisplay, isHistory: bIsHistory, isSantander: bIsSantander })
```

This model is set on the **Component** level so all views and controllers can access it.

### Usage Throughout the Project

| Where | What it controls |
|---|---|
| **DepositsList.view.xml** | Column visibility (`visible="{intent>/isHistory}"`), filter visibility, toolbar buttons |
| **DepositDetail.view.xml** | Section visibility (simulation visible only for `isDisplay`; history details only for `isHistory`) |
| **DepositsList.controller.js** | OData entity path (`/RateGrid` vs `/Deposits`), `$expand` parameters, row template cells, FilterBar persistency key |
| **DepositDetail.controller.js** | Binding path (`/RateGrid('<key>')` vs `/Deposits('<key>')`), `$select` fields, whether to show request form |
| **FilterBar** | `persistencyKey` is set per intent to isolate variant storage |

### Intent Scenarios

| Scenario | `isDisplay` | `isHistory` | `isSantander` | Effect |
|---|---|---|---|---|
| End-user (client) | `true` | `false` | `false` | Rate grid, simulation & request sections visible |
| End-user (Santander host) | `true` | `false` | `true` | Same + Client filter + file upload button |
| Back-office history | `false` | `true` | varies | Deposits list with dates, amounts; detail shows status timeline |

---

## Routing & Navigation Flow

Defined in `manifest.json` under `sap.ui5.routing`:

| Route | Pattern | Targets | Columns Shown |
|---|---|---|---|
| `DepositsList` | `:layout:` | `DepositsList` | Begin (one column) |
| `DepositDetail` | `Deposits/{key}/{layout}` | `DepositsList`, `DepositDetail` | Begin + Mid (two columns) |

**Key points:**
- The `:layout:` optional parameter allows bookmarking with a specific FCL state.
- `DepositDetail` route activates **both** targets — FCL shows list compressed in the begin column and the detail in the mid column.
- `{key}` is the OData entity key (UUID) identifying which rate/deposit to display.

---

## Views

### App.view.xml

Minimal root view containing only the `FlexibleColumnLayout` control. It:
- Binds `layout` to the unnamed JSON model (`{/layout}`).
- Listens for `stateChange` → `App.controller.onStateChanged` for arrow-button handling.

### DepositsList.view.xml

The **begin column** (list/master). Built with:

- **`sap.f.DynamicPage`** — collapsible header with filter area.
- **`SmartVariantManagement`** — variant save/load in the title.
- **`FilterBar`** — multi-combo for Currency, Duration, Client; DateRangeSelection for dates (history only); ValueHelpDialog for Rate ranges.
- **`sap.m.Table`** — the deposits/rate-grid table.
  - Columns are statically defined in XML with `app:p13nKey` custom data.
  - **Row template (`<items>`) is NOT defined in XML** — it is built programmatically via `_buildRowTemplate()` in the controller, because the set of visible cells depends on the detected intent.

### DepositDetail.view.xml

The **mid column** (detail). Built with:

- **`sap.uxap.ObjectPageLayout`** — structured detail view with:
  - Header: deposit title (tenor + currency), rate badge, close button.
  - Header content: duration, currency, dates (history only).
  - **Sections:**
    1. **Simulation** (display mode only): amount input + calculate button + results panel.
    2. **Request Deposit** (display mode only): account selector + amount input + copy-from-simulation.
    3. **Deposit Details** (history mode only): amount, time-to-maturity.
    4. **Deposit Status** (history mode only): timeline of request lifecycle events.
  - **Footer toolbar**: "Request Deposit" button (display mode only), enabled only when account and amount are valid.

### CustomRequestDialog.fragment.xml

A **Dialog fragment** for creating custom (non-standard-tenor) deposits. Loaded on demand via `Fragment.load()`. Contains a `SimpleForm` with a guided workflow:

1. **Step 1**: Select currency (ComboBox).
2. **Step 2**: Auto-computed start date + user-selected maturity date (DatePicker with min/max constraints).
3. **Step 3**: Display interpolated interest rate (read-only).
4. **Step 4**: Select source account (filtered by currency).
5. **Step 5**: Enter amount + calculate expected return.

---

## Models & Data Sources

| Model Name | Type | Source | Purpose |
|---|---|---|---|
| *(unnamed)* | `JSONModel` | Component.js | FCL layout state (`/layout`, `/actionButtonsInfo`) |
| `mainService` | `ODataV4Model` | `/odata/` proxy → CF destination | Primary data: rate grid, deposits, tenors, currencies, clients |
| `i18n` | `ResourceModel` | `i18n/i18n.properties` | Internationalization (EN/ES) |
| `banks` | `JSONModel` | `model/data/Banks.json` | Static bank account list (name, account number, balance, currency) |
| `intent` | `JSONModel` | Created in DepositsList.onInit | Intent flags: `isDisplay`, `isHistory`, `isSantander` |
| `simulation` | `JSONModel` | Created in DepositDetail.onInit | Simulation state: amount, interest, total, currency |
| `request` | `JSONModel` | Created in DepositDetail.onInit | Request form state: account, amount, filtered accounts |
| `customRequest` | `JSONModel` | Created in DepositsList._initCustomRequestModel | Custom request dialog state: currency, dates, rate, account, amount, expected return |

### OData V4 Entities Used

| Entity | Used In | Description |
|---|---|---|
| `/RateGrid` | Display intent (list + detail) | Current interest rates per tenor/currency combination |
| `/Deposits` | History intent (list + detail); also used for POST (creating requests) | Deposit request records with status, dates, amounts |
| `/Client` | Santander environment only | Client entities for filtering |
| `/TenorCodes` | Referenced via navigation | Tenor definitions (1M, 3M, 6M, 12M, CT) |
| `/CurrencyCodes` | Referenced via navigation | Currency definitions (EUR, USD, GBP) |

---

## Formatters

Defined in `webapp/model/formatter.js`. Must be initialized with `Formatter.init(oResourceBundle)` before use.

| Formatter | Purpose |
|---|---|
| `formatValue(value)` | Converts a string to uppercase |
| `formatFloat(fValue)` | Formats a number with grouping and 2 decimals (returns "" for 0/null) |
| `formatCurrency(fAmount, sCurrency)` | Formats amount + appends currency code |
| `formatSuitability(fRate, iDuration)` | Computes a 0.5–5.0 suitability score via logarithmic normalization |
| `dateTimeToDate(sDateTime)` | Converts an ISO datetime string to a date-only display string |
| `formatDepositTitle(sTenorDesc, sCurrencyId)` | Builds localized title: "3 Months in US Dollars" |

---

## Controllers — Detailed Reference

---

### App.controller.js

**Key Responsibility:** Manages the FCL layout state in response to route changes and user interaction with the FCL column navigation arrows. Acts as the "shell" controller coordinating the overall page layout.

#### Functions

| Function | Description |
|---|---|
| `onInit()` | Caches component and router references. Attaches `routeMatched` listener to update layout state whenever a route is activated. |
| `onRouteMatched(oEvent)` | Extracts the route name and `key` parameter from the matched route. Calls `_updateUIElements()` to sync the layout model. Stores `currentRouteName` and `currentDepositKey` for potential arrow-navigation re-routing. |
| `onStateChanged(oEvent)` | Fired by the FCL control when the user clicks a column navigation arrow (expand/collapse). If triggered by a navigation arrow, re-navigates to the current route with the new layout value so the URL stays in sync. |
| `_updateUIElements()` | Fetches the current FCL UI state from the semantic helper (which columns are visible, which action buttons to show) and writes it into the unnamed JSON model. This model is consumed by the close/fullscreen buttons in views. |
| `onExit()` | Lifecycle cleanup — detaches the `routeMatched` listener to prevent memory leaks. |

---

### BaseController.js

**Key Responsibility:** Provides shared utilities inherited by all other controllers. Encapsulates convenience methods for routing, i18n access, locale-aware numeric formatting/parsing, and input validation patterns. No view is directly associated with this controller.

#### Functions

| Function | Description |
|---|---|
| `getRouter()` | Returns the component's router instance via `UIComponent.getRouterFor()`. |
| `getResourceBundle()` | Returns the i18n `ResourceBundle` from the component's `i18n` model. |
| `getModel(sName)` | Shortcut to `this.getView().getModel(sName)`. |
| `setModel(oModel, sName)` | Shortcut to `this.getView().setModel(oModel, sName)`. Returns `this` for chaining. |
| `navTo(sName, oParameters, bReplace)` | Navigates to a named route with parameters. Wrapper around `router.navTo()`. |
| `onNavBack()` | Navigates back via browser history if available; otherwise navigates to the "main" route. |
| `_DURATION_DAYS` | Constant map of tenor codes to day counts (e.g., `"3M" → 90`, `"1W" → 7`). Used for interest calculations and date arithmetic. |
| `_getTenorDays(sTenorCode)` | Looks up a tenor code in `_DURATION_DAYS`. Returns 30 as default fallback. |
| `_getLocale()` | Extracts the two-character language code from the ResourceBundle locale (e.g., `"es"`, `"en"`). |
| `_getLocaleSettings()` | Returns an object `{ decimal, thousand }` with locale-appropriate numeric separators (ES: `","` / `"."`; EN: `"."` / `","`). |
| `_getNumericRegex()` | Returns a regex allowing only digits, commas, dots, and spaces — used to filter input in real-time. |
| `_parseUserInput(sInput)` | Parses a locale-formatted numeric string (e.g., `"10.000.000,25"` in ES) to a JavaScript number. Handles thousand-separator removal and decimal normalization. |
| `_formatNumber(fNumber)` | Formats a JavaScript number to a locale-aware display string with grouping and 2 decimals using `NumberFormat`. |
| `_onAmountInputLiveChange(oEvent)` | Real-time input filter: strips any character not matching the numeric regex as the user types. Shared by all amount inputs across the app. |
| `_getText(sKey, aArgs)` | Convenience wrapper for `getResourceBundle().getText(sKey, aArgs)`. |
| `_onAmountInputChange(oEvent, sModelPath, sDisplayPath, sModelName, fnCallback)` | Generic amount change handler: parses input → validates → stores in model → formats display → triggers optional callback (e.g., validation). Used by simulation, request, and custom-request inputs. |

---

### DepositsList.controller.js

**Key Responsibility:** Manages the primary list view (begin column). Handles:
- **Intent detection** and OData binding selection.
- **FilterBar** with SmartVariantManagement (variant persistence, search execution, filter serialization).
- **Table lifecycle** (row template construction, update events, no-data states).
- **p13n Engine** registration for column personalization (currently disabled but code present).
- **Custom Deposit Request** dialog workflow (open, step navigation, validation, submission).
- **File upload** for bulk rate updates (Santander environment only).

#### Functions — Lifecycle & Init

| Function | Description |
|---|---|
| `onInit()` | Async initialization: caches control references, creates the `customRequest` model, detects intent from URL hash, creates the `intent` model on the Component, configures FilterBar persistence callbacks, registers SmartVariantManagement, sets default sorters, and calls `_bindItemsByIntent()` to bind the table. |
| `onExit()` | Detaches the p13n Engine state change listener. |

#### Functions — FilterBar Persistence

| Function | Description |
|---|---|
| `fetchData()` | Serializes all filter control states into an array of `{groupName, fieldName, fieldData}` objects for variant storage. Handles special cases: Rate tokens are serialized as `{text, range}` objects; DateRangeSelections are stored as ISO strings. |
| `applyData(aData)` | Restores filter control states from a variant's serialized data. Rebuilds Rate tokens from stored range objects, restores date pickers from ISO strings, and sets MultiComboBox selected keys. |
| `getFiltersWithValues()` | Returns an array of `FilterGroupItem`s that currently have a non-empty value. Used by SmartVariantManagement to determine which filters are "active". |

#### Functions — FilterBar Search & Events

| Function | Description |
|---|---|
| `onSelectionChange(oEvent)` | Marks the current variant as modified and fires a filterChange event when any filter control changes. |
| `onSearch()` | Builds OData `Filter` objects from all active filter controls (Duration, Currency, Client, StartDate, MaturityDate, Rate ranges) and applies them to the table binding. Removes the table overlay. |
| `onFilterChange()` | Shows the table overlay (indicating "press Go") unless filters are being cleared programmatically. |
| `onAfterVariantLoad()` | Updates filter labels and shows overlay after a variant is loaded. |
| `onClearFilters()` | Resets all filter controls to empty/default, removes table filters, and updates labels. |
| `onFilterInfoPress()` | Expands the DynamicPage header when the info toolbar is tapped. |
| `onRateValueHelpRequest()` | Opens a `ValueHelpDialog` configured for numeric range conditions on the Rate field. Tokens are stored internally and displayed as text in the filter input. |
| `_updateLabelsAndTable(bShowOverlay)` | Updates expanded/snapped labels with the count of active filters and optionally shows the table overlay. |

#### Functions — Table Events

| Function | Description |
|---|---|
| `onTableUpdateFinished(oEvent)` | Fired after the table binding updates. Reads the total item count, updates the table title, computes a relative "last updated" timestamp, manages no-data illustrated messages, and enables/disables the "New Deposit" button. |

#### Functions — Navigation

| Function | Description |
|---|---|
| `onListItemPress(oEvent)` | Extracts the entity key from the pressed item's binding context path. Asks the FCL helper for the next UI state (level 1 = two columns) and navigates to the `DepositDetail` route with the key and layout. |

#### Functions — p13n Engine (Column Personalization)

| Function | Description |
|---|---|
| `_registerForP13n()` | Registers the table with the p13n Engine for column visibility, sorting, grouping, and column width control. Currently commented out in `onInit`. |
| `onOpenSettings()` | Opens the p13n settings dialog. |
| `onBeforeOpenColumnMenu(oEvent)` | Configures sort/group items in the column menu based on the triggering column. |
| `onSort(oEvent)` | Applies column sort via p13n Engine state. |
| `onGroup(oEvent)` | Applies column grouping via p13n Engine state. |
| `onColumnResize(oEvent)` | Persists column width changes. |
| `onColumnMove(oEvent)` | Handles drag-and-drop column reordering. |
| `onP13nStateChange(oEvent)` | Reacts to p13n state changes by applying column visibility, sorting, and grouping to the table. |
| `_applyColumnsVisual(aColumns)` | Physically reorders and shows/hides columns, then rebuilds the row template to match the new column order. |
| `_getKey(oColumn)` | Extracts the `p13nKey` from a column's custom data. |

#### Functions — Intent-Based Binding

| Function | Description |
|---|---|
| `_bindItemsByIntent()` | Core async function that: (1) Probes OData access with a temporary binding to catch auth errors. (2) Binds the table to `/RateGrid` (display) or `/Deposits` (history) with appropriate `$expand`, `$orderby`, and `$filter` parameters. (3) Builds the matching row template. (4) In Santander environments, binds the Client filter's items to `/Client`. (5) Handles errors by showing an illustrated "no entries" message. |
| `_buildRowTemplate(aColumnKeys)` | Factory function that creates a `ColumnListItem` with cells matching the given column key array. Each key maps to a specific control type (e.g., `"currency_col"` → `MText` with currency description, `"rate_col"` → `ObjectNumber` with % unit). The template has `type: "Navigation"` and press handler wired to `onListItemPress`. |

#### Functions — Custom Deposit Request Dialog

| Function | Description |
|---|---|
| `_initCustomRequestModel()` | Creates the `customRequest` JSONModel with default values for the dialog workflow. |
| `onOpenCustomReq()` | Loads the `CustomRequestDialog` fragment, adds as dependent, resets model, and opens the dialog. |
| `_resetCustomRequestModel()` | Resets model to initial state. Computes start date (today or tomorrow based on 17:00 cutoff using Temporal API). Configures DatePicker min/max (7 days to 1 year from start). |
| `onStep1CurrencyChanged(oEvent)` | Saves selected currency, enables Step 2, resets all subsequent steps. |
| `onStep2DateToChanged(oEvent)` | Calculates tenor in days from date range, triggers async rate interpolation, filters accounts by currency, enables Step 4. |
| `_convertDateRangeToDays(oDateFrom, oDateTo)` | Computes days between two dates using Temporal API (with Date fallback). |
| `_interpolateRate(fTenorDays, sCurrency)` | Performs linear interpolation between the nearest lower and upper rate-grid entries for the given tenor/currency. Updates model with interpolated rate. |
| `_getDepositsByTenorAndCurrency(fTenorDays, sCurrency)` | Fetches all rate-grid entries via a temporary filter-free OData binding, finds the bounding tenor entries for interpolation. |
| `_filterAccountsByCurrency()` | Reads the `banks` model, filters accounts matching the selected currency, writes filtered list to `customRequest>/accountsFiltered`. |
| `onStep4AccountChanged(oEvent)` | Saves selected account, resets amount, enables Step 5. |
| `_getCustomRequestSelectedAccountBalance()` | Retrieves the `saldoInfoCent` of the selected account from the filtered accounts array. |
| `_validateCustomRequestAmount()` | Validates amount: must be finite, positive, ≥ 10,000,000, and ≤ selected account balance. Returns validation result object. |
| `_applyCustomRequestAmountValidation(oInput, oResult)` | Sets ValueState on the amount input based on validation result. Clears expected calculations on failure. |
| `onCustomReqAmountInputLiveChange(oEvent)` | Filters invalid characters in real-time (delegates to `_onAmountInputLiveChange`). |
| `onCustomReqAmountInputChange(oEvent)` | Parses, formats, and stores amount (delegates to `_onAmountInputChange` with custom request model paths). |
| `onStep5AmountValidate()` | Re-validates current amount and applies result to UI. |
| `onStep5Calculate()` | Validates amount, then calculates: `Interest = Amount × (Rate/100) × (Months/12)`. Writes `expectedReturn` and `expectedTotal` to model. |
| `onCancelCustomRequest()` | Closes and destroys the dialog, resets the model. |
| `onSubmitCustomRequest()` | Final validation → confirmation MessageBox → OData POST to `/Deposits` with computed payload (amount, currency, tenor="CT", rate, dates, status=1) → success toast. |
| `_dateToPlainDate(oDate)` | Converts JavaScript `Date` to `Temporal.PlainDate`. |
| `_plainDateToDate(oPlainDate)` | Converts `Temporal.PlainDate` to JavaScript `Date` (local midnight). |

#### Functions — File Upload

| Function | Description |
|---|---|
| `handleUploadPress()` | Reads a file from the FileUploader, converts to Base64, sends to the OData action `/postFixTermDeposits(...)` as a parameter. Shows success/error toast. Used for bulk rate updates in Santander environments. |

---

### DepositDetail.controller.js

**Key Responsibility:** Manages the detail view (mid column). Handles:
- **Binding** to the selected rate/deposit based on route parameters and intent.
- **Investment simulation** (calculate interest for a given amount).
- **Deposit request submission** with account selection, validation, and OData POST.
- **Copying** simulation results to the request form.

#### Functions — Lifecycle

| Function | Description |
|---|---|
| `onInit()` | Caches component/router references, initializes `Formatter`, creates `simulation` and `request` JSONModels, attaches `patternMatched` listener on the `DepositDetail` route. |
| `onExit()` | Detaches the `patternMatched` listener to prevent memory leaks. |

#### Functions — Route Handling

| Function | Description |
|---|---|
| `_onDepositMatched(oEvent)` | Extracts the entity `key` from route arguments. Resets simulation and request models. Determines OData path based on intent (`/RateGrid('<key>')` or `/Deposits('<key>')`). Binds the view element with appropriate `$select` and `$expand`. If in display mode, filters accounts by currency. |

#### Functions — Simulation

| Function | Description |
|---|---|
| `onSimulate()` | Validates amount ≥ 10,000,000. Reads rate and tenor from binding context. Calculates: `Interest = Amount × (Rate/100) × (Days/360)`. Sets results in `simulation` model. |
| `_resetSimulation()` | Clears the simulation model and input ValueState. |
| `_validateSimulationAmount()` | Checks simulation amount against minimum threshold. Sets ValueState error if invalid. |
| `onSimAmountInputLiveChange(oEvent)` | Filters invalid characters during typing (delegates to base). |
| `onSimAmountInputChange(oEvent)` | Parses/formats amount, stores in `simulation` model, triggers validation. |

#### Functions — Deposit Request

| Function | Description |
|---|---|
| `_resetRequest()` | Clears the request model and input ValueState. |
| `_getRequestSelectedAccountBalance()` | Finds the selected account in `request>/cuentasFiltradas` and returns its balance. |
| `_validateRequestAmount()` | Multi-check validation: account selected, amount positive, ≥ 10M, ≤ account balance. Returns validation result object. |
| `_clearRequestAmountValidation()` | Clears ValueState on the request amount input. |
| `_applyRequestAmountValidation(oResult)` | Applies validation result to the input control's ValueState. |
| `onRequestAmountChange()` | Triggers request amount validation. |
| `onReqAmountInputLiveChange(oEvent)` | Filters invalid characters during typing. |
| `onReqAmountInputChange(oEvent)` | Parses/formats amount, stores in `request` model, triggers validation. |
| `onRequestAccountChange(oEvent)` | Updates `request>/cuentaOrigen` with selected account. If deselected, clears amount and validation. If selected, re-validates current amount. |
| `_filterAccountsByCurrency()` | Reads currency from binding context, filters `banks` model accounts by currency, updates `request>/cuentasFiltradas`. |
| `onRequestDeposit()` | Full submission flow: validate account + amount → build confirmation message → `MessageBox.confirm` → on YES: compute start/maturity dates (Temporal API) → OData POST to `/Deposits` with payload → success toast. |
| `onCopySimulation()` | Copies `simulation>/amount` to `request>/importeSolicitud`, formats display, triggers validation. Enables quick flow from simulation to request. |

#### Functions — Navigation

| Function | Description |
|---|---|
| `handleClose()` | Reads the "close mid column" layout from the model (set by FCL helper) and navigates back to `DepositsList` route with that layout. |

---

## Custom Request Dialog

The Custom Request Dialog provides a guided workflow for creating deposits with **non-standard tenors** (any maturity date between 7 days and 1 year). It is managed entirely by `DepositsList.controller.js` and uses the `customRequest` JSON model.

### Workflow

```
Step 1: Select Currency → unlocks Step 2
Step 2: Pick Maturity Date → auto-computes tenor days → async interpolates rate → filters accounts → unlocks Step 4
Step 3: Display interpolated rate (read-only)
Step 4: Select Source Account → unlocks Step 5
Step 5: Enter Amount → Calculate → shows expected return/total
Submit: Validation → Confirm dialog → OData POST
```

### Rate Interpolation Logic

When the user picks a custom maturity date:
1. The app calculates the tenor in days.
2. It fetches all rate-grid entries for the selected currency.
3. Finds the nearest **lower** and **upper** tenor entries (e.g., for 45 days: lower = 1M/30 days, upper = 2M/60 days).
4. Applies **linear interpolation**: `Rate = RateLower + (RateUpper - RateLower) × (TargetDays - LowerDays) / (UpperDays - LowerDays)`.

---

## FilterBar & SmartVariantManagement

### Architecture

- **SmartVariantManagement** (SVM) provides variant save/load functionality.
- **FilterBar** manages the filter controls and provides search/clear events.
- SVM is linked to the FilterBar via `PersonalizableInfo` — this enables per-intent variant isolation by setting different `persistencyKey` values (`DepositsDisplayFilterBar` / `DepositsHistoryFilterBar`).

### Custom Persistence Callbacks

Because the FilterBar contains non-standard controls (date ranges, value-help tokens), the app implements three custom callbacks:

1. **`fetchData()`** — Serializes: MCB selected keys, DateRangeSelection ISO strings, Rate tokens with range data.
2. **`applyData(aData)`** — Restores: MCB selections, date ranges, rebuilds Token objects.
3. **`getFiltersWithValues()`** — Determines which filters are "active" for the filter summary label.

### Filter Controls by Intent

| Filter | Display | History | Santander |
|---|---|---|---|
| Currency (MCB) | ✓ | ✓ | ✓ |
| Duration (MCB) | ✓ | ✓ | ✓ |
| Rate (ValueHelp) | ✓ | ✓ | ✓ |
| Start Date (DateRange) | ✗ | ✓ | ✓ |
| Maturity Date (DateRange) | ✗ | ✓ | ✓ |
| Client (MCB) | ✗ | ✗ | ✓ |

---

## OData V4 Patterns

### Probe-Before-Bind

Because OData V4 failures are asynchronous and cannot be caught by `try/catch` around `bindItems()`, the app uses a **probe pattern**:

```javascript
const oProbe = oMainModel.bindList("/RateGrid", null, null, null);
try {
    await oProbe.requestContexts(0, 1);  // Will throw on 401/403
} finally {
    oProbe.destroy();
}
// Safe to bind the real table now
this.oTable.bindItems({ ... });
```

This catches authorization errors before the real binding is established, allowing the app to show a user-friendly error message.

### Creating Records (POST)

```javascript
await oModel.bindList("/Deposits").create(oPayload);
```

Uses the OData V4 list binding's `.create()` method for POST operations.

### Action Calls

```javascript
let oContext = this.getView().getModel("mainService").bindContext("/postFixTermDeposits(...)");
oContext.setParameter("parameters", oToSend);
oContext.execute();
```

Used for the file upload action (unbound OData action).

---

## Build & Deployment

```bash
npm start             # Dev server (no mock) → http://localhost:8080/index.html
npm run start-mock    # Dev server with mock data (ui5-mock.yaml)
npm run lint          # ESLint
```

### MTA Deployment

Two tenant targets exist:
- **BackOffice (`bo`)**: `npm run build:mta:bo`
- **CLI (`cli`)**: `npm run build:mta:cli`

These scripts swap the OData destination name (`Deposits_Destination`) using `sed` before building the MTA archive.

### OData Proxy

Local development proxies `/odata` to the CF destination `Deposits_Destination` (configured in `ui5.yaml`).

---

## Summary of Key Data Flows

```
┌─────────────────────────────────────────────────────────────────┐
│ FLP Tile Click                                                  │
│   ↓                                                             │
│ Component.init() → Router.initialize() → _onBeforeRouteMatched  │
│   ↓                                                             │
│ DepositsList.onInit() → Detect intent → Create intent model     │
│   ↓                                                             │
│ _bindItemsByIntent() → Probe OData → Bind table to entity       │
│   ↓                                                             │
│ User clicks row → onListItemPress → FCL helper → navTo detail   │
│   ↓                                                             │
│ DepositDetail._onDepositMatched → Bind element → Show detail    │
│   ↓                                                             │
│ User simulates / requests → Validation → OData POST             │
└─────────────────────────────────────────────────────────────────┘
```
