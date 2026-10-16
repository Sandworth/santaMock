sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/f/FlexibleColumnLayoutSemanticHelper",
    "sap/f/library"
], function (UIComponent, JSONModel, FlexibleColumnLayoutSemanticHelper, fioriLibrary) {
    "use strict";

    return UIComponent.extend("custom.deposits.Component", {

        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Model to hold FCL layout state — start with OneColumn so FCL renders immediately
            var oModel = new JSONModel({ layout: "OneColumn" });
            this.setModel(oModel);

            var oRouter = this.getRouter();
            oRouter.attachBeforeRouteMatched(this._onBeforeRouteMatched, this);
            oRouter.initialize();
        },

        getHelper: function () {
            return this._getFcl().then(function (oFCL) {
                var oSettings = {
                    defaultTwoColumnLayoutType: fioriLibrary.LayoutType.TwoColumnsBeginExpanded,
                    defaultThreeColumnLayoutType: fioriLibrary.LayoutType.ThreeColumnsMidExpanded
                };
                return FlexibleColumnLayoutSemanticHelper.getInstanceFor(oFCL, oSettings);
            });
        },

        _onBeforeRouteMatched: function (oEvent) {
            var oModel = this.getModel();
            var sLayout = oEvent.getParameters().arguments.layout;

            if (!sLayout) {
                this.getHelper().then(function (oHelper) {
                    var oNextUIState = oHelper.getNextUIState(0);
                    oModel.setProperty("/layout", oNextUIState.layout);
                });
                return;
            }
            oModel.setProperty("/layout", sLayout);
        },

        _getFcl: function () {
            return new Promise(function (resolve) {
                var oRootControl = this.getRootControl();
                if (!oRootControl) {
                    // Root control not yet created (IAsyncContentCreation) — wait for it
                    this.rootControlLoaded().then(function () {
                        resolve(this.getRootControl().byId("flexibleColumnLayout"));
                    }.bind(this));
                    return;
                }
                var oFCL = oRootControl.byId("flexibleColumnLayout");
                if (!oFCL) {
                    oRootControl.attachAfterInit(function (oEvent) {
                        resolve(oEvent.getSource().byId("flexibleColumnLayout"));
                    });
                    return;
                }
                resolve(oFCL);
            }.bind(this));
        }
    });
});
