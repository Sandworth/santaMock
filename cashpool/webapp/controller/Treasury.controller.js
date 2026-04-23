sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "cashpool/app/cashpool/utils/Formatter",
    "sap/m/MessageToast"
], (Controller, JSONModel, Fragment, Formatter, MessageToast) => {
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
            // Handle configure now action
            MessageToast.show("Configure Now clicked");
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