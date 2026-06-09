---
description: "Implement the ConsultaSaldos tab1 fragment: DynamicPage with VizFrame column chart header and Empresas list content"
agent: "agent"
---

Implement the ConsultaSaldos feature for `tab1` of the Treasury view in the cashpool SAPUI5 app (`cashpool.app.cashpool`). Follow each step below exactly.

## Context

- App module path: `cashpool/app/cashpool`
- View under: `cashpool/webapp/view/Treasury.view.xml`
- Controller: `cashpool/webapp/controller/Treasury.controller.js`
- Existing fragments use `Fragment.load()` (dialogs); this fragment is **embedded** — use declarative `<core:Fragment>` in the view
- `sap.viz` is not yet in `manifest.json`
- No JSON mock data files exist — all mock data is currently inline in the controller

## Step 1 — Create `webapp/model/empresas.json`

Create a JSON file at `cashpool/webapp/model/empresas.json` with exactly 10 empresa objects. Each object must have:
- `razonSocial` — realistic Spanish company name
- `cif` — valid Spanish CIF format (e.g. `A28345671`)
- `balance` — numeric value (varying amounts, representing EUR balances)
- `currency` — always `"EUR"`

Wrap the array under a root key `"empresas"`: `{ "empresas": [ ... ] }`

## Step 2 — Create `webapp/view/fragments/ConsultaSaldos.fragment.xml`

Create `cashpool/webapp/view/fragments/ConsultaSaldos.fragment.xml` as a `<core:FragmentDefinition>`.

Required XML namespaces on the root element:
- `xmlns="sap.m"`
- `xmlns:core="sap.ui.core"`
- `xmlns:f="sap.f"`
- `xmlns:viz="sap.viz.ui5.controls"`
- `xmlns:viz.data="sap.viz.ui5.data"`
- `xmlns:viz.feeds="sap.viz.ui5.controls.common.feeds"`

Structure inside the FragmentDefinition:
- `<f:DynamicPage fitContent="true">`
  - `<f:title>` → `DynamicPageTitle` → heading: `Title text="Consulta de Saldos"`
  - `<f:header>` → `DynamicPageHeader pinnable="true"` → `viz:VizFrame vizType="column" width="100%" height="250px"` bound to `{empresas>/empresas}` via `FlattenedDataset` containing:
    - One `DimensionDefinition` (name/value `razonSocial`)
    - One `MeasureDefinition` (name/value `balance`)
    - `FeedItem uid="categoryAxis" type="Dimension" values="razonSocial"`
    - `FeedItem uid="valueAxis" type="Measure" values="balance"`
  - `<f:content>` → `List headerText="Empresas" items="{empresas>/empresas}"` → `CustomListItem` → `HBox justifyContent="SpaceBetween"`:
    - Left `VBox` (class `sapUiSmallMarginBegin sapUiSmallMarginTopBottom`): `Title text="{razonSocial}"`, `Label text="CIF: {cif}"`
    - Right `VBox` (class `sapUiSmallMarginEnd sapUiSmallMarginTopBottom`): `Label text="Total Balance"`, `ObjectNumber` with Currency type binding
  - No `<f:footer>`

For the `ObjectNumber` currency binding (the fragment inherits the view's `core:require` — do **not** redeclare it):
```xml
<ObjectNumber
    number="{parts: ['balance', 'currency'], type: 'Currency'}"
    unit="{currency}"/>
```

> `DynamicPageHeader` content is naturally hidden on collapse — no extra visibility binding needed on the VizFrame.

## Step 3 — Modify `webapp/view/Treasury.view.xml`

In the `tab1` `IconTabFilter`, replace:
```xml
<m:VBox class="sapUiSmallMargin">
    <m:Text text="{i18n>placeholderSaldos}" />
</m:VBox>
```
with:
```xml
<core:Fragment fragmentName="cashpool.app.cashpool.view.fragments.ConsultaSaldos" type="XML"/>
```

## Step 4 — Modify `webapp/controller/Treasury.controller.js`

In `onInit()`, after `this.getView().setModel(oViewModel, "view")`, add:
```js
const oEmpresasModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/empresas.json"));
this.getView().setModel(oEmpresasModel, "empresas");
```
No new event handler methods are needed.

## Step 5 — Modify `webapp/manifest.json`

In `sap.ui5.dependencies.libs`, add:
```json
"sap.viz": {}
```

## Verification

After implementation, confirm:
1. `empresas.json` exists at `webapp/model/` with 10 items under the `empresas` key
2. `ConsultaSaldos.fragment.xml` is valid XML with all required namespaces
3. `tab1` in Treasury.view.xml uses `<core:Fragment>` instead of the placeholder VBox
4. `onInit()` sets the `"empresas"` model on the view after the `"view"` model
5. `manifest.json` includes `"sap.viz": {}` in libs
