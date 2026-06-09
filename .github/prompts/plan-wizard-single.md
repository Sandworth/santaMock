## Plan: Wizard de transferencia puntual

TL;DR - Añadir un nuevo diálogo-wizard para transferencias puntuales reutilizando el patrón del `WizardDialog` existente. Crear un modelo local `webapp/model/wizardTransferData.json`, un fragmento `webapp/view/fragments/WizardTransferDialog.fragment.xml` (versión reducida del Wizard original) y añadir métodos en `webapp/controller/Treasury.controller.js` para abrir/gestionar el diálogo sin afectar al wizard existente.

**Steps**
1. Crear modelo de datos: `webapp/model/wizardTransferData.json` — basado en `wizardData.json` pero simplificado: mantener `empresas`, `bancos` (con `cuentas`), `cuentasCentralizadoras`, `horariosUnicos`, `review`, `nav` y claves necesarias para inputs del wizard; eliminar arrays y propiedades relacionadas con pasos que desaparecen (horariosPersonalizadosPorBanco/cuenta, saldosPersonalizadosPorBanco/cuenta si no se usan).

2. Crear fragmento UI: `webapp/view/fragments/WizardTransferDialog.fragment.xml` — copiar la estructura de `WizardDialog.fragment.xml` y modificarla:
   - Root dialog id: `wizardTransferDialog`.
   - Inner wizard id: `transferConfigWizard`.
   - Steps:
     - `wizardTransferStep1`: idéntico al `wizardStep1` (empresa).
     - `wizardTransferStep2`: similar a `wizardStep2` pero permitir seleccionar sólo UNA cuenta de origen; cambiar labels/IDs a "Cuenta de Origen" y elementos asociados (`bancosListStep2Transfer`, tablas singleSelect).
     - `wizardTransferStep3`: similar a `wizardStep3` pero con label "Cuenta de Destino" (single select).
     - OMITIR paso 4 del wizard original.
     - `wizardTransferStep4`: (antes step 5) contiene un único input para el importe de la transferencia (usar mismo formatter/localized input pattern), y radiogroup/buttons si es necesario (mínimo: input con `id=transferAmountInput`).
     - `wizardTransferStep5` (review): mostrar resumen similar a review original; incluir secciones que muestren "Cuenta de Origen" y "Cuenta de Destino" con la misma presentación usada en el wizard principal.
   - Botones: Cancel / Back / Next / Accept vinculados a `wizard>/nav/*` del modelo de transferencia.
   - Añadir `data-key`/`data-scope` cuando haga falta (por ejemplo para inputs localizados) usando el mismo patrón que el wizard original para facilitar reutilización de lógica.

3. Modificar `webapp/controller/Treasury.controller.js` (añadir métodos, sin cambiar el wizard existente):
   - Implementar `onCreateSingleTransfer()` — abrirá el nuevo modelo y fragmento siguiendo el patrón `_openWizardDialog()`:
     - Crear `const oTransferModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/wizardTransferData.json"));`
     - En `attachRequestCompleted` guardar backups `_empresasAll`, `_bancosAll`, `_cuentasCentralAll` si se usan, asignar como modelo `this.getView().setModel(oTransferModel, "wizardTransfer");` y llamar `_openTransferWizardDialogFragment()`.
     - En `attachRequestFailed` mostrar `MessageToast` similar al otro.
   - Añadir `_openTransferWizardDialogFragment()` — espejo de `_openWizardDialogFragment()` pero usando fragment `WizardTransferDialog` y cache key `_wizardTransferDialog`/`_transferWizardDialog`.
   - Añadir `_getTransferWizardModel()` helper que devuelva `this.getView().getModel("wizardTransfer")`.
   - Añadir `_setTransferWizardPropertyIfChanged(sPath, vValue)` si se reusa lógica de set-if-changed.
   - Reutilizar handlers del wizard principal cuando sea posible (búsquedas, selección de empresa) apuntando al modelo `wizardTransfer` y a los control IDs del nuevo fragment (puede requerir duplicar ligeros wrappers: `onEmpresaSearchTransfer`, `onCuentasSelectionChangeTransfer`, `onCuentaDestinoSelectionChangeTransfer`, `onTransferAmountChange`, `onTransferReviewActivate`). Mantener esos wrappers simples y delegar en funciones existentes cuando no dependan del modelo nombre (p.ej. reusar `_normalizeNifSearch` y formateadores).
   - Añadir `onTransferAccept()` para cerrar el diálogo y, opcionalmente, preparar el payload para enviar a backend (fuera del alcance salvo si el usuario lo pide).

