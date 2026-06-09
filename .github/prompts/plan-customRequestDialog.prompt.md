# Plan: Implementar Dialog de Solicitud de Depósito Personalizado

## TL;DR
Crear un Dialog reutilizable (`CustomRequestDialog.fragment.xml`) que guíe al usuario secuencialmente a través de 5 pasos (Moneda → DateRange → Rate interpolada → Cuenta → Importe), con cálculos de retorno esperado. El Dialog usa fragmento XML (elegible para i18n), y el flujo final abre un segundo Dialog de confirmación similar al de DepositDetail.

---

## Steps

### **Fase 1: Estructura del Fragment y Modelos (Paso 0)**
1. Crear `CustomRequestDialog.fragment.xml` con estructura:
   - Dialog container con título "Solicitar Depósito Personalizado"
   - ScrollContainer para todo el contenido
   - 5 secciones secuenciales en FormLayout (cada una un VBox con Label + control)
   - Footer con botones "Cancelar" y "Solicitar Depósito"
   - Todos los controles deshabilitados por defecto (`enabled=false`)

2. Crear modelo `customRequest` en DepositsList.controller.js con propiedades:
   ```javascript
   {
       currency: "",           // seleccionada en paso 1
       dateFrom: null,         // paso 2
       dateTo: null,           // paso 2
       rateInterpolated: 0,    // calculado en paso 2
       tenorDays: 0,           // calculado en paso 2
       tenorMonths: 0,         // calculado en paso 2
       account: "",            // paso 4
       amount: 0,              // paso 5
       expectedReturn: 0,      // calculado en paso 5
       expectedTotal: 0,       // calculado en paso 5
       accountsFiltered: [],   // depósitos para filtrar cuentas
       step1Enabled: true,
       step2Enabled: false,
       step3Enabled: false,
       step4Enabled: false,
       step5Enabled: false
   }
   ```

3. Cargar depósitos completos (con navegaciones) en el modelo `mainService`:
   - Verificar que `/value` contiene depósitos con `to_TenorCode` y `to_CurrencyCode`
   - Crear estructura auxiliar `deposits` en el modelo para acceso rápido

---

### **Fase 2: Fragment XML - Layout de los 5 Pasos**
1. **Paso 1 - Select Moneda**: 
   - ComboBox con items EUR, USD, GBP (hardcoded o desde depósitos)
   - `selectedKey="{customRequest>/currency}"`, `selectionChange=".onStep1CurrencyChanged"`
   - Habilitado siempre (`enabled=true`)

2. **Paso 2 - DateRangeSelect**:
   - `sap.m.DateRangeSelection` 
   - Min: today, Max: today + 365 days (máximo 12 meses)
   - `startDateValue="{customRequest>/dateFrom}"`, `endDateValue="{customRequest>/dateTo}"`
   - Event: `change=".onStep2DateRangeChanged"`
   - Deshabilitado hasta que paso 1 se complete

3. **Paso 3 - Interés Aplicable (readonly)**:
   - FormLayout con Label + ObjectNumber
   - Calcula y muestra `rateInterpolated` (% anual)
   - Unit: "%", state: "Information"
   - Deshabilitado (solo mostrar resultado)

4. **Paso 4 - Selector de Cuenta**:
   - ComboBox igual al de DepositDetail
   - Items vinculados a `customRequest>/accountsFiltered`
   - `selectionChange=".onStep4AccountChanged"`
   - Deshabilitado hasta completar paso 2

5. **Paso 5 - Importe + Botón Calcular**:
   - Input numérico para `amount`
   - HBox con Input + Button "Calcular" (icon "sap-icon://calculator")
   - Button press event: `.onStep5Calculate`
   - Input deshabilitado hasta paso 4

6. **Sección "Retorno Esperado"** (similar a DepositDetail):
   - Visible solo si paso 5 calculado (`visible="{= ${customRequest>/expectedReturn} > 0}"`)
   - Tres ObjectNumber en fila: Interest, Total, Currency
   - Estados: Success

---

### **Fase 3: Métodos en DepositsList.controller.js - Lógica Secuencial**

#### **onOpenCustomReq()**
- Crear o recuperar Dialog por ID
- Resetear modelo `customRequest` a valores iniciales
- Abrir Dialog (`.open()`)

#### **onStep1CurrencyChanged(oEvent)**
- Obtener moneda seleccionada
- Guardar en `customRequest>/currency`
- Habilitar paso 2: `customRequest>/step2Enabled = true`
- Resetear pasos 2-5

#### **onStep2DateRangeChanged(oEvent)**
- Obtener `dateFrom` y `dateTo`
- Validar: `dateTo > dateFrom`
- Calcular `tenorDays = (dateTo - dateFrom) en días`
- Calcular `tenorMonths = tenorDays / 30.5`
- Llamar `_interpolateRate()` para calcular `rateInterpolated`
- Habilitar paso 4: `customRequest>/step4Enabled = true`
- Resetear pasos 4-5

#### **_interpolateRate()**
- Obtener moneda desde `customRequest>/currency`
- Obtener tenorMonths desde `customRequest>/tenorMonths`
- Buscar en modelo `mainService>/value`:
  - Depósito con `tenor < tenorMonths` más cercano (ej. 1M si tenorMonths=1.16)
  - Depósito con `tenor > tenorMonths` más cercano (ej. 2M si tenorMonths=1.16)
  - Ambos con `currency === seleccionada`
- Si no hay ambos → usar el más cercano (no interpolar)
- Aplicar fórmula interpolación lineal:
  - `rate_interpolated = rate_lower + (rate_upper - rate_lower) × (tenorMonths - tenor_lower_months) / (tenor_upper_months - tenor_lower_months)`
