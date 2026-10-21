sap.ui.define(["sap/ui/model/json/JSONModel", "sap/ui/model/BindingMode", "sap/ui/Device"], function (JSONModel, BindingMode, Device) {
	"use strict";

	return {
		createDeviceModel: function () {
			const oModel = new JSONModel(Device);
			oModel.setDefaultBindingMode(BindingMode.OneWay);
			return oModel;
		},
		createUserModel: function () {
			const oModel = new JSONModel(sap.ui.require.toUrl("custom/deposits/user-api/currentUser"));
			oModel.setDefaultBindingMode(BindingMode.OneWay);
			return oModel;
		}
	};
});
