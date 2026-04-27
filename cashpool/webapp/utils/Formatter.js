sap.ui.define([
    "sap/ui/model/type/Currency"
], (Currency) => {
    "use strict";

    return {
        formatCurrency: function(monto, moneda) {
            const oCurrencyFormatter = new Currency({
                showMeasure: true,
                currencyCode: false
            });
            return oCurrencyFormatter.formatValue([monto, moneda], "string");
        },

        formatBankTitle: function(sNombre, aCuentas) {
            return sNombre + " (" + (aCuentas ? aCuentas.length : 0) + ")";
        }
    };
});
