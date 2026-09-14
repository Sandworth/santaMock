sap.ui.define([
    "sap/ui/model/type/Currency",
    "sap/ui/core/format/DateFormat"
], (Currency, DateFormat) => {
    "use strict";

    return {
        formatCurrency: function(monto, moneda) {
            const oCurrencyFormatter = new Currency({
                showMeasure: true,
                currencyCode: false
            });
            return oCurrencyFormatter.formatValue([monto, moneda], "string");
        },
		dateTimeToDate: function (sDateTime) {
			if (!sDateTime) {
				return null;
			}
			var oDateFormat = DateFormat.getDateTimeWithTimezoneInstance({showTime: false, showTimezone: false});
			return oDateFormat.format(new Date(sDateTime));
		},        

        formatBankTitle: function(sNombre, aCuentas) {
            return sNombre + " (" + (aCuentas ? aCuentas.length : 0) + ")";
        }
    };
});
