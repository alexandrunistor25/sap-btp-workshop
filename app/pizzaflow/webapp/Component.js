sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/Device", "sap/ui/model/json/JSONModel"], function (UIComponent, Device, JSONModel) {
  "use strict";

  /**
   * The component is the entry point of the app. Its configuration
   * (models, routing, dependencies) is read from manifest.json.
   */
  return UIComponent.extend("pizzaflow.Component", {
    metadata: {
      manifest: "json",
      interfaces: ["sap.ui.core.IAsyncContentCreation"]
    },

    init: function () {
      // Creates the models declared in manifest.json, e.g. the OData V4 model
      UIComponent.prototype.init.apply(this, arguments);

      // Read-only device information, e.g. {device>/system/phone} in views
      const oDeviceModel = new JSONModel(Device);
      oDeviceModel.setDefaultBindingMode("OneWay");
      this.setModel(oDeviceModel, "device");

      // SAP Fiori content density: "compact" for mouse, "cozy" for touch devices.
      // Set on <body> so that dialogs and popovers use it, too.
      document.body.classList.add(this.getContentDensityClass());

      // Start listening to URL hash changes (#/materials, #/orders, ...)
      this.getRouter().initialize();
    },

    getContentDensityClass: function () {
      return Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
    }
  });
});
