sap.ui.define(
  ["./BaseController", "sap/ui/model/json/JSONModel", "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/m/MessageToast"],
  function (BaseController, JSONModel, Filter, FilterOperator, MessageToast) {
    "use strict";

    return BaseController.extend("pizzaflow.controller.Orders", {
      onInit: function () {
        // Transient UI state of the "Create Sales Order" dialog
        this.getView().setModel(new JSONModel({ items: [] }), "newOrder");
      },

      onUpdateFinished: function (oEvent) {
        const iTotal = oEvent.getParameter("total");
        this.byId("ordersTableTitle").setText(this.getText("ordersTableTitleCount", [iTotal]));
      },

      /** Combines the status filter and the search into one OData $filter. */
      onFilterChange: function () {
        const sStatus = this.byId("statusFilter").getSelectedKey();
        const sQuery = this.byId("orderSearch").getValue();
        const aFilters = [];

        if (sStatus !== "ALL") {
          aFilters.push(new Filter({ path: "status", operator: FilterOperator.EQ, value1: sStatus }));
        }
        if (sQuery) {
          aFilters.push(new Filter({ path: "orderNumber", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }));
        }
        // Several filters on different properties are combined with AND
        this.byId("ordersTable").getBinding("items").filter(aFilters);
      },

      onOrderPress: function (oEvent) {
        const sOrderId = oEvent.getSource().getBindingContext().getProperty("ID");
        this.getRouter().navTo("orderDetail", { orderId: sOrderId });
      },

      // ---- Create Sales Order dialog -----------------------------------------

      onCreateOrderPress: async function () {
        this.getModel("newOrder").setData({ items: [this.createEmptyItem()] });

        this.pCreateOrderDialog ??= this.loadFragment({ name: "pizzaflow.fragment.CreateOrderDialog" });
        const oDialog = await this.pCreateOrderDialog;
        oDialog.open();
      },

      createEmptyItem: function () {
        return { pizzaID: "", quantity: 1, valueState: "None" };
      },

      onAddOrderItem: function () {
        const oNewOrderModel = this.getModel("newOrder");
        const aItems = oNewOrderModel.getProperty("/items");
        oNewOrderModel.setProperty("/items", aItems.concat([this.createEmptyItem()]));
      },

      onRemoveOrderItem: function (oEvent) {
        const sItemPath = oEvent.getSource().getBindingContext("newOrder").getPath(); // e.g. "/items/1"
        const iIndex = Number(sItemPath.split("/").pop());
        const oNewOrderModel = this.getModel("newOrder");
        const aItems = oNewOrderModel.getProperty("/items").filter((oItem, iItemIndex) => iItemIndex !== iIndex);
        oNewOrderModel.setProperty("/items", aItems);
      },

      onOrderItemPizzaChange: function (oEvent) {
        oEvent.getSource().getBindingContext("newOrder").getObject().valueState = "None";
        this.getModel("newOrder").refresh();
      },

      /** Marks rows without pizza; returns true if every row has one. */
      validateNewOrderItems: function (aItems) {
        let bValid = aItems.length > 0;
        for (const oItem of aItems) {
          oItem.valueState = oItem.pizzaID ? "None" : "Error";
          bValid = bValid && !!oItem.pizzaID;
        }
        this.getModel("newOrder").refresh();
        return bValid;
      },

      onCreateOrderConfirm: async function () {
        const aItems = this.getModel("newOrder").getProperty("/items");
        if (!this.validateNewOrderItems(aItems)) {
          if (aItems.length === 0) {
            MessageToast.show(this.getText("createOrderNeedsItems"));
          }
          return;
        }

        // Unbound action: POST /odata/v4/store/placeOrder
        // The client only sends pizza IDs and quantities - never prices.
        const oAction = this.getModel().bindContext("/placeOrder(...)");
        oAction.setParameter(
          "items",
          aItems.map((oItem) => ({ pizzaID: oItem.pizzaID, quantity: Number(oItem.quantity) }))
        );

        const oDialog = await this.pCreateOrderDialog;
        oDialog.setBusy(true);
        try {
          await oAction.invoke();

          // The action returns the new sales order (with ID and order number)
          const oCreatedOrder = oAction.getBoundContext().getObject();
          MessageToast.show(this.getText("createOrderSuccess", [oCreatedOrder.orderNumber]));
          oDialog.close();
          this.getModel().refresh();
          this.getRouter().navTo("orderDetail", { orderId: oCreatedOrder.ID });
        } catch (oError) {
          this.showError(oError);
        } finally {
          oDialog.setBusy(false);
        }
      },

      onCreateOrderCancel: async function () {
        const oDialog = await this.pCreateOrderDialog;
        oDialog.close();
      }
    });
  }
);
