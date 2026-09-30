# Plan Reformulado: Refactorización de Wizards de Transferencias - Cashpool

## TL;DR
Unificar la lógica compartida de ambos wizards (automático y puntual) mediante parametrización smart:
- Consolidar **10 handlers duplicados → 4 genéricos** (60% menos)
- Crear **infraestructura parametrizable** con diccionario de configuración
- **Unificar búsquedas de cuentas centrales/destino** (son idénticas)
- Reducir ~2000 líneas a ~1600 (20% simplificación)

Mantener modelos separados ("wizard" vs "wizardTransfer") con estructura `/review` diferenciada.

---

## Arquitectura Base: _wizardConfigs

```javascript
_wizardConfigs: {
    config: {
        modelName: "wizard",
        dialogId: "wizardDialog",
        wizardId: "configWizard",
        step1Id: "wizardStep1",
        empresaTableId: "empresaTable",
        bancosListId: "bancosListStep2",
        cuentaCentralTableId: "cuentaCentralTable",  // ← para búsqueda centralizada
        instanceVar: "_wizardDialog",
        hasScheduling: true  // distingue config automática
    },
    transfer: {
        modelName: "wizardTransfer",
        dialogId: "wizardTransferDialog",
        wizardId: "transferConfigWizard",
        step1Id: "wizardTransferStep1",
        empresaTableId: "empresaTableTransfer",
        bancosListId: "bancosListTransferStep2",
        cuentaCentralTableId: "cuentaDestinoTable",  // ← CLAVE: mismo uso, diferente ID
        instanceVar: "_transferWizardDialog",
        hasScheduling: false
    }
}
```

**Clave**: El transfer usa `cuentaDestinoTable` pero se llama "cuentaCentralTableId" en la config → unifica lógica sin romper IDs XML.

---

## Unificación de Búsquedas de Cuentas Centralizadas

### Análisis: onCuentaCentralSearch vs onCuentaDestinoSearchTransfer

**Función 1**: `onCuentaCentralSearch` (config)
```javascript
const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
const oModel = this._getWizardModel();  // ← "wizard"
const aAll = oModel.getProperty("/_cuentasCentralAll");
const aFiltered = sQuery
    ? aAll.filter(o => o.Description.toLowerCase().includes(sQuery) || o.HouseBank... || o.cuentaCorriente...)
    : aAll.slice();
oModel.setProperty("/cuentasCentralizadoras", aFiltered);
```

**Función 2**: `onCuentaDestinoSearchTransfer` (transfer)
```javascript
const sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
const oModel = this._getTransferWizardModel();  // ← "wizardTransfer"
const aAll = oModel.getProperty("/_cuentasCentralAll") || [];
if (!sQuery) {
    oModel.setProperty("/cuentasCentralizadoras", aAll.slice());
    return;
}
const aFiltered = aAll.filter(o => o.Description.toLowerCase().includes(sQuery) || o.HouseBank... || o.cuentaCorriente...);
oModel.setProperty("/cuentasCentralizadoras", aFiltered);
```

**Diferencias:**
- ✅ Modelos diferentes (resuelto con parametrización)
- ✅ Mismo origen: `/_cuentasCentralAll`
- ✅ Mismo destino: `/cuentasCentralizadoras`
- ✅ Mismo filtro (Description, HouseBank, cuentaCorriente)

**Conclusión**: Se unifican en `_onCuentaCentralSearch(oEvent, sType)`

---

## Solución en 6 Fases (REVISADO)

### **Fase 1: Infraestructura Parametrizable** ✅
- Crear objeto `_wizardConfigs` (incluye `cuentaCentralTableId`)
- **Reemplazar** `_getWizardModel()` por `_getWizardModel(sType = "config")` → obtiene modelo "wizard" o "wizardTransfer" según parámetro
- Reemplazar también `_getTransferWizardModel()` → ya no necesario
- Crear `_setPropertyIfChanged(sModelName, sPath, vValue)` → genérica para cualquier modelo
- Crear `_setWizardPropertyIfChanged(sType, sPath, vValue)` → wrapper

**En XML**: Agregar `data-wizard-type="config|transfer"` a SearchFields

**Comentar (no eliminar)**:
- `_setModelPropertyIfChanged()` → `_setPropertyIfChanged()` (si existe)

---

### **Fase 2: Búsquedas Parametrizadas** (6 → 3 + wrappers)

**Privados parametrizados:**
1. `_onEmpresaSearch(oEvent, sType)` → Consolida `onEmpresaSearch` + `onEmpresaSearchTransfer`
2. `_onBancosSearch(oEvent, sType)` → Consolida `onCuentasSearch` + `onCuentasSearchTransfer`
3. `_onCuentaCentralSearch(oEvent, sType)` → Consolida `onCuentaCentralSearch` + `onCuentaDestinoSearchTransfer` ⭐

