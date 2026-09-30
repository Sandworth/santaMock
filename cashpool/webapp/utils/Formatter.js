sap.ui.define([
    "sap/ui/model/type/Currency",
    "sap/ui/core/format/DateFormat"
], (Currency, DateFormat) => {
    "use strict";

    return {
        /**
         * Format currency amount with symbol
         * 
         * @public
         * @function
         * @param {number} monto - Numeric amount to format
         * @param {string} moneda - Currency code (e.g., "EUR", "USD")
         * @returns {string} Formatted currency string (e.g., "1,000.00 €")
         */
        formatCurrency: function(monto, moneda) {
            const oCurrencyFormatter = new Currency({
                showMeasure: true,
                currencyCode: false
            });
            return oCurrencyFormatter.formatValue([monto, moneda], "string");
        },

        /**
         * Format datetime to date string (remove time)
         * 
         * Converts ISO datetime to localized date string without time component.
         * 
         * @public
         * @function
         * @param {string} sDateTime - ISO datetime string
         * @returns {string|null} Formatted date string or null if input invalid
         */
		dateTimeToDate: function (sDateTime) {
			if (!sDateTime) {
				return null;
			}
			var oDateFormat = DateFormat.getDateTimeWithTimezoneInstance({showTime: false, showTimezone: false});
			return oDateFormat.format(new Date(sDateTime));
		},        

        /**
         * Format bank title with account count
         * 
         * @public
         * @function
         * @param {string} sNombre - Bank name
         * @param {Array} aCuentas - Array of account objects
         * @returns {string} Formatted title (e.g., "Santander (3)")
         */
        formatBankTitle: function(sNombre, aCuentas) {
            return sNombre + " (" + (aCuentas ? aCuentas.length : 0) + ")";
        }
    };
});
