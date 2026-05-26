sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "cashpool/app/cashpool/utils/Formatter",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/ui/core/format/NumberFormat",
    "sap/viz/ui5/format/ChartFormatter",
    "sap/viz/ui5/api/env/Format"
], (Controller, JSONModel, Fragment, Formatter, MessageToast, Dialog, Button, Text, NumberFormat, ChartFormatter, Format) => {
    "use strict";

    return Controller.extend("cashpool.app.cashpool.controller.Treasury", {
        onInit() {
            // Get i18n bundle for translations from component
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            this._oResourceBundle = oResourceBundle;

            // Load view model data from JSON file and localize i18n-dependent fields
            const oViewModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/treasuryView.json"));
            oViewModel.attachRequestCompleted(() => {
                this._applyViewModelI18n(oViewModel);
                this._buildTransferenciasGroups();
            });
            this.getView().setModel(oViewModel, "view");

            const oEmpresasModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/empresas.json"));
            this.getView().setModel(oEmpresasModel, "empresas");

            Format.numericFormatter(ChartFormatter.getInstance());
            const formatPattern = ChartFormatter.DefaultPattern;
            const oVizFrame = this.getView().byId("saldosVizFrame");
            if (oVizFrame) {
                oVizFrame.setVizProperties({
                    title: { visible: false },
                    legend: { visible: false },
                    plotArea: {
                        dataLabel: {
                            visible: true,
                            rotation: 0,
                            formatString: formatPattern.SHORTFLOAT
                        }
                    },
                    valueAxis: {
                        label: { formatString: formatPattern.SHORTFLOAT },
                        title: { visible: false }
                    },
                    categoryAxis: {
                        title: { visible: false }
                    }
                });
            }
        },

        onTabSelect(oEvent) {
            const oSelectedKey = oEvent.getParameter("selectedKey");
            this.getView().getModel("view").setProperty("/selectedTab", oSelectedKey);
        },

        _applyViewModelI18n(oViewModel) {
            const aTabs = oViewModel.getProperty("/tabs") || [];
            aTabs.forEach((oTab) => {
                if (oTab.textKey) {
                    oTab.text = this._oResourceBundle.getText(oTab.textKey);
                }
            });

            const aTransferencias = oViewModel.getProperty("/transferencias") || [];
            aTransferencias.forEach((oTransferencia) => {
                if (oTransferencia?.origen?.bancoKey) {
                    oTransferencia.origen.banco = this._oResourceBundle.getText(oTransferencia.origen.bancoKey);
                }
                if (oTransferencia?.destino?.bancoKey) {
                    oTransferencia.destino.banco = this._oResourceBundle.getText(oTransferencia.destino.bancoKey);
                }
                if (oTransferencia?.status?.textKey) {
                    oTransferencia.status.text = this._oResourceBundle.getText(oTransferencia.status.textKey);
                }
            });

            oViewModel.refresh(true);
        },

        onDownloadReceipt(oEvent) {
            // Obtener la fila seleccionada
            const oSource = oEvent.getSource();
            const oBindingContext = oSource.getBindingContext("view");
            const oData = oBindingContext.getObject();

            // Aquí­ se implementaría la lógica para descargar el comprobante
            // Por ahora, mostrar un mensaje
            const sFormattedCurrency = Formatter.formatCurrency(oData.valorTransferencia.monto, oData.valorTransferencia.moneda);
            //MessageToast.show(`Descargando comprobante de transferencia del ${oData.fecha} por el importe de ${sFormattedCurrency}`);
            MessageToast.show(this._oResourceBundle.getText("msgDownloadExtract", [oData.fecha, sFormattedCurrency]));
        },

        _buildTransferenciasGroups() {
            const oModel = this.getView().getModel("view");
            const aTransferencias = oModel.getProperty("/transferencias") || [];
            const oGroupsByKey = new Map();

            aTransferencias.forEach((oTransferencia) => {
                const sGroupKey = `${oTransferencia.razonSocial}|${oTransferencia.cif}`;
                if (!oGroupsByKey.has(sGroupKey)) {
                    oGroupsByKey.set(sGroupKey, {
                        razonSocial: oTransferencia.razonSocial,
                        cif: oTransferencia.cif,
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
            const sNormalizedQuery = this._normalizeNifSearch(sRawQuery);
            const oModel = this.getView().getModel("view");
            const aAllGroups = oModel.getProperty("/_transferenciasAgrupadasAll") || [];

            if (!sNormalizedQuery) {
                oModel.setProperty("/transferenciasAgrupadas", aAllGroups.slice());
                return;
            }

            const aFilteredGroups = aAllGroups.filter((oGroup) =>
                this._normalizeNifSearch(oGroup.cif).includes(sNormalizedQuery) ||
                this._normalizeNifSearch(oGroup.razonSocial).includes(sNormalizedQuery)
            );

            oModel.setProperty("/transferenciasAgrupadas", aFilteredGroups);
        },

        _normalizeNifSearch(sValue) {
            return (sValue || "").toLowerCase().trim();
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
            const oWizardModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/wizardData.json"));
            oWizardModel.attachRequestCompleted(() => {
                // Store full lists for filtering
                oWizardModel.setProperty("/_empresasAll", oWizardModel.getProperty("/empresas").slice());
                oWizardModel.setProperty("/_bancosAll", JSON.parse(JSON.stringify(oWizardModel.getProperty("/bancos"))));
                oWizardModel.setProperty("/_cuentasCentralAll", oWizardModel.getProperty("/cuentasCentralizadoras").slice());
                this.getView().setModel(oWizardModel, "wizard");
                this._openWizardDialogFragment();
            });
            oWizardModel.attachRequestFailed(() => {
                MessageToast.show("No se pudo cargar la configuración del wizard.");
            });
        },

        _openWizardDialogFragment() {

            if (!this._wizardDialog) {
                Fragment.load({
                    id: this.getView().getId(),
                    name: "cashpool.app.cashpool.view.fragments.WizardDialog",
                    controller: this
                }).then((oDialog) => {
                    this._wizardDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                });
            } else {
                this._wizardDialog.open();
            }
        },

        _resetWizard() {
            const oWizard = this.byId("configWizard");
            const oStep1 = this.byId("wizardStep1");
            if (!oWizard || !oStep1) {
                return;
            }

            // Force a clean wizard state to avoid stale validation carrying over between openings.
            oWizard.discardProgress(oStep1);
            oWizard.goToStep(oStep1, true);

            oWizard.getSteps().forEach((oStep) => {
                oWizard.invalidateStep(oStep);
            });

            const oEmpresaTable = this.byId("empresaTable");
            if (oEmpresaTable) {
                oEmpresaTable.removeSelections(true);
            }

            const oCuentaCentralTable = this.byId("cuentaCentralTable");
            if (oCuentaCentralTable) {
                oCuentaCentralTable.removeSelections(true);
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
            //MessageToast.show(`Configuració guardada: ${oReview.razonSocial} | ${oReview.cuentaCentralNombre} | ${oReview.horario}`);
            MessageToast.show(this._oResourceBundle.getText("msgSavedConfig", [oReview.razonSocial, oReview.cuentaCentralNombre, oReview.horario]));
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        onWizardDialogAfterClose(oEvent) {
            this._resetWizard();

            const oModel = this.getView().getModel("wizard");
            if (oModel) {
                oModel.setProperty("/nav/backVisible", false);
                oModel.setProperty("/nav/nextVisible", true);
                oModel.setProperty("/nav/nextEnabled", false);
                oModel.setProperty("/nav/acceptVisible", false);
            }

            this._iCurrentStepIndex = 0;
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
                oModel.setProperty("/review/cif", oCtx.getProperty("cif"));
            } else {
                oModel.setProperty("/review/razonSocial", "");
                oModel.setProperty("/review/cif", "");
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
                const iSelectedIndex = oHorarioGroup.getSelectedIndex();
                let sSelectedText = oSelected ? oSelected.getText() : "";
                let sReviewHorario = sSelectedText;

                if (iSelectedIndex === 0) {
                    // Opción 1: Horario único
                    const sHorarioUnico = oModel.getProperty("/horarioUnico") || "";
                    sReviewHorario = sHorarioUnico ? `${sSelectedText} (${sHorarioUnico})` : sSelectedText;
                } else if (iSelectedIndex === 1) {
                    // Opción 2: Horario por banco
                    const aBancos = oModel.getProperty("/horariosPersonalizadosPorBanco") || [];
                    const aBancosConHorario = aBancos.filter((b) => b.selectedHorario);
                    if (aBancosConHorario.length > 0) {
                        const aResumen = aBancosConHorario.map((b) => `${b.nombre}: ${b.selectedHorario}`).join("\n");
                        sReviewHorario = `${sSelectedText}:\n ${aResumen}`;
                    }
                } else if (iSelectedIndex === 2) {
                    // Opción 3: Horario por cuenta
                    //sSelectedText +="\n"
                    const aCuentas = oModel.getProperty("/horariosPersonalizadosPorCuenta") || [];
                    const aCuentasConHorario = aCuentas.filter((c) => c.selectedHorario);
                    if (aCuentasConHorario.length > 0) {
                        const aResumen = aCuentasConHorario.map((c) => `${c.banco} - ${c.nombre}: ${c.selectedHorario}`).join("\n");
                        sReviewHorario = `${sSelectedText}:\n ${aResumen}`;
                    }
                }

                oModel.setProperty("/review/horario", sReviewHorario);
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
                const sSelectedText = oSelected ? oSelected.getText() : "";
                const iSelectedIndex = oSaldoGroup.getSelectedIndex();
                let sReviewSaldo = sSelectedText;

                if (iSelectedIndex === 0) {
                    const aBancos = oModel.getProperty("/saldosPersonalizadosPorBanco") || [];
                    const aBancosConSaldo = aBancos.filter((b) => b.saldoPersonalizado !== null && b.saldoPersonalizado !== undefined && b.saldoPersonalizado !== "");
                    if (aBancosConSaldo.length > 0) {
                        const aResumen = aBancosConSaldo
                            .map((b) => `${b.nombre}: ${this._formatAmountForReview(b.saldoPersonalizado, b.currency)}`)
                            .join("\n");
                        sReviewSaldo = `${sSelectedText}:\n ${aResumen}`;
                    }
                } else if (iSelectedIndex === 1) {
                    const aCuentas = oModel.getProperty("/saldosPersonalizadosPorCuenta") || [];
                    const aCuentasConSaldo = aCuentas.filter((c) => c.saldoPersonalizado !== null && c.saldoPersonalizado !== undefined && c.saldoPersonalizado !== "");
                    if (aCuentasConSaldo.length > 0) {
                        const aResumen = aCuentasConSaldo
                            .map((c) => `${c.banco} - ${c.nombre}: ${this._formatAmountForReview(c.saldoPersonalizado, c.currency)}`)
                            .join("\n");
                        sReviewSaldo = `${sSelectedText}:\n ${aResumen}`;
                    }
                }

                oModel.setProperty("/review/saldoAdicionalData", sReviewSaldo);
            }
        },

        _formatAmountForReview(vAmount, sCurrency) {
            const nAmount = Number(vAmount);
            if (Number.isNaN(nAmount)) {
                return "";
            }
            if (sCurrency) {
                return Formatter.formatCurrency(nAmount, sCurrency);
            }
            return this._formatLocalizedNumber(nAmount);
        },

        _getLocalizedFloatFormatter() {
            if (!this._oLocalizedFloatFormatter) {
                this._oLocalizedFloatFormatter = NumberFormat.getFloatInstance({
                    groupingEnabled: true,
                    minFractionDigits: 2,
                    maxFractionDigits: 2
                });
            }
            return this._oLocalizedFloatFormatter;
        },

        _formatLocalizedNumber(nValue) {
            return this._getLocalizedFloatFormatter().format(nValue);
        },

        onEmpresaSearch(oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oModel = this.getView().getModel("wizard");
            const aAll = oModel.getProperty("/_empresasAll");
            const aFiltered = sQuery
                ? aAll.filter((o) => o.razonSocial.toLowerCase().includes(sQuery) || o.cif.toLowerCase().includes(sQuery))
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

        _isStep1Valid() {
            const oEmpresaTable = this.byId("empresaTable");
            return !!oEmpresaTable && oEmpresaTable.getItems().some((i) => i.getSelected());
        },

        _updateNavState(iIndex) {
            const oModel = this.getView().getModel("wizard");
            const oWizard = this.byId("configWizard");
            const aSteps = oWizard ? oWizard.getSteps() : [];
            const bIsLast = iIndex === aSteps.length - 1;
            const bCurrentValid = iIndex === 0
                ? this._isStep1Valid()
                : (aSteps[iIndex] ? aSteps[iIndex].getValidated() : false);

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
                // Step already activated (e.g. navigating forward after editing) - goToStep is safe
                oWizard.goToStep(oWizard.getSteps()[iNext], true);
            } else {
                // Step not yet activated - nextStep() activates it before navigating
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
            this._buildHorariosEspecificos();
            this._buildSaldosPersonalizados();
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
            const oModel = this.getView().getModel("wizard");
            const oHorarioGroup = this.byId("horarioGroup");
            if (oHorarioGroup && oHorarioGroup.getSelectedIndex() !== 0) {
                oModel.setProperty("/horarioUnico", "");
            }
            if (oHorarioGroup.getSelectedIndex() === 0) {
                oModel.setProperty("/selectedHorario", 0);
            }
            this._buildHorariosEspecificos();
            this._updateReviewHorario();
            this._validateStep4();
        },

        onHorarioUnicoChange() {
            this._updateReviewHorario();
        },

        _buildHorariosEspecificos() {
            const oModel = this.getView().getModel("wizard");
            const iSelectedHorarioIndex = oModel.getProperty("/selectedHorario");
            const oBancosList = this.byId("bancosListStep2");
            
            // Reset if not building for options 2 or 3
            if (!oBancosList || iSelectedHorarioIndex === 0 || iSelectedHorarioIndex === null) {
                oModel.setProperty("/horariosPersonalizadosPorBanco", []);
                oModel.setProperty("/horariosPersonalizadosPorCuenta", []);
                return;
            }

            const aHorariosPorBanco = [];
            const aHorariosPorCuenta = [];
            const aHorariosDisponibles = oModel.getProperty("/horariosUnicos");

            oBancosList.getItems().forEach((oCustomItem) => {
                const oPanel = oCustomItem.getContent()[0];
                const oTable = oPanel ? oPanel.getContent()[0] : null;
                
                if (oTable) {
                    const aSelectedItems = oTable.getSelectedItems();
                    if (aSelectedItems.length > 0) {
                        const oBancoContext = oPanel.getBindingContext("wizard");
                        const sBancoNombre = oBancoContext ? oBancoContext.getProperty("nombre") : "";

                        if (iSelectedHorarioIndex === 1) {
                            // Opción 2: Horario por banco (agregar una sola vez por banco)
                            const bBancoYaAgregado = aHorariosPorBanco.some((b) => b.nombre === sBancoNombre);
                            if (!bBancoYaAgregado) {
                                aHorariosPorBanco.push({
                                    nombre: sBancoNombre,
                                    selectedHorario: "",
                                    horariosUnicos: aHorariosDisponibles
                                });
                            }
                        } else if (iSelectedHorarioIndex === 2) {
                            // Opción 3: Horario por cuenta
                            aSelectedItems.forEach((oItem) => {
                                const oCtx = oItem.getBindingContext("wizard");
                                if (oCtx) {
                                    aHorariosPorCuenta.push({
                                        banco: sBancoNombre,
                                        nombre: oCtx.getProperty("nombre"),
                                        cuentaCorriente: oCtx.getProperty("cuentaCorriente"),
                                        selectedHorario: "",
                                        horariosUnicos: aHorariosDisponibles
                                    });
                                }
                            });
                        }
                    }
                }
            });

            oModel.setProperty("/horariosPersonalizadosPorBanco", aHorariosPorBanco);
            oModel.setProperty("/horariosPersonalizadosPorCuenta", aHorariosPorCuenta);
        },

        onHorarioEspecificoChange(oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            const oSource = oEvent.getSource();
            const sDataKey = oSource.data("key");
            const oModel = this.getView().getModel("wizard");
            const iSelectedHorarioIndex = oModel.getProperty("/selectedHorario");

            if (iSelectedHorarioIndex === 1) {
                // Opción 2: por banco
                const aBancos = oModel.getProperty("/horariosPersonalizadosPorBanco");
                const iBancoIndex = aBancos.findIndex((b) => `banco_${b.nombre}` === sDataKey);
                if (iBancoIndex >= 0) {
                    oModel.setProperty(`/horariosPersonalizadosPorBanco/${iBancoIndex}/selectedHorario`, sSelectedKey);
                }
            } else if (iSelectedHorarioIndex === 2) {
                // Opción 3: por cuenta
                const aCuentas = oModel.getProperty("/horariosPersonalizadosPorCuenta");
                const iCuentaIndex = aCuentas.findIndex((c) => `cuenta_${c.cuentaCorriente}` === sDataKey);
                if (iCuentaIndex >= 0) {
                    oModel.setProperty(`/horariosPersonalizadosPorCuenta/${iCuentaIndex}/selectedHorario`, sSelectedKey);
                }
            }
            this._updateReviewHorario();
        },

        onDiaSelectionChange() {
            this._updateReviewDias();
            this._validateStep4();
        },

        onSaldoSelectionChange() {
            this._buildSaldosPersonalizados();
            this._validateStep5();
            this._updateReviewSaldo();
        },

        _validateStep4() {
            const oWizard = this.byId("configWizard");
            const oHorarioGroup = this.byId("horarioGroup");
            const oStep4 = this.byId("wizardStep4");
            const oModel = this.getView().getModel("wizard");

            if (!oWizard || !oHorarioGroup || !oStep4 || !oModel) {
                return;
            }

            const iSelectedIndex = oHorarioGroup.getSelectedIndex();
            const bHorarioSelected = iSelectedIndex !== null && iSelectedIndex !== undefined && iSelectedIndex >= 0;
            const oDias = oModel.getProperty("/dias") || {};
            const bAnyDaySelected = Object.values(oDias).some(Boolean);
            const bValid = bHorarioSelected && bAnyDaySelected;

            bValid ? oWizard.validateStep(oStep4) : oWizard.invalidateStep(oStep4);
            this._updateNavState(this._iCurrentStepIndex);
        },

        _validateStep5() {
            const oWizard = this.byId("configWizard");
            const oSaldoGroup = this.byId("saldoGroup");
            const oStep5 = this.byId("wizardStep5");
            const oModel = this.getView().getModel("wizard");

            if (!oWizard || !oSaldoGroup || !oStep5 || !oModel) {
                return;
            }

            const iSelectedIndex = oSaldoGroup.getSelectedIndex();
            let bValid = false;

            if (iSelectedIndex === 2) {
                // Option 3: valid immediately
                bValid = true;
            } else if (iSelectedIndex === 0) {
                const aBancos = oModel.getProperty("/saldosPersonalizadosPorBanco") || [];
                bValid = aBancos.length > 0 && aBancos.every((oBanco) => {
                    const sInput = (oBanco.saldoPersonalizadoInput || "").trim();
                    if (!sInput) {
                        return false;
                    }
                    return !Number.isNaN(this._parseLocalizedNumber(sInput));
                });
            } else if (iSelectedIndex === 1) {
                const aCuentas = oModel.getProperty("/saldosPersonalizadosPorCuenta") || [];
                bValid = aCuentas.length > 0 && aCuentas.every((oCuenta) => {
                    const sInput = (oCuenta.saldoPersonalizadoInput || "").trim();
                    if (!sInput) {
                        return false;
                    }
                    return !Number.isNaN(this._parseLocalizedNumber(sInput));
                });
            }

            bValid ? oWizard.validateStep(oStep5) : oWizard.invalidateStep(oStep5);
            this._updateNavState(this._iCurrentStepIndex);
        },

        _buildSaldosPersonalizados() {
            const oModel = this.getView().getModel("wizard");
            const iSelectedSaldoType = oModel.getProperty("/selectedSaldoType");
            const oBancosList = this.byId("bancosListStep2");

            if (!oBancosList || (iSelectedSaldoType !== 0 && iSelectedSaldoType !== 1)) {
                oModel.setProperty("/saldosPersonalizadosPorBanco", []);
                oModel.setProperty("/saldosPersonalizadosPorCuenta", []);
                return;
            }

            const aPrevByBanco = oModel.getProperty("/saldosPersonalizadosPorBanco") || [];
            const aPrevByCuenta = oModel.getProperty("/saldosPersonalizadosPorCuenta") || [];

            const oPrevBancoMap = new Map(aPrevByBanco.map((b) => [b.nombre, {
                saldoPersonalizado: b.saldoPersonalizado,
                saldoPersonalizadoInput: b.saldoPersonalizadoInput || ""
            }]));
            const oPrevCuentaMap = new Map(aPrevByCuenta.map((c) => [c.cuentaCorriente, {
                saldoPersonalizado: c.saldoPersonalizado,
                saldoPersonalizadoInput: c.saldoPersonalizadoInput || ""
            }]));

            const aSaldosPorBanco = [];
            const aSaldosPorCuenta = [];
            const oBankAggregation = new Map();

            oBancosList.getItems().forEach((oCustomItem) => {
                const oPanel = oCustomItem.getContent()[0];
                const oTable = oPanel ? oPanel.getContent()[0] : null;

                if (!oTable) {
                    return;
                }

                const aSelectedItems = oTable.getSelectedItems();
                if (!aSelectedItems.length) {
                    return;
                }

                const oBancoContext = oPanel.getBindingContext("wizard");
                const sBancoNombre = oBancoContext ? oBancoContext.getProperty("nombre") : "";

                aSelectedItems.forEach((oItem) => {
                    const oCtx = oItem.getBindingContext("wizard");
                    if (!oCtx) {
                        return;
                    }

                    const sCuentaCorriente = oCtx.getProperty("cuentaCorriente");
                    const sCuentaNombre = oCtx.getProperty("nombre");
                    const nSaldoInfoCent = Number(oCtx.getProperty("saldoInfoCent")) || 0;
                    const sCurrency = oCtx.getProperty("currency") || "";

                    if (iSelectedSaldoType === 1) {
                        const oPrevCuenta = oPrevCuentaMap.get(sCuentaCorriente) || {};
                        aSaldosPorCuenta.push({
                            banco: sBancoNombre,
                            nombre: sCuentaNombre,
                            cuentaCorriente: sCuentaCorriente,
                            saldoDisponible: nSaldoInfoCent,
                            currency: sCurrency,
                            saldoPersonalizado: oPrevCuenta.saldoPersonalizado ?? null,
                            saldoPersonalizadoInput: oPrevCuenta.saldoPersonalizadoInput || ""
                        });
                    }

                    if (!oBankAggregation.has(sBancoNombre)) {
                        oBankAggregation.set(sBancoNombre, {
                            nombre: sBancoNombre,
                            saldoTotal: 0,
                            currencies: new Set()
                        });
                    }

                    const oBankData = oBankAggregation.get(sBancoNombre);
                    oBankData.saldoTotal += nSaldoInfoCent;
                    if (sCurrency) {
                        oBankData.currencies.add(sCurrency);
                    }
                });
            });

            if (iSelectedSaldoType === 0) {
                oBankAggregation.forEach((oBankData) => {
                    const aCurrencies = Array.from(oBankData.currencies);
                    const sCurrency = aCurrencies.length === 1 ? aCurrencies[0] : "";
                    const sSaldoDisponibleTexto = sCurrency
                        ? Formatter.formatCurrency(oBankData.saldoTotal, sCurrency)
                        : "-";
                    const oPrevBanco = oPrevBancoMap.get(oBankData.nombre) || {};

                    aSaldosPorBanco.push({
                        nombre: oBankData.nombre,
                        saldoDisponible: oBankData.saldoTotal,
                        saldoDisponibleTexto: sSaldoDisponibleTexto,
                        currency: sCurrency,
                        saldoPersonalizado: oPrevBanco.saldoPersonalizado ?? null,
                        saldoPersonalizadoInput: oPrevBanco.saldoPersonalizadoInput || ""
                    });
                });
            }

            oModel.setProperty("/saldosPersonalizadosPorBanco", aSaldosPorBanco);
            oModel.setProperty("/saldosPersonalizadosPorCuenta", aSaldosPorCuenta);
            this._validateStep5();
        },

        onSaldoPersonalizadoChange(oEvent) {
            const oSource = oEvent.getSource();
            const sScope = oSource.data("scope");
            const sDataKey = oSource.data("key");
            const sRawValue = oSource.getValue() || "";
            const nParsedValue = this._parseLocalizedNumber(sRawValue);
            const sFormattedValue = Number.isNaN(nParsedValue)
                ? ""
                : this._formatLocalizedNumber(nParsedValue);

            const oModel = this.getView().getModel("wizard");
            if (sScope === "banco") {
                const aBancos = oModel.getProperty("/saldosPersonalizadosPorBanco") || [];
                const iBancoIndex = aBancos.findIndex((b) => `banco_${b.nombre}` === sDataKey);
                if (iBancoIndex >= 0) {
                    oModel.setProperty(`/saldosPersonalizadosPorBanco/${iBancoIndex}/saldoPersonalizado`, Number.isNaN(nParsedValue) ? null : nParsedValue);
                    oModel.setProperty(`/saldosPersonalizadosPorBanco/${iBancoIndex}/saldoPersonalizadoInput`, sFormattedValue);
                }
            } else if (sScope === "cuenta") {
                const aCuentas = oModel.getProperty("/saldosPersonalizadosPorCuenta") || [];
                const iCuentaIndex = aCuentas.findIndex((c) => `cuenta_${c.cuentaCorriente}` === sDataKey);
                if (iCuentaIndex >= 0) {
                    oModel.setProperty(`/saldosPersonalizadosPorCuenta/${iCuentaIndex}/saldoPersonalizado`, Number.isNaN(nParsedValue) ? null : nParsedValue);
                    oModel.setProperty(`/saldosPersonalizadosPorCuenta/${iCuentaIndex}/saldoPersonalizadoInput`, sFormattedValue);
                }
            }
            this._validateStep5();
            this._updateReviewSaldo();
        },

        _parseLocalizedNumber(sValue) {
            if (!sValue) {
                return Number.NaN;
            }

            const sInput = String(sValue).trim();
            const vParsed = this._getLocalizedFloatFormatter().parse(sInput);
            if (typeof vParsed === "number" && !Number.isNaN(vParsed)) {
                return vParsed;
            }

            // Fallback for pasted values with a different locale format.
            const sCompact = sInput.replace(/\s+/g, "");
            const iLastComma = sCompact.lastIndexOf(",");
            const iLastDot = sCompact.lastIndexOf(".");

            if (iLastComma !== -1 || iLastDot !== -1) {
                const sDecimalSep = iLastDot > iLastComma ? "." : ",";
                const sThousandsSep = sDecimalSep === "." ? "," : ".";
                const sNormalized = sCompact
                    .split(sThousandsSep).join("")
                    .replace(sDecimalSep, ".");
                const nFallback = Number(sNormalized);
                if (!Number.isNaN(nFallback)) {
                    return nFallback;
                }
            }

            const nDirect = Number(sCompact);
            return Number.isNaN(nDirect) ? Number.NaN : nDirect;
        },

        onSaldoConsiderChange() {
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