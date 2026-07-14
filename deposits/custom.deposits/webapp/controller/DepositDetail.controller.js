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

		/**
		 * Inicializa el controlador, modelos de vista y suscripción a la ruta de detalle.
		 * @returns {void}
		 */
		onInit: function () {
			this.oOwnerComponent = this.getOwnerComponent();
			this.oRouter = this.getRouter();
			this.oModel = this.oOwnerComponent.getModel(); // layout JSON model
			Formatter.init(this.getResourceBundle());

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

		/**
		 * Maneja el match de la ruta de detalle y construye un binding dinámico según el intent.
		 *
		 * Flujo de decisión:
		 * - Lee `intent>/isDisplay` para decidir qué entidad bindear:
		 *   - `true`: bindea `RateGrid('<key>')` (modo catálogo/tarifario).
		 *   - `false`: bindea `Deposits('<key>')` (modo detalle de solicitud ya creada).
		 * - Define `$select` en función de la entidad elegida:
		 *   - `RateGrid`: campos base de simulación (`currency_ID`, `tenor_ID`, `rate`, `createdAt`).
		 *   - `Deposits`: campos de operación (`amount`, `startDate`, `maturityDate`, `status`) además de los base.
		 * - Parte de `$expand="currency,tenor"` y, si `intent>/isSantander` es `true`,
		 *   añade `client_ID` al `$select` y `client` al `$expand`.
		 *
		 * Con esos parámetros ejecuta `bindElement` sobre `mainService` para que la vista de detalle
		 * consuma el contexto correcto según el escenario de navegación.
		 * Si está en modo display, además recalcula las cuentas origen filtradas por moneda.
		 *
		 * @param {sap.ui.base.Event} oEvent Evento de coincidencia de ruta (`DepositDetail`) con `arguments.key`.
		 * @returns {Promise<void>}
		 */
		_onDepositMatched: async function (oEvent) {
			const sKey = oEvent.getParameter("arguments").key;

			this._resetSimulation();
			this._resetRequest();
			const bIsDisplay = this.getOwnerComponent().getModel('intent').getProperty('/isDisplay');
			const bIsSantander = this.getOwnerComponent().getModel('intent').getProperty('/isSantander');
			const sPath = bIsDisplay ? `/RateGrid('${sKey}')` : `/Deposits('${sKey}')`;
			const aSelect = bIsDisplay ? ["currency_ID", "tenor_ID", "rate", "createdAt"] : ["currency_ID", "tenor_ID", "rate", "amount", "createdAt", "startDate", "maturityDate", "status"];
			let sExpand = bIsDisplay ? "currency,tenor" : "currency,tenor";
			if (bIsSantander) {
				aSelect.push("client_ID");
				sExpand += ",client";
			}

			this.getView().bindElement({
				model: "mainService",
				path: sPath,
				parameters: { $select: aSelect, $expand: sExpand }
			});

			if (bIsDisplay) {
				this._filterAccountsByCurrency();
			}

		},

		/**
		 * Ejecuta la simulación de interés para el importe ingresado.
		 * @returns {void}
		 */
		onSimulate: function () {
			const oView = this.getView();
			const oSimModel = this.getModel("simulation");
			const oInput = oView.byId("simAmountInput");
			const fAmount = oSimModel.getProperty("/amount");
			const sValue = oInput.getValue();

			if (!fAmount || fAmount <= 10000000 || sValue <= 10000000) {
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

			const iDays = this._getTenorDays(sDuration);
			const fInterest = fAmount * (fRate / 100) * (iDays / 360);
			const fTotal = fAmount + fInterest;

			oSimModel.setData({
				amount: fAmount,
				interest: Number.parseFloat(fInterest.toFixed(2)),
				total: Number.parseFloat(fTotal.toFixed(2)),
				currency: sCurrency,
				hasResult: true
			});
		},

		/**
		 * Restablece el modelo de simulación a su estado inicial.
		 * @returns {void}
		 */
		_resetSimulation: function () {
			const oSimModel = this.getModel("simulation");
			if (oSimModel) {
				oSimModel.setData({ amount: null, interest: 0, total: 0, currency: "", hasResult: false });
			}
		},

		/**
		 * Restablece el modelo de solicitud y el estado de validación del campo importe.
		 * @returns {void}
		 */
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

		/**
		 * Filtra cuentas bancarias por la moneda del depósito seleccionado.
		 * @returns {Promise<void>}
		 */
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

		/**
		 * Confirma y envía la solicitud de apertura de depósito al backend.
		 * @returns {Promise<void>}
		 */
		onRequestDeposit: async function () {
			const oBundle = this.getResourceBundle();
			const oCtx = this.getView().getBindingContext("mainService");
			const oBindedObject = oCtx.getObject();
			const sDescription = oBindedObject?.tenor?.description;
			const fRate = oBindedObject?.rate;
			const sTenor = oBindedObject?.tenor_ID;
			const sCurrency = oBindedObject?.currency_ID;
			const sRateGridID = oBindedObject?.ID;
			const fImporte = this.getModel("request").getProperty("/importeSolicitud");

			// Compute startDate (now) and maturityDate (now + tenor days) as ISO strings
			const iTenorDays = this._getTenorDays(sTenor);
			let sStartDate, sMaturityDate;
			if (typeof Temporal !== "undefined") {
				const oNow = Temporal.Now.zonedDateTimeISO();
				sStartDate = oNow.toInstant().toString();
				// Maturity: UTC midnight on the target day (avoids local-timezone offset shifting the time)
				const oMaturityDay = oNow.toPlainDate().add({ days: iTenorDays });
				sMaturityDate = oMaturityDay.toZonedDateTime("UTC").toInstant().toString();
			} else {
				const oNow = new Date();
				sStartDate = oNow.toISOString();
				const oMaturity = new Date(oNow);
				oMaturity.setDate(oMaturity.getDate() + iTenorDays);
				oMaturity.setHours(0, 0, 0, 0);
				sMaturityDate = oMaturity.toISOString();
			}

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
				onClose: async (sAction) => {
					if (sAction === MessageBox.Action.YES) {
						MessageToast.show(oBundle.getText("requestSuccessMsg"));
						const oModel = this.getView().getModel("mainService");
						const oPayload = {
							rateSnapshot_ID: sRateGridID,
							amount: Number.parseFloat(fImporte.toFixed(2)),	
							currency_ID: sCurrency,
							tenor_ID: sTenor,
							rate: fRate,
							startDate: sStartDate,
							maturityDate: sMaturityDate, // calculate based on startDate and tenor
							status: 1				 // default to '1' (e.g. 'Pending') - adjust as needed
						};
						console.log("Payload to be sent to backend:", oPayload);
						try {
							await oModel.bindList("/Deposits").create(oPayload);
						} catch (oError) {
							console.error("Error creating deposit request:", oError);
							MessageBox.error(oBundle.getText("requestErrorMsg"));
						}
					}
				}
			});
		},

		/**
		 * Cierra la vista de detalle navegando de vuelta al listado.
		 * @returns {void}
		 */
		handleClose: function () {
			const sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/closeColumn");
			this.oRouter.navTo("DepositsList", {
				layout: sNextLayout
			});
		},

		/**
		 * Copia el importe y moneda de la simulación al modelo de solicitud.
		 * @returns {void}
		 */
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
		
		/**
		 * Libera suscripciones del router al destruir el controlador.
		 * @returns {void}
		 */
		onExit: function () {
			this.oRouter.getRoute("DepositDetail").detachPatternMatched(this._onDepositMatched, this);
		}
	});
});
