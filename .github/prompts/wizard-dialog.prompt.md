---
description: "Implement the WizardDialog fragment and controller logic for the automatic transfers configuration wizard"
agent: "agent"
---

## Task: Implement the Automatic Transfers Configuration Wizard

### Context

The app already has a `ConfigurationDialog` fragment at [webapp/view/fragments/ConfigurationDialog.fragment.xml](../../webapp/view/fragments/ConfigurationDialog.fragment.xml) that is opened via `onAfterRendering` in [webapp/controller/Treasury.controller.js](../../webapp/controller/Treasury.controller.js).

When the user presses the emphasized button ("Configurar Ahora") in that dialog, `onConfigureNow` is called. This should:
1. Close the `ConfigurationDialog`
2. Open a new, larger `WizardDialog`

### Files to Create

- `webapp/view/fragments/WizardDialog.fragment.xml` — the Wizard dialog fragment
- Add i18n keys to both `webapp/i18n/i18n.properties` (Spanish) and `webapp/i18n/i18n_en.properties` (English)

### Files to Modify

- `webapp/controller/Treasury.controller.js` — add fragment loading and all event handlers
- `webapp/manifest.json` — add `sap.ui.table` to `sap.ui5/dependencies/libs` if not present

---

### Fragment Spec: `WizardDialog.fragment.xml`

**Dialog properties**: `contentWidth="1050px"`, `contentHeight="640px"`, title from i18n, `afterClose=".onWizardDialogAfterClose"`.

**Namespaces required**: `xmlns="sap.m"`, `xmlns:core="sap.ui.core"`, `xmlns:l="sap.ui.layout"`, `xmlns:t="sap.ui.table"`

**Wizard**: `renderMode="Page"`, `width="100%"`, contains 6 `WizardStep` children.

#### Step 1 — "Empresa"
- `title` from i18n key `wizardStep1Title`, `icon="sap-icon://building"`
- `SearchField` (full width, `liveChange=".onEmpresaSearch"`, `search=".onEmpresaSearch"`)
- `sap.m.Table` id=`empresaTable`, bound to `wizard>/empresas`, `mode="SingleSelectLeft"`
- Two columns: **Razón Social** (`colRazonSocial`) and **CNPJ** (`colCNPJ`)
- `ColumnListItem type="Active"` with cells bound to `{wizard>razonSocial}` and `{wizard>cnpj}`

#### Step 2 — "Cuentas"
- `title` from i18n key `wizardStep2Title`, `icon="sap-icon://money-bills"`
- `SearchField` (`liveChange=".onCuentasSearch"`, `search=".onCuentasSearch"`)
- `sap.ui.table.TreeTable` id=`cuentasTreeTable`
  - `rows` bound to `{path: 'wizard>/bancos', parameters: {arrayNames: ['cuentas']}}`
  - `selectionMode="MultiToggle"`, `visibleRowCount="8"`, `enableSelectAll="false"`
  - Three columns: **Nombre** (`colNombre`), **Oficina** (`colOficina`), **Cuenta Corriente** (`colCuentaCorriente`)
  - Bound to `{wizard>nombre}`, `{wizard>oficina}`, `{wizard>cuentaCorriente}`

#### Step 3 — "Cuenta Centralizadora"
- `title` from i18n key `wizardStep3Title`, `icon="sap-icon://target-group"`
- `SearchField` (`liveChange=".onCuentaCentralSearch"`, `search=".onCuentaCentralSearch"`)
- `sap.m.Table` id=`cuentaCentralTable`, bound to `wizard>/cuentasCentralizadoras`, `mode="SingleSelectLeft"`
- Same three columns as Step 2

#### Step 4 — "Configuración"
- `title` from i18n key `wizardStep4Title`, `icon="sap-icon://settings"`
- **Question 1** (`wizardQuestion1`): `RadioButtonGroup` id=`horarioGroup`, `columns="1"`, `selectedIndex="{wizard>/selectedHorario}"`, 3 `RadioButton` options via i18n keys `wizardHorario1`, `wizardHorario2`, `wizardHorario3`
- **Question 2** (`wizardQuestion2`): 7 `CheckBox` controls, one per weekday, bound to `wizard>/dias/<day>`, labeled via `weekdayLunes`…`weekdayDomingo`

#### Step 5 — Placeholder
- `title` from `wizardStep5Title`, `icon="sap-icon://puzzle"`
- Centered `IllustratedMessage` `illustrationType="NoData"`, `enableDefaultTitleAndDescription="false"`, title/desc from `wizardStep5PlaceholderTitle` / `wizardStep5PlaceholderDesc`

#### Step 6 — Revisión (Review)
- `title` from `wizardStep6Title`, `icon="sap-icon://checklist"`, `activate=".onReviewStepActivate"`
- `l:SimpleForm` read-only, `layout="ResponsiveGridLayout"`
- Sections via `core:Title`: **Empresa** (razonSocial, cnpj), **Cuenta Centralizadora** (cuentaCentralNombre, cuentaCentralCuenta), **Configuración** (horario, dias)
- All values bound from `wizard>/review/...`

**Footer**: `wizardAcceptBtn` (Emphasized) → `.onWizardAccept`, `wizardCancelBtn` → `.onWizardCancel`

---

### Controller Changes (`Treasury.controller.js`)

