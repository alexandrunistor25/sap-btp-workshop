sap.ui.define(["sap/ui/core/library"], function (coreLibrary) {
  "use strict";

  const ValueState = coreLibrary.ValueState;

  /*
   * Business status -> i18n text, SAP Fiori semantic state and icon.
   * The state (Success/Warning/Error/Information) is mapped to colors by the
   * SAP Horizon theme - we never hard-code colors. Text and icon make sure the
   * status is understandable without color, too (accessibility).
   */
  const mStockStatus = {
    IN_STOCK: { textKey: "stockStatusInStock", state: ValueState.Success, icon: "sap-icon://sys-enter-2" },
    LOW_STOCK: { textKey: "stockStatusLowStock", state: ValueState.Warning, icon: "sap-icon://alert" },
    OUT_OF_STOCK: { textKey: "stockStatusOutOfStock", state: ValueState.Error, icon: "sap-icon://error" }
  };

  const mOrderStatus = {
    PENDING: { textKey: "orderStatusPending", state: ValueState.Information, icon: "sap-icon://pending" },
    CONFIRMED: { textKey: "orderStatusConfirmed", state: ValueState.Success, icon: "sap-icon://sys-enter-2" }
  };

  /**
   * The *Text formatters need the i18n texts. They are referenced in the views as
   * "formatter.xyzText.bind($controller)", so `this` is the view's controller.
   */
  function getText(oController, sKey) {
    return oController.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey);
  }

  return {
    stockStatusText: function (sStatus) {
      const oStatus = mStockStatus[sStatus];
      return oStatus ? getText(this, oStatus.textKey) : "";
    },

    stockStatusState: function (sStatus) {
      const oStatus = mStockStatus[sStatus];
      return oStatus ? oStatus.state : ValueState.None;
    },

    stockStatusIcon: function (sStatus) {
      const oStatus = mStockStatus[sStatus];
      return oStatus ? oStatus.icon : "";
    },

    orderStatusText: function (sStatus) {
      const oStatus = mOrderStatus[sStatus];
      return oStatus ? getText(this, oStatus.textKey) : "";
    },

    orderStatusState: function (sStatus) {
      const oStatus = mOrderStatus[sStatus];
      return oStatus ? oStatus.state : ValueState.None;
    },

    orderStatusIcon: function (sStatus) {
      const oStatus = mOrderStatus[sStatus];
      return oStatus ? oStatus.icon : "";
    }
  };
});