**Públicos (wrappers):**
```javascript
onEmpresaSearch(oEvent) { 
    const sType = oEvent.getSource().data("wizard-type") || "config";
    return this._onEmpresaSearch(oEvent, sType); 
}
onCuentasSearch(oEvent) { 
    const sType = oEvent.getSource().data("wizard-type") || "config";
    return this._onBancosSearch(oEvent, sType); 
}
onCuentaCentralSearch(oEvent) { 
    const sType = oEvent.getSource().data("wizard-type") || "config";
    return this._onCuentaCentralSearch(oEvent, sType); 
}
```

**En XML**: Ya preparado en Fase 1 con `data-wizard-type`

---

### **Fase 3: Dialog Lifecycle** (4 → 1 + detector)

**Función helper:**
```javascript
_getWizardTypeFromDialog(oDialog) {
    const sDialogId = oDialog?.getId() || "";
    return sDialogId.includes("Transfer") ? "transfer" : "config";
}
```

**Públicos genéricos:**
```javascript
onWizardDialogAfterOpen(oEvent) {
    const oDialog = oEvent.getSource();
    const sType = this._getWizardTypeFromDialog(oDialog);
    const oConfig = this._wizardConfigs[sType];
    const oWizard = this.byId(oConfig.wizardId);
    const iIndex = oWizard.getSteps().indexOf(oWizard.getCurrentStep());
    this._updateNavState(sType, Math.max(0, iIndex));
}

onWizardDialogAfterClose(oEvent) {
    const oDialog = oEvent.getSource();
    const sType = this._getWizardTypeFromDialog(oDialog);
    this._resetWizard(sType);
}
```

**En XML**: 
```xml
<!-- WizardDialog -->
<Dialog afterOpen=".onWizardDialogAfterOpen" afterClose=".onWizardDialogAfterClose">

<!-- WizardTransferDialog -->
<Dialog afterOpen=".onWizardDialogAfterOpen" afterClose=".onWizardDialogAfterClose">
```

**Comentar**:
- `onTransferWizardDialogAfterOpen()` → Remoto, usa genérico
- `onTransferWizardDialogAfterClose()` → Remoto, usa genérico

---

### **Fase 4: Reseteo Wizard** (2 → 1 parametrizada)

```javascript
_resetWizard(sType = "config") {
    const oConfig = this._wizardConfigs[sType];
    const oWizard = this.byId(oConfig.wizardId);
    const oStep1 = this.byId(oConfig.step1Id);
    
    if (!oWizard || !oStep1) return;
    
    // Reset navegación
    oWizard.discardProgress(oStep1);
    oWizard.getSteps().forEach(step => oWizard.invalidateStep(step));
    
    // Reset tablas
    const oEmpresaTable = this.byId(oConfig.empresaTableId);
    if (oEmpresaTable) oEmpresaTable.removeSelections(true);
    
    const oCentralTable = this.byId(oConfig.cuentaCentralTableId);
    if (oCentralTable) oCentralTable.removeSelections(true);
    
    // Limpiar estado (MANTIENE diferenciación por tipo)
    if (sType === "config") {
        this._clearWizardDependentState();
    } else {
        this._clearTransferWizardDependentState();
    }
}
```

**Comentar**:
- `_resetTransferWizard()` → Usa `_resetWizard("transfer")`

---

### **Fase 5: Selecciones & Validación** (6 → 3 parametrizadas + wrappers)

**Privados parametrizados:**
```javascript
_onEmpresaSelectionChange(sType) {
    // Obtiene tabla, extrae empresa, ejecuta postSelectCompany, carga bancos
}

_onCuentasSelectionChange(sType) {
    // Valida step 2, construye horarios/saldos si config
}

_setWizardStepValidation(sType, sStepId, bValid) {
    const oConfig = this._wizardConfigs[sType];
    const oWizard = this.byId(oConfig.wizardId);
    const oStep = this.byId(sStepId);
    if (oWizard && oStep) {
        bValid ? oWizard.validateStep(oStep) : oWizard.invalidateStep(oStep);
    }
}
```

**Públicos (wrappers):**
```javascript
onEmpresaSelectionChange() { return this._onEmpresaSelectionChange("config"); }
onEmpresaSelectionChangeTransfer() { return this._onEmpresaSelectionChange("transfer"); }

onCuentasSelectionChange() { return this._onCuentasSelectionChange("config"); }
// Transfer no tiene equivalente (arquitectura diferente)

// Mantener SelectionChange de cuentas centrales como es (son específicas)
onCuentaCentralSelectionChange() { }
onCuentaDestinoSelectionChange() { }
```

---

### **Fase 6: Navegación Consolidada** (No duplicar _updateNavState)

