sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/ui/model/json/JSONModel",
	"sap/m/p13n/Engine",
	"sap/m/p13n/SelectionController",
	"sap/m/p13n/SortController",
	"sap/m/p13n/GroupController",
	"sap/m/p13n/MetadataHelper",
	"sap/m/table/ColumnWidthController",
	"sap/ui/comp/smartvariants/PersonalizableInfo",
	"sap/ui/comp/valuehelpdialog/ValueHelpDialog",
	"sap/ui/model/type/Float",
	"sap/m/Token",
	"sap/m/ColumnListItem",
	"sap/m/ObjectIdentifier",
	"sap/m/ObjectNumber",
	"sap/m/Text",
	"sap/m/RatingIndicator",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment",
	"sap/ui/core/format/NumberFormat",
	"../model/formatter"
], function (
	BaseController,
	Filter,
	FilterOperator,
	Sorter,
	JSONModel,
	Engine,
	SelectionController,
	SortController,
	GroupController,
	MetadataHelper,
	ColumnWidthController,
	PersonalizableInfo,
	ValueHelpDialog,
	FloatType,
	Token,
	ColumnListItem,
	ObjectIdentifier,
	ObjectNumber,
	MText,
	RatingIndicator,
	MessageBox,
	MessageToast,
	Fragment,
	NumberFormat,
	Formatter
) {
	"use strict";

	/**
	 * Controller for the Deposits List view.
	 * Manages filtering, sorting, grouping, personalization (p13n), navigation,
	 * and the Custom Deposit Request dialog workflow.
	 *
	 * @class custom.deposits.controller.DepositsList
	 * @extends custom.deposits.controller.BaseController
	 */
	return BaseController.extend("custom.deposits.controller.DepositsList", {

		/**
		 * Lifecycle hook called when the controller is initialized.
		 * Sets up control references, models, SmartVariantManagement, FilterBar,
		 * p13n Engine registration, default sorters, and router.
		 */
		onInit: function () {
			this.oView = this.getView();

			// Cache control references
			this.oSmartVariantManagement = this.oView.byId("svm");
			this.oExpandedLabel          = this.oView.byId("expandedLabel");
			this.oSnappedLabel           = this.oView.byId("snappedLabel");
			this.oFilterBar              = this.oView.byId("filterBar");
			this.oTable                  = this.oView.byId("depositsTable");

			// Initialize customRequest model for Custom Deposit Dialog
			this._initCustomRequestModel();

			// Initialize banks model for account selection in Custom Deposit Dialog
			this._initBanksModel();

			// Tenor code to months mapping for calculations
			this._DURATION_MONTHS = {
				"1M": 1, "2M": 2, "3M": 3, "4M": 4, "5M": 5, "6M": 6,
				"7M": 7, "8M": 8, "9M": 9, "10M": 10, "11M": 11, "12M": 12
			};

			// ----- SmartVariantManagement / FilterBar setup -----
			this.applyData             = this.applyData.bind(this);
			this.fetchData             = this.fetchData.bind(this);
			this.getFiltersWithValues  = this.getFiltersWithValues.bind(this);

			this.oFilterBar.registerFetchData(this.fetchData);
			this.oFilterBar.registerApplyData(this.applyData);
			this.oFilterBar.registerGetFiltersWithValues(this.getFiltersWithValues);

			const oPersInfo = new PersonalizableInfo({
				type:       "filterBar",
				keyName:    "persistencyKey",
				dataSource: "",
				control:    this.oFilterBar
			});
			this.oSmartVariantManagement.addPersonalizableControl(oPersInfo);
			this.oSmartVariantManagement.initialise(function () {}, this.oFilterBar);

			// ----- p13n Engine setup -----
			this._registerForP13n();

			// Default sort: EUR → USD → GBP, then by tenor order
			this._aDefaultSorters = [
				new Sorter("to_CurrencyCode/order"),
				new Sorter("to_TenorCode/order")
			];

			// Router
			this.oRouter = this.getRouter();
		},

		// -------------------------------------------------------
		// FilterBar — persistence callbacks
		// -------------------------------------------------------

		/**
		 * Serializes the current state of all filter controls for variant persistence.
		 * Called by the FilterBar when saving a variant.
		 *
		 * @returns {Array<{groupName: string, fieldName: string, fieldData: *}>} Array of filter field data objects
		 */
		fetchData: function () {
			const that = this;
			return this.oFilterBar.getAllFilterItems().reduce(function (aResult, oFilterItem) {
				const oControl = oFilterItem.getControl();
				var value;
				if (oFilterItem.getName() === "Rate") {
					// Serialize token range data — the Input value is only display text
					value = (that._aRateTokens || []).map(function (oToken) {
						return { text: oToken.getText(), range: oToken.data("range") };
					});
				} else if (oControl.getSelectedKeys) {
					value = oControl.getSelectedKeys();
				} else if (oControl.getSelectedKey) {
					value = oControl.getSelectedKey();
				} else if (oControl.getValue) {
					value = oControl.getValue();
				} else {
					value = null;
				}
				aResult.push({
					groupName: oFilterItem.getGroupName(),
					fieldName: oFilterItem.getName(),
					fieldData: value
				});
				return aResult;
			}, []);
		},

		/**
		 * Restores filter control states from previously serialized variant data.
		 * Called by the FilterBar when loading a variant.
		 *
		 * @param {Array<{groupName: string, fieldName: string, fieldData: *}>} aData - Array of filter field data objects
		 */
		applyData: function (aData) {
			aData.forEach(function (oDataObject) {
				const oControl = this.oFilterBar.determineControlByName(oDataObject.fieldName, oDataObject.groupName);
				if (!oControl) { return; }
				if (oDataObject.fieldName === "Rate") {
					// Restore tokens from serialized range objects
					const aSerialised = Array.isArray(oDataObject.fieldData) ? oDataObject.fieldData : [];
					this._aRateTokens = aSerialised.map(function (oEntry) {
						const oToken = new Token({ text: oEntry.text });
						oToken.data("range", oEntry.range);
						return oToken;
					});
					oControl.setValue(
						this._aRateTokens.map(function (t) { return t.getText(); }).join(", ")
					);
				} else if (oControl.setSelectedKeys) {
					oControl.setSelectedKeys(oDataObject.fieldData);
				} else if (oControl.setSelectedKey) {
					oControl.setSelectedKey(oDataObject.fieldData);
				} else if (oControl.setValue) {
					oControl.setValue(oDataObject.fieldData);
				}
			}, this);
		},

		/**
		 * Returns all filter group items that currently have a value set.
		 * Used by SmartVariantManagement to determine active filters.
		 *
		 * @returns {sap.ui.comp.filterbar.FilterGroupItem[]} Array of filter group items with values
		 */
		getFiltersWithValues: function () {
			return this.oFilterBar.getFilterGroupItems().reduce(function (aResult, oFilterGroupItem) {
				const oControl = oFilterGroupItem.getControl();
				var bHasValue = false;
				if (oControl) {
					if (oControl.getSelectedKeys && oControl.getSelectedKeys().length > 0) {
						bHasValue = true;
					} else if (oControl.getSelectedKey && oControl.getSelectedKey() !== "") {
						bHasValue = true;
					} else if (oControl.getValue && oControl.getValue() !== "") {
						bHasValue = true;
					}
				}
				if (bHasValue) {
					aResult.push(oFilterGroupItem);
				}
				return aResult;
			}, []);
		},

		// -------------------------------------------------------
		// FilterBar — search & change handlers
		// -------------------------------------------------------

		/**
		 * Handles selection change in filter controls.
		 * Marks the current variant as modified and triggers a filter change event.
		 *
		 * @param {sap.ui.base.Event} oEvent - The selection change event
		 */
		onSelectionChange: function (oEvent) {
			this.oSmartVariantManagement.currentVariantSetModified(true);
			this.oFilterBar.fireFilterChange(oEvent);
		},

		/**
		 * Executes the filter search by building Filter objects from all active filter controls
		 * (Duration, Currency, Rate) and applying them to the table binding.
		 */
		onSearch: function () {
			const aTableFilters = [];

			// Duration (MultiComboBox — filters on to_TenorCode/Code)
			const oDurationCtrl = this.oView.byId("filterDuration");
			const aDurations = oDurationCtrl ? oDurationCtrl.getSelectedKeys() : [];
			if (aDurations.length > 0) {
				const aDurFilters = aDurations.map(function (sKey) {
					return new Filter("to_TenorCode/Code", FilterOperator.EQ, sKey);
				});
				aTableFilters.push(new Filter({ filters: aDurFilters, and: false }));
			}

			// Currency (MultiComboBox)
			const oCurrencyCtrl = this.oView.byId("filterCurrency");
			const aCurrencies = oCurrencyCtrl ? oCurrencyCtrl.getSelectedKeys() : [];
			if (aCurrencies.length > 0) {
				const aCurFilters = aCurrencies.map(function (sKey) {
					return new Filter("Currency", FilterOperator.EQ, sKey);
				});
				aTableFilters.push(new Filter({ filters: aCurFilters, and: false }));
			}

			// Rate (ValueHelpDialog tokens — range data stored as custom data on each token)
			if (this._aRateTokens && this._aRateTokens.length > 0) {
				const aRateFilters = this._aRateTokens.map(function (oToken) {
					const oRange = oToken.data("range");
					var oFilter;
					if (oRange.operation === "BT") {
						oFilter = new Filter("Rate", FilterOperator.BT, parseFloat(oRange.value1), parseFloat(oRange.value2));
					} else {
						oFilter = new Filter("Rate", oRange.operation, parseFloat(oRange.value1));
					}
					if (oRange.exclude) {
						oFilter = new Filter({ filters: [oFilter], and: true, not: true });
					}
					return oFilter;
				});
				aTableFilters.push(aRateFilters.length === 1
					? aRateFilters[0]
					: new Filter({ filters: aRateFilters, and: false }));
			}

			this.oTable.getBinding("items").filter(aTableFilters);
			this.oTable.setShowOverlay(false);
			this._updateLabelsAndTable(false);
		},

		/**
		 * Handles filter change events from the FilterBar.
		 * Shows the table overlay unless filters are being cleared programmatically.
		 */
		onFilterChange: function () {
			if (this._bClearing) { return; }
			this._updateLabelsAndTable(true);
		},

		/**
		 * Called after a variant is loaded. Updates labels and shows the table overlay.
		 */
		onAfterVariantLoad: function () {
			this._updateLabelsAndTable(true);
		},

		/**
		 * Clears all active filters, resets filter controls to their default state,
		 * removes table filters, and updates the UI labels.
		 */
		onClearFilters: function () {
			// Reset all filter controls
			const oDurationCtrl = this.oView.byId("filterDuration");
			if (oDurationCtrl) { oDurationCtrl.setSelectedKeys([]); }
			const oCurrencyCtrl = this.oView.byId("filterCurrency");
			if (oCurrencyCtrl) { oCurrencyCtrl.setSelectedKeys([]); }
			const oRateCtrl = this.oView.byId("filterRate");
			if (oRateCtrl) { oRateCtrl.setValue(""); }
			this._aRateTokens = [];

			this.oTable.getBinding("items").filter([]);
			this.oTable.setShowOverlay(false);
			this._bClearing = true;
			this.oFilterBar.fireFilterChange();
			this._bClearing = false;
			this._updateLabelsAndTable(false);
		},

		/**
		 * Expands the page header when the filter info toolbar is pressed.
		 */
		onFilterInfoPress: function () {
			this.oView.byId("listPage").setHeaderExpanded(true);
		},

		/**
		 * Opens a ValueHelpDialog for the Rate filter field, allowing the user
		 * to define numeric range conditions (e.g., between, greater than).
		 * Tokens are stored internally and displayed as text in the filter input.
		 */
		onRateValueHelpRequest: function () {
			const that = this;
			const oVHD = new ValueHelpDialog({
				title: this._getText("filterRate"),
				supportRanges: true,
				supportRangesOnly: true,
				key: "Rate",
				maxConditions: 1,
				descriptionKey: "Rate",
				ok: function (oEvent) {
					const aTokens = oEvent.getParameter("tokens");
					that._aRateTokens = aTokens;

					// Update the Input with a human-readable summary
					const oRateInput = that.oView.byId("filterRate");
					if (aTokens.length === 0) {
						oRateInput.setValue("");
					} else {
						oRateInput.setValue(aTokens.map(function (t) { return t.getText(); }).join(", "));
					}

					oVHD.close();
					that.oSmartVariantManagement.currentVariantSetModified(true);
					that.oFilterBar.fireFilterChange();
				},
				cancel: function () {
					oVHD.close();
				},
				afterClose: function () {
					oVHD.destroy();
				}
			});

			oVHD.setRangeKeyFields([{
				label: this._getText("filterRate"),
				key: "Rate",
				type: "numeric",
				typeInstance: new FloatType({ decimals: 2 }, { minimum: 0 })
			}]);

			this.getView().addDependent(oVHD);

			if (this._aRateTokens && this._aRateTokens.length > 0) {
				oVHD.setTokens(this._aRateTokens);
			}

			oVHD.open();
		},

		/**
		 * Updates the expanded/snapped filter labels with the count of active filters
		 * and optionally shows the table overlay to indicate pending search.
		 *
		 * @param {boolean} bShowOverlay - Whether to show the table overlay
		 * @private
		 */
		_updateLabelsAndTable: function (bShowOverlay) {
			const aFiltersWithValues = this.oFilterBar.retrieveFiltersWithValues();
			var sText;

			if (aFiltersWithValues.length === 0) {
				sText = this._getText("noFiltersActive");
			} else {
				sText = this._getText("filtersActive", [aFiltersWithValues.length]);
				const aNonVisible = this.oFilterBar.retrieveNonVisibleFiltersWithValues();
				if (aNonVisible && aNonVisible.length > 0) {
					sText += " " + this._getText("filtersHidden", [aNonVisible.length]);
				}
			}

			this.oExpandedLabel.setText(sText);
			this.oSnappedLabel.setText(sText);

			if (bShowOverlay) {
				this.oTable.setShowOverlay(true);
			}

			// Show/hide info toolbar
			// var oInfoToolbar = this.oView.byId("filterInfo");
			// var oInfoText    = this.oView.byId("filterInfoText");
			// if (oInfoToolbar && oInfoText) {
			// 	oInfoToolbar.setVisible(aFiltersWithValues.length > 0);
			// 	oInfoText.setText(sText);
			// }
		},

		/**
		 * Handles the table's updateFinished event to refresh the table title
		 * with the current total item count.
		 *
		 * @param {sap.ui.base.Event} oEvent - The updateFinished event
		 */
		onTableUpdateFinished: function (oEvent) {
			const iTotal = oEvent.getParameter("total");
			const oTitle = this.oView.byId("tableTitle");
			if (oTitle) {
				oTitle.setText(this._getText("listTitle", [iTotal]));
			}
		},

		/**
		 * Retrieves a translated text from the resource bundle.
		 *
		 * @param {string} sKey - The i18n key
		 * @param {Array<string>} [aArgs] - Optional placeholder replacement values
		 * @returns {string} The translated text
		 * @private
		 */
		_getText: function (sKey, aArgs) {
			return this.getResourceBundle().getText(sKey, aArgs);
		},

		// -------------------------------------------------------
		// Navigation
		// -------------------------------------------------------

		/**
		 * Navigates to the Deposit Detail view when a list item is pressed.
		 * Uses the FlexibleColumnLayout helper to determine the next UI state.
		 *
		 * @param {sap.ui.base.Event} oEvent - The list item press event
		 */
		onListItemPress: function (oEvent) {
			const oContext = oEvent.getSource().getBindingContext("mainService");
			const sKey = oContext.getProperty("UUID");

			this.getOwnerComponent().getHelper().then(function (oHelper) {
				const oNextUIState = oHelper.getNextUIState(1);
				this.oRouter.navTo("DepositDetail", {
					layout: oNextUIState.layout,
					key:    sKey
				});
			}.bind(this));
		},

		// -------------------------------------------------------
		// p13n Engine
		// -------------------------------------------------------

		/**
		 * Registers the deposits table with the p13n Engine for personalization support
		 * (column visibility, sorting, grouping, and column width).
		 *
		 * @private
		 */
		_registerForP13n: function () {
			const oTable = this.oTable;

			this.oMetadataHelper = new MetadataHelper([
				{ key: "name_col",        label: this._getText("lblName"),        path: "Name" },
				{ key: "duration_col",    label: this._getText("lblDuration"),    path: "to_TenorCode/Description" },
				{ key: "currency_col",    label: this._getText("lblCurrency"),    path: "to_CurrencyCode/Description" },
				{ key: "rate_col",        label: this._getText("lblRate"),        path: "Rate" },
				{ key: "suitability_col", label: this._getText("lblSuitability"), path: "Suitability" }
			]);

			Engine.getInstance().register(oTable, {
				helper: this.oMetadataHelper,
				controller: {
					Columns:  new SelectionController({ targetAggregation: "columns", control: oTable }),
					Sorter:   new SortController({ control: oTable }),
					Groups:   new GroupController({ control: oTable }),
					ColumnWidth: new ColumnWidthController({ control: oTable })
				}
			});

			Engine.getInstance().attachStateChange(this.onP13nStateChange, this);
		},

		/**
		 * Opens the p13n settings dialog for column, sort, and group configuration.
		 */
		onOpenSettings: function () {
			Engine.getInstance().show(this.oTable, ["Columns", "Sorter", "Groups"]);
		},

		/**
		 * Prepares the column header menu before opening by setting the sort and group
		 * item keys/labels based on the triggering column.
		 *
		 * @param {sap.ui.base.Event} oEvent - The beforeOpen event from the column menu
		 */
		onBeforeOpenColumnMenu: function (oEvent) {
			const oMenu = this.oView.byId("columnMenu");
			const oColumn = oEvent.getParameter("openBy");
			const oSortItem  = oMenu.getQuickActions()[0].getItems()[0];
			const oGroupItem = oMenu.getQuickActions()[1].getItems()[0];

			oSortItem.setKey(this._getKey(oColumn));
			oSortItem.setLabel(oColumn.getHeader().getText());
			oGroupItem.setKey(this._getKey(oColumn));
			oGroupItem.setLabel(oColumn.getHeader().getText());
		},

		/**
		 * Handles column sort requests from the column menu.
		 * Updates the p13n Engine state with the new sort configuration.
		 *
		 * @param {sap.ui.base.Event} oEvent - The sort event containing item key and sort order
		 */
		onSort: function (oEvent) {
			const oTable  = this.oTable;
			const sSortKey = oEvent.getParameter("item").getKey();
			const sSortOrder = oEvent.getParameter("item").getSortOrder();

			Engine.getInstance().retrieveState(oTable).then(function (oState) {
				var aSorter = oState.Sorter || [];
				aSorter = aSorter.filter(function (o) { return o.key !== sSortKey; });
				if (sSortOrder !== "None") {
					aSorter.unshift({ key: sSortKey, descending: sSortOrder === "Descending" });
				}
				Engine.getInstance().applyState(oTable, { Sorter: aSorter });
			});
		},

		/**
		 * Handles column group requests from the column menu.
		 * Updates the p13n Engine state with the new group configuration.
		 *
		 * @param {sap.ui.base.Event} oEvent - The group event containing item key and grouped flag
		 */
		onGroup: function (oEvent) {
			const oTable   = this.oTable;
			const sGroupKey = oEvent.getParameter("item").getKey();
			const bGrouped  = oEvent.getParameter("item").getGrouped();

			Engine.getInstance().retrieveState(oTable).then(function (oState) {
				var aGroups = oState.Groups || [];
				aGroups = aGroups.filter(function (o) { return o.key !== sGroupKey; });
				if (bGrouped) {
					aGroups.unshift({ key: sGroupKey });
				}
				Engine.getInstance().applyState(oTable, { Groups: aGroups });
			});
		},

		/**
		 * Persists column width changes via the p13n Engine.
		 *
		 * @param {sap.ui.base.Event} oEvent - The columnResize event
		 */
		onColumnResize: function (oEvent) {
			const oColumn = oEvent.getParameter("column");
			const sWidth  = oEvent.getParameter("width");
			Engine.getInstance().applyState(this.oTable, {
				ColumnWidth: [{ key: this._getKey(oColumn), width: sWidth }]
			});
		},

		/**
		 * Handles drag-and-drop column reordering and persists the new position
		 * via the p13n Engine.
		 *
		 * @param {sap.ui.base.Event} oEvent - The column move event with dragged/dropped controls
		 */
		onColumnMove: function (oEvent) {
			const oDragged = oEvent.getParameter("draggedControl");
			const oDropped = oEvent.getParameter("droppedControl");

			if (oDragged === oDropped) { return; }

			const oTable = this.oTable;
			const sDropPosition = oEvent.getParameter("dropPosition");
			const iDraggedIndex = oTable.indexOfColumn(oDragged);
			const iDroppedIndex = oTable.indexOfColumn(oDropped);
			const iNewPos = iDroppedIndex + (sDropPosition === "Before" ? 0 : 1) + (iDraggedIndex < iDroppedIndex ? -1 : 0);
			const sKey = this._getKey(oDragged);

			Engine.getInstance().retrieveState(oTable).then(function (oState) {
				const oCol = oState.Columns.find(function (o) { return o.key === sKey; }) || { key: sKey };
				oCol.position = iNewPos;
				Engine.getInstance().applyState(oTable, { Columns: [oCol] });
			});
		},

		/**
		 * Reacts to p13n Engine state changes by applying column visibility,
		 * sorting, and grouping to the table.
		 *
		 * @param {sap.ui.base.Event} oEvent - The stateChange event containing the new state
		 */
		onP13nStateChange: function (oEvent) {
			const oTable  = this.oTable;
			const oState  = oEvent.getParameter("state");
			const oHelper = this.oMetadataHelper;

			if (!oState || !oHelper) { return; }

			if (oState.Columns) {
				this._applyColumnsVisual(oState.Columns);
			}

			// Sorting
			if (oState.Sorter) {
				const aSorters = oState.Sorter.map(function (oSortState) {
					var oInfo = oHelper.getProperty(oSortState.key);
					return new Sorter(oInfo.path, oSortState.descending);
				});
				oTable.getBinding("items").sort(aSorters.length > 0 ? aSorters : this._aDefaultSorters);
			}

			// Grouping
			if (oState.Groups) {
				const aGroupSorters = oState.Groups.map(function (oGroupState) {
					var oInfo = oHelper.getProperty(oGroupState.key);
					return new Sorter(oInfo.path, false, true);
				});
				const aExistingSorters = oTable.getBinding("items").aSorters || [];
				oTable.getBinding("items").sort(aGroupSorters.concat(aExistingSorters));
			}
		},

		/**
		 * Physically reorders columns to match aColumns (array of {key} objects),
		 * then rebuilds and rebinds the row template so cells follow the new column order.
		 */
		_applyColumnsVisual: function (aColumns) {
			var oTable = this.oTable;

			// 1. Hide all columns
			oTable.getColumns().forEach(function (oCol) { oCol.setVisible(false); });

			// 2. Show and physically move each visible column into its new position
			aColumns.forEach(function (oProp, iIndex) {
				var oCol = oTable.getColumns().find(function (c) { return c.data("p13nKey") === oProp.key; });
				if (!oCol) { return; }
				oCol.setVisible(true);
				oTable.removeColumn(oCol);
				oTable.insertColumn(oCol, iIndex);
			});

			// 3. Rebind items — cells must follow the new column order (cell[i] maps to column[i])
			var oCurrentBinding = oTable.getBinding("items");
			var aSorters = oCurrentBinding ? (oCurrentBinding.aSorters || []) : [];
			if (aSorters.length === 0) { aSorters = this._aDefaultSorters; }
			var aFilters = oCurrentBinding ? (oCurrentBinding.aFilters || []) : [];
			var aAllKeys = oTable.getColumns().map(function (oCol) { return oCol.data("p13nKey"); });
			oTable.bindItems({
				model: "mainService",
				path: "/value",
				templateShareable: false,
				sorter: aSorters,
				filters: aFilters,
				template: this._buildRowTemplate(aAllKeys)
			});
		},

		/**
		 * Retrieves the p13n key from a column's custom data.
		 *
		 * @param {sap.m.Column} oColumn - The table column
		 * @returns {string} The p13n key identifier
		 * @private
		 */
		_getKey: function (oColumn) {
			return oColumn.data("p13nKey");
		},

		/**
		 * Builds a ColumnListItem template with cells ordered to match the given column key array.
		 * Must match the order of columns in the table aggregation (cell[i] ↔ column[i]).
		 */
		_buildRowTemplate: function (aColumnKeys) {
			var that = this;
			var aCells = aColumnKeys.map(function (sKey) {
				switch (sKey) {
					case "name_col":
						return new ObjectIdentifier({ title: "{mainService>Name}" });
					case "duration_col":
						return new MText({ text: "{mainService>to_TenorCode/Description}" });
					case "currency_col":
						return new MText({ text: "{mainService>to_CurrencyCode/Description}" });
					case "rate_col":
						return new ObjectNumber({
							number: { path: "mainService>Rate", type: new FloatType({ decimals: 2, maxFractionDigits: 2 }) },
							unit: "%"
						});

					case "suitability_col":
						return new RatingIndicator({
							value: {
								parts: [{ path: "mainService>Rate" }, { path: "mainService>to_TenorCode/Code" }],
								formatter: Formatter.formatSuitability
							},
							maxValue: 5,
							editable: false
						});
					default:
						return new MText();
				}
			});
			return new ColumnListItem({
				type: "Navigation",
				press: [that.onListItemPress, that],
				cells: aCells
			});
		},

		/**
		 * Lifecycle hook called when the controller is destroyed.
		 * Detaches the p13n Engine state change listener.
		 */
		onExit: function () {
			Engine.getInstance().detachStateChange(this.onP13nStateChange, this);
		},

		// -------------------------------------------------------
		// Custom Deposit Request Dialog
		// -------------------------------------------------------

		/**
		 * Initializes the "customRequest" JSON model with default values
		 * for the Custom Deposit Request dialog workflow.
		 *
		 * @private
		 */
		_initCustomRequestModel: function () {
			const oData = {
				currency: "",
				dateFrom: null,
				dateTo: null,
				rateInterpolated: 0,
				tenorDays: 0,
				tenorMonths: 0,
				account: "",
				amount: null,
				expectedReturn: 0,
				expectedTotal: 0,
				currencies: [
					{ key: "EUR", text: "EUR - Euro" },
					{ key: "USD", text: "USD - US Dollar" },
					{ key: "GBP", text: "GBP - British Pound" }
				],
				accountsFiltered: [],
				step1Enabled: true,
				step2Enabled: false,
				step3Enabled: false,
				step4Enabled: false,
				step5Enabled: false
			};
			this.setModel(new JSONModel(oData), "customRequest");
		},

		/**
		 * Initializes the "banks" JSON model with mock bank and account data
		 * used for account selection in the Custom Deposit Request dialog.
		 *
		 * @private
		 */
		_initBanksModel: function () {
			this.setModel(new JSONModel({
				bancos: [
					{
						nombre: "Santander", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0049", cuentaCorriente: "00491555-11-0123456789", saldoSAP: 52000.00, saldoInfoCent: 50000.00, currency: "EUR" },
							{ nombre: "Cuenta 2", oficina: "0049", cuentaCorriente: "00492205-20-9876543210", saldoSAP: 48000.00, saldoInfoCent: 49000.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "0049", cuentaCorriente: "00491206-30-1122334455", saldoSAP: 50000.00, saldoInfoCent: 51000.00, currency: "EUR" },
							{ nombre: "Cuenta 4", oficina: "0049", cuentaCorriente: "00493033-40-5544332211", saldoSAP: 50000.00, saldoInfoCent: 50000.00, currency: "EUR" }
						]
					},
					{
						nombre: "Abanca", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "2080", cuentaCorriente: "20800970-05-1234554321", saldoSAP: 61000.00, saldoInfoCent: 60000.00, currency: "EUR" },
							{ nombre: "Cuenta 2", oficina: "2080", cuentaCorriente: "20801880-20-9876598765", saldoSAP: 43000.00, saldoInfoCent: 44500.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "2080", cuentaCorriente: "20802252-30-5555555555", saldoSAP: 55000.00, saldoInfoCent: 55000.00, currency: "EUR" },
							{ nombre: "Cuenta 4", oficina: "2080", cuentaCorriente: "20809910-40-1111111111", saldoSAP: 38000.00, saldoInfoCent: 37500.00, currency: "EUR" },
							{ nombre: "Cuenta 5", oficina: "2080", cuentaCorriente: "20802202-50-6666666666", saldoSAP: 72000.00, saldoInfoCent: 72000.00, currency: "EUR" }
						]
					},
					{
						nombre: "CaixaBank", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "2100", cuentaCorriente: "21002151-41-2233355555", saldoSAP: 67000.00, saldoInfoCent: 68000.00, currency: "USD" },
							{ nombre: "Cuenta 2", oficina: "2100", cuentaCorriente: "21006428-22-6678764260", saldoSAP: 45000.00, saldoInfoCent: 44000.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "2100", cuentaCorriente: "21002151-30-1122334455", saldoSAP: 33000.00, saldoInfoCent: 33000.00, currency: "EUR" },
							{ nombre: "Cuenta 4", oficina: "2100", cuentaCorriente: "21002207-40-5544332211", saldoSAP: 59000.00, saldoInfoCent: 58500.00, currency: "EUR" },
							{ nombre: "Cuenta 5", oficina: "2100", cuentaCorriente: "21001880-42-2231235555", saldoSAP: 41000.00, saldoInfoCent: 41000.00, currency: "USD" }
						]
					},
					{
						nombre: "Banco Sabadell", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0281", cuentaCorriente: "02812200-10-1234567890", saldoSAP: 80000.00, saldoInfoCent: 79000.00, currency: "EUR" },
							{ nombre: "Cuenta 2", oficina: "0281", cuentaCorriente: "02817856-20-9876543210", saldoSAP: 54000.00, saldoInfoCent: 54000.00, currency: "EUR" },
							{ nombre: "Cuenta 3", oficina: "0281", cuentaCorriente: "02812389-30-1122334455", saldoSAP: 36000.00, saldoInfoCent: 37000.00, currency: "EUR" }
						]
					},
					{
						nombre: "Bankinter", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0128", cuentaCorriente: "01289414-86-1111222233", saldoSAP: 28000.00, saldoInfoCent: 28000.00, currency: "EUR" }
						]
					},
					{
						nombre: "BBVA", expanded: false, cuentas: [
							{ nombre: "Cuenta 1", oficina: "0182", cuentaCorriente: "01822357-14-627550077", saldoSAP: 95000.00, saldoInfoCent: 94000.00, currency: "GBP" },
							{ nombre: "Cuenta 2", oficina: "0182", cuentaCorriente: "01824213-48-1941353530", saldoSAP: 95000.00, saldoInfoCent: 94000.00, currency: "EUR" }
						]
					}
				]
			}), "banks");
		},

		/**
		 * Opens the Custom Deposit Request dialog by loading its fragment,
		 * adding it as a dependent, and resetting the model state.
		 */
		onOpenCustomReq: function () {
			const that = this;
			Fragment.load({
				name: "custom.deposits.view.CustomRequestDialog",
				id: "customReqDialog",
				controller: this
			}).then(function (oDialog) {
				that.oView.addDependent(oDialog);
				that.oCustomReqDialog = oDialog;  // Store reference
				// Reset model to initial state
				that._resetCustomRequestModel();
				oDialog.open();
			});
		},

		/**
		 * Resets the "customRequest" model to its initial state and configures
		 * the date range picker's min/max dates using the Temporal API.
		 *
		 * @private
		 */
		_resetCustomRequestModel: function () {
			// Determine start date: today if before 17:00 local time, tomorrow otherwise
			let oDateFrom, oDateFromPlain;
			if (typeof Temporal !== "undefined") {
				const oNowZDT = Temporal.Now.zonedDateTimeISO();
				oDateFromPlain = oNowZDT.hour >= 17
					? oNowZDT.toPlainDate().add({ days: 1 })
					: oNowZDT.toPlainDate();
				oDateFrom = this._plainDateToDate(oDateFromPlain);
			} else {
				const oNow = new Date();
				oDateFrom = new Date(oNow.getFullYear(), oNow.getMonth(), oNow.getDate());
				if (oNow.getHours() >= 17) {
					oDateFrom.setDate(oDateFrom.getDate() + 1);
				}
			}

			const oModel = this.getModel("customRequest");
			oModel.setData({
				currency: "",
				dateFrom: oDateFrom,
				dateTo: null,
				rateInterpolated: 0,
				tenorDays: 0,
				tenorMonths: 0,
				account: "",
				amount: null,
				expectedReturn: 0,
				expectedTotal: 0,
				currencies: [
					{ key: "EUR", text: "EUR - Euro" },
					{ key: "USD", text: "USD - US Dollar" },
					{ key: "GBP", text: "GBP - British Pound" }
				],
				accountsFiltered: [],
				step1Enabled: true,
				step2Enabled: false,
				step3Enabled: false,
				step4Enabled: false,
				step5Enabled: false
			});

			// Configure DatePicker: min = dateFrom + 7 days, max = dateFrom + 1 year
			const oDatePicker = Fragment.byId("customReqDialog", "customReqDateTo");
			if (oDatePicker) {
				let oMinDate, oMaxDate;
				if (typeof Temporal !== "undefined" && oDateFromPlain) {
					oMinDate = this._plainDateToDate(oDateFromPlain.add({ days: 7 }));
					oMaxDate = this._plainDateToDate(oDateFromPlain.add({ years: 1 }));
				} else {
					oMinDate = new Date(oDateFrom);
					oMinDate.setDate(oMinDate.getDate() + 7);
					oMaxDate = new Date(oDateFrom);
					oMaxDate.setFullYear(oMaxDate.getFullYear() + 1);
				}
				oDatePicker.setMinDate(oMinDate);
				oDatePicker.setMaxDate(oMaxDate);
			}
		},

		/**
		 * Handles currency selection in Step 1 of the Custom Request wizard.
		 * Saves the selected currency, enables Step 2, and resets subsequent steps.
		 *
		 * @param {sap.ui.base.Event} oEvent - The selection change event
		 */
		onStep1CurrencyChanged: function (oEvent) {
			const sCurrency = oEvent.getSource().getSelectedKey();
			const oModel = this.getModel("customRequest");
			
			// Save currency and enable step 2
			oModel.setProperty("/currency", sCurrency);
			oModel.setProperty("/step2Enabled", true);
			
			// Reset steps 2-5 (dateFrom remains auto-computed and unchanged)
			oModel.setProperty("/dateTo", null);
			oModel.setProperty("/rateInterpolated", 0);
			oModel.setProperty("/tenorDays", 0);
			oModel.setProperty("/tenorMonths", 0);
			oModel.setProperty("/step4Enabled", false);
			oModel.setProperty("/account", "");
			oModel.setProperty("/amount", null);
			oModel.setProperty("/expectedReturn", 0);
			oModel.setProperty("/expectedTotal", 0);
			oModel.setProperty("/step5Enabled", false);
			oModel.setProperty("/accountsFiltered", []);
		},

		/**
		 * Handles maturity date selection in Step 2 of the Custom Request wizard.
		 * Reads the auto-computed start date from the model, calculates tenor,
		 * interpolates the rate, filters accounts by currency, and enables Step 4.
		 *
		 * @param {sap.ui.base.Event} oEvent - The DatePicker change event
		 */
		onStep2DateToChanged: function (oEvent) {
			const oDatePicker = oEvent.getSource();
			const oDateTo = oDatePicker.getDateValue();
			const oModel = this.getModel("customRequest");

			if (!oDateTo || !oDatePicker.isValidValue()) {
				oModel.setProperty("/dateTo", null);
				oModel.setProperty("/rateInterpolated", 0);
				oModel.setProperty("/tenorDays", 0);
				oModel.setProperty("/tenorMonths", 0);
				oModel.setProperty("/step4Enabled", false);
				oModel.setProperty("/account", "");
				oModel.setProperty("/amount", null);
				oModel.setProperty("/expectedReturn", 0);
				oModel.setProperty("/expectedTotal", 0);
				oModel.setProperty("/step5Enabled", false);
				return;
			}

			const oDateFrom = oModel.getProperty("/dateFrom");

			// Calculate tenor in days and months
			const iTenorDays = this._convertDateRangeToDays(oDateFrom, oDateTo);
			const fTenorMonths = iTenorDays / 30;

			// Save date and tenor values
			oModel.setProperty("/dateTo", oDateTo);
			oModel.setProperty("/tenorDays", iTenorDays);
			oModel.setProperty("/tenorMonths", fTenorMonths);

			// Interpolate rate based on tenor
			this._interpolateRate(fTenorMonths, oModel.getProperty("/currency"));

			// Filter accounts by currency and enable step 4
			this._filterAccountsByCurrency();
			oModel.setProperty("/step4Enabled", true);

			// Reset steps 4-5
			oModel.setProperty("/account", "");
			oModel.setProperty("/amount", null);
			oModel.setProperty("/expectedReturn", 0);
			oModel.setProperty("/expectedTotal", 0);
			oModel.setProperty("/step5Enabled", false);
		},

		/**
		 * Converts a date range to the number of days between the two dates.
		 * Uses the Temporal API when available, with a fallback to Date arithmetic.
		 *
		 * @param {Date} oDateFrom - The start date
		 * @param {Date} oDateTo - The end date
		 * @returns {number} The number of days between the two dates
		 * @private
		 */
		_convertDateRangeToDays: function (oDateFrom, oDateTo) {
			if (typeof Temporal !== "undefined") {
				// Use Temporal API for cleaner date arithmetic
				const oPlainFrom = this._dateToPlainDate(oDateFrom);
				const oPlainTo = this._dateToPlainDate(oDateTo);
				
				// until() returns a Duration; extract days property
				const oDuration = oPlainFrom.until(oPlainTo);
				return oDuration.days;
			} else {
				// Fallback to traditional Date.getTime() if Temporal unavailable
				const iDiff = oDateTo.getTime() - oDateFrom.getTime();
				return Math.ceil(iDiff / (1000 * 60 * 60 * 24));
			}
		},

		/**
		 * Interpolates the deposit rate for a given tenor and currency using
		 * linear interpolation between the nearest lower and upper deposit rates.
		 * Updates the "customRequest" model with the interpolated rate.
		 *
		 * @param {number} fTenorMonths - The target tenor in months
		 * @param {string} sCurrency - The currency code (e.g., "EUR", "USD", "GBP")
		 * @private
		 */
		_interpolateRate: function (fTenorMonths, sCurrency) {
			const oModel = this.getModel("customRequest");
			const aDeposits = this.getModel("mainService").getProperty("/value") || [];
			
			// Get deposits with tenor less than and greater than fTenorMonths
			const oDepositPair = this._getDepositsByTenorAndCurrency(fTenorMonths, sCurrency);
			
			let fInterpolatedRate = 0;
			
			if (oDepositPair.lower && oDepositPair.upper) {
				// Both lower and upper tenors exist — interpolate linearly
				const fRateLower = oDepositPair.lower.Rate;
				const fRateUpper = oDepositPair.upper.Rate;
				const iTenorLowerMonths = this._getTenorMonths(oDepositPair.lower.to_TenorCode.Code);
				const iTenorUpperMonths = this._getTenorMonths(oDepositPair.upper.to_TenorCode.Code);
				
				// Linear interpolation formula
				fInterpolatedRate = fRateLower + 
					(fRateUpper - fRateLower) * 
					(fTenorMonths - iTenorLowerMonths) / 
					(iTenorUpperMonths - iTenorLowerMonths);
				console.log("Interpolating rate: lower=" + fRateLower + " at " + iTenorLowerMonths + " months, upper=" + fRateUpper + " at " + iTenorUpperMonths + " months, target tenor=" + fTenorMonths + " months => interpolated rate=" + fInterpolatedRate);	
			} else if (oDepositPair.single) {
				// Only one deposit exists (at or closest to tenor)
				fInterpolatedRate = oDepositPair.single.Rate;
			} else {
				// No deposits for this currency — default to 0
				fInterpolatedRate = 0;
			}
			
			oModel.setProperty("/rateInterpolated", Number.parseFloat(fInterpolatedRate.toFixed(2)));
		},

		/**
		 * Converts a tenor code string (e.g., "3M") to its numeric month value.
		 *
		 * @param {string} sTenorCode - The tenor code (e.g., "1M", "6M", "12M")
		 * @returns {number} The number of months represented by the tenor code
		 * @private
		 */
		_getTenorMonths: function (sTenorCode) {
			return this._DURATION_MONTHS[sTenorCode] || 1;
		},

		/**
		 * Finds the closest lower and upper deposit entries for a given tenor and currency.
		 * Used for linear interpolation of rates.
		 *
		 * @param {number} fTenorMonths - The target tenor in months
		 * @param {string} sCurrency - The currency code
		 * @returns {{lower?: object, upper?: object, single?: object}} Object containing the bounding deposits
		 * @private
		 */
		_getDepositsByTenorAndCurrency: function (fTenorMonths, sCurrency) {
			const aDeposits = this.getModel("mainService").getProperty("/value") || [];
			
			// Filter deposits by currency
			const aDepositsByCurrency = aDeposits.filter(function (oDeposit) {
				return oDeposit.to_CurrencyCode && oDeposit.to_CurrencyCode.Code === sCurrency;
			});
			
			// Find deposits with tenor lower and upper
			let oLower = null;
			let oUpper = null;
			
			for (let i = 0; i < aDepositsByCurrency.length; i++) {
				const oDeposit = aDepositsByCurrency[i];
				const iTenorMonths = this._getTenorMonths(oDeposit.to_TenorCode.Code);
				
				if (iTenorMonths <= fTenorMonths && (!oLower || iTenorMonths > this._getTenorMonths(oLower.to_TenorCode.Code))) {
					oLower = oDeposit;
				}
				
				if (iTenorMonths >= fTenorMonths && (!oUpper || iTenorMonths < this._getTenorMonths(oUpper.to_TenorCode.Code))) {
					oUpper = oDeposit;
				}
			}
			
			// Return result
			if (oLower && oUpper) {
				return { lower: oLower, upper: oUpper };
			} else if (oLower || oUpper) {
				return { single: oLower || oUpper };
			} else {
				return {};
			}
		},

		/**
		 * Filters bank accounts by the currently selected currency and updates
		 * the "accountsFiltered" property in the customRequest model.
		 *
		 * @private
		 */
		_filterAccountsByCurrency: function () {
			const sCurrency = this.getModel("customRequest").getProperty("/currency");
			const aBancos = this.getModel("banks").getProperty("/bancos") || [];
			const aCuentasFiltradas = [];
			
			aBancos.forEach(function (oBanco) {
				(oBanco.cuentas || [])
					.filter(function (oCuenta) {
						return oCuenta.currency === sCurrency;
					})
					.forEach(function (oCuenta) {
						aCuentasFiltradas.push({
							banco: oBanco.nombre,
							nombre: oCuenta.nombre,
							cuentaCorriente: oCuenta.cuentaCorriente,
							saldoInfoCent: oCuenta.saldoInfoCent,
							currency: oCuenta.currency
						});
					});
			});
			
			this.getModel("customRequest").setProperty("/accountsFiltered", aCuentasFiltradas);
		},

		/**
		 * Handles account selection in Step 4 of the Custom Request wizard.
		 * Saves the selected account and enables Step 5.
		 *
		 * @param {sap.ui.base.Event} oEvent - The selection change event
		 */
		onStep4AccountChanged: function (oEvent) {
			const sAccount = oEvent.getSource().getSelectedKey();
			const oModel = this.getModel("customRequest");
			
			oModel.setProperty("/account", sAccount);
			oModel.setProperty("/step5Enabled", true);
		},

		/**
		 * Validates the deposit amount and calculates the expected return in Step 5.
		 * Uses the formula: Interest = Amount * (Rate / 100) * (Months / 12).
		 * Sets error state on the input if validation fails.
		 */
		onStep5Calculate: function () {
			const oModel = this.getModel("customRequest");
			const oInput = Fragment.byId("customReqDialog", "customReqAmountInput");
			const sValue = oInput ? oInput.getValue() : "";
			const fAmount = oModel.getProperty("/amount");
			
			// Validate: amount must be a positive number and input must not be empty
			if (!fAmount || fAmount <= 0 || sValue === "") {
				if (oInput) {
					oInput.setValueState("Error");
					oInput.setValueStateText(this._getText("customReqInvalidAmount"));
				}
				// Reset expected return section
				oModel.setProperty("/expectedReturn", 0);
				oModel.setProperty("/expectedTotal", 0);
				//MessageToast.show(this._getText("customReqInvalidAmount"));
				return;
			}
			
			// Clear error state if valid
			if (oInput) {
				oInput.setValueState("None");
				// Format amount to locale (2 decimal places)
				const oNumberFormat = NumberFormat.getFloatInstance({ decimals: 2, maxFractionDigits: 2 });
				const sFormattedAmount = oNumberFormat.format(fAmount);
				oInput.setValue(sFormattedAmount);
			}
			
			// Get rate and tenor for calculation
			const fRate = oModel.getProperty("/rateInterpolated");
			const fTenorMonths = oModel.getProperty("/tenorMonths");
			
			// Calculate interest: Interest = Amount * (Rate / 100) * (Months / 12)
			const fInterest = fAmount * (fRate / 100) * (fTenorMonths / 12);
			const fTotal = fAmount + fInterest;
			
			oModel.setProperty("/expectedReturn", Number.parseFloat(fInterest.toFixed(2)));
			oModel.setProperty("/expectedTotal", Number.parseFloat(fTotal.toFixed(2)));
		},

		/**
		 * Cancels the Custom Deposit Request dialog, closing and destroying it,
		 * and resets the model to its initial state.
		 */
		onCancelCustomRequest: function () {
			if (this.oCustomReqDialog) {
				this.oCustomReqDialog.close();
				this.oCustomReqDialog.destroy();
				this.oCustomReqDialog = null;
			}
			this._resetCustomRequestModel();
		},

		/**
		 * Converts a JavaScript Date object to a Temporal.PlainDate.
		 *
		 * @param {Date} oDate - The JavaScript Date to convert
		 * @returns {Temporal.PlainDate} The equivalent Temporal.PlainDate
		 * @private
		 */
		_dateToPlainDate: function (oDate) {
			// Convert JavaScript Date to Temporal.PlainDate
			return Temporal.PlainDate.from({
				year: oDate.getFullYear(),
				month: oDate.getMonth() + 1,
				day: oDate.getDate()
			});
		},

		/**
		 * Converts a Temporal.PlainDate to a JavaScript Date (local midnight).
		 *
		 * @param {Temporal.PlainDate} oPlainDate - The Temporal.PlainDate to convert
		 * @returns {Date} The equivalent JavaScript Date
		 * @private
		 */
		_plainDateToDate: function (oPlainDate) {
			// Convert Temporal.PlainDate to JavaScript Date (naive conversion, UTC midnight)
			return new Date(oPlainDate.year, oPlainDate.month - 1, oPlainDate.day);
		},

		/**
		 * Submits the Custom Deposit Request after showing a confirmation dialog.
		 * On confirmation, closes the dialog, resets the model, and shows a success toast.
		 */
		onSubmitCustomRequest: function () {
			const that = this;
			const oModel = this.getModel("customRequest");
			const fAmount = oModel.getProperty("/amount");
			const sCurrency = oModel.getProperty("/currency");
			const iTenorDays = oModel.getProperty("/tenorDays");
			const fTenorMonths = oModel.getProperty("/tenorMonths");
			const fRate = oModel.getProperty("/rateInterpolated");
			const fExpectedReturn = oModel.getProperty("/expectedReturn");
			
			// Build confirmation message
			const sMsg = this._getText("customReqConfirmMsg", [
				Formatter.formatCurrency(fAmount, sCurrency),
				iTenorDays,
				fTenorMonths.toFixed(1),
				fRate.toFixed(2),
				Formatter.formatCurrency(fExpectedReturn, sCurrency)
			]);
			
			MessageBox.confirm(sMsg, {
				title: this._getText("customReqConfirmTitle"),
				actions: [MessageBox.Action.YES, MessageBox.Action.NO],
				emphasizedAction: MessageBox.Action.YES,
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.YES) {
						// Close dialog
						if (that.oCustomReqDialog) {
							that.oCustomReqDialog.close();
							that.oCustomReqDialog.destroy();
							that.oCustomReqDialog = null;
						}
						that._resetCustomRequestModel();
						
						// Show success message
						MessageToast.show(that._getText("customReqSuccessMsg"));
					}
				}
			});
		}
	});
});