4. i18n: añadir claves nuevas o reutilizar las existentes en `webapp/i18n/i18n.properties` y `i18n_en.properties` para los textos distintos: labels "Cuenta de Origen", "Cuenta de Destino", y el título del diálogo y mensajes de éxito/error.

5. Tests/Verificación manual:
   - Ejecutar `npm run lint` (o `npx @ui5/linter`) y corregir advertencias relacionadas con las nuevas funciones/fragmento.
   - Correr la app (`npm start` o `npm run start-local`) y navegar a la pestaña Treasury.
   - Pulsar el botón/acción que invoque `onCreateSingleTransfer` y verificar:
     - Se abre el diálogo `wizardTransferDialog` con datos cargados.
     - Paso 1: selección de empresa funciona igual.
     - Paso 2: solamente se puede seleccionar UNA cuenta de origen (tabla singleSelect), y la label muestra "Cuenta de Origen".
     - Paso 3: selección de cuenta destino con label "Cuenta de Destino".
     - Paso 4: sólo el input del importe (acepta formato localizado); validación de entrada y navegación habilitan "Next/Accept".
     - Paso Review: muestra Origen, Destino, Importe y demás resumen.
   - Ejecutar el linter del proyecto otra vez y asegurar 0 nuevas infracciones.

**Relevant files**
- `webapp/model/wizardTransferData.json` — crear.
- `webapp/view/fragments/WizardTransferDialog.fragment.xml` — crear (based on `webapp/view/fragments/WizardDialog.fragment.xml`).
- `webapp/controller/Treasury.controller.js` — añadir funciones: `onCreateSingleTransfer`, `_openTransferWizardDialogFragment`, `_getTransferWizardModel`, helpers de set-if-changed y wrappers de handlers (nombrados con suffix `Transfer`).
- `webapp/i18n/i18n.properties` and `i18n_en.properties` — añadir labels nuevos.

**Verification**
1. Manual: iniciar app y abrir diálogo; probar cada paso y navegación; verificar que sólo se puede seleccionar una cuenta origen y que el importe acepta formato localizado.
2. Linter: `npm run lint` o `npx @ui5/linter` — asegurarse de que no se introducen nuevas reglas rotas.
3. Optional: agregar un pequeño QUnit test en `webapp/test/unit/controller/Treasury.controller.js` que instantiates controller and calls `onCreateSingleTransfer` and asserts the model `wizardTransfer` exists (lightweight smoke test).

**Decisions / Assumptions**
- Reutilizaremos la mayor parte de la lógica existente (formatters, búsqueda, normalize helpers) y sólo añadiremos wrappers puntuales para apuntar al nuevo modelo y fragment.
- No se implementa envío al backend; el diálogo solo prepara el objeto JSON con los datos de la transferencia. Si en el futuro quieres envío, lo añadiré usando el patrón `bindContext('/postBankTransfer(...)')`.
- IDs de controles del fragment deben ser únicos respecto al wizard original para evitar colisiones; por eso usamos sufijos `Transfer` en ids.

**Further Considerations**
1. Confirmado: no se enviará al backend en esta entrega; implementación futura opcional.
2. ¿Deseas validar saldo disponible o moneda/compatibilidad entre origen y destino en este primer PR?


