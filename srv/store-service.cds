/*
 * PizzaFlow - service definition (the OData contract)
 *
 * This file describes WHAT the outside world (our SAPUI5 app, tests, other
 * systems) may see and do. CAP serves it as an OData V4 service at
 *
 *     /odata/v4/store          (service name "StoreService" -> path "store")
 *
 * Entities are exposed as PROJECTIONS on the database entities. A projection
 * is a controlled "view": it can rename, hide or restrict what is exposed.
 *
 * All entities are @readonly: nobody can create, change or delete records via
 * generic POST/PATCH/DELETE requests. Business data only changes through the
 * ACTIONS below, which run our own business logic in srv/store-service.js.
 */
using { pizzaflow.db as db } from '../db/schema';

/* ---------------------------------------------------------------------------
 * AUTHENTICATION & AUTHORIZATION (workshop placeholder - read this!)
 * ---------------------------------------------------------------------------
 * 1. WHERE IS AUTHENTICATION CONFIGURED?
 *    In package.json -> "cds": { "requires": { "auth": "dummy" } }.
 *    "dummy" means: every request is accepted and runs as a privileged user.
 *    There is NO login. This is intentionally insecure and only acceptable
 *    for a workshop with disposable sample data.
 *
 * 2. WHO IS THE USER?
 *    CAP puts the user of every request into `req.user` (see
 *    srv/store-service.js). With "dummy" auth this is the built-in
 *    privileged user; in production it is built from the user's token.
 *
 * 3. HOW WOULD WE RESTRICT ACCESS?
 *    With annotations directly in this file, for example:
 *
 *      @requires: 'authenticated-user'          // every user must log in
 *      service StoreService { ... }
 *
 *      @restrict: [
 *        { grant: 'READ',            to: 'authenticated-user' },
 *        { grant: 'restockMaterial', to: 'StoreManager' }   // a role
 *      ]
 *      entity Materials as projection on db.Materials;
 *
 *    The privileged "dummy" user passes every check, so such annotations
 *    would have no effect in this workshop setup.
 *
 * 4. WHAT DOES A PRODUCTIVE SAP BTP APPLICATION DO?
 *    It binds an SAP identity service - SAP Cloud Identity Services (IAS) or
 *    XSUAA - and switches "auth" to "ias" or "xsuaa" (e.g. `cds add ias`).
 *    Users then log in through an application router, CAP validates the JWT
 *    token of each request, fills req.user with the real user and roles, and
 *    enforces the @requires / @restrict annotations.
 * ------------------------------------------------------------------------- */
service StoreService {

  // -------------------------------------------------------------------------
  // Master data
  // -------------------------------------------------------------------------

  /** Material Stock. Read via OData, changed only via restockMaterial. */
  @readonly
  entity Materials       as projection on db.Materials
    actions {
      /**
       * Stock Replenishment (bound action):
       * POST /odata/v4/store/Materials('MAT-MOZZ')/StoreService.restockMaterial
       * Body: { "quantity": 5000 }
       */
      action restockMaterial(quantity : Integer) returns Materials;
    };

  @readonly
  entity Pizzas          as projection on db.Pizzas;

  @readonly
  entity RecipeItems     as projection on db.RecipeItems;

  // -------------------------------------------------------------------------
  // Transactional data
  // -------------------------------------------------------------------------

  @readonly
  entity SalesOrders     as projection on db.SalesOrders
    actions {
      /**
       * Confirm a PENDING sales order and consume the required materials
       * (bound action):
       * POST /odata/v4/store/SalesOrders(<ID>)/StoreService.confirmOrder
       * Body: {}
       */
      action confirmOrder() returns SalesOrders;
    };

  @readonly
  entity SalesOrderItems as projection on db.SalesOrderItems;

  // -------------------------------------------------------------------------
  // Unbound operations
  // -------------------------------------------------------------------------

  /** One line of a new sales order, as sent by the client. */
  type OrderItemInput {
    pizzaID  : String(12); // e.g. PZ-MARG
    quantity : Integer;    // number of pizzas, 1..50
  }

  /**
   * Create a new sales order with status PENDING (unbound action).
   * Prices and totals are determined by the backend, never by the client.
   * POST /odata/v4/store/placeOrder
   * Body: { "items": [ { "pizzaID": "PZ-MARG", "quantity": 2 } ] }
   */
  action   placeOrder(items : many OrderItemInput) returns SalesOrders;

  /** Key figures for the Overview page. */
  type OverviewKPIs {
    totalOrders       : Integer;
    pendingOrders     : Integer;
    confirmedRevenue  : db.Amount;
    currency          : db.CurrencyCode;
    lowStockMaterials : Integer;
  }

  /**
   * Read-only function: functions must not change data.
   * GET /odata/v4/store/getOverview()
   */
  function getOverview() returns OverviewKPIs;
}
