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
			this._DURATION_MONTHS = { "1M": 1, "2M": 2, "3M": 3, "4M": 4, "5M": 5, "6M": 6, "7M": 7, "8M": 8, "9M": 9, "10M": 10, "11M": 11, "12M": 12 };
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

			this.oRouter.getRoute("DepositDetail").attachPatternMatched(this._onDepositMatched, this);
		},

		_onDepositMatched: async function (oEvent) {
			const sKey = oEvent.getParameter("arguments").key;

			this._resetSimulation();
			this._resetRequest();

			//const aDeposits = this.getOwnerComponent().getModel("mainService").getProperty("/value");
			//const iIdx = aDeposits ? aDeposits.findIndex(function (d) { return d.UUID === sKey; }) : -1;
			//if (iIdx >= 0) {
			this.getView().bindElement({
				model: "mainService",
				path: `/RateGrid('${sKey}')`,
				parameters: { $select: ["currency_ID", "tenor_ID", "rate"] }
			});
			//}
			this._filterAccountsByCurrency();
		},

		onSimulate: function () {
			const oView = this.getView();
			const oSimModel = this.getModel("simulation");
			const oInput = oView.byId("simAmountInput");
			const fAmount = oSimModel.getProperty("/amount");
			const sValue = oInput.getValue();

			if (!fAmount || fAmount <= 10000000 || sValue <= 10000000) {
				//this._resetSimulation();
				oInput.setValueState("Error");
				oSimModel.setProperty("/interest", 0);
				oSimModel.setProperty("/total", 0);
				MessageToast.show(this.getResourceBundle().getText("simInvalidAmount"));
				return;
			}
			oInput.setValueState("None");

			const oCtx = oView.getBindingContext("mainService");
			const fRate = oCtx.getProperty("rate");
			const sDuration = oCtx.getProperty("tenor_ID");
			const sCurrency = oCtx.getProperty("currency_ID");

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

		_resetSimulation: function () {
			const oSimModel = this.getModel("simulation");
			if (oSimModel) {
				oSimModel.setData({ amount: null, interest: 0, total: 0, currency: "", hasResult: false });
			}
			// const oInput = this.getView().byId("simAmountInput");
			// if (oInput) {
			// 	oInput.setValueState("None");
			// }
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

		_filterAccountsByCurrency: async function () {
			const oCtx = this.getView().getBindingContext("mainService");
			if (!oCtx) { return; }
			await oCtx.requestObject();
			const sCurrency = oCtx.getProperty("currency_ID");
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

		onRequestDeposit: async function () {
			const oBundle = this.getResourceBundle();
			const oCtx = this.getView().getBindingContext("mainService");
			await oCtx.requestObject();
			const sDescription = oCtx.getProperty("tenor/description");
			const fRate = oCtx.getProperty("rate");
			const sCurrency = oCtx.getProperty("currency_ID");
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

		handleClose: function () {
			const sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/closeColumn");
			this.oRouter.navTo("DepositsList", {
				layout: sNextLayout
			});
		},

		// copy value from simulation model to request model
		onCopySimulation: function () {
			const oSimModel = this.getModel("simulation");
			const oReqModel = this.getModel("request");
			const fAmount = oSimModel.getProperty("/amount");
			const sCurrency = oSimModel.getProperty("/currency");
			const oInput = this.getView().byId("reqAmountInput");

			oReqModel.setProperty("/importeSolicitud", fAmount);
			oReqModel.setProperty("/currency", sCurrency);
			oInput.setValue(Formatter.formatFloat(fAmount));
		},
		
		onExit: function () {
			this.oRouter.getRoute("DepositDetail").detachPatternMatched(this._onDepositMatched, this);
		}
	});
});
