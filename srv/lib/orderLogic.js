/*
 * Order logic - everything about SALES ORDERS.
 *
 * MONEY HANDLING
 * --------------
 * JavaScript numbers are floating point numbers: 0.1 + 0.2 === 0.30000000000000004.
 * That is not acceptable for money. Therefore we:
 *   1. convert every amount to integer CENTS   ("8.50" -> 850),
 *   2. calculate only with whole numbers        (850 * 3 = 2550),
 *   3. convert back to a decimal string at the end (2550 -> "25.50").
 * CAP returns CDS Decimal values as strings (e.g. "8.50") - toCents() accepts both.
 */
const cds = require('@sap/cds');
const { SELECT, INSERT, UPDATE } = cds.ql;

const LOG = cds.log('orders');

const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED'
};

const CURRENCY = 'EUR';
const ORDER_NUMBER_PREFIX = 'SO-';
const FIRST_ORDER_NUMBER = 1001;

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

/** "8.50" or 8.5 -> 850. Math.round removes binary rounding noise (8.5 * 100). */
function toCents(vAmount) {
  return Math.round(Number(vAmount) * 100);
}

/** 2550 -> "25.50" (a string keeps the exact decimal value for CDS Decimal). */
function fromCents(iCents) {
  return (iCents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Reading orders
// ---------------------------------------------------------------------------

/** Reads the order header only (no items), or `undefined` if not found. */
async function readOrderHeader(sOrderId) {
  const { SalesOrders } = cds.entities('pizzaflow.db');
  return SELECT.one.from(SalesOrders).where({ ID: sOrderId });
}

/** Reads the order header together with its items (a "deep" read). */
async function loadOrderWithItems(sOrderId) {
  const { SalesOrders } = cds.entities('pizzaflow.db');

  // columns(o => ...) selects the header fields AND expands the composition
  // "items", similar to OData's $expand=items
  return SELECT.one
    .from(SalesOrders)
    .columns((oOrder) => {
      oOrder('*');
      oOrder.items((oItem) => {
        oItem('*');
      });
    })
    .where({ ID: sOrderId });
}

/** Returns the IDs from `aPizzaIds` that do not exist in the database. */
async function findUnknownPizzas(aPizzaIds) {
  const { Pizzas } = cds.entities('pizzaflow.db');
  const aFound = await SELECT.from(Pizzas).columns('ID').where({ ID: { in: aPizzaIds } });

  const aFoundIds = aFound.map((oPizza) => oPizza.ID);
  return aPizzaIds.filter((sPizzaId) => !aFoundIds.includes(sPizzaId));
}

// ---------------------------------------------------------------------------
// Creating orders
// ---------------------------------------------------------------------------

/** Determines the next order number, e.g. SO-1006 -> SO-1007. */
async function getNextOrderNumber() {
  const { SalesOrders } = cds.entities('pizzaflow.db');
  const oLastOrder = await SELECT.one.from(SalesOrders).columns('orderNumber').orderBy('orderNumber desc');

  if (!oLastOrder) {
    return ORDER_NUMBER_PREFIX + FIRST_ORDER_NUMBER;
  }
  const iLastNumber = Number(oLastOrder.orderNumber.replace(ORDER_NUMBER_PREFIX, ''));
  return ORDER_NUMBER_PREFIX + (iLastNumber + 1);
}

/**
 * Creates a PENDING sales order. The client only sends pizza IDs and
 * quantities - prices always come from the master data in the database.
 *
 * @param {Array<{pizzaID: string, quantity: number}>} aRequestedItems
 * @returns {Promise<string>} the ID of the new sales order
 */
async function createOrder(aRequestedItems) {
  const { Pizzas, SalesOrders } = cds.entities('pizzaflow.db');

  // Step 1: read the current prices of the requested pizzas
  const aPizzaIds = aRequestedItems.map((oItem) => oItem.pizzaID);
  const aPizzas = await SELECT.from(Pizzas).columns('ID', 'price').where({ ID: { in: aPizzaIds } });

  // Step 2: build the order items and calculate the total in cents
  let iOrderTotalCents = 0;
  const aOrderItems = [];
  for (const oRequestedItem of aRequestedItems) {
    const oPizza = aPizzas.find((oCandidate) => oCandidate.ID === oRequestedItem.pizzaID);
    const iUnitPriceCents = toCents(oPizza.price);
    const iLineTotalCents = iUnitPriceCents * oRequestedItem.quantity;
    iOrderTotalCents += iLineTotalCents;

    aOrderItems.push({
      pizza_ID: oPizza.ID,
      quantity: oRequestedItem.quantity,
      unitPrice: fromCents(iUnitPriceCents),
      totalPrice: fromCents(iLineTotalCents),
      currency: CURRENCY
    });
  }

  // Step 3: insert header AND items with one "deep insert".
  // CAP fills the keys of the items and the link to the header (salesOrder_ID)
  // as well as the managed fields createdAt/createdBy.
  // WORKSHOP BREAKPOINT: inspect aOrderItems and iOrderTotalCents
  const sOrderId = cds.utils.uuid();
  const sOrderNumber = await getNextOrderNumber();
  await INSERT.into(SalesOrders).entries({
    ID: sOrderId,
    orderNumber: sOrderNumber,
    status: ORDER_STATUS.PENDING,
    totalAmount: fromCents(iOrderTotalCents),
    currency: CURRENCY,
    itemCount: aOrderItems.length,
    items: aOrderItems
  });

  LOG.info(`Created sales order ${sOrderNumber} with ${aOrderItems.length} item(s), total ${fromCents(iOrderTotalCents)} ${CURRENCY}`);
  return sOrderId;
}

// ---------------------------------------------------------------------------
// Confirming orders
// ---------------------------------------------------------------------------

/**
 * Uses the pizza recipes to calculate how much of each material the order
 * needs. Requirements of all items are added up per material.
 *
 * Example: 2 x Margherita (125 g Mozzarella each) + 1 x Diavola (100 g each)
 *          -> { 'MAT-MOZZ': 350, ... }
 *
 * @returns {Promise<Object<string, number>>} material ID -> required quantity
 */
async function calculateMaterialRequirements(aOrderItems) {
  const { RecipeItems } = cds.entities('pizzaflow.db');
  const mRequirements = {};

  for (const oOrderItem of aOrderItems) {
    // The recipe of ONE pizza, e.g. [{ material_ID: 'MAT-MOZZ', quantityRequired: 125 }, ...]
    const aRecipe = await SELECT.from(RecipeItems)
      .columns('material_ID', 'quantityRequired')
      .where({ pizza_ID: oOrderItem.pizza_ID });

    // WORKSHOP BREAKPOINT (Exercise 3): watch mRequirements grow
    for (const oRecipeItem of aRecipe) {
      const iNeeded = oRecipeItem.quantityRequired * oOrderItem.quantity;
      const iAlreadyNeeded = mRequirements[oRecipeItem.material_ID] || 0;
      mRequirements[oRecipeItem.material_ID] = iAlreadyNeeded + iNeeded;
    }
  }
  return mRequirements;
}

/**
 * Sets the status from PENDING to CONFIRMED.
 * The extra condition "status = PENDING" guarantees that an order can only be
 * confirmed once, even if two users click "Confirm" at the same moment.
 *
 * @returns {Promise<boolean>} true if the order was updated
 */
async function markOrderAsConfirmed(sOrderId) {
  const { SalesOrders } = cds.entities('pizzaflow.db');

  // WORKSHOP BREAKPOINT (Exercise 3): the order status changes here
  const iUpdatedRows = await UPDATE(SalesOrders)
    .set({ status: ORDER_STATUS.CONFIRMED })
    .where({ ID: sOrderId, status: ORDER_STATUS.PENDING });

  return iUpdatedRows === 1;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Key figures about sales orders for the Overview page. */
async function getOrderStatistics() {
  const { SalesOrders } = cds.entities('pizzaflow.db');

  const oAllOrders = await SELECT.one.from(SalesOrders).columns('count(1) as total');
  const oPendingOrders = await SELECT.one
    .from(SalesOrders)
    .columns('count(1) as total')
    .where({ status: ORDER_STATUS.PENDING });

  // Sum the amounts in cents (and not with SQL SUM on floating point values)
  const aConfirmedOrders = await SELECT.from(SalesOrders)
    .columns('totalAmount')
    .where({ status: ORDER_STATUS.CONFIRMED });
  let iRevenueCents = 0;
  for (const oOrder of aConfirmedOrders) {
    iRevenueCents += toCents(oOrder.totalAmount);
  }

  return {
    totalOrders: oAllOrders.total,
    pendingOrders: oPendingOrders.total,
    confirmedRevenue: fromCents(iRevenueCents),
    currency: CURRENCY
  };
}

module.exports = {
  ORDER_STATUS,
  toCents,
  fromCents,
  readOrderHeader,
  loadOrderWithItems,
  findUnknownPizzas,
  createOrder,
  calculateMaterialRequirements,
  markOrderAsConfirmed,
  getOrderStatistics
};
