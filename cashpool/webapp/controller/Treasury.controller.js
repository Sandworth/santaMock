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
        /**
         * Initialize the Treasury controller
         * 
         * Loads all required models (i18n, view, companies, balance data) and configures
         * the chart visualization for displaying balance information.
         * 
         * @public
         * @function
         */
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
                    // Independent instance for empresas: wizard searches filter this model
                    // without mutating the "saldos" list shown in the main view.
                    const oEmpresasModel = new JSONModel(aDataEUR.slice());
                    this.getView().setModel(oEmpresasModel, "empresas");
                    // Source of truth for empresa search (both wizards share the "empresas" model).
                    this._aEmpresasAll = aDataEUR.slice();
                }).catch(() => {
                    MessageToast.show(this._oResourceBundle.getText("errorLoadingSaldos"));
                    this.getView().setModel(new JSONModel([]), "saldos");
                    this.getView().setModel(new JSONModel([]), "empresas");
                    this._aEmpresasAll = [];
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

        /**
         * Handle tab selection in the icon tab bar
         * 
         * Lazy-loads transfer history when MANUAL or AUTO tabs are selected.
         * Updates the view model's selected tab property.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - The select event from IconTabBar
         */
        onTabSelect: function (oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedKey");
            this._getViewModel().setProperty("/selectedTab", sSelectedKey);

            // Lazy load transfer history when selecting transfer tabs
            if (sSelectedKey === "MANUAL" || sSelectedKey === "AUTO") {
                this._loadTransferHistoryData(sSelectedKey);
            }
        },

        /**
         * Apply i18n localization to view model properties
         * 
         * Translates all properties with *Key suffix to localized text using the resource bundle.
         * 
         * @private
         * @function
         * @param {sap.ui.model.json.JSONModel} oViewModel - The view model to localize
         */
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

        /**
         * Handle download receipt button click
         * 
         * Prepares a message with transfer details for downloading receipts.
         * Currently shows a toast - implement actual download logic as needed.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - The button press event
         */
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

        /**
         * Load transfer history data from backend
         * 
         * Fetches transfer history for the specified type (MANUAL or AUTO) and groups
         * the results by company. Shows a busy indicator during loading.
         * 
         * @private
         * @function
         * @param {string} sType - Transfer type: "MANUAL" or "AUTO"
         * @returns {void}
         */
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

        /**
         * Fetch transfer history from OData backend
         * 
         * Retrieves transfer records from the OData service filtered by transfer type.
         * Transforms each record using _mapTransferHistoryItem.
         * 
         * @private
         * @function
         * @param {string} sType - Transfer type: "MANUAL" or "AUTO"
         * @returns {Promise<Array>} Promise resolving to array of mapped transfer objects
         */
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

        /**
         * Map OData transfer record to UI transfer model
         * 
         * Transforms raw OData transfer object to the structure expected by the view.
         * Extracts and formats origin/destination account information, balances, and status.
         * 
         * @private
         * @function
         * @param {Object} oItem - Raw OData transfer object
         * @param {string} sType - Transfer type for the mapped object
         * @returns {Object} Mapped transfer object with structure:
         *   {
         *     razonSocial: string,
         *     cif: string,
         *     fecha: string,
         *     origen: {banco, oficina, cuenta},
         *     destino: {banco, oficina, cuenta},
         *     saldoAntes: {monto, moneda},
         *     saldoProgramado: {monto, moneda},
         *     valorTransferencia: {monto, moneda},
         *     paymentDoc: string,
         *     requestId: string,
         *     status: {code, text, state},
         *     tipo: string
         *   }
         */
        _mapTransferHistoryItem: function (oItem, sType) {
            const sTransferCurrency = oItem.amounts_paymCurr || oItem.payerAccount?.Currency || "EUR";
            const sBalanceCurrency = oItem.payerAccount?.Currency || sTransferCurrency;

            return {
                razonSocial: oItem.payerAccount?.CompanyName|| "-",
                cif: oItem.payerAccount?.CompanyCode || "-",
                fecha: oItem.createdAt,
                origen: {
                    banco: oItem.payerBankName || "-",
                    oficina: oItem.payerBranch || "-",
                    //oficina: oItem.payerAccount?.Iban.substring(8,12) + " | " + oItem.payerBranch || "-",
                    cuenta: oItem.payerAccount?.Iban || "-"
                },
                destino: {
                    banco: oItem.payeeBankName || "-",
                    //oficina: oItem.payeeBranch || "-",
                    oficina: oItem.payeeAccount?.Iban.substring(8,12) + " | " + oItem.payeeBranch || "-",
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
                tipo: sType,
                parameters: {
                    amount: oItem.amounts_paymAmount,
                    companyCode: oItem.payerAccount?.CompanyCode,
                    houseBank: oItem.payerAccount?.HouseBank,
                    runDate: oItem.createdAt.slice(0,-14),
                    referenceDocumentNumber: oItem.paymentDoc

                }
            };
        },

        /**
         * Safely convert value to number
         * 
         * Returns 0 if the value is not a finite number.
         * 
         * @private
         * @function
         * @param {*} vAmount - Value to convert
         * @returns {number} Converted number or 0
         */
        _toNumber: function (vAmount) {
            const nAmount = Number(vAmount);
            return Number.isFinite(nAmount) ? nAmount : 0;
        },

        /**
         * Map transfer status code to UI status object
         * 
         * Converts backend status codes (e.g., "APRV", "REJ") to UI-friendly objects
         * with localized text and state for styling (Success, Warning, Error, Information).
         * 
         * @private
         * @function
         * @param {string} sRawStatus - Raw status code from backend
         * @returns {Object} Status object with {code, text, state}
         */
        _mapTransferStatus: function (sRawStatus) {
            const sCode = String(sRawStatus || "").trim().toLowerCase();

            const oStatusMap = {
                bab: { textKey: "statusCodeBab", state: "Success" },
                ban: { textKey: "statusCodeBan", state: "Warning" },
                bap: { textKey: "statusCodeBap", state: "Warning" },
                bbk: { textKey: "statusCodeBbk", state: "Information" },
                bbp: { textKey: "statusCodeBbp", state: "Information" },
                bbs: { textKey: "statusCodeBbs", state: "Information" },
                bbst: { textKey: "statusCodeBbst", state: "Information" },
                bck: { textKey: "statusCodeBck", state: "Information" },
                bcr: { textKey: "statusCodeBcr", state: "Information" },
                bdw: { textKey: "statusCodeBdw", state: "Warning" },
                bfc: { textKey: "statusCodeBfc", state: "Information" },
                bfe: { textKey: "statusCodeBfe", state: "Error" },
                bhb: { textKey: "statusCodeBhb", state: "Information" },
                bnp: { textKey: "statusCodeBnp", state: "Error" },
                bot: { textKey: "statusCodeBot", state: "Information" },
                bpa: { textKey: "statusCodeBpa", state: "Warning" },
                bpe: { textKey: "statusCodeBpe", state: "Information" },
                bpp: { textKey: "statusCodeBpp", state: "Warning" },
                bra: { textKey: "statusCodeBra", state: "Error" },
                bre: { textKey: "statusCodeBre", state: "Error" },
                brj: { textKey: "statusCodeBrj", state: "Error" },
                brl: { textKey: "statusCodeBrl", state: "Success" },
                brt: { textKey: "statusCodeBrt", state: "Warning" },
                bse: { textKey: "statusCodeBse", state: "Error" },
                bsn: { textKey: "statusCodeBsn", state: "Information" },
                COMP: { textKey: "statusCodeCOMP", state: "Success" },
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

        /**
         * Get available status filter options
         * 
         * Returns array of status options for SELECT controls used in transfer filtering.
         * Each option includes the i18n key for localization.
         * 
         * @private
         * @function
         * @returns {Array} Array of status options with {key, text}
         */
        _getStatusOptions: function () {
            return [
                { key: "ALL", text: this._oResourceBundle.getText("allStatusesOption") },
                { key: "bab", text: this._oResourceBundle.getText("statusCodeBab") },
                { key: "ban", text: this._oResourceBundle.getText("statusCodeBan") },
                { key: "bap", text: this._oResourceBundle.getText("statusCodeBap") },
                { key: "bbk", text: this._oResourceBundle.getText("statusCodeBbk") },
                { key: "bbp", text: this._oResourceBundle.getText("statusCodeBbp") },
                { key: "bbs", text: this._oResourceBundle.getText("statusCodeBbs") },
                { key: "bbst", text: this._oResourceBundle.getText("statusCodeBbst") },
                { key: "bck", text: this._oResourceBundle.getText("statusCodeBck") },
                { key: "bcr", text: this._oResourceBundle.getText("statusCodeBcr") },
                { key: "bdw", text: this._oResourceBundle.getText("statusCodeBdw") },
                { key: "bfc", text: this._oResourceBundle.getText("statusCodeBfc") },
                { key: "bfe", text: this._oResourceBundle.getText("statusCodeBfe") },
                { key: "bhb", text: this._oResourceBundle.getText("statusCodeBhb") },
                { key: "bnp", text: this._oResourceBundle.getText("statusCodeBnp") },
                { key: "bot", text: this._oResourceBundle.getText("statusCodeBot") },
                { key: "bpa", text: this._oResourceBundle.getText("statusCodeBpa") },
                { key: "bpe", text: this._oResourceBundle.getText("statusCodeBpe") },
                { key: "bpp", text: this._oResourceBundle.getText("statusCodeBpp") },
                { key: "bra", text: this._oResourceBundle.getText("statusCodeBra") },
                { key: "bre", text: this._oResourceBundle.getText("statusCodeBre") },
                { key: "brj", text: this._oResourceBundle.getText("statusCodeBrj") },
                { key: "brl", text: this._oResourceBundle.getText("statusCodeBrl") },
                { key: "brt", text: this._oResourceBundle.getText("statusCodeBrt") },
                { key: "bse", text: this._oResourceBundle.getText("statusCodeBse") },
                { key: "bsn", text: this._oResourceBundle.getText("statusCodeBsn") },
                { key: "COMP", text: this._oResourceBundle.getText("statusCodeCOMP") },
                { key: "-", text: this._oResourceBundle.getText("statusCodeUnknown") }
            ];
        },

        /**
         * Build transfer groups organized by company
         * 
         * Groups transfer records by company (razonSocial + CIF), sorts each group
         * by date descending, and sets both all and filtered arrays in the model.
         * For AUTO type, marks the first group as active.
         * 
         * @private
         * @function
         * @param {string} sType - Transfer type: "MANUAL" or "AUTO"
         * @param {Array} aTransferencias - Array of mapped transfer objects
         * @returns {void}
         */
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

        /**
         * Get model paths for transfer groups
         * 
         * Returns the model property paths for storing both unfiltered and
         * filtered transfer group arrays for a given transfer type.
         * 
         * @private
         * @function
         * @param {string} sType - Transfer type: "MANUAL" or "AUTO"
         * @returns {Object} Object with {allPath, visiblePath} properties
         */
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

        /**
         * Search transfer groups by company name or CIF
         * 
         * Filters transfer groups based on search query matching company name or CIF.
         * Updates the visible transfer groups while preserving the unfiltered copy.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event with query or newValue parameter
         * @returns {void}
         */
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

        /**
         * Normalize search value for case-insensitive matching
         * 
         * Converts string to lowercase and trims whitespace.
         * 
         * @private
         * @function
         * @param {string} sValue - String to normalize
         * @returns {string} Normalized string (lowercase, trimmed)
         */
        _normalizeNifSearch: function (sValue) {
            return (sValue || "").toLowerCase().trim();
        },

        /**
         * Handle transfer group activation switch change
         * 
         * Shows a confirmation dialog when toggling automatic transfer group active state.
         * Reverts the switch if user cancels the confirmation.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Switch change event
         * @returns {void}
         */
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

        /**
         * Apply date range and status filters to transfers
         * 
         * Filters transfers within a specific group based on date range and status.
         * Updates the visible transfers while preserving the complete unfiltered list.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Button press event
         * @returns {void}
         */
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

        /**
         * Clear all transfer filters and restore full list
         * 
         * Resets date range and status filters, restoring all transfers
         * for the specific transfer group.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Button press event
         * @returns {void}
         */
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

        /**
         * Consult existing transfer configuration
         * 
         * Opens the configuration wizard for reviewing/editing automatic transfer setups.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Traverse up DOM hierarchy to find parent Panel control
         * 
         * Used to find the containing panel for nested controls.
         * 
         * @private
         * @function
         * @param {sap.ui.core.Control} oControl - Starting control
         * @returns {sap.m.Panel|null} Parent Panel or null if not found
         */
        _getParentPanel: function (oControl) {
            let oParent = oControl;
            while (oParent && !oParent.isA("sap.m.Panel")) {
                oParent = oParent.getParent();
            }
            return oParent;
        },

        /**
         * Parse transfer date string in DD/MM/YYYY format
         * 
         * Converts date string to normalized Date object (midnight UTC).
         * Used for transfer history date filtering.
         * 
         * @private
         * @function
         * @param {string} sDate - Date string in DD/MM/YYYY format
         * @returns {Date|null} Normalized Date or null if invalid format
         */
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

        /**
         * Normalize date to midnight UTC for comparison
         * 
         * Sets time to 00:00:00.000 for consistent date-only comparisons
         * in filter operations.
         * 
         * @private
         * @function
         * @param {Date} oDate - Date to normalize
         * @returns {Date|null} Normalized date or null if input not a Date
         */
        _normalizeDate: function (oDate) {
            if (!(oDate instanceof Date)) {
                return null;
            }

            const oNormalizedDate = new Date(oDate.getTime());
            oNormalizedDate.setHours(0, 0, 0, 0);
            return oNormalizedDate;
        },

        /**
         * Map company data to wizard display format
         * 
         * Normalizes company objects for display in wizard tables,
         * handling both OData (CompanyName, VatNumber) and JSON model formats.
         * 
         * @private
         * @function
         * @param {Object} oEmpresa - Company object
         * @returns {Object} Mapped company with {razonSocial, cif, CompanyCode}
         */
        _mapEmpresaForWizard: function (oEmpresa) {
            return {
                razonSocial: oEmpresa?.razonSocial || oEmpresa?.CompanyName || "",
                cif: oEmpresa?.cif || oEmpresa?.VatNumber || "",
                CompanyCode: oEmpresa?.CompanyCode || ""
            };
        },

        /**
         * Get companies data for wizard initialization
         * 
         * Returns companies from saldos model if available, otherwise uses fallback data.
         * Maps companies to wizard display format.
         * 
         * @private
         * @function
         * @param {Array} aFallbackEmpresas - Fallback company array if saldos not loaded
         * @returns {Array} Array of companies in wizard format
         */
        _getWizardEmpresasData: function (aFallbackEmpresas) {
            const aSaldos = this.getView().getModel("empresas")?.getData();
            const aSource = Array.isArray(aSaldos) && aSaldos.length ? aSaldos : (aFallbackEmpresas || []);

            return aSource.map((oEmpresa) => this._mapEmpresaForWizard(oEmpresa));
        },

        /**
         * Set bank data on wizard model
         * 
         * Updates both unfiltered (_*All) and filtered copies of bank and
         * centralized account data in the wizard model.
         * 
         * @private
         * @function
         * @param {sap.ui.model.json.JSONModel} oModel - Target wizard model
         * @param {Object} oTransformed - Transformed bank data with {bancos, cuentasCentralizadoras}
         * @returns {void}
         */
        _setWizardBanksData: function (oModel, oTransformed) {
            oModel.setProperty("/_bancosAll", JSON.parse(JSON.stringify(oTransformed.bancos)));
            oModel.setProperty("/_cuentasCentralAll", oTransformed.cuentasCentralizadoras.slice());
            oModel.setProperty("/bancos", JSON.parse(JSON.stringify(oTransformed.bancos)));
            oModel.setProperty("/cuentasCentralizadoras", oTransformed.cuentasCentralizadoras.slice());
            oModel.setProperty("/companyContextReady", true);
        },

        /**
         * Clear bank-related data from wizard model
         * 
         * Clears all bank and centralized account data, indicating
         * that company context is not ready.
         * 
         * @private
         * @function
         * @param {sap.ui.model.json.JSONModel} oModel - Wizard model to clear
         * @returns {void}
         */
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

        /**
         * Clear all wizard dependent state
         * 
         * Clears banks, schedules, balance rules, and review data.
         * Used when company selection changes to reset dependent choices.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Clear all transfer wizard dependent state
         * 
         * Resets banks, amount, and review fields when company selection changes
         * in the transfer wizard.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _clearTransferWizardDependentState: function () {
            const oModel = this._getWizardModel("transfer");
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

        /**
         * Load banks and accounts for selected company from OData
         * 
         * Calls OData service to fetch bank and account data for the selected company.
         * Implements request deduplication to handle rapid company changes.
         * Uses callback pattern for flexible success/error handling.
         * 
         * @private
         * @function
         * @param {Object} oOptions - Configuration options
         * @param {string} oOptions.CompanyCode - Company identifier
         * @param {string} oOptions.modelName - Target model name (wizard or wizardTransfer)
         * @param {sap.m.Dialog} oOptions.dialog - Dialog to show busy indicator
         * @param {Function} oOptions.onSuccess - Callback(oModel, oTransformed) on success
         * @param {string} oOptions.errorMessage - Error message for failure toast
         * @returns {Promise<void>} Promise handling the async operation
         */
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

        /**
         * Open configuration information dialog
         * 
         * Lazy-loads configuration dialog fragment on first open,
         * then caches and reuses the instance.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Handle configure now button press
         * 
         * Closes configuration dialog if open and opens the configuration wizard.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onConfigureNow: function () {
            if (this._configDialog) {
                this._configDialog.close();
            }
            this._openWizardDialog();
        },

        /**
         * Initialize and open configuration wizard
         * 
         * Loads the wizard template, initializes companies and models,
         * then opens the wizard dialog fragment.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Load and display wizard dialog fragment
         * 
         * Always loads a fresh fragment instance (dialog is destroyed in afterClose).
         * 
         * @private
         * @function
         * @returns {void}
         */
        _openWizardDialogFragment: function () {
            // Dialogs are now destroyed in onAfterClose, so always load fresh.
            Fragment.load({
                id: this.getView().getId(),
                name: "cashpool.app.cashpool.view.fragments.WizardDialog",
                controller: this
            }).then((oDialog) => {
                this._wizardDialog = oDialog;
                this.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        // Centralized wizard configuration. Both wizards (automatic "config" and
        // one-time "transfer") share the same helper logic parametrized by type.
        _wizardConfigs: {
            config: {
                modelName: "wizard",
                wizardId: "configWizard",
                step1Id: "wizardStep1",
                empresaTableId: "empresaTable",
                cuentaCentralTableId: "cuentaCentralTable",
                instanceVar: "_wizardDialog"
            },
            transfer: {
                modelName: "wizardTransfer",
                wizardId: "transferConfigWizard",
                step1Id: "wizardTransferStep1",
                empresaTableId: "empresaTableTransfer",
                cuentaCentralTableId: "cuentaDestinoTable",
                instanceVar: "_transferWizardDialog"
            }
        },

        // Single, parametrized model accessor. Replaces the former
        // _getWizardModel() + _getTransferWizardModel() duplicate pair.
        _getWizardModel: function (sType) {
            const oConfig = this._wizardConfigs[sType] || this._wizardConfigs.config;
            return this.getView().getModel(oConfig.modelName);
        },

        /**
         * Get main view model
         * 
         * @private
         * @function
         * @returns {sap.ui.model.json.JSONModel} View model instance
         */
        _getViewModel: function () {
            return this.getView().getModel("view");
        },

        /**
         * Set model property only if value has changed
         * 
         * Avoids unnecessary model refresh triggers when value is already set.
         * 
         * @private
         * @function
         * @param {sap.ui.model.json.JSONModel} oModel - Target model
         * @param {string} sPath - Property path
         * @param {*} vValue - New value
         * @returns {void}
         */
        _setModelPropertyIfChanged: function (oModel, sPath, vValue) {
            if (!oModel) {
                return;
            }

            const vCurrent = oModel.getProperty(sPath);
            if (vCurrent !== vValue) {
                oModel.setProperty(sPath, vValue);
            }
        },

        /**
         * Set wizard model property with backward compatibility
         * 
         * Supports both 2-parameter (backward compat for config wizard)
         * and 3-parameter (explicit type) calls.
         * 
         * @private
         * @function
         * @param {string} sTypeOrPath - Wizard type or property path (if 2-param call)
         * @param {string|*} sPathOrValue - Property path or value (if 2-param call)
         * @param {*} vValue - Value (if 3-param call)
         * @returns {void}
         */
        _setWizardPropertyIfChanged: function (sType, sPath, vValue) {
            // Backward compatible: allow calling with (sPath, vValue) for the config wizard.
            if (arguments.length === 2) {
                vValue = sPath;
                sPath = sType;
                sType = "config";
            }
            this._setModelPropertyIfChanged(this._getWizardModel(sType), sPath, vValue);
        },

        /**
         * Mark wizard step as valid or invalid
         * 
         * Updates step validation state in the wizard control.
         * 
         * @private
         * @function
         * @param {string} sStepId - Step control ID (e.g., "wizardStep1")
         * @param {boolean} bValid - Validation state
         * @returns {void}
         */
        _setWizardStepValidation: function (sStepId, bValid) {
            const oWizard = this.byId("configWizard");
            const oStep = this.byId(sStepId);
            if (!oWizard || !oStep) {
                return;
            }
            bValid ? oWizard.validateStep(oStep) : oWizard.invalidateStep(oStep);
        },

        /**
         * Get all selected accounts from wizard step 2
         * 
         * Collects accounts selected across multiple bank panels.
         * Each account includes bank name and full account data.
         * 
         * @private
         * @function
         * @returns {Array} Array of {banco: string, data: Object} entries
         */
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

        /**
         * Validate that all items have valid localized number inputs
         * 
         * Checks that each item has a non-empty saldoPersonalizadoInput
         * that parses successfully to a number.
         * 
         * @private
         * @function
         * @param {Array} aItems - Array of balance items with saldoPersonalizadoInput
         * @returns {boolean} True if all items have valid numeric input
         */
        _hasValidLocalizedInputs: function (aItems) {
            return aItems.length > 0 && aItems.every((oItem) => {
                const sInput = (oItem.saldoPersonalizadoInput || "").trim();
                if (!sInput) {
                    return false;
                }
                return !Number.isNaN(this._parseLocalizedNumber(sInput));
            });
        },

        /**
         * Reset wizard to initial state
         * 
         * Reverts all wizard selections and data. Restores empresas model from
         * unfiltered source, clears step validations, and resets UI controls.
         * 
         * @private
         * @function
         * @param {string} sType - Wizard type: "config" or "transfer"
         * @returns {void}
         */
        _resetWizard: function (sType) {
            // Parametrized reset for both config and transfer wizards.
            // Reverts empresas model to unfiltered state and clears all wizard data.
            sType = sType || "config";

            // Revert empresas model to original unfiltered data (both wizards share this model).
            const oEmpresasModel = this.getView().getModel("empresas");
            if (oEmpresasModel && this._aEmpresasAll) {
                oEmpresasModel.setProperty("/", this._aEmpresasAll.slice());
            }

            // Get wizard-specific IDs and model from centralized config.
            const oCfg = this._wizardConfigs[sType] || this._wizardConfigs.config;
            const sWizardId = oCfg.wizardId;
            const sStep1Id = oCfg.step1Id;
            const sEmpresaTableId = oCfg.empresaTableId;
            const sCuentaCentralTableId = oCfg.cuentaCentralTableId;
            const oModel = this._getWizardModel(sType);

            // Revert wizard UI to initial step and invalidate all steps.
            const oWizard = this.byId(sWizardId);
            const oStep1 = this.byId(sStep1Id);
            if (oWizard && oStep1) {
                oWizard.discardProgress(oStep1, true);
                //oWizard.goToStep(oStep1, true);
                oWizard.getSteps().forEach((oStep) => {
                    oWizard.invalidateStep(oStep);
                });
            }

            // Clear wizard model data (bancos, review, transfer-specific fields, etc.).
            if (oModel) {
                this._clearWizardBanksData(oModel);
                oModel.setProperty("/transferAmount", "");
                oModel.setProperty("/review", {
                    razonSocial: "", cif: "",
                    cuentasSeleccionadas: "",
                    cuentaCentralNombre: "", cuentaCentralCuenta: "",
                    horario: "", dias: "", saldoAdicionalData: "",
                    cuentaOrigenBanco: "", cuentaOrigenCuenta: "",
                    cuentaDestinoBanco: "", cuentaDestinoCuenta: "",
                    importe: ""
                });
            }

            // Clear empresa and central account table selections.
            const oEmpresaTable = this.byId(sEmpresaTableId);
            if (oEmpresaTable) {
                oEmpresaTable.removeSelections(true);
            }

            const oCuentaCentralTable = this.byId(sCuentaCentralTableId);
            if (oCuentaCentralTable) {
                oCuentaCentralTable.removeSelections(true);
            }

            // Reset navigation and step counters.
            if (sType === "config") {
                this._iCurrentStepIndex = 0;
            } else {
                this._iTransferCurrentStepIndex = 0;
            }
        },

        /**
         * Handle wizard cancel button
         * 
         * Closes the configuration wizard without saving.
         * Cleanup happens in onWizardDialogAfterClose.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onWizardCancel: function () {
            if (this._wizardDialog) {
                this._wizardDialog.close();
            }
        },

        /**
         * Handle wizard accept button
         * 
         * Shows success message and closes the configuration wizard after save.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onWizardAccept: async function () {
            const oModel = this._getWizardModel("config");
            if (!oModel) {
                return;
            }
            const oReview = oModel.getProperty("/review");
            if (this._wizardDialog) {
                await this.onPostShedule();
                MessageToast.show(this._oResourceBundle.getText("msgSavedConfig", [oReview.razonSocial, oReview.cuentaCentralNombre, oReview.horario]));
                this._wizardDialog.close();
            }
        },

        /**
         * Submit scheduled transfer to backend OData service
         *
         * Builds the schedule transfer payload from the wizard selections and
         * submits it to the /scheduleTransfer operation. Shows a success or error
         * message toast depending on the outcome.
         *
         * @public
         * @function
         * @returns {void}
         */
        onPostShedule: async function () {
            const oTreasureModel = this.getView().getModel("JobScheduler");
            const oPayload = this._prepareSchedulePayload();
            const oContext = oTreasureModel.bindContext("/scheduleTransfer(...)");
            oContext.setParameter("parameters", oPayload).invoke().then(() => {
                const oActionContext = oContext.getBoundContext();
                const sError = oActionContext.getObject().error;
                if (sError) {
                    MessageToast.show("Error from backend: " + sError);
                    return;
                }
                MessageToast.show("Schedule transfer posted successfully!");
            }).catch((oError) => {
                MessageToast.show("Error posting schedule transfer: " + oError.error.message);
            });
        },

        /**
         * Build the complete schedule transfer payload
         *
         * Orchestrates construction of the payer accounts, payee account and
         * transfer configuration from the current wizard selections.
         *
         * @private
         * @function
         * @returns {Object} Payload object with a `parameters` property
         */
        _prepareSchedulePayload: function () {
            const oEmpresaTable = this.byId("empresaTable");
            const oSelectedEmpresa = oEmpresaTable ? oEmpresaTable.getItems().find((i) => i.getSelected()) : null;
            const sCompanyCode = oSelectedEmpresa
                ? oSelectedEmpresa.getBindingContext("empresas").getProperty("CompanyCode")
                : "";

            return {
                companyCode: sCompanyCode,
                payerAccount: this._buildSchedulePayerAccounts(),
                payeeAccount: this._buildSchedulePayeeAccount(),
                transferConfiguration: this._buildScheduleTransferConfig()
            };
        },

        /**
         * Build the payer accounts array for the schedule transfer payload
         *
         * Iterates over the accounts selected in step 2 and resolves each
         * account's amount and execution time from the wizard selections.
         * Amounts come from the per-bank or per-account custom balances, and
         * execution times come from the single/per-bank/per-account schedule.
         *
         * @private
         * @function
         * @returns {Array<Object>} Array of payer account entries
         */
        _buildSchedulePayerAccounts: function () {
            const oModel = this._getWizardModel("config");
            const oData = oModel.getData();
            const iSaldoType = oData.selectedSaldoType;
            const iHorarioType = oData.selectedHorario;
            const aSaldosPorBanco = oData.saldosPersonalizadosPorBanco || [];
            const aSaldosPorCuenta = oData.saldosPersonalizadosPorCuenta || [];
            const aHorariosPorBanco = oData.horariosPersonalizadosPorBanco || [];
            const aHorariosPorCuenta = oData.horariosPersonalizadosPorCuenta || [];
            const sHorarioUnico = oData.horarioUnico || "";
            const aSelectedAccounts = this._getSelectedStep2Accounts();

            return aSelectedAccounts.map((oEntry) => {
                const sBanco = oEntry.banco;
                const oAccount = oEntry.data;
                const sCuentaCorriente = oAccount.cuentaCorriente;

                // Resolve amount: per-bank balance applies to every account of the
                // bank, per-account balance is looked up by the account itself.
                let sAmountInput = "";
                if (iSaldoType === 0) {
                    const oBancoSaldo = aSaldosPorBanco.find((b) => b.nombre === sBanco);
                    sAmountInput = oBancoSaldo ? oBancoSaldo.saldoPersonalizadoInput : "";
                } else if (iSaldoType === 1) {
                    const oCuentaSaldo = aSaldosPorCuenta.find((c) => c.cuentaCorriente === sCuentaCorriente);
                    sAmountInput = oCuentaSaldo ? oCuentaSaldo.saldoPersonalizadoInput : "";
                }
                const nAmount = this._parseLocalizedNumber(sAmountInput) || 0;

                // Resolve execution time from the selected schedule option.
                let sHorario = "";
                if (iHorarioType === 0) {
                    sHorario = sHorarioUnico;
                } else if (iHorarioType === 1) {
                    const oBancoHorario = aHorariosPorBanco.find((b) => b.nombre === sBanco);
                    sHorario = oBancoHorario ? oBancoHorario.selectedHorario : "";
                } else if (iHorarioType === 2) {
                    const oCuentaHorario = aHorariosPorCuenta.find((c) => c.cuentaCorriente === sCuentaCorriente);
                    sHorario = oCuentaHorario ? oCuentaHorario.selectedHorario : "";
                }
                const sExecutionTime = sHorario ? `${sHorario}:00` : "";

                return {
                    houseBankId: oAccount.HouseBank,
                    houseBankAccId: oAccount.AccountId,
                    amounts: {
                        paymCurr: oAccount.Currency,
                        paymAmount: nAmount.toFixed(2),
                        paymAmountLong: nAmount.toFixed(8),
                        executionTime: sExecutionTime
                    }
                };
            });
        },

        /**
         * Build the payee (destination) account for the schedule transfer payload
         *
         * Reads the centralized account selected in step 3 and extracts the
         * house bank identifiers and partner account, mirroring the single
         * transfer destination logic.
         *
         * @private
         * @function
         * @returns {Object} Payee account object
         */
        _buildSchedulePayeeAccount: function () {
            const oCuentaTable = this.byId("cuentaCentralTable");
            const oSelected = oCuentaTable ? oCuentaTable.getItems().find((i) => i.getSelected()) : null;
            if (!oSelected) {
                return {};
            }
            const oAccount = oSelected.getBindingContext("wizard").getObject();
            return {
                houseBankId: oAccount.HouseBank,
                houseBankAccId: oAccount.AccountId,
                partnerAccount: oAccount.PartnerAccount ? oAccount.PartnerAccount.slice(2) : ""
            };
        },

        /**
         * Build the transfer configuration for the schedule transfer payload
         *
         * Maps the selected days to their 1-7 (Monday-Sunday) representation,
         * derives the balance type from the selected saldo option, and sets the
         * scheduling window from today to one year ahead.
         *
         * @private
         * @function
         * @returns {Object} Transfer configuration object
         */
        _buildScheduleTransferConfig: function () {
            const oModel = this._getWizardModel("config");
            const oData = oModel.getData();
            const oDias = oData.dias || {};
            const oDayMap = {
                monday: 1,
                tuesday: 2,
                wednesday: 3,
                thursday: 4,
                friday: 5,
                saturday: 6,
                sunday: 7
            };
            const aDaysOfWeek = Object.keys(oDayMap)
                .filter((sDay) => oDias[sDay])
                .map((sDay) => oDayMap[sDay])
                .sort((a, b) => a - b);

            const fnFormatDate = (oDate) => {
                const sYear = oDate.getFullYear();
                const sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
                const sDay = String(oDate.getDate()).padStart(2, "0");
                return `${sYear}-${sMonth}-${sDay}`;
            };
            const oStartDate = new Date();
            const oEndDate = new Date();
            oEndDate.setFullYear(oEndDate.getFullYear() + 1);

            return {
                transferTimeType: 1,
                daysOfWeek: aDaysOfWeek,
                balanceType: oData.selectedSaldoType + 1,
                startDate: fnFormatDate(oStartDate),
                endDate: fnFormatDate(oEndDate)
            };
        },

        /**
         * Handle wizard dialog close event
         * 
         * Cleans up wizard state and destroys the dialog to guarantee
         * fresh state on next opening.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onWizardDialogAfterClose: function () {
            this._resetWizard("config");
            // Destroy the dialog to guarantee clean state on next opening.
            // Fragment will be reloaded fresh.
            if (this._wizardDialog) {
                this.getView().removeDependent(this._wizardDialog);
                this._wizardDialog.destroyContent();
                this._wizardDialog.destroy(true);
                this._wizardDialog = null;
            }
        },

        /**
         * Handle review step activation
         * 
         * Updates all review fields when the review step becomes active.
         * Pulls latest values from wizard selections.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onReviewStepActivate: function () {
            this._updateReviewEmpresa();
            this._updateReviewCuentas();
            this._updateReviewCuentaCentral();
            this._updateReviewHorario();
            this._updateReviewDias();
            this._updateReviewSaldo();
        },

        /**
         * Update review with selected company
         * 
         * Displays company name and tax ID in the review section.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _updateReviewEmpresa: function () {
            const oModel = this._getWizardModel();
            const oEmpresaTable = this.byId("empresaTable");
            const oSelected = oEmpresaTable ? oEmpresaTable.getItems().find((i) => i.getSelected()) : null;
            if (oSelected) {
                const oCtx = oSelected.getBindingContext("empresas");
                oModel.setProperty("/review/razonSocial", oCtx.getProperty("CompanyName"));
                oModel.setProperty("/review/cif", oCtx.getProperty("VatNumber"));
            } else {
                oModel.setProperty("/review/razonSocial", "");
                oModel.setProperty("/review/cif", "");
            }
        },

        /**
         * Update review with selected bank accounts
         * 
         * Lists all selected accounts in comma-separated format.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _updateReviewCuentas: function () {
            const oModel = this._getWizardModel();
            const aCuentasSeleccionadas = this._getSelectedStep2Accounts().map((oEntry) => oEntry.data);
            oModel.setProperty("/review/cuentasSeleccionadas", aCuentasSeleccionadas.map((c) => c.Description).join(", ") || "-");
        },

        /**
         * Update review with selected centralized account
         * 
         * Displays destination/pooling account details including bank name and account info.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _updateReviewCuentaCentral: function () {
            const oModel = this._getWizardModel();
            const oCuentaTable = this.byId("cuentaCentralTable");
            const oSelected = oCuentaTable ? oCuentaTable.getItems().find((i) => i.getSelected()) : null;
            if (oSelected) {
                const oCtx = oSelected.getBindingContext("wizard");
                oModel.setProperty("/review/cuentaCentralNombre", "Santander");
                oModel.setProperty("/review/cuentaCentralCuenta", `${oCtx.getObject().Description}\nOficina: ${oCtx.getObject().oficina}\nIBAN: ${oCtx.getObject().cuentaCorriente}`);
            } else {
                oModel.setProperty("/review/cuentaCentralNombre", "");
                oModel.setProperty("/review/cuentaCentralCuenta", "");
            }
        },

        /**
         * Update review with selected schedule configuration
         * 
         * Formats schedule information based on selected type:
         * single, by-bank, or by-account with associated times.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Update review with selected days of week
         * 
         * Displays comma-separated list of selected transfer days.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _updateReviewDias: function () {
            const oModel = this._getWizardModel();
            const oDias = oModel.getProperty("/dias") || {};
            const aDiasSeleccionados = Object.entries(oDias)
                .filter(([, bSelected]) => bSelected)
                .map(([sDay]) => sDay.charAt(0).toUpperCase() + sDay.slice(1));
            oModel.setProperty("/review/dias", aDiasSeleccionados.join(", ") || "-");
        },

        /**
         * Update review with custom balance configuration
         * 
         * Formats balance information based on selected type:
         * by-bank, by-account, or no customization.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Format amount for display in review section
         * 
         * Formats currency with symbol if available, otherwise uses localized number format.
         * 
         * @private
         * @function
         * @param {number} vAmount - Amount to format
         * @param {string} sCurrency - Currency code (optional)
         * @returns {string} Formatted amount string
         */
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

        /**
         * Get localized float number formatter
         * 
         * Returns cached formatter instance configured for current locale.
         * Lazy-loads on first access.
         * 
         * @private
         * @function
         * @returns {sap.ui.core.format.NumberFormat} Singleton formatter instance
         */
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

        /**
         * Format number to localized string
         * 
         * Applies locale-specific formatting (decimal separator, grouping).
         * 
         * @private
         * @function
         * @param {number} nValue - Number to format
         * @returns {string} Formatted number string
         */
        _formatLocalizedNumber: function (nValue) {
            return this._getLocalizedFloatFormatter().format(nValue);
        },

        /**
         * Search companies by name or VAT number
         * 
         * Filters the shared empresas model used by both config and transfer wizards.
         * Searches against CompanyName and VatNumber fields.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event with query or newValue
         * @returns {void}
         */
        onEmpresaSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase().trim();
            const oEmpresasModel = this.getView().getModel("empresas");
            if (!oEmpresasModel) {
                return;
            }
            const aAll = this._aEmpresasAll || [];
            const aFiltered = sQuery
                ? aAll.filter((o) =>
                    o.CompanyName?.toLowerCase().includes(sQuery) ||
                    o.VatNumber?.toLowerCase().includes(sQuery))
                : aAll.slice();
            oEmpresasModel.setProperty("/", aFiltered);
        },

        /**
         * Search and filter banks by description or account number
         * 
         * Filters bank list for specified wizard type, auto-expanding matching banks.
         * Used by both config and transfer wizards.
         * 
         * @private
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event
         * @param {string} sType - Wizard type: "config" or "transfer"
         * @returns {void}
         */
        _onBancosSearch: function (oEvent, sType) {
            const oModel = this._getWizardModel(sType);
            if (!oModel) {
                return;
            }
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase().trim();
            const aAll = oModel.getProperty("/_bancosAll") || [];

            if (!sQuery) {
                const aReset = JSON.parse(JSON.stringify(aAll)).map((b) => Object.assign(b, { expanded: false }));
                oModel.setProperty("/bancos", aReset);
                return;
            }

            const aFiltered = JSON.parse(JSON.stringify(aAll))
                .map((oBanco) => {
                    const bBancoMatch = oBanco.BankName.toLowerCase().includes(sQuery);
                    if (!bBancoMatch) {
                        oBanco.cuentas = oBanco.cuentas.filter((c) =>
                            (c.Description || "").toLowerCase().includes(sQuery) ||
                            (c.cuentaCorriente || "").toLowerCase().includes(sQuery));
                    }
                    if (oBanco.cuentas.length === 0) {
                        return null;
                    }
                    oBanco.expanded = true;
                    return oBanco;
                })
                .filter(Boolean);
            oModel.setProperty("/bancos", aFiltered);
        },

        /**
         * Search banks in config wizard
         * 
         * Wrapper delegating to _onBancosSearch for config wizard type.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event
         * @returns {void}
         */
        onCuentasSearch: function (oEvent) {
            this._onBancosSearch(oEvent, "config");
        },

        /**
         * Search centralized/destination accounts
         * 
         * Filters centralized account list for specified wizard type.
         * Searches by description, bank code, or account number.
         * 
         * @private
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event
         * @param {string} sType - Wizard type: "config" or "transfer"
         * @returns {void}
         */
        _onCuentaCentralSearch: function (oEvent, sType) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").toLowerCase().trim();
            const oModel = this._getWizardModel(sType);
            if (!oModel) {
                return;
            }
            const aAll = oModel.getProperty("/_cuentasCentralAll") || [];
            const aFiltered = sQuery
                ? aAll.filter((o) =>
                    o.Description.toLowerCase().includes(sQuery) ||
                    o.HouseBank.toLowerCase().includes(sQuery) ||
                    o.cuentaCorriente.toLowerCase().includes(sQuery))
                : aAll.slice();
            oModel.setProperty("/cuentasCentralizadoras", aFiltered);
        },

        /**
         * Search centralized accounts in config wizard
         * 
         * Wrapper delegating to _onCuentaCentralSearch for config wizard type.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event
         * @returns {void}
         */
        onCuentaCentralSearch: function (oEvent) {
            this._onCuentaCentralSearch(oEvent, "config");
        },

        /**
         * Handle wizard dialog open event
         * 
         * Initializes wizard navigation state when dialog opens.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Check if company is selected in step 1
         * 
         * @private
         * @function
         * @returns {boolean} True if company selected and banks loaded
         */
        _isStep1Valid: function () {
            const oEmpresaTable = this.byId("empresaTable");
            return !!oEmpresaTable && oEmpresaTable.getItems().some((i) => i.getSelected());
        },

        /**
         * Update wizard navigation button states
         * 
         * Calculates visibility and enabled state of back/next/accept buttons
         * based on current step and validation state.
         * 
         * @private
         * @function
         * @param {number} iIndex - Current step index (0-based)
         * @returns {void}
         */
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

        /**
         * Handle wizard step navigation change
         * 
         * Updates navigation state when user navigates between wizard steps.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Navigation event
         * @returns {void}
         */
        onWizardNavChange: function (oEvent) {
            const oWizard = this.byId("configWizard");
            if (!oWizard) {
                return;
            }
            const oStep = oEvent.getParameter("step");
            const iIndex = oWizard.getSteps().indexOf(oStep);
            this._updateNavState(Math.max(0, iIndex));
        },

        /**
         * Navigate to next wizard step
         * 
         * Calls nextStep() for new steps or goToStep() for re-visiting steps.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Navigate to previous wizard step
         * 
         * @public
         * @function
         * @returns {void}
         */
        onWizardBack: function () {
            const oWizard = this.byId("configWizard");
            if (!oWizard || this._iCurrentStepIndex <= 0) {
                return;
            }
            const iPrev = this._iCurrentStepIndex - 1;
            oWizard.goToStep(oWizard.getSteps()[iPrev], true);
            this._updateNavState(iPrev);
        },

        /**
         * Handle company selection change in step 1
         * 
         * Loads banks for selected company, clears dependent selections,
         * and updates validation and navigation state.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onEmpresaSelectionChange: function () {
            const oTable = this.byId("empresaTable");
            const oModel = this._getWizardModel();
            const oSelectedItem = oTable?.getItems().find((oItem) => oItem.getSelected());
            const oSelectedContext = oSelectedItem?.getBindingContext("empresas");
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

        /**
         * Handle account selection change in step 2
         * 
         * Builds schedule and balance configurations for selected accounts.
         * Updates validation and review.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onCuentasSelectionChange: function () {
            const aSelectedAccounts = this._getSelectedStep2Accounts();
            const bValid = aSelectedAccounts.length > 0;
            this._setWizardStepValidation("wizardStep2", bValid);
            this._buildHorariosEspecificos(aSelectedAccounts);
            this._buildSaldosPersonalizados(aSelectedAccounts);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentas();
        },

        /**
         * Handle centralized account selection change in step 3
         * 
         * Validates selection and updates review.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onCuentaCentralSelectionChange: function () {
            const bValid = this.byId("cuentaCentralTable").getItems().some((i) => i.getSelected());
            this._setWizardStepValidation("wizardStep3", bValid);
            this._updateNavState(this._iCurrentStepIndex);
            this._updateReviewCuentaCentral();
        },

        /**
         * Handle schedule type selection change
         * 
         * Builds specific schedule options when schedule type changes.
         * Updates review and validates step.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Handle single schedule time change
         * 
         * Updates review when user changes the single schedule value.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onHorarioUnicoChange: function () {
            this._updateReviewHorario();
        },

        /**
         * Build per-bank or per-account schedule configurations
         * 
         * Creates arrays for specific schedule options based on selected accounts
         * and schedule type (by-bank or by-account).
         * 
         * @private
         * @function
         * @param {Array} aSelectedAccountsParam - Selected accounts (optional)
         * @returns {void}
         */
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

        /**
         * Handle specific bank/account schedule selection
         * 
         * Updates the schedule for a specific bank or account.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Selection change event
         * @returns {void}
         */
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

        /**
         * Handle day selection change
         * 
         * Updates review and validates step when selected days change.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onDiaSelectionChange: function () {
            this._updateReviewDias();
            this._validateStep4();
        },

        /**
         * Handle balance type selection change
         * 
         * Builds custom balance data and updates review when balance type changes.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Selection change event (optional)
         * @returns {void}
         */
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

        /**
         * Validate schedule step (step 4)
         * 
         * Checks that schedule is selected and at least one day is chosen.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Validate balance step (step 5)
         * 
         * Checks that custom balance inputs are valid for selected balance type.
         * 
         * @private
         * @function
         * @returns {void}
         */
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

        /**
         * Build per-bank or per-account custom balance configurations
         * 
         * Creates arrays for specific balance options based on selected accounts
         * and balance type (by-bank or by-account).
         * Preserves previously entered custom values.
         * 
         * @private
         * @function
         * @param {Array} aSelectedAccountsParam - Selected accounts (optional)
         * @returns {void}
         */
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

        /**
         * Handle custom balance input change
         * 
         * Parses and formats localized number input, updates model,
         * validates step, and updates review.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Value change event
         * @returns {void}
         */
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

        /**
         * Parse localized number format with fallback
         * 
         * Attempts to parse using locale formatter first, then falls back
         * to detecting decimal/thousands separators for pasted values.
         * 
         * @private
         * @function
         * @param {string} sValue - Number string to parse
         * @returns {number} Parsed number or NaN
         */
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

        /**
         * Handle balance consideration toggle change
         * 
         * Updates review when user changes whether to consider custom balance.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onSaldoConsiderChange: function () {
            this._updateReviewSaldo();
        },

        /**
         * Navigate to specific wizard step for editing
         * 
         * Used by review step edit buttons to jump to a specific step.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Button press event with "step" data
         * @returns {void}
         */
        onEditStep: function (oEvent) {
            const sStep = oEvent.getSource().data("step");
            const iIndex = parseInt(sStep, 10) - 1;
            const oWizard = this.byId("configWizard");
            if (oWizard) {
                oWizard.goToStep(this.byId("wizardStep" + sStep), true);
                this._updateNavState(iIndex);
            }
        },

        /**
         * Handle close button on configuration dialog
         * 
         * Closes the config dialog without saving.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onCloseDialog: function () {
            if (this._configDialog) {
                this._configDialog.close();
            }
        },

        /**
         * Handle configuration dialog close event
         * 
         * Cleans up dialog and related resources after dialog closes.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onDialogClose: function () {
            // Handle dialog close event
        },

        /**
         * Initialize transfer wizard with transfer data model
         * 
         * Loads transfer wizard data and opens the transfer dialog fragment.
         * Sets up wizardTransfer model for transfer wizard steps.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Transform OData response to bank structure
         * 
         * Converts OData bank/account response into hierarchical structure
         * used by wizard banks and centralized accounts tables.
         * 
         * @private
         * @function
         * @param {object} oODataResponse - OData response with /Banks data
         * @returns {object} Transformed data with aBancos and aCuentasCentralizadoras
         */
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
                const sBranch = oBank.Branch || "";
                const aAccountBalance = Array.isArray(oBank.AccountBalance) ? oBank.AccountBalance : [];

                // Transform account data
                const aCuentas = aAccountBalance.map((oAccount) => ({
                    ...oAccount,
                    cuentaCorriente: oAccount.Iban || oAccount.BankAccountNumber || "",
                    saldoInfoCent: Number(oAccount.StatementAmount) || 0,
                    saldoSAP: Number(oAccount.StatementAmount) || 0,
                    oficina: sBranch
                }));

                // Only add bank if it has accounts
                if (aCuentas.length > 0) {
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

        /**
         * Open transfer wizard dialog fragment
         * 
         * Loads and displays the transfer wizard dialog with fresh state.
         * Dialog is destroyed and reloaded on each use for clean state.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _openTransferWizardDialogFragment: function () {
            // Dialogs are now destroyed in onAfterClose, so always load fresh.
            Fragment.load({
                id: this.getView().getId(),
                name: "cashpool.app.cashpool.view.fragments.WizardTransferDialog",
                controller: this
            }).then((oDialog) => {
                this._transferWizardDialog = oDialog;
                this.getView().addDependent(oDialog);
                this._transferWizardDialog.open();
            });
        },

        /**
         * Handle transfer wizard dialog open event
         * 
         * Initializes transfer wizard navigation state when dialog opens.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onTransferWizardDialogAfterOpen: function () {
            this._iTransferCurrentStepIndex = 0;
            this._updateTransferNavState(0);
        },

        /**
         * Handle transfer wizard dialog close event
         * 
         * Cleans up wizard state and destroys dialog to guarantee fresh state.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onTransferWizardDialogAfterClose: function () {
            this._resetWizard("transfer");
            // Destroy the dialog to guarantee clean state on next opening.
            // Fragment will be reloaded fresh.
            if (this._transferWizardDialog) {
                this.getView().removeDependent(this._transferWizardDialog);
                this._transferWizardDialog.destroyContent();
                this._transferWizardDialog.destroy(true);
                this._transferWizardDialog = null;
            }
        },



        /**
         * Update transfer wizard navigation button states
         * 
         * Calculates visibility and enabled state of navigation buttons
         * based on current step and account selection state.
         * 
         * @private
         * @function
         * @param {number} iIndex - Current step index (0-based)
         * @returns {void}
         */
        _updateTransferNavState: function (iIndex) {
            const oModel = this._getWizardModel("transfer");
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

        /**
         * Check if origin account is selected in transfer step 2
         * 
         * Verifies that at least one account from banks list is selected.
         * 
         * @private
         * @function
         * @returns {boolean} True if any origin account is selected
         */
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

        /**
         * Handle transfer wizard step navigation change
         * 
         * Updates navigation state when user navigates between wizard steps.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Navigation event
         * @returns {void}
         */
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

        /**
         * Navigate to next step in transfer wizard
         * 
         * Advances wizard to next step and updates navigation state.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Navigate to previous step in transfer wizard
         * 
         * Goes back to previous step and updates navigation state.
         * 
         * @public
         * @function
         * @returns {void}
         */
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

        /**
         * Handle transfer wizard cancel button
         * 
         * Closes the transfer wizard without saving.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onTransferWizardCancel: function () {
            if (this._transferWizardDialog) {
                this._transferWizardDialog.close();
            }
        },

        /**
         * Handle company selection change in transfer wizard step 1
         * 
         * Loads banks for selected company and clears dependent selections.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onEmpresaSelectionChangeTransfer: function () {
            const oTable = this.byId("empresaTableTransfer");
            const oModel = this._getWizardModel("transfer");
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

        /**
         * Search source/origin accounts in transfer wizard step 2
         * 
         * Filters bank accounts by search query.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event
         * @returns {void}
         */
        onCuentasSearchTransfer: function (oEvent) {
            this._onBancosSearch(oEvent, "transfer");
        },

        /**
         * Handle origin/source account selection change
         * 
         * Updates wizard state when user selects source account.
         * Only one account selection allowed at a time.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Item selection event
         * @returns {void}
         */
        onCuentaOrigenSelectionChange: function (oEvent) {
            this.byId("bancosListTransferStep2").getAggregation("items").map(e => { e.getContent()[0].getContent()[0].getSelectedItem()?.setSelected(false) })
            oEvent.getParameter("listItem").setSelected(true);
            this._updateTransferNavState(1);
        },

        /**
         * Search destination/centralized accounts in transfer wizard step 3
         * 
         * Filters centralized account list by search query.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Search event
         * @returns {void}
         */
        onCuentaDestinoSearchTransfer: function (oEvent) {
            this._onCuentaCentralSearch(oEvent, "transfer");
        },

        /**
         * Handle destination/centralized account selection change
         * 
         * Updates wizard state when user selects destination account.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onCuentaDestinoSelectionChange: function () {
            this._updateTransferNavState(2);
        },

        /**
         * Handle transfer amount change
         * 
         * Updates wizard model and navigation state when transfer amount changes.
         * Validates amount format and enables/disables next button.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Value change event
         * @returns {void}
         */
        onTransferAmountChange: function (oEvent) {
            this._getWizardModel("transfer").setProperty('/transferAmount', oEvent.getParameter('newValue'))
            this._updateTransferNavState(3);
        },

        /**
         * Handle transfer review step activation
         * 
         * Updates review fields when review step becomes active.
         * Pulls latest values from wizard selections.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onTransferReviewStepActivate: function () {
            this._updateTransferReview();
        },

        /**
         * Update transfer review display
         * 
         * Updates all review fields with current selections from wizard steps.
         * Populates empresa, cuenta origen, cuenta destino, and amount fields.
         * 
         * @private
         * @function
         * @returns {void}
         */
        _updateTransferReview: function () {
            const oModel = this._getWizardModel("transfer");
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

        /**
         * Navigate to specific step in transfer wizard for editing
         * 
         * Used by review step edit buttons to jump to a specific step.
         * 
         * @public
         * @function
         * @param {sap.ui.base.Event} oEvent - Button press event with "step" data
         * @returns {void}
         */
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

        /**
         * Handle transfer wizard accept/submit button
         * 
         * Validates selections, updates review, and submits transfer to OData service.
         * Shows success message and closes wizard after submission.
         * 
         * @public
         * @function
         * @returns {void}
         */
        onTransferWizardAccept: function () {
            const oModel = this._getWizardModel("transfer");
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

        /**
         * Submit transfer to backend OData service
         * 
         * Constructs OData payload with accounts, amounts, bank data, and payment control info.
         * Submits to /postBankTransfer operation with transfer details.
         * 
         * @public
         * @function
         * @param {object} oTransferObject - Prepared transfer object from wizard
         * @returns {void}
         */
        onAnotherButtonPress: function (oTransferObject) {
            const oTreasureModel = this.getView().getModel("Cashpool");
            const oTransferModel = this._getWizardModel("transfer");
            const oBancoDestinoDetails = oTransferModel.getData()._bancosAll.find(e => e.BankName == oTransferModel.getData().review.cuentaDestinoBanco);
            const oBancoOrigenDetails = oTransferModel.getData()._bancosAll.find(e => e.BankName == oTransferModel.getData().review.cuentaOrigenBanco);
            const oCuentaOrigenDetails = oBancoOrigenDetails.cuentas.find(e => e.cuentaCorriente == oTransferModel.getData().review.cuentaOrigenCuenta.split("\n")[1].slice(-24));
            const oCuentaDestinoDetails = oTransferModel.getData()._cuentasCentralAll.find(e => e.cuentaCorriente == oTransferModel.getData().review.cuentaDestinoCuenta.split("\n")[1].slice(-24));
            const sImporteFixed2=Number.parseFloat(-oTransferModel.getData().preparedTransfer.importe).toFixed(2);
            const sImporteFixed8=Number.parseFloat(-oTransferModel.getData().preparedTransfer.importe).toFixed(8);
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
                    "type": "MANUAL",
                    "payerBranch": oCuentaOrigenDetails.oficina,
                    "payeeBranch": oCuentaDestinoDetails.oficina
                }
            };
            oToPostBank = oToPostBank.parameters
            //oContext.setParameter("parameters", oToPostBank);
            oContext.setParameter("parameters", oToPostBank).invoke().then(() => {
                var oActionContext = oContext.getBoundContext();
                var sReturnType = oActionContext.getObject().return.type;
                var sMessage = oActionContext.getObject().return.message;
                if (sReturnType === "E") {
                    MessageToast.show("Error from backend: " + sMessage);
                    return;
                } else {
                    console.log(sMessage);
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
        },

        onSynchronizeStatus: async function (oEvent) {
            const oCashpoolModel = this.getOwnerComponent().getModel("Cashpool");
            const oHistoryItem = oEvent.getSource().getBindingContext("view").getObject();
            const sPathForItem = oEvent.getSource().getBindingContext("view").sPath;
            const sPaymentDoc = oHistoryItem.paymentDoc
            let oParamsForPost = oHistoryItem.parameters;
            oEvent.getSource().getParent().setBusy(true);

            const oActionBinding = oCashpoolModel.bindContext("/updateBankTransferStatus(...)");
            oActionBinding.setParameter("parameters", oParamsForPost);

            const oBinding = oCashpoolModel.bindList(
                "/BankTransferHistory",
                null,
                null,
                [new Filter("paymentDoc", FilterOperator.EQ, oHistoryItem.paymentDoc)]
            );
            await oActionBinding.invoke().then(() => {
            }).catch((oError) => {
                MessageToast.show("Error synchronizing bank transfer status: " + oError.error.message);
            });
            
            await oBinding.requestContexts().then((aContexts) => {
                const oItemToSwap = aContexts.map((oContext) => this._mapTransferHistoryItem(oContext.getObject(), oContext.getObject().type));
                this._getViewModel().setProperty(sPathForItem, oItemToSwap[0]);
                this._getViewModel().refresh(true);
                console.log("Updated item:", oItemToSwap[0]);
            }).finally(() => {
                MessageToast.show("Bank transfer status synchronized successfully!");
                oEvent.getSource().getParent().setBusy(false);
            });
        }
    });
});