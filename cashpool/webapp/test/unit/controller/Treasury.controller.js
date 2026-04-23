/*global QUnit*/

sap.ui.define([
	"cashpool/app/cashpool/controller/Treasury.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Treasury Controller");

	QUnit.test("I should test the Treasury controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
