'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const store = require('../src/store');
const { server, handleRequest } = require('../src/server');
const serverListeningOnImport = server.listening;

const previousDealsFile = process.env.DEALS_FILE;
let temporaryDirectory;
let dealsFile;
let baseUrl;

function listen() {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    };
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(0, '127.0.0.1');
  });
}

function closeServer() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function send(method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}${requestPath}`, {
      method,
      headers,
    }, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let responseBody;

        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text;
        }

        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: responseBody,
          text,
        });
      });
    });

    request.on('error', reject);
    if (body !== undefined) {
      request.write(body);
    }
    request.end();
  });
}

function makeDeal(id, domain, status) {
  return {
    id,
    competitorName: `Competitor ${id}`,
    dealValueUSD: 1000,
    domain,
    status,
    recordedAt: '2026-11-14T04:30:00.000Z',
  };
}

test.before(async () => {
  temporaryDirectory = fs.mkdtempSync(`${__dirname}/.deals-api-`);
  dealsFile = `${temporaryDirectory}/nested/deals.json`;
  process.env.DEALS_FILE = dealsFile;
  await listen();
});

test.after(async () => {
  if (server.listening) {
    await closeServer();
  }

  if (previousDealsFile === undefined) {
    delete process.env.DEALS_FILE;
  } else {
    process.env.DEALS_FILE = previousDealsFile;
  }

  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test.beforeEach(() => {
  process.env.DEALS_FILE = dealsFile;
  store.writeDeals([]);
});

test('server exports an import-safe handler and the store resolves its file', () => {
  assert.equal(serverListeningOnImport, false);
  assert.equal(server.listening, true);
  assert.equal(typeof handleRequest, 'function');

  const configuredFile = process.env.DEALS_FILE;
  try {
    delete process.env.DEALS_FILE;
    assert.equal(store.resolveDataFile(), './data/deals.json');

    process.env.DEALS_FILE = `${temporaryDirectory}/override/deals.json`;
    assert.equal(
      store.resolveDataFile(),
      `${temporaryDirectory}/override/deals.json`,
    );
  } finally {
    process.env.DEALS_FILE = configuredFile;
  }
});

test('missing configured storage is initialized in an auto-created parent directory', () => {
  const missingFile = `${temporaryDirectory}/new-parent/deals.json`;
  process.env.DEALS_FILE = missingFile;

  assert.deepEqual(store.readDeals(), []);
  assert.equal(fs.readFileSync(missingFile, 'utf8').trim(), '[]');
});

test('POST /deals persists a normalized deal and GET /deals returns it', async () => {
  const response = await send(
    'POST',
    '/deals',
    JSON.stringify({
      competitorName: '  Acme  ',
      dealValueUSD: 250000,
      domain: 'BFSI',
      status: 'Won',
      unrecognized: 'must not be persisted',
    }),
    { 'content-type': 'application/json' },
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.equal(response.body.competitorName, 'Acme');
  assert.equal(response.body.dealValueUSD, 250000);
  assert.equal(response.body.domain, 'BFSI');
  assert.equal(response.body.status, 'Won');
  assert.equal(typeof response.body.id, 'string');
  assert.ok(response.body.id.length > 0);
  assert.equal(
    new Date(response.body.recordedAt).toISOString(),
    response.body.recordedAt,
  );

  const collection = await send('GET', '/deals');
  assert.equal(collection.statusCode, 200);
  assert.equal(collection.headers['content-type'], 'application/json');
  assert.deepEqual(collection.body.deals, [response.body]);
  assert.deepEqual(collection.body.summary, {
    total: 1,
    won: 1,
    lost: 0,
    winRatePercent: 100,
  });
  assert.deepEqual(store.readDeals(), [response.body]);

  const second = await send(
    'POST',
    '/deals',
    JSON.stringify({
      competitorName: 'Beta',
      dealValueUSD: 1,
      domain: 'Retail',
      status: 'Lost',
    }),
    { 'content-type': 'application/json' },
  );
  assert.equal(second.statusCode, 201);
  assert.notEqual(second.body.id, response.body.id);
});

test('a created deal remains available after the server restarts', async () => {
  const created = await send(
    'POST',
    '/deals',
    JSON.stringify({
      competitorName: 'Persistent',
      dealValueUSD: 15,
      domain: 'Healthcare',
      status: 'Lost',
    }),
    { 'content-type': 'application/json' },
  );
  assert.equal(created.statusCode, 201);

  await closeServer();
  await listen();

  const response = await send('GET', '/deals');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.deals, [created.body]);
});

test('GET /deals returns an empty collection and zero summary', async () => {
  const response = await send('GET', '/deals');

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.deepEqual(response.body, {
    deals: [],
    summary: {
      total: 0,
      won: 0,
      lost: 0,
      winRatePercent: 0,
    },
  });
});

test('GET /deals summarizes all deals and filters by each allowed domain', async () => {
  const deals = [
    makeDeal('1', 'BFSI', 'Won'),
    makeDeal('2', 'Retail', 'Lost'),
    makeDeal('3', 'Healthcare', 'Lost'),
  ];
  store.writeDeals(deals);

  const unfiltered = await send('GET', '/deals');
  assert.equal(unfiltered.statusCode, 200);
  assert.deepEqual(unfiltered.body.deals, deals);
  assert.deepEqual(unfiltered.body.summary, {
    total: 3,
    won: 1,
    lost: 2,
    winRatePercent: 33.33,
  });

  for (const [domain, deal, winRatePercent] of [
    ['BFSI', deals[0], 100],
    ['Retail', deals[1], 0],
    ['Healthcare', deals[2], 0],
  ]) {
    const filtered = await send('GET', `/deals?domain=${domain}`);
    assert.equal(filtered.statusCode, 200);
    assert.equal(filtered.headers['content-type'], 'application/json');
    assert.deepEqual(filtered.body.deals, [deal]);
    assert.deepEqual(filtered.body.summary, {
      total: 1,
      won: deal.status === 'Won' ? 1 : 0,
      lost: deal.status === 'Lost' ? 1 : 0,
      winRatePercent,
    });
  }

  store.writeDeals([]);
  const noMatches = await send('GET', '/deals?domain=BFSI&extra=ignored');
  assert.deepEqual(noMatches.body, {
    deals: [],
    summary: {
      total: 0,
      won: 0,
      lost: 0,
      winRatePercent: 0,
    },
  });
});

test('GET /deals calculates 100 and 0 percent for all-Won and all-Lost collections', async () => {
  store.writeDeals([
    makeDeal('won-1', 'BFSI', 'Won'),
    makeDeal('won-2', 'Retail', 'Won'),
  ]);
  const allWon = await send('GET', '/deals');
  assert.equal(allWon.body.summary.winRatePercent, 100);

  store.writeDeals([
    makeDeal('lost-1', 'BFSI', 'Lost'),
    makeDeal('lost-2', 'Retail', 'Lost'),
  ]);
  const allLost = await send('GET', '/deals');
  assert.equal(allLost.body.summary.winRatePercent, 0);
});

test('GET /deals rejects an unknown or incorrectly cased domain filter', async () => {
  for (const domain of ['Unknown', 'bfsi']) {
    const response = await send('GET', `/deals?domain=${domain}`);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(response.body, {
      error: 'domain must be BFSI, Healthcare, or Retail',
    });
  }
});

test('POST /deals rejects missing and invalid fields without changing stored deals', async () => {
  const baseline = [makeDeal('baseline', 'BFSI', 'Won')];
  store.writeDeals(baseline);

  const validPayload = {
    competitorName: 'Acme',
    dealValueUSD: 250000,
    domain: 'BFSI',
    status: 'Won',
  };
  const invalidCases = [];

  for (const [field, error] of [
    ['competitorName', 'competitorName is required'],
    ['dealValueUSD', 'dealValueUSD is required'],
    ['domain', 'domain is required'],
    ['status', 'status is required'],
  ]) {
    const payload = { ...validPayload };
    delete payload[field];
    invalidCases.push({ payload, error });
  }

  invalidCases.push(
    {
      payload: { ...validPayload, competitorName: 42 },
      error: 'competitorName must be a string',
    },
    {
      payload: { ...validPayload, competitorName: '   ' },
      error: 'competitorName must contain 1 to 100 characters',
    },
    {
      payload: { ...validPayload, competitorName: 'x'.repeat(101) },
      error: 'competitorName must contain 1 to 100 characters',
    },
    {
      payload: { ...validPayload, dealValueUSD: '250000' },
      error: 'dealValueUSD must be a finite number greater than 0',
    },
    {
      payload: { ...validPayload, dealValueUSD: null },
      error: 'dealValueUSD must be a finite number greater than 0',
    },
    {
      payload: { ...validPayload, dealValueUSD: 0 },
      error: 'dealValueUSD must be a finite number greater than 0',
    },
    {
      payload: { ...validPayload, dealValueUSD: -1 },
      error: 'dealValueUSD must be a finite number greater than 0',
    },
    {
      body: '{"competitorName":"Acme","dealValueUSD":1e400,"domain":"BFSI","status":"Won"}',
      error: 'dealValueUSD must be a finite number greater than 0',
    },
    {
      payload: { ...validPayload, domain: 'bfsi' },
      error: 'domain must be BFSI, Healthcare, or Retail',
    },
    {
      payload: { ...validPayload, domain: 10 },
      error: 'domain must be BFSI, Healthcare, or Retail',
    },
    {
      payload: { ...validPayload, status: 'won' },
      error: 'status must be Won or Lost',
    },
    {
      payload: { ...validPayload, status: null },
      error: 'status must be Won or Lost',
    },
    {
      payload: {
        dealValueUSD: 0,
        domain: 'Invalid',
        status: 'Invalid',
      },
      error: 'competitorName is required',
    },
  );

  for (const { payload, body, error } of invalidCases) {
    const response = await send(
      'POST',
      '/deals',
      body === undefined ? JSON.stringify(payload) : body,
      { 'content-type': 'application/json' },
    );

    assert.equal(response.statusCode, 400, error);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(response.body, { error });
    assert.deepEqual(store.readDeals(), baseline);
  }
});

test('POST /deals accepts names at 1 and 100 Unicode code points', async () => {
  for (const competitorName of [
    'A',
    'A'.repeat(100),
    '😀'.repeat(100),
  ]) {
    const response = await send(
      'POST',
      '/deals',
      JSON.stringify({
        competitorName,
        dealValueUSD: 1,
        domain: 'Retail',
        status: 'Lost',
      }),
      { 'content-type': 'application/json' },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.competitorName, competitorName);
  }
});

test('POST /deals rejects malformed JSON and JSON values that are not objects', async () => {
  for (const [body, error] of [
    ['{', 'Malformed JSON'],
    ['null', 'Body must be a JSON object'],
    ['[]', 'Body must be a JSON object'],
    ['"value"', 'Body must be a JSON object'],
  ]) {
    const response = await send(
      'POST',
      '/deals',
      body,
      { 'content-type': 'application/json' },
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(response.body, { error });
    assert.deepEqual(store.readDeals(), []);
  }
});

test('POST /deals accepts exactly 10,240 bytes and rejects larger bodies', async () => {
  const validBody = JSON.stringify({
    competitorName: 'AtLimit',
    dealValueUSD: 10,
    domain: 'BFSI',
    status: 'Won',
  });
  const exactBody = validBody
    + ' '.repeat(10240 - Buffer.byteLength(validBody));
  assert.equal(Buffer.byteLength(exactBody), 10240);

  const exactResponse = await send(
    'POST',
    '/deals',
    exactBody,
    {
      'content-type': 'application/json',
      'content-length': '10240',
    },
  );
  assert.equal(exactResponse.statusCode, 201);
  assert.equal(exactResponse.body.competitorName, 'AtLimit');

  const baseline = store.readDeals();
  const oversizedBody = validBody
    + ' '.repeat(10241 - Buffer.byteLength(validBody));
  assert.equal(Buffer.byteLength(oversizedBody), 10241);

  for (const headers of [
    {
      'content-type': 'application/json',
      'content-length': '10241',
    },
    { 'content-type': 'application/json' },
  ]) {
    const response = await send('POST', '/deals', oversizedBody, headers);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(response.body, { error: 'Payload exceeds 10KB' });
    assert.deepEqual(store.readDeals(), baseline);
  }

  for (const [method, requestPath] of [
    ['GET', '/deals'],
    ['PUT', '/deals'],
  ]) {
    const response = await send(method, requestPath, oversizedBody, {
      'content-length': '10241',
    });
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.headers['content-type'],
      'application/json',
      `${method} ${requestPath} response must be JSON`,
    );
    assert.deepEqual(response.body, { error: 'Payload exceeds 10KB' });
  }
});

test('unsupported paths and methods return the exact JSON 404 response', async () => {
  for (const [method, requestPath] of [
    ['GET', '/missing'],
    ['GET', '/Deals'],
    ['PUT', '/deals'],
  ]) {
    const response = await send(method, requestPath);
    assert.equal(response.statusCode, 404);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(response.body, { error: 'Not found' });
  }
});

test('storage failures return a generic JSON 500 without a filesystem path', async () => {
  const configuredFile = process.env.DEALS_FILE;
  try {
    process.env.DEALS_FILE = temporaryDirectory;
    const response = await send('GET', '/deals');

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(response.body, { error: 'Internal server error' });
    assert.equal(JSON.stringify(response.body).includes(temporaryDirectory), false);
  } finally {
    process.env.DEALS_FILE = configuredFile;
  }
});
