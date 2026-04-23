sap.ui.define(() => {
	"use strict";

	return {
		name: "QUnit test suite for cashpool.app.cashpool",
		defaults: {
			page: "ui5://test-resources/cashpool/app/cashpool/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: {
				version: 2
			},
			sinon: {
				version: 4
			},
			ui5: {
				theme: "sap_horizon"
			},
			loader: {
				paths: {
					"cashpool/app/cashpool": "../"
				}
			}
		},
		tests: {
			"unit/unitTests": {
				title: "Unit tests for cashpool.app.cashpool"
			},
			"integration/opaTests": {
				title: "Integration tests for cashpool.app.cashpool"
			}
		}
	};
});