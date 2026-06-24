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
            this._getViewModel().setProperty("/selectedTab", oSelectedKey);
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
            const oModel = this._getViewModel();
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
            const oModel = this._getViewModel();
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
                        this._getViewModel().setProperty(`${oContext.getPath()}/activo`, false);
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
            const oModel = this._getViewModel();
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
            const oModel = this._getViewModel();

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

            this._getViewModel().setProperty(`${oContext.getPath()}/selectedCount`, iSelectedCount);
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
                const aEmpresas = oWizardModel.getProperty("/empresas") || [];
                const aBancos = oWizardModel.getProperty("/bancos") || [];
                const aCuentasCentralizadoras = oWizardModel.getProperty("/cuentasCentralizadoras") || [];
                oWizardModel.setProperty("/_empresasAll", aEmpresas.slice());
                oWizardModel.setProperty("/_bancosAll", JSON.parse(JSON.stringify(aBancos)));
                oWizardModel.setProperty("/_cuentasCentralAll", aCuentasCentralizadoras.slice());
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

        _getWizardModel() {
            return this.getView().getModel("wizard");
        },

        _getViewModel() {
            return this.getView().getModel("view");
        },

        _setModelPropertyIfChanged(oModel, sPath, vValue) {
            if (!oModel) {
                return;
            }

            const vCurrent = oModel.getProperty(sPath);
            if (vCurrent !== vValue) {
                oModel.setProperty(sPath, vValue);
            }
        },

        _setWizardPropertyIfChanged(sPath, vValue) {
            this._setModelPropertyIfChanged(this._getWizardModel(), sPath, vValue);
        },

        _setWizardStepValidation(sStepId, bValid) {
            const oWizard = this.byId("configWizard");
            const oStep = this.byId(sStepId);
            if (!oWizard || !oStep) {
                return;
            }
            bValid ? oWizard.validateStep(oStep) : oWizard.invalidateStep(oStep);
        },

        _getSelectedStep2Accounts() {
            const oBancosList = this.byId("bancosListStep2");
            if (!oBancosList) {
                return [];
            }

            const aSelectedAccounts = [];
            oBancosList.getItems().forEach((oCustomItem) => {
                const oPanel = oCustomItem.getContent()[0];
                const oTable = oPanel ? oPanel.getContent()[0] : null;
                if (!oTable) {
                    return;
                }

                const oBancoContext = oPanel.getBindingContext("wizard");
                const sBancoNombre = oBancoContext ? oBancoContext.getProperty("nombre") : "";

                oTable.getSelectedItems().forEach((oItem) => {
                    const oCtx = oItem.getBindingContext("wizard");
                    if (oCtx) {
                        aSelectedAccounts.push({
                            banco: sBancoNombre,
                            data: oCtx.getObject()
                        });
                    }
                });
            });

            return aSelectedAccounts;
        },

        _hasValidLocalizedInputs(aItems) {
            return aItems.length > 0 && aItems.every((oItem) => {
                const sInput = (oItem.saldoPersonalizadoInput || "").trim();
                if (!sInput) {
                    return false;
                }
                return !Number.isNaN(this._parseLocalizedNumber(sInput));
            });
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
            const oModel = this._getWizardModel();
            const oReview = oModel.getProperty("/review");
            //MessageToast.show(`Configuració guardada: ${oReview.razonSocial} | ${oReview.cuentaCentralNombre} | ${oReview.horario}`);
            MessageToast.show(this._oResourceBundle.getText("msgSavedConfig", [oReview.razonSocial, oReview.cuentaCentralNombre, oReview.horario]));
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        onWizardDialogAfterClose() {
            this._resetWizard();

            const oModel = this._getWizardModel();
            if (oModel) {
                this._setWizardPropertyIfChanged("/nav/backVisible", false);
                this._setWizardPropertyIfChanged("/nav/nextVisible", true);
                this._setWizardPropertyIfChanged("/nav/nextEnabled", false);
                this._setWizardPropertyIfChanged("/nav/acceptVisible", false);
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
            const oModel = this._getWizardModel();
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
            const oModel = this._getWizardModel();
            const aCuentasSeleccionadas = this._getSelectedStep2Accounts().map((oEntry) => oEntry.data);
            oModel.setProperty("/review/cuentasSeleccionadas", aCuentasSeleccionadas.map((c) => c.nombre).join(", ") || "-");
        },

        _updateReviewCuentaCentral() {
            const oModel = this._getWizardModel();
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
            const oModel = this._getWizardModel();
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
            const oModel = this._getWizardModel();
            const oDias = oModel.getProperty("/dias") || {};
            const aDiasSeleccionados = Object.entries(oDias)
                .filter(([, bSelected]) => bSelected)
                .map(([sDay]) => sDay.charAt(0).toUpperCase() + sDay.slice(1));
            oModel.setProperty("/review/dias", aDiasSeleccionados.join(", ") || "-");
        },

        _updateReviewSaldo() {
            const oModel = this._getWizardModel();
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
            const oModel = this._getWizardModel();
            const aAll = oModel.getProperty("/_empresasAll");
            const aFiltered = sQuery
                ? aAll.filter((o) => o.razonSocial.toLowerCase().includes(sQuery) || o.cif.toLowerCase().includes(sQuery))
                : aAll.slice();
            oModel.setProperty("/empresas", aFiltered);
        },

        onCuentasSearch(oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oModel = this._getWizardModel();
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
            const oModel = this._getWizardModel();
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
            if (!oWizard) {
                return;
            }
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
            const oModel = this._getWizardModel();
            const oWizard = this.byId("configWizard");
            if (!oModel || !oWizard) {
                return;
            }
            const aSteps = oWizard ? oWizard.getSteps() : [];
            const bIsLast = iIndex === aSteps.length - 1;
            const bCurrentValid = iIndex === 0
                ? this._isStep1Valid()
                : (aSteps[iIndex] ? aSteps[iIndex].getValidated() : false);

            this._setWizardPropertyIfChanged("/nav/backVisible", iIndex > 0);
            this._setWizardPropertyIfChanged("/nav/nextVisible", !bIsLast);
            this._setWizardPropertyIfChanged("/nav/nextEnabled", bCurrentValid);
            this._setWizardPropertyIfChanged("/nav/acceptVisible", bIsLast);
            this._iCurrentStepIndex = iIndex;
        },

        onWizardNavChange(oEvent) {
            const oWizard = this.byId("configWizard");
            if (!oWizard) {
                return;
            }
            const oStep = oEvent.getParameter("step");
            const iIndex = oWizard.getSteps().indexOf(oStep);
            this._updateNavState(Math.max(0, iIndex));
        },

        onWizardNext() {
            const oWizard = this.byId("configWizard");
            if (!oWizard) {
                return;
            }
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
            if (!oWizard || this._iCurrentStepIndex <= 0) {
                return;
            }
            const iPrev = this._iCurrentStepIndex - 1;
            oWizard.goToStep(oWizard.getSteps()[iPrev], true);
            this._updateNavState(iPrev);
        },

        onEmpresaSelectionChange() {
            const bValid = this.byId("empresaTable").getItems().some((i) => i.getSelected());
            this._setWizardStepValidation("wizardStep1", bValid);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewEmpresa();
        },

        onCuentasSelectionChange() {
            const aSelectedAccounts = this._getSelectedStep2Accounts();
            const bValid = aSelectedAccounts.length > 0;
            this._setWizardStepValidation("wizardStep2", bValid);
            this._buildHorariosEspecificos(aSelectedAccounts);
            this._buildSaldosPersonalizados(aSelectedAccounts);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentas();
        },

        onCuentaCentralSelectionChange() {
            const bValid = this.byId("cuentaCentralTable").getItems().some((i) => i.getSelected());
            this._setWizardStepValidation("wizardStep3", bValid);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentaCentral();
        },

        onHorarioSelectionChange() {
            const oModel = this._getWizardModel();
            const oHorarioGroup = this.byId("horarioGroup");
            if (!oModel || !oHorarioGroup) {
                return;
            }

            if (oHorarioGroup.getSelectedIndex() !== 0) {
                this._setWizardPropertyIfChanged("/horarioUnico", "");
            }
            if (oHorarioGroup.getSelectedIndex() === 0) {
                this._setWizardPropertyIfChanged("/selectedHorario", 0);
            }
            this._buildHorariosEspecificos();
            this._updateReviewHorario();
            this._validateStep4();
        },

        onHorarioUnicoChange() {
            this._updateReviewHorario();
        },

        _buildHorariosEspecificos(aSelectedAccountsParam) {
            const oModel = this._getWizardModel();
            const iSelectedHorarioIndex = oModel.getProperty("/selectedHorario");
            const aSelectedAccounts = aSelectedAccountsParam || this._getSelectedStep2Accounts();

            // Reset if not building for options 2 or 3
            if (!aSelectedAccounts.length || iSelectedHorarioIndex === 0 || iSelectedHorarioIndex === null) {
                oModel.setProperty("/horariosPersonalizadosPorBanco", []);
                oModel.setProperty("/horariosPersonalizadosPorCuenta", []);
                return;
            }

            const aHorariosPorBanco = [];
            const aHorariosPorCuenta = [];
            const aHorariosDisponibles = oModel.getProperty("/horariosUnicos");
            const oBancosYaAgregados = new Set();

            aSelectedAccounts.forEach((oAccountEntry) => {
                const sBancoNombre = oAccountEntry.banco;
                const oAccountData = oAccountEntry.data;

                if (iSelectedHorarioIndex === 1) {
                    // Opción 2: Horario por banco (agregar una sola vez por banco)
                    if (!oBancosYaAgregados.has(sBancoNombre)) {
                        oBancosYaAgregados.add(sBancoNombre);
                        aHorariosPorBanco.push({
                            nombre: sBancoNombre,
                            selectedHorario: "",
                            horariosUnicos: aHorariosDisponibles
                        });
                    }
                } else if (iSelectedHorarioIndex === 2) {
                    // Opción 3: Horario por cuenta
                    aHorariosPorCuenta.push({
                        banco: sBancoNombre,
                        nombre: oAccountData.nombre,
                        cuentaCorriente: oAccountData.cuentaCorriente,
                        selectedHorario: "",
                        horariosUnicos: aHorariosDisponibles
                    });
                }
            });

            oModel.setProperty("/horariosPersonalizadosPorBanco", aHorariosPorBanco);
            oModel.setProperty("/horariosPersonalizadosPorCuenta", aHorariosPorCuenta);
        },

        onHorarioEspecificoChange(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) {
                return;
            }

            const sSelectedKey = oSelectedItem.getKey();
            const oSource = oEvent.getSource();
            const sDataKey = oSource.data("key");
            const oModel = this._getWizardModel();
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

        onSaldoSelectionChange(oEvent) {
            const oModel = this._getWizardModel();
            const oSaldoGroup = oEvent ? oEvent.getSource() : this.byId("saldoGroup");
            if (oModel && oSaldoGroup) {
                this._setWizardPropertyIfChanged("/selectedSaldoType", oSaldoGroup.getSelectedIndex());
            }

            this._buildSaldosPersonalizados();
            this._updateReviewSaldo();
            this._validateStep5();
        },

        _validateStep4() {
            const oHorarioGroup = this.byId("horarioGroup");
            const oModel = this._getWizardModel();

            if (!oHorarioGroup || !oModel) {
                return;
            }

            const iSelectedIndex = oHorarioGroup.getSelectedIndex();
            const bHorarioSelected = iSelectedIndex !== null && iSelectedIndex !== undefined && iSelectedIndex >= 0;
            const oDias = oModel.getProperty("/dias") || {};
            const bAnyDaySelected = Object.values(oDias).some(Boolean);
            const bValid = bHorarioSelected && bAnyDaySelected;

            this._setWizardStepValidation("wizardStep4", bValid);
            this._updateNavState(this._iCurrentStepIndex);
        },

        _validateStep5() {
            const oSaldoGroup = this.byId("saldoGroup");
            const oModel = this._getWizardModel();

            if (!oSaldoGroup || !oModel) {
                return;
            }

            const iSelectedIndex = oSaldoGroup.getSelectedIndex();
            let bValid = false;

            if (iSelectedIndex === 2) {
                // Option 3: valid immediately
                bValid = true;
            } else if (iSelectedIndex === 0) {
                const aBancos = oModel.getProperty("/saldosPersonalizadosPorBanco") || [];
                bValid = this._hasValidLocalizedInputs(aBancos);
            } else if (iSelectedIndex === 1) {
                const aCuentas = oModel.getProperty("/saldosPersonalizadosPorCuenta") || [];
                bValid = this._hasValidLocalizedInputs(aCuentas);
            }

            this._setWizardStepValidation("wizardStep5", bValid);
            this._updateNavState(this._iCurrentStepIndex);
        },

        _buildSaldosPersonalizados(aSelectedAccountsParam) {
            const oModel = this._getWizardModel();
            const iSelectedSaldoType = oModel.getProperty("/selectedSaldoType");
            const aSelectedAccounts = aSelectedAccountsParam || this._getSelectedStep2Accounts();

            if (!aSelectedAccounts.length || (iSelectedSaldoType !== 0 && iSelectedSaldoType !== 1)) {
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

            aSelectedAccounts.forEach((oAccountEntry) => {
                const sBancoNombre = oAccountEntry.banco;
                const oAccountData = oAccountEntry.data;
                const sCuentaCorriente = oAccountData.cuentaCorriente;
                const sCuentaNombre = oAccountData.nombre;
                const nSaldoInfoCent = Number(oAccountData.saldoInfoCent) || 0;
                const sCurrency = oAccountData.currency || "";

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

            const oModel = this._getWizardModel();
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
        },

        onCreateSingleTransfer() {
            const oTransferModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/wizardTransferData.json"));
            oTransferModel.attachRequestCompleted(() => {
                const aEmpresas = oTransferModel.getProperty("/empresas") || [];
                const aBancos = oTransferModel.getProperty("/bancos") || [];
                const aCuentasCentral = oTransferModel.getProperty("/cuentasCentralizadoras") || [];
                oTransferModel.setProperty("/_empresasAll", aEmpresas.slice());
                oTransferModel.setProperty("/_bancosAll", JSON.parse(JSON.stringify(aBancos)));
                oTransferModel.setProperty("/_cuentasCentralAll", aCuentasCentral.slice());
                this.getView().setModel(oTransferModel, "wizardTransfer");
                this._openTransferWizardDialogFragment();
            });
            oTransferModel.attachRequestFailed(() => {
                MessageToast.show("No se pudo cargar la configuración del wizard de transferencia.");
            });
        },

        _openTransferWizardDialogFragment() {
            if (!this._transferWizardDialog) {
                Fragment.load({
                    id: this.getView().getId(),
                    name: "cashpool.app.cashpool.view.fragments.WizardTransferDialog",
                    controller: this
                }).then((oDialog) => {
                    this._transferWizardDialog = oDialog;
                    this.getView().addDependent(this._transferWizardDialog);
                    this._transferWizardDialog.open();
                });
            } else {
                this._resetTransferWizard();
                this._transferWizardDialog.open();
            }
        },

        _getTransferWizardModel() {
            return this.getView().getModel("wizardTransfer");
        },

        // ─── Transfer wizard navigation ───────────────────────────────

        onTransferWizardDialogAfterOpen() {
            this._iTransferCurrentStepIndex = 0;
            this._updateTransferNavState(0);
        },

        onTransferWizardDialogAfterClose() {
            this._resetTransferWizard();
        },

        _resetTransferWizard() {
            const oWizard = this.byId("transferConfigWizard");
            if (oWizard) {
                oWizard.discardProgress(this.byId("wizardTransferStep1"), true);
            }
            const oModel = this._getTransferWizardModel();
            if (oModel) {
                oModel.setProperty("/transferAmount", "");
                oModel.setProperty("/review", {
                    razonSocial: "", cif: "",
                    cuentaOrigenBanco: "", cuentaOrigenCuenta: "",
                    cuentaDestinoBanco: "", cuentaDestinoCuenta: "",
                    importe: ""
                });
            }
            this._iTransferCurrentStepIndex = 0;
        },

        _updateTransferNavState(iIndex) {
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }
            const iTotalSteps = 5;
            const bIsFirst = iIndex === 0;
            const bIsLast = iIndex === iTotalSteps - 1;

            oModel.setProperty("/nav/backVisible", !bIsFirst);
            oModel.setProperty("/nav/nextVisible", !bIsLast);
            oModel.setProperty("/nav/acceptVisible", bIsLast);

            // Determine nextEnabled based on current step validation
            let bNextEnabled = false;
            if (iIndex === 0) {
                const oTable = this.byId("empresaTableTransfer");
                bNextEnabled = oTable ? oTable.getSelectedItems().length > 0 : false;
            } else if (iIndex === 1) {
                bNextEnabled = this._isTransferOrigenSelected();
            } else if (iIndex === 2) {
                const oDestTable = this.byId("cuentaDestinoTable");
                bNextEnabled = oDestTable ? oDestTable.getSelectedItems().length > 0 : false;
            } else if (iIndex === 3) {
                const sAmount = oModel.getProperty("/transferAmount") || "";
                bNextEnabled = sAmount.trim().length > 0 && !Number.isNaN(this._parseLocalizedNumber(sAmount));
            }
            oModel.setProperty("/nav/nextEnabled", bNextEnabled);
        },

        _isTransferOrigenSelected() {
            const oBancosList = this.byId("bancosListTransferStep2");
            if (!oBancosList) {
                return false;
            }
            const aItems = oBancosList.getItems();
            for (let i = 0; i < aItems.length; i++) {
                const oPanel = aItems[i].getContent ? aItems[i].getContent()[0] : null;
                if (oPanel && oPanel.getContent) {
                    const aContent = oPanel.getContent();
                    for (let j = 0; j < aContent.length; j++) {
                        if (aContent[j].getSelectedItems && aContent[j].getSelectedItems().length > 0) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },

        onTransferWizardNavChange(oEvent) {
            const oStep = oEvent.getParameter("step");
            const oWizard = this.byId("transferConfigWizard");
            if (!oWizard || !oStep) {
                return;
            }
            const aSteps = oWizard.getSteps();
            const iIndex = aSteps.indexOf(oStep);
            if (iIndex >= 0) {
                this._iTransferCurrentStepIndex = iIndex;
                this._updateTransferNavState(iIndex);
            }
        },

        onTransferWizardNext() {
            const oWizard = this.byId("transferConfigWizard");
            if (oWizard) {
                const aSteps = oWizard.getSteps();
                const iCurrent = this._iTransferCurrentStepIndex || 0;
                if (iCurrent < aSteps.length - 1) {
                    oWizard.nextStep();
                    this._iTransferCurrentStepIndex = iCurrent + 1;
                    this._updateTransferNavState(this._iTransferCurrentStepIndex);
                }
            }
        },

        onTransferWizardBack() {
            const oWizard = this.byId("transferConfigWizard");
            if (oWizard) {
                const iCurrent = this._iTransferCurrentStepIndex || 0;
                if (iCurrent > 0) {
                    oWizard.previousStep();
                    this._iTransferCurrentStepIndex = iCurrent - 1;
                    this._updateTransferNavState(this._iTransferCurrentStepIndex);
                }
            }
        },

        onTransferWizardCancel() {
            if (this._transferWizardDialog) {
                this._transferWizardDialog.close();
            }
        },

        // ─── Transfer wizard step handlers ────────────────────────────

        onEmpresaSearchTransfer(oEvent) {
            const sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }
            const aAll = oModel.getProperty("/_empresasAll") || [];
            if (!sQuery) {
                oModel.setProperty("/empresas", aAll.slice());
                return;
            }
            const aFiltered = aAll.filter((o) =>
                o.razonSocial.toLowerCase().includes(sQuery) || o.cif.toLowerCase().includes(sQuery)
            );
            oModel.setProperty("/empresas", aFiltered);
        },

        onEmpresaSelectionChangeTransfer() {
            this._updateTransferNavState(0);
        },

        onCuentasSearchTransfer(oEvent) {
            const sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }
            const aAll = oModel.getProperty("/_bancosAll") || [];
            if (!sQuery) {
                oModel.setProperty("/bancos", JSON.parse(JSON.stringify(aAll)));
                return;
            }
            const aFiltered = JSON.parse(JSON.stringify(aAll)).map((oBanco) => {
                const bBankMatch = oBanco.nombre.toLowerCase().includes(sQuery);
                if (!bBankMatch) {
                    oBanco.cuentas = oBanco.cuentas.filter((c) =>
                        c.oficina.toLowerCase().includes(sQuery) || c.cuentaCorriente.toLowerCase().includes(sQuery)
                    );
                }
                return oBanco;
            }).filter((oBanco) => oBanco.cuentas.length > 0);
            oModel.setProperty("/bancos", aFiltered);
        },

        onCuentaOrigenSelectionChange(oEvent) {
            this.byId("bancosListTransferStep2").getAggregation("items").map(e => {e.getContent()[0].getContent()[0].getSelectedItem()?.setSelected(false)})
            oEvent.getParameter("listItem").setSelected(true);
            this._updateTransferNavState(1);
        },

        onCuentaDestinoSearchTransfer(oEvent) {
            const sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }
            const aAll = oModel.getProperty("/_cuentasCentralAll") || [];
            if (!sQuery) {
                oModel.setProperty("/cuentasCentralizadoras", aAll.slice());
                return;
            }
            const aFiltered = aAll.filter((o) =>
                o.nombre.toLowerCase().includes(sQuery) ||
                o.oficina.toLowerCase().includes(sQuery) ||
                o.cuentaCorriente.toLowerCase().includes(sQuery)
            );
            oModel.setProperty("/cuentasCentralizadoras", aFiltered);
        },

        onCuentaDestinoSelectionChange() {
            this._updateTransferNavState(2);
        },

        onTransferAmountChange(oEvent) {
            this._getTransferWizardModel().setProperty('/transferAmount', oEvent.getParameter('newValue'))
            this._updateTransferNavState(3);
        },

        // ─── Transfer wizard review ──────────────────────────────────

        onTransferReviewStepActivate() {
            this._updateTransferReview();
        },

        _updateTransferReview() {
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }

            // Empresa
            const oEmpresaTable = this.byId("empresaTableTransfer");
            if (oEmpresaTable) {
                const aSelected = oEmpresaTable.getSelectedItems();
                if (aSelected.length > 0) {
                    const oCtx = aSelected[0].getBindingContext("wizardTransfer");
                    if (oCtx) {
                        oModel.setProperty("/review/razonSocial", oCtx.getProperty("razonSocial"));
                        oModel.setProperty("/review/cif", oCtx.getProperty("cif"));
                    }
                }
            }

            // Cuenta Origen
            const oBancosList = this.byId("bancosListTransferStep2");
            if (oBancosList) {
                const aItems = oBancosList.getItems();
                for (let i = 0; i < aItems.length; i++) {
                    const oPanel = aItems[i].getContent ? aItems[i].getContent()[0] : null;
                    if (oPanel && oPanel.getContent) {
                        const aContent = oPanel.getContent();
                        for (let j = 0; j < aContent.length; j++) {
                            if (aContent[j].getSelectedItems && aContent[j].getSelectedItems().length > 0) {
                                const oSelCtx = aContent[j].getSelectedItems()[0].getBindingContext("wizardTransfer");
                                if (oSelCtx) {
                                    const sBanco = oSelCtx.getPath().split("/cuentas")[0];
                                    oModel.setProperty("/review/cuentaOrigenBanco", oModel.getProperty(sBanco + "/nombre"));
                                    oModel.setProperty("/review/cuentaOrigenCuenta",  `${oSelCtx.getObject().nombre}\nOficina: ${oSelCtx.getObject().oficina}\nCuenta: ${oSelCtx.getObject().cuentaCorriente}`);
                                }
                            }
                        }
                    }
                }
            }

            // Cuenta Destino
            const oDestinoTable = this.byId("cuentaDestinoTable");
            if (oDestinoTable) {
                const aSelDest = oDestinoTable.getSelectedItems();
                if (aSelDest.length > 0) {
                    const oCtxDest = aSelDest[0].getBindingContext("wizardTransfer");
                    if (oCtxDest) {
                        oModel.setProperty("/review/cuentaDestinoBanco", "Bankinter");
                        oModel.setProperty("/review/cuentaDestinoCuenta",  `${oCtxDest.getObject().nombre}\nOficina: ${oCtxDest.getObject().oficina}\nCuenta: ${oCtxDest.getObject().cuentaCorriente}`);
                    }
                }
            }

            // Importe
            const sAmount = oModel.getProperty("/transferAmount") || "";
            const nParsed = this._parseLocalizedNumber(sAmount);
            if (!Number.isNaN(nParsed)) {
                oModel.setProperty("/review/importe", this._formatLocalizedNumber(nParsed));
            } else {
                oModel.setProperty("/review/importe", sAmount);
            }
        },

        onEditStepTransfer(oEvent) {
            const sStep = oEvent.getSource().data("step");
            const iIndex = parseInt(sStep, 10) - 1;
            const oWizard = this.byId("transferConfigWizard");
            if (oWizard) {
                oWizard.goToStep(this.byId("wizardTransferStep" + sStep), true);
                this._iTransferCurrentStepIndex = iIndex;
                this._updateTransferNavState(iIndex);
            }
        },

        onTransferWizardAccept() {
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }
            this._updateTransferReview();
            const oReview = oModel.getProperty("/review");
            const oPreparedTransfer = {
                empresa: {
                    razonSocial: oReview.razonSocial,
                    cif: oReview.cif
                },
                cuentaOrigen: {
                    banco: oReview.cuentaOrigenBanco,
                    cuentaCorriente: oReview.cuentaOrigenCuenta
                },
                cuentaDestino: {
                    nombre: oReview.cuentaDestinoBanco,
                    cuentaCorriente: oReview.cuentaDestinoCuenta
                },
                importe: this._parseLocalizedNumber(oModel.getProperty("/transferAmount")) || 0
            };
            oModel.setProperty("/preparedTransfer", oPreparedTransfer);
            MessageToast.show(this._oResourceBundle.getText("msgTransferPrepared", [oReview.importe]));
            if (this._transferWizardDialog) {
                this.onAnotherButtonPress(oPreparedTransfer);
                this._transferWizardDialog.close();
            }
        },

        onAnotherButtonPress(oTransferObject) {
            const oTreasureModel = this.getView().getModel("Cashpool");
            const oContext = oTreasureModel.bindContext('/postBankTransfer(...)');
            const oToPostBank = {
                                "destinationName": "DS9",
                                "valueDate": new Date().toISOString(),
                                "payingCompanyCode": "2000",
                                "payingBankAccount": "0123456789",
                                "payingHouseBank": "SANT0",
                                "payingHouseBankAccount": "0",
                                "payeeHouseBank": "SANT1",
                                "payeeHouseBankAccount": "1",
                                "paymentRequestAmountInPaytCrcy": oTransferObject.importe,
                                "paymentRequestCurrency": "EUR",
                                "payeeBankAccount": "1234567899",
                                "payeeCompanyCode": "2000",
                                "bankTransferReleaseAndPay": true
                                };
                
                //oContext.setParameter("parameters", oToPostBank);
                oContext.setParameter("parameters", oToPostBank).invoke().then(() => {
                    var oActionContext = oContext.getBoundContext();
                    var sError = oActionContext.getObject().error;
                    if (sError) {
                        MessageToast.show("Error from backend: " + sError);
                        return;
                    } else {
                        console.log(sError);                    
                        MessageToast.show("Bank transfer posted successfully!");
                    }
                    }).catch((oError) => {
                    MessageToast.show("Error posting bank transfer: " + oError.error.message);
                });

                // oContext.execute().then(() => {
                //     var oActionContext = oContext.getBoundContext();
                //     var sError = oActionContext.getObject().error;
                //     if (sError) {
                //         MessageToast.show("Error from backend: " + sError);
                //         return;
                //     } else {
                //     console.log(sError);                    
                //     MessageToast.show("Bank transfer posted successfully!");}
                // }).catch((oError) => {
                //     MessageToast.show("Error posting bank transfer: " + oError.error.message);
                // });
            }
    });
});