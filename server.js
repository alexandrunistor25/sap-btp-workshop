/*
 * PizzaFlow - custom server bootstrap
 *
 * `cds-serve` (npm start) and `cds watch` (npm run watch) automatically load
 * this file. We do NOT replace CAP's server - we only hook into its
 * lifecycle events and then hand over to the standard `cds.server`.
 *
 * CAP itself is built on Express.js. The 'bootstrap' event gives us the
 * Express app BEFORE CAP adds its own middlewares and OData services, so
 * the middleware below sees every request.
 */
const cds = require('@sap/cds');

const LOG = cds.log('http');

/** The stable URL of the SAPUI5 app (served from the ./app folder). */
const UI_PATH = '/pizzaflow/webapp/index.html';

cds.on('bootstrap', function registerMiddlewares(oApp) {
  // 1. Request logging: [http] - POST /odata/v4/store/... - 200 - 15ms
  oApp.use(function logRequest(oRequest, oResponse, fnNext) {
    const iStartTime = Date.now();
    oResponse.on('finish', function logResponse() {
      const iDuration = Date.now() - iStartTime;
      LOG.info(`${oRequest.method} ${oRequest.originalUrl} - ${oResponse.statusCode} - ${iDuration}ms`);
    });
    fnNext();
  });

  // 2. In production CAP's development index page is switched off.
  //    Then the root URL forwards to the SAPUI5 app instead of returning 404.
  if (!cds.env.server.index) {
    oApp.get('/', function redirectToApp(oRequest, oResponse) {
      oResponse.redirect(UI_PATH);
    });
  }
});

cds.on('served', function logAppUrl() {
  LOG.info(`SAPUI5 app available at ${UI_PATH}`);
});

// Hand over to CAP's standard server implementation
module.exports = cds.server;
