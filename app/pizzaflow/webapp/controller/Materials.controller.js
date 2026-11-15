sap.ui.define(
  ["./BaseController", "sap/ui/model/json/JSONModel", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/m/MessageToast"],
  function (BaseController, JSONModel, Filter, FilterOperator, MessageToast) {
    "use strict";

    const MAX_RESTOCK_QUANTITY = 100000;

    return BaseController.extend("pizzaflow.controller.Materials", {
      onInit: function () {
        // JSONModels hold transient UI state only - business data stays in the OData model
        this.getView().setModel(new JSONModel({ hasSelection: false }), "materialsView");
        this.getView().setModel(new JSONModel({}), "restock");
      },

      /** Shows the number of materials in the table title, e.g. "Materials (10)". */
      onUpdateFinished: function (oEvent) {
        const iTotal = oEvent.getParameter("total");
        this.byId("materialsTableTitle").setText(this.getText("materialsTableTitleCount", [iTotal]));
        this.onSelectionChange(); // the selection may have changed after a refresh or search
      },

      /** Search -> OData $filter=contains(tolower(name),tolower('...')) */
      onSearch: function (oEvent) {
        const sQuery = oEvent.getParameter("query");
        const aFilters = [];
        if (sQuery) {
          aFilters.push(new Filter({ path: "name", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }));
        }
        this.byId("materialsTable").getBinding("items").filter(aFilters);
      },

      onSelectionChange: function () {
        const bHasSelection = !!this.byId("materialsTable").getSelectedItem();
        this.getModel("materialsView").setProperty("/hasSelection", bHasSelection);
      },

      // ---- Restock dialog ------------------------------------------------------

      onRestockPress: async function () {
        const oSelectedItem = this.byId("materialsTable").getSelectedItem();
        if (!oSelectedItem) {
          return;
        }
        const oMaterialContext = oSelectedItem.getBindingContext();
        this.getModel("restock").setData({ quantity: "", valueState: "None", valueStateText: "" });

        this.pRestockDialog ??= this.loadFragment({ name: "pizzaflow.fragment.RestockDialog" });
        const oDialog = await this.pRestockDialog;

        // The dialog shows the data of the selected material (OData context)
        oDialog.setBindingContext(oMaterialContext);
        oDialog.open();
      },

      onRestockQuantityChange: function () {
        this.getModel("restock").setProperty("/valueState", "None");
      },

      /** Returns the entered quantity as integer, or null if it is not valid. */
      parseQuantity: function (sValue) {
        if (!/^\d+$/.test(String(sValue).trim())) {
          return null;
        }
        const iQuantity = Number(sValue);
        return iQuantity >= 1 && iQuantity <= MAX_RESTOCK_QUANTITY ? iQuantity : null;
      },

      onRestockConfirm: async function () {
        const oRestockModel = this.getModel("restock");
        const iQuantity = this.parseQuantity(oRestockModel.getProperty("/quantity"));
        if (iQuantity === null) {
          oRestockModel.setProperty("/valueState", "Error");
          oRestockModel.setProperty("/valueStateText", this.getText("restockQuantityInvalid", [MAX_RESTOCK_QUANTITY]));
          return;
        }

        const oDialog = await this.pRestockDialog;
        const oMaterialContext = oDialog.getBindingContext();

        // Bound action: POST /odata/v4/store/Materials('...')/StoreService.restockMaterial
        // "(...)" creates a deferred operation binding that runs on invoke()
        const oAction = this.getModel().bindContext("StoreService.restockMaterial(...)", oMaterialContext);
        oAction.setParameter("quantity", iQuantity);

        oDialog.setBusy(true);
        try {
          // WORKSHOP BREAKPOINT (browser, Exercise 2): the action request is sent here
          await oAction.invoke();
          MessageToast.show(
            this.getText("restockSuccess", [
              oMaterialContext.getProperty("name"),
              iQuantity,
              oMaterialContext.getProperty("unitOfMeasure")
            ])
          );
          oDialog.close();
          // The stock changed on the server: reload all data shown in the app
          this.getModel().refresh();
        } catch (oError) {
          this.showError(oError);
        } finally {
          oDialog.setBusy(false);
        }
      },

      onRestockCancel: async function () {
        const oDialog = await this.pRestockDialog;
        oDialog.close();
      }
    });
  }
);
