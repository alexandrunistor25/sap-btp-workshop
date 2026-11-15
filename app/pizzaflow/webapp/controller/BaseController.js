sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/core/UIComponent", "sap/m/MessageBox"], function (Controller, UIComponent, MessageBox) {
  "use strict";

  /**
   * Small helpers shared by all controllers of the app.
   */
  return Controller.extend("pizzaflow.controller.BaseController", {
    getRouter: function () {
      return UIComponent.getRouterFor(this);
    },

    /** Without a name: the default model = the OData V4 model of StoreService. */
    getModel: function (sName) {
      return this.getView().getModel(sName);
    },

    getText: function (sKey, aArgs) {
      return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
    },

    /**
     * Shows the error of a failed OData request or operation.
     * For CAP business errors (req.reject in the backend), oError.message
     * contains the message text sent by the server.
     */
    showError: function (oError) {
      // WORKSHOP BREAKPOINT (browser, Exercise 4): inspect oError and oError.status
      MessageBox.error(oError.message, { title: this.getText("errorTitle") });
    }
  });
});
