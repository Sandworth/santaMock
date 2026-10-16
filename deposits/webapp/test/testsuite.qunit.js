sap.ui.define(function () {
	"use strict";

	return {
		name: "QUnit test suite for the UI5 Application: custom.deposits",
		defaults: {
			page: "ui5://test-resources/custom/deposits/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: {
				version: 2
			},
			sinon: {
				version: 1
			},
			ui5: {
				language: "EN",
				theme: "sap_horizon"
			},
			coverage: {
				only: "custom/deposits/",
				never: "test-resources/custom/deposits/"
			},
			loader: {
				paths: {
					"custom/deposits": "../"
				}
			}
		},
		tests: {
			"unit/unitTests": {
				title: "Unit tests for custom.deposits"
			},
			"integration/opaTests": {
				title: "Integration tests for custom.deposits"
			}
		}
	};
});
