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

	return BaseController.extend("custom.deposits.controller.DepositsList", {

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
		},

		// -------------------------------------------------------
		// Custom Deposit Request Dialog
		// -------------------------------------------------------

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

		_resetCustomRequestModel: function () {
			const oModel = this.getModel("customRequest");
			oModel.setData({
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
			});

			// Set date range limits using Temporal API: min = today, max = today + 365 days
			const oDateRange = Fragment.byId("customReqDialog", "customReqDateRange");
			if (oDateRange && typeof Temporal !== "undefined") {
				const oTodayPlain = Temporal.Now.plainDateISO();
				const oMaxDatePlain = oTodayPlain.add({ days: 365 });
				
				// Convert Temporal.PlainDate to Date for setMinDate/setMaxDate
				const oToday = this._plainDateToDate(oTodayPlain);
				const oMaxDate = this._plainDateToDate(oMaxDatePlain);
				
				oDateRange.setMinDate(oToday);
				oDateRange.setMaxDate(oMaxDate);
			}
		},

		onStep1CurrencyChanged: function (oEvent) {
			const sCurrency = oEvent.getSource().getSelectedKey();
			const oModel = this.getModel("customRequest");
			
			// Save currency and enable step 2
			oModel.setProperty("/currency", sCurrency);
			oModel.setProperty("/step2Enabled", true);
			
			// Reset steps 2-5
			oModel.setProperty("/dateFrom", null);
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

		onStep2DateRangeChanged: function (oEvent) {
			const oDateRange = oEvent.getSource();
			const oDateFrom = oDateRange.getDateValue();
			const oDateTo = oDateRange.getSecondDateValue();
			const oModel = this.getModel("customRequest");
			
			if (!oDateFrom || !oDateTo) {
				return;
			}
			
			// Calculate tenor in days and months
			const iTenorDays = this._convertDateRangeToDays(oDateFrom, oDateTo);
			const fTenorMonths = iTenorDays / 30.5;
			
			// Save dates and tenor values
			oModel.setProperty("/dateFrom", oDateFrom);
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
			} else if (oDepositPair.single) {
				// Only one deposit exists (at or closest to tenor)
				fInterpolatedRate = oDepositPair.single.Rate;
			} else {
				// No deposits for this currency — default to 0
				fInterpolatedRate = 0;
			}
			
			oModel.setProperty("/rateInterpolated", Number.parseFloat(fInterpolatedRate.toFixed(2)));
		},

		_getTenorMonths: function (sTenorCode) {
			return this._DURATION_MONTHS[sTenorCode] || 1;
		},

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

		onStep4AccountChanged: function (oEvent) {
			const sAccount = oEvent.getSource().getSelectedKey();
			const oModel = this.getModel("customRequest");
			
			oModel.setProperty("/account", sAccount);
			oModel.setProperty("/step5Enabled", true);
		},

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

		onCancelCustomRequest: function () {
			if (this.oCustomReqDialog) {
				this.oCustomReqDialog.close();
				this.oCustomReqDialog.destroy();
				this.oCustomReqDialog = null;
			}
			this._resetCustomRequestModel();
		},

		_dateToPlainDate: function (oDate) {
			// Convert JavaScript Date to Temporal.PlainDate
			return Temporal.PlainDate.from({
				year: oDate.getFullYear(),
				month: oDate.getMonth() + 1,
				day: oDate.getDate()
			});
		},

		_plainDateToDate: function (oPlainDate) {
			// Convert Temporal.PlainDate to JavaScript Date (naive conversion, UTC midnight)
			return new Date(oPlainDate.year, oPlainDate.month - 1, oPlainDate.day);
		},

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
				fAmount.toFixed(2),
				sCurrency,
				iTenorDays,
				fTenorMonths.toFixed(1),
				fRate.toFixed(2),
				fExpectedReturn.toFixed(2),
				sCurrency
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