```javascript
_updateNavState(sType, iIndex) {
    const oConfig = this._wizardConfigs[sType];
    const oModel = this._getWizardModel(sType);
    const oWizard = this.byId(oConfig.wizardId);
    
    if (!oModel || !oWizard) return;
    
    const aSteps = oWizard.getSteps();
    const bIsFirst = iIndex === 0;
    const bIsLast = iIndex === aSteps.length - 1;
    
    // Validación específica por tipo y paso
    let bCurrentValid = false;
    if (iIndex === 0) {
        const oEmpresaTable = this.byId(oConfig.empresaTableId);
        bCurrentValid = !!oEmpresaTable && oEmpresaTable.getItems().some(i => i.getSelected())
                     && !!oModel.getProperty("/companyContextReady");
    } else if (oWizard.getSteps()[iIndex]) {
        bCurrentValid = aSteps[iIndex].getValidated();
    }
    
    this._setPropertyIfChanged(oConfig.modelName, "/nav/backVisible", iIndex > 0);
    this._setPropertyIfChanged(oConfig.modelName, "/nav/nextVisible", !bIsLast);
    this._setPropertyIfChanged(oConfig.modelName, "/nav/nextEnabled", bCurrentValid);
    this._setPropertyIfChanged(oConfig.modelName, "/nav/acceptVisible", bIsLast);
}
```

**Comentar**:
- `_updateTransferNavState()` → Usa `_updateNavState("transfer", iIndex)`

---

## Mapeo: Consolidación Detallada

| Antes (Duplicados) | Después (Consolidado) | Fase | XML Changes |
|--------------------|----------------------|------|-------------|
| `onEmpresaSearch` + `onEmpresaSearchTransfer` | `_onEmpresaSearch(oEvent, sType)` + wrapper | 2 | data-wizard-type |
| `onCuentasSearch` + `onCuentasSearchTransfer` | `_onBancosSearch(oEvent, sType)` + wrapper | 2 | data-wizard-type |
| `onCuentaCentralSearch` + `onCuentaDestinoSearchTransfer` | `_onCuentaCentralSearch(oEvent, sType)` + wrapper | **2** | data-wizard-type |
| `onWizardDialogAfterOpen` + `onTransferWizardDialogAfterOpen` | `onWizardDialogAfterOpen(oEvent)` + detector | 3 | afterOpen handler |
| `onWizardDialogAfterClose` + `onTransferWizardDialogAfterClose` | `onWizardDialogAfterClose(oEvent)` + detector | 3 | afterClose handler |
| `_resetWizard()` + `_resetTransferWizard()` | `_resetWizard(sType)` | 4 | (sin cambios) |
| `_updateNavState()` + `_updateTransferNavState()` | `_updateNavState(sType, iIndex)` | 6 | (sin cambios) |
| `onEmpresaSelectionChange` + `onEmpresaSelectionChangeTransfer` | `_onEmpresaSelectionChange(sType)` + wrappers | 5 | (sin cambios) |

**Total**: 10 handlers públicos duplicados → 4 genéricos + wrappers (60% reducción)

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `cashpool/webapp/controller/Treasury.controller.js` | +400 líneas (helpers parametrizados), ~500 líneas comentadas (viejos) |
| `cashpool/webapp/view/fragments/WizardDialog.fragment.xml` | Agregar `data-wizard-type="config"` a 3 SearchFields, cambiar 2 handlers (afterOpen/Close) |
| `cashpool/webapp/view/fragments/WizardTransferDialog.fragment.xml` | Agregar `data-wizard-type="transfer"` a 3 SearchFields, cambiar 2 handlers (afterOpen/Close) |

---

## Características Críticas Preservadas ✅

- ✅ **Búsquedas locales**: Cada wizard filtra solo su propio modelo (`/_empresasAll`, `/_bancosAll`)
- ✅ **postSelectCompany**: Se ejecuta en ambos al seleccionar empresa
- ✅ **Filtro SANT**: Destino solo muestra centralizadas (HouseBank.startsWith("SANT"))
- ✅ **Review diferenciado**: Config = horarios + saldos; Transfer = empresa + cuentas + importe
- ✅ **Datos iniciales**: Ambos cargan empresas desde `/getBalanceOfCompanies()`
- ✅ **_clearWizard*()**: Se mantienen separadas (estructuras `/review` diferentes)

---

## Orden de Implementación (por Agente)

1. Fase 1: `_wizardConfigs` + helpers base → Test: sin cambios visuales
2. Fase 2: Búsquedas parametrizadas → Test: filtros OK en ambos
3. Fase 3: Dialog lifecycle genérico → Test: abrir/cerrar limpio
4. Fase 4: `_resetWizard(sType)` → Test: reabre wizard limpio
5. Fase 5: Selecciones parametrizadas → Test: flujo completo
6. Fase 6: Navegación consolidada → Test: todos los pasos
7. Limpieza: Comentar métodos viejos, verificar no hay errores

---

## Notas Críticas

- **No modificar**: `_clearWizardDependentState()`, `_clearTransferWizardDependentState()` (diferentes estructuras)
- **Eliminar completamente**: `_getTransferWizardModel()` → Reemplazada por `_getWizardModel("transfer")`
- **Comentar, no eliminar**: Todos los demás métodos viejos (para referencia y rollback)
- **XML mínimo**: Solo agregar atributos, no remover elementos
- **Insertar en línea ~710**: Después de `_getViewModel()`, antes de otros helpers

---

## Fecha de Creación
Creado: 2026-09-21

## Estado
✅ Plan reformulado y aprobado para implementación por agente
