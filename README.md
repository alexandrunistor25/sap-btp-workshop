# PizzaFlow — Pizza Restaurant Operations

A small but complete **SAP BTP** business application for a four-hour workshop:
an **SAP CAP** (Node.js) backend with an **OData V4** service and an **SAPUI5**
frontend in SAP Fiori style. Both run in **one Node.js process** and are
deployed to **SAP BTP Cloud Foundry** with a single `cf push`.

> [!WARNING]
> **This application exposes unauthenticated demo business operations. It must
> only be deployed with disposable sample data in an isolated workshop
> environment. Do not use this configuration for production or real business
> data.**

**Quick start** (details in [section 11](#11-local-installation-guide)):

```bash
git clone <repository-url>
cd sap-btp-workshop
npm install
npm run watch
```

Then open <http://localhost:4004/pizzaflow/webapp/index.html>.

---

## Contents

1. [What PizzaFlow is](#1-what-pizzaflow-is)
2. [Workshop learning objectives](#2-workshop-learning-objectives)
3. [SAP CAP introduction](#3-sap-cap-introduction)
4. [SAPUI5 introduction](#4-sapui5-introduction)
5. [SAP Fiori design principles used](#5-sap-fiori-design-principles-used)
6. [CAP architecture diagram](#6-cap-architecture-diagram)
7. [CDS domain model explanation](#7-cds-domain-model-explanation)
8. [OData V4 endpoint examples](#8-odata-v4-endpoint-examples)
9. [CRUD operations, actions and functions](#9-crud-operations-actions-and-functions)
10. [`before`, `on` and `after` handlers](#10-before-on-and-after-handlers)
11. [Local installation guide](#11-local-installation-guide)
12. [Running the application](#12-running-the-application)
13. [VS Code debugging instructions](#13-vs-code-debugging-instructions)
14. [Step-by-step debugging exercises](#14-step-by-step-debugging-exercises)
15. [SAP BTP Trial prerequisites](#15-sap-btp-trial-prerequisites)
16. [Cloud Foundry deployment guide](#16-cloud-foundry-deployment-guide)
17. [Common troubleshooting scenarios](#17-common-troubleshooting-scenarios)
18. [SQLite limitations](#18-sqlite-limitations)
19. [Authentication limitations](#19-authentication-limitations)
20. [Production architecture as a future extension](#20-production-architecture-as-a-future-extension)

Appendix: [Project structure](#appendix-a-project-structure) ·
[Automated tests](#appendix-b-automated-tests) ·
[Versions used](#appendix-c-versions-used)

---

## 1. What PizzaFlow is

PizzaFlow manages the daily operations of a small pizza restaurant:

- The **store room** holds raw **materials** (dough, mozzarella, tomato sauce …).
- Every **pizza** has a **recipe** that lists how much of each material one pizza needs.
- Guests place **sales orders**. A new order has the status **Pending**.
- When the kitchen **confirms** an order, the materials of all recipes are
  **consumed** from stock. If anything is missing, the confirmation is refused
  and **nothing** is changed.
- When a material runs low, the store manager **restocks** it.

These are the same ideas you saw in SAP S/4HANA, only much smaller:

| PizzaFlow             | ERP / SAP S/4HANA concept                         |
| --------------------- | ------------------------------------------------- |
| Material              | Material master (raw material)                    |
| Pizza                 | Finished product (sellable material)              |
| Recipe                | Bill of materials (BOM)                           |
| Sales order           | Sales order (SD)                                  |
| Confirm order         | Goods issue: stock is consumed                    |
| Restock material      | Goods receipt: stock is increased                 |
| Minimum stock         | Reorder point / safety stock                      |

The app has four pages:

| Page                   | Fiori floorplan | What you can do                                                    |
| ---------------------- | --------------- | ------------------------------------------------------------------ |
| **Overview**           | Overview page   | Key figures, latest orders, materials that need replenishment      |
| **Material Stock**     | List report     | Search materials, see stock status, **restock** a material         |
| **Sales Orders**       | List report     | Filter and search orders, **create** a new order                   |
| **Sales Order** detail | Object page     | See items and amounts, **confirm** a pending order                 |

The sample data is prepared for the exercises:

| Order   | Status    | Items                              | What happens on "Confirm"                                         |
| ------- | --------- | ---------------------------------- | ----------------------------------------------------------------- |
| SO-1001 | Confirmed | 2 × Margherita, 1 × Diavola        | Already confirmed                                                 |
| SO-1002 | Confirmed | 3 × Prosciutto e Funghi            | Already confirmed                                                 |
| SO-1003 | Confirmed | 1 × Quattro Formaggi, 2 × Vegetariana | Already confirmed                                              |
| SO-1004 | Pending   | 2 × Margherita, 1 × Prosciutto e Funghi | ✅ Succeeds                                                  |
| SO-1005 | Pending   | 4 × Quattro Formaggi, 1 × Diavola  | ❌ Fails: needs 200 g Gorgonzola, only 150 g in stock             |
| SO-1006 | Pending   | 2 × Diavola                        | ✅ Succeeds, but Pepperoni falls below its minimum (Low Stock)    |

---

## 2. Workshop learning objectives

After the workshop you can:

1. Clone a project from GitHub, install its dependencies and run it locally.
2. Explain how a **CDS model** becomes database tables and an **OData V4 service**.
3. Read data with OData URLs (`$filter`, `$expand`, `$select`, `$orderby`).
4. Explain the difference between **CRUD requests, actions and functions**.
5. Explain the CAP request phases **`before` → `on` → `after`**.
6. Set **breakpoints in VS Code** and follow a request from the browser down to the database.
7. Understand why a business operation must be **transactional** (all or nothing).
8. Recognise **SAP Fiori** floorplans, controls and semantic colours in an SAPUI5 app.
9. Deploy the application to **SAP BTP Cloud Foundry** with `cf push`.
10. Open the app through its **public URL**, read the **application logs** and
    observe what happens on a **restart**.

A possible agenda for the four hours:

| Time      | Topic                                                                 |
| --------- | --------------------------------------------------------------------- |
| 0:00–0:30 | Setup: check tools, clone, `npm install`, `npm run watch`             |
| 0:30–1:15 | Explore the UI, the CDS model and the OData service (sections 6–10)   |
| 1:15–2:30 | Debugging exercises 1–4 (section 14)                                  |
| 2:30–3:30 | Deploy to SAP BTP Cloud Foundry (sections 15–16)                      |
| 3:30–4:00 | Logs, restart behaviour, production architecture (sections 16, 18–20) |

---

## 3. SAP CAP introduction

The **SAP Cloud Application Programming Model (CAP)** is SAP's framework for
building business services. You describe your application with **CDS**
(Core Data Services) and CAP does most of the work for you:

| You write                                    | CAP gives you                                              |
| -------------------------------------------- | ---------------------------------------------------------- |
| Entities in `db/schema.cds`                  | Database tables (SQLite here, SAP HANA Cloud in production) |
| CSV files in `db/data/`                      | Sample data loaded automatically at startup                 |
| A service in `srv/store-service.cds`         | A complete OData V4 service incl. `$metadata`               |
| Nothing                                      | **Generic handlers** for reading, filtering, sorting, paging |
| Handlers in `srv/store-service.js`           | Your own business logic, called at the right moment         |

The three CAP layers in this project:

```text
db/schema.cds          WHAT data exists          (domain model)
srv/store-service.cds  WHAT the outside world may see and do   (service = API contract)
srv/store-service.js   HOW the operations work   (business logic)
```

Important CAP commands (run them with `npx` - nothing has to be installed globally):

| Command                 | Meaning                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run watch`         | = `cds watch`: development server, restarts when you save a file     |
| `npm start`             | = `cds-serve`: the production server (used by Cloud Foundry)         |
| `npx cds compile srv --to sql` | Shows the SQL tables CAP creates from the CDS model           |
| `npx cds compile srv --to edmx` | Shows the OData metadata CAP creates from the service        |

---

## 4. SAPUI5 introduction

**SAPUI5** is SAP's JavaScript UI framework. All SAP Fiori apps are built with
it. It follows the **Model-View-Controller** pattern:

| Part           | In this project                         | Responsibility                                         |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| **View**       | `app/pizzaflow/webapp/view/*.view.xml`  | Which controls are on the screen (XML)                 |
| **Controller** | `app/pizzaflow/webapp/controller/*.js`  | What happens when the user clicks (JavaScript)         |
| **Model**      | OData V4 model (from `manifest.json`)   | Business data from the CAP service                     |
|                | JSON models                             | UI state only, e.g. the values typed into a dialog     |

**Data binding** connects controls to the model. In
`Materials.view.xml` the table is bound to the entity set `/Materials` (simplified):

```xml
<Table id="materialsTable" items="{ path: '/Materials', parameters: { $orderby: 'name', $count: true } }">
  ...
  <ObjectNumber number="{stockQuantity}" unit="{unitOfMeasure}" />
```

The OData V4 model turns this binding into an HTTP request
(`GET /odata/v4/store/Materials?$orderby=name&$count=true&$select=…`).
You never write that request yourself.

Other files of the UI:

| File                     | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `index.html`             | Loads SAPUI5 **1.148.13** from SAP's CDN and starts the component       |
| `manifest.json`          | App descriptor: OData service URL, models, routes (pages), libraries    |
| `Component.js`           | Starts the app and the router                                           |
| `i18n/i18n.properties`   | All UI texts (no hard-coded texts in views)                             |
| `model/formatter.js`     | Turns status codes into text, colour and icon                           |
| `fragment/*.fragment.xml`| The Restock and Create Order dialogs                                    |

> [!NOTE]
> SAPUI5 is loaded from `https://ui5.sap.com/1.148.13/`. You need **internet
> access** in the browser, locally and after deployment.

---

## 5. SAP Fiori design principles used

| Principle                   | Where you see it                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Horizon theme**           | `sap_horizon`, the current SAP Fiori visual theme (`index.html`)                                              |
| **Floorplans**              | Overview (dynamic page with tiles), list reports (tables with search/filter), object page (order detail)      |
| **Shell and navigation**    | Tool header + side navigation (`sap.tnt.ToolPage`), breadcrumb back to the list on the object page            |
| **Semantic colours**        | Status is shown with **text + icon + colour**, never colour alone (see below)                                 |
| **One primary action**      | "Confirm Order", "Restock" and "Create Order" are the emphasised buttons                                      |
| **Dialogs for short tasks** | Restock and Create Order open a dialog instead of a new page                                                  |
| **Messages**                | Success → `MessageToast` (disappears); errors → `MessageBox` (must be closed); field errors → red value state |
| **Confirmation**            | Confirming an order asks first, because it consumes stock                                                     |
| **Responsive**              | Works on desktop, tablet and phone (the Create Order dialog opens full screen on phones)                      |
| **Accessibility**           | Labels for inputs, tooltips for icon buttons, keyboard navigation of standard controls                         |

Semantic status colours:

| Status       | Colour (ValueState) | Icon                 | Meaning                         |
| ------------ | ------------------- | -------------------- | ------------------------------- |
| In Stock     | Success (green)     | `sys-enter-2`        | Stock ≥ minimum stock           |
| Low Stock    | Warning (orange)    | `alert`              | 0 < stock < minimum stock       |
| Out of Stock | Error (red)         | `error`              | Stock is 0                      |
| Pending      | Information (blue)  | `pending`            | Order waits for confirmation    |
| Confirmed    | Success (green)     | `sys-enter-2`        | Materials were consumed         |

---

## 6. CAP architecture diagram

Everything runs in **one Node.js process** - locally and in Cloud Foundry:

```text
 Browser
   │  https://<app>.cfapps.<region>.hana.ondemand.com   (or http://localhost:4004)
   ▼
┌───────────────────────────── Node.js process (npm start = cds-serve) ─────────────────────────────┐
│  Express.js (CAP is built on it)                                                                  │
│                                                                                                   │
│   server.js ── request logger:  [http] - POST /odata/v4/store/... - 200 - 15ms                    │
│        │                                                                                          │
│        ├── /pizzaflow/webapp/*  ──► static files from ./app   (the SAPUI5 app)                    │
│        ├── /health              ──► built-in health check     (used by Cloud Foundry)             │
│        └── /odata/v4/store/*    ──► CAP OData V4 adapter                                          │
│                                        │                                                          │
│                                        ▼                                                          │
│                                  StoreService  (srv/store-service.cds + .js)                      │
│                                   before ─► on ─► after   handlers                                │
│                                        │                                                          │
│                                        ▼                                                          │
│                                  srv/lib/orderLogic.js · srv/lib/inventoryLogic.js                │
│                                        │  CQL: SELECT / INSERT / UPDATE                           │
│                                        ▼                                                          │
│                                  CAP database service  ──►  SQLite, in memory                     │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**The path of one request** (for example "Confirm Order"):

```text
Browser → UI5 OData Model → HTTP Request → CAP OData Adapter → CAP Event Handler → Business Logic → SQLite → Response
  click      invoke()        POST .../        parses URL and     before / on /       orderLogic.js    UPDATE    200 or
  button                     confirmOrder     body, creates req  after               inventoryLogic   SELECT    409 + message
```

**Generic vs. custom handlers.** We did not write a single line of code that
reads materials or orders. CAP's **generic handlers** translate
`GET /Materials?$filter=…` into SQL and build the OData response. We only wrote
**custom handlers** where real business logic is needed: the three actions,
the overview function and one `after READ` handler that calculates the stock
status.

---

## 7. CDS domain model explanation

File: `db/schema.cds` (namespace `pizzaflow.db`)

```text
┌──────────────┐ 1   recipe    * ┌──────────────┐ *        1 ┌──────────────┐
│    Pizzas    │◆───────────────►│ RecipeItems  │────────────►│  Materials   │
│ ID PZ-MARG   │  Composition    │ quantity-    │ Association │ ID MAT-MOZZ  │
│ name, price  │                 │ Required     │             │ stockQuantity│
└──────────────┘                 └──────────────┘             │ minimumStock │
        ▲                                                     └──────────────┘
        │ Association
        │ *
┌───────┴────────────┐ *    items    1 ┌──────────────┐
│  SalesOrderItems   │◄───────────────◆│ SalesOrders  │
│ quantity,unitPrice │   Composition   │ orderNumber  │
│ totalPrice         │                 │ status       │
└────────────────────┘                 │ totalAmount  │
                                       └──────────────┘
```

| Entity              | Kind               | Key                       | Notes                                                        |
| ------------------- | ------------------ | ------------------------- | ------------------------------------------------------------ |
| **Materials**       | Master data        | `MAT-…` (readable)        | `stockStatus` is **virtual** - calculated, not stored        |
| **Pizzas**          | Master data        | `PZ-…` (readable)         | Price in EUR, recipe as composition                          |
| **RecipeItems**     | Master data        | UUID (`cuid`)             | "One Margherita needs 125 g Mozzarella"                      |
| **SalesOrders**     | Transactional data | UUID (`cuid`)             | Business key `orderNumber` (SO-1001 …), status, total        |
| **SalesOrderItems** | Transactional data | UUID (`cuid`)             | Price **copied** at order time (later price changes don't matter) |

Reusable **aspects** from `@sap/cds/common`:

- `cuid` adds a key `ID` that CAP fills with a UUID.
- `managed` adds `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`, filled automatically.

### Association vs. composition

Both connect two entities. The difference is **ownership**:

| | **Association** | **Composition** |
|---|---|---|
| Meaning | "refers to" - a link to something that exists on its own | "consists of" - the child is a **part** of the parent |
| Example | An order item refers to a **pizza** | A sales order **consists of** its items |
| Lifecycle | Deleting an order item does **not** delete the pizza | Deleting a sales order **also deletes** its items |
| Deep insert | No | Yes: header + items are created in one `INSERT` (see `createOrder` in `orderLogic.js`) |
| In CDS | `pizza : Association to Pizzas;` | `items : Composition of many SalesOrderItems on items.salesOrder = $self;` |

Rule of thumb: if the child makes no sense without the parent (an order item
without an order), use a **composition**.

### Money and quantities

- Amounts use `Decimal(11, 2)` - never floating point, because `0.1 + 0.2` is
  not `0.3` in JavaScript. The backend calculates in **integer cents**
  (`toCents` / `fromCents` in `orderLogic.js`). OData sends decimals as strings,
  for example `"price": "8.50"`.
- Only EUR is used.
- Stock and recipe quantities are whole numbers in the material's base unit
  (`g`, `ml` or `pc`), so no unit conversion is needed.
- **Prices are always determined by the backend.** The client only sends pizza
  IDs and quantities.

---

## 8. OData V4 endpoint examples

The service root is **`/odata/v4/store/`**. Try these URLs in the browser while
`npm run watch` is running, or open [`test/requests.http`](test/requests.http)
in VS Code (extension *REST Client*) and click **Send Request**.

| What                                   | Request                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Service document                       | `GET /odata/v4/store/`                                                                        |
| Metadata (the API contract)            | `GET /odata/v4/store/$metadata`                                                               |
| All materials                          | `GET /odata/v4/store/Materials`                                                               |
| Selected fields, sorted                | `GET /odata/v4/store/Materials?$select=name,stockQuantity,stockStatus&$orderby=name`          |
| Materials below minimum stock          | `GET /odata/v4/store/Materials?$filter=stockQuantity lt minimumStock`                         |
| One material by key                    | `GET /odata/v4/store/Materials('MAT-MOZZ')`                                                   |
| Pizza with recipe and materials        | `GET /odata/v4/store/Pizzas('PZ-MARG')?$expand=recipe($expand=material)`                      |
| Pending orders with items              | `GET /odata/v4/store/SalesOrders?$filter=status eq 'PENDING'&$expand=items`                   |
| Number of orders                       | `GET /odata/v4/store/SalesOrders/$count`                                                      |
| Overview key figures (function)        | `GET /odata/v4/store/getOverview()`                                                           |
| Restock (bound action)                 | `POST /odata/v4/store/Materials('MAT-GORG')/StoreService.restockMaterial` body `{"quantity": 1000}` |
| Create order (unbound action)          | `POST /odata/v4/store/placeOrder` body `{"items":[{"pizzaID":"PZ-MARG","quantity":2}]}`      |
| Confirm order (bound action)           | `POST /odata/v4/store/SalesOrders(5a1e5000-0000-4000-8000-000000001004)/StoreService.confirmOrder` body `{}` |

With `curl` (macOS/Linux/Git Bash):

```bash
curl "http://localhost:4004/odata/v4/store/Materials?\$filter=stockQuantity%20lt%20minimumStock"

curl -X POST http://localhost:4004/odata/v4/store/placeOrder \
     -H "Content-Type: application/json" \
     -d '{"items":[{"pizzaID":"PZ-MARG","quantity":2},{"pizzaID":"PZ-DIAV","quantity":1}]}'
```

A **business error** looks like this (HTTP status `409 Conflict`):

```json
{
  "error": {
    "code": "409",
    "message": "Sales order SO-1005 cannot be confirmed. Insufficient stock: Gorgonzola (required 200 g, available 150 g)."
  }
}
```

---

## 9. CRUD operations, actions and functions

| | **CRUD** | **Action** | **Function** |
|---|---|---|---|
| Purpose | Create, Read, Update, Delete records | Execute a **business operation** | **Calculate / read** something |
| Changes data? | Create/Update/Delete: yes | Yes (usually) | **Never** |
| HTTP method | `GET` `POST` `PATCH` `DELETE` | `POST` | `GET` |
| Example here | `GET /Materials` | `restockMaterial`, `placeOrder`, `confirmOrder` | `getOverview()` |
| Who implements it? | CAP's **generic handlers** | **We** (`on` handler) | **We** (`on` handler) |

- **Bound** actions belong to one record:
  `Materials('MAT-MOZZ')/StoreService.restockMaterial` restocks *this* material.
- **Unbound** actions belong to the whole service: `placeOrder`.

All entities are annotated with **`@readonly`** in `srv/store-service.cds`.
A generic `DELETE /Materials('MAT-MOZZ')` or `PATCH` is refused by CAP with
`405 Method Not Allowed`. Data can only change through our actions, which
**always check the business rules**. A real ERP system works the same way:
you cannot just "edit" the stock of a material, you post a goods receipt.

---

## 10. `before`, `on` and `after` handlers

Every request becomes an **event** (`READ`, `restockMaterial`, `confirmOrder`, …).
CAP runs the handlers registered for that event in three phases:

| Phase      | Purpose                                    | In PizzaFlow (`srv/store-service.js`)                                         |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| **before** | Validate input, check preconditions        | `validateRestockQuantity`, `validateOrderInput`, `checkOrderCanBeConfirmed`   |
| **on**     | Do the actual work, produce the result     | `restockMaterial`, `placeOrder`, `confirmOrder`, `getOverview`                |
| **after**  | Post-process the result                    | `addStockStatus` calculates the virtual field `stockStatus` for each material |

```js
this.before('restockMaterial', Materials, validateRestockQuantity); // 1. check
this.on('restockMaterial', Materials, restockMaterial);              // 2. do
this.after('each', Materials, addStockStatus);                       // 3. enrich every material read
```

If a `before` handler calls **`req.reject(400, '...')`**, the `on` handler is
never called. For `READ` requests on Materials we did not register an `on`
handler - CAP's generic handler reads the database, then our `after` handler runs.

### The request object `req`

| Property      | Example value                                                  |
| ------------- | -------------------------------------------------------------- |
| `req.event`   | `'confirmOrder'`                                               |
| `req.target`  | the entity definition `StoreService.SalesOrders`               |
| `req.data`    | `{ quantity: 1000 }` (the request body / parameters)           |
| `req.params`  | `[ { ID: 'MAT-GORG' } ]` (the key from the URL)                |
| `req.user`    | `{ id: 'privileged', … }` (see [section 19](#19-authentication-limitations)) |
| `req.reject(status, message)` | ends the request with an error and **rolls back** its transaction |

### Transactions: all or nothing

CAP runs every request in a **database transaction**:

- The handler finishes without error → **commit**: all changes are saved together.
- The handler calls `req.reject(...)` or throws → **rollback**: all changes of
  this request are undone.

`confirmOrder` reduces the stock of several materials and then changes the order
status. If anything goes wrong in between, CAP rolls back everything - the stock
is never partially consumed. The test *"rolls back stock that was already consumed
when the transaction fails"* in `test/store-service.test.js` proves it.

---

## 11. Local installation guide

### 11.1 Install the tools

| Tool | Version | Download | Needed for |
| ---- | ------- | -------- | ---------- |
| **Node.js** | **22.12 or newer, or 24** (LTS) | <https://nodejs.org> | Running CAP (uses Node's built-in SQLite) |
| npm | comes with Node.js | | Installing packages |
| **Git** | any recent | <https://git-scm.com> | Cloning the repository |
| **VS Code** | any recent | <https://code.visualstudio.com> | Editing and debugging |
| **cf CLI** | **v8** | <https://github.com/cloudfoundry/cli/wiki/V8-CLI-Installation-Guide> | Deploying to SAP BTP |
| Chrome or Edge | any recent | | Running the app, browser developer tools |

When you open the folder in VS Code it suggests two extensions
(`.vscode/extensions.json`). Install them:

- **SAP CDS Language Support** - syntax highlighting and code completion for `.cds` files
- **REST Client** - send the requests in `test/requests.http`

You do **not** need to install `@sap/cds-dk` globally: it is a project
dependency, use `npx cds …`.

### 11.2 Check your environment

Open a terminal (VS Code: *Terminal → New Terminal*) and run:

```bash
node --version    # Node.js runtime. Must be v22.12.0 or higher (e.g. v22.x or v24.x)
npm --version     # Node package manager, installed together with Node.js (e.g. 10.x or 11.x)
git --version     # Git, used to clone the repository
cf --version      # Cloud Foundry CLI. Must start with "cf version 8"
```

If a command is "not found", that tool is not installed or not on your `PATH`
(restart the terminal after installing).

### 11.3 Clone and install

```bash
git clone <repository-url>      # copies the project to your computer
cd sap-btp-workshop             # go into the project folder
npm install                     # downloads all dependencies into node_modules/
```

`npm install` takes about a minute. Warnings are fine; errors are not (see
[section 17](#17-common-troubleshooting-scenarios)).

---

## 12. Running the application

### 12.1 Development mode

```bash
npm run watch
```

This runs `cds watch`: it compiles the CDS model, creates the in-memory SQLite
database, loads the CSV sample data and starts the server on port **4004**. When
you **save** a `.cds` or `.js` file in `db/` or `srv/`, the server restarts
automatically.

You should see:

```text
[cds] - connect to db > sqlite { url: ':memory:' }
  > init from db/data/pizzaflow.db-Materials.csv
  ...
[cds] - using auth strategy { kind: 'dummy' }
[cds] - serving StoreService { at: [ '/odata/v4/store' ], impl: 'srv/store-service.js' }
[http] - SAPUI5 app available at /pizzaflow/webapp/index.html
[cds] - server listening on { url: 'http://localhost:4004' }
```

| URL | What |
| --- | ---- |
| <http://localhost:4004/pizzaflow/webapp/index.html> | **The PizzaFlow app** |
| <http://localhost:4004/> | CAP's development index page (only in development mode) |
| <http://localhost:4004/odata/v4/store/> | The OData service |
| <http://localhost:4004/odata/v4/store/$metadata> | The OData metadata |
| <http://localhost:4004/health> | Health check: `{"status":"UP"}` |

Stop the server with **Ctrl+C**.

Every request is logged by the middleware in `server.js`:

```text
[http] - GET /odata/v4/store/Materials?$orderby=name&$count=true&$select=... - 200 - 6ms
[inventory] - Restocked Gorgonzola: 150 -> 1150 g
[store] - Sales order SO-1004 confirmed by privileged
```

To also see the CAP request context logged by `logRequestContext`
(`event | target | user`) for every event, start with debug logging for the
`store` logger:

```bash
DEBUG=store npm run watch                      # macOS / Linux / Git Bash
$env:DEBUG="store"; npm run watch              # Windows PowerShell
```

> [!IMPORTANT]
> The database lives **in memory**. Every restart - also the automatic restart
> when you save a file - **resets all data** to the sample data. Changes to
> files in `app/` do **not** restart the server; just reload the browser.

### 12.2 Production mode (like Cloud Foundry)

```bash
npm run start:prod                                     # macOS / Linux / Git Bash
$env:NODE_ENV="production"; npm start                  # Windows PowerShell
```

Differences to development mode: no CAP index page (the root URL `/` redirects
to the app), no automatic restarts, no CORS. Open
<http://localhost:4004/> - it forwards to `/pizzaflow/webapp/index.html`.
(In PowerShell, run `Remove-Item Env:NODE_ENV` afterwards.)

### 12.3 Run the automated tests

```bash
npm test
```

See [Appendix B](#appendix-b-automated-tests).

---

## 13. VS Code debugging instructions

### 13.1 Backend (CAP, Node.js)

The project contains `.vscode/launch.json` with three configurations. Open
**Run and Debug** (`Ctrl+Shift+D` / `Cmd+Shift+D`) and select one in the
dropdown at the top:

| Configuration | When to use |
| ------------- | ----------- |
| **PizzaFlow: Debug server (cds watch)** | **Recommended.** Starts `npm run watch` with the debugger attached. Also reattaches after automatic restarts. |
| **PizzaFlow: Attach to 'cds watch --debug'** | First run `npx cds watch --debug` in a terminal, then start this configuration (port 9229). |
| **PizzaFlow: Debug tests** | Runs `npm test` with breakpoints. |

Steps:

1. Stop any running `npm run watch` (Ctrl+C) - port 4004 can only be used once.
2. Select **PizzaFlow: Debug server (cds watch)** and press **F5**.
   The orange status bar shows that the debugger is attached.
3. Open a file, e.g. `srv/store-service.js`, and click left of a line number.
   A **red dot** is a breakpoint. Look for `// WORKSHOP BREAKPOINT` comments.
4. Do something in the app (e.g. open *Material Stock*). VS Code stops at
   your breakpoint and highlights the line.

| Key | Debugger command |
| --- | ---------------- |
| **F5** | Continue to the next breakpoint |
| **F10** | Step over (execute this line) |
| **F11** | Step into (go into the called function) |
| **Shift+F11** | Step out (finish the current function) |
| **Shift+F5** | Stop debugging (stops the server) |

While paused, look at the **Variables** panel (`req`, `oMaterial`, …), add
expressions to **Watch** (e.g. `req.data`), or type them in the **Debug
Console** (e.g. `req.params[0].ID`).

> [!TIP]
> If the launch configuration does not work on your machine, use the fallback:
> *Terminal → New Terminal → ˅ → **JavaScript Debug Terminal***, then run
> `npm run watch` in that terminal. VS Code attaches to every Node.js process
> started in it.

**Conditional breakpoints:** right-click a breakpoint → *Edit Breakpoint* →
enter e.g. `oMaterial.ID === 'MAT-GORG'`. It stops only when the condition is true.

### 13.2 Frontend (SAPUI5, browser)

Open the app in Chrome or Edge and press **F12** (developer tools):

- **Network** tab → filter by `odata`: every OData request the UI sends, with
  URL, request body, status and response. (The app uses the OData group
  `$direct`, so each request is sent on its own and is easy to read. Productive
  Fiori apps usually bundle requests into one `$batch` request.)
- **Sources** tab → `Ctrl+P` / `Cmd+P` → type `Materials.controller.js` →
  click a line number to set a breakpoint in the browser.
- **Console** tab → messages and errors. A failed business operation (409/400)
  appears here in red - this is **expected** in the exercises.

---

## 14. Step-by-step debugging exercises

Start the backend with **PizzaFlow: Debug server (cds watch)** (section 13) and open
<http://localhost:4004/pizzaflow/webapp/index.html> with the developer tools (F12)
open on the **Network** tab.

> [!NOTE]
> The line numbers refer to the files as they are in the repository. Each
> location is marked with a `// WORKSHOP BREAKPOINT` comment directly above.

### Exercise 1 — Read material data

*Goal: follow a read request. Notice that we never wrote code that reads the database.*

| # | File : line | Function | Phase |
|---|-------------|----------|-------|
| 1 | `srv/store-service.js:247` | `addStockStatus` | after |

1. Set the breakpoint above.
2. Click **Material Stock** in the side navigation.
3. In the browser's **Network** tab, find the request:
   `GET /odata/v4/store/Materials?$orderby=name&$count=true&$select=ID,category,…&$skip=0&$top=20`.
   The UI5 OData model created it from the table binding in `Materials.view.xml`
   (`$select` is added automatically because of `autoExpandSelect` in `manifest.json`).
4. VS Code stops in `addStockStatus`. Inspect `oMaterial` - it is **one row
   read from the database**: `stockQuantity`, `minimumStock` … but no `stockStatus`.
5. Press **F10** twice and watch `oMaterial.stockStatus` appear (e.g. `IN_STOCK`).
6. Press **F5** - it stops again for the next material (it runs once per row).
   Remove the breakpoint and press F5 to continue.
7. Look at the response in the Network tab: every material now has `stockStatus`.

**Discuss:** Who executed the SQL `SELECT`? → CAP's **generic handler**. We only
added an `after` handler. Where does `stockStatus` come from, since it is not a
database column? → It is a `virtual` element in `db/schema.cds`.

### Exercise 2 — Restock a material

*Goal: see validation, the action handler and the stock update.*

| # | File : line | Function | Phase |
|---|-------------|----------|-------|
| 1 | `app/pizzaflow/webapp/controller/Materials.controller.js:88` (browser) | `onRestockConfirm` | UI |
| 2 | `srv/store-service.js:81` | `validateRestockQuantity` | before |
| 3 | `srv/store-service.js:162` | `restockMaterial` | on |
| 4 | `srv/lib/inventoryLogic.js:66` | `increaseStock` - before the `UPDATE` | logic |
| 5 | `srv/lib/inventoryLogic.js:71` | `increaseStock` - after the `UPDATE` | logic |

1. Set the breakpoints (no. 1 in the browser's Sources tab, the others in VS Code).
2. On **Material Stock**, select **Gorgonzola** (150 g, *Low Stock*), click
   **Restock**, enter `1000` and click **Restock**.
3. Browser stop: `oAction.invoke()` is about to send the request. Press F8 (continue).
4. Network tab: `POST /odata/v4/store/Materials('MAT-GORG')/StoreService.restockMaterial`
   with the body `{"quantity":1000}`.
5. VS Code stop in **`validateRestockQuantity`**: inspect `req.data`
   (`{ quantity: 1000 }`) and `req.params` (`[{ ID: 'MAT-GORG' }]`).
6. Continue (F5) → **`restockMaterial`** → continue → **`increaseStock`**:
   `oMaterialBefore.stockQuantity` is **150**.
7. Continue → after the update: step over line 71 (F10) and inspect
   `oMaterialAfter.stockQuantity` = **1150**.
8. Continue. The UI shows a success message and the status changes to *In Stock*.
   The terminal shows `[inventory] - Restocked Gorgonzola: 150 -> 1150 g`.

**Try:** The UI already refuses `0` or `-5`. But never trust the client! Send
request **8** in `test/requests.http` (`{"quantity": -5}`) - the **before**
handler rejects it with `400` and the `on` handler is never reached. Request
**9** (`"abc"`) is rejected by CAP itself, because the CDS parameter is an
`Integer`.

**Discuss:** Why `UPDATE … set stockQuantity += 1000` instead of reading the stock,
adding 1000 in JavaScript and writing it back? → Two parallel requests could
overwrite each other. The database calculates the new value atomically.

### Exercise 3 — Confirm a sales order (main exercise)

*Goal: step through a complete business transaction.*

| # | File : line | Function | What happens |
|---|-------------|----------|--------------|
| 1 | `app/pizzaflow/webapp/controller/OrderDetail.controller.js:60` (browser) | `confirmOrder` | The UI sends the action |
| 2 | `srv/store-service.js:141` | `checkOrderCanBeConfirmed` | **before**: order exists and is PENDING? |
| 3 | `srv/store-service.js:188` | `confirmOrder` | **on**: start of the confirmation |
| 4 | `srv/lib/orderLogic.js:56` | `loadOrderWithItems` | Step 1: read order + items |
| 5 | `srv/lib/orderLogic.js:169` | `calculateMaterialRequirements` | Step 2: recipe × quantity |
| 6 | `srv/lib/inventoryLogic.js:102` | `findStockShortages` | Step 3: required vs. available |
| 7 | `srv/lib/inventoryLogic.js:132` | `consumeMaterials` | Step 4: reduce stock |
| 8 | `srv/lib/orderLogic.js:189` | `markOrderAsConfirmed` | Step 5: PENDING → CONFIRMED |

Tip: you can also set only breakpoint 3 and use **F11 (step into)** on each
`await …` line of `confirmOrder` - every step is its own function.

1. Set the breakpoints.
2. Go to **Sales Orders** → open **SO-1004** (2 × Margherita, 1 × Prosciutto e
   Funghi, *Pending*) → **Confirm Order** → confirm the question.
3. Follow the request with F5 and inspect:
   - `checkOrderCanBeConfirmed`: `req.params` → `[{ ID: '5a1e5000-…-000000001004' }]`;
     `oOrder.status` is `'PENDING'`.
   - `confirmOrder`: `req.event` is `'confirmOrder'`, `req.target.name` is
     `'StoreService.SalesOrders'`, `req.user.id` is `'privileged'`.
   - `calculateMaterialRequirements`: watch `mRequirements` grow item by item. Result:

     | Material | Calculation | Required |
     | -------- | ----------- | -------- |
     | MAT-DOUGH | 2 × 1 + 1 × 1 | 3 pc |
     | MAT-TOMSC | 2 × 80 + 1 × 80 | 240 ml |
     | MAT-MOZZ | 2 × 125 + 1 × 100 | 350 g |
     | MAT-HAM | 1 × 70 | 70 g |
     | MAT-MUSH | 1 × 50 | 50 g |

   - `findStockShortages`: for each material `oMaterial.stockQuantity` ≥
     `iRequired` → `aShortages` stays empty.
   - `consumeMaterials`: one `UPDATE` per material; `iUpdatedRows` is `1`.
   - `markOrderAsConfirmed`: the `UPDATE` only matches if the status is still `PENDING`.
4. Back in the app: the order is *Confirmed*, the Confirm button is gone. On
   **Material Stock**, Mozzarella dropped from 8000 g to 7650 g.

**Discuss:** At which moment are the changes saved? → When `confirmOrder`
returns without an error, CAP **commits** the transaction. Until then, nothing
is final. **Try:** confirm **SO-1006** - afterwards Pepperoni is *Low Stock*
(1100 g → 980 g, minimum 1000 g) and the *Materials Below Minimum* tile on the
Overview goes up.

### Exercise 4 — Business error

*Goal: see how an error travels from the backend to the user.*

| # | File : line | Function | What happens |
|---|-------------|----------|--------------|
| 1 | `srv/lib/inventoryLogic.js:102` (condition `oMaterial.ID === 'MAT-GORG'`) | `findStockShortages` | The failed stock check |
| 2 | `srv/store-service.js:200` | `confirmOrder` | `req.reject(409, …)` |
| 3 | `app/pizzaflow/webapp/controller/OrderDetail.controller.js:60` (browser) | `confirmOrder` | The rejected `invoke()` |
| 4 | `app/pizzaflow/webapp/controller/BaseController.js:28` (browser) | `showError` | The error dialog |

> If you did exercise 2, Gorgonzola has enough stock now. **Restart the server**
> (Shift+F5, then F5) to reset the data first.

1. Set the breakpoints. For no. 1 use a **conditional breakpoint** (section 13.1).
2. Open **SO-1005** (4 × Quattro Formaggi, 1 × Diavola) → **Confirm Order**.
3. VS Code stops in `findStockShortages`: `iRequired` is **200** (4 × 50 g),
   `oMaterial.stockQuantity` is **150**. Step over (F10) - the `if` is true and a
   shortage is added.
4. Continue → `confirmOrder` line 200: `aShortages` contains Gorgonzola. Step over
   to line 203: **`req.reject(409, …)`**. No stock was changed - step 4 is never reached.
5. Network tab: the `POST …/StoreService.confirmOrder` request has status
   **409**; the response contains the message (see [section 8](#8-odata-v4-endpoint-examples)).
   The red error in the browser console is **expected**.
6. Browser stop in `OrderDetail.controller.js`: press F8 - `invoke()` fails and
   the `catch` block calls `showError(oError)`.
7. Browser stop in `showError`: inspect `oError.message` (the text from
   `req.reject`) and `oError.status` (`409`). Continue - the user sees a
   **MessageBox** with the reason.
8. Fix the problem like a store manager would: **restock** Gorgonzola (e.g. 500 g)
   and confirm SO-1005 again - now it succeeds.

The terminal also shows the rejected request (with a stack trace) and
`[http] - POST …/StoreService.confirmOrder - 409 - 17ms` - expected as well.

**Discuss:** Why `409 Conflict` and not `500`? → The request is valid, but it
conflicts with the current state of the data. `4xx` = "the client can fix it",
`5xx` = "the server has a bug".

---

## 15. SAP BTP Trial prerequisites

1. **Open the SAP BTP trial**: <https://account.hanatrial.ondemand.com>. If you
   don't have an SAP account yet, register there for free.
2. **Start your trial account**. Choose a region close to you if asked (e.g.
   **US East (VA) - AWS**, `us10`). Setting up takes a few minutes.
3. The trial creates a **subaccount** (`trial`) with the **Cloud Foundry
   environment** enabled, an **org** and a **space** (`dev`).
4. **Find your Cloud Foundry API endpoint**: in the SAP BTP cockpit open your
   subaccount → **Overview** → section **Cloud Foundry Environment** →
   **API Endpoint**, for example:

   ```text
   https://api.cf.us10-001.hana.ondemand.com
   ```

   Also note the **Org Name** shown there. The endpoint depends on the region of
   *your* subaccount - copy it from *your* cockpit, don't guess it.
5. Check the **quota**: PizzaFlow needs **256 MB** of memory. The trial quota is
   enough. If other apps use all of it, stop or delete them first.
6. Install the **cf CLI v8** (section 11.1) and check `cf --version`.

Trial accounts have a limited lifetime, and the platform may stop trial apps
after some time. If your app is stopped, start it again with `cf start pizzaflow`.

---

## 16. Cloud Foundry deployment guide

All commands are run in the project folder (where `manifest.yml` is).

### 16.1 Log in and select your space

```bash
cf login -a <CF_API_ENDPOINT> --sso
```

**Logs you in** to Cloud Foundry. `-a` is the API endpoint from section 15.
`--sso` prints a link: open it in the browser, log in with your SAP account and
copy the **temporary authentication code** back into the terminal. If you have
several orgs or spaces, you are asked to pick one.

```bash
cf target
```

**Shows where you are logged in**: API endpoint, user, org and space. Everything
you push goes to this space. Switch with `cf target -o <org> -s <space>`.

### 16.2 Deploy

```bash
cf push
```

**Uploads and starts the app.** `cf push` reads `manifest.yml` and then:

1. **Uploads** the project files - except those listed in `.cfignore`
   (`node_modules`, tests, `.vscode` …).
2. **Stages** the app with the `nodejs_buildpack`: it installs a Node.js
   version that matches `engines` in `package.json` and runs `npm install`
   for the **production dependencies** only (`@sap/cds`, `@cap-js/sqlite`).
3. **Starts** the app with `npm start` (= `cds-serve`). CAP listens on the port
   Cloud Foundry gives it (environment variable `PORT`).
4. **Checks health**: Cloud Foundry calls `/health` until it answers `UP`.
5. **Maps a route**: because of `random-route: true` you get a unique URL like
   `pizzaflow-brave-panda-ab.cfapps.us10-001.hana.ondemand.com`.

At the end you see `routes:` and `#0 running`. This takes 1–3 minutes.

`manifest.yml` explained:

| Setting | Value | Why |
| ------- | ----- | --- |
| `name` | `pizzaflow` | Name of the app in Cloud Foundry |
| `random-route` | `true` | Unique URL, so many students can deploy in the same region |
| `instances` | `1` | One instance only - each instance would have its own in-memory database |
| `memory` / `disk_quota` | `256M` / `1G` | Measured: the app uses about 110 MB of memory |
| `buildpacks` | `nodejs_buildpack` | Node.js runtime |
| `command` | `npm start` | Starts `cds-serve` |
| `health-check-type` / `-endpoint` | `http` / `/health` | CAP's built-in health endpoint |
| `env.NODE_ENV` | `production` | Production mode for CAP |

### 16.3 Open the app

```bash
cf apps
```

**Lists your apps** with their state (`started`), instances (`1/1`), memory and
**URLs** (`routes`). Open:

```text
https://<your-route>/pizzaflow/webapp/index.html
```

The root URL `https://<your-route>/` redirects there as well. Same origin for UI
and OData, so no proxy or CORS settings are needed.

### 16.4 Look at the logs

```bash
cf logs pizzaflow --recent
```

**Shows the latest log lines** of the app (startup, requests, errors). Lines
from our app start with `[APP/PROC/WEB/0]`, lines from the Cloud Foundry router
with `[RTR/…]`:

```text
[APP/PROC/WEB/0] OUT [http] - POST /odata/v4/store/Materials('MAT-GORG')/StoreService.restockMaterial - 200 - 9ms
[APP/PROC/WEB/0] OUT [inventory] - Restocked Gorgonzola: 150 -> 1150 g
```

Without `--recent` (`cf logs pizzaflow`) the logs are **streamed live** until you
press Ctrl+C. Try it: keep it running, click through the app and watch the
requests appear.

### 16.5 Restart and watch the data reset

```bash
cf restart pizzaflow
```

**Stops and starts the app.** Exercise:

1. Create a new order in the deployed app (it becomes SO-1007).
2. Run `cf restart pizzaflow` and wait for `#0 running`.
3. Reload the app - SO-1007 is **gone**, all sample data is back.

Why? The database lives in the memory of the process. A restart starts a new
process with a new, empty database (see [section 18](#18-sqlite-limitations)).

### 16.6 Clean up after the workshop

```bash
cf delete pizzaflow -r
```

**Deletes the app** and (`-r`) its route. Do this at the end - the app has no
authentication (see [section 19](#19-authentication-limitations)).

Other useful commands: `cf app pizzaflow` (details of one app),
`cf events pizzaflow` (crashes and restarts), `cf stop pizzaflow` / `cf start pizzaflow`.

---

## 17. Common troubleshooting scenarios

| Problem | Cause and solution |
| ------- | ------------------ |
| `npm install` prints `EBADENGINE`, or the server stops with `Node.js version 22.12 or higher is required for @sap/cds` | Node.js is too old. Install Node.js **22.12+ or 24**, open a **new** terminal, check `node --version`, delete `node_modules` and run `npm install` again. |
| `EADDRINUSE: address already in use :::4004` | Another server is still running (other terminal, debug session). Stop it (Ctrl+C / Shift+F5) or use another port: `PORT=4005 npm run watch` (PowerShell: `$env:PORT=4005; npm run watch`). |
| The page stays **blank** | SAPUI5 is loaded from the internet. Check the Network tab for `sap-ui-core.js`; check your internet / proxy / firewall. Open the exact URL `/pizzaflow/webapp/index.html`. |
| My data **disappeared** | The in-memory database is reset on every restart, including the automatic restart after saving a file in `db/` or `srv/`. This is intended. |
| My UI change is not visible | Reload the browser with Ctrl+Shift+R (Cmd+Shift+R) to bypass the cache. |
| Breakpoints are **grey / hollow** and never hit | The server was not started with the debugger. Stop `npm run watch` and start **PizzaFlow: Debug server (cds watch)** or use the JavaScript Debug Terminal (section 13). Breakpoints in `node_modules` are skipped on purpose. |
| Red **409/400 errors** in the browser console | Expected when an operation is rejected by the backend (exercise 4). The app shows the message in a dialog. |
| "Sales order … has already been confirmed" | Only pending orders can be confirmed. Restart the server to reset the sample data. |
| `npm run start:prod` fails on Windows (`'NODE_ENV' is not recognized`) | Use `$env:NODE_ENV="production"; npm start` in PowerShell. |
| `cf login`: authentication failed | Use `--sso` and copy the **current** code from the link; codes are valid only once and for a short time. Check the API endpoint in your cockpit. |
| `cf push`: `memory quota exceeded` / `insufficient resources` | Your space has no memory left. `cf apps` → stop or delete apps you don't need. |
| `cf push`: staging fails, e.g. `Unable to install node` | The buildpack has no Node.js version matching `engines` in `package.json`. Run `cf buildpacks` and check the Node.js versions of the `nodejs_buildpack`; adjust `engines` to an available version **22.12+**. |
| App state `crashed`, push ends with `Start unsuccessful` | Read `cf logs pizzaflow --recent` and `cf events pizzaflow`. Typical causes: an error in a `.cds` / `.js` file - run `npm run start:prod` locally first. |
| Deployed app returns `404 Not Found. Requested route ... does not exist` | The app is stopped or deleted (trial accounts stop apps regularly). `cf apps`, then `cf start pizzaflow`. |

---

## 18. SQLite limitations

PizzaFlow uses **SQLite in memory** (`"db": "sqlite:memory"` in `package.json`)
so that it runs everywhere without a database service. This is **only for
demonstration**:

- **Data is not persistent.** It only exists in the memory of the running process.
- **Restarts reset the data** - locally on every `cds watch` restart, in Cloud
  Foundry on `cf restart`, `cf push`, a crash or a platform update.
- **Each Cloud Foundry instance would have its own isolated database.** With two
  instances, users would see different data depending on which instance answers.
  That is why `manifest.yml` uses `instances: 1`.
- No backups, no sharing between apps, limited concurrency.

Productive SAP BTP applications use a shared, persistent database, usually
**SAP HANA Cloud** (see [section 20](#20-production-architecture-as-a-future-extension)).
The CDS model and the business logic would stay the same - CAP abstracts the
database.

---

## 19. Authentication limitations

> [!WARNING]
> **This application exposes unauthenticated demo business operations. It must
> only be deployed with disposable sample data in an isolated workshop
> environment. Do not use this configuration for production or real business
> data.**

- `package.json` configures `"auth": "dummy"`. CAP accepts **every** request and
  runs it as the built-in user **`privileged`** (`req.user.id`), which passes
  every authorization check.
- There is **no login**. Anybody who knows the URL can read the data and run
  the actions - also in Cloud Foundry.
- There are no hard-coded passwords or fake logins in the code.

How real applications do it is explained in the comment block **AUTHENTICATION &
AUTHORIZATION** at the top of `srv/store-service.cds`:

```cds
@requires: 'authenticated-user'              // everybody must log in
service StoreService {
  @restrict: [
    { grant: 'READ',            to: 'authenticated-user' },
    { grant: 'restockMaterial', to: 'StoreManager' }      // only this role
  ]
  entity Materials as projection on db.Materials;
}
```

With an SAP identity service (**SAP Cloud Identity Services - IAS** or
**XSUAA**), users log in through an application router, CAP validates the
token of every request, fills `req.user` with the real user and roles, and
enforces these annotations.

---

## 20. Production architecture as a future extension

The workshop setup is intentionally minimal. A productive SAP BTP application
typically looks like this:

```text
 Browser
   │
   ▼
 SAP Build Work Zone (launchpad)  ──or──  Application Router (@sap/approuter)
   │   login via SAP Cloud Identity Services (IAS) / XSUAA, forwards the user's token
   ├──► HTML5 Application Repository   (SAPUI5 app, built and minified)
   ▼
 CAP service (Node.js, several instances)  ── validates token, enforces @requires / @restrict
   │
   ▼
 SAP HANA Cloud (HDI container)  ── persistent, shared by all instances
```

| Workshop (today) | Production |
| ---------------- | ---------- |
| SQLite in memory | SAP HANA Cloud, deployed via an HDI container (`cds add hana`) |
| `auth: dummy` | IAS or XSUAA, roles and `@restrict` (`cds add ias` / `cds add xsuaa`) |
| `cf push` of one app | **MTA** (`mta.yaml`, `mbt build`, `cf deploy`) with several modules and services |
| UI served by CAP from `./app` | Application router + HTML5 Application Repository / SAP Build Work Zone |
| SAPUI5 from the CDN, files not minified | `ui5 build`: component preload, minified, versioned |
| 1 instance, data lost on restart | Several instances, autoscaling, zero-downtime deployments |
| Logs in `cf logs` | SAP Cloud Logging, alerting |
| Manual deployment | CI/CD pipeline with automated tests |

The commands in brackets are only for orientation - they are **not** part of
this workshop.

---

## Appendix A: Project structure

```text
sap-btp-workshop/
├── db/
│   ├── schema.cds                     Domain model: entities, types, associations, compositions
│   └── data/                          Sample data (CSV, file name = <namespace>-<Entity>.csv)
├── srv/
│   ├── store-service.cds              OData service: projections, actions, function, auth notes
│   ├── store-service.js               Event handlers: before / on / after
│   └── lib/
│       ├── orderLogic.js              Orders: create, totals, recipe requirements, confirm
│       └── inventoryLogic.js          Stock: status, restock, shortage check, consumption
├── app/pizzaflow/
│   ├── ui5.yaml                       UI5 tooling configuration (used by the UI5 linter)
│   └── webapp/                        The SAPUI5 app (served by CAP as static files)
│       ├── index.html, manifest.json, Component.js
│       ├── view/                      App, Overview, Materials, Orders, OrderDetail
│       ├── controller/                One controller per view + BaseController
│       ├── fragment/                  RestockDialog, CreateOrderDialog
│       ├── model/formatter.js         Status → text / colour / icon
│       └── i18n/i18n.properties       UI texts
├── test/
│   ├── store-service.test.js          Backend tests (business logic, transactions)
│   ├── app-serving.test.js            UI + OData from one process, production mode
│   └── requests.http                  Sample requests for the VS Code REST Client
├── .vscode/launch.json                Debug configurations
├── server.js                          Request logging middleware, root redirect
├── manifest.yml                       Cloud Foundry deployment descriptor
├── .cfignore                          Files not uploaded by cf push
└── package.json                       Dependencies, scripts, CAP configuration
```

## Appendix B: Automated tests

```bash
npm test
```

runs all `*.test.js` files with Node's built-in test runner and
`@cap-js/cds-test`. Each test starts with fresh sample data.

| File | What is tested |
| ---- | -------------- |
| `test/store-service.test.js` | Reading materials (incl. calculated status), pizzas and recipes · read-only protection · creating a pending order and calculating totals · restocking and invalid quantities · confirming with enough stock · stock status after consumption · rejecting insufficient stock **without changing stock** · rejecting duplicate confirmation · **rollback** of already consumed stock · overview key figures · money helpers |
| `test/app-serving.test.js` | The SAPUI5 app is served with the pinned UI5 version · the app points to the OData service root `/odata/v4/store/` · in **production mode** (`npm start`, `NODE_ENV=production`): `/health`, redirect from `/`, app and OData served by the same process |

## Appendix C: Versions used

| Component | Version |
| --------- | ------- |
| `@sap/cds` (CAP runtime) | 10.2.2 |
| `@cap-js/sqlite` | 3.1.3 |
| `@sap/cds-dk` (development tools) | 10.2.1 |
| `@cap-js/cds-test` | 1.0.2 |
| SAPUI5 (CDN) | 1.148.13 (long-term maintenance) |
| Node.js | 22.12+ or 24 |
