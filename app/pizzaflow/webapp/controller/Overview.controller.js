sap.ui.define(["./BaseController"], function (BaseController) {
  "use strict";

  return BaseController.extend("pizzaflow.controller.Overview", {
    onInit: function () {
      this.getRouter().getRoute("overview").attachPatternMatched(this.onRouteMatched, this);
    },

    /** Called every time the user opens the Overview page. */
    onRouteMatched: function () {
      this.loadKeyFigures();
    },

    /**
     * Calls the OData function getOverview():
     *   GET /odata/v4/store/getOverview()
     * The tiles show the properties of the returned OverviewKPIs object.
     */
    loadKeyFigures: function () {
      const oOperationBinding = this.byId("kpiTiles").getObjectBinding();
      oOperationBinding.invoke().catch(this.showError.bind(this));
    },

    onRefresh: function () {
      this.loadKeyFigures();
      this.byId("recentOrdersTable").getBinding("items").refresh();
      this.byId("replenishmentTable").getBinding("items").refresh();
    },

    onNavigateToOrders: function () {
      this.getRouter().navTo("orders");
    },

    onNavigateToMaterials: function () {
      this.getRouter().navTo("materials");
    },

    onOrderPress: function (oEvent) {
      const sOrderId = oEvent.getSource().getBindingContext().getProperty("ID");
      this.getRouter().navTo("orderDetail", { orderId: sOrderId });
    }
  });
});
