sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/ui/core/routing/History"
], function (Controller, UIComponent, History) {
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
		 */
		navTo: function (sName, oParameters, bReplace) {
			this.getRouter().navTo(sName, oParameters, undefined, bReplace);
		},

		/**
		 * Convenience event handler for navigating back.
		 * It there is a history entry we go one step back in the browser history
		 * If not, it will replace the current entry of the browser history with the main route.
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
		 * 1W = 7 days; each monthly tenor uses 30 days per month.
		 * Shared across all controllers that perform tenor-based calculations.
		 */
		_DURATION_DAYS: {
			"1W": 7,
			"1M": 30, "2M": 60, "3M": 90, "4M": 120, "5M": 150, "6M": 180,
			"7M": 210, "8M": 240, "9M": 270, "10M": 300, "11M": 330, "12M": 360
		},

		/**
		 * Converts a tenor code string (e.g., "3M", "1W") to its numeric day value.
		 *
		 * @param {string} sTenorCode - The tenor code (e.g., "1W", "1M", "6M", "12M")
		 * @returns {number} The number of days represented by the tenor code
		 */
		_getTenorDays: function (sTenorCode) {
			return this._DURATION_DAYS[sTenorCode] || 30;
		}
	});
});
