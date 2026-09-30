# Plan: Refactor onWizardAccept to Call Schedule Transfer

## Objective
Refactor `onWizardAccept()` to match the pattern used by `onTransferWizardAccept()`: show a success message and then call a new function `onPostShedule()` to submit a schedule transfer payload to the backend `/scheduleTransfer` operation.

## Requirements

### New Function: onPostShedule()
Send a payload to `/scheduleTransfer` with the structure:
```json
{
  "parameters": {
    "companyCode": "2000",
    "payerAccount": [
      {
        "houseBankId": "SANT0",
        "houseBankAccId": "0",
        "amounts": {
          "paymCurr": "EUR",
          "paymAmount": "10000.00",
          "paymAmountLong": "10000.00000000",
          "executionTime": "10:00:00"
        }
      },
      {
        "houseBankId": "BBV1",
        "houseBankAccId": "1",
        "amounts": {
          "paymCurr": "EUR",
          "paymAmount": "1000.00",
          "paymAmountLong": "1000.00000000",
          "executionTime": "10:00:00"
        }
      }
    ],
    "payeeAccount": {
      "houseBankId": "SANT1",
      "houseBankAccId": "1",
      "partnerAccount": "57200015"
    },
    "transferConfiguration": {
      "transferTimeType": 1,
      "daysOfWeek": [1, 2, 3, 4, 5, 6, 7],
      "balanceType": 2,
      "startDate": "2026-09-18",
      "endDate": "2027-09-18"
    }
  }
}
```

### Data Sourcing Rules

#### payerAccount Array
- Built from all selected accounts in step 2 (via `_getSelectedStep2Accounts()`)
- Each account entry contains:
  - `houseBankId`: extracted from account data
  - `houseBankAccId`: extracted from account data
  - `amounts.paymCurr`: the account's currency
  - `amounts.paymAmount`: formatted to 2 decimal places
  - `amounts.paymAmountLong`: formatted to 8 decimal places
  - `amounts.executionTime`: HH:MM:SS format

- **Amount Determination Logic:**
  - If `selectedSaldoType === 0` (saldo por banco):
    - All accounts belonging to the same bank get the same amount
    - Amount is fetched from `saldosPersonalizadosPorBanco` by bank name
    - Parse using `_parseLocalizedNumber(saldoPersonalizado.saldoPersonalizadoInput)`
  - If `selectedSaldoType === 1` (saldo por cuenta):
    - Each account gets its own amount
    - Amount is fetched from `saldosPersonalizadosPorCuenta` by account's cuentaCorriente
    - Parse using `_parseLocalizedNumber(saldoPersonalizado.saldoPersonalizadoInput)`

- **Execution Time Determination Logic:**
  - If horario `selectedHorario === 1` (horario por banco):
    - All accounts in the same bank share the same execution time
    - Time is fetched from `horariosPersonalizadosPorBanco` by bank name
    - Use `selectedHorario` (e.g., "17:00") from matching bank entry
  - If horario `selectedHorario === 2` (horario por cuenta):
    - Each account gets its own execution time
    - Time is fetched from `horariosPersonalizadosPorCuenta` by account's cuentaCorriente
    - Use `selectedHorario` from matching account entry

#### payeeAccount Object
- Build identically to how `onAnotherButtonPress()` builds the destination account
- Extract from the review object (populated by `_updateReviewCuentaCentral()`)
- Lookup full account details from `_cuentasCentralAll` using review data
- Fields:
  - `houseBankId`: account's HouseBank property
  - `houseBankAccId`: account's AccountId property
  - `partnerAccount`: account's PartnerAccount (slice(2) to remove leading chars)

#### transferConfiguration Object
- `transferTimeType`: hardcoded to 1 (times per account even if shared banks)
- `daysOfWeek`: array of integers, mapping selected days
  - Map from model.dias: monday=1, tuesday=2, wednesday=3, thursday=4, friday=5, saturday=6, sunday=7
  - Include only selected days in ascending order
- `balanceType`: `model.selectedSaldoType + 1`
  - If selectedSaldoType is 0 (saldo per banco) → balanceType = 1
  - If selectedSaldoType is 1 (saldo per cuenta) → balanceType = 2
  - If selectedSaldoType is 2 (default) → balanceType = 3
- `startDate`: today's date in YYYY-MM-DD format (use `new Date()`)
- `endDate`: 1 year from today in YYYY-MM-DD format

## Implementation Plan

### Phase 1: Refactor onWizardAccept()
Modify existing `onWizardAccept()` function to:
1. Get the config wizard model
2. Call `_updateReviewCuentas()` to ensure review data is up-to-date (same as transfer wizard)
3. Call `_updateReviewCuentaCentral()` to ensure destination account data is current
4. Get the review object from model
5. Show MessageToast with current success message: `msgSavedConfig` i18n text
6. Call `this.onPostShedule()` to submit to backend
7. If dialog exists, close it

### Phase 2: Create onPostShedule() Function
New public function that:
1. Gets the config wizard model
2. Calls `_prepareSchedulePayload()` to build complete OData payload
3. Binds context to `/scheduleTransfer(...)` operation
4. Invokes the operation with parameters
5. On success:
   - Show MessageToast: "Schedule transfer posted successfully!" (or i18n equivalent)
6. On error:
   - Show MessageToast with error details: "Error posting schedule transfer: [error message]"

### Phase 3: Create Helper Functions

