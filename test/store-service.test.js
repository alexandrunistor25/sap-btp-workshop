/*
 * Backend tests for the StoreService.
 *
 * cds.test() starts the CAP server in-process with a fresh in-memory SQLite
 * database filled from db/data/*.csv. `data.reset()` restores the initial
 * sample data before every test, so the tests do not influence each other.
 *
 * Run with: npm test
 */
const cds = require('@sap/cds');
const path = require('node:path');

const { GET, POST, expect, data } = cds.test(path.join(__dirname, '..'));

const SERVICE = '/odata/v4/store';
const ORDER_SO_1001 = '5a1e5000-0000-4000-8000-000000001001'; // CONFIRMED
const ORDER_SO_1004 = '5a1e5000-0000-4000-8000-000000001004'; // PENDING, enough stock
const ORDER_SO_1005 = '5a1e5000-0000-4000-8000-000000001005'; // PENDING, not enough Gorgonzola
const ORDER_SO_1006 = '5a1e5000-0000-4000-8000-000000001006'; // PENDING, 2 x Diavola

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Awaits a request that must fail and returns the error. */
async function expectFailure(oRequest, iExpectedStatus) {
  let oError = null;
  try {
    await oRequest;
  } catch (oCaught) {
    oError = oCaught;
  }
  expect(oError, 'the request should have failed').not.to.equal(null);
  expect(oError.status).to.equal(iExpectedStatus);
  return oError;
}

/** Returns { 'MAT-DOUGH': 60, ... } for all materials. */
async function readStockLevels() {
  const { data: oResponse } = await GET(`${SERVICE}/Materials?$select=ID,stockQuantity`);
  const mStock = {};
  for (const oMaterial of oResponse.value) {
    mStock[oMaterial.ID] = oMaterial.stockQuantity;
  }
  return mStock;
}

async function readOrder(sOrderId) {
  const { data: oOrder } = await GET(`${SERVICE}/SalesOrders(${sOrderId})?$expand=items`);
  return oOrder;
}

function confirm(sOrderId) {
  return POST(`${SERVICE}/SalesOrders(${sOrderId})/StoreService.confirmOrder`, {});
}

