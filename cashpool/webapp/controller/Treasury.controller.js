sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "cashpool/app/cashpool/utils/Formatter",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (Controller, JSONModel, Fragment, Formatter, MessageToast, Filter, FilterOperator) => {
    "use strict";

    return Controller.extend("cashpool.app.cashpool.controller.Treasury", {
        onInit() {
            // Get i18n bundle for translations from component
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();

            // Initialize view model for dynamic data with internationalized content
            const oViewModel = new JSONModel({
                selectedTab: "tab1",
                tabs: [
                    {
                        key: "tab1",
                        text: oResourceBundle.getText("tabConsultaSaldos")
                    },
                    {
                        key: "tab2",
                        text: oResourceBundle.getText("tabTransferenciasManual")
                    },
                    {
                        key: "tab3",
                        text: oResourceBundle.getText("tabTransferenciasAuto")
                    },
                    {
                        key: "tab4",
                        text: oResourceBundle.getText("tabAprobaciones")
                    }
                ],
                transferencias: [
                    {
                        fecha: "22/04/2026",
                        origen: {
                            banco: oResourceBundle.getText("bancoA"),
                            oficina: "001",
                            cuenta: "0123456789"
                        },
                        destino: {
                            banco: oResourceBundle.getText("bancoB"),
                            oficina: "002",
                            cuenta: "9876543210"
                        },
                        saldoAntes: {
                            monto: 100000.00,
                            moneda: "USD"
                        },
                        saldoProgramado: {
                            monto: 0.00,
                            moneda: "USD"
                        },
                        valorTransferencia: {
                            monto: 10000.00,
                            moneda: "USD"
                        },
                        status: {
                            text: oResourceBundle.getText("statusPendiente"),
                            state: "Warning"
                        }
                    },
                    {
                        fecha: "21/04/2026",
                        origen: {
                            banco: oResourceBundle.getText("bancoC"),
                            oficina: "003",
                            cuenta: "5555666677"
                        },
                        destino: {
                            banco: oResourceBundle.getText("bancoD"),
                            oficina: "004",
                            cuenta: "1111222233"
                        },
                        saldoAntes: {
                            monto: 50000.00,
                            moneda: "USD"
                        },
                        saldoProgramado: {
                            monto: 0.00,
                            moneda: "USD"
                        },
                        valorTransferencia: {
                            monto: 5000.00,
                            moneda: "USD"
                        },
                        status: {
                            text: oResourceBundle.getText("statusAprobada"),
                            state: "Success"
                        }
                    },
                    {
                        fecha: "20/04/2026",
                        origen: {
                            banco: oResourceBundle.getText("bancoE"),
                            oficina: "005",
                            cuenta: "7777888899"
                        },
                        destino: {
                            banco: oResourceBundle.getText("bancoF"),
                            oficina: "006",
                            cuenta: "3333444455"
                        },
                        saldoAntes: {
                            monto: 75000.00,
                            moneda: "EUR"
                        },
                        saldoProgramado: {
                            monto: 0.00,
                            moneda: "EUR"
                        },
                        valorTransferencia: {
                            monto: 5000.00,
                            moneda: "EUR"
                        },
                        status: {
                            text: oResourceBundle.getText("statusRechazada"),
                            state: "Error"
                        }
                    }
                ]
            });

            this.getView().setModel(oViewModel, "view");
        },

        onTabSelect(oEvent) {
            const oSelectedKey = oEvent.getParameter("selectedKey");
            this.getView().getModel("view").setProperty("/selectedTab", oSelectedKey);
        },

        onDownloadReceipt(oEvent) {
            // Obtener la fila seleccionada
            const oSource = oEvent.getSource();
            const oBindingContext = oSource.getBindingContext("view");
            const oData = oBindingContext.getObject();

            // Aquí se implementaría la lógica para descargar el comprobante
            // Por ahora, mostrar un mensaje
            const sFormattedCurrency = Formatter.formatCurrency(oData.valorTransferencia.monto, oData.valorTransferencia.moneda);
            MessageToast.show(`Descargando comprobante de transferencia del ${oData.fecha} por el importe de ${sFormattedCurrency}`);
        },

        onAfterRendering() {
            this._openConfigurationDialog();
        },

        _openConfigurationDialog() {
            if (!this._configDialog) {
                Fragment.load({
                    id: this.getView().getId(),
                    name: "cashpool.app.cashpool.view.fragments.ConfigurationDialog",
                    controller: this
                }).then((oDialog) => {
                    this._configDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                });
            } else {
                this._configDialog.open();
            }
        },

        onConfigureNow() {
            if (this._configDialog) {
                this._configDialog.close();
            }
            this._openWizardDialog();
        },

        _openWizardDialog() {
            const oWizardModel = new JSONModel({
                selectedHorario: null,
                selectedSaldoType: null,
                dias: { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false },
                empresas: [
                    { razonSocial: "Empresa Alpha S.A.", cnpj: "12.345.678/0001-90" },
                    { razonSocial: "Beta Corporación Ltda.", cnpj: "98.765.432/0001-11" },
                    { razonSocial: "Gamma Holding S.A.", cnpj: "11.222.333/0001-44" },
                    { razonSocial: "Delta Inversiones S.A.", cnpj: "55.666.777/0001-22" }
                ],
                _empresasAll: null,
                bancos: [
                    { nombre: "Banco Nacional", cuentas: [
                        { nombre: "Cuenta Operativa", oficina: "001", cuentaCorriente: "0001-1" },
                        { nombre: "Cuenta Nómina", oficina: "001", cuentaCorriente: "0001-2" }
                    ]},
                    { nombre: "Banco Mercantil", cuentas: [
                        { nombre: "Cuenta Principal", oficina: "042", cuentaCorriente: "1234-5" }
                    ]}
                ],
                cuentasCentralizadoras: [
                    { nombre: "Cuenta Maestra", oficina: "001", cuentaCorriente: "9999-0" },
                    { nombre: "Cuenta Central EUR", oficina: "002", cuentaCorriente: "8888-1" }
                ],
                _cuentasCentralAll: null,
                review: { razonSocial: "", cnpj: "", cuentasSeleccionadas: "", cuentaCentralNombre: "", cuentaCentralCuenta: "", horario: "", dias: "", saldoAdicionalData: "" },
                nav: { backVisible: false, nextVisible: true, nextEnabled: false, acceptVisible: false }
            });

            // Store full lists for filtering
            oWizardModel.setProperty("/_empresasAll", oWizardModel.getProperty("/empresas").slice());
            oWizardModel.setProperty("/_cuentasCentralAll", oWizardModel.getProperty("/cuentasCentralizadoras").slice());

            this.getView().setModel(oWizardModel, "wizard");

            if (!this._wizardDialog) {
                Fragment.load({
                    id: this.getView().getId(),
                    name: "cashpool.app.cashpool.view.fragments.WizardDialog",
                    controller: this
                }).then((oDialog) => {
                    this._wizardDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    //this._resetWizard();
                    oDialog.open();
                });
            } else {
                //this._resetWizard();
                this._wizardDialog.open();
            }
        },

        _resetWizard() {
            const oWizard = this.byId("configWizard");
            const oStep1 = this.byId("wizardStep1");
            if (oWizard && oStep1) {
                oWizard.setCurrentStep(oStep1);
                oWizard.discardProgress(oStep1);
            }
        },

        onWizardCancel() {
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        onWizardAccept() {
            const oModel = this.getView().getModel("wizard");
            const oReview = oModel.getProperty("/review");
            MessageToast.show(`Configuración guardada: ${oReview.razonSocial} | ${oReview.cuentaCentralNombre} | ${oReview.horario}`);
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        onWizardDialogAfterClose() {
            // Cleanup hook
        },

        onReviewStepActivate() {
            const oModel = this.getView().getModel("wizard");

            // Empresa
            const oEmpresaTable = this.byId("empresaTable");
            const aEmpresaItems = oEmpresaTable ? oEmpresaTable.getItems() : [];
            const oSelectedEmpresa = aEmpresaItems.find((oItem) => oItem.getSelected());
            if (oSelectedEmpresa) {
                const oCtx = oSelectedEmpresa.getBindingContext("wizard");
                oModel.setProperty("/review/razonSocial", oCtx.getProperty("razonSocial"));
                oModel.setProperty("/review/cnpj", oCtx.getProperty("cnpj"));
            }

            // Cuenta Centralizadora
            const oCuentaTable = this.byId("cuentaCentralTable");
            const aCuentaItems = oCuentaTable ? oCuentaTable.getItems() : [];
            const oSelectedCuenta = aCuentaItems.find((oItem) => oItem.getSelected());
            if (oSelectedCuenta) {
                const oCtx = oSelectedCuenta.getBindingContext("wizard");
                //oModel.setProperty("/review/cuentaCentralNombre", oCtx.getProperty("nombre"));
                oModel.setProperty("/review/cuentaCentralNombre", "Santander");
                oModel.setProperty("/review/cuentaCentralCuenta", `${oCtx.getObject().nombre}\nOficina: ${oCtx.getObject().oficina}\nCuenta: ${oCtx.getObject().cuentaCorriente}`);
            }

            // Horario
            const oHorarioGroup = this.byId("horarioGroup");
            if (oHorarioGroup) {
                const oSelectedBtn = oHorarioGroup.getSelectedButton();
                oModel.setProperty("/review/horario", oSelectedBtn ? oSelectedBtn.getText() : "");
            }

            // Cuentas (TreeTable — filter out parent bank rows which lack cuentaCorriente)
            const oTreeTable = this.byId("cuentasTreeTable");
            if (oTreeTable) {
                const aIndices = oTreeTable.getSelectedIndices();
                const aCuentas = aIndices
                    .map((idx) => {
                        const oCtx = oTreeTable.getContextByIndex(idx);
                        return oCtx ? oCtx.getObject() : null;
                    })
                    .filter((o) => o && o.cuentaCorriente);
                oModel.setProperty("/review/cuentasSeleccionadas", aCuentas.map((c) => c.nombre).join(", ") || "-");
            }

            // Saldo adicional
            const oSaldoGroup = this.byId("saldoGroup");
            if (oSaldoGroup) {
                const oSelectedSaldo = oSaldoGroup.getSelectedButton();
                oModel.setProperty("/review/saldoAdicionalData", oSelectedSaldo ? oSelectedSaldo.getText() : "");
            }

            // Días
            const oDias = oModel.getProperty("/dias");
            const aDiasSeleccionados = Object.entries(oDias)
                .filter(([, bSelected]) => bSelected)
                .map(([sDay]) => sDay.charAt(0).toUpperCase() + sDay.slice(1));
            oModel.setProperty("/review/dias", aDiasSeleccionados.join(", ") || "-");
        },

        onEmpresaSearch(oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oModel = this.getView().getModel("wizard");
            const aAll = oModel.getProperty("/_empresasAll");
            const aFiltered = sQuery
                ? aAll.filter((o) => o.razonSocial.toLowerCase().includes(sQuery) || o.cnpj.toLowerCase().includes(sQuery))
                : aAll.slice();
            oModel.setProperty("/empresas", aFiltered);
        },

        onCuentasSearch(oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oTreeTable = this.byId("cuentasTreeTable");
            if (!oTreeTable) { return; }
            const oBinding = oTreeTable.getBinding("rows");
            if (!oBinding) { return; }
            if (sQuery) {
                oBinding.filter([new Filter("nombre", FilterOperator.Contains, sQuery)]);
            } else {
                oBinding.filter([]);
            }
        },

        onCuentaCentralSearch(oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oModel = this.getView().getModel("wizard");
            const aAll = oModel.getProperty("/_cuentasCentralAll");
            const aFiltered = sQuery
                ? aAll.filter((o) =>
                    o.nombre.toLowerCase().includes(sQuery) ||
                    o.oficina.toLowerCase().includes(sQuery) ||
                    o.cuentaCorriente.toLowerCase().includes(sQuery))
                : aAll.slice();
            oModel.setProperty("/cuentasCentralizadoras", aFiltered);
        },

        onWizardDialogAfterOpen() {
            const oWizard = this.byId("configWizard");
            const sCurrentId = oWizard.getCurrentStep();
            const aSteps = oWizard.getSteps();
            const iIndex = aSteps.findIndex((s) => s.getId() === sCurrentId);
            this._updateNavState(Math.max(0, iIndex));
        },

        _updateNavState(iIndex) {
            const oModel = this.getView().getModel("wizard");
            const oWizard = this.byId("configWizard");
            const aSteps = oWizard ? oWizard.getSteps() : [];
            const bIsLast = iIndex === aSteps.length - 1;
            const bCurrentValid = aSteps[iIndex] ? aSteps[iIndex].getValidated() : false;

            oModel.setProperty("/nav/backVisible", iIndex > 0);
            oModel.setProperty("/nav/nextVisible", !bIsLast);
            oModel.setProperty("/nav/nextEnabled", bCurrentValid);
            oModel.setProperty("/nav/acceptVisible", bIsLast);
            this._iCurrentStepIndex = iIndex;
        },

        onWizardNavChange(oEvent) {
            const oWizard = this.byId("configWizard");
            const oStep = oEvent.getParameter("step");
            const iIndex = oWizard.getSteps().indexOf(oStep);
            this._updateNavState(iIndex);
        },

        onWizardNext() {
            const oWizard = this.byId("configWizard");
            const iNext = this._iCurrentStepIndex + 1;
            oWizard.goToStep(oWizard.getSteps()[iNext]);
            oWizard.setCurrentStep(oWizard.getSteps()[iNext]);
            this._updateNavState(iNext);
        },

        onWizardBack() {
            const oWizard = this.byId("configWizard");
            const iPrev = this._iCurrentStepIndex - 1;
            oWizard.goToStep(oWizard.getSteps()[iPrev]);
            oWizard.setCurrentStep(oWizard.getSteps()[iPrev]);
            this._updateNavState(iPrev);
        },

        onEmpresaSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = this.byId("empresaTable").getItems().some((i) => i.getSelected());
            bValid ? oWizard.validateStep(this.byId("wizardStep1")) : oWizard.invalidateStep(this.byId("wizardStep1"));
            this._updateNavState(this._iCurrentStepIndex);
        },

        onCuentasSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = this.byId("cuentasTreeTable").getSelectedIndices().length > 0;
            bValid ? oWizard.validateStep(this.byId("wizardStep2")) : oWizard.invalidateStep(this.byId("wizardStep2"));
            this._updateNavState(this._iCurrentStepIndex);
        },

        onCuentaCentralSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = this.byId("cuentaCentralTable").getItems().some((i) => i.getSelected());
            bValid ? oWizard.validateStep(this.byId("wizardStep3")) : oWizard.invalidateStep(this.byId("wizardStep3"));
            this._updateNavState(this._iCurrentStepIndex);
        },

        onSaldoSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = !!this.byId("saldoGroup").getSelectedButton();
            bValid ? oWizard.validateStep(this.byId("wizardStep5")) : oWizard.invalidateStep(this.byId("wizardStep5"));
            this._updateNavState(this._iCurrentStepIndex);
        },

        onEditStep(oEvent) {
            const sStep = oEvent.getSource().data("step");
            const oWizard = this.byId("configWizard");
            if (oWizard) { 
                oWizard.goToStep(this.byId("wizardStep" + sStep)); 
                //oWizard.setCurrentStep(this.byId("wizardStep" + sStep)); 
                //this._updateNavState(parseInt(sStep, 10));
            }
        },

        onCloseDialog() {
            if (this._configDialog) {
                this._configDialog.close();
            }
        },

        onDialogClose() {
            // Handle dialog close event
        }
    });
});