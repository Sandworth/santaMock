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
	"sap/m/IllustratedMessage",
	"sap/ui/core/Fragment",
	"sap/ui/core/format/NumberFormat",
	"sap/ui/core/format/DateFormat",
	"sap/ui/core/ListItem",
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
	IllustratedMessage,
	Fragment,
	NumberFormat,
	DateFormat,
	ListItem,
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
		onInit: async function () {
			this.oView = this.getView();
			this._sLastKnownCreatedAt = null;

			// Cache control references
			this.oSmartVariantManagement = this.oView.byId("svm");
			this.oExpandedLabel          = this.oView.byId("expandedLabel");
			this.oSnappedLabel           = this.oView.byId("snappedLabel");
			this.oFilterBar              = this.oView.byId("filterBar");
			this.oTable                  = this.oView.byId("depositsTable");
			this.oTable.setBusy(true);
			this.aTableFilters			 = [];

			// Initialize customRequest model for Custom Deposit Dialog
			this._initCustomRequestModel();

			// ----- Detect intent early — must happen before SVM initialise() -----
			const sHash        = (window.location.hash || "").replace(/^#/, "").split("?")[0];
			const bIsSantander = window.location.host.startsWith("santander"); // Check if the app is running in the Santander environment
			const bIsHistory   = sHash === "Deposits-history";
			//bIsHistory = true // Force history view for testing — to be removed when both views are available in the FLP

			const bIsDisplay = !bIsHistory;

			// Intent model — consumed by view bindings (visible, enabled, etc.)
			this.getOwnerComponent().setModel(
				new JSONModel({ isDisplay: bIsDisplay, isHistory: bIsHistory, isSantander: bIsSantander }),
				"intent"
			);

			// ----- SmartVariantManagement / FilterBar setup -----
			// Set a distinct persistencyKey per intent BEFORE initialise() so each
			// tile gets its own isolated variant storage slot in SVM.
			this.oFilterBar.setPersistencyKey(
				bIsHistory ? "DepositsHistoryFilterBar" : "DepositsDisplayFilterBar"
			);

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
			//this._registerForP13n();

			// Default sort: EUR → USD → GBP, then by tenor order
			this._aDefaultSorters = [
				//new Sorter("createdAt", true), // Default sort by creation date descending
				new Sorter("currency/order"),
				new Sorter("tenor/order")
			];

			// Router
			this.oRouter = this.getRouter();

			// Bind table and dependent aggregations to the correct OData endpoints based on the FLP intent
			await this._bindItemsByIntent();
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
			return this.oFilterBar.getAllFilterItems().reduce((aResult, oFilterItem) => {
				const oControl = oFilterItem.getControl();
				var value;
				if (oFilterItem.getName() === "Rate") {
					// Serialize token range data — the Input value is only display text
					value = (this._aRateTokens || []).map((oToken) => {
						return { text: oToken.getText(), range: oToken.data("range") };
					});
				} else if (oFilterItem.getName() === "StartDate" || oFilterItem.getName() === "MaturityDate") {
					// Serialize as ISO strings — DateRangeSelection.getValue() is locale-dependent
					const oFrom = oControl.getDateValue();
					const oTo   = oControl.getSecondDateValue();
					value = {
						from: oFrom ? oFrom.toISOString() : null,
						to:   oTo   ? oTo.toISOString()   : null
					};
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
				if (oDataObject.fieldName === "StartDate" || oDataObject.fieldName === "MaturityDate") {
					// Restore from serialized ISO strings
					const oData = oDataObject.fieldData || {};
					oControl.setDateValue(oData.from ? new Date(oData.from) : null);
					oControl.setSecondDateValue(oData.to ? new Date(oData.to) : null);
				} else if (oDataObject.fieldName === "Rate") {
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
			this.aTableFilters = [];

			// Duration (MultiComboBox — filters on to_TenorCode/Code)
			const oDurationCtrl = this.oView.byId("filterDuration");
			const aDurations = oDurationCtrl ? oDurationCtrl.getSelectedKeys() : [];
			if (aDurations.length > 0) {
				const aDurFilters = aDurations.map(function (sKey) {
					return new Filter("tenor_ID", FilterOperator.EQ, sKey);
				});
				this.aTableFilters.push(new Filter({ filters: aDurFilters, and: false }));
			}

			// Currency (MultiComboBox)
			const oCurrencyCtrl = this.oView.byId("filterCurrency");
			const aCurrencies = oCurrencyCtrl ? oCurrencyCtrl.getSelectedKeys() : [];
			if (aCurrencies.length > 0) {
				const aCurFilters = aCurrencies.map(function (sKey) {
					return new Filter("currency_ID", FilterOperator.EQ, sKey);
				});
				this.aTableFilters.push(new Filter({ filters: aCurFilters, and: false }));
			}

			// Client (MultiComboBox — Santander intent only)
			const oClientCtrl = this.oView.byId("filterClient");
			const aClients = oClientCtrl ? oClientCtrl.getSelectedKeys() : [];
			if (aClients.length > 0) {
				const aClientFilters = aClients.map(function (sKey) {
					return new Filter("client_ID", FilterOperator.EQ, sKey);
				});
				this.aTableFilters.push(new Filter({ filters: aClientFilters, and: false }));
			}

			// Start Date (DateRangeSelection — history intent only)
			const oStartDateCtrl = this.oView.byId("filterStartDate");
			if (oStartDateCtrl) {
				const oStartFrom = oStartDateCtrl.getDateValue();
				const oStartTo   = oStartDateCtrl.getSecondDateValue();
				if (oStartFrom && oStartTo) {
					this.aTableFilters.push(new Filter("startDate", FilterOperator.BT, oStartFrom.toISOString(), oStartTo.toISOString()));
				}
			}

			// Maturity Date (DateRangeSelection — history intent only)
			const oMaturityCtrl = this.oView.byId("filterMaturityDate");
			if (oMaturityCtrl) {
				const oMaturityFrom = oMaturityCtrl.getDateValue();
				const oMaturityTo   = oMaturityCtrl.getSecondDateValue();
				if (oMaturityFrom && oMaturityTo) {
					this.aTableFilters.push(new Filter("maturityDate", FilterOperator.BT, oMaturityFrom.toISOString(), oMaturityTo.toISOString()));
				}
			}

			// Rate (ValueHelpDialog tokens — range data stored as custom data on each token)
			if (this._aRateTokens && this._aRateTokens.length > 0) {
				const aRateFilters = this._aRateTokens.map(function (oToken) {
					const oRange = oToken.data("range");
					var oFilter;
					if (oRange.operation === "BT") {
						oFilter = new Filter("rate", FilterOperator.BT, parseFloat(oRange.value1), parseFloat(oRange.value2));
					} else {
						oFilter = new Filter("rate", oRange.operation, parseFloat(oRange.value1));
					}
					if (oRange.exclude) {
						oFilter = new Filter({ filters: [oFilter], and: true, not: true });
					}
					return oFilter;
				});
				this.aTableFilters.push(aRateFilters.length === 1
					? aRateFilters[0]
					: new Filter({ filters: aRateFilters, and: false }));
			}

			this.oTable.getBinding("items").filter(this.aTableFilters);
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
			const oClientCtrl = this.oView.byId("filterClient");
			if (oClientCtrl) { oClientCtrl.setSelectedKeys([]); }
			const oStartDateCtrl = this.oView.byId("filterStartDate");
			if (oStartDateCtrl) { oStartDateCtrl.setDateValue(null); oStartDateCtrl.setSecondDateValue(null); }
			const oMaturityCtrl = this.oView.byId("filterMaturityDate");
			if (oMaturityCtrl) { oMaturityCtrl.setDateValue(null); oMaturityCtrl.setSecondDateValue(null); }

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
			const oVHD = new ValueHelpDialog({
				title: this._getText("filterRate"),
				supportRanges: true,
				supportRangesOnly: true,
				key: "Rate",
				maxConditions: 1,
				descriptionKey: "Rate",
				ok: (oEvent) => {
					const aTokens = oEvent.getParameter("tokens");
					this._aRateTokens = aTokens;

					// Update the Input with a human-readable summary
					const oRateInput = this.oView.byId("filterRate");
					if (aTokens.length === 0) {
						oRateInput.setValue("");
					} else {
						oRateInput.setValue(aTokens.map((t) => t.getText()).join(", "));
					}

					oVHD.close();
					this.oSmartVariantManagement.currentVariantSetModified(true);
					this.oFilterBar.fireFilterChange();
				},
				cancel: () => {
					oVHD.close();
				},
				afterClose: () => {
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
		 * Handles the table's updateFinished event to refresh the table header
		 * with the total count of items and the relative time since the last update.
		 *
		 * @param {sap.ui.base.Event} oEvent - The updateFinished event
		 */
		onTableUpdateFinished: async function (oEvent) {
			const iTotal = oEvent.getParameter("actual");
			const oTitle = this.oView.byId("tableTitle");
			const oLabel = this.oView.byId("lastUpdateLabel");
			const oDateFormat = DateFormat.getDateInstance({ relative: true, relativeScale: "hour", relativeStyle: "wide" });
			const oTableBinding = this.oTable.getBinding("items");
			const bHasActiveTableFilters = (oTableBinding.getFilters("Application") || []).length > 0;
			let sValue = "";
			let sFormattedRelative = "-";

			if (iTotal > 0) {
				const aContexts = await oTableBinding.requestContexts(0, 1);
				sValue = aContexts[0].getObject().createdAt;
				const oDate = new Date(sValue);
				sFormattedRelative = oDateFormat.format(oDate);
				this.byId("newDepositBtn").setEnabled(true); // Show "New Deposit" button when there are entries.

				if (!bHasActiveTableFilters) {
					this._sLastKnownCreatedAt = sValue;
				}
			} else if (!bHasActiveTableFilters) {
				this.oTable.setShowNoData(true);
				this.oTable.setNoData(
					new IllustratedMessage({
						// description: this._getText("noDataDescription"), // To be added in i18n when decided
						illustrationType: "sapIllus-NoEntries",
					})
				);
				const oToday = new Date();
				oToday.setDate(oToday.getDate() - 1);
				sFormattedRelative = oDateFormat.format(oToday);
				this._sLastKnownCreatedAt = null;
			} else {
				this.oTable.setShowNoData(true);
				this.byId("newDepositBtn").setEnabled(true); // Show "New Deposit" button when there are no entries because of filters, but data exists
				if (this._sLastKnownCreatedAt) {
					const oDate = new Date(this._sLastKnownCreatedAt);
					sFormattedRelative = oDateFormat.format(oDate);
				}
				this.oTable.setNoData(
					new IllustratedMessage({
						illustrationType: "sapIllus-NoFilterResults"
					})
				);
			}
			oLabel.setText(this._getText("lastUpdate", [sFormattedRelative]));
			oTitle.setText(this._getText("listTitle", [iTotal]));
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
			// const sKey = oContext.getProperty("UUID");
			const sKey = oContext.sPath.split('(')[1].slice(0,-1); // Extract key from path

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
				//{ key: "name_col",        label: this._getText("lblName"),        path: "Name" },
				{ key: "currency_col",    label: this._getText("lblCurrency"),    path: "currency/description" },
				{ key: "duration_col",    label: this._getText("lblDuration"),    path: "tenor/order" },
				{ key: "rate_col",        label: this._getText("lblRate"),        path: "rate" },
				//{ key: "suitability_col", label: this._getText("lblSuitability"), path: "Suitability" }
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
				path: "/RateGrid",
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
		 * Reads the FLP intent from the URL hash and binds the table to the matching
		 * OData endpoint. Also creates the "intent" JSON model (isDisplay / isHistory)
		 * that view controls can bind to for conditional visibility.
		 *
		 * Deposits-display  →  /RateGrid  (filtered to standard tenors, sorted by currency+tenor)
		 * Deposits-history  →  /Deposits  (all deposit requests, no initial filter/sorter)
		 *
		 * @private
		 */
		_bindItemsByIntent: async function () {
			// Intent model was already created in onInit before SVM initialise().
			var bIsHistory = this.getOwnerComponent().getModel("intent").getProperty("/isHistory");
			var bIsSantander = this.getOwnerComponent().getModel("intent").getProperty("/isSantander");
			var oMainModel = this.getOwnerComponent().getModel("mainService");

			try {
				if (bIsHistory) {
					// Probe authorization/read access first. OData V4 failures are async and are not caught by bindItems() try/catch.
					const oDepositsProbe = oMainModel.bindList("/Deposits", null, null, null);
					try {
						const aProbeContexts = await oDepositsProbe.requestContexts(0, 1);
						const oProbeObject = aProbeContexts[0] && aProbeContexts[0].getObject();
						this._sLastKnownCreatedAt = oProbeObject && oProbeObject.createdAt ? oProbeObject.createdAt : null;
					} finally {
						oDepositsProbe.destroy();
					}

					// Back-office view: full deposit history, no pre-applied filters
					const sExpand = bIsSantander ? "currency,tenor,client" : "currency,tenor";
					this.oTable.bindItems({
						model: "mainService",
						path: "/Deposits",
						templateShareable: false,
						parameters: {
							$expand: sExpand,
							$orderby: "createdAt desc"
						},
						template: this._buildRowTemplate(["client_col", "start_date_col", "maturity_date_col", "amount_col", "currency_col", "duration_col", "rate_col"])
					});
				} else {
					// Probe authorization/read access first. OData V4 failures are async and are not caught by bindItems() try/catch.
					const oRateGridProbe = oMainModel.bindList("/RateGrid", null, null, null);
					try {
						const aProbeContexts = await oRateGridProbe.requestContexts(0, 1);
						const oProbeObject = aProbeContexts[0] && aProbeContexts[0].getObject();
						this._sLastKnownCreatedAt = oProbeObject && oProbeObject.createdAt ? oProbeObject.createdAt : null;
					} finally {
						oRateGridProbe.destroy();
					}

					// End-user view: rate grid filtered to the four standard tenors
					this.oTable.bindItems({
						model: "mainService",
						path: "/RateGrid",
						templateShareable: false,
						sorter: [
							new Sorter("currency/order"),
							new Sorter("tenor/order")
						],
						parameters: {
							$expand: "currency,tenor",
							$filter: "tenor_ID eq '1M' or tenor_ID eq '3M' or tenor_ID eq '6M' or tenor_ID eq '12M'"	
						},
						template: this._buildRowTemplate([null, null, null, null, "currency_col", "duration_col", "rate_col"])
					});
				}

				// Bind filterClient items only in Santander environment — avoids OData error on /Client entity
				if (bIsSantander) {
					const oClientCtrl = this.oView.byId("filterClient");
					if (oClientCtrl) {
						const oClientProbe = oMainModel.bindList("/Client", null, null, null);
						try {
							await oClientProbe.requestContexts(0, 1);
							oClientCtrl.bindItems({
								model: "mainService",
								path: "/Client",
								template: new ListItem({
									key: "{mainService>ID}",
									text: "{mainService>name}"
								})
							});
						} catch (oClientError) {
							console.log(oClientError);
							oClientCtrl.unbindItems();
						} finally {
							oClientProbe.destroy();
						}
					}
				}
			} catch (oError) {
				console.log(oError);
				this._sLastKnownCreatedAt = null;
				this.oTable.setShowNoData(true);
				this.oTable.setNoData(
					new IllustratedMessage({
						// description: this._getText("noDataDescription"), // To be added in i18n when decided
						description: "Permisos error.", // To be added in i18n when decided
						illustrationType: "sapIllus-NoEntries",
					})
				);
				const oTitle = this.oView.byId("tableTitle");
				const oLabel = this.oView.byId("lastUpdateLabel");
				oLabel.setText(this._getText("lastUpdate", ["-"]));
				oTitle.setText(this._getText("listTitle", ["0"]));				
				this.oTable.unbindItems();
			} finally {
				this.oTable.setBusy(false);
			}
		},

		/**
		 * Builds a ColumnListItem template with cells ordered to match the given column key array.
		 * Must match the order of columns in the table aggregation (cell[i] ↔ column[i]).
		 */
		_buildRowTemplate: function (aColumnKeys) {
			var aCells = aColumnKeys.map((sKey) => {
				switch (sKey) {
					case "client_col":
						return new MText({ text: "{mainService>client/name}" });
					case "start_date_col":
						return new MText({ text: {parts: [{ path: "mainService>startDate" }], formatter: Formatter.dateTimeToDate} });
						//return new MText({ text: "{mainService>startDate}" }); // TODO: Check hour precision.
					case "maturity_date_col":
						return new MText({ text: {parts: [{ path: "mainService>maturityDate" }], formatter: Formatter.dateTimeToDate} });
						//return new MText({ text: "{mainService>maturityDate}" }); // TODO: Check hour precision.
					case "name_col":
						return new ObjectIdentifier({ title: "{mainService>Name}" });
					case "duration_col":
						return new MText({ text: "{mainService>tenor/description}" });
					case "amount_col":
						return new MText({
							text: { path: "mainService>amount", type: new FloatType({ decimals: 2, maxFractionDigits: 2 }) }
						});
					case "currency_col":
						return new MText({ text: "{mainService>currency/description}" });
					case "rate_col":
						return new ObjectNumber({
							number: { path: "mainService>rate", type: new FloatType({ decimals: 2, maxFractionDigits: 2 }) },
							unit: "%"
						});

					// case "suitability_col":
					// 	return new RatingIndicator({
					// 		value: {
					// 			parts: [{ path: "mainService>Rate" }, { path: "mainService>to_TenorCode/Code" }],
					// 			formatter: Formatter.formatSuitability
					// 		},
					// 		maxValue: 5,
					// 		editable: false
					// 	});
					default:
						return new MText();
				}
			});
			return new ColumnListItem({
				type: "Navigation",
				press: [this.onListItemPress, this],
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
				amount: 0,
			amountDisplay: "",
				step3Enabled: false,
				step4Enabled: false,
				step5Enabled: false
			};
			this.setModel(new JSONModel(oData), "customRequest");
		},

		/**
		 * Opens the Custom Deposit Request dialog by loading its fragment,
		 * adding it as a dependent, and resetting the model state.
		 */
		onOpenCustomReq: function () {
			Fragment.load({
				name: "custom.deposits.view.CustomRequestDialog",
				id: "customReqDialog",
				controller: this
			}).then((oDialog) => {
				this.oView.addDependent(oDialog);
				this.oCustomReqDialog = oDialog; // Store reference
				this._resetCustomRequestModel();
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
				amount: "",
				amountDisplay: "",
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
			oModel.setProperty("/amount", 0);
			oModel.setProperty("/amountDisplay", "");
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
				oModel.setProperty("/amount", 0);
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

			// Reset steps 4-5 immediately and keep step 4 disabled until the rate resolves
			oModel.setProperty("/account", "");
			oModel.setProperty("/amount", 0);
			oModel.setProperty("/expectedReturn", 0);
			oModel.setProperty("/expectedTotal", 0);
			oModel.setProperty("/step4Enabled", false);
			oModel.setProperty("/step5Enabled", false);

			// Interpolate rate (async OData V4), then filter accounts and unlock step 4
			this._interpolateRate(iTenorDays, oModel.getProperty("/currency")).then(function () {
				this._filterAccountsByCurrency();
				oModel.setProperty("/step4Enabled", true);
			}.bind(this));
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
		 * @returns {Promise<void>} Promise that resolves once the rate is written to the model
		 * @private
		 */
		_interpolateRate: function (fTenorDays, sCurrency) {
			const oModel = this.getModel("customRequest");

			// Get deposits bracketing fTenorDays (Promise — OData V4 binding)
			return this._getDepositsByTenorAndCurrency(fTenorDays, sCurrency).then(function (oDepositPair) {
				let fInterpolatedRate = 0;

				if (oDepositPair.lower && oDepositPair.upper) {
					// Both lower and upper tenors exist — interpolate linearly
					const fRateLower = 	Number.parseFloat(oDepositPair.lower.rate);
					const fRateUpper = 	Number.parseFloat(oDepositPair.upper.rate);
					const iTenorLowerDays = this._getTenorDays(oDepositPair.lower.tenor_ID);
					const iTenorUpperDays = this._getTenorDays(oDepositPair.upper.tenor_ID);

					if (iTenorLowerDays === iTenorUpperDays) {
						// Exact tenor match — lower and upper point to the same deposit, no interpolation needed
						fInterpolatedRate = fRateLower;
					} else {
						// Linear interpolation formula
						fInterpolatedRate = fRateLower +
							(fRateUpper - fRateLower) *
							(fTenorDays - iTenorLowerDays) /
							(iTenorUpperDays - iTenorLowerDays);
					}
					console.log("Interpolating rate: lower=" + fRateLower + " at " + iTenorLowerDays + " days, upper=" + fRateUpper + " at " + iTenorUpperDays + " days, target tenor=" + fTenorDays + " days => interpolated rate=" + fInterpolatedRate);
				} else if (oDepositPair.single) {
					// Only one deposit exists (at or closest to tenor)
					fInterpolatedRate = oDepositPair.single.rate;
				} else {
					// No deposits for this currency — default to 0
					fInterpolatedRate = 0;
				}

				oModel.setProperty("/rateInterpolated", Number.parseFloat(fInterpolatedRate.toFixed(2)));
			}.bind(this));
		},

		/**
		 * Finds the closest lower and upper deposit entries for a given tenor and currency.
		 * Used for linear interpolation of rates.
		 *
		 * Uses the OData V4 list binding of the deposits table to fetch all rows via
		 * requestContexts(), bypassing any active search filters applied to the table.
		 *
		 * @param {number} fTenorDays - The target tenor in days
		 * @param {string} sCurrency - The currency code
		 * @returns {Promise<{lower?: object, upper?: object, single?: object}>} Promise resolving to the bounding deposits
		 * @private
		 */
		_getDepositsByTenorAndCurrency: function (fTenorDays, sCurrency) {
			const oTableBinding = this.oTable.getBinding("items");
			if (!oTableBinding) {
				return Promise.resolve({});
			}

			// Create a temporary, filter-free binding on the same entity set so that
			// active search filters on the table do not hide deposits needed for interpolation.
			const oTempBinding = oTableBinding.getModel().bindList(oTableBinding.getPath());

			return oTempBinding.requestContexts(0, 100).then(function (aContexts) {
				// Filter deposits by currency
				const aDepositsByCurrency = aContexts
					.map(function (oCtx) { return oCtx.getObject(); })
					.filter(function (oDeposit) {
						return oDeposit && oDeposit.currency_ID && oDeposit.currency_ID === sCurrency;
					});

				// Find deposits with tenor lower and upper
				let oLower = null;
				let oUpper = null;

				for (let i = 0; i < aDepositsByCurrency.length; i++) {
					const oDeposit = aDepositsByCurrency[i];
					const iTenorDays = this._getTenorDays(oDeposit.tenor_ID);

					if (iTenorDays <= fTenorDays && (!oLower || iTenorDays > this._getTenorDays(oLower.tenor_ID))) {
						oLower = oDeposit;
					}

					if (iTenorDays >= fTenorDays && (!oUpper || iTenorDays < this._getTenorDays(oUpper.tenor_ID))) {
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
			}.bind(this));
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
							currency: oCuenta.currency,
							enabled: oCuenta.enabled
						});
					});
			});
			
			this.getModel("customRequest").setProperty("/accountsFiltered", aCuentasFiltradas);
		},

		/**
		 * Handles account selection in Step 4 of the Custom Request wizard.
		 * Saves the selected account ID and enables Step 5 for amount input.
		 * Resets amount fields when account changes (forces user re-entry).
		 *
		 * Model paths updated:
		 * - customRequest>/account: Selected account ID (cuentaCorriente)
		 * - customRequest>/amount: Reset to 0
		 * - customRequest>/amountDisplay: Reset to ""
		 * - customRequest>/step5Enabled: Set to true
		 *
		 * @param {sap.ui.base.Event} oEvent - ComboBox selectionChange event
		 * @returns {void}
		 * @public
		 */
		onStep4AccountChanged: function (oEvent) {
			const sAccount = oEvent.getSource().getSelectedKey();
			const oModel = this.getModel("customRequest");
			
			oModel.setProperty("/amount", 0);  // Reset amount when account changes
			oModel.setProperty("/amountDisplay", "");
			oModel.setProperty("/account", sAccount);
			oModel.setProperty("/step5Enabled", true);
		},

		/**
		 * Retrieves the selected account balance from the Custom Request model.
		 * Finds the account in customRequest>/accountsFiltered matching customRequest>/account,
		 * and returns its saldoInfoCent as a number.
		 * 
		 * Model paths read:
		 * - customRequest>/account: Selected account ID
		 * - customRequest>/accountsFiltered: Array of {cuentaCorriente, saldoInfoCent, ...}
		 *
		 * @returns {number} Selected account balance, or NaN when no account is selected
		 * or the selected account cannot be found
		 * @private
		 */
		_getCustomRequestSelectedAccountBalance: function () {
			const oModel = this.getModel("customRequest");
			const sAccount = oModel.getProperty("/account");
			const aAccounts = oModel.getProperty("/accountsFiltered") || [];

			if (!sAccount) {
				return NaN;
			}

			const oSelectedAccount = aAccounts.find(function (oAccount) {
				return oAccount.cuentaCorriente === sAccount;
			});

			return oSelectedAccount ? Number(oSelectedAccount.saldoInfoCent) : NaN;
		},

		/**
		 * Validates the Custom Request amount against multiple constraints.
		 * Reads amount from customRequest>/amount and checks:
		 * 1. Amount is finite and positive
		 * 2. Amount >= 10,000,000 (minimum threshold)
		 * 3. Selected account has sufficient balance
		 * 
		 * Model paths read:
		 * - customRequest>/amount: Requested amount (parsed number)
		 * - customRequest>/accountsFiltered: List of available accounts with balances via _getCustomRequestSelectedAccountBalance()
		 *
		 * @returns {{valid: boolean, amount?: number, messageKey?: string, messageArgs?: string[]}}
		 * Validation result object with:
		 * - valid: true if all checks pass
		 * - amount: parsed amount if valid
		 * - messageKey: i18n key for error message if invalid
		 * - messageArgs: placeholder values for i18n message (e.g., minimum amount formatted)
		 * @private
		 */
		_validateCustomRequestAmount: function () {
			const iMinAmount = 10000000;
			const oNumFormat = NumberFormat.getFloatInstance({ decimals: 2, groupingEnabled: true });
			const oModel = this.getModel("customRequest");
			const fAmount = Number(oModel.getProperty("/amount"));
			const fAccountBalance = this._getCustomRequestSelectedAccountBalance();

			if (!Number.isFinite(fAmount) || fAmount <= 0) {
				return { valid: false, messageKey: "customReqInvalidAmount" };
			}

			if (fAmount < iMinAmount) {
				return {
					valid: false,
					messageKey: "customReqMinAmount",
					messageArgs: [oNumFormat.format(iMinAmount)]
				};
			}

			if (!Number.isFinite(fAccountBalance) || fAmount > fAccountBalance) {
				return { valid: false, messageKey: "customReqInsufficientBalance" };
			}

			return { valid: true, amount: fAmount };
		},

		/**
		 * Applies validation result to custom request amount input control.
		 * Sets ValueState to "Error" with i18n error message if validation failed.
		 * Clears expected calculations when validation fails.
		 * Returns boolean indicating whether validation passed.
		 *
		 * Model paths updated when validation fails:
		 * - customRequest>/expectedReturn: Set to 0
		 * - customRequest>/expectedTotal: Set to 0
		 *
		 * @param {sap.ui.core.Control} oInput - The input control to apply validation to
		 * @param {{valid: boolean, messageKey?: string, messageArgs?: string[]}} oValidationResult - Result from _validateCustomRequestAmount()
		 * @returns {boolean} true if validation passed, false otherwise
		 * @private
		 */
		_applyCustomRequestAmountValidation: function (oInput, oValidationResult) {
			const oModel = this.getModel("customRequest");

			if (!oValidationResult.valid) {
				oInput.setValueState("Error");
				oInput.setValueStateText(this._getText(oValidationResult.messageKey, oValidationResult.messageArgs));
				oModel.setProperty("/expectedReturn", 0);
				oModel.setProperty("/expectedTotal", 0);
				return false;
			}

			oInput.setValueState("None");
			return true;
		},

		/**
		 * Public handler for custom request amount input liveChange event.
		 * Filters out invalid numeric characters in real-time while user types.
		 * Allows only digits and locale-specific thousand/decimal separators.
		 *
		 * @param {sap.ui.base.Event} oEvent Input liveChange event
		 * @returns {void}
		 * @public
		 */
		onCustomReqAmountInputLiveChange: function (oEvent) {
			this._onAmountInputLiveChange(oEvent);
		},

		/**
		 * Public handler for custom request amount input change event.
		 * Parses user input, updates model with parsed number, formats display value,
		 * and triggers validation via onStep5AmountValidate.
		 * 
		 * Model paths updated:
		 * - customRequest>/amount: Parsed numeric value
		 * - customRequest>/amountDisplay: Formatted display string
		 *
		 * @param {sap.ui.base.Event} oEvent Input change event
		 * @returns {void}
		 * @public
		 */
		onCustomReqAmountInputChange: function (oEvent) {
			this._onAmountInputChange(oEvent, "/amount", "/amountDisplay", "customRequest", this.onStep5AmountValidate);
		},

		/**
		 * Validates the Custom Request amount when user moves focus away from the input.
		 * Re-validates current model amount and applies validation result to UI.
		 * Sets ValueState to "Error" with i18n message if validation fails.
		 * Called by change event handler on custom request amount input.
		 *
		 * @param {sap.ui.base.Event} [oEvent] - Optional input change event (not used)
		 * @returns {void}
		 * @public
		 */
		onStep5AmountValidate: function (oEvent) {
			const oInput = Fragment.byId("customReqDialog", "customReqAmountInput");
			const oValidationResult = this._validateCustomRequestAmount();

			if (oInput) {
				this._applyCustomRequestAmountValidation(oInput, oValidationResult);
			}
		},

		/**
		 * Calculates expected return and total for the custom deposit request in Step 5.
		 * Re-validates the current model amount before calculating.
		 * Uses the formula: Interest = Amount × (Rate / 100) × (Months / 12).
		 * 
		 * Model paths read:
		 * - customRequest>/amount: Validated request amount
		 * - customRequest>/rateInterpolated: Annual interest rate
		 * - customRequest>/tenorMonths: Duration in months
		 * 
		 * Model paths updated:
		 * - customRequest>/expectedReturn: Calculated interest
		 * - customRequest>/expectedTotal: Amount + interest
		 *
		 * @returns {void}
		 * @public
		 */
		onStep5Calculate: function () {
			const oModel = this.getModel("customRequest");
			const oAmountInput = Fragment.byId("customReqDialog", "customReqAmountInput");
			const oValidationResult = this._validateCustomRequestAmount();

			if (!oAmountInput || !this._applyCustomRequestAmountValidation(oAmountInput, oValidationResult)) {
				return;
			}

			const fAmount = oValidationResult.amount;
			const fRate = oModel.getProperty("/rateInterpolated");
			const fTenorMonths = oModel.getProperty("/tenorMonths");

			// Guard: nothing to calculate if amount is absent or non-positive
			if (!fAmount || fAmount <= 0) {
				return;
			}

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
		
		handleUploadPress: function () {
			// Get file from fileUploader control
			const oFileUploader = this.byId("fileUploader");
			const oFile = oFileUploader.getFocusDomRef().files[0];
			// set Table busy while processing
			oFileUploader.setBusy(true);
			let sBase64 = "";
			let oToSend;
			if (!oFile) {
				MessageToast.show(this._getText("uploadNoFile"));
				oFileUploader.setBusy(false);
				return;
			}

			// if there is a file, convert to base64

			const reader = new FileReader();
			reader.onload = (e) => {
				sBase64 = e.target.result.split(",")[1]; // Remove data URL prefix
				//console.log("File content in Base64:", sBase64);
				oToSend = {
						sBase64File: sBase64
					}
				console.log (oToSend)
				let oContext = this.getView().getModel("mainService").bindContext("/postFixTermDeposits(...)");
				oContext.setParameter("parameters", oToSend);
				oContext.execute().then(() => {
					MessageToast.show(this._getText("uploadSuccess"));
				}).catch(() => {
					MessageToast.show(this._getText("uploadError"));
				}).finally(() => {
					oFileUploader.setBusy(false);
					oFileUploader.clear();
				});

			};

			reader.onerror = (e) => {
				console.error("Error reading file:", e);
				MessageToast.show(this._getText("uploadError"));
				oFileUploader.setBusy(false);
				oFileUploader.clear();
			};

			reader.readAsDataURL(oFile);

		},

		/**
		 * Submits the Custom Deposit Request after showing a confirmation dialog.
		 * On confirmation, closes the dialog, resets the model, and shows a success toast.
		 */
		onSubmitCustomRequest: function () {
			const oModel = this.getModel("customRequest");
			const oAmountInput = Fragment.byId("customReqDialog", "customReqAmountInput");
			const oValidationResult = this._validateCustomRequestAmount();

			if (!oValidationResult.valid) {
				if (oAmountInput) {
					this._applyCustomRequestAmountValidation(oAmountInput, oValidationResult);
				}
				MessageBox.error(this._getText(oValidationResult.messageKey, oValidationResult.messageArgs));
				return;
			}

			const fAmount = oValidationResult.amount;
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
				onClose: async (sAction) => {
					if (sAction === MessageBox.Action.YES) {
						// Compute startDate (now) and maturityDate (now + tenorDays) as ISO strings
						let sStartDate, sMaturityDate;
						if (typeof Temporal !== "undefined") {
							const oNow = Temporal.Now.zonedDateTimeISO();
							sStartDate = oNow.toInstant().toString();
							const oMaturityDay = oNow.toPlainDate().add({ days: iTenorDays });
							sMaturityDate = oMaturityDay.toZonedDateTime("UTC").toInstant().toString();
						} else {
							const oNow = new Date();
							sStartDate = oNow.toISOString();
							const oMaturity = new Date(oNow);
							oMaturity.setDate(oMaturity.getDate() + iTenorDays);
							oMaturity.setHours(0, 0, 0, 0);
							sMaturityDate = oMaturity.toISOString();
						}

						const oPayload = {
							client: {
								ID: "cb036268-d3c0-46f2-aaf5-5946ae09b549" // hardcoded client ID - replace with dynamic value as needed
							},
							amount: Number.parseFloat(Number(fAmount).toFixed(2)),
							currency_ID: sCurrency,
							tenor_ID: "CT", // "Custom Tenor"
							rate: fRate,
							startDate: sStartDate,
							maturityDate: sMaturityDate,
							status: 1 // default to '1' (e.g. 'Pending') - adjust as needed
						};

						try {
							await this.getView().getModel("mainService").bindList("/Deposits").create(oPayload);
						} catch (oError) {
							console.error("Error creating custom deposit request:", oError);
							MessageBox.error(this._getText("customReqErrorMsg"));
							return;
						}

						// Close dialog
						if (this.oCustomReqDialog) {
							this.oCustomReqDialog.close();
							this.oCustomReqDialog.destroy();
							this.oCustomReqDialog = null;
						}
						this._resetCustomRequestModel();

						// Show success message
						MessageToast.show(this._getText("customReqSuccessMsg"));
					}
				}
			});
		}
	});
});