function restock(sMaterialId, vQuantity) {
  return POST(`${SERVICE}/Materials('${sMaterialId}')/StoreService.restockMaterial`, { quantity: vQuantity });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PizzaFlow StoreService', () => {
  beforeEach(() => data.reset());

  describe('reading master data', () => {
    it('serves the OData V4 metadata document', async () => {
      const { status, data: sMetadata } = await GET(`${SERVICE}/$metadata`);
      expect(status).to.equal(200);
      expect(sMetadata).to.contain('Name="restockMaterial"');
      expect(sMetadata).to.contain('Name="confirmOrder"');
      expect(sMetadata).to.contain('Name="placeOrder"');
      expect(sMetadata).to.contain('Name="getOverview"');
    });

    it('reads materials with a calculated stock status (after handler)', async () => {
      const { data: oResponse } = await GET(
        `${SERVICE}/Materials?$select=ID,name,stockQuantity,minimumStock,unitOfMeasure,stockStatus&$orderby=ID`
      );
      expect(oResponse.value).to.have.length(10);

      const mStatus = {};
      for (const oMaterial of oResponse.value) {
        mStatus[oMaterial.ID] = oMaterial.stockStatus;
      }
      expect(mStatus['MAT-MOZZ']).to.equal('IN_STOCK');
      expect(mStatus['MAT-HAM']).to.equal('LOW_STOCK');
      expect(mStatus['MAT-GORG']).to.equal('LOW_STOCK');
      expect(mStatus['MAT-OLIV']).to.equal('OUT_OF_STOCK');
    });

    it('reads pizzas together with their recipes', async () => {
      const { data: oResponse } = await GET(`${SERVICE}/Pizzas?$expand=recipe($expand=material)&$orderby=ID`);
      expect(oResponse.value).to.have.length(5);

      const oMargherita = oResponse.value.find((oPizza) => oPizza.ID === 'PZ-MARG');
      expect(oMargherita.price).to.equal('8.50'); // Decimals arrive as strings
      expect(oMargherita.recipe).to.have.length(3);
      const oMozzarella = oMargherita.recipe.find((oLine) => oLine.material_ID === 'MAT-MOZZ');
      expect(oMozzarella.quantityRequired).to.equal(125);
      expect(oMozzarella.material.unitOfMeasure).to.equal('g');
    });

    it('rejects generic changes to read-only entities', async () => {
      await expectFailure(POST(`${SERVICE}/Materials`, { ID: 'MAT-X', name: 'X', category: 'X', unitOfMeasure: 'g' }), 405);
    });
  });

  describe('placeOrder', () => {
    it('creates a pending order and calculates prices in the backend', async () => {
      const { data: oCreated } = await POST(`${SERVICE}/placeOrder`, {
        items: [
          { pizzaID: 'PZ-MARG', quantity: 2 },
          { pizzaID: 'PZ-4FOR', quantity: 3 }
        ]
      });

      expect(oCreated.status).to.equal('PENDING');
      expect(oCreated.orderNumber).to.equal('SO-1007');
      expect(oCreated.currency).to.equal('EUR');
      expect(oCreated.itemCount).to.equal(2);
      expect(oCreated.totalAmount).to.equal('54.50'); // 2 x 8.50 + 3 x 12.50

      const oOrder = await readOrder(oCreated.ID);
      const oQuattro = oOrder.items.find((oItem) => oItem.pizza_ID === 'PZ-4FOR');
      expect(oQuattro.unitPrice).to.equal('12.50');
      expect(oQuattro.totalPrice).to.equal('37.50');
    });

    it('rejects invalid input', async () => {
      await expectFailure(POST(`${SERVICE}/placeOrder`, { items: [] }), 400);
      await expectFailure(POST(`${SERVICE}/placeOrder`, { items: [{ pizzaID: 'PZ-MARG', quantity: 0 }] }), 400);
      await expectFailure(POST(`${SERVICE}/placeOrder`, { items: [{ pizzaID: 'PZ-MARG', quantity: 1.5 }] }), 400);
      await expectFailure(POST(`${SERVICE}/placeOrder`, { items: [{ pizzaID: 'PZ-NOPE', quantity: 1 }] }), 400);

      const oDuplicate = await expectFailure(
        POST(`${SERVICE}/placeOrder`, {
          items: [
            { pizzaID: 'PZ-MARG', quantity: 1 },
            { pizzaID: 'PZ-MARG', quantity: 2 }
          ]
        }),
        400
      );
      expect(oDuplicate.message).to.match(/more than once/);

      const { data: oCount } = await GET(`${SERVICE}/SalesOrders/$count`);
      expect(Number(oCount)).to.equal(6); // nothing was created
    });
  });

  describe('restockMaterial', () => {
    it('increases the stock of a material', async () => {
      const { data: oMaterial } = await restock('MAT-GORG', 1000);
      expect(oMaterial.stockQuantity).to.equal(1150);
      expect(oMaterial.stockStatus).to.equal('IN_STOCK');

      const mStock = await readStockLevels();
      expect(mStock['MAT-GORG']).to.equal(1150);
    });

    it('rejects zero, negative, fractional, malformed and missing quantities', async () => {
      await expectFailure(restock('MAT-GORG', 0), 400);
      await expectFailure(restock('MAT-GORG', -5), 400);
      await expectFailure(restock('MAT-GORG', 2.5), 400);
      await expectFailure(restock('MAT-GORG', 'abc'), 400);
      await expectFailure(POST(`${SERVICE}/Materials('MAT-GORG')/StoreService.restockMaterial`, {}), 400);

      const mStock = await readStockLevels();
      expect(mStock['MAT-GORG']).to.equal(150); // unchanged
    });

    it('returns 404 for an unknown material', async () => {
      await expectFailure(restock('MAT-NOPE', 10), 404);
    });
  });

  describe('confirmOrder', () => {
    it('confirms an order and consumes the materials from its recipes', async () => {
      const mBefore = await readStockLevels();

      const { data: oConfirmed } = await confirm(ORDER_SO_1004); // 2 x Margherita + 1 x Prosciutto e Funghi
      expect(oConfirmed.status).to.equal('CONFIRMED');

      const mAfter = await readStockLevels();
      expect(mAfter['MAT-DOUGH']).to.equal(mBefore['MAT-DOUGH'] - 3);
      expect(mAfter['MAT-TOMSC']).to.equal(mBefore['MAT-TOMSC'] - 240); // 3 x 80 ml
      expect(mAfter['MAT-MOZZ']).to.equal(mBefore['MAT-MOZZ'] - 350); // 2 x 125 g + 100 g
      expect(mAfter['MAT-HAM']).to.equal(mBefore['MAT-HAM'] - 70);
      expect(mAfter['MAT-MUSH']).to.equal(mBefore['MAT-MUSH'] - 50);
      expect(mAfter['MAT-GORG']).to.equal(mBefore['MAT-GORG']); // not part of the recipes
    });

    it('updates the stock status after consumption', async () => {
      await confirm(ORDER_SO_1006); // 2 x Diavola -> 120 g pepperoni, 1100 -> 980 (< 1000)
      const { data: oPepperoni } = await GET(`${SERVICE}/Materials('MAT-PEPP')`);
      expect(oPepperoni.stockQuantity).to.equal(980);
      expect(oPepperoni.stockStatus).to.equal('LOW_STOCK');
    });

    it('rejects an order with insufficient stock and changes nothing', async () => {
      const mBefore = await readStockLevels();

      const oError = await expectFailure(confirm(ORDER_SO_1005), 409);
      expect(oError.message).to.match(/Insufficient stock: Gorgonzola \(required 200 g, available 150 g\)/);

      expect(await readStockLevels()).to.deep.equal(mBefore);
      expect((await readOrder(ORDER_SO_1005)).status).to.equal('PENDING');
    });

    it('can confirm the order after the missing material was restocked', async () => {
      await restock('MAT-GORG', 1000);
      const { data: oConfirmed } = await confirm(ORDER_SO_1005);
      expect(oConfirmed.status).to.equal('CONFIRMED');
      expect((await readStockLevels())['MAT-GORG']).to.equal(950); // 150 + 1000 - 200
    });

    it('rejects a second confirmation of the same order', async () => {
      await confirm(ORDER_SO_1004);
      const mAfterFirst = await readStockLevels();

      const oError = await expectFailure(confirm(ORDER_SO_1004), 409);
      expect(oError.message).to.match(/already been confirmed/);
      expect(await readStockLevels()).to.deep.equal(mAfterFirst); // consumed only once
    });

    it('rejects confirmation of an already confirmed sample order', async () => {
      await expectFailure(confirm(ORDER_SO_1001), 409);
    });

    it('returns 404 for an unknown order', async () => {
      await expectFailure(confirm('5a1e5000-0000-4000-8000-999999999999'), 404);
    });
  });

  describe('transactions', () => {
    it('rolls back stock that was already consumed when the transaction fails', async () => {
      const inventoryLogic = require('../srv/lib/inventoryLogic');
      let oError = null;

      try {
        // cds.tx() runs the function in ONE transaction, like CAP does for a request
        await cds.tx(async () => {
          // Mozzarella is available, Gorgonzola (150 g) is not -> second update fails
          const bConsumed = await inventoryLogic.consumeMaterials({ 'MAT-MOZZ': 100, 'MAT-GORG': 1000 });
          expect(bConsumed).to.equal(false);

          // Inside the transaction the Mozzarella deduction is visible ...
          const oMozzarella = await inventoryLogic.readMaterial('MAT-MOZZ');
          expect(oMozzarella.stockQuantity).to.equal(7900);

          throw new Error('simulated failure'); // ... like req.reject() in a handler
        });
      } catch (oCaught) {
        oError = oCaught;
      }

      expect(oError.message).to.equal('simulated failure');
      // ... but after the rollback, nothing was consumed
      const mStock = await readStockLevels();
      expect(mStock['MAT-MOZZ']).to.equal(8000);
      expect(mStock['MAT-GORG']).to.equal(150);
    });
  });

  describe('getOverview', () => {
    it('returns the key figures of the sample data', async () => {
      const { data: oKpis } = await GET(`${SERVICE}/getOverview()`);
      expect(oKpis.totalOrders).to.equal(6);
      expect(oKpis.pendingOrders).to.equal(3);
      expect(oKpis.confirmedRevenue).to.equal('93.00'); // 27.50 + 33.00 + 32.50
      expect(oKpis.currency).to.equal('EUR');
      expect(oKpis.lowStockMaterials).to.equal(3); // Ham, Gorgonzola, Olives
    });

    it('reflects a confirmed order', async () => {
      await confirm(ORDER_SO_1004);
      const { data: oKpis } = await GET(`${SERVICE}/getOverview()`);
      expect(oKpis.pendingOrders).to.equal(2);
      expect(oKpis.confirmedRevenue).to.equal('121.00'); // 93.00 + 28.00
    });
  });
});

describe('money helpers', () => {
  const { toCents, fromCents } = require('../srv/lib/orderLogic');

  it('calculates exactly with integer cents', () => {
    expect(0.1 + 0.2).not.to.equal(0.3); // the floating point problem ...
    expect(fromCents(toCents('0.10') + toCents('0.20'))).to.equal('0.30'); // ... solved
    expect(toCents('0.29')).to.equal(29);
    expect(toCents(8.5)).to.equal(850);
    expect(fromCents(toCents('10.50') * 3)).to.equal('31.50');
  });
});
