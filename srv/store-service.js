/*
 * PizzaFlow - service implementation (custom event handlers)
 *
 * CAP finds this file automatically because it sits next to
 * store-service.cds and has the same name.
 *
 * HOW CAP PROCESSES A REQUEST
 * ---------------------------
 * Every OData request becomes an EVENT (READ, CREATE, restockMaterial, ...).
 * CAP runs the registered handlers in three phases:
 *
 *   1. before  - validate input, check preconditions  -> may reject the request
 *   2. on      - do the actual work                    -> produces the result
 *   3. after   - post-process the result               -> e.g. add calculated fields
 *
 * GENERIC vs. CUSTOM HANDLERS
 * ---------------------------
 * We do NOT write any handler that reads Materials or SalesOrders. CAP's
 * GENERIC handlers translate GET /Materials?$filter=... into SQL, run it and
 * return the OData response for us. We only add CUSTOM handlers where real
 * business logic is needed: our actions, the overview function and one
 * `after READ` handler.
 *
 * THE REQUEST OBJECT `req`
 * ------------------------
 *   req.event   name of the event, e.g. 'READ' or 'confirmOrder'
 *   req.target  the entity definition the request is about (or undefined)
 *   req.data    the input data, e.g. { quantity: 500 } for restockMaterial
 *   req.params  keys from the URL, e.g. [{ ID: 'MAT-MOZZ' }] for Materials('MAT-MOZZ')
 *   req.user    the user who sent the request (see AUTHENTICATION in the .cds file)
 *   req.reject(status, message)  stops the request with an error response
 *                                and ROLLS BACK the request's transaction
 */
const cds = require('@sap/cds');
const orderLogic = require('./lib/orderLogic');
const inventoryLogic = require('./lib/inventoryLogic');

const LOG = cds.log('store');

const MAX_RESTOCK_QUANTITY = 100000;
const MAX_PIZZAS_PER_ITEM = 50;

class StoreService extends cds.ApplicationService {
  init() {
    // The SERVICE entities (projections) defined in store-service.cds
    const { Materials, SalesOrders } = this.entities;

    // ---- before: validation ------------------------------------------------
    this.before('*', logRequestContext);
    this.before('restockMaterial', Materials, validateRestockQuantity);
    this.before('placeOrder', validateOrderInput);
    this.before('confirmOrder', SalesOrders, checkOrderCanBeConfirmed);

    // ---- on: business operations -------------------------------------------
    this.on('restockMaterial', Materials, restockMaterial);
    this.on('placeOrder', placeOrder);
    this.on('confirmOrder', SalesOrders, confirmOrder);
    this.on('getOverview', getOverview);

    // ---- after: post-processing ----------------------------------------------
    // 'each' = called once for every material row returned by a READ
    this.after('each', Materials, addStockStatus);

    return super.init();
  }
}

// =============================================================================
// BEFORE handlers
// =============================================================================

/** Runs before EVERY event of this service - shows the CAP request context. */
function logRequestContext(req) {
  const sTarget = req.target ? req.target.name : '-';
  LOG.debug(`event: ${req.event} | target: ${sTarget} | user: ${req.user.id}`);
}

/** Exercise 2: reject zero, negative, fractional or too large quantities. */
function validateRestockQuantity(req) {
  // WORKSHOP BREAKPOINT (Exercise 2): inspect req.data and req.params
  const { quantity: vQuantity } = req.data;

  // Note: CAP has already rejected values that are not numbers at all
  // (e.g. "abc"), because the parameter is typed as Integer in the CDS model.
  if (vQuantity === undefined || vQuantity === null) {
    return req.reject(400, 'Enter a replenishment quantity.');
  }
  if (!Number.isInteger(vQuantity)) {
    return req.reject(400, `The replenishment quantity must be a whole number, but was ${vQuantity}.`);
  }
  if (vQuantity <= 0) {
    return req.reject(400, 'The replenishment quantity must be greater than zero.');
  }
  if (vQuantity > MAX_RESTOCK_QUANTITY) {
    return req.reject(400, `The replenishment quantity must not exceed ${MAX_RESTOCK_QUANTITY}.`);
  }
}

/** Returns an error text for one order item, or null if the item is valid. */
function checkOrderItem(oItem, iPosition) {
  if (!oItem.pizzaID) {
    return `Item ${iPosition}: select a pizza.`;
  }
  if (!Number.isInteger(oItem.quantity) || oItem.quantity < 1 || oItem.quantity > MAX_PIZZAS_PER_ITEM) {
    return `Item ${iPosition}: the quantity must be a whole number between 1 and ${MAX_PIZZAS_PER_ITEM}.`;
  }
  return null;
}

/** Validates the input of placeOrder before any data is written. */
async function validateOrderInput(req) {
  const { items: aItems } = req.data;

  if (!Array.isArray(aItems) || aItems.length === 0) {
    return req.reject(400, 'A sales order needs at least one item.');
  }

  // Check each item, and make sure every pizza appears only once
  const aPizzaIds = [];
  for (const [iIndex, oItem] of aItems.entries()) {
    const sProblem = checkOrderItem(oItem, iIndex + 1);
    if (sProblem) {
      return req.reject(400, sProblem);
    }
    if (aPizzaIds.includes(oItem.pizzaID)) {
      return req.reject(400, `Pizza ${oItem.pizzaID} appears more than once. Combine it into one item.`);
    }
    aPizzaIds.push(oItem.pizzaID);
  }

  // A before handler may also read the database, e.g. to check references
  const aUnknownPizzas = await orderLogic.findUnknownPizzas(aPizzaIds);
  if (aUnknownPizzas.length > 0) {
    return req.reject(400, `Unknown pizza: ${aUnknownPizzas.join(', ')}.`);
  }
}

