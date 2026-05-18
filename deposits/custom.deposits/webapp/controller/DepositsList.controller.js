sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
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
	"../model/formatter"
], function (
	BaseController,
	Filter,
	FilterOperator,
	Sorter,
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
	Formatter
) {
	"use strict";

	return BaseController.extend("custom.deposits.controller.DepositsList", {

		onInit: function () {
			this.oView = this.getView();

			// Cache control references
			this.oSmartVariantManagement = this.oView.byId("svm");
			this.oExpandedLabel          = this.oView.byId("expandedLabel");
			this.oSnappedLabel           = this.oView.byId("snappedLabel");
			this.oFilterBar              = this.oView.byId("filterBar");
			this.oTable                  = this.oView.byId("depositsTable");

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

		onSelectionChange: function (oEvent) {
			this.oSmartVariantManagement.currentVariantSetModified(true);
			this.oFilterBar.fireFilterChange(oEvent);
		},

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

		onFilterChange: function () {
			if (this._bClearing) { return; }
			this._updateLabelsAndTable(true);
		},

		onAfterVariantLoad: function () {
			this._updateLabelsAndTable(true);
		},

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

		onFilterInfoPress: function () {
			this.oView.byId("listPage").setHeaderExpanded(true);
		},

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

		onTableUpdateFinished: function (oEvent) {
			const iTotal = oEvent.getParameter("total");
			const oTitle = this.oView.byId("tableTitle");
			if (oTitle) {
				oTitle.setText(this._getText("listTitle", [iTotal]));
			}
		},

		_getText: function (sKey, aArgs) {
			return this.getResourceBundle().getText(sKey, aArgs);
		},

		// -------------------------------------------------------
		// Navigation
		// -------------------------------------------------------

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

		_registerForP13n: function () {
			const oTable = this.oTable;

			this.oMetadataHelper = new MetadataHelper([
				{ key: "name_col",        label: "Name",        path: "Name" },
				{ key: "duration_col",    label: "Duration",    path: "to_TenorCode/Description" },
				{ key: "currency_col",    label: "Currency",    path: "to_CurrencyCode/Description" },
				{ key: "rate_col",        label: "Rate (%)",    path: "Rate" },
				{ key: "suitability_col", label: "Suitability", path: "Suitability" }
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

		onOpenSettings: function () {
			Engine.getInstance().show(this.oTable, ["Columns", "Sorter", "Groups"]);
		},

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

		onColumnResize: function (oEvent) {
			const oColumn = oEvent.getParameter("column");
			const sWidth  = oEvent.getParameter("width");
			Engine.getInstance().applyState(this.oTable, {
				ColumnWidth: [{ key: this._getKey(oColumn), width: sWidth }]
			});
		},

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

		onExit: function () {
			Engine.getInstance().detachStateChange(this.onP13nStateChange, this);
		}
	});
});
