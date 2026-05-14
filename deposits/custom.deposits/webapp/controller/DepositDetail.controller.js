sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/ui/core/format/NumberFormat",
	"../model/formatter"
], function (BaseController, JSONModel, MessageToast, MessageBox, NumberFormat, Formatter) {
	"use strict";

	return BaseController.extend("custom.deposits.controller.DepositDetail", {

		onInit: function () {
			this._DURATION_MONTHS = { "1M": 1, "3M": 3, "6M": 6, "12M": 12, "24M": 24 };
			this.oOwnerComponent = this.getOwnerComponent();
			this.oRouter = this.getRouter();
			this.oModel = this.oOwnerComponent.getModel(); // layout JSON model

			this.setModel(new JSONModel({
				amount: null,
				interest: 0,
				total: 0,
				currency: "",
				hasResult: false
			}), "simulation");

			this.setModel(new JSONModel({
				cuentaOrigen: null,
				importeSolicitud: null,
				cuentasFiltradas: []
			}), "request");

			this.setModel(new JSONModel({
				bancos: [
					{
						nombre: "Santander", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0049", cuentaCorriente: "00491555-11-0123456789", saldoSAP: 52000.00, saldoInfoCent: 50000.00, currency: "EUR" },
							{ nombre: "Cuenta 2", oficina: "0049", cuentaCorriente: "00492205-20-9876543210", saldoSAP: 48000.00, saldoInfoCent: 49000.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "0049", cuentaCorriente: "00491206-30-1122334455", saldoSAP: 50000.00, saldoInfoCent: 51000.00, currency: "EUR" },
							{ nombre: "Cuenta 4", oficina: "0049", cuentaCorriente: "00493033-40-5544332211", saldoSAP: 50000.00, saldoInfoCent: 50000.00, currency: "EUR" }
						]
					},
					{
						nombre: "Abanca", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "2080", cuentaCorriente: "20800970-05-1234554321", saldoSAP: 61000.00, saldoInfoCent: 60000.00, currency: "EUR" },
							{ nombre: "Cuenta 2", oficina: "2080", cuentaCorriente: "20801880-20-9876598765", saldoSAP: 43000.00, saldoInfoCent: 44500.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "2080", cuentaCorriente: "20802252-30-5555555555", saldoSAP: 55000.00, saldoInfoCent: 55000.00, currency: "EUR" },
							{ nombre: "Cuenta 4", oficina: "2080", cuentaCorriente: "20809910-40-1111111111", saldoSAP: 38000.00, saldoInfoCent: 37500.00, currency: "EUR" },
							{ nombre: "Cuenta 5", oficina: "2080", cuentaCorriente: "20802202-50-6666666666", saldoSAP: 72000.00, saldoInfoCent: 72000.00, currency: "EUR" }
						]
					},
					{
						nombre: "CaixaBank", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "2100", cuentaCorriente: "21002151-41-2233355555", saldoSAP: 67000.00, saldoInfoCent: 68000.00, currency: "USD" },
							{ nombre: "Cuenta 2", oficina: "2100", cuentaCorriente: "21006428-22-6678764260", saldoSAP: 45000.00, saldoInfoCent: 44000.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "2100", cuentaCorriente: "21002151-30-1122334455", saldoSAP: 33000.00, saldoInfoCent: 33000.00, currency: "EUR" },
							{ nombre: "Cuenta 4", oficina: "2100", cuentaCorriente: "21002207-40-5544332211", saldoSAP: 59000.00, saldoInfoCent: 58500.00, currency: "EUR" },
							{ nombre: "Cuenta 5", oficina: "2100", cuentaCorriente: "21001880-42-2231235555", saldoSAP: 41000.00, saldoInfoCent: 41000.00, currency: "USD" }
						]
					},
					{
						nombre: "Banco Sabadell", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0281", cuentaCorriente: "02812200-10-1234567890", saldoSAP: 80000.00, saldoInfoCent: 79000.00, currency: "EUR" },
							{ nombre: "Cuenta 2", oficina: "0281", cuentaCorriente: "02817856-20-9876543210", saldoSAP: 54000.00, saldoInfoCent: 54000.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "0281", cuentaCorriente: "02812389-30-1122334455", saldoSAP: 36000.00, saldoInfoCent: 37000.00, currency: "EUR" }
						]
					},
					{
						nombre: "Bankinter", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0128", cuentaCorriente: "01289414-86-1111222233", saldoSAP: 28000.00, saldoInfoCent: 28000.00, currency: "EUR" }
						]
					},
					{
						nombre: "BBVA", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0182", cuentaCorriente: "01822357-14-627550077", saldoSAP: 95000.00, saldoInfoCent: 94000.00, currency: "GBP" },
							{ nombre: "Cuenta 2", oficina: "0182", cuentaCorriente: "01824213-48-1941353530", saldoSAP: 95000.00, saldoInfoCent: 94000.00, currency: "EUR" }
						]
					}
				]
			}), "banks");

			this.oRouter.getRoute("DepositDetail").attachPatternMatched(this._onDepositMatched, this);
		},

		_onDepositMatched: function (oEvent) {
			const sKey = oEvent.getParameter("arguments").key;

			this._resetSimulation();
			this._resetRequest();

			this.getView().bindElement({
				model: "mainService",
				path: "/Deposits(" + sKey + ")",
				parameters: {
					$expand: "to_TenorCode,to_CurrencyCode"
				},
				events: {
					dataRequested: function () {
						this.getView().setBusy(true);
					}.bind(this),
					dataReceived: function () {
						this.getView().setBusy(false);
						this._filterAccountsByCurrency();
					}.bind(this)
				}
			});
		},

		onSimulate: function () {
			const oView = this.getView();
			const oSimModel = this.getModel("simulation");
			const oInput = oView.byId("simAmountInput");
			const fAmount = oSimModel.getProperty("/amount");
			const sValue = oInput.getValue();

			if (!fAmount || fAmount <= 0 || sValue === "") {
				this._resetSimulation();
				oInput.setValueState("Error");
				MessageToast.show(this.getResourceBundle().getText("simInvalidAmount"));
				return;
			}
			oInput.setValueState("None");

			const oCtx = oView.getBindingContext("mainService");
			const fRate = oCtx.getProperty("Rate");
			const sDuration = oCtx.getProperty("to_TenorCode/Code");
			const sCurrency = oCtx.getProperty("to_CurrencyCode/Code");

			const iMonths = this._DURATION_MONTHS[sDuration] || 1;
			const fInterest = fAmount * (fRate / 100) * (iMonths / 12);
			const fTotal = fAmount + fInterest;

			oSimModel.setData({
				amount: fAmount,
				interest: Number.parseFloat(fInterest.toFixed(2)),
				total: Number.parseFloat(fTotal.toFixed(2)),
				currency: sCurrency,
				hasResult: true
			});
		},

		onAmountLiveChange: function (oEvent) {
			const oInput = oEvent.getSource();
			const sValue = oEvent.getParameter("value");
			// Allow only digits and locale decimal/grouping separators (dot and comma)
			const sFiltered = sValue.replace(/[^0-9.,]/g, "");
			if (sFiltered !== sValue) {
				oInput.setValue(sFiltered);
			}
		},

		_resetSimulation: function () {
			const oSimModel = this.getModel("simulation");
			if (oSimModel) {
				oSimModel.setData({ amount: null, interest: 0, total: 0, currency: "", hasResult: false });
			}
			const oInput = this.getView().byId("simAmountInput");
			if (oInput) {
				oInput.setValueState("None");
			}
		},

		_resetRequest: function () {
			const oReqModel = this.getModel("request");
			if (oReqModel) {
				oReqModel.setData({ cuentaOrigen: null, importeSolicitud: null, cuentasFiltradas: [] });
			}
			const oInput = this.getView().byId("reqAmountInput");
			if (oInput) {
				oInput.setValueState("None");
			}
		},

		_filterAccountsByCurrency: function () {
			const oCtx = this.getView().getBindingContext("mainService");
			if (!oCtx) { return; }
			const sCurrency = oCtx.getProperty("to_CurrencyCode/Code");
			const aBancos = this.getModel("banks").getProperty("/bancos");
			const aCuentasFiltradas = [];
			aBancos.forEach(function (oBanco) {
				oBanco.cuentas
					.filter(function (oCuenta) { return oCuenta.currency === sCurrency; })
					.forEach(function (oCuenta) {
						aCuentasFiltradas.push({
							banco: oBanco.nombre,
							nombre: oCuenta.nombre,
							cuentaCorriente: oCuenta.cuentaCorriente,
							saldoInfoCent: oCuenta.saldoInfoCent,
							currency: oCuenta.currency
						});
					});
			});
			this.getModel("request").setProperty("/cuentasFiltradas", aCuentasFiltradas);
		},

		onReqAmountLiveChange: function (oEvent) {
			const oInput = oEvent.getSource();
			const sValue = oEvent.getParameter("value");
			const sFiltered = sValue.replace(/[^0-9.,]/g, "");
			if (sFiltered !== sValue) {
				oInput.setValue(sFiltered);
			}
		},

		onRequestDeposit: function () {
			const oBundle = this.getResourceBundle();
			const oCtx = this.getView().getBindingContext("mainService");
			const sDescription = oCtx.getProperty("to_TenorCode/Description");
			const fRate = oCtx.getProperty("Rate");
			const sCurrency = oCtx.getProperty("to_CurrencyCode/Code");
			const fImporte = this.getModel("request").getProperty("/importeSolicitud");

			const oRateFormat = NumberFormat.getFloatInstance({ decimals: 2, maxFractionDigits: 2 });

			const sMsg = oBundle.getText("requestConfirmMsg", [
				sDescription,
				oRateFormat.format(fRate),
				Formatter.formatCurrency(fImporte, sCurrency)
			]);

			MessageBox.confirm(sMsg, {
				title: oBundle.getText("requestConfirmTitle"),
				actions: [MessageBox.Action.YES, MessageBox.Action.NO],
				emphasizedAction: MessageBox.Action.YES,
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.YES) {
						MessageToast.show(oBundle.getText("requestSuccessMsg"));
					}
				}
			});
		},

		handleFullScreen: function () {
			const sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/fullScreen");
			if (sNextLayout) {
				this.oRouter.navTo("DepositDetail", {
					layout: sNextLayout,
					key: this._getKey()
				});
			}
		},

		handleExitFullScreen: function () {
			const sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/exitFullScreen");
			if (sNextLayout) {
				this.oRouter.navTo("DepositDetail", {
					layout: sNextLayout,
					key: this._getKey()
				});
			}
		},

		handleClose: function () {
			const sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/closeColumn");
			this.oRouter.navTo("DepositsList", {
				layout: sNextLayout
			});
		},

		_getKey: function () {
			const sPath = this.getView().getBindingContext("mainService").getPath();
			return sPath.split("(")[1].slice(0, -1);
		},

		onExit: function () {
			this.oRouter.getRoute("DepositDetail").detachPatternMatched(this._onDepositMatched, this);
		}
	});
});