- Guardar `customRequest>/rateInterpolated`
- Actualizar paso 3 (ya visible y calculado)

#### **onStep4AccountChanged(oEvent)**
- Obtener cuenta seleccionada
- Habilitar paso 5: `customRequest>/step5Enabled = true`

#### **onStep5Calculate()**
- Obtener `amount` desde input
- Validar: amount > 0
- Calcular interés:
  ```javascript
  const iMonths = this.getModel("customRequest").getProperty("/tenorMonths");
  const fRate = this.getModel("customRequest").getProperty("/rateInterpolated");
  const fAmount = parseFloat(sAmount);
  const fInterest = fAmount * (fRate / 100) * (iMonths / 12);
  const fTotal = fAmount + fInterest;
  ```
- Guardar: `expectedReturn`, `expectedTotal`
- Mostrar sección "Retorno Esperado"

#### **onCancelCustomRequest()**
- Cerrar Dialog
- Resetear modelo `customRequest`
- Destruir Dialog (`.destroy()`) si aplica

#### **onSubmitCustomRequest()**
- Recuperar datos del modelo `customRequest`
- Construir mensaje de confirmación (similar a DepositDetail):
  - "Deseas solicitar un depósito personalizado de [amount] [currency]?"
  - "Tenor: [tenorDays] días ([tenorMonths] meses)"
  - "Tasa aplicable: [rateInterpolated]%"
  - "Retorno esperado: [expectedReturn] [currency]"
- Mostrar `MessageBox.confirm()` con acciones YES/NO
- Si YES: cerrar Dialogs, mostrar `MessageToast.show("Solicitud enviada")` (o enviar a backend)
- Si NO: cerrar MessageBox, mantener Dialog abierto

---

### **Fase 4: Métodos Helper y Utilidades**

#### **_filterAccountsByCurrency() en onStep2DateRangeChanged**
- Reutilizar lógica de DepositDetail
- Obtener todas las cuentas del modelo "banks"
- Filtrar por `currency === customRequest>/currency`
- Guardar en `customRequest>/accountsFiltered`

#### **_getDepositsByTenorAndCurrency(fTenorMonths, sCurrency)**
- Búsqueda lineal en `mainService>/value`
- Retornar `{ lower: {...}, upper: {...} }` o `{ single: {...} }` si solo hay uno

#### **_convertDateRangeToDays(oDateFrom, oDateTo)**
- Calcular diferencia en milisegundos
- Dividir por (1000 * 60 * 60 * 24)
- Retornar entero

---

### **Fase 5: Internacionalización (i18n.properties)**
Añadir textos:
```properties
customReqDialogTitle=Solicitar Depósito Personalizado
customReqStep1Label=Seleccionar Moneda
customReqStep2Label=Rango de Fechas
customReqStep3Label=Interés Aplicable
customReqStep4Label=Cuenta de Origen
customReqStep5Label=Importe de la Solicitud
customReqCalculateBtn=Calcular
customReqCancelBtn=Cancelar
customReqSubmitBtn=Solicitar Depósito
customReqExpectedReturn=Retorno Esperado
customReqInterest=Interés
customReqTotal=Total
customReqConfirmMsg=¿Desea solicitar un depósito personalizado de {0} {1}?\nTenor: {2} días\nTasa: {3}%\nRetorno esperado: {4} {5}
customReqSuccessMsg=Solicitud de depósito personalizado enviada correctamente
```

---

## Relevant files
- **Crear**: `custom.deposits/webapp/view/CustomRequestDialog.fragment.xml` — Layout completo del Dialog
- **Modificar**: `custom.deposits/webapp/controller/DepositsList.controller.js` — Todos los métodos anteriores
- **Modificar**: `custom.deposits/webapp/i18n/i18n.properties` — Textos del Dialog
- **Modificar (opcional)**: `custom.deposits/webapp/i18n/i18n_es.properties` — Textos en español

---

## Verification
1. **UI Rendering**: Abrir DepositsList, hacer clic en botón "Solicitar depósito personalizado" → Dialog aparece
2. **Paso 1 - Moneda**: Seleccionar EUR → paso 2 (DateRangeSelect) se habilita
3. **Paso 2 - Fechas**: Seleccionar rango (ej. hoy a hoy+35 días) → paso 3 actualiza con rate interpolada
4. **Paso 3 - Rate**: Verificar que se muestra rate interpolada correctamente
5. **Paso 4 - Cuenta**: Verificar que solo aparecen cuentas de la moneda seleccionada
6. **Paso 5 - Importe**: Ingresar importe, clic "Calcular" → retorno esperado se calcula y muestra
7. **Confirmación**: Clic "Solicitar Depósito" → MessageBox.confirm aparece con datos correctos
8. **Cancelación**: Clic "Cancelar" → Dialog cierra y se resetean valores
9. **i18n**: Cambiar idioma a español → todos los textos traducidos aparecen

---

## Decisions
1. **Interpolación lineal**: Se usa fórmula `rate_interpolado = rate_lower + (rate_upper - rate_lower) × (tenorMonths - tenor_lower_months) / (tenor_upper_months - tenor_lower_months)`
2. **DateRangeSelection**: Se permite mínimo hoy, máximo hoy + 365 días (máximo 12 meses).
3. **Dialog reutilizable**: Fragment XML permite internacionalización clara y separación de concerns.
4. **Submittal**: No se envía realmente al backend; solo se muestra MessageBox.confirm (sin implementar POST). Si se requiere enviarlo, se necesitaría endpoint mock/real.
5. **Modelo mockeado**: Usar modelo `customRequest` en memoria sin persistencia.
