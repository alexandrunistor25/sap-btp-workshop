/*
 * PizzaFlow - checks that the SAPUI5 app is served by the SAME Node.js
 * process as the OData service (the single-application Cloud Foundry setup).
 *
 * Part 1 uses cds.test (development mode, like `npm run watch`).
 * Part 2 starts `npm start` with NODE_ENV=production, exactly like Cloud
 * Foundry does, and checks the routes the deployed app depends on.
 *
 * Run with: npm test
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const cds = require('@sap/cds');

const PROJECT_ROOT = path.join(__dirname, '..');
const APP_ROUTE = '/pizzaflow/webapp/index.html';
const UI5_VERSION = '1.148.13';

describe('UI and OData from one process (development mode)', () => {
  const { GET } = cds.test(PROJECT_ROOT);

  it('serves the SAPUI5 index page with the pinned UI5 version from the CDN', async () => {
    const { status, data: sHtml } = await GET(APP_ROUTE);
    assert.equal(status, 200);
    assert.match(sHtml, new RegExp(`https://ui5\\.sap\\.com/${UI5_VERSION.replaceAll('.', '\\.')}/resources/sap-ui-core\\.js`));
    assert.match(sHtml, /data-sap-ui-theme="sap_horizon"/);
  });

  it('the app descriptor points to the OData V4 service of this server', async () => {
    const { data: oManifest } = await GET('/pizzaflow/webapp/manifest.json');
    const oDataSource = oManifest['sap.app'].dataSources.mainService;
    assert.equal(oDataSource.uri, '/odata/v4/store/');
    assert.equal(oDataSource.settings.odataVersion, '4.0');

    // ... and that service really exists on the same origin
    const { status } = await GET(`${oDataSource.uri}$metadata`);
    assert.equal(status, 200);
  });
});

describe('Production mode (npm start with NODE_ENV=production, like Cloud Foundry)', () => {
  let oServer;
  let sBaseUrl;

  before(async () => {
    const iPort = await findFreePort();
    sBaseUrl = `http://localhost:${iPort}`;
    oServer = spawn(process.execPath, [require.resolve('@sap/cds/bin/serve.js')], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(iPort) },
      stdio: 'ignore'
    });
    await waitUntilReachable(`${sBaseUrl}/health`);
  });

  after(() => oServer?.kill());

  it('answers the Cloud Foundry health check', async () => {
    const oResponse = await fetch(`${sBaseUrl}/health`);
    assert.equal(oResponse.status, 200);
    assert.deepEqual(await oResponse.json(), { status: 'UP' });
  });

  it('redirects the root URL to the SAPUI5 app (there is no CAP index page in production)', async () => {
    const oResponse = await fetch(`${sBaseUrl}/`, { redirect: 'manual' });
    assert.equal(oResponse.status, 302);
    assert.equal(oResponse.headers.get('location'), APP_ROUTE);
  });

  it('serves the SAPUI5 app and the OData service', async () => {
    assert.equal((await fetch(`${sBaseUrl}${APP_ROUTE}`)).status, 200);

    const oResponse = await fetch(`${sBaseUrl}/odata/v4/store/Materials?$top=1`);
    assert.equal(oResponse.status, 200);
    assert.equal((await oResponse.json()).value.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Asks the operating system for a free TCP port. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const oProbe = net.createServer();
    oProbe.once('error', reject);
    oProbe.listen(0, () => {
      const { port: iPort } = oProbe.address();
      oProbe.close(() => resolve(iPort));
    });
  });
}

/** Polls a URL until the server answers (max. ~20 seconds). */
async function waitUntilReachable(sUrl) {
  for (let i = 0; i < 100; i++) {
    try {
      const oResponse = await fetch(sUrl);
      if (oResponse.ok) return;
    } catch {
      // server not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not start: ${sUrl}`);
}