#### `onConfigureNow()` — replace existing placeholder
1. Close `_configDialog`
2. Load `WizardDialog` fragment if not yet loaded (`_wizardDialog`), add as dependent, open it
3. Initialize wizard `JSONModel` with mock data (see below) and set as `"wizard"` on the view
4. Reset wizard to step 1 via `this.byId("configWizard").setCurrentStep(this.byId("wizardStep1"))`

#### New handlers to add:

| Handler | Behavior |
|---|---|
| `onWizardCancel()` | Close `_wizardDialog`, reset wizard to step 1 |
| `onWizardAccept()` | Collect selections, show MessageToast summary, close dialog |
| `onWizardDialogAfterClose()` | Cleanup hook |
| `onReviewStepActivate()` | Read selected empresa, cuenta central, horario and dias from model; write into `wizard>/review/` |
| `onEmpresaSearch(oEvent)` | Filter `wizard>/empresas` array by `razonSocial` and `cnpj`; use `oEvent.getParameter("query") \|\| oEvent.getParameter("newValue")` |
| `onCuentasSearch(oEvent)` | Client-side filter on the `wizard>/bancos` tree structure by `nombre` |
| `onCuentaCentralSearch(oEvent)` | Filter `wizard>/cuentasCentralizadoras` by `nombre`, `oficina`, `cuentaCorriente` |

#### Mock data for wizard `JSONModel`:

```json
{
  "selectedHorario": 0,
  "dias": { "lunes": false, "martes": false, "miercoles": false, "jueves": false, "viernes": false, "sabado": false, "domingo": false },
  "empresas": [
    { "razonSocial": "Empresa Alpha S.A.", "cnpj": "12.345.678/0001-90" },
    { "razonSocial": "Beta Corporación Ltda.", "cnpj": "98.765.432/0001-11" },
    { "razonSocial": "Gamma Holding S.A.", "cnpj": "11.222.333/0001-44" },
    { "razonSocial": "Delta Inversiones S.A.", "cnpj": "55.666.777/0001-22" }
  ],
  "bancos": [
    { "nombre": "Banco Nacional", "cuentas": [
        { "nombre": "Cuenta Operativa", "oficina": "001", "cuentaCorriente": "0001-1" },
        { "nombre": "Cuenta Nómina", "oficina": "001", "cuentaCorriente": "0001-2" }
    ]},
    { "nombre": "Banco Mercantil", "cuentas": [
        { "nombre": "Cuenta Principal", "oficina": "042", "cuentaCorriente": "1234-5" }
    ]}
  ],
  "cuentasCentralizadoras": [
    { "nombre": "Cuenta Maestra", "oficina": "001", "cuentaCorriente": "9999-0" },
    { "nombre": "Cuenta Central EUR", "oficina": "002", "cuentaCorriente": "8888-1" }
  ],
  "review": { "razonSocial": "", "cnpj": "", "cuentaCentralNombre": "", "cuentaCentralCuenta": "", "horario": "", "dias": "" }
}
```

----
### i18n keys to add
| Key | Spanish | English
|---|---|---|
wizardDialogTitle | Configurar Transferencias Automáticas | Configure Automatic Transfers
wizardStep1Title | Empresa | Company
wizardStep2Title | Cuentas | Accounts
wizardStep3Title | Cuenta Centralizadora | Centralizing Account
wizardStep4Title | Configuración | Configuration
wizardStep5Title | Adicional | Additional
wizardStep6Title | Revisión | Review
wizardSearchPlaceholder | Buscar... | Search...
colRazonSocial | Razón Social | Company Name
colCNPJ | CNPJ | CNPJ
colNombre | Nombre | Name
colOficina | Oficina | Branch
colCuentaCorriente | Cuenta Corriente | Current Account
wizardQuestion1 | ¿En qué horario se deben realizar estas transferencias? | At what time should these transfers be executed?
wizardQuestion1Short | Horario | Schedule
wizardHorario1 | Al inicio del día hábil (08:00 hs) | At the start of the business day (08:00)
wizardHorario2 | A mediodía (12:00 hs) | At midday (12:00)
wizardHorario3 | Al cierre del día hábil (18:00 hs) | At the end of the business day (18:00)
wizardQuestion2 | ¿Qué días de la semana deben realizarse estas transferencias? | On which days of the week should these transfers be made?
wizardQuestion2Short | Días | Days
weekdayLunes | Lunes | Monday
weekdayMartes | Martes | Tuesday
weekdayMiercoles | Miércoles | Wednesday
weekdayJueves | Jueves | Thursday
weekdayViernes | Viernes | Friday
weekdaySabado | Sábado | Saturday
weekdayDomingo | Domingo | Sunday
wizardStep5PlaceholderTitle | Próximamente | Coming Soon
wizardStep5PlaceholderDesc | Este paso estará disponible en una versión futura | This step will be available in a future release
wizardAcceptBtn | Aceptar | Accept
wizardCancelBtn | Cancelar | Cancel

---
### Lint Compliance Notes
- All event handlers in the fragment must use the leading dot notation (e.g. .onWizardAccept)
- Do NOT use global sap.* references in the controller — import all modules via sap.ui.define
- The wizard model must be named "wizard" and set via this.getView().setModel(oModel, "wizard")