# CashPool Treasury Application - Development Guide

## Table of Contents

1. [Application Overview](#application-overview)
2. [Architecture and Structure](#architecture-and-structure)
3. [Views and UI Components](#views-and-ui-components)
4. [Data Models](#data-models)
5. [Controllers and Functions](#controllers-and-functions)
6. [Backend Services and OData Integration](#backend-services-and-odata-integration)
7. [Wizard Dialogs](#wizard-dialogs)
8. [Fragments](#fragments)
9. [Utilities](#utilities)
10. [State Management](#state-management)
11. [Key Workflows](#key-workflows)

---

## Application Overview

The **CashPool Treasury Application** is a SAPUI5-based financial management system designed to manage cash pool operations, particularly focused on:

- **Viewing company balance information** across multiple banks and currencies
- **Managing automatic transfer configurations** for different companies
- **Viewing transfer history** (manual and automatic transfers)
- **Creating single-time manual transfers** between bank accounts
- **Consulting transfer configurations** for active automatic transfers

### Key Features

- **Balance Consultation Tab**: Displays current balances for EUR currency companies from the OData backend
- **Manual Transfer History Tab**: Shows completed manual transfers with filtering and search capabilities
- **Automatic Transfer History Tab**: Displays automatic transfer history with the ability to activate/deactivate configurations
- **Configuration Wizard**: Allows users to configure automatic transfers with support for:
  - Company selection
  - Account selection across multiple banks
  - Centralized account selection
  - Custom schedules (single, by bank, or by account)
  - Custom balance rules
  - Configuration review before saving
- **Transfer Wizard**: Enables one-time manual transfers with validation and review steps

### Technology Stack

- **Framework**: SAPUI5 (version 1.145.0+)
- **Model**: OData v4.0 for backend data, JSON models for UI state
- **Routing**: Single route with dynamic page navigation
- **UI Components**: sap.m (Mobile Library), sap.f (Fiori Elements), sap.viz (Visualization)
- **Internationalization**: i18n properties files (English, Spanish, Portuguese)

---

## Architecture and Structure

### Application Structure

```
cashpool/
├── webapp/
│   ├── Component.js                 # Application entry point
│   ├── index.html                   # HTML bootstrap
│   ├── manifest.json                # App configuration and metadata
│   ├── controller/
│   │   ├── App.controller.js         # Root controller
│   │   └── Treasury.controller.js    # Main business logic controller
│   ├── view/
│   │   ├── App.view.xml             # Root view with shell
│   │   ├── Treasury.view.xml        # Main Treasury view
│   │   └── fragments/
│   │       ├── ConfigurationDialog.fragment.xml
│   │       ├── ConsultaSaldos.fragment.xml
│   │       ├── WizardDialog.fragment.xml
│   │       └── WizardTransferDialog.fragment.xml
│   ├── model/
│   │   ├── models.js                # Model factories
│   │   ├── treasuryView.json        # UI state template
│   │   ├── wizardData.json          # Wizard template data
│   │   ├── wizardTransferData.json  # Transfer wizard template data
│   │   ├── empresas.json            # Companies data
│   │   └── formatter.js             # Data formatting utilities
│   ├── utils/
│   │   └── Formatter.js             # Formatting functions
│   ├── i18n/
│   │   ├── i18n.properties          # Default translations
│   │   ├── i18n_en.properties       # English translations
│   │   └── i18n_es.properties       # Spanish translations
│   └── css/
│       └── style.css                # Custom styling
```

### Model Architecture

The application uses a multi-model approach:

1. **OData Model (Cashpool)**: Connects to backend services for:
   - `getBalanceOfCompanies()` - Retrieves company balances
   - `postSelectCompany()` - Selects a company context
   - `Banks` - Lists banks for selected company
   - `AccountBalance` - Account details within banks
   - `BankTransferHistory` - Transfer history records
   - `postBankTransfer()` - Submits new transfers

2. **i18n Model**: Resource bundle for multi-language support

3. **View Model (JSON)**: Controls UI state such as:
   - Selected tab
   - Transfer history data
   - Filter states
   - Configuration data

4. **Wizard Models (JSON)**: Temporary models for wizard workflows:
   - `wizard` - Configuration wizard state
   - `wizardTransfer` - Transfer wizard state

5. **Empresas Model (JSON)**: Shared company data across wizards

---

## Views and UI Components

### App.view.xml

**Purpose**: Root container view for the application

**Structure**:
- Contains a single `App` control (mobile shell) with `id="app"`
- Uses a placeholder for pages controlled by routing

### Treasury.view.xml

**Purpose**: Main application view displaying the treasury dashboard

**Key Components**:

1. **Dynamic Page Header**
   - Title: "Treasury Management"
   - Action Buttons:
     - "Configure Now" - Opens configuration wizard (gear icon)
     - "Manual Transfer" - Opens one-time transfer wizard (payment icon)

2. **Icon Tab Bar** (Main Navigation)
   - Tab 1: "Consult Balances" (tab1)
     - Fragment: `ConsultaSaldos`
     - Shows current balance visualization
   
   - Tab 2: "Manual Transfers" (MANUAL)
     - Fragment-based expandable transfer history
     - Grouped by company (Reason Social + CIF)
     - Includes date range and status filtering
   
   - Tab 3: "Automatic Transfers" (AUTO)
     - Similar structure to manual transfers
     - Includes activation switch for configurations
     - Shows scheduled transfer information

**Key Bindings**:
- `{view>/selectedTab}` - Controls active tab
- `{view>/transferenciasAgrupadasManual}` - Manual transfer list
- `{view>/transferenciasAgrupadasAuto}` - Automatic transfer list
- `{view>/statusOptions}` - Status filter options

### ConsultaSaldos.fragment.xml

**Purpose**: Display company balance information

**Components**:
- **Visualization Chart (VizFrame)**: Horizontal bar chart showing balance by company
- **Balance List**: Table displaying detailed balance information
- Uses `{saldos>}` model for data binding

---

## Data Models

### treasuryView.json (View Model)

```json
{
  "selectedTab": "tab1",
  "tabs": [...],
  "transferenciasAgrupadasManual": [],
  "transferenciasAgrupadasAuto": [],
  "_transferenciasAgrupadasManualAll": [],  // Unfiltered copy
  "_transferenciasAgrupadasAutoAll": []     // Unfiltered copy
}
```

**State Properties**:
- `selectedTab` - Current active tab key
- `transferencias*` - Array of transfer groups organized by company
- Underscore-prefixed arrays - Maintain original data for filtering

### wizardData.json (Configuration Wizard)

```json
{
  "empresas": [],
  "bancos": [],
  "cuentasCentralizadoras": [],
  "horariosUnicos": [...],
  "horarioUnico": "",
  "horariosPersonalizadosPorBanco": [],
  "horariosPersonalizadosPorCuenta": [],
  "dias": { "lunes": false, "martes": false, ... },
  "selectedSaldoType": 0,
  "saldosPersonalizadosPorBanco": [],
  "saldosPersonalizadosPorCuenta": [],
  "review": {...},
  "nav": { "backVisible": false, ... }
}
```

### wizardTransferData.json (Transfer Wizard)

Similar structure to wizard data but specific to one-time transfers:
- `transferAmount` - Amount to transfer
- `review` - Fields for transfer review

### saldos Model (JSON)

Contains company balance data retrieved from OData:
```javascript
[
  {
    CompanyCode: "0001",
    CompanyName: "Company A",
    VatNumber: "12345678A",
    Currency: "EUR",
    StatementAmount: 1000000,
    ...
  }
]
```

---

## Controllers and Functions

### App.controller.js

**Extends**: `sap.ui.core.mvc.Controller`

**Functions**:

#### `onInit()`
- **Purpose**: Initialize the root controller
- **Actions**: Currently empty (no initialization needed)
- **Called**: Automatically when app loads

---

### Treasury.controller.js

**Extends**: `sap.ui.core.mvc.Controller`

**Key Private Variables**:
- `_oResourceBundle` - Cached i18n resource bundle
- `_aEmpresasAll` - Source of truth for company data
- `_mActiveCompanyRequestKeys` - Tracks active company load requests
- `_wizardDialog` - Configuration wizard dialog instance
- `_transferWizardDialog` - Transfer wizard dialog instance
- `_iCurrentStepIndex` - Current wizard step index
- `_iTransferCurrentStepIndex` - Current transfer wizard step index
- `_wizardConfigs` - Configuration maps for both wizards
- `_oLocalizedFloatFormatter` - Number formatter for localized input

#### **Initialization & Setup**

##### `onInit()`
- **Purpose**: Initialize the Treasury controller and load all models
- **Actions**:
  1. Loads i18n resource bundle
  2. Creates and sets view model from treasuryView.json
  3. Creates and sets empresas model
  4. Fetches balance data from OData `getBalanceOfCompanies()`
  5. Filters data for EUR currency only
  6. Creates independent saldos and empresas models
  7. Configures chart visualization properties
  8. Sets up error handling with busy indicators
- **Models Used**: Cashpool (OData), view (JSON), saldos (JSON), empresas (JSON)
- **Error Handling**: Shows toast message if balance data fails to load

#### **Tab Navigation**

##### `onTabSelect(oEvent)`
- **Purpose**: Handle tab selection events
- **Parameters**:
  - `oEvent` - Select event with `selectedKey` parameter
- **Actions**:
  1. Updates view model selected tab
  2. Lazy-loads transfer history for MANUAL or AUTO tabs
  3. Calls `_loadTransferHistoryData()` only when needed
- **Performance**: Only loads transfer data when tab becomes active

#### **Transfer History Loading**

##### `_loadTransferHistoryData(sType)`
- **Purpose**: Load transfer history for specified type (MANUAL or AUTO)
- **Parameters**:
  - `sType` - Transfer type: "MANUAL" or "AUTO"
- **Actions**:
  1. Shows busy indicator on icon tab bar
  2. Fetches transfer data from backend
  3. Maps and groups transfers
  4. Updates view model with results
  5. Handles errors gracefully
- **Returns**: Promise handling

##### `_fetchTransferHistoryByType(sType)`
- **Purpose**: Retrieve transfer history from OData backend
- **Parameters**:
  - `sType` - Transfer type for filtering
- **OData Call**: `bindList("/BankTransferHistory")` with type filter
- **Returns**: Promise resolving to array of transfer items

##### `_mapTransferHistoryItem(oItem, sType)`
- **Purpose**: Transform OData transfer record to UI model structure
- **Parameters**:
  - `oItem` - Raw OData transfer object
  - `sType` - Transfer type (MANUAL or AUTO)
- **Returns**: Mapped transfer object with structure:
  ```javascript
  {
    razonSocial: "",      // Company name
    cif: "",              // Company tax ID
    fecha: "",            // Transfer date
    origen: {             // Source account
      banco: "",
      oficina: "",
      cuenta: ""
    },
    destino: {            // Destination account
      banco: "",
      oficina: "",
      cuenta: ""
    },
    saldoAntes: {},       // Balance before transfer
    saldoProgramado: {},  // Planned balance
    valorTransferencia: {},// Transfer amount
    paymentDoc: "",       // Payment document reference
    requestId: "",        // Request identifier
    status: {},           // Status object
    tipo: sType
  }
  ```

##### `_buildTransferenciasGroupsByType(sType, aTransferencias)`
- **Purpose**: Group transfers by company and organize for display
- **Parameters**:
  - `sType` - Transfer type
  - `aTransferencias` - Array of mapped transfer items
- **Actions**:
  1. Groups transfers by company (razonSocial + CIF)
  2. Sorts each group by date (newest first)
  3. Sets both filtered and all-items arrays
  4. For AUTO type: marks first group as active
- **Model Updates**: Sets `/_transferenciasAgrupadasXxxAll` and `/transferenciasAgrupadasXxx`

##### `_getTransferGroupPaths(sType)`
- **Purpose**: Return model paths for transfer groups
- **Parameters**:
  - `sType` - Transfer type (MANUAL or AUTO)
- **Returns**: Object with `allPath` and `visiblePath` keys

#### **Status Mapping**

##### `_mapTransferStatus(sRawStatus)`
- **Purpose**: Convert backend status codes to UI-friendly format
- **Parameters**:
  - `sRawStatus` - Raw status code from backend
- **Status Codes**:
  | Code  | i18n Key        | UI State      | Description |
  |-------|-----------------|---------------|-------------|
  | BCR   | statusCodeBCR   | Information   | Bank Confirmed Request |
  | TBA   | statusCodeTBA   | Warning       | To Be Approved |
  | AAPRV | statusCodeAAPRV | Success       | Auto Approved |
  | APRV  | statusCodeAPRV  | Success       | Approved |
  | REJ   | statusCodeREJ   | Error         | Rejected |
  | SENT  | statusCodeSENT  | Information   | Sent |
  | ACK   | statusCodeACK   | Information   | Acknowledged |
  | ACCP  | statusCodeACCP  | Success       | Accepted |
  | RJCT  | statusCodeRJCT  | Error         | Rejected (Final) |
  | CMP   | statusCodeCMP   | Success       | Complete |
- **Returns**: Object with `code`, `text` (localized), and `state`

##### `_getStatusOptions()`
- **Purpose**: Return available status filter options
- **Returns**: Array of status options for SELECT controls
- **Used In**: Transfer history tables for filtering

#### **Transfer History Filtering & Search**

##### `onTransferenciasGroupSearch(oEvent)`
- **Purpose**: Filter transfer groups by company name or CIF
- **Parameters**:
  - `oEvent` - Search event with `query` or `newValue`
- **Actions**:
  1. Gets search query and normalizes it
  2. Retrieves all transfer groups from model
  3. Filters by CIF or company name (case-insensitive)
  4. Updates visible transfer groups
- **Model**: Uses both `_transferenciasAgrupadasXxxAll` and `/transferenciasAgrupadasXxx`

##### `onTransferenciasSearch(oEvent)`
- **Purpose**: Apply date range and status filters to transfers
- **Parameters**:
  - `oEvent` - Button click event
- **Actions**:
  1. Gets binding context for transfer group
  2. Applies date range filter (from/to)
  3. Applies status filter
  4. Resets selection count
  5. Updates visible transfers in group
- **Date Handling**: Normalizes dates to midnight for comparison

##### `onTransferenciasClear(oEvent)`
- **Purpose**: Clear all filters and reset to full transfer list
- **Parameters**:
  - `oEvent` - Button click event
- **Actions**:
  1. Resets dateFrom, dateTo, status filters
  2. Restores full transfer list from `_allTransferencias`
  3. Clears selection count

##### `_normalizeDate(oDate)`
- **Purpose**: Normalize date to midnight for comparison
- **Parameters**:
  - `oDate` - JavaScript Date object
- **Returns**: Normalized Date with time set to 00:00:00.000

##### `_normalizeNifSearch(sValue)`
- **Purpose**: Normalize search string for case-insensitive comparison
- **Parameters**:
  - `sValue` - Search string
- **Returns**: Lowercase, trimmed string

#### **Transfer Download (Future)**

##### `onDownloadReceipt(oEvent)`
- **Purpose**: Download transfer receipt/proof
- **Status**: Template implementation (currently shows toast)
- **Parameters**:
  - `oEvent` - Button click event
- **Future**: Should implement actual file download logic

#### **Configuration Dialog**

##### `onConfigureNow()`
- **Purpose**: Close configuration dialog and open wizard
- **Actions**:
  1. Closes any open configuration dialog
  2. Calls `_openWizardDialog()`

##### `onCloseDialog()`
- **Purpose**: Close the configuration dialog
- **Actions**: Closes `_configDialog` instance

##### `onConsultConfiguration()`
- **Purpose**: Consult existing configuration
- **Actions**: Opens configuration wizard (alias for `_openWizardDialog`)

##### `_openConfigurationDialog()`
- **Purpose**: Open configuration info dialog
- **Fragment**: ConfigurationDialog.fragment.xml
- **Behavior**: Lazy-loads and caches dialog instance

#### **Configuration Wizard**

##### `onWizardCancel()`
- **Purpose**: Close the configuration wizard without saving
- **Actions**: Closes and resets wizard dialog

##### `onWizardAccept()`
- **Purpose**: Accept and save configuration
- **Actions**:
  1. Retrieves review data from model
  2. Shows success toast
  3. Closes wizard dialog
  4. Dialog cleanup happens in `onWizardDialogAfterClose`

##### `_openWizardDialog()`
- **Purpose**: Initialize and open configuration wizard
- **Actions**:
  1. Loads wizardData.json template
  2. Gets empresa list
  3. Sets up empty bancos data
  4. Calls `_openWizardDialogFragment()`
- **Model**: Creates/sets "wizard" model

##### `_openWizardDialogFragment()`
- **Purpose**: Load and display wizard dialog fragment
- **Fragment**: WizardDialog.fragment.xml
- **Behavior**: Loads fresh instance each time (destroyed in afterClose)

##### `onWizardDialogAfterClose()`
- **Purpose**: Cleanup after wizard closes
- **Actions**:
  1. Calls `_resetWizard("config")`
  2. Destroys dialog content and instance
  3. Clears empresas filters
  4. Sets internal variables to null

#### **Wizard Navigation**

##### `onWizardDialogAfterOpen()`
- **Purpose**: Initialize wizard state on open
- **Actions**:
  1. Gets current step index
  2. Calls `_updateNavState()` to set button states

##### `onWizardNavChange(oEvent)`
- **Purpose**: Handle wizard step changes
- **Parameters**:
  - `oEvent` - Navigation event
- **Actions**:
  1. Gets target step
  2. Calculates step index
  3. Updates navigation state

##### `onWizardNext()`
- **Purpose**: Navigate to next wizard step
- **Actions**:
  1. Checks if step already activated (visited before)
  2. Uses `nextStep()` for new steps
  3. Uses `goToStep()` for re-visiting steps
  4. Updates navigation state

##### `onWizardBack()`
- **Purpose**: Navigate to previous wizard step
- **Actions**:
  1. Validates not on first step
  2. Calls `goToStep()` for previous step
  3. Updates navigation state

##### `_updateNavState(iIndex)`
- **Purpose**: Update wizard navigation button states
- **Parameters**:
  - `iIndex` - Current step index (0-based)
- **Actions**:
  1. Determines visibility and enablement of buttons:
     - Back button: visible if not first step
     - Next button: visible if not last step
     - Accept button: visible if last step
     - Next enabled: based on current step validation
  2. Validates step 1: requires company selection and banks loaded
  3. Updates model properties
- **Model Properties Updated**:
  - `/nav/backVisible`
  - `/nav/nextVisible`
  - `/nav/nextEnabled`
  - `/nav/acceptVisible`

##### `_isStep1Valid()`
- **Purpose**: Validate first step (company selection)
- **Returns**: Boolean - true if empresa selected

#### **Wizard Step 1: Company Selection**

##### `onEmpresaSelectionChange()`
- **Purpose**: Handle company selection in step 1
- **Actions**:
  1. Gets selected company from table
  2. Validates selection
  3. Clears dependent state (banks, schedules, balances)
  4. Loads banks for selected company
  5. Updates navigation state
  6. Updates review section
- **Validation**: Sets step 1 validation based on selection

##### `onEmpresaSearch(oEvent)`
- **Purpose**: Filter companies by name or VAT number
- **Parameters**:
  - `oEvent` - Search event
- **Actions**:
  1. Normalizes search query
  2. Filters `_aEmpresasAll` array
  3. Updates empresas model
- **Note**: Shared between config and transfer wizards

##### `_getWizardEmpresasData(aFallbackEmpresas)`
- **Purpose**: Get companies data for wizard
- **Parameters**:
  - `aFallbackEmpresas` - Fallback data if no saldos available
- **Returns**: Mapped company objects with structure:
  ```javascript
  {
    razonSocial: "",      // Display name
    cif: "",              // Tax ID
    CompanyCode: ""       // System code
  }
  ```

##### `_mapEmpresaForWizard(oEmpresa)`
- **Purpose**: Map company data to wizard format
- **Parameters**:
  - `oEmpresa` - Raw company object
- **Returns**: Mapped object for wizard display

#### **Wizard Step 2: Account Selection**

##### `onCuentasSelectionChange()`
- **Purpose**: Handle account selection in step 2
- **Actions**:
  1. Gets selected accounts
  2. Validates selection
  3. Builds custom schedules
  4. Builds custom balance rules
  5. Updates navigation
  6. Updates review
- **Validation**: Sets step 2 validation based on selection

##### `onCuentasSearch(oEvent)`
- **Purpose**: Filter bank accounts
- **Parameters**:
  - `oEvent` - Search event
- **Actions**: Calls `_onBancosSearch(oEvent, "config")`

##### `_onBancosSearch(oEvent, sType)`
- **Purpose**: Filter banks and accounts by name
- **Parameters**:
  - `oEvent` - Search event
  - `sType` - Wizard type ("config" or "transfer")
- **Search Fields**: Bank name, account description, account number
- **Behavior**:
  1. Filters `/_bancosAll` by query
  2. Auto-expands matching banks
  3. Hides non-matching accounts within matching banks
  4. Sets `expanded` property for UI

##### `_getSelectedStep2Accounts()`
- **Purpose**: Get all selected accounts from step 2
- **Returns**: Array of objects with `banco` (bank name) and `data` (account details)
- **Used By**: Schedule and balance building functions

#### **Wizard Step 3: Centralized Account Selection**

##### `onCuentaCentralSelectionChange()`
- **Purpose**: Handle centralized account selection
- **Actions**:
  1. Validates selection
  2. Updates review
  3. Updates navigation
- **Validation**: Sets step 3 validation

##### `onCuentaCentralSearch(oEvent)`
- **Purpose**: Filter centralized accounts
- **Parameters**:
  - `oEvent` - Search event
- **Actions**: Calls `_onCuentaCentralSearch(oEvent, "config")`

##### `_onCuentaCentralSearch(oEvent, sType)`
- **Purpose**: Filter destination/centralized accounts
- **Parameters**:
  - `oEvent` - Search event
  - `sType` - Wizard type
- **Search Fields**: Description, HouseBank, Account number (IBAN)
- **Behavior**: Filters `/_cuentasCentralAll` by query

#### **Wizard Step 4: Schedule Configuration**

##### `onHorarioSelectionChange()`
- **Purpose**: Handle schedule type selection (single, by bank, by account)
- **Actions**:
  1. Gets selected schedule type
  2. Clears related models
  3. Rebuilds specific schedules
  4. Validates step
  5. Updates review

##### `onHorarioUnicoChange()`
- **Purpose**: Update when single schedule value changes
- **Actions**: Updates review section

##### `_buildHorariosEspecificos(aSelectedAccountsParam)`
- **Purpose**: Build schedule data for by-bank or by-account options
- **Parameters**:
  - `aSelectedAccountsParam` - Selected accounts (optional, falls back to step 2 selection)
- **Actions Based on Schedule Type**:
  1. Type 0 (Single): Clears specific schedules
  2. Type 1 (By Bank): Creates one entry per unique bank
  3. Type 2 (By Account): Creates one entry per selected account
- **Structure**:
  ```javascript
  {
    nombre: "",              // Bank or account name
    selectedHorario: "",     // Selected schedule
    horariosUnicos: [...]    // Available schedules
  }
  ```

##### `onHorarioEspecificoChange(oEvent)`
- **Purpose**: Handle specific schedule selection (by bank or account)
- **Parameters**:
  - `oEvent` - Selection change event
- **Actions**:
  1. Gets selected schedule
  2. Identifies target bank/account by data key
  3. Updates corresponding model array
  4. Updates review

##### `onDiaSelectionChange()`
- **Purpose**: Handle day selection change
- **Actions**:
  1. Updates review
  2. Validates step 4

##### `_validateStep4()`
- **Purpose**: Validate step 4 requirements
- **Requirements**:
  1. Schedule type selected (horarioGroup)
  2. At least one day selected
- **Actions**: Sets step validation accordingly

##### `_updateReviewHorario()`
- **Purpose**: Build schedule review text
- **Actions**:
  1. Gets selected schedule type
  2. Formats display based on type:
     - Single: Shows type + time
     - By Bank: Shows bank names + times
     - By Account: Shows account details + times
  3. Updates `/review/horario`

##### `_updateReviewDias()`
- **Purpose**: Build day selection review text
- **Actions**:
  1. Gets selected days from model
  2. Filters to selected only
  3. Formats as comma-separated list
  4. Updates `/review/dias`

#### **Wizard Step 5: Custom Balance Rules**

##### `onSaldoSelectionChange(oEvent)`
- **Purpose**: Handle balance rule type selection
- **Actions**:
  1. Gets selected balance type
  2. Builds custom balance data
  3. Updates review
  4. Validates step 5

##### `_buildSaldosPersonalizados(aSelectedAccountsParam)`
- **Purpose**: Build custom balance data based on type
- **Parameters**:
  - `aSelectedAccountsParam` - Selected accounts (optional)
- **Balance Types**:
  1. Type 0 (By Bank): Aggregates balances by bank
  2. Type 1 (By Account): Shows balances per account
  3. Type 2 (No Custom): Sets empty arrays
- **Data Structure**:
  ```javascript
  {
    nombre: "",                    // Bank or account name
    saldoDisponible: 0,            // Available balance
    saldoDisponibleTexto: "",      // Formatted balance
    currency: "",                  // Currency code
    saldoPersonalizado: null,      // Custom override value
    saldoPersonalizadoInput: ""    // User input string
  }
  ```
- **Preservation**: Maintains previously entered custom values

##### `onSaldoPersonalizadoChange(oEvent)`
- **Purpose**: Handle custom balance input change
- **Parameters**:
  - `oEvent` - Value change event
- **Actions**:
  1. Gets user input
  2. Parses localized number format
  3. Formats back to display format
  4. Validates step 5
  5. Updates review
- **Number Handling**: Supports multiple locale formats with fallback

##### `_validateStep5()`
- **Purpose**: Validate step 5 requirements
- **Requirements**:
  1. If balance type 0 or 1: All entered values must be valid numbers
  2. If balance type 2: Always valid
- **Actions**: Sets step validation

##### `_updateReviewSaldo()`
- **Purpose**: Build balance configuration review text
- **Actions**:
  1. Gets selected balance type
  2. Formats based on type:
     - By Bank: Lists bank names + custom amounts
     - By Account: Lists accounts + custom amounts
  3. Updates `/review/saldoAdicionalData`

##### `_hasValidLocalizedInputs(aItems)`
- **Purpose**: Validate that all items have valid number inputs
- **Parameters**:
  - `aItems` - Array of saldo objects
- **Returns**: Boolean - true if all have valid numeric input

##### `_parseLocalizedNumber(sValue)`
- **Purpose**: Parse number string in any locale format
- **Parameters**:
  - `sValue` - Input string (e.g., "1.000,50" or "1,000.50")
- **Algorithm**:
  1. Attempts parse using locale formatter
  2. If fails, detects decimal and thousands separators
  3. Normalizes and converts to Number
- **Returns**: Parsed number or NaN

##### `_getLocalizedFloatFormatter()`
- **Purpose**: Get cached number formatter for current locale
- **Returns**: Singleton NumberFormat instance
- **Config**: 2 decimal places, grouping enabled

##### `_formatLocalizedNumber(nValue)`
- **Purpose**: Format number to locale string
- **Parameters**:
  - `nValue` - Number to format
- **Returns**: Formatted string with locale decimal separator

##### `_formatAmountForReview(vAmount, sCurrency)`
- **Purpose**: Format currency amount for review display
- **Parameters**:
  - `vAmount` - Amount value
  - `sCurrency` - Currency code
- **Returns**: Formatted string using Formatter.formatCurrency or localized number

#### **Wizard Review Section**

##### `onReviewStepActivate()`
- **Purpose**: Update all review fields when review step becomes active
- **Actions**: Calls all `_updateReview*()` methods

##### `_updateReviewEmpresa()`
- **Purpose**: Update selected company in review
- **Actions**:
  1. Gets selected company from empresaTable
  2. Sets `/review/razonSocial` and `/review/cif`

##### `_updateReviewCuentas()`
- **Purpose**: Update selected accounts in review
- **Actions**:
  1. Gets selected accounts from step 2
  2. Joins account descriptions
  3. Sets `/review/cuentasSeleccionadas`

##### `_updateReviewCuentaCentral()`
- **Purpose**: Update selected centralized account in review
- **Actions**:
  1. Gets selected account from cuentaCentralTable
  2. Formats with bank name and account details
  3. Sets `/review/cuentaCentralNombre` and `/review/cuentaCentralCuenta`

##### `onEditStep(oEvent)`
- **Purpose**: Navigate to specific step for editing
- **Parameters**:
  - `oEvent` - Button click with data-step attribute
- **Actions**:
  1. Gets step number from data attribute
  2. Navigates wizard to that step
  3. Updates navigation state

#### **Wizard Data Management**

##### `_resetWizard(sType)`
- **Purpose**: Reset wizard to initial state
- **Parameters**:
  - `sType` - "config" or "transfer"
- **Actions**:
  1. Restores empresas model from `_aEmpresasAll`
  2. Clears all wizard data
  3. Resets wizard to step 1
  4. Invalidates all steps
  5. Clears table selections
  6. Resets step counters

##### `_clearWizardDependentState()`
- **Purpose**: Clear state dependent on company/account selection
- **Actions**: Clears all bancos, schedules, balances, and review data

##### `_clearWizardBanksData(oModel)`
- **Purpose**: Clear bank-related model properties
- **Parameters**:
  - `oModel` - Wizard model
- **Properties Cleared**:
  - `/_bancosAll` and `/bancos`
  - `/_cuentasCentralAll` and `/cuentasCentralizadoras`
  - `/companyContextReady`

##### `_loadBanksForSelectedCompany(oOptions)`
- **Purpose**: Load banks from backend for selected company
- **Parameters**:
  - `oOptions` - Configuration object:
    - `CompanyCode` - Company identifier
    - `modelName` - Target model name
    - `dialog` - Dialog for busy state
    - `onSuccess` - Success callback
    - `errorMessage` - Error message to show
- **OData Calls**:
  1. `postSelectCompany()` - Set company context
  2. `bindList("/Banks")` - Get banks with AccountBalance expansion
- **Request Management**: Tracks active requests to prevent race conditions
- **Returns**: Promise

##### `_transformBanksODataToBancos(oODataResponse)`
- **Purpose**: Transform OData bank data to UI structure
- **Parameters**:
  - `oODataResponse` - OData response with bank array
- **Actions**:
  1. Transforms account data (maps fields, extracts IBAN/account number)
  2. Groups accounts by bank
  3. Extracts centralized accounts (HouseBank starting with "SANT")
- **Returns**: Object with `bancos` and `cuentasCentralizadoras` arrays

##### `_setWizardBanksData(oModel, oTransformed)`
- **Purpose**: Update wizard model with transformed banks
- **Parameters**:
  - `oModel` - Wizard model
  - `oTransformed` - Transformed bank data
- **Actions**: Sets all, unfiltered copies and visible copies

##### `_getWizardModel(sType)`
- **Purpose**: Get wizard model for specified type
- **Parameters**:
  - `sType` - "config" or "transfer" (defaults to "config")
- **Returns**: JSONModel instance or null

##### `_setWizardPropertyIfChanged(sType, sPath, vValue)`
- **Purpose**: Update model property only if value changed
- **Parameters**:
  - `sType` - "config" or "transfer"
  - `sPath` - Property path
  - `vValue` - New value
- **Benefit**: Avoids unnecessary model refresh triggers

##### `_setWizardStepValidation(sStepId, bValid)`
- **Purpose**: Mark wizard step as valid or invalid
- **Parameters**:
  - `sStepId` - Step control ID
  - `bValid` - Validation state
- **Actions**: Calls wizard validateStep() or invalidateStep()

#### **Transfer Wizard**

##### `onCreateSingleTransfer()`
- **Purpose**: Open the one-time transfer wizard
- **Actions**:
  1. Loads wizardTransferData.json
  2. Sets up transfer wizard model
  3. Calls `_openTransferWizardDialogFragment()`
- **Model**: Creates/sets "wizardTransfer" model

##### `_openTransferWizardDialogFragment()`
- **Purpose**: Load and display transfer wizard fragment
- **Fragment**: WizardTransferDialog.fragment.xml
- **Behavior**: Fresh load each time, destroyed in afterClose

##### `onTransferWizardDialogAfterOpen()`
- **Purpose**: Initialize transfer wizard on open
- **Actions**: Sets step index to 0 and updates nav state

##### `onTransferWizardDialogAfterClose()`
- **Purpose**: Cleanup after transfer wizard closes
- **Actions**: Similar to config wizard cleanup

##### `onTransferWizardCancel()`
- **Purpose**: Close transfer wizard without submitting
- **Actions**: Closes dialog

##### `_updateTransferNavState(iIndex)`
- **Purpose**: Update transfer wizard navigation
- **Parameters**:
  - `iIndex` - Current step index
- **Actions**:
  1. Determines button visibility/enablement
  2. Validates current step based on index:
     - Step 0: Company selected + banks loaded
     - Step 1: Source account selected
     - Step 2: Destination account selected
     - Step 3: Valid amount entered
  3. Updates model properties

##### `onTransferWizardNavChange(oEvent)`
- **Purpose**: Handle transfer wizard step changes
- **Parameters**:
  - `oEvent` - Navigation event
- **Actions**: Updates step index and nav state

##### `onTransferWizardNext()` / `onTransferWizardBack()`
- **Purpose**: Navigate transfer wizard steps
- **Actions**: Similar to config wizard navigation

##### `onEmpresaSelectionChangeTransfer()`
- **Purpose**: Handle company selection in transfer wizard
- **Actions**: Similar to config but stores company details in review

##### `onCuentasSearchTransfer(oEvent)` / `onCuentaDestinoSearchTransfer(oEvent)`
- **Purpose**: Search banks and centralized accounts
- **Actions**: Delegates to shared search functions with "transfer" type

##### `onCuentaOrigenSelectionChange(oEvent)`
- **Purpose**: Handle source account selection
- **Actions**:
  1. Deselects other accounts in other banks
  2. Selects clicked account
  3. Updates nav state

##### `onCuentaDestinoSelectionChange()`
- **Purpose**: Handle destination account selection
- **Actions**: Updates nav state

##### `onTransferAmountChange(oEvent)`
- **Purpose**: Handle transfer amount input
- **Actions**:
  1. Updates model value
  2. Validates amount (non-empty, valid number)
  3. Updates nav state

##### `onTransferReviewStepActivate()`
- **Purpose**: Update transfer review on activation
- **Actions**: Calls `_updateTransferReview()`

##### `_updateTransferReview()`
- **Purpose**: Build complete transfer review display
- **Actions**:
  1. Updates company details
  2. Updates source account details
  3. Updates destination account details
  4. Formats amount
  5. Sets all review properties

##### `onEditStepTransfer(oEvent)`
- **Purpose**: Navigate to specific transfer wizard step for editing
- **Parameters**:
  - `oEvent` - Button click with data-step attribute
- **Actions**: Similar to config wizard

##### `onTransferWizardAccept()`
- **Purpose**: Submit the transfer
- **Actions**:
  1. Updates review
  2. Prepares transfer object
  3. Calls `onAnotherButtonPress()` with transfer data
  4. Closes dialog
  5. Shows success toast

##### `onAnotherButtonPress(oTransferObject)`
- **Purpose**: Submit transfer to backend via OData
- **Parameters**:
  - `oTransferObject` - Prepared transfer data
- **OData Call**: `postBankTransfer()` with complex parameters structure
- **Parameters Submitted**:
  ```javascript
  {
    accounts: {
      acctType: "S",
      partnerAccount: "",
      reconcilAccount: "",
      partnerAcctTransfer: ""
    },
    amounts: {
      paymCurr: "",         // Currency
      paymAmount: "",       // Amount with 2 decimals
      paymAmountLong: ""    // Amount with 8 decimals
    },
    bankData: [{
      accountRole: "2",
      bankCtry: "",
      bankKey: "",
      swiftCode: "",
      bankAcct: "",
      ctrlKey: "",
      iban: ""
    }],
    paymControl: {
      housebankId: "",
      housebankAcctId: "",
      paymentMethods: "T",
      paycode: ""
    },
    type: "MANUAL"
  }
  ```

#### **Helper Functions**

##### `_getViewModel()`
- **Purpose**: Get cached view model
- **Returns**: View model instance

##### `_toNumber(vAmount)`
- **Purpose**: Safely convert value to number
- **Parameters**:
  - `vAmount` - Value to convert
- **Returns**: Number (0 if not finite)

##### `_normalizeDate(oDate)`
- **Purpose**: Normalize date to midnight UTC
- **Parameters**:
  - `oDate` - JavaScript Date
- **Returns**: Normalized Date

##### `_normalizeNifSearch(sValue)`
- **Purpose**: Normalize search string
- **Parameters**:
  - `sValue` - Search string
- **Returns**: Lowercase, trimmed string

##### `_isTransferOrigenSelected()`
- **Purpose**: Check if source account selected in transfer wizard
- **Returns**: Boolean

##### `_clearTransferWizardDependentState()`
- **Purpose**: Clear transfer wizard dependent state
- **Actions**: Similar to config wizard

---

## Backend Services and OData Integration

### OData Data Source

**Configuration** (manifest.json):
```json
"dataSources": {
  "mainService": {
    "uri": "/odata/",
    "type": "OData",
    "settings": {
      "odataVersion": "4.0"
    }
  }
}

"models": {
  "Cashpool": {
    "dataSource": "mainService",
    "type": "sap.ui.model.odata.v4.ODataModel",
    "settings": {
      "operationMode": "Server",
      "autoExpandSelect": true,
      "earlyRequests": true
    }
  }
}
```

### OData Operations Called

#### 1. `getBalanceOfCompanies()`
**Purpose**: Retrieve all company balances
**Used In**: `onInit()`
**Returns**: Array of company balance objects
**Structure**:
```javascript
{
  CompanyCode: "",
  CompanyName: "",
  VatNumber: "",
  Currency: "",
  StatementAmount: 0,
  ...
}
```

#### 2. `postSelectCompany(...)`
**Purpose**: Set active company context for subsequent queries
**Used In**: `_loadBanksForSelectedCompany()`
**Parameters**: `{ CompanyCode: "" }`
**Effect**: Subsequent Bank queries return data for this company

#### 3. `Banks`
**Purpose**: Get list of banks with accounts
**Expansion**: `AccountBalance` - Includes account details
**Filters**: Optional filters
**Returns**: Bank objects with nested account array

#### 4. `BankTransferHistory`
**Purpose**: Get transfer history for specific type
**Filters**: `type` filter (MANUAL or AUTO)
**Returns**: Array of transfer history records

#### 5. `postBankTransfer(...)`
**Purpose**: Submit new manual transfer
**Used In**: `onAnotherButtonPress()` (Transfer wizard submit)
**Parameters**: Complex transfer parameters (see `onAnotherButtonPress` section)
**Returns**: Confirmation with new transfer details

---

## Wizard Dialogs

### Configuration Wizard (config wizard)

**Type**: Multi-step wizard for automatic transfer configuration

**Steps**:

1. **Step 1: Select Company**
   - Table showing available companies (empresas)
   - Search by company name or VAT number
   - Single selection
   - Automatically loads banks for selected company

2. **Step 2: Select Accounts**
   - Displays banks with nested account hierarchy
   - Search/filter by bank name or account number
   - Multi-select from multiple banks
   - Preserves custom schedules/balances if changing selection

3. **Step 3: Select Centralized Account**
   - Choose destination/pooling account
   - Search by description or IBAN
   - Single selection
   - Typically Santander centralized accounts

4. **Step 4: Configure Schedule**
   - Three options:
     1. Single schedule for all accounts
     2. Different schedule per bank
     3. Different schedule per account
   - Select days of week
   - Validation: Must select at least one day

5. **Step 5: Configure Balance Rules**
   - Three options:
     1. Custom balance per bank
     2. Custom balance per account
     3. No customization (use available balance)
   - Input validation for numeric values
   - Localized number formatting

6. **Review Step**
   - Summary of all configuration choices
   - Edit buttons to return to specific steps
   - Accept to save configuration

### Transfer Wizard (transfer wizard)

**Type**: Multi-step wizard for one-time manual transfer

**Steps**:

1. **Step 1: Select Company**
   - Similar to config wizard
   - Stores company info in review

2. **Step 2: Select Source Account**
   - Choose account to transfer FROM
   - Shows available balance
   - Single selection

3. **Step 3: Select Destination Account**
   - Choose account to transfer TO
   - From centralized/pooling accounts
   - Single selection

4. **Step 4: Enter Amount**
   - Text input for transfer amount
   - Localized number formatting
   - Validation: non-empty, valid number

5. **Review Step**
   - Summary of transfer details
   - Edit buttons to modify steps
   - Accept to submit transfer

---

## Fragments

### ConfigurationDialog.fragment.xml

**Purpose**: Initial configuration information dialog

**Content**: 
- Information about configuring automatic transfers
- Link/button to open configuration wizard

### ConsultaSaldos.fragment.xml

**Purpose**: Display company balance information

**Components**:
- **Visualization Chart**: Horizontal bar chart by company
- **Balance Table**: Detailed balance data
- Uses `{saldos>}` model binding

### WizardDialog.fragment.xml

**Purpose**: Multi-step configuration wizard UI

**Content**:
- Wizard control with 6 steps
- Dynamic step content based on wizard type
- Tables for company/account selection
- Schedule/balance configuration controls
- Review step with summary

### WizardTransferDialog.fragment.xml

**Purpose**: Multi-step transfer wizard UI

**Content**:
- Wizard control with 5 steps
- Similar structure to config wizard but simplified
- Source and destination account selection
- Amount input
- Review step

---

## Utilities

### Formatter.js

**Purpose**: Format data for display in views

**Functions**:

#### `formatCurrency(monto, moneda)`
- **Parameters**:
  - `monto` - Numeric amount
  - `moneda` - Currency code (e.g., "EUR")
- **Returns**: Formatted currency string with symbol
- **Example**: `formatCurrency(1000, "EUR")` → "1,000.00 €"

#### `dateTimeToDate(sDateTime)`
- **Parameters**:
  - `sDateTime` - ISO datetime string
- **Returns**: Formatted date string (time removed)
- **Example**: `dateTimeToDate("2024-01-15T10:30:00Z")` → "15/01/2024"

#### `formatBankTitle(sNombre, aCuentas)`
- **Parameters**:
  - `sNombre` - Bank name
  - `aCuentas` - Array of accounts
- **Returns**: Bank name with account count
- **Example**: `formatBankTitle("Santander", [acct1, acct2])` → "Santander (2)"

---

## State Management

### Model Hierarchy

```
Component
├── Device Model
│   └── Device information (desktop/tablet/phone)
├── i18n Model
│   └── Translation bundles
├── Cashpool OData Model (Singleton)
│   └── Backend data (balances, banks, transfers)
└── View Controller Models
    ├── view Model (JSONModel)
    │   ├── selectedTab
    │   ├── transferenciasAgrupadasManual
    │   ├── transferenciasAgrupadasAuto
    │   └── viewModel._*All (unfiltered copies)
    ├── saldos Model (JSONModel)
    │   └── Company balance array
    ├── empresas Model (JSONModel)
    │   └── Shared company list for wizards
    ├── wizard Model (JSONModel)
    │   └── Config wizard temporary state
    └── wizardTransfer Model (JSONModel)
        └── Transfer wizard temporary state
```

### Data Flow

1. **App Initialization**:
   ```
   Component.init()
   → Treasury.onInit()
   → Load companies (OData: getBalanceOfCompanies)
   → Create models (saldos, view, empresas)
   → Chart setup
   ```

2. **Tab Navigation**:
   ```
   onTabSelect(MANUAL|AUTO)
   → _loadTransferHistoryData()
   → Fetch from OData: BankTransferHistory
   → Map and group transfers
   → Update view model
   ```

3. **Config Wizard Flow**:
   ```
   onConfigureNow()
   → _openWizardDialog()
   → Load wizardData.json
   → onEmpresaSelectionChange()
   → _loadBanksForSelectedCompany()
   → (Select Accounts) → _buildHorariosEspecificos() + _buildSaldosPersonalizados()
   → (Select Central Account) → _updateReviewCuentaCentral()
   → (Configure Schedule) → _buildHorariosEspecificos()
   → (Configure Balance) → _buildSaldosPersonalizados()
   → (Review) → onWizardAccept()
   ```

4. **Transfer Wizard Flow**:
   ```
   onCreateSingleTransfer()
   → _openTransferWizardDialogFragment()
   → (Select Company) → _loadBanksForSelectedCompany()
   → (Select Source Account) → onCuentaOrigenSelectionChange()
   → (Select Destination Account) → onCuentaDestinoSelectionChange()
   → (Enter Amount) → onTransferAmountChange()
   → (Review) → onTransferWizardAccept()
   → onAnotherButtonPress()
   → OData: postBankTransfer()
   ```

---

## Key Workflows

### 1. View Company Balances

**User Flow**:
1. App loads → onInit() fetches balances
2. Tab "Consult Balances" shown (default)
3. User sees chart and table of EUR-currency companies

**Technical Flow**:
```
OData getBalanceOfCompanies()
→ Filter EUR currency
→ Create saldos model
→ VizFrame chart visualization
→ Table display
```

### 2. View and Filter Transfer History

**User Flow**:
1. User clicks "Manual Transfers" or "Automatic Transfers" tab
2. Transfer groups appear (grouped by company)
3. User can:
   - Search by company name/CIF
   - Filter by date range and status
   - Expand/collapse company groups
   - View transfer details

**Technical Flow**:
```
onTabSelect(MANUAL|AUTO)
→ _loadTransferHistoryData(type)
→ OData BankTransferHistory query
→ _fetchTransferHistoryByType()
→ _mapTransferHistoryItem() for each record
→ _buildTransferenciasGroupsByType()
→ Group by company
→ Sort by date
→ Update view model
```

### 3. Configure Automatic Transfers

**User Flow**:
1. User clicks "Configure Now" button
2. Opens 6-step configuration wizard
3. Step 1: Select company
4. Step 2: Select source accounts
5. Step 3: Select destination (centralized) account
6. Step 4: Set schedule (when transfers occur)
7. Step 5: Set balance rules (how much to transfer)
8. Review: Confirm all settings
9. Accept to save

**Technical Flow**:
```
onConfigureNow()
→ _openWizardDialog()
→ Load wizardData.json template
→ (Step 1) onEmpresaSelectionChange()
  → _loadBanksForSelectedCompany()
  → OData postSelectCompany()
  → OData bindList("/Banks")
  → _transformBanksODataToBancos()
  → Update wizard model
→ (Step 2) onCuentasSelectionChange()
  → _buildHorariosEspecificos()
  → _buildSaldosPersonalizados()
→ (Step 3-5) Update review as user enters data
→ onWizardAccept()
  → Show success toast
  → Close dialog
```

### 4. Create and Submit Manual Transfer

**User Flow**:
1. User clicks "Manual Transfer" button
2. Opens 5-step transfer wizard
3. Step 1: Select company
4. Step 2: Select source account
5. Step 3: Select destination account
6. Step 4: Enter transfer amount
7. Review: Confirm transfer details
8. Accept to submit

**Technical Flow**:
```
onCreateSingleTransfer()
→ _openTransferWizardDialogFragment()
→ Load wizardTransferData.json
→ (Step 1) onEmpresaSelectionChangeTransfer()
  → _loadBanksForSelectedCompany()
  → Load source and destination account options
→ (Step 2-4) Collect user input
→ (Review) _updateTransferReview()
→ onTransferWizardAccept()
  → Prepare transfer object
  → onAnotherButtonPress(oTransferObject)
  → OData postBankTransfer()
  → Show success toast
  → Close dialog
```

---

## Common Patterns

### Model Management

**Pattern**: Each wizard creates fresh JSONModel from template JSON file:
```javascript
const oModel = new JSONModel(sap.ui.require.toUrl("path/to/template.json"));
oModel.attachRequestCompleted(() => { 
  // Initialize model after load
});
this.getView().setModel(oModel, "modelName");
```

**Benefit**: Ensures clean state for each wizard invocation

### Data Filtering

**Pattern**: Maintain both unfiltered (`_all`) and filtered (`visible`) copies:
```javascript
// Store original
oModel.setProperty("/_bancosAll", aBancos);

// Update filtered copy based on search
const aFiltered = aAll.filter(predicate);
oModel.setProperty("/bancos", aFiltered);
```

**Benefit**: Easy reset to original, efficient filtering

### Localized Number Parsing

**Pattern**: Multi-strategy parsing for different locale formats:
```javascript
_parseLocalizedNumber(sValue) {
  // Try locale formatter first
  const vParsed = this._getLocalizedFloatFormatter().parse(sValue);
  if (!Number.isNaN(vParsed)) return vParsed;
  
  // Detect separator and normalize
  const sNormalized = detectAndNormalize(sValue);
  const nFallback = Number(sNormalized);
  
  return Number.isNaN(nFallback) ? Number.NaN : nFallback;
}
```

**Benefit**: Supports both typed input and pasted values in any locale

### Request Deduplication

**Pattern**: Track active requests to prevent race conditions:
```javascript
this._mActiveCompanyRequestKeys[sModelName] = sRequestKey;
// ... async operation ...
if (this._mActiveCompanyRequestKeys[sModelName] !== sRequestKey) {
  return; // Request was superseded
}
```

**Benefit**: Only latest request updates UI if user changes selection rapidly

### Date Normalization

**Pattern**: Normalize dates to midnight for comparison:
```javascript
_normalizeDate(oDate) {
  const oNormalized = new Date(oDate.getTime());
  oNormalized.setHours(0, 0, 0, 0);
  return oNormalized;
}
```

**Benefit**: Date range filtering works correctly regardless of time-of-day

---

## Best Practices and Tips

### 1. Component Selection
- Always validate component selection before enabling next step
- Use `_setWizardStepValidation()` to update step state
- Call `_updateNavState()` after validation changes

### 2. Error Handling
- Always include `.catch()` handlers for OData promises
- Use `MessageToast.show()` with i18n keys for user messages
- Log errors to console for debugging: `console.error("Error:", oError)`

### 3. Model Updates
- Use `_setModelPropertyIfChanged()` to avoid unnecessary refreshes
- Always check model exists before setting properties
- Use deep JSON.parse/stringify for complex object copying

### 4. Localization
- Always use i18n keys in message toasts
- Test with multiple languages (English, Spanish)
- Use locale-aware formatters for numbers and currencies

### 5. Performance
- Lazy-load transfer history only when tab selected
- Use Fragment caching for ConfigurationDialog (optional)
- Destroy wizard dialog fragments after close to free memory
- Use busy indicators during async operations

### 6. Testing
- Mock OData responses with local JSON models
- Test number parsing with various locale formats
- Test wizard flows step-by-step
- Verify model state at each wizard step

---

## Troubleshooting

### Transfer History Not Loading
**Symptom**: Transfer tabs show empty or spinning loader
**Causes**:
- OData service unavailable
- Network/CORS issues
- Incorrect BankTransferHistory endpoint

**Solution**:
- Check browser network tab
- Verify OData URL in manifest.json
- Check server logs for errors

### Wizard Not Progressing
**Symptom**: Next button disabled or wizard won't advance
**Causes**:
- Step validation requirements not met
- Required fields not populated
- Model data not loaded

**Solution**:
- Check browser console for errors
- Verify selection was made and shown as selected
- Check if companies/banks loaded successfully

### Number Format Issues
**Symptom**: Entered amount shows as NaN or parsed incorrectly
**Causes**:
- Decimal separator mismatch
- Mixed separators in pasted value
- Non-numeric characters

**Solution**:
- User should use correct separator for locale
- Clear field and re-enter manually
- Check _parseLocalizedNumber() logic

---

## References

- SAPUI5 Documentation: https://sdk.openui5.org/
- OData v4 Specification: https://www.odata.org/
- SAP Fiori Design Principles: https://experience.sap.com/fiori-design/
