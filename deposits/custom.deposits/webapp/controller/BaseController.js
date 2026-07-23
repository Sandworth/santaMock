sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/ui/core/routing/History",
	"sap/ui/core/format/NumberFormat",
	"sap/base/i18n/Localization"
], function (Controller, UIComponent, History, NumberFormat, Localization) {
	"use strict";

	return Controller.extend("custom.deposits.controller.BaseController", {
		/**
		 * Convenience method to get the components' router instance.
		 * @returns {sap.m.routing.Router} The router instance
		 */
		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the i18n resource bundle of the component.
		 * @returns {Promise<sap.base.i18n.ResourceBundle>} The i18n resource bundle of the component
		 */
		getResourceBundle: function () {
			const oModel = this.getOwnerComponent().getModel("i18n");
			return oModel.getResourceBundle();
		},

		/**
		 * Convenience method for getting the view model by name in every controller of the application.
		 * @param {string} [sName] The model name
		 * @returns {sap.ui.model.Model} The model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model in every controller of the application.
		 * @param {sap.ui.model.Model} oModel The model instance
		 * @param {string} [sName] The model name
		 * @returns {sap.ui.core.mvc.Controller} The current base controller instance
		 */
		setModel: function (oModel, sName) {
			this.getView().setModel(oModel, sName);
			return this;
		},

		/**
		 * Convenience method for triggering the navigation to a specific target.
		 * @public
		 * @param {string} sName Target name
		 * @param {object} [oParameters] Navigation parameters
		 * @param {boolean} [bReplace] Defines if the hash should be replaced (no browser history entry) or set (browser history entry)
		 * @returns {void}
		 */
		navTo: function (sName, oParameters, bReplace) {
			this.getRouter().navTo(sName, oParameters, undefined, bReplace);
		},

		/**
		 * Convenience event handler for navigating back.
		 * If there is a history entry we go one step back in the browser history.
		 * If not, it will replace the current entry of the browser history with the main route.
		 * @public
		 * @returns {void}
		 */
		onNavBack: function () {
			const sPreviousHash = History.getInstance().getPreviousHash();
			if (sPreviousHash !== undefined) {
				window.history.go(-1);
			} else {
				this.getRouter().navTo("main", {}, undefined, true);
			}
		},

		/**
		 * Maps tenor code strings to their equivalent number of days.
		 * Used across all controllers for tenor-based calculations (rates, maturity dates, interest computation).
		 * 
		 * Mapping rules:
		 * - "1W": 7 days (week)
		 * - "1M" to "12M": 30-360 days (months, using 30-day convention)
		 * 
		 * @type {Object<string, number>}
		 * @constant
		 */
		_DURATION_DAYS: {
			"1W": 7,
			"1M": 30, "2M": 60, "3M": 90, "4M": 120, "5M": 150, "6M": 180,
			"7M": 210, "8M": 240, "9M": 270, "10M": 300, "11M": 330, "12M": 360
		},

		/**
		 * Converts a tenor code string (e.g., "3M", "1W") to its numeric day value.
		 * Used for rate interpolation, maturity date calculation, and interest computation.
		 *
		 * @param {string} sTenorCode - The tenor code (e.g., "1W", "1M", "6M", "12M")
		 * @returns {number} The number of days represented by the tenor code. Defaults to 30 if code not found.
		 * @private
		 */
		_getTenorDays: function (sTenorCode) {
			return this._DURATION_DAYS[sTenorCode] || 30;
		},

		/**
		 * Gets the current UI5 locale from the ResourceBundle.
		 * Returns the first two characters (language code) in lowercase.
		 * 
		 * Example transformations:
		 * - "es_ES" → "es"
		 * - "en_US" → "en"
		 * - "fr_FR" → "fr"
		 * 
		 * Falls back to "en" if locale cannot be determined.
		 *
		 * @returns {string} Locale code in lowercase ("es", "en", "fr", etc.)
		 * @private
		 */
		_getLocale: function () {
			const oResourceBundle = this.getResourceBundle();
			const sLocale = oResourceBundle.sLocale || Localization.getLanguage();
			return (sLocale || "en").toLowerCase().substring(0, 2);
		},

		/**
		 * Gets the decimal and thousand separators for the current locale.
		 * Critical for parsing and formatting numeric input across different regions.
		 * 
		 * Locale mappings:
		 * - ES (Spanish): decimal = ",", thousand = "." → 10.000.000,25
		 * - EN (English): decimal = ".", thousand = "," → 10,000,000.25
		 * - Other locales: defaults to EN format
		 *
		 * @returns {{decimal: string, thousand: string}} Object containing locale separators
		 * @private
		 */
		_getLocaleSettings: function () {
			const sLocale = this._getLocale();
			return sLocale === "es" 
				? { decimal: ",", thousand: "." } 
				: { decimal: ".", thousand: "," };
		},

		/**
		 * Creates a regex pattern that allows only digits and locale-specific separators.
		 * Used in liveChange handlers to filter invalid input characters in real-time.
		 * 
		 * Allowed characters:
		 * - Digits: 0-9
		 * - Thousand separator: . or ,
		 * - Decimal separator: . or ,
		 * - Whitespace: spaces
		 *
		 * @returns {RegExp} Pattern for filtering input characters
		 * @private
		 */
		_getNumericRegex: function () {
			return /^[0-9,\.\s]*$/;
		},

		/**
		 * Parses user input string to a JavaScript number, handling locale-specific separators.
		 * Normalizes the input by removing thousand separators and converting decimal separator to JS standard (dot).
		 * 
		 * Example conversions:
		 * - ES: "10.000.000,25" → 10000000.25
		 * - EN: "20,000,000.25" → 20000000.25
		 * - Mixed: "1000,5" (ES locale) → 1000.5
		 *
		 * @param {string} sInput Raw user input (may contain thousand/decimal separators)
		 * @returns {number} Parsed number (JavaScript standard), or NaN if input is invalid or empty
		 * @private
		 */
		_parseUserInput: function (sInput) {
			if (!sInput || typeof sInput !== "string") {
				return NaN;
			}

			const { decimal, thousand } = this._getLocaleSettings();
			let sNormalized = sInput.trim();

			// Remove thousand separators
			sNormalized = sNormalized.split(thousand).join("");

			// Replace decimal separator with JS standard
			sNormalized = sNormalized.replace(decimal, ".");

			return Number(sNormalized);
		},

		/**
		 * Formats a number to a locale-specific string with thousand separators and decimals.
		 * Used to display parsed amounts back to the user in their preferred format.
		 * 
		 * Example conversions:
		 * - ES: 10000000.25 → "10.000.000,25"
		 * - EN: 10000000.25 → "10,000,000.25"
		 * - Always displays 2 decimal places
		 *
		 * @param {number} fNumber The number to format
		 * @returns {string} Locale-formatted string with thousand separators and decimals, or empty string if input is invalid
		 * @private
		 */
		_formatNumber: function (fNumber) {
			if (!Number.isFinite(fNumber)) {
				return "";
			}

			const oNumFormat = NumberFormat.getFloatInstance({
				decimals: 2,
				groupingEnabled: true
			});
			return oNumFormat.format(fNumber);
		},

		/**
		 * Handles liveChange events on numeric inputs to filter invalid characters in real-time.
		 * Allows only digits (0-9) and locale-specific thousand/decimal separators.
		 * Invalid characters are silently removed as the user types.
		 * 
		 * Used on:
		 * - Simulation amount input (onSimAmountInputLiveChange)
		 * - Request amount input (onReqAmountInputLiveChange)
		 * - Custom Request amount input (onCustomReqAmountInputLiveChange)
		 *
		 * @param {sap.ui.base.Event} oEvent Input liveChange event
		 * @returns {void}
		 * @private
		 */
		_onAmountInputLiveChange: function (oEvent) {
			const oInput = oEvent.getSource();
			const sRawValue = oInput.getValue();
			const oRegex = this._getNumericRegex();

			// If input contains invalid characters, remove them
			if (!oRegex.test(sRawValue)) {
				const sFiltered = sRawValue.split("").filter(function (sChar) {
					return /[0-9,.\s]/.test(sChar);
				}).join("");
				oInput.setValue(sFiltered);
			}
		},

		/**
		 * Retrieves a translated text from the i18n resource bundle.
		 * Supports placeholder replacement for dynamic text content.
		 *
		 * @param {string} sKey - The i18n key (e.g., "customReqMinAmount", "requestConfirmTitle")
		 * @param {Array<string>} [aArgs] - Optional placeholder replacement values for the i18n string
		 * @returns {string} The translated and formatted text
		 * @private
		 */
		_getText: function (sKey, aArgs) {
			return this.getResourceBundle().getText(sKey, aArgs);
		},

		/**
		 * Handles change events on numeric inputs to parse, format, and validate amounts.
		 * Core logic for both simulation and request amount inputs.
		 * 
		 * Workflow:
		 * 1. Reads raw input value from the control
		 * 2. Parses using locale-specific separators via _parseUserInput()
		 * 3. If invalid/empty, clears model and input
		 * 4. If valid:
		 *    a. Stores parsed number in model at sModelPath
		 *    b. Formats and displays it back in input for visual feedback
		 *    c. Updates sDisplayPath in model with formatted string
		 *    d. Calls optional validation callback
		 * 
		 * Used on:
		 * - Simulation amount input (onSimAmountInputChange)
		 * - Request amount input (onReqAmountInputChange)
		 * - Custom Request amount input (onCustomReqAmountInputChange)
		 *
		 * @param {sap.ui.base.Event} oEvent Input change event
		 * @param {string} sModelPath Path in model to store parsed number (e.g., "/amount", "/importeSolicitud")
		 * @param {string} sDisplayPath Path in model to store formatted display value (e.g., "/amountDisplay", "/importeSolicitudDisplay")
		 * @param {string} sModelName Model name containing above paths (e.g., "simulation", "request", "customRequest")
		 * @param {Function} [fnCallback] Optional validation callback to execute after formatting. Called with controller context (this).
		 * @returns {void}
		 * @private
		 */
		_onAmountInputChange: function (oEvent, sModelPath, sDisplayPath, sModelName, fnCallback) {
			const oInput = oEvent.getSource();
			const sRawValue = oInput.getValue();
			const oModel = this.getModel(sModelName);

			if (!oModel || !sModelPath) {
				return;
			}

			// Parse user input to number
			const fParsedValue = this._parseUserInput(sRawValue);

			if (!Number.isFinite(fParsedValue) || fParsedValue <= 0) {
				// Invalid input: clear both model and display
				oModel.setProperty(sModelPath, null);
				if (sDisplayPath) {
					oModel.setProperty(sDisplayPath, "");
				}
				oInput.setValue("");
				return;
			}

			// Update model with parsed number
			oModel.setProperty(sModelPath, fParsedValue);

			// Format and display in input for visual feedback
			const sFormatted = this._formatNumber(fParsedValue);
			if (sDisplayPath) {
				oModel.setProperty(sDisplayPath, sFormatted);
			}
			oInput.setValue(sFormatted);

			// Trigger optional callback (e.g., validation) with the context of the caller
			if (fnCallback && typeof fnCallback === "function") {
				fnCallback.call(this);
			}
		}
	});
});
