sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], 
function (JSONModel, Device) {
    "use strict";

    return {
        /**
         * Create device model for responsive UI
         * 
         * Provides runtime information about the device the application is running on.
         * Enables responsive design decisions based on device type (desktop/tablet/phone).
         * 
         * @public
         * @function
         * @returns {sap.ui.model.json.JSONModel} Device information model with one-way binding mode
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        }
    };

});