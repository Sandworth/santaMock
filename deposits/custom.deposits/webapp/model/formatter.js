sap.ui.define(["sap/ui/core/format/NumberFormat"], function (NumberFormat) {
	"use strict";

	return {
		formatValue: function (value) {
			return value && value.toUpperCase();
		},

		formatFloat: function (fValue) {
			if (fValue === null || fValue === undefined || fValue === 0) {
				return "";
			}
			var oFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				decimals: 2,
				maxFractionDigits: 2
			});
			return oFormat.format(fValue);
		},

		formatCurrency: function (fAmount, sCurrency) {
			if (fAmount === null || fAmount === undefined || !sCurrency) {
				return "";
			}
			var oFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				decimals: 2,
				maxFractionDigits: 2
			});
			return oFormat.format(fAmount) + " " + sCurrency;
		},

		// Suitability formatter  (Rate × DurationDays / 365)
		// Log-normalised to [0.5 – 5.0], rounded to nearest 0.5
		formatSuitability: function (fRate, iDuration) {
			if (fRate === undefined || fRate === null || !iDuration) {
				return 0;
			}

			var mDays = { 1: 31, 2: 61, 3: 91, 4: 122, 5: 152, 6: 182, 7: 213, 8: 243, 9: 273, 10: 304, 11: 334, 12: 365 };
			var iDays = mDays[parseInt(iDuration, 10)]; // handles "1M", "2M", etc.
			if (!iDays) { return 0; }

			// Reference min/max total-return values across all products
			// min: 1M @ lowest rate (2.45) → 2.45×31/365
			// max: 12M @ highest rate (4.05) → 4.05×365/365
			var fMin = 2.45 * 31 / 365;   // ≈ 0.2099
			var fMax = 4.05 * 365 / 365;   // = 4.05

			var fTotalReturn = fRate * iDays / 365;

			// Clamp to avoid log(0) or out-of-range values
			fTotalReturn = Math.max(fTotalReturn, fMin);

			var fScore = 0.5 + 4.5 * (Math.log(fTotalReturn) - Math.log(fMin))
				/ (Math.log(fMax) - Math.log(fMin));

			return fScore;
		}
	};
});
