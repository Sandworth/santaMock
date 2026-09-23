sap.ui.define([
  "sap/ui/core/mvc/Controller"
], (BaseController) => {
  "use strict";

  return BaseController.extend("cashpool.app.cashpool.controller.App", {
    /**
     * Initialize the root application controller
     * 
     * No specific initialization logic required at the root level.
     * Routing and model initialization is handled by the Component.js.
     * 
     * @public
     * @function
     */
    onInit: function () {
    }
  });
});