#### 3a. _prepareSchedulePayload()
Private function that orchestrates payload construction:
1. Gets the config wizard model
2. Gets selected company data for companyCode
3. Calls `_buildSchedulePayerAccounts()` → `payerAccount` array
4. Calls `_buildSchedulePayeeAccount()` → `payeeAccount` object
5. Calls `_buildScheduleTransferConfig()` → `transferConfiguration` object
6. Returns object: `{ parameters: { companyCode, payerAccount, payeeAccount, transferConfiguration } }`

#### 3b. _buildSchedulePayerAccounts()
Private function that builds the payer accounts array:
1. Gets all selected accounts using `_getSelectedStep2Accounts()`
2. Gets model data: selectedSaldoType, selectedHorario, saldosPersonalizadosPorBanco, saldosPersonalizadosPorCuenta, horariosPersonalizadosPorBanco, horariosPersonalizadosPorCuenta
3. For each selected account:
   - Extract: houseBankId, houseBankAccId, currency from account data
   - Determine amount:
     - If selectedSaldoType === 0: lookup in saldosPersonalizadosPorBanco by bank name, get saldoPersonalizadoInput, parse with `_parseLocalizedNumber()`
     - If selectedSaldoType === 1: lookup in saldosPersonalizadosPorCuenta by account cuentaCorriente, get saldoPersonalizadoInput, parse with `_parseLocalizedNumber()`
   - Format amount to 2 decimals (paymAmount) and 8 decimals (paymAmountLong)
   - Determine execution time:
     - If selectedHorario === 1: lookup in horariosPersonalizadosPorBanco by bank name, get selectedHorario time
     - If selectedHorario === 2: lookup in horariosPersonalizadosPorCuenta by account cuentaCorriente, get selectedHorario time
   - Build payer account object: { houseBankId, houseBankAccId, amounts: { paymCurr, paymAmount, paymAmountLong, executionTime } }
4. Return array of payer accounts

#### 3c. _buildSchedulePayeeAccount()
Private function that builds the destination account:
1. Gets the config wizard model
2. Gets review object: review.cuentaDestinoBanco, review.cuentaDestinoCuenta (or equivalent review fields)
3. Gets _cuentasCentralAll from model data
4. Finds the account in _cuentasCentralAll matching the review destination account
5. Extracts from account:
   - houseBankId: account.HouseBank
   - houseBankAccId: account.AccountId
   - partnerAccount: account.PartnerAccount.slice(2)
6. Returns object: { houseBankId, houseBankAccId, partnerAccount }

#### 3d. _buildScheduleTransferConfig()
Private function that builds transfer configuration:
1. Gets the config wizard model
2. Gets model properties: dias (object), selectedSaldoType (number), selectedHorario (number)
3. Build transferTimeType: hardcoded 1
4. Build daysOfWeek array:
   - Map dias object keys to numbers: monday→1, tuesday→2, ..., sunday→7
   - Filter to only selected days (where value is true)
   - Sort in ascending order
5. Build balanceType: selectedSaldoType + 1
6. Build startDate:
   - Create new Date()
   - Format as YYYY-MM-DD string (use toISOString().split('T')[0] or custom formatter)
7. Build endDate:
   - Create new Date() and add 365 days
   - Format as YYYY-MM-DD string
8. Returns object: { transferTimeType, daysOfWeek, balanceType, startDate, endDate }

## Key Implementation Notes

### Validation
- **NO additional validation needed** in helper functions. By the time `onWizardAccept()` is called, we are guaranteed that:
  - Step 4 validation passed: horario selected, at least one day selected
  - Step 5 validation passed: all saldo inputs (if custom) are valid numbers
  - This is enforced by wizard navigation logic (Next button disabled if step invalid)

### Currency & Amounts
- Preserve each account's native currency (use account.Currency or account.currency from account data)
- Format amounts using `_parseLocalizedNumber()` (already exists in controller)
- Convert parsed number to fixed-decimal strings: `.toFixed(2)` and `.toFixed(8)`

### Date Handling
- startDate: `new Date()` today
- endDate: Add 365 days to today
- Format both as "YYYY-MM-DD" using JavaScript Date methods or utilities

### Data Flow
1. Selected accounts (step 2) → _getSelectedStep2Accounts() → payer accounts
2. Selected destination account (step 3) + review data → _buildSchedulePayeeAccount() → payee account
3. Selected horarios (step 4) → horariosPersonalizadosPorBanco/Cuenta → execution times in payer accounts
4. Selected saldos (step 5) → saldosPersonalizadosPorBanco/Cuenta → amounts in payer accounts
5. Selected dias + saldoType (steps 4-5) → transferConfiguration

## Error Handling
- Wrap OData invoke in .then().catch() pattern (same as onAnotherButtonPress)
- On error: MessageToast shows error.error.message or generic message
- On success: MessageToast shows success message, dialog closes (same flow as transfer wizard)

## Testing Checklist
- [ ] All selected accounts appear in payerAccount array
- [ ] Amount calculation matches selected saldo type (per banco vs per cuenta)
- [ ] Execution times match selected horario type (per banco vs per cuenta)
- [ ] balanceType = selectedSaldoType + 1
- [ ] daysOfWeek array contains only selected days in correct mapping (1-7)
- [ ] startDate is today's date
- [ ] endDate is 1 year from today
- [ ] OData payload structure matches expected format
- [ ] Success/error MessageToast displays correctly
- [ ] Dialog closes after successful submission
- [ ] Error toast shows when backend returns error
