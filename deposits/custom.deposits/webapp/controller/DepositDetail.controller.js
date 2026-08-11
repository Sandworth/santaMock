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
		 * Controller for the Deposit Detail view.
		 * Manages simulation calculations, deposit request submission, and UI state management.
		 * Handles both display mode (rate grid details) and request mode (creating deposit orders).
		 * 
		 * @class custom.deposits.controller.DepositDetail
		 * @extends custom.deposits.controller.BaseController
		 */

		/**
		 * Lifecycle hook called when the controller is initialized.
		 * Sets up view references, models (simulation, request), and subscribes to route pattern matching.
		 * 
		 * Models initialized:
		 * - "simulation": Stores simulation calculation state and results
		 * - "request": Stores deposit request form data and account selection
		 * 
		 * Routes subscribed:
		 * - "DepositDetail": Triggers _onDepositMatched when detail page is navigated to
		 * 
		 * @returns {void}
		 * @public
		 */
		onInit: function () {
			this.oOwnerComponent = this.getOwnerComponent();
			this.oRouter = this.getRouter();
			this.oModel = this.oOwnerComponent.getModel(); // layout JSON model
			Formatter.init(this.getResourceBundle());

			this.setModel(new JSONModel({
				amount: null,
				amountDisplay: "",
				interest: 0,
				total: 0,
				currency: "",
				hasResult: false
			}), "simulation");

			this.setModel(new JSONModel({
				cuentaOrigen: null,
				importeSolicitud: null,
				importeSolicitudDisplay: "",
				cuentasFiltradas: []
			}), "request");

			this.oRouter.getRoute("DepositDetail").attachPatternMatched(this._onDepositMatched, this);
		},

		/**
		 * Handles route pattern match for the detail view.
		 * Determines OData endpoint based on FLP intent and fetches deposit/rate details.
		 * 
		 * Intent-driven logic:
		 * - `isDisplay=true`: Binds to `/RateGrid('<key>')` for product display and simulation
		 * - `isDisplay=false`: Binds to `/Deposits('<key>')` for existing request details
		 * - `isSantander=true`: Includes client info in expand
		 * 
		 * After binding, if in display mode, filters available accounts by the rate's currency.
		 * Resets both simulation and request models to initial state.
		 *
		 * @param {sap.ui.base.Event} oEvent - Route pattern match event with arguments.key
		 * @returns {Promise<void>}
		 * @private
		 */
		_onDepositMatched: async function (oEvent) {
			const sKey = oEvent.getParameter("arguments").key;

			this._resetSimulation();
			this._resetRequest();
			const bIsDisplay = this.getOwnerComponent().getModel('intent').getProperty('/isDisplay');
			const bIsSantander = this.getOwnerComponent().getModel('intent').getProperty('/isSantander');
			const sPath = bIsDisplay ? `/RateGrid('${sKey}')` : `/Deposits('${sKey}')`;
			const aSelect = bIsDisplay ? ["currency_ID", "tenor_ID", "rate", "createdAt"] : ["currency_ID", "tenor_ID", "rate", "amount", "createdAt", "startDate", "maturityDate", "status", "createdBy"];
			let sExpand = bIsDisplay ? "currency,tenor" : "currency,tenor";
			if (bIsSantander) {
				aSelect.push("requestedBy");
				sExpand += ",client";
			}

			this.getView().bindElement({
				model: "mainService",
				path: sPath,
				parameters: { $select: aSelect, $expand: sExpand }
			});

			// Set bindings programmatically to avoid OData V4 drill-down errors
			// (expression bindings in XML resolve ALL parts regardless of condition)
			const oView = this.getView();
			const sUserNamePath = bIsSantander ? "mainService>requestedBy" : "mainService>createdBy";
			oView.byId("requestedTimelineItem").bindProperty("userName", { path: sUserNamePath });
			if (bIsSantander) {
				oView.byId("clientNameText").bindProperty("text", { path: "mainService>client/name" });
			}

			if (bIsDisplay) {
				this._filterAccountsByCurrency();
			}

		},

		/**
		 * Executes the interest simulation for the entered amount.
		 * Validates that the amount meets the minimum threshold (10,000,000).
		 * Calculates interest and total using the rate from the binding context.
		 * 
		 * Calculation formula:
		 * Interest = Amount × (Rate / 100) × (Days / 360)
		 * Total = Amount + Interest
		 * 
		 * Sets ValueState to "Error" with i18n message if validation fails.
		 * Stores results in simulation model (`/interest`, `/total`, `/hasResult`).
		 *
		 * @returns {void}
		 * @public
		 */
		onSimulate: function () {
			const oView = this.getView();
			const oSimModel = this.getModel("simulation");
			const oInput = oView.byId("simAmountInput");
			const fAmount = oSimModel.getProperty("/amount");
			const sValue = oInput.getValue();
			const iMinAmount = 10000000;

			if (!fAmount || fAmount <= iMinAmount || sValue <= iMinAmount) {
				oInput.setValueState("Error");
				const oNumFormat = NumberFormat.getFloatInstance({ decimals: 2, groupingEnabled: true });
				oInput.setValueStateText(this.getResourceBundle().getText("customReqMinAmount", [oNumFormat.format(iMinAmount)]));
				oSimModel.setProperty("/interest", 0);
				oSimModel.setProperty("/total", 0);
				return;
			}
			oInput.setValueState("None");
			oInput.setValueStateText("");

			const oCtx = oView.getBindingContext("mainService");
			const fRate = oCtx.getProperty("rate");
			const sDuration = oCtx.getProperty("tenor_ID");
			const sCurrency = oCtx.getProperty("currency_ID");

			const iDays = this._getTenorDays(sDuration);
			const fInterest = fAmount * (fRate / 100) * (iDays / 360);
			const fTotal = fAmount + fInterest;

			oSimModel.setData({
				amount: fAmount,
				amountDisplay: this._formatNumber(fAmount),
				interest: Number.parseFloat(fInterest.toFixed(2)),
				total: Number.parseFloat(fTotal.toFixed(2)),
				currency: sCurrency,
				hasResult: true
			});
		},

		/**
		 * Resets the simulation model to its initial empty state.
		 * Clears input ValueState and ValueStateText.
		 * Called on route match or when navigating away.
		 *
		 * Initial state:
		 * - amount: null
		 * - amountDisplay: ""
		 * - interest: 0
		 * - total: 0
		 * - currency: ""
		 * - hasResult: false
		 * 
		 * @returns {void}
		 * @private
		 */
		_resetSimulation: function () {
			const oSimModel = this.getModel("simulation");
			if (oSimModel) {
				oSimModel.setData({ amount: null, amountDisplay: "", interest: 0, total: 0, currency: "", hasResult: false });
			}
			const oInput = this.getView().byId("simAmountInput");
			if (oInput) {
				oInput.setValueState("None");
				oInput.setValueStateText("");
			}
		},

		/**
		 * Resets the request model to its initial empty state.
		 * Clears input ValueState and ValueStateText.
		 * Called on route match or when navigating away.
		 *
		 * Initial state:
		 * - cuentaOrigen: null
		 * - importeSolicitud: null
		 * - importeSolicitudDisplay: ""
		 * - cuentasFiltradas: []
		 * 
		 * @returns {void}
		 * @private
		 */
		_resetRequest: function () {
			const oReqModel = this.getModel("request");
			if (oReqModel) {
				oReqModel.setData({ cuentaOrigen: null, importeSolicitud: null, importeSolicitudDisplay: "", cuentasFiltradas: [] });
			}
			const oInput = this.getView().byId("reqAmountInput");
			if (oInput) {
				oInput.setValueState("None");
				oInput.setValueStateText("");
			}
		},

		/**
		 * Validates simulation amount against the minimum threshold (10,000,000).
		 * Sets ValueState to "Error" with localized message if validation fails.
		 * Called after amount change to provide real-time feedback.
		 *
		 * @returns {void}
		 * @private
		 */
		_validateSimulationAmount: function () {
			const iMinAmount = 10000000;
			const oSimModel = this.getModel("simulation");
			const fAmount = Number(oSimModel.getProperty("/amount"));
			const oInput = this.getView().byId("simAmountInput");

			if (!oInput) {
				return;
			}

			if (!Number.isFinite(fAmount) || fAmount < iMinAmount) {
				oInput.setValueState("Error");
				const oNumFormat = NumberFormat.getFloatInstance({ decimals: 2, groupingEnabled: true });
				oInput.setValueStateText(this._getText("customReqMinAmount", [oNumFormat.format(iMinAmount)]));

				return;
			}

			oInput.setValueState("None");
			oInput.setValueStateText("");
		},

		/**
		 * Retrieves the selected source account balance from the request model.
		 * Reads request>/cuentaOrigen and finds the matching account in request>/cuentasFiltradas,
		 * returning its saldoInfoCent as a number.
		 * 
		 * Model paths read:
		 * - request>/cuentaOrigen: Selected account ID/key
		 * - request>/cuentasFiltradas: Array of {cuentaCorriente, saldoInfoCent, ...}
		 *
		 * @returns {number|null} Selected account balance as number, or null when no account is selected
		 * or the selected account cannot be found
		 * @private
		 */
		_getRequestSelectedAccountBalance: function () {
			const oReqModel = this.getModel("request");
			const sSelectedAccount = oReqModel.getProperty("/cuentaOrigen");
			const aAccounts = oReqModel.getProperty("/cuentasFiltradas") || [];

			if (!sSelectedAccount) {
				return null;
			}

			const oSelectedAccount = aAccounts.find(function (oAccount) {
				return oAccount.cuentaCorriente === sSelectedAccount;
			});

			if (!oSelectedAccount) {
				return null;
			}

			const fBalance = Number(oSelectedAccount.saldoInfoCent);
			return Number.isFinite(fBalance) ? fBalance : null;
		},

		/**
		 * Validates the Detail Request amount against multiple constraints.
		 * Reads amount from request>/importeSolicitud and checks:
		 * 1. Amount is finite and positive
		 * 2. Amount >= 10,000,000 (minimum)
		 * 3. Selected account has sufficient balance (>= requested amount)
		 * 4. Account is selected (not empty)
		 * 
		 * Returns empty validation result (valid=true) if amount field is empty,
		 * allowing user to submit without filling the amount field.
		 * 
		 * Model paths read:
		 * - request>/cuentaOrigen: Selected account ID
		 * - request>/importeSolicitud: Requested amount
		 * - request>/cuentasFiltradas: List of available accounts with balances
		 *
		 * @returns {{valid: boolean, amount?: number, messageKey?: string, messageArgs?: string[]}}
		 * Validation result object with:
		 * - valid: true if all checks pass
		 * - amount: parsed amount if valid
		 * - messageKey: i18n key for error message if invalid
		 * - messageArgs: placeholder values for i18n message
		 * @private
		 */
		_validateRequestAmount: function () {
			const iMinAmount = 10000000;
			const oNumFormat = NumberFormat.getFloatInstance({ decimals: 2, groupingEnabled: true });
			const oReqModel = this.getModel("request");
			const sSelectedAccount = oReqModel.getProperty("/cuentaOrigen");
			const fAmount = Number(oReqModel.getProperty("/importeSolicitud"));
			const fAccountBalance = this._getRequestSelectedAccountBalance();
			const bIsAmountEmpty = !oReqModel.getProperty("/importeSolicitud");

			if (bIsAmountEmpty) {
				return { valid: true, amount: fAmount };
			}

			if (!sSelectedAccount) {
				return { valid: false, messageKey: "reqSelectAccountFirst" };
			}

			if (!Number.isFinite(fAmount) || fAmount <= 0) {
				return { valid: false, messageKey: "customReqInvalidAmount" };
			}

			if (fAmount < iMinAmount) {
				return {
					valid: false,
					messageKey: "customReqMinAmount",
					messageArgs: [oNumFormat.format(iMinAmount)]
				};
			}

			if (fAccountBalance === null || fAmount > fAccountBalance) {
				return { valid: false, messageKey: "customReqInsufficientBalance" };
			}

			return { valid: true, amount: fAmount };
		},

		/**
		 * Clears request amount input validation state.
		 * Sets ValueState to "None" and clears ValueStateText.
		 * Called when user deselects account or on model reset.
		 *
		 * @returns {void}
		 * @private
		 */
		_clearRequestAmountValidation: function () {
			const oInput = this.getView().byId("reqAmountInput");
			if (oInput) {
				oInput.setValueState("None");
				oInput.setValueStateText("");
			}
		},

		/**
		 * Applies validation result to the request amount input control.
		 * Sets ValueState to "Error" with localized error message if validation failed.
		 * Returns boolean indicating whether validation passed.
		 *
		 * @param {{valid: boolean, messageKey?: string, messageArgs?: string[]}} oValidationResult - Result from _validateRequestAmount()
		 * @returns {boolean} true if validation passed, false otherwise
		 * @private
		 */
		_applyRequestAmountValidation: function (oValidationResult) {
			const oInput = this.getView().byId("reqAmountInput");

			if (!oInput) {
				return oValidationResult.valid;
			}

			if (!oValidationResult.valid) {
				oInput.setValueState("Error");
				oInput.setValueStateText(this.getResourceBundle().getText(oValidationResult.messageKey, oValidationResult.messageArgs));
				return false;
			}

			oInput.setValueState("None");
			oInput.setValueStateText("");
			return true;
		},

		/**
		 * Triggers validation of the request amount when user moves focus away from the input.
		 * Called by change event handler on request amount input.
		 *
		 * @returns {void}
		 * @public
		 */
		onRequestAmountChange: function () {
			const oValidationResult = this._validateRequestAmount();

			this._applyRequestAmountValidation(oValidationResult);
		},

		/**
		 * Public handler for simulation amount input liveChange event.
		 * Filters out invalid numeric characters in real-time while user types.
		 * Allows only digits and locale-specific thousand/decimal separators.
		 *
		 * @param {sap.ui.base.Event} oEvent Input liveChange event
		 * @returns {void}
		 * @public
		 */
		onSimAmountInputLiveChange: function (oEvent) {
			this._onAmountInputLiveChange(oEvent);
		},

		/**
		 * Public handler for simulation amount input change event.
		 * Parses user input, updates model with parsed number, formats display value,
		 * and triggers validation via _validateSimulationAmount.
		 * 
		 * Model paths updated:
		 * - simulation>/amount: Parsed numeric value
		 * - simulation>/amountDisplay: Formatted display string
		 *
		 * @param {sap.ui.base.Event} oEvent Input change event
		 * @returns {void}
		 * @public
		 */
		onSimAmountInputChange: function (oEvent) {
			this._onAmountInputChange(oEvent, "/amount", "/amountDisplay", "simulation", this._validateSimulationAmount);
		},

		/**
		 * Public handler for request amount input liveChange event.
		 * Filters out invalid numeric characters in real-time while user types.
		 * Allows only digits and locale-specific thousand/decimal separators.
		 *
		 * @param {sap.ui.base.Event} oEvent Input liveChange event
		 * @returns {void}
		 * @public
		 */
		onReqAmountInputLiveChange: function (oEvent) {
			this._onAmountInputLiveChange(oEvent);
		},

		/**
		 * Public handler for request amount input change event.
		 * Parses user input, updates model with parsed number, formats display value,
		 * and triggers validation via onRequestAmountChange.
		 * 
		 * Model paths updated:
		 * - request>/importeSolicitud: Parsed numeric value
		 * - request>/importeSolicitudDisplay: Formatted display string
		 *
		 * @param {sap.ui.base.Event} oEvent Input change event
		 * @returns {void}
		 * @public
		 */
		onReqAmountInputChange: function (oEvent) {
			this._onAmountInputChange(oEvent, "/importeSolicitud", "/importeSolicitudDisplay", "request", this.onRequestAmountChange);
		},

		/**
		 * Handles account selection change in the request form.
		 * Updates request>/cuentaOrigen with the selected account key.
		 * When account is deselected (empty), clears importeSolicitud and validation state.
		 * When account is selected, triggers validation of current amount if present.
		 * 
		 * Model paths updated:
		 * - request>/cuentaOrigen: Selected account ID (or empty string if deselected)
		 * - request>/importeSolicitud: Cleared to null if deselected
		 * - request>/importeSolicitudDisplay: Cleared to "" if deselected
		 *
		 * @param {sap.ui.base.Event} oEvent ComboBox selectionChange event
		 * @returns {void}
		 * @public
		 */
		onRequestAccountChange: function (oEvent) {
			const oReqModel = this.getModel("request");
			const sSelectedAccount = oEvent.getParameter("selectedItem")?.getKey() || "";

			oReqModel.setProperty("/cuentaOrigen", sSelectedAccount);

			if (!sSelectedAccount) {
				oReqModel.setProperty("/importeSolicitud", null);
				oReqModel.setProperty("/importeSolicitudDisplay", "");
				this._clearRequestAmountValidation();
				return;
			}

			this.onRequestAmountChange();
		},

		/**
		 * Filters available bank accounts by the currency of the selected rate/deposit.
		 * Reads currency_ID from the binding context and matches accounts from the banks model.
		 * Updates request>/cuentasFiltradas with filtered list of {banco, nombre, cuentaCorriente, saldoInfoCent, currency}.
		 * 
		 * Called after route match when in display mode (isDisplay=true).
		 *
		 * @returns {Promise<void>}
		 * @private
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
		 * Submits a deposit request after validation and user confirmation.
		 * Workflow:
		 * 1. Validate request amount and selected account
		 * 2. Build confirmation message with request details
		 * 3. Show MessageBox.confirm dialog
		 * 4. On YES: Create deposit record via OData /Deposits endpoint
		 * 5. Show success toast and update UI
		 * 
		 * Validations:
		 * - Account must be selected
		 * - Amount must be >= 10,000,000
		 * - Amount must be <= selected account balance
		 * 
		 * OData payload includes:
		 * - rateSnapshot_ID: Reference to selected rate/deposit product
		 * - amount: Requested amount
		 * - currency_ID, tenor_ID, rate: From binding context
		 * - startDate, maturityDate: Computed based on tenor
		 * - status: Set to 1 (pending)
		 *
		 * @returns {Promise<void>}
		 * @public
		 */
		onRequestDeposit: async function () {
			const oBundle = this.getResourceBundle();
			const oReqModel = this.getModel("request");
			const sSelectedAccount = oReqModel.getProperty("/cuentaOrigen");

			if (!sSelectedAccount) {
				MessageBox.error(oBundle.getText("reqSelectAccountFirst"));
				this._clearRequestAmountValidation();
				return;
			}

			const oCtx = this.getView().getBindingContext("mainService");
			const oBindedObject = oCtx.getObject();
			const sDescription = oBindedObject?.tenor?.description;
			const fRate = oBindedObject?.rate;
			const sTenor = oBindedObject?.tenor_ID;
			const sCurrency = oBindedObject?.currency_ID;
			const sRateGridID = oBindedObject?.ID;
			const oValidationResult = this._validateRequestAmount();

			if (!this._applyRequestAmountValidation(oValidationResult)) {
				MessageBox.error(oBundle.getText(oValidationResult.messageKey, oValidationResult.messageArgs));
				return;
			}

			const fImporte = oValidationResult.amount;

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

			this._openSignerSelectionDialog({
				confirmationText: sMsg,
				dialogTitle: oBundle.getText("requestConfirmTitle"),
				confirmButtonText: oBundle.getText("signerConfirmBtn"),
				payload: {
					rateSnapshot_ID: sRateGridID,
					amount: Number.parseFloat(fImporte.toFixed(2)),
					currency_ID: sCurrency,
					tenor_ID: sTenor,
					rate: fRate,
					startDate: sStartDate,
					maturityDate: sMaturityDate,
					status: 1
				},
				successMessageKey: "requestSuccessMsg",
				errorMessageKey: "requestErrorMsg",
				onSuccess: function () {
					this.handleClose();
				}
			});
		},

		/**
		 * Closes the detail view and navigates back to the deposits list.
		 * Uses the FlexibleColumnLayout layout manager to determine navigation state.
		 *
		 * @returns {void}
		 * @public
		 */
		handleClose: function () {
			const sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/closeColumn");
			this.oRouter.navTo("DepositsList", {
				layout: sNextLayout
			});
		},

		/**
		 * Copies simulation results (amount and currency) to the request form.
		 * Updates request model and triggers validation with the copied amount.
		 * Useful for users to quickly move from simulation to request submission.
		 * 
		 * Model paths updated:
		 * - request>/importeSolicitud: Copied from simulation>/amount
		 * - request>/importeSolicitudDisplay: Formatted version for display
		 *
		 * @returns {void}
		 * @public
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
			this.onRequestAmountChange();
		},

		// onCancelDeposit: function () {
		// 	const oBundle = this.getResourceBundle();
		// 	const oCtx = this.getView().getBindingContext("mainService");
		// 	const sDepositID = oCtx.getProperty("ID");
		// 	oCtx.delete().then(() => {
		// 		MessageToast.show("Deposit cancelled successfully.");
		// 	}).catch((oError) => {
		// 		console.error("Error cancelling deposit:", oError);
		// 		MessageBox.error("Error cancelling deposit.");
		// 	});
		// },

		// onTestUpdate: function () {
		// 	const oModel = this.getModel("mainService");
		// 	var oList = oModel.bindList("/Deposits");
		// 	oList.requestContexts(0, 20).then(function (aContexts) {
		// 		aContexts.forEach(function (oContext) {
		// 			var sClientID = oContext.getProperty("client_ID");
		// 			if (sClientID === "4c499ea9-1701-4cd7-aecb-62c433c56936") {
		// 				oContext.setProperty("createdBy", "john.doe@acciona.com");
		// 			} else { oContext.setProperty("createdBy", "x612238@gruposantander.com"); }
		// 		});
		// 	});
		// },

		/**
		 * Lifecycle hook called when the controller is destroyed.
		 * Detaches route pattern matching listener to prevent memory leaks.
		 *
		 * @returns {void}
		 * @public
		 */
		onExit: function () {
			this.oRouter.getRoute("DepositDetail").detachPatternMatched(this._onDepositMatched, this);
			this._destroySignerSelectionDialog();
		}
	});
});
