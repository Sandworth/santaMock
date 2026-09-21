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
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/viz/ui5/format/ChartFormatter",
    "sap/viz/ui5/api/env/Format"
], (Controller, JSONModel, Fragment, Formatter, MessageToast, Dialog, Button, Text, NumberFormat, Filter, FilterOperator, ChartFormatter, Format) => {
    "use strict";

    return Controller.extend("cashpool.app.cashpool.controller.Treasury", {
        onInit: function () {
            // Get i18n bundle for translations from component
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            this._oResourceBundle = oResourceBundle;

            // Load view model data from JSON file and localize i18n-dependent fields
            const oViewModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/treasuryView.json"));
            oViewModel.attachRequestCompleted(() => {
                this._applyViewModelI18n(oViewModel);
                // Lazy loading: transfer history loaded on tab selection
            });
            this.getView().setModel(oViewModel, "view");

            const oEmpresasModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/empresas.json"));
            this.getView().setModel(oEmpresasModel, "empresas");

            // Load balance data from Cashpool OData model for the List
            const oCashpoolModel = this.getOwnerComponent().getModel("Cashpool");
            if (oCashpoolModel) {
                const oBinding = oCashpoolModel.bindList("/getBalanceOfCompanies()");
                const oVizFrame = this.getView().byId("saldosVizFrame");
                const oConfigureNowButton = this.getView().byId("btnConfigureNow");
                const oManualTransferButton = this.getView().byId("btnTransferenciaManual");
                const oSaldosList = this.getView().byId("saldosList");
                if (oVizFrame && oConfigureNowButton && oManualTransferButton && oSaldosList) {
                    oVizFrame.setBusy(true);
                    oConfigureNowButton.setBusy(true);
                    oManualTransferButton.setBusy(true);
                    oSaldosList.setBusy(true);
                }
                oBinding.requestContexts().then((aContexts) => {
                    let aData = aContexts.map((oContext) => oContext.getObject());
                    const aDataEUR = aData.filter((oItem) => oItem.Currency === "EUR");
                    const oSaldosModel = new JSONModel(aDataEUR);
                    this.getView().setModel(oSaldosModel, "saldos");
                    this.getView().setModel(oSaldosModel, "empresas");
                }).catch(() => {
                    MessageToast.show(this._oResourceBundle.getText("errorLoadingSaldos"));
                    this.getView().setModel(new JSONModel([]), "saldos");
                    this.getView().setModel(new JSONModel([]), "empresas");
                }).finally(() => {
                    oVizFrame.setBusy(false);
                    oConfigureNowButton.setBusy(false);
                    oManualTransferButton.setBusy(false);
                    oSaldosList.setBusy(false);
                });
            }

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
                        title: { visible: false },
                        label: {
                            rotation: 45,
                            hideOverlap: false
                        }
                    }
                });
            }
        },

        onTabSelect: function (oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedKey");
            this._getViewModel().setProperty("/selectedTab", sSelectedKey);

            // Lazy load transfer history when selecting transfer tabs
            if (sSelectedKey === "MANUAL" || sSelectedKey === "AUTO") {
                this._loadTransferHistoryData(sSelectedKey);
            }
        },

        _applyViewModelI18n: function (oViewModel) {
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

        onDownloadReceipt: function (oEvent) {
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

        _loadTransferHistoryData: function (sType) {
            // Load specific type with busy indicator on the tab bar
            const oIconTabBar = this.getView().byId("idIconTabBar");
            if (oIconTabBar) {
                oIconTabBar.setBusy(true);
            }

            this._fetchTransferHistoryByType(sType)
                .then((aTransfers) => {
                    this._buildTransferenciasGroupsByType(sType, aTransfers);
                })
                .catch(() => {
                    MessageToast.show("No se pudo cargar el histórico de transferencias.");
                    this._buildTransferenciasGroupsByType(sType, []);
                })
                .finally(() => {
                    if (oIconTabBar) {
                        oIconTabBar.setBusy(false);
                    }
                });
        },

        _fetchTransferHistoryByType: function (sType) {
            const oCashpoolModel = this.getOwnerComponent().getModel("Cashpool");
            if (!oCashpoolModel) {
                return Promise.resolve([]);
            }

            const oBinding = oCashpoolModel.bindList(
                "/BankTransferHistory",
                null,
                null,
                [new Filter("type", FilterOperator.EQ, sType)]
            );

            return oBinding.requestContexts().then((aContexts) =>
                aContexts.map((oContext) => this._mapTransferHistoryItem(oContext.getObject(), sType))
            );
        },

        _mapTransferHistoryItem: function (oItem, sType) {
            const sTransferCurrency = oItem.amounts_paymCurr || oItem.payerAccount?.Currency || "EUR";
            const sBalanceCurrency = oItem.payerAccount?.Currency || sTransferCurrency;

            return {
                razonSocial: oItem.payerAccount?.CompanyName|| "-",
                cif: oItem.payerAccount?.CompanyCode || "-",
                fecha: oItem.createdAt,
                origen: {
                    banco: oItem.payerBankName || "-",
                    oficina: oItem.payerAccount?.Iban.substring(8,12) || "-",
                    cuenta: oItem.payerAccount?.Iban || "-"
                },
                destino: {
                    banco: oItem.payeeBankName || "-",
                    oficina: oItem.payeeAccount?.Iban.substring(8,12) || "-",
                    cuenta: oItem.payeeAccount?.Iban || "-"
                },
                saldoAntes: {
                    monto: this._toNumber(oItem.payerAccount?.StatementAmount),
                    moneda: sBalanceCurrency
                },
                saldoProgramado: {
                    monto: this._toNumber(oItem.amounts_plannedAmount || oItem.plannedAmount || 0),
                    moneda: sBalanceCurrency
                },
                valorTransferencia: {
                    monto: this._toNumber(oItem.amounts_paymAmountLong || oItem.amounts_paymAmount),
                    moneda: sTransferCurrency
                },
                paymentDoc: oItem.paymentDoc || "-",
                requestId: oItem.requestId || "-",
                status: this._mapTransferStatus(oItem.status) || "-",
                tipo: sType
            };
        },

        _toNumber: function (vAmount) {
            const nAmount = Number(vAmount);
            return Number.isFinite(nAmount) ? nAmount : 0;
        },

        _mapTransferStatus: function (sRawStatus) {
            const sCode = String(sRawStatus || "").trim().toUpperCase();

            const oStatusMap = {
                BCR: { textKey: "statusCodeBCR", state: "Information" },
                TBA: { textKey: "statusCodeTBA", state: "Warning" },
                AAPRV: { textKey: "statusCodeAAPRV", state: "Success" },
                APRV: { textKey: "statusCodeAPRV", state: "Success" },
                REJ: { textKey: "statusCodeREJ", state: "Error" },
                SENT: { textKey: "statusCodeSENT", state: "Information" },
                ACK: { textKey: "statusCodeACK", state: "Information" },
                ACCP: { textKey: "statusCodeACCP", state: "Success" },
                RJCT: { textKey: "statusCodeRJCT", state: "Error" },
                CMP: { textKey: "statusCodeCMP", state: "Success" },
                "-": { textKey: "statusCodeUnknown", state: "Warning" }
            };

            const oMapped = oStatusMap[sCode];
            if (oMapped) {
                return {
                    code: sCode,
                    text: this._oResourceBundle.getText(oMapped.textKey),
                    state: oMapped.state
                };
            }

            return {
                code: sCode || "-",
                text: sCode || this._oResourceBundle.getText("statusCodeUnknown"),
                state: "Warning"
            };
        },

        _getStatusOptions: function () {
            return [
                { key: "ALL", text: this._oResourceBundle.getText("allStatusesOption") },
                { key: "BCR", text: this._oResourceBundle.getText("statusCodeBCR") },
                { key: "TBA", text: this._oResourceBundle.getText("statusCodeTBA") },
                { key: "AAPRV", text: this._oResourceBundle.getText("statusCodeAAPRV") },
                { key: "APRV", text: this._oResourceBundle.getText("statusCodeAPRV") },
                { key: "REJ", text: this._oResourceBundle.getText("statusCodeREJ") },
                { key: "SENT", text: this._oResourceBundle.getText("statusCodeSENT") },
                { key: "ACK", text: this._oResourceBundle.getText("statusCodeACK") },
                { key: "ACCP", text: this._oResourceBundle.getText("statusCodeACCP") },
                { key: "RJCT", text: this._oResourceBundle.getText("statusCodeRJCT") },
                { key: "CMP", text: this._oResourceBundle.getText("statusCodeCMP") },
                { key: "-", text: this._oResourceBundle.getText("statusCodeUnknown") }
            ];
        },

        _buildTransferenciasGroupsByType: function (sType, aTransferencias) {
            const oModel = this._getViewModel();
            const oGroupsByKey = new Map();

            aTransferencias.forEach((oTransferencia) => {
                const sGroupKey = `${oTransferencia.razonSocial}|${oTransferencia.cif}`;
                if (!oGroupsByKey.has(sGroupKey)) {
                    oGroupsByKey.set(sGroupKey, {
                        razonSocial: oTransferencia.razonSocial,
                        cif: oTransferencia.cif,
                        expanded: true,
                        selectedCount: 0,
                        filters: {
                            dateFrom: null,
                            dateTo: null,
                            status: "ALL"
                        },
                        statusOptions: this._getStatusOptions(),
                        transferencias: [],
                        _allTransferencias: []
                    });
                }

                const oGroup = oGroupsByKey.get(sGroupKey);
                oGroup.transferencias.push(oTransferencia);
                oGroup._allTransferencias.push(oTransferencia);
            });

            const aGroups = Array.from(oGroupsByKey.values()).map((oGroup, iIndex) => {
                // Sort transfers by date descending (most recent first)
                oGroup.transferencias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                oGroup._allTransferencias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

                return {
                    ...oGroup,
                    activo: sType === "AUTO" ? iIndex === 0 : false
                };
            });

            const oPaths = this._getTransferGroupPaths(sType);
            oModel.setProperty(oPaths.allPath, aGroups);
            oModel.setProperty(oPaths.visiblePath, aGroups.slice());
        },

        _getTransferGroupPaths: function (sType) {
            if (sType === "MANUAL") {
                return {
                    allPath: "/_transferenciasAgrupadasManualAll",
                    visiblePath: "/transferenciasAgrupadasManual"
                };
            }

            return {
                allPath: "/_transferenciasAgrupadasAutoAll",
                visiblePath: "/transferenciasAgrupadasAuto"
            };
        },

        onTransferenciasGroupSearch: function (oEvent) {
            const sRawQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").trim();
            const sNormalizedQuery = this._normalizeNifSearch(sRawQuery);
            const oModel = this._getViewModel();
            const sTransferType = oEvent.getSource().data("transferType") || "AUTO";
            const oPaths = this._getTransferGroupPaths(sTransferType);
            const aAllGroups = oModel.getProperty(oPaths.allPath) || [];

            if (!sNormalizedQuery) {
                oModel.setProperty(oPaths.visiblePath, aAllGroups.slice());
                return;
            }

            const aFilteredGroups = aAllGroups.filter((oGroup) =>
                this._normalizeNifSearch(oGroup.cif).includes(sNormalizedQuery) ||
                this._normalizeNifSearch(oGroup.razonSocial).includes(sNormalizedQuery)
            );

            oModel.setProperty(oPaths.visiblePath, aFilteredGroups);
        },

        _normalizeNifSearch: function (sValue) {
            return (sValue || "").toLowerCase().trim();
        },

        onTransferGroupActivationChange: function (oEvent) {
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

        onTransferenciasSearch: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("view");
            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const oModel = this._getViewModel();
            const oGroup = oModel.getProperty(sPath);
            const oFilters = oGroup.filters || {};

            const aFiltered = (oGroup._allTransferencias || []).filter((oTransferencia) => {
                // const oTransferDate = this._parseTransferDate(oTransferencia.fecha);
                const oTransferDate = this._normalizeDate(new Date(oTransferencia.fecha))
                const oFromDate = this._normalizeDate(oFilters.dateFrom);
                const oToDate = this._normalizeDate(oFilters.dateTo);

                const bMatchesFrom = !oFromDate || (oTransferDate && oTransferDate >= oFromDate);
                const bMatchesTo = !oToDate || (oTransferDate && oTransferDate <= oToDate);
                const bMatchesStatus = oFilters.status === "ALL" || oTransferencia.status.code === oFilters.status;

                return bMatchesFrom && bMatchesTo && bMatchesStatus;
            });

            oModel.setProperty(`${sPath}/transferencias`, aFiltered);
            oModel.setProperty(`${sPath}/selectedCount`, 0);
        },

        onTransferenciasClear: function (oEvent) {
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

        // onTransferenciaSelectionChange: function (oEvent) {
        //     const oTable = oEvent.getSource();
        //     const iSelectedCount = oTable.getSelectedItems().length;
        //     const oContext = oTable.getBindingContext("view");

        //     if (!oContext) {
        //         return;
        //     }

        //     this._getViewModel().setProperty(`${oContext.getPath()}/selectedCount`, iSelectedCount);
        // },

        onConsultConfiguration: function () {
            this._openWizardDialog();
        },

        // onExportReceipts: function (oEvent) {
        //     const oPanel = this._getParentPanel(oEvent.getSource());
        //     const oTable = oPanel && oPanel.getContent().find((oContent) => oContent.isA("sap.m.Table"));
        //     const iSelected = oTable ? oTable.getSelectedItems().length : 0;

        //     if (!iSelected) {
        //         MessageToast.show(this._oResourceBundle.getText("msgSelectAtLeastOne"));
        //         return;
        //     }

        //     MessageToast.show(this._oResourceBundle.getText("msgExportReceipts", [iSelected]));
        // },

        _getParentPanel: function (oControl) {
            let oParent = oControl;
            while (oParent && !oParent.isA("sap.m.Panel")) {
                oParent = oParent.getParent();
            }
            return oParent;
        },

        _parseTransferDate: function (sDate) {
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

        _normalizeDate: function (oDate) {
            if (!(oDate instanceof Date)) {
                return null;
            }

            const oNormalizedDate = new Date(oDate.getTime());
            oNormalizedDate.setHours(0, 0, 0, 0);
            return oNormalizedDate;
        },

        _mapEmpresaForWizard: function (oEmpresa) {
            return {
                razonSocial: oEmpresa?.razonSocial || oEmpresa?.CompanyName || "",
                cif: oEmpresa?.cif || oEmpresa?.VatNumber || "",
                CompanyCode: oEmpresa?.CompanyCode || ""
            };
        },

        _getWizardEmpresasData: function (aFallbackEmpresas) {
            const aSaldos = this.getView().getModel("empresas")?.getData();
            const aSource = Array.isArray(aSaldos) && aSaldos.length ? aSaldos : (aFallbackEmpresas || []);

            return aSource.map((oEmpresa) => this._mapEmpresaForWizard(oEmpresa));
        },

        _setWizardBanksData: function (oModel, oTransformed) {
            oModel.setProperty("/_bancosAll", JSON.parse(JSON.stringify(oTransformed.bancos)));
            oModel.setProperty("/_cuentasCentralAll", oTransformed.cuentasCentralizadoras.slice());
            oModel.setProperty("/bancos", JSON.parse(JSON.stringify(oTransformed.bancos)));
            oModel.setProperty("/cuentasCentralizadoras", oTransformed.cuentasCentralizadoras.slice());
            oModel.setProperty("/companyContextReady", true);
        },

        _clearWizardBanksData: function (oModel) {
            if (!oModel) {
                return;
            }

            oModel.setProperty("/_bancosAll", []);
            oModel.setProperty("/_cuentasCentralAll", []);
            oModel.setProperty("/bancos", []);
            oModel.setProperty("/cuentasCentralizadoras", []);
            oModel.setProperty("/companyContextReady", false);
        },

        _clearWizardDependentState: function () {
            const oModel = this._getWizardModel();
            if (!oModel) {
                return;
            }

            this._clearWizardBanksData(oModel);
            oModel.setProperty("/horariosPersonalizadosPorBanco", []);
            oModel.setProperty("/horariosPersonalizadosPorCuenta", []);
            oModel.setProperty("/saldosPersonalizadosPorBanco", []);
            oModel.setProperty("/saldosPersonalizadosPorCuenta", []);
            oModel.setProperty("/review/cuentasSeleccionadas", "");
            oModel.setProperty("/review/cuentaCentralNombre", "");
            oModel.setProperty("/review/cuentaCentralCuenta", "");
            oModel.setProperty("/review/horario", "");
            oModel.setProperty("/review/dias", "");
            oModel.setProperty("/review/saldoAdicionalData", "");

            ["wizardStep2", "wizardStep3", "wizardStep4", "wizardStep5"].forEach((sStepId) => {
                this._setWizardStepValidation(sStepId, false);
            });
        },

        _clearTransferWizardDependentState: function () {
            const oModel = this._getTransferWizardModel();
            if (!oModel) {
                return;
            }

            oModel.setProperty("/_bancosAll", []);
            oModel.setProperty("/_cuentasCentralAll", []);
            oModel.setProperty("/bancos", []);
            oModel.setProperty("/cuentasCentralizadoras", []);
            oModel.setProperty("/companyContextReady", false);
            oModel.setProperty("/transferAmount", "");
            oModel.setProperty("/review/cuentaOrigenBanco", "");
            oModel.setProperty("/review/cuentaOrigenCuenta", "");
            oModel.setProperty("/review/cuentaDestinoBanco", "");
            oModel.setProperty("/review/cuentaDestinoCuenta", "");
            oModel.setProperty("/review/importe", "");
        },

        _loadBanksForSelectedCompany: function (oOptions) {
            const {
                CompanyCode: sCompanyCode,
                modelName: sModelName,
                dialog: oDialog,
                onSuccess: fnOnSuccess,
                errorMessage: sErrorMessage
            } = oOptions;

            const oCashpoolModel = this.getView().getModel("Cashpool");
            const oModel = this.getView().getModel(sModelName);
            if (!oCashpoolModel || !oModel || !sCompanyCode) {
                return Promise.reject(new Error("Missing company selection context"));
            }

            this._mActiveCompanyRequestKeys = this._mActiveCompanyRequestKeys || {};
            const sRequestKey = `${sModelName}:${sCompanyCode}:${Date.now()}`;
            this._mActiveCompanyRequestKeys[sModelName] = sRequestKey;
            if (oDialog) {
                oDialog.setBusy(true);
            }

            const oActionBinding = oCashpoolModel.bindContext("/postSelectCompany(...)");
            oActionBinding.setParameter("parameters", { CompanyCode: sCompanyCode });

            return oActionBinding.invoke()
                .then(() => {
                    if (this._mActiveCompanyRequestKeys[sModelName] !== sRequestKey) {
                        return null;
                    }

                    const oBanksBinding = oCashpoolModel.bindList("/Banks", null, null, null, {
                        $expand: "AccountBalance"
                    });
                    return oBanksBinding.requestContexts(0, 1000);
                })
                .then((aContexts) => {
                    if (!aContexts || this._mActiveCompanyRequestKeys[sModelName] !== sRequestKey) {
                        return;
                    }

                    const aBanks = aContexts.map((oContext) => oContext.getObject());
                    const oTransformed = this._transformBanksODataToBancos({ value: aBanks });
                    fnOnSuccess(oModel, oTransformed);
                })
                .catch((oError) => {
                    if (this._mActiveCompanyRequestKeys[sModelName] === sRequestKey) {
                        MessageToast.show(sErrorMessage);
                        throw oError;
                    }
                })
                .finally(() => {
                    if (this._mActiveCompanyRequestKeys[sModelName] === sRequestKey) {
                        delete this._mActiveCompanyRequestKeys[sModelName];
                        if (oDialog) {
                            oDialog.setBusy(false);
                        }
                    }
                });
        },

        _openConfigurationDialog: function () {
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

        onConfigureNow: function () {
            if (this._configDialog) {
                this._configDialog.close();
            }
            this._openWizardDialog();
        },

        _openWizardDialog: function () {
            const oWizardModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/wizardData.json"));
            oWizardModel.attachRequestCompleted(() => {
                const aEmpresas = this._getWizardEmpresasData(oWizardModel.getProperty("/empresas"));

                oWizardModel.setProperty("/empresas", aEmpresas);
                oWizardModel.setProperty("/_empresasAll", aEmpresas.slice());
                this._clearWizardBanksData(oWizardModel);

                this.getView().setModel(oWizardModel, "wizard");
                this._openWizardDialogFragment();
            });
            oWizardModel.attachRequestFailed(() => {
                MessageToast.show("No se pudo cargar la configuración del wizard.");
            });
        },

        _openWizardDialogFragment: function () {

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

        _getWizardModel: function () {
            return this.getView().getModel("wizard");
        },

        _getViewModel: function () {
            return this.getView().getModel("view");
        },

        _setModelPropertyIfChanged: function (oModel, sPath, vValue) {
            if (!oModel) {
                return;
            }

            const vCurrent = oModel.getProperty(sPath);
            if (vCurrent !== vValue) {
                oModel.setProperty(sPath, vValue);
            }
        },

        _setWizardPropertyIfChanged: function (sPath, vValue) {
            this._setModelPropertyIfChanged(this._getWizardModel(), sPath, vValue);
        },

        _setWizardStepValidation: function (sStepId, bValid) {
            const oWizard = this.byId("configWizard");
            const oStep = this.byId(sStepId);
            if (!oWizard || !oStep) {
                return;
            }
            bValid ? oWizard.validateStep(oStep) : oWizard.invalidateStep(oStep);
        },

        _getSelectedStep2Accounts: function () {
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
                const sBancoNombre = oBancoContext ? oBancoContext.getProperty("BankName") : "";

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

        _hasValidLocalizedInputs: function (aItems) {
            return aItems.length > 0 && aItems.every((oItem) => {
                const sInput = (oItem.saldoPersonalizadoInput || "").trim();
                if (!sInput) {
                    return false;
                }
                return !Number.isNaN(this._parseLocalizedNumber(sInput));
            });
        },

        _resetWizard: function () {
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

        onWizardCancel: function () {
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        onWizardAccept: function () {
            const oModel = this._getWizardModel();
            const oReview = oModel.getProperty("/review");
            //MessageToast.show(`Configuració guardada: ${oReview.razonSocial} | ${oReview.cuentaCentralNombre} | ${oReview.horario}`);
            MessageToast.show(this._oResourceBundle.getText("msgSavedConfig", [oReview.razonSocial, oReview.cuentaCentralNombre, oReview.horario]));
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        onWizardDialogAfterClose: function () {
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

        onReviewStepActivate: function () {
            this._updateReviewEmpresa();
            this._updateReviewCuentas();
            this._updateReviewCuentaCentral();
            this._updateReviewHorario();
            this._updateReviewDias();
            this._updateReviewSaldo();
        },

        _updateReviewEmpresa: function () {
            const oModel = this._getWizardModel();
            const oEmpresaTable = this.byId("empresaTable");
            const oSelected = oEmpresaTable ? oEmpresaTable.getItems().find((i) => i.getSelected()) : null;
            if (oSelected) {
                const oCtx = oSelected.getBindingContext("wizard");
                oModel.setProperty("/review/razonSocial", oCtx.getProperty("CompanyName"));
                oModel.setProperty("/review/cif", oCtx.getProperty("VatNumber"));
            } else {
                oModel.setProperty("/review/razonSocial", "");
                oModel.setProperty("/review/cif", "");
            }
        },

        _updateReviewCuentas: function () {
            const oModel = this._getWizardModel();
            const aCuentasSeleccionadas = this._getSelectedStep2Accounts().map((oEntry) => oEntry.data);
            oModel.setProperty("/review/cuentasSeleccionadas", aCuentasSeleccionadas.map((c) => c.Description).join(", ") || "-");
        },

        _updateReviewCuentaCentral: function () {
            const oModel = this._getWizardModel();
            const oCuentaTable = this.byId("cuentaCentralTable");
            const oSelected = oCuentaTable ? oCuentaTable.getItems().find((i) => i.getSelected()) : null;
            if (oSelected) {
                const oCtx = oSelected.getBindingContext("wizard");
                oModel.setProperty("/review/cuentaCentralNombre", "Santander");
                oModel.setProperty("/review/cuentaCentralCuenta", `${oCtx.getObject().Description}\nOficina: ${oCtx.getObject().HouseBank}\nCuenta: ${oCtx.getObject().cuentaCorriente}`);
            } else {
                oModel.setProperty("/review/cuentaCentralNombre", "");
                oModel.setProperty("/review/cuentaCentralCuenta", "");
            }
        },

        _updateReviewHorario: function () {
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

        _updateReviewDias: function () {
            const oModel = this._getWizardModel();
            const oDias = oModel.getProperty("/dias") || {};
            const aDiasSeleccionados = Object.entries(oDias)
                .filter(([, bSelected]) => bSelected)
                .map(([sDay]) => sDay.charAt(0).toUpperCase() + sDay.slice(1));
            oModel.setProperty("/review/dias", aDiasSeleccionados.join(", ") || "-");
        },

        _updateReviewSaldo: function () {
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

        _formatAmountForReview: function (vAmount, sCurrency) {
            const nAmount = Number(vAmount);
            if (Number.isNaN(nAmount)) {
                return "";
            }
            if (sCurrency) {
                return Formatter.formatCurrency(nAmount, sCurrency);
            }
            return this._formatLocalizedNumber(nAmount);
        },

        _getLocalizedFloatFormatter: function () {
            if (!this._oLocalizedFloatFormatter) {
                this._oLocalizedFloatFormatter = NumberFormat.getFloatInstance({
                    groupingEnabled: true,
                    minFractionDigits: 2,
                    maxFractionDigits: 2
                });
            }
            return this._oLocalizedFloatFormatter;
        },

        _formatLocalizedNumber: function (nValue) {
            return this._getLocalizedFloatFormatter().format(nValue);
        },

        onEmpresaSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oModel = this._getWizardModel();
            const aAll = oModel.getProperty("/_empresasAll");
            const aFiltered = sQuery
                ? aAll.filter((o) =>
                    o.razonSocial?.toLowerCase().includes(sQuery) ||
                    o.cif?.toLowerCase().includes(sQuery)
                )
                : aAll.slice();
            oModel.setProperty("/empresas", aFiltered);
        },

        onCuentasSearch: function (oEvent) {
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
                    const bBancoMatch = oBanco.BankName.toLowerCase().includes(sQuery);
                    const aCuentasFiltradas = bBancoMatch
                        ? oBanco.cuentas
                        : oBanco.cuentas.filter((c) =>
                            c.Description.toLowerCase().includes(sQuery) ||
                            c.cuentaCorriente.toLowerCase().includes(sQuery));
                    return aCuentasFiltradas.length > 0
                        ? Object.assign({}, oBanco, { cuentas: aCuentasFiltradas, expanded: true })
                        : null;
                })
                .filter(Boolean);
            oModel.setProperty("/bancos", aFiltered);
        },

        onCuentaCentralSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase();
            const oModel = this._getWizardModel();
            const aAll = oModel.getProperty("/_cuentasCentralAll");
            const aFiltered = sQuery
                ? aAll.filter((o) =>
                    o.Description.toLowerCase().includes(sQuery) ||
                    o.HouseBank.toLowerCase().includes(sQuery) ||
                    o.cuentaCorriente.toLowerCase().includes(sQuery))
                : aAll.slice();
            oModel.setProperty("/cuentasCentralizadoras", aFiltered);
        },

        onWizardDialogAfterOpen: function () {
            const oWizard = this.byId("configWizard");
            if (!oWizard) {
                return;
            }
            const sCurrentId = oWizard.getCurrentStep();
            const aSteps = oWizard.getSteps();
            const iIndex = aSteps.findIndex((s) => s.getId() === sCurrentId);
            this._updateNavState(Math.max(0, iIndex));
        },

        _isStep1Valid: function () {
            const oEmpresaTable = this.byId("empresaTable");
            return !!oEmpresaTable && oEmpresaTable.getItems().some((i) => i.getSelected());
        },

        _updateNavState: function (iIndex) {
            const oModel = this._getWizardModel();
            const oWizard = this.byId("configWizard");
            if (!oModel || !oWizard) {
                return;
            }
            const aSteps = oWizard ? oWizard.getSteps() : [];
            const bIsLast = iIndex === aSteps.length - 1;
            const bCurrentValid = iIndex === 0
                ? this._isStep1Valid() && !!oModel.getProperty("/companyContextReady")
                : (aSteps[iIndex] ? aSteps[iIndex].getValidated() : false);

            this._setWizardPropertyIfChanged("/nav/backVisible", iIndex > 0);
            this._setWizardPropertyIfChanged("/nav/nextVisible", !bIsLast);
            this._setWizardPropertyIfChanged("/nav/nextEnabled", bCurrentValid);
            this._setWizardPropertyIfChanged("/nav/acceptVisible", bIsLast);
            this._iCurrentStepIndex = iIndex;
        },

        onWizardNavChange: function (oEvent) {
            const oWizard = this.byId("configWizard");
            if (!oWizard) {
                return;
            }
            const oStep = oEvent.getParameter("step");
            const iIndex = oWizard.getSteps().indexOf(oStep);
            this._updateNavState(Math.max(0, iIndex));
        },

        onWizardNext: function () {
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

        onWizardBack: function () {
            const oWizard = this.byId("configWizard");
            if (!oWizard || this._iCurrentStepIndex <= 0) {
                return;
            }
            const iPrev = this._iCurrentStepIndex - 1;
            oWizard.goToStep(oWizard.getSteps()[iPrev], true);
            this._updateNavState(iPrev);
        },

        onEmpresaSelectionChange: function () {
            const oTable = this.byId("empresaTable");
            const oModel = this._getWizardModel();
            const oSelectedItem = oTable?.getItems().find((oItem) => oItem.getSelected());
            const oSelectedContext = oSelectedItem?.    getBindingContext("wizard");
            const sCompanyCode = oSelectedContext?.getProperty("CompanyCode") || "";
            const bValid = !!oSelectedItem;

            this._setWizardStepValidation("wizardStep1", bValid);
            this._updateReviewEmpresa();

            if (!bValid || !oModel) {
                this._clearWizardDependentState();
                this._updateNavState(this._iCurrentStepIndex);
                return;
            }

            this._clearWizardDependentState();
            this._updateNavState(this._iCurrentStepIndex);

            this._loadBanksForSelectedCompany({
                CompanyCode: sCompanyCode,
                modelName: "wizard",
                dialog: this._wizardDialog,
                onSuccess: (oWizardModel, oTransformed) => {
                    this._setWizardBanksData(oWizardModel, oTransformed);
                    this._updateNavState(this._iCurrentStepIndex);
                },
                errorMessage: "No se pudo cargar las cuentas bancarias del servicio."
            }).catch((oError) => {
                console.error("Error loading banks from OData:", oError);
                this._updateNavState(this._iCurrentStepIndex);
            });
        },

        onCuentasSelectionChange: function () {
            const aSelectedAccounts = this._getSelectedStep2Accounts();
            const bValid = aSelectedAccounts.length > 0;
            this._setWizardStepValidation("wizardStep2", bValid);
            this._buildHorariosEspecificos(aSelectedAccounts);
            this._buildSaldosPersonalizados(aSelectedAccounts);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentas();
        },

        onCuentaCentralSelectionChange: function () {
            const bValid = this.byId("cuentaCentralTable").getItems().some((i) => i.getSelected());
            this._setWizardStepValidation("wizardStep3", bValid);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentaCentral();
        },

        onHorarioSelectionChange: function () {
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

        onHorarioUnicoChange: function () {
            this._updateReviewHorario();
        },

        _buildHorariosEspecificos: function (aSelectedAccountsParam) {
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
                        nombre: oAccountData.Description,
                        cuentaCorriente: oAccountData.cuentaCorriente,
                        selectedHorario: "",
                        horariosUnicos: aHorariosDisponibles
                    });
                }
            });

            oModel.setProperty("/horariosPersonalizadosPorBanco", aHorariosPorBanco);
            oModel.setProperty("/horariosPersonalizadosPorCuenta", aHorariosPorCuenta);
        },

        onHorarioEspecificoChange: function (oEvent) {
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

        onDiaSelectionChange: function () {
            this._updateReviewDias();
            this._validateStep4();
        },

        onSaldoSelectionChange: function (oEvent) {
            const oModel = this._getWizardModel();
            const oSaldoGroup = oEvent ? oEvent.getSource() : this.byId("saldoGroup");
            if (oModel && oSaldoGroup) {
                this._setWizardPropertyIfChanged("/selectedSaldoType", oSaldoGroup.getSelectedIndex());
            }

            this._buildSaldosPersonalizados();
            this._updateReviewSaldo();
            this._validateStep5();
        },

        _validateStep4: function () {
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

        _validateStep5: function () {
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

        _buildSaldosPersonalizados: function (aSelectedAccountsParam) {
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
                const sCuentaNombre = oAccountData.Description;
                const nSaldoInfoCent = Number(oAccountData.saldoInfoCent) || 0;
                const sCurrency = oAccountData.Currency || "";

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

        onSaldoPersonalizadoChange: function (oEvent) {
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

        _parseLocalizedNumber: function (sValue) {
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

        onSaldoConsiderChange: function () {
            this._updateReviewSaldo();
        },

        onEditStep: function (oEvent) {
            const sStep = oEvent.getSource().data("step");
            const iIndex = parseInt(sStep, 10) - 1;
            const oWizard = this.byId("configWizard");
            if (oWizard) {
                oWizard.goToStep(this.byId("wizardStep" + sStep), true);
                this._updateNavState(iIndex);
            }
        },

        onCloseDialog: function () {
            if (this._configDialog) {
                this._configDialog.close();
            }
        },

        onDialogClose: function () {
            // Handle dialog close event
        },

        onCreateSingleTransfer: function () {
            const oTransferModel = new JSONModel(sap.ui.require.toUrl("cashpool/app/cashpool/model/wizardTransferData.json"));
            oTransferModel.attachRequestCompleted(() => {
                const aEmpresas = this._getWizardEmpresasData(oTransferModel.getProperty("/empresas"));

                oTransferModel.setProperty("/empresas", aEmpresas);
                oTransferModel.setProperty("/_empresasAll", aEmpresas.slice());
                this._clearWizardBanksData(oTransferModel);

                this.getView().setModel(oTransferModel, "wizardTransfer");
                this._openTransferWizardDialogFragment();
            });
            oTransferModel.attachRequestFailed(() => {
                MessageToast.show("No se pudo cargar la configuración del wizard de transferencia.");
            });
        },

        _transformBanksODataToBancos: function (oODataResponse) {
            const aBancos = [];
            const aCuentasCentralizadoras = [];
            const aBanksData = oODataResponse.value || [];

            // Group accounts by normalized bank name to create hierarchical structure
            const oBankMap = new Map();

            aBanksData.forEach((oBank) => {
                const sBankName = oBank.BankName || "";
                const sBankKey = sBankName.toLowerCase();
                const sHouseBank = oBank.HouseBank || "";
                const aAccountBalance = Array.isArray(oBank.AccountBalance) ? oBank.AccountBalance : [];

                // Transform account data
                const aCuentas = aAccountBalance.map((oAccount) => ({
                    ...oAccount,
                    cuentaCorriente: oAccount.Iban || oAccount.BankAccountNumber || "",
                    saldoInfoCent: Number(oAccount.StatementAmount) || 0,
                    saldoSAP: Number(oAccount.StatementAmount) || 0,
                }));

                // Create or update bank entry
                if (!oBankMap.has(sBankKey)) {
                    oBankMap.set(sBankKey, {
                        ...oBank,
                        expanded: false,
                        cuentas: []
                    });
                }

                const oBankEntry = oBankMap.get(sBankKey);
                oBankEntry.cuentas.push(...aCuentas);

                // Extract centralized accounts (HouseBank starts with "SANT")
                if (sHouseBank.startsWith("SANT")) {
                    aCuentas.forEach((oCuenta) => {
                        aCuentasCentralizadoras.push(oCuenta);
                    });
                }
            });

            // Convert Map to Array
            oBankMap.forEach((oBankData) => {
                aBancos.push(oBankData);
            });

            return {
                bancos: aBancos,
                cuentasCentralizadoras: aCuentasCentralizadoras
            };
        },

        _openTransferWizardDialogFragment: function () {
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

        _getTransferWizardModel: function () {
            return this.getView().getModel("wizardTransfer");
        },

        // ─── Transfer wizard navigation ───────────────────────────────

        onTransferWizardDialogAfterOpen: function () {
            this._iTransferCurrentStepIndex = 0;
            this._updateTransferNavState(0);
        },

        onTransferWizardDialogAfterClose: function () {
            this._resetTransferWizard();
        },

        _resetTransferWizard: function () {
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

        _updateTransferNavState: function (iIndex) {
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
                bNextEnabled = !!oTable && oTable.getSelectedItems().length > 0 && !!oModel.getProperty("/companyContextReady");
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

        _isTransferOrigenSelected: function () {
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

        onTransferWizardNavChange: function (oEvent) {
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

        onTransferWizardNext: function () {
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

        onTransferWizardBack: function () {
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

        onTransferWizardCancel: function () {
            if (this._transferWizardDialog) {
                this._transferWizardDialog.close();
            }
        },

        // ─── Transfer wizard step handlers ────────────────────────────

        onEmpresaSearchTransfer: function (oEvent) {
            const sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
            const oModelEmp = this.getView().getModel("empresas")
            const oModelWiz = this._getTransferWizardModel();
            if (!oModelEmp || !oModelWiz) {
                return;
            }
            const aAll = oModelWiz.getProperty("/_empresasAll") || [];
            if (!sQuery) {
                oModelEmp.setProperty("/", aAll);
                return;
            }
            const aFiltered = aAll.filter((o) =>
                o.razonSocial?.toLowerCase().includes(sQuery) ||
                o.cif?.toLowerCase().includes(sQuery)
            );
            oModelEmp.setProperty("/", aFiltered);
        },

        onEmpresaSelectionChangeTransfer: function () {
            const oTable = this.byId("empresaTableTransfer");
            const oModel = this._getTransferWizardModel();
            const oSelectedItem = oTable?.getSelectedItems()[0];
            const oSelectedContext = oSelectedItem?.getBindingContext("empresas");
            const sCompanyCode = oSelectedContext?.getProperty("CompanyCode") || "";
            const sVatNo = oSelectedContext.getProperty('VatNumber')
            const sCompanyName = oSelectedContext.getProperty('CompanyName')

            if (!oSelectedItem || !oModel) {
                this._clearTransferWizardDependentState();
                this._updateTransferNavState(0);
                return;
            }

            this._clearTransferWizardDependentState();
            this._updateTransferNavState(0);

            this._loadBanksForSelectedCompany({
                CompanyCode: sCompanyCode,
                modelName: "wizardTransfer",
                dialog: this._transferWizardDialog,
                onSuccess: (oTransferModel, oTransformed) => {
                    this._setWizardBanksData(oTransferModel, oTransformed);
                    this._updateTransferNavState(0);
                    this.getView().getModel("wizardTransfer").setProperty('/review/cif', sVatNo);
                    this.getView().getModel("wizardTransfer").setProperty('/review/razonSocial', sCompanyName);

                },
                errorMessage: "No se pudo cargar las cuentas bancarias del servicio."
            }).catch((oError) => {
                console.error("Error loading banks from OData:", oError);
                this._updateTransferNavState(0);
            });
        },

        onCuentasSearchTransfer: function (oEvent) {
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
                const bBankMatch = oBanco.BankName.toLowerCase().includes(sQuery);
                if (!bBankMatch) {
                    oBanco.cuentas = oBanco.cuentas.filter((c) =>
                        c.HouseBank.toLowerCase().includes(sQuery) ||
                        c.cuentaCorriente.toLowerCase().includes(sQuery)
                    );
                }
                return oBanco;
            }).filter((oBanco) => oBanco.cuentas.length > 0);
            oModel.setProperty("/bancos", aFiltered);
        },

        onCuentaOrigenSelectionChange: function (oEvent) {
            this.byId("bancosListTransferStep2").getAggregation("items").map(e => { e.getContent()[0].getContent()[0].getSelectedItem()?.setSelected(false) })
            oEvent.getParameter("listItem").setSelected(true);
            this._updateTransferNavState(1);
        },

        onCuentaDestinoSearchTransfer: function (oEvent) {
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
                o.Description.toLowerCase().includes(sQuery) ||
                o.HouseBank.toLowerCase().includes(sQuery) ||
                o.cuentaCorriente.toLowerCase().includes(sQuery)
            );
            oModel.setProperty("/cuentasCentralizadoras", aFiltered);
        },

        onCuentaDestinoSelectionChange: function () {
            this._updateTransferNavState(2);
        },

        onTransferAmountChange: function (oEvent) {
            this._getTransferWizardModel().setProperty('/transferAmount', oEvent.getParameter('newValue'))
            this._updateTransferNavState(3);
        },

        // ─── Transfer wizard review ──────────────────────────────────

        onTransferReviewStepActivate: function () {
            this._updateTransferReview();
        },

        _updateTransferReview: function () {
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
                } else {
                    oModel.setProperty("/review/razonSocial", "");
                    oModel.setProperty("/review/cif", "");
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
                                    oModel.setProperty("/review/cuentaOrigenBanco", oModel.getProperty(sBanco + "/BankName"));
                                    oModel.setProperty("/review/cuentaOrigenCuenta", `${oSelCtx.getObject().Description}\nCuenta: ${oSelCtx.getObject().cuentaCorriente}`);
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
                        oModel.setProperty("/review/cuentaDestinoBanco", "Banco Santander S.A.");
                        oModel.setProperty("/review/cuentaDestinoCuenta", `${oCtxDest.getObject().Description}\nCuenta: ${oCtxDest.getObject().cuentaCorriente}`);
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

        onEditStepTransfer: function (oEvent) {
            const sStep = oEvent.getSource().data("step");
            const iIndex = parseInt(sStep, 10) - 1;
            const oWizard = this.byId("transferConfigWizard");
            if (oWizard) {
                oWizard.goToStep(this.byId("wizardTransferStep" + sStep), true);
                this._iTransferCurrentStepIndex = iIndex;
                this._updateTransferNavState(iIndex);
            }
        },

        onTransferWizardAccept: function () {
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

        onAnotherButtonPress: function (oTransferObject) {
            const oTreasureModel = this.getView().getModel("Cashpool");
            const oBancoDestinoDetails = this._getTransferWizardModel().getData()._bancosAll.find(e => e.BankName == this._getTransferWizardModel().getData().review.cuentaDestinoBanco);
            const oBancoOrigenDetails = this._getTransferWizardModel().getData()._bancosAll.find(e => e.BankName == this._getTransferWizardModel().getData().review.cuentaOrigenBanco);
            const oCuentaOrigenDetails = oBancoOrigenDetails.cuentas.find(e => e.cuentaCorriente == this._getTransferWizardModel().getData().review.cuentaOrigenCuenta.split("\n")[1].slice(-24));
            const oCuentaDestinoDetails = this._getTransferWizardModel().getData()._cuentasCentralAll.find(e => e.cuentaCorriente == this._getTransferWizardModel().getData().review.cuentaDestinoCuenta.split("\n")[1].slice(-24));
            const sImporteFixed2=Number.parseFloat(-this._getTransferWizardModel().getData().preparedTransfer.importe).toFixed(2);
            const sImporteFixed8=Number.parseFloat(-this._getTransferWizardModel().getData().preparedTransfer.importe).toFixed(8);
            const oContext = oTreasureModel.bindContext('/postBankTransfer(...)');
            let oToPostBank = {
                "parameters": {
                    "accounts":{
                        "acctType": "S",
                        "partnerAccount": `${oCuentaDestinoDetails.PartnerAccount.slice(2)}`,
                        "reconcilAccount": "",
                        "partnerAcctTransfer": ""
                    },
                    "amounts": {
                        "paymCurr": `${oCuentaOrigenDetails.Currency}`,
                        "paymAmount": sImporteFixed2,
                        "paymAmountLong": sImporteFixed8
                    },
                    "bankData": [
                        {
                            "accountRole": "2",
                            "bankCtry": `${oBancoDestinoDetails.BankCountry}`,
                            "bankKey": `${oCuentaDestinoDetails.Iban.substring(4,12)}`,
                            "bankNo": `${oCuentaDestinoDetails.Iban.substring(4,12)}`,
                            "swiftCode": `${oBancoDestinoDetails.Swift}`,
                            "bankAcct": `${oCuentaDestinoDetails.BankAccountNumber}`,
                            "ctrlKey": `${oCuentaDestinoDetails.cuentaCorriente.substring(12, 14)}`,
                            "iban": `${oCuentaDestinoDetails.Iban}`
                        }
                    ],
                    "paymControl": {
                        "housebankId": `${oCuentaOrigenDetails.HouseBank}`,
                        "housebankAcctId": `${oCuentaOrigenDetails.AccountId}`,
                        "paymentMethods": "T",
                        "paycode": `${oCuentaOrigenDetails.HouseBank}/${oCuentaDestinoDetails.HouseBank}/T`
                    },
                    "type": "MANUAL"
                }
            };
            oToPostBank = oToPostBank.parameters
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
                    //this._loadTransferHistoryData();
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