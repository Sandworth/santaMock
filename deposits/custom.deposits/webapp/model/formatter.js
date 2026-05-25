sap.ui.define(["sap/ui/core/format/NumberFormat"], function (NumberFormat) {
	"use strict";

	return {
		/**
		 * Converts a value to uppercase.
		 * @param {string} value - The value to convert
		 * @returns {string|undefined} The uppercase value, or undefined if input is null/falsy
		 */
		formatValue: function (value) {
			return value && value.toUpperCase();
		},

		/**
		 * Formats a floating-point number with grouping separators and 2 decimal places.
		 * @param {number} fValue - The number to format
		 * @returns {string} The formatted number string, or empty string if value is null, undefined, or 0
		 */
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

		/**
		 * Formats a currency amount with grouping separators, 2 decimal places, and currency code.
		 * @param {number} fAmount - The amount to format
		 * @param {string} sCurrency - The currency code (e.g., "USD", "EUR")
		 * @returns {string} The formatted amount with currency code (e.g., "1,234.56 USD"), or empty string if amount or currency is invalid
		 */
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

		/**
		 * Calculates a suitability score based on interest rate and duration.
		 * Uses logarithmic normalization to scale the result to [0.5 – 5.0] range.
		 * Formula: Score = 0.5 + 4.5 × (log(totalReturn) - log(min)) / (log(max) - log(min))
		 * where totalReturn = Rate × DurationDays / 365
		 * @param {number} fRate - The interest rate (e.g., 2.45, 4.05)
		 * @param {number|string} iDuration - The duration code (1-12, representing months: 1=30 days, 2=60 days, etc.)
		 * @returns {number} The suitability score clamped to [0.5 – 5.0] range, or 0 if parameters are invalid
		 */
		formatSuitability: function (fRate, iDuration) {
			if (fRate === undefined || fRate === null || !iDuration) {
				return 0;
			}

			var mDays = { 1: 30, 2: 60, 3: 90, 4: 120, 5: 150, 6: 180, 7: 210, 8: 240, 9: 270, 10: 300, 11: 330, 12: 360 };
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
