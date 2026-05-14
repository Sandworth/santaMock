sap.ui.define([
    "./BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("custom.deposits.controller.App", {

        onInit: function () {
            this.oOwnerComponent = this.getOwnerComponent();
            this.oRouter = this.getRouter();
            this.oRouter.attachRouteMatched(this.onRouteMatched, this);
        },

        onRouteMatched: function (oEvent) {
            const sRouteName = oEvent.getParameter("name");
            const oArguments = oEvent.getParameter("arguments");

            this._updateUIElements();

            this.currentRouteName = sRouteName;
            this.currentDepositKey = oArguments.key;
        },

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

        _updateUIElements: function () {
            const oModel = this.getModel();
            this.oOwnerComponent.getHelper().then(function (oHelper) {
                const oUIState = oHelper.getCurrentUIState();
                oModel.setData(oUIState);
            });
        },

        onExit: function () {
            this.oRouter.detachRouteMatched(this.onRouteMatched, this);
        }
    });
});
