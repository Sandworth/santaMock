sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "cashpool/app/cashpool/utils/Formatter",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text"
], (Controller, JSONModel, Fragment, Formatter, MessageToast, Dialog, Button, Text) => {
    "use strict";

    return Controller.extend("cashpool.app.cashpool.controller.Treasury", {
        onInit() {
            // Get i18n bundle for translations from component
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            this._oResourceBundle = oResourceBundle;

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
                        razonSocial: "Empresa Alpha S.A.",
                        cnpj: "12.345.678/0001-90",
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
                        razonSocial: "Empresa Alpha S.A.",
                        cnpj: "12.345.678/0001-90",
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
                        razonSocial: "Beta Corporación Ltda.",
                        cnpj: "98.765.432/0001-11",
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
                    },
                    {
                        razonSocial: "Gamma Holding S.A.",
                        cnpj: "11.222.333/0001-44",
                        fecha: "19/04/2026",
                        origen: {
                            banco: oResourceBundle.getText("bancoB"),
                            oficina: "007",
                            cuenta: "2468135790"
                        },
                        destino: {
                            banco: oResourceBundle.getText("bancoC"),
                            oficina: "008",
                            cuenta: "1357924680"
                        },
                        saldoAntes: {
                            monto: 62000.00,
                            moneda: "USD"
                        },
                        saldoProgramado: {
                            monto: 15000.00,
                            moneda: "USD"
                        },
                        valorTransferencia: {
                            monto: 4700.00,
                            moneda: "USD"
                        },
                        status: {
                            text: oResourceBundle.getText("statusPendiente"),
                            state: "Warning"
                        }
                    }
                ],
                transferenciasAgrupadas: [],
                _transferenciasAgrupadasAll: []
            });

            this.getView().setModel(oViewModel, "view");
            this._buildTransferenciasGroups();
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

        _buildTransferenciasGroups() {
            const oModel = this.getView().getModel("view");
            const aTransferencias = oModel.getProperty("/transferencias") || [];
            const oGroupsByKey = new Map();

            aTransferencias.forEach((oTransferencia) => {
                const sGroupKey = `${oTransferencia.razonSocial}|${oTransferencia.cnpj}`;
                if (!oGroupsByKey.has(sGroupKey)) {
                    oGroupsByKey.set(sGroupKey, {
                        razonSocial: oTransferencia.razonSocial,
                        cnpj: oTransferencia.cnpj,
                        expanded: false,
                        selectedCount: 0,
                        filters: {
                            dateFrom: null,
                            dateTo: null,
                            status: "ALL"
                        },
                        statusOptions: [
                            { key: "ALL", text: this._oResourceBundle.getText("allStatusesOption") },
                            { key: "Warning", text: this._oResourceBundle.getText("statusPendiente") },
                            { key: "Success", text: this._oResourceBundle.getText("statusAprobada") },
                            { key: "Error", text: this._oResourceBundle.getText("statusRechazada") }
                        ],
                        transferencias: [],
                        _allTransferencias: []
                    });
                }

                const oGroup = oGroupsByKey.get(sGroupKey);
                oGroup.transferencias.push(oTransferencia);
                oGroup._allTransferencias.push(oTransferencia);
            });

            const aGroups = Array.from(oGroupsByKey.values());
            aGroups.forEach((oGroup, iIndex) => {
                oGroup.activo = iIndex === 0;
            });
            oModel.setProperty("/_transferenciasAgrupadasAll", aGroups);
            oModel.setProperty("/transferenciasAgrupadas", aGroups.slice());
        },

        onTransferenciasGroupSearch(oEvent) {
            const sRawQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").trim();
            const sNormalizedQuery = this._normalizeCnpjSearch(sRawQuery);
            const oModel = this.getView().getModel("view");
            const aAllGroups = oModel.getProperty("/_transferenciasAgrupadasAll") || [];

            if (!sNormalizedQuery) {
                oModel.setProperty("/transferenciasAgrupadas", aAllGroups.slice());
                return;
            }

            const aFilteredGroups = aAllGroups.filter((oGroup) =>
                this._normalizeCnpjSearch(oGroup.cnpj).includes(sNormalizedQuery)
            );

            oModel.setProperty("/transferenciasAgrupadas", aFilteredGroups);
        },

        _normalizeCnpjSearch(sValue) {
            return (sValue || "").replace(/\D/g, "");
        },

        onTransferGroupActivationChange(oEvent) {
            const bNextState = oEvent.getParameter("state");
            const oSwitch = oEvent.getSource();
            const oContext = oSwitch.getBindingContext("view");
            if (!oContext || !bNextState) {
                return;
            }

            const oDialog = new Dialog({
                type: "Message",
                state: "Information",
                title: this._oResourceBundle.getText("activateTransferGroupTitle"),
                content: [
                    new Text({
                        text: this._oResourceBundle.getText("activateTransferGroupMessage")
                    })
                ],
                beginButton: new Button({
                    text: this._oResourceBundle.getText("activateDialogAccept"),
                    press: () => {
                        oDialog.close();
                    }
                }),
                endButton: new Button({
                    text: this._oResourceBundle.getText("activateDialogCancel"),
                    press: () => {
                        this.getView().getModel("view").setProperty(`${oContext.getPath()}/activo`, false);
                        oSwitch.setState(false);
                        oDialog.close();
                    }
                }),
                afterClose: () => {
                    oDialog.destroy();
                }
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        onTransferenciasSearch(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("view");
            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const oModel = this.getView().getModel("view");
            const oGroup = oModel.getProperty(sPath);
            const oFilters = oGroup.filters || {};

            const aFiltered = (oGroup._allTransferencias || []).filter((oTransferencia) => {
                const oTransferDate = this._parseTransferDate(oTransferencia.fecha);
                const oFromDate = this._normalizeDate(oFilters.dateFrom);
                const oToDate = this._normalizeDate(oFilters.dateTo);

                const bMatchesFrom = !oFromDate || (oTransferDate && oTransferDate >= oFromDate);
                const bMatchesTo = !oToDate || (oTransferDate && oTransferDate <= oToDate);
                const bMatchesStatus = oFilters.status === "ALL" || oTransferencia.status.state === oFilters.status;

                return bMatchesFrom && bMatchesTo && bMatchesStatus;
            });

            oModel.setProperty(`${sPath}/transferencias`, aFiltered);
            oModel.setProperty(`${sPath}/selectedCount`, 0);
        },

        onTransferenciasClear(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("view");
            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const oModel = this.getView().getModel("view");

            oModel.setProperty(`${sPath}/filters/dateFrom`, null);
            oModel.setProperty(`${sPath}/filters/dateTo`, null);
            oModel.setProperty(`${sPath}/filters/status`, "ALL");

            const aAllTransferencias = oModel.getProperty(`${sPath}/_allTransferencias`) || [];
            oModel.setProperty(`${sPath}/transferencias`, aAllTransferencias);
            oModel.setProperty(`${sPath}/selectedCount`, 0);
        },

        onTransferenciaSelectionChange(oEvent) {
            const oTable = oEvent.getSource();
            const iSelectedCount = oTable.getSelectedItems().length;
            const oContext = oTable.getBindingContext("view");

            if (!oContext) {
                return;
            }

            this.getView().getModel("view").setProperty(`${oContext.getPath()}/selectedCount`, iSelectedCount);
        },

        onConsultConfiguration() {
            this._openWizardDialog();
        },

        onExportReceipts(oEvent) {
            const oPanel = this._getParentPanel(oEvent.getSource());
            const oTable = oPanel && oPanel.getContent().find((oContent) => oContent.isA("sap.m.Table"));
            const iSelected = oTable ? oTable.getSelectedItems().length : 0;

            if (!iSelected) {
                MessageToast.show(this._oResourceBundle.getText("msgSelectAtLeastOne"));
                return;
            }

            MessageToast.show(this._oResourceBundle.getText("msgExportReceipts", [iSelected]));
        },

        _getParentPanel(oControl) {
            let oParent = oControl;
            while (oParent && !oParent.isA("sap.m.Panel")) {
                oParent = oParent.getParent();
            }
            return oParent;
        },

        _parseTransferDate(sDate) {
            if (!sDate) {
                return null;
            }

            const aDateParts = sDate.split("/");
            if (aDateParts.length !== 3) {
                return null;
            }

            const iDay = parseInt(aDateParts[0], 10);
            const iMonth = parseInt(aDateParts[1], 10) - 1;
            const iYear = parseInt(aDateParts[2], 10);

            const oDate = new Date(iYear, iMonth, iDay);
            return this._normalizeDate(oDate);
        },

        _normalizeDate(oDate) {
            if (!(oDate instanceof Date)) {
                return null;
            }

            const oNormalizedDate = new Date(oDate.getTime());
            oNormalizedDate.setHours(0, 0, 0, 0);
            return oNormalizedDate;
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
                    { nombre: "Santander", expanded: false, cuentas: [
                        { nombre: "Cuenta 1", oficina: "001", cuentaCorriente: "0001-1", saldoSAP: 52000.00, saldoInfoCent: 50000.00, currency: "USD" },
                        { nombre: "Cuenta 2", oficina: "001", cuentaCorriente: "0001-2", saldoSAP: 48000.00, saldoInfoCent: 49000.00, currency: "EUR" },
                        { nombre: "Cuenta 3", oficina: "002", cuentaCorriente: "0002-3", saldoSAP: 50000.00, saldoInfoCent: 51000.00, currency: "EUR" },
                        { nombre: "Cuenta 4", oficina: "002", cuentaCorriente: "0002-4", saldoSAP: 50000.00, saldoInfoCent: 50000.00, currency: "USD" }
                    ]},
                    { nombre: "Itaú", expanded: false, cuentas: [
                        { nombre: "Cuenta 1", oficina: "341", cuentaCorriente: "3410-1", saldoSAP: 61000.00, saldoInfoCent: 60000.00, currency: "BRL" },
                        { nombre: "Cuenta 2", oficina: "341", cuentaCorriente: "3410-2", saldoSAP: 43000.00, saldoInfoCent: 44500.00, currency: "BRL" },
                        { nombre: "Cuenta 3", oficina: "342", cuentaCorriente: "3420-1", saldoSAP: 55000.00, saldoInfoCent: 55000.00, currency: "USD" },
                        { nombre: "Cuenta 4", oficina: "342", cuentaCorriente: "3420-2", saldoSAP: 38000.00, saldoInfoCent: 37500.00, currency: "EUR" },
                        { nombre: "Cuenta 5", oficina: "343", cuentaCorriente: "3430-1", saldoSAP: 72000.00, saldoInfoCent: 72000.00, currency: "BRL" }
                    ]},
                    { nombre: "Bradesco", expanded: false, cuentas: [
                        { nombre: "Cuenta 1", oficina: "237", cuentaCorriente: "2370-1", saldoSAP: 45000.00, saldoInfoCent: 44000.00, currency: "BRL" },
                        { nombre: "Cuenta 2", oficina: "237", cuentaCorriente: "2370-2", saldoSAP: 67000.00, saldoInfoCent: 68000.00, currency: "BRL" },
                        { nombre: "Cuenta 3", oficina: "238", cuentaCorriente: "2380-1", saldoSAP: 33000.00, saldoInfoCent: 33000.00, currency: "USD" },
                        { nombre: "Cuenta 4", oficina: "238", cuentaCorriente: "2380-2", saldoSAP: 59000.00, saldoInfoCent: 58500.00, currency: "EUR" },
                        { nombre: "Cuenta 5", oficina: "239", cuentaCorriente: "2390-1", saldoSAP: 41000.00, saldoInfoCent: 41000.00, currency: "BRL" }
                    ]},
                    { nombre: "Caixa", expanded: false, cuentas: [
                        { nombre: "Cuenta 1", oficina: "104", cuentaCorriente: "1040-1", saldoSAP: 80000.00, saldoInfoCent: 79000.00, currency: "BRL" },
                        { nombre: "Cuenta 2", oficina: "104", cuentaCorriente: "1040-2", saldoSAP: 54000.00, saldoInfoCent: 54000.00, currency: "BRL" },
                        { nombre: "Cuenta 3", oficina: "105", cuentaCorriente: "1050-1", saldoSAP: 36000.00, saldoInfoCent: 37000.00, currency: "USD" }
                    ]},
                    { nombre: "NuBank", expanded: false, cuentas: [
                        { nombre: "Cuenta 1", oficina: "260", cuentaCorriente: "2600-1", saldoSAP: 28000.00, saldoInfoCent: 28000.00, currency: "BRL" }
                    ]},
                    { nombre: "Banco do Brasil", expanded: false, cuentas: [
                        { nombre: "Cuenta 1", oficina: "001", cuentaCorriente: "0010-1", saldoSAP: 95000.00, saldoInfoCent: 94000.00, currency: "BRL" }
                    ]}
                ],
                cuentasCentralizadoras: [
                    { nombre: "Cuenta Maestra", oficina: "001", cuentaCorriente: "9999-0" },
                    { nombre: "Cuenta Central EUR", oficina: "002", cuentaCorriente: "8888-1" }
                ],
                _bancosAll: null,
                _cuentasCentralAll: null,
                review: { razonSocial: "", cnpj: "", cuentasSeleccionadas: "", cuentaCentralNombre: "", cuentaCentralCuenta: "", horario: "", dias: "", saldoAdicionalData: "" },
                nav: { backVisible: false, nextVisible: true, nextEnabled: false, acceptVisible: false }
            });

            // Store full lists for filtering
            oWizardModel.setProperty("/_empresasAll", oWizardModel.getProperty("/empresas").slice());
            oWizardModel.setProperty("/_bancosAll", JSON.parse(JSON.stringify(oWizardModel.getProperty("/bancos"))));
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
                this._resetWizard();
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
            this._updateReviewEmpresa();
            this._updateReviewCuentas();
            this._updateReviewCuentaCentral();
            this._updateReviewHorario();
            this._updateReviewDias();
            this._updateReviewSaldo();
        },

        _updateReviewEmpresa() {
            const oModel = this.getView().getModel("wizard");
            const oEmpresaTable = this.byId("empresaTable");
            const oSelected = oEmpresaTable ? oEmpresaTable.getItems().find((i) => i.getSelected()) : null;
            if (oSelected) {
                const oCtx = oSelected.getBindingContext("wizard");
                oModel.setProperty("/review/razonSocial", oCtx.getProperty("razonSocial"));
                oModel.setProperty("/review/cnpj", oCtx.getProperty("cnpj"));
            } else {
                oModel.setProperty("/review/razonSocial", "");
                oModel.setProperty("/review/cnpj", "");
            }
        },

        _updateReviewCuentas() {
            const oModel = this.getView().getModel("wizard");
            const oBancosList = this.byId("bancosListStep2");
            if (oBancosList) {
                const aCuentasSeleccionadas = [];
                oBancosList.getItems().forEach((oCustomItem) => {
                    const oPanel = oCustomItem.getContent()[0];
                    const oTable = oPanel ? oPanel.getContent()[0] : null;
                    if (oTable) {
                        oTable.getSelectedItems().forEach((oItem) => {
                            const oCtx = oItem.getBindingContext("wizard");
                            if (oCtx) { aCuentasSeleccionadas.push(oCtx.getObject()); }
                        });
                    }
                });
                oModel.setProperty("/review/cuentasSeleccionadas", aCuentasSeleccionadas.map((c) => c.nombre).join(", ") || "-");
            }
        },

        _updateReviewCuentaCentral() {
            const oModel = this.getView().getModel("wizard");
            const oCuentaTable = this.byId("cuentaCentralTable");
            const oSelected = oCuentaTable ? oCuentaTable.getItems().find((i) => i.getSelected()) : null;
            if (oSelected) {
                const oCtx = oSelected.getBindingContext("wizard");
                oModel.setProperty("/review/cuentaCentralNombre", "Santander");
                oModel.setProperty("/review/cuentaCentralCuenta", `${oCtx.getObject().nombre}\nOficina: ${oCtx.getObject().oficina}\nCuenta: ${oCtx.getObject().cuentaCorriente}`);
            } else {
                oModel.setProperty("/review/cuentaCentralNombre", "");
                oModel.setProperty("/review/cuentaCentralCuenta", "");
            }
        },

        _updateReviewHorario() {
            const oModel = this.getView().getModel("wizard");
            const oHorarioGroup = this.byId("horarioGroup");
            if (oHorarioGroup) {
                const oSelected = oHorarioGroup.getSelectedButton();
                oModel.setProperty("/review/horario", oSelected ? oSelected.getText() : "");
            }
        },

        _updateReviewDias() {
            const oModel = this.getView().getModel("wizard");
            const oDias = oModel.getProperty("/dias");
            const aDiasSeleccionados = Object.entries(oDias)
                .filter(([, bSelected]) => bSelected)
                .map(([sDay]) => sDay.charAt(0).toUpperCase() + sDay.slice(1));
            oModel.setProperty("/review/dias", aDiasSeleccionados.join(", ") || "-");
        },

        _updateReviewSaldo() {
            const oModel = this.getView().getModel("wizard");
            const oSaldoGroup = this.byId("saldoGroup");
            if (oSaldoGroup) {
                const oSelected = oSaldoGroup.getSelectedButton();
                oModel.setProperty("/review/saldoAdicionalData", oSelected ? oSelected.getText() : "");
            }
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
            const oModel = this.getView().getModel("wizard");
            const aAll = oModel.getProperty("/_bancosAll");
            if (!sQuery) {
                const aReset = JSON.parse(JSON.stringify(aAll)).map((b) => Object.assign(b, { expanded: false }));
                oModel.setProperty("/bancos", aReset);
                return;
            }
            const aFiltered = aAll
                .map((oBanco) => {
                    const bBancoMatch = oBanco.nombre.toLowerCase().includes(sQuery);
                    const aCuentasFiltradas = bBancoMatch
                        ? oBanco.cuentas
                        : oBanco.cuentas.filter((c) =>
                            c.nombre.toLowerCase().includes(sQuery) ||
                            c.cuentaCorriente.toLowerCase().includes(sQuery));
                    return aCuentasFiltradas.length > 0
                        ? Object.assign({}, oBanco, { cuentas: aCuentasFiltradas, expanded: true })
                        : null;
                })
                .filter(Boolean);
            oModel.setProperty("/bancos", aFiltered);
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
            if (iNext < oWizard.getProgress()) {
                // Step already activated (e.g. navigating forward after editing) — goToStep is safe
                oWizard.goToStep(oWizard.getSteps()[iNext], true);
            } else {
                // Step not yet activated — nextStep() activates it before navigating
                oWizard.nextStep();
            }
            this._updateNavState(iNext);
        },

        onWizardBack() {
            const oWizard = this.byId("configWizard");
            const iPrev = this._iCurrentStepIndex - 1;
            oWizard.goToStep(oWizard.getSteps()[iPrev], true);
            this._updateNavState(iPrev);
        },

        onEmpresaSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = this.byId("empresaTable").getItems().some((i) => i.getSelected());
            bValid ? oWizard.validateStep(this.byId("wizardStep1")) : oWizard.invalidateStep(this.byId("wizardStep1"));
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewEmpresa();
        },

        onCuentasSelectionChange() {
            const oWizard = this.byId("configWizard");
            const oBancosList = this.byId("bancosListStep2");
            let bValid = false;
            if (oBancosList) {
                bValid = oBancosList.getItems().some((oCustomItem) => {
                    const oPanel = oCustomItem.getContent()[0];
                    const oTable = oPanel ? oPanel.getContent()[0] : null;
                    return oTable ? oTable.getSelectedItems().length > 0 : false;
                });
            }
            bValid ? oWizard.validateStep(this.byId("wizardStep2")) : oWizard.invalidateStep(this.byId("wizardStep2"));
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentas();
        },

        onCuentaCentralSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = this.byId("cuentaCentralTable").getItems().some((i) => i.getSelected());
            bValid ? oWizard.validateStep(this.byId("wizardStep3")) : oWizard.invalidateStep(this.byId("wizardStep3"));
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentaCentral();
        },

        onHorarioSelectionChange() {
            this._updateReviewHorario();
        },

        onDiaSelectionChange() {
            this._updateReviewDias();
        },

        onSaldoSelectionChange() {
            const oWizard = this.byId("configWizard");
            const bValid = !!this.byId("saldoGroup").getSelectedButton();
            bValid ? oWizard.validateStep(this.byId("wizardStep5")) : oWizard.invalidateStep(this.byId("wizardStep5"));
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewSaldo();
        },

        onEditStep(oEvent) {
            const sStep = oEvent.getSource().data("step");
            const iIndex = parseInt(sStep, 10) - 1;
            const oWizard = this.byId("configWizard");
            if (oWizard) {
                oWizard.goToStep(this.byId("wizardStep" + sStep), true);
                this._updateNavState(iIndex);
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