/*
 * Inventory logic - everything that reads or changes MATERIAL STOCK.
 *
 * The functions in this file are plain JavaScript functions that use CAP's
 * query language (CQL) to talk to the database. They are called by the
 * event handlers in ../store-service.js.
 *
 * TRANSACTIONS: we never open or commit a transaction here. CAP starts one
 * transaction per request; every `await SELECT/UPDATE ...` below
 * automatically runs inside it. If the request fails (e.g. `req.reject()`),
 * CAP rolls back ALL changes of that request.
 */
const cds = require('@sap/cds');
const { SELECT, UPDATE } = cds.ql;

const LOG = cds.log('inventory');

const STOCK_STATUS = {
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK'
};

/**
 * Business rule for the stock status of a material.
 *   0 or less               -> OUT_OF_STOCK
 *   below the minimum stock -> LOW_STOCK  (needs replenishment)
 *   otherwise               -> IN_STOCK
 */
function determineStockStatus(iStockQuantity, iMinimumStock) {
  if (iStockQuantity <= 0) {
    return STOCK_STATUS.OUT_OF_STOCK;
  }
  if (iStockQuantity < iMinimumStock) {
    return STOCK_STATUS.LOW_STOCK;
  }
  return STOCK_STATUS.IN_STOCK;
}

/** Reads one material from the database, or `undefined` if it does not exist. */
async function readMaterial(sMaterialId) {
  const { Materials } = cds.entities('pizzaflow.db');

  // SQL: SELECT * FROM pizzaflow_db_Materials WHERE ID = ? LIMIT 1
  return SELECT.one.from(Materials).where({ ID: sMaterialId });
}

/**
 * Stock Replenishment: adds `iQuantity` to the stock of a material.
 * Returns the updated material (including its stock status),
 * or `undefined` if the material does not exist.
 */
async function increaseStock(sMaterialId, iQuantity) {
  const { Materials } = cds.entities('pizzaflow.db');

  // Step 1: read the material BEFORE the update
  const oMaterialBefore = await readMaterial(sMaterialId);
  if (!oMaterialBefore) {
    return undefined;
  }

  // Step 2: increase the stock directly in the database.
  // '+=' lets the database calculate "stockQuantity = stockQuantity + ?",
  // so two parallel restocks can never overwrite each other.
  // WORKSHOP BREAKPOINT (Exercise 2): inspect oMaterialBefore.stockQuantity
  await UPDATE(Materials)
    .set({ stockQuantity: { '+=': iQuantity } })
    .where({ ID: sMaterialId });

  // Step 3: read the material AFTER the update and add the stock status
  const oMaterialAfter = await readMaterial(sMaterialId);
  oMaterialAfter.stockStatus = determineStockStatus(oMaterialAfter.stockQuantity, oMaterialAfter.minimumStock);

  LOG.info(
    `Restocked ${oMaterialAfter.name}: ${oMaterialBefore.stockQuantity} -> ` +
      `${oMaterialAfter.stockQuantity} ${oMaterialAfter.unitOfMeasure}`
  );
  return oMaterialAfter;
}

/**
 * Compares the required quantities with the available stock.
 *
 * @param {Object<string, number>} mRequirements - e.g. { 'MAT-MOZZ': 350, 'MAT-DOUGH': 3 }
 * @returns {Promise<Array>} one entry per material that is NOT sufficiently in stock
 *                           (an empty array means: everything is available)
 */
async function findStockShortages(mRequirements) {
  const { Materials } = cds.entities('pizzaflow.db');
  const aMaterialIds = Object.keys(mRequirements);

  // One query for all required materials: ... WHERE ID IN (?, ?, ...)
  const aMaterials = await SELECT.from(Materials)
    .columns('ID', 'name', 'stockQuantity', 'unitOfMeasure')
    .where({ ID: { in: aMaterialIds } });

  const aShortages = [];
  for (const oMaterial of aMaterials) {
    const iRequired = mRequirements[oMaterial.ID];

    // WORKSHOP BREAKPOINT (Exercise 3 + 4): compare required vs. available
    if (oMaterial.stockQuantity < iRequired) {
      aShortages.push({
        materialId: oMaterial.ID,
        name: oMaterial.name,
        required: iRequired,
        available: oMaterial.stockQuantity,
        unitOfMeasure: oMaterial.unitOfMeasure
      });
    }
  }
  return aShortages;
}

/**
 * Deducts the required quantities from the stock of each material.
 *
 * Every UPDATE only succeeds if enough stock is still available
 * ("... WHERE stockQuantity >= required"). If any update does not find
 * enough stock, we return `false` and the caller rejects the request -
 * CAP then rolls back the updates that were already executed.
 *
 * @returns {Promise<boolean>} true if ALL materials were consumed
 */
async function consumeMaterials(mRequirements) {
  const { Materials } = cds.entities('pizzaflow.db');

  for (const sMaterialId of Object.keys(mRequirements)) {
    const iRequired = mRequirements[sMaterialId];

    // WORKSHOP BREAKPOINT (Exercise 3): stock is reduced here
    const iUpdatedRows = await UPDATE(Materials)
      .set({ stockQuantity: { '-=': iRequired } })
      .where({ ID: sMaterialId, stockQuantity: { '>=': iRequired } });

    if (iUpdatedRows !== 1) {
      LOG.warn(`Could not consume ${iRequired} of ${sMaterialId} - not enough stock left`);
      return false;
    }
  }
  return true;
}

/** Number of materials whose stock is below the minimum stock (incl. out of stock). */
async function countMaterialsBelowMinimum() {
  const { Materials } = cds.entities('pizzaflow.db');
  const aMaterials = await SELECT.from(Materials).columns('stockQuantity', 'minimumStock');

  let iCount = 0;
  for (const oMaterial of aMaterials) {
    if (determineStockStatus(oMaterial.stockQuantity, oMaterial.minimumStock) !== STOCK_STATUS.IN_STOCK) {
      iCount++;
    }
  }
  return iCount;
}

module.exports = {
  STOCK_STATUS,
  determineStockStatus,
  readMaterial,
  increaseStock,
  findStockShortages,
  consumeMaterials,
  countMaterialsBelowMinimum
};
