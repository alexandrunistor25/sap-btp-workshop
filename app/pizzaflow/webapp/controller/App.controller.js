sap.ui.define(["./BaseController", "sap/ui/model/json/JSONModel", "sap/ui/Device"], function (BaseController, JSONModel, Device) {
  "use strict";

  return BaseController.extend("pizzaflow.controller.App", {
    onInit: function () {
      // JSONModel for UI state only: which navigation item is selected
      const oAppViewModel = new JSONModel({ selectedKey: "overview" });
      this.getView().setModel(oAppViewModel, "appView");

      this.getRouter().attachRouteMatched(this.onRouteMatched, this);

      // On small screens the navigation would cover the page - start collapsed
      if (this.isSmallScreen()) {
        this.byId("toolPage").setSideExpanded(false);
      }
    },

    isSmallScreen: function () {
      return Device.media.getCurrentRange(Device.media.RANGESETS.SAP_STANDARD).name === "Phone";
    },

    /** Keeps the side navigation in sync with the current page. */
    onRouteMatched: function (oEvent) {
      const sRouteName = oEvent.getParameter("name");
      const sSelectedKey = sRouteName === "orderDetail" ? "orders" : sRouteName;
      this.getModel("appView").setProperty("/selectedKey", sSelectedKey);
    },

    /** The keys of the navigation items are the names of the routes. */
    onNavigationItemSelect: function (oEvent) {
      const sRouteName = oEvent.getParameter("item").getKey();
      this.getRouter().navTo(sRouteName);

      // On small screens the navigation overlays the page - close it after a selection
      if (this.isSmallScreen()) {
        this.byId("toolPage").setSideExpanded(false);
      }
    },

    onSideNavigationToggle: function () {
      const oToolPage = this.byId("toolPage");
      oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
    }
  });
});
