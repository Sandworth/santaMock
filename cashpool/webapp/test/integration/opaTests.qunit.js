/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["cashpool/app/cashpool/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
