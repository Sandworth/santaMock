sap.ui.define([
    "./BaseController"
], function (BaseController) {
    "use strict";

    /**
     * Controller for the root App view.
     * Manages the FlexibleColumnLayout (FCL) state in response to route changes
     * and user interaction with the FCL column navigation arrows.
     * Acts as the "shell" controller coordinating the overall page layout.
     *
     * @class custom.deposits.controller.App
     * @extends custom.deposits.controller.BaseController
     */
    return BaseController.extend("custom.deposits.controller.App", {

        /**
         * Lifecycle hook called when the controller is initialized.
         * Caches component and router references. Attaches a routeMatched listener
         * to update the FCL layout state whenever a route is activated.
         *
         * @returns {void}
         * @public
         */
        onInit: function () {
            this.oOwnerComponent = this.getOwnerComponent();
            this.oRouter = this.getRouter();
            this.oRouter.attachRouteMatched(this.onRouteMatched, this);
        },

        /**
         * Handles routeMatched events from the router.
         * Extracts the route name and deposit key from the matched route arguments,
         * updates the FCL UI elements, and stores current route info for potential
         * arrow-navigation re-routing.
         *
         * @param {sap.ui.base.Event} oEvent - The routeMatched event containing route name and arguments
         * @returns {void}
         * @public
         */
        onRouteMatched: function (oEvent) {
            const sRouteName = oEvent.getParameter("name");
            const oArguments = oEvent.getParameter("arguments");

            this._updateUIElements();

            this.currentRouteName = sRouteName;
            this.currentDepositKey = oArguments.key;
        },

        /**
         * Handles the FCL stateChange event fired when the user clicks a column
         * navigation arrow (expand/collapse). Updates UI elements and, if triggered
         * by a navigation arrow, re-navigates to the current route with the new layout
         * value so the URL stays in sync with the visual state.
         *
         * @param {sap.ui.base.Event} oEvent - The stateChange event with layout and isNavigationArrow parameters
         * @returns {void}
         * @public
         */
        onStateChanged: function (oEvent) {
            const bIsNavigationArrow = oEvent.getParameter("isNavigationArrow");
            const sLayout = oEvent.getParameter("layout");

            this._updateUIElements();

            if (bIsNavigationArrow) {
                this.oRouter.navTo(this.currentRouteName, {
                    layout: sLayout,
                    key: this.currentDepositKey
                }, true);
            }
        },

        /**
         * Fetches the current FCL UI state from the semantic helper (which columns are
         * visible, which action buttons to show) and writes it into the unnamed JSON model.
         * This model is consumed by close/fullscreen buttons in views.
         *
         * @returns {void}
         * @private
         */
        _updateUIElements: function () {
            const oModel = this.getModel();
            this.oOwnerComponent.getHelper().then(function (oHelper) {
                const oUIState = oHelper.getCurrentUIState();
                oModel.setData(oUIState);
            });
        },

        /**
         * Lifecycle hook called when the controller is destroyed.
         * Detaches the routeMatched listener to prevent memory leaks.
         *
         * @returns {void}
         * @public
         */
        onExit: function () {
            this.oRouter.detachRouteMatched(this.onRouteMatched, this);
        }
    });
});