/** Exercise 3/4: only existing, PENDING orders can be confirmed. */
async function checkOrderCanBeConfirmed(req) {
  // WORKSHOP BREAKPOINT (Exercise 3): req.params contains the key from the URL
  const [{ ID: sOrderId }] = req.params;
  const oOrder = await orderLogic.readOrderHeader(sOrderId);

  if (!oOrder) {
    return req.reject(404, `Sales order ${sOrderId} does not exist.`);
  }
  if (oOrder.status !== orderLogic.ORDER_STATUS.PENDING) {
    return req.reject(
      409,
      `Sales order ${oOrder.orderNumber} has already been confirmed. Only pending orders can be confirmed.`
    );
  }
}

// =============================================================================
// ON handlers
// =============================================================================

/** Exercise 2: Stock Replenishment (bound action on Materials). */
async function restockMaterial(req) {
  // WORKSHOP BREAKPOINT (Exercise 2)
  const [{ ID: sMaterialId }] = req.params;
  const { quantity: iQuantity } = req.data;

  const oMaterial = await inventoryLogic.increaseStock(sMaterialId, iQuantity);
  if (!oMaterial) {
    return req.reject(404, `Material ${sMaterialId} does not exist.`);
  }
  return oMaterial;
}

/** Creates a new PENDING sales order (unbound action). */
async function placeOrder(req) {
  const { items: aItems } = req.data;

  const sOrderId = await orderLogic.createOrder(aItems);

  // Return the created order so the UI can navigate to it
  return orderLogic.readOrderHeader(sOrderId);
}

/**
 * Exercise 3/4: confirm a sales order (bound action on SalesOrders).
 * Each step is a separate function - use "Step Into" (F11) in the debugger.
 */
async function confirmOrder(req) {
  // WORKSHOP BREAKPOINT (Exercise 3): start of the confirmation
  const [{ ID: sOrderId }] = req.params;

  // Step 1: load the order and its items
  const oOrder = await orderLogic.loadOrderWithItems(sOrderId);

  // Step 2: calculate the materials required by all items (from the recipes)
  const mRequirements = await orderLogic.calculateMaterialRequirements(oOrder.items);

  // Step 3: compare the requirements with the available stock
  const aShortages = await inventoryLogic.findStockShortages(mRequirements);
  if (aShortages.length > 0) {
    // WORKSHOP BREAKPOINT (Exercise 4): the business error is raised here
    const sDetails = aShortages
      .map((oShortage) => `${oShortage.name} (required ${oShortage.required} ${oShortage.unitOfMeasure}, available ${oShortage.available} ${oShortage.unitOfMeasure})`)
      .join(', ');
    return req.reject(409, `Sales order ${oOrder.orderNumber} cannot be confirmed. Insufficient stock: ${sDetails}.`);
  }

  // Step 4: consume the materials (deduct them from stock)
  const bConsumed = await inventoryLogic.consumeMaterials(mRequirements);
  if (!bConsumed) {
    // req.reject() rolls back the stock deductions already done in step 4
    return req.reject(409, `Stock changed while confirming sales order ${oOrder.orderNumber}. No stock was consumed. Try again.`);
  }

  // Step 5: change the order status from PENDING to CONFIRMED
  const bConfirmed = await orderLogic.markOrderAsConfirmed(sOrderId);
  if (!bConfirmed) {
    return req.reject(409, `Sales order ${oOrder.orderNumber} has already been confirmed.`);
  }

  // Step 6: return the updated order. When this handler finishes without an
  // error, CAP COMMITS the transaction: stock and status change together.
  LOG.info(`Sales order ${oOrder.orderNumber} confirmed by ${req.user.id}`);
  return orderLogic.readOrderHeader(sOrderId);
}

/** Read-only function with the key figures of the Overview page. */
async function getOverview() {
  const oOrderStatistics = await orderLogic.getOrderStatistics();
  const iLowStockMaterials = await inventoryLogic.countMaterialsBelowMinimum();

  return {
    ...oOrderStatistics,
    lowStockMaterials: iLowStockMaterials
  };
}

// =============================================================================
// AFTER handlers
// =============================================================================

/**
 * Exercise 1: `stockStatus` is a VIRTUAL element - it is not stored in the
 * database. After CAP's generic handler has read the materials, we calculate
 * the status for every row.
 */
function addStockStatus(oMaterial) {
  // WORKSHOP BREAKPOINT (Exercise 1): oMaterial is one row read from the database
  if (oMaterial.stockQuantity === undefined || oMaterial.minimumStock === undefined) {
    return; // the client did not $select the fields we need
  }
  oMaterial.stockStatus = inventoryLogic.determineStockStatus(oMaterial.stockQuantity, oMaterial.minimumStock);
}

module.exports = StoreService;
