/*
 * PizzaFlow - persistence model (CDS)
 *
 * This file describes WHAT data the application stores. CAP turns every
 * entity below into a database table (here: SQLite) and keeps the model as
 * the single source of truth for the OData service, the UI and the tests.
 *
 *   Master data       : Materials, Pizzas, RecipeItems   (changes rarely)
 *   Transactional data: SalesOrders, SalesOrderItems     (created every day)
 */
namespace pizzaflow.db;

using {
  cuid,
  managed
} from '@sap/cds/common';

// ---------------------------------------------------------------------------
// Reusable types
// ---------------------------------------------------------------------------

/** Money: up to 9 digits before and exactly 2 digits after the decimal point. */
type Amount       : Decimal(11, 2);

/** ISO 4217 currency code. The workshop uses EUR only. */
type CurrencyCode : String(3);

/**
 * Stock quantities are whole numbers in the material's base unit of measure
 * (g, ml or pc). Recipes use the same unit, so no unit conversion is needed.
 */
type StockQuantity: Integer;

type OrderStatus  : String(10) enum {
  PENDING;
  CONFIRMED;
};

type StockStatus  : String(15) enum {
  IN_STOCK;
  LOW_STOCK;
  OUT_OF_STOCK;
};

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

/** Raw materials (ingredients) kept in the restaurant's store room. */
entity Materials : managed {
  key ID                  : String(12);   // material number, e.g. MAT-MOZZ
      name                : String(60) not null;
      category            : String(30) not null;
      stockQuantity       : StockQuantity not null default 0;
      unitOfMeasure       : String(3) not null; // g, ml or pc
      minimumStock        : StockQuantity not null default 0;

      /*
       * Virtual elements are NOT stored in the database.
       * The value is calculated by an `after READ` handler in
       * srv/store-service.js every time materials are read.
       */
      virtual stockStatus : StockStatus;
}

/** Finished products that the restaurant sells. */
entity Pizzas {
  key ID          : String(12);   // product number, e.g. PZ-MARG
      name        : String(60) not null;
      description : String(255);
      price       : Amount not null;
      currency    : CurrencyCode default 'EUR';

      // Composition: recipe lines belong to the pizza and live and die with it.
      recipe      : Composition of many RecipeItems
                      on recipe.pizza = $self;
}

/** Bill of materials: how much of a material ONE pizza needs. */
entity RecipeItems : cuid {
  pizza            : Association to Pizzas not null;
  // Association: the material exists on its own, the recipe only points to it.
  material         : Association to Materials not null;
  quantityRequired : StockQuantity not null;
}

// ---------------------------------------------------------------------------
// Transactional data
// ---------------------------------------------------------------------------

/** Sales order header. `managed` adds createdAt/createdBy/modifiedAt/modifiedBy. */
entity SalesOrders : cuid, managed {
  orderNumber : String(10) not null; // business key, e.g. SO-1001
  status      : OrderStatus not null default 'PENDING';
  totalAmount : Amount not null default 0;
  currency    : CurrencyCode default 'EUR';
  itemCount   : Integer not null default 0;

  items       : Composition of many SalesOrderItems
                  on items.salesOrder = $self;
}

/** Sales order line: one pizza product with a quantity. */
entity SalesOrderItems : cuid {
  salesOrder : Association to SalesOrders not null;
  pizza      : Association to Pizzas not null;
  quantity   : Integer not null;
  unitPrice  : Amount not null; // price at the time of ordering
  totalPrice : Amount not null; // quantity x unitPrice
  currency   : CurrencyCode default 'EUR';
}
