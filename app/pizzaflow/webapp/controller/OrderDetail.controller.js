sap.ui.define(["./BaseController", "sap/m/MessageBox", "sap/m/MessageToast"], function (BaseController, MessageBox, MessageToast) {
  "use strict";

  return BaseController.extend("pizzaflow.controller.OrderDetail", {
    onInit: function () {
      this.getRouter().getRoute("orderDetail").attachPatternMatched(this.onRouteMatched, this);
    },

    /** URL #/orders/<ID> -> bind the page to /SalesOrders(<ID>) */
    onRouteMatched: function (oEvent) {
      const sOrderId = oEvent.getParameter("arguments").orderId;
      this.getView().bindElement({
        path: "/SalesOrders(" + sOrderId + ")",
        events: {
          dataReceived: this.onDataReceived.bind(this)
        }
      });
    },

    onDataReceived: function (oEvent) {
      if (oEvent.getParameter("error")) {
        MessageToast.show(this.getText("orderNotFound"));
        this.getRouter().navTo("orders", {}, true);
      }
    },

    onNavigateToOrders: function () {
      this.getRouter().navTo("orders");
    },

    /** Significant action -> ask the user first (SAP Fiori guideline). */
    onConfirmOrderPress: function () {
      const oOrderContext = this.getView().getBindingContext();
      const sOrderNumber = oOrderContext.getProperty("orderNumber");
      const sConfirmAction = this.getText("confirmOrder");

      MessageBox.confirm(this.getText("confirmOrderQuestion", [sOrderNumber]), {
        title: this.getText("confirmOrderTitle"),
        actions: [sConfirmAction, MessageBox.Action.CANCEL],
        emphasizedAction: sConfirmAction,
        onClose: (sAction) => {
          if (sAction === sConfirmAction) {
            this.confirmOrder(oOrderContext, sOrderNumber);
          }
        }
      });
    },

    /**
     * Bound action on the current sales order:
     *   POST /odata/v4/store/SalesOrders(<ID>)/StoreService.confirmOrder
     */
    confirmOrder: async function (oOrderContext, sOrderNumber) {
      const oView = this.getView();
      const oAction = this.getModel().bindContext("StoreService.confirmOrder(...)", oOrderContext);

      oView.setBusy(true);
      try {
        // WORKSHOP BREAKPOINT (browser, Exercise 3 + 4)
        await oAction.invoke();
        MessageToast.show(this.getText("confirmOrderSuccess", [sOrderNumber]));
        // Order status AND stock changed on the server: reload all data of the app
        this.getModel().refresh();
      } catch (oError) {
        // e.g. HTTP 409 from req.reject(...) - "Insufficient stock: ..."
        this.showError(oError);
      } finally {
        oView.setBusy(false);
      }
    }
  });
});
