'use strict';

const http = require('node:http');
const store = require('./store');

const MAX_BODY_BYTES = 10 * 1024;
let idCounter = 0;

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(value));
}

function getValidationError(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Body must be a JSON object';
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'competitorName')) {
    return 'competitorName is required';
  }
  if (typeof payload.competitorName !== 'string') {
    return 'competitorName must be a string';
  }
  const competitorName = payload.competitorName.trim();
  const competitorNameLength = Array.from(competitorName).length;
  if (competitorNameLength < 1 || competitorNameLength > 100) {
    return 'competitorName must contain 1 to 100 characters';
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'dealValueUSD')) {
    return 'dealValueUSD is required';
  }
  if (typeof payload.dealValueUSD !== 'number'
      || !Number.isFinite(payload.dealValueUSD)
      || payload.dealValueUSD <= 0) {
    return 'dealValueUSD must be a finite number greater than 0';
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'domain')) {
    return 'domain is required';
  }
  if (!['BFSI', 'Healthcare', 'Retail'].includes(payload.domain)) {
    return 'domain must be BFSI, Healthcare, or Retail';
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'status')) {
    return 'status is required';
  }
  if (!['Won', 'Lost'].includes(payload.status)) {
    return 'status must be Won or Lost';
  }

  return null;
}

function createDeal(payload, deals) {
  const competitorName = payload.competitorName.trim();
  const existingIds = new Set(deals.map((deal) => deal.id));
  let id;

  do {
    id = `deal-${Date.now()}-${process.pid}-${idCounter++}`;
  } while (existingIds.has(id));

  return {
    id,
    competitorName,
    dealValueUSD: payload.dealValueUSD,
    domain: payload.domain,
    status: payload.status,
    recordedAt: new Date().toISOString(),
  };
}

function summarize(deals) {
  const total = deals.length;
  const won = deals.filter((deal) => deal.status === 'Won').length;
  const lost = deals.filter((deal) => deal.status === 'Lost').length;
  const winRatePercent = total === 0
    ? 0
    : Number(((won / total) * 100).toFixed(2));

  return {
    total,
    won,
    lost,
    winRatePercent,
  };
}

function readRequestBody(request, response, callback) {
  const chunks = [];
  let bytesReceived = 0;
  let completed = false;

  request.on('data', (chunk) => {
    if (completed) {
      return;
    }

    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesReceived += buffer.length;
    if (bytesReceived > MAX_BODY_BYTES) {
      completed = true;
      chunks.length = 0;
      sendJson(response, 400, { error: 'Payload exceeds 10KB' });
      return;
    }

    chunks.push(buffer);
  });
  request.on('error', (error) => {
    if (completed) {
      return;
    }

    completed = true;
    callback(error);
  });
  request.on('aborted', () => {
    if (completed) {
      return;
    }

    completed = true;
    callback(new Error('Request body was aborted'));
  });
  request.on('end', () => {
    if (completed) {
      return;
    }

    completed = true;
    callback(null, Buffer.concat(chunks).toString('utf8'));
  });
}

function handleGet(requestUrl, response) {
  let deals;
  try {
    deals = store.readDeals();
  } catch (error) {
    if (!(error instanceof store.StoreError)) {
      throw error;
    }

    sendJson(response, 500, { error: 'Internal server error' });
    return;
  }

  const domain = requestUrl.searchParams.get('domain');
  if (domain !== null) {
    if (!['BFSI', 'Healthcare', 'Retail'].includes(domain)) {
      sendJson(response, 400, {
        error: 'domain must be BFSI, Healthcare, or Retail',
      });
      return;
    }

    deals = deals.filter((deal) => deal.domain === domain);
  }

  sendJson(response, 200, {
    deals,
    summary: summarize(deals),
  });
}

function handlePost(body, response) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    sendJson(response, 400, { error: 'Malformed JSON' });
    return;
  }

  const validationError = getValidationError(payload);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  let deals;
  try {
    deals = store.readDeals();
    const deal = createDeal(payload, deals);
    store.writeDeals([...deals, deal]);
    sendJson(response, 201, deal);
  } catch (error) {
    if (!(error instanceof store.StoreError)) {
      throw error;
    }

    sendJson(response, 500, { error: 'Internal server error' });
  }
}

function handleRequest(request, response) {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, 'http://localhost');
  } catch {
    sendJson(response, 400, { error: 'Invalid request target' });
    request.resume();
    return;
  }

  readRequestBody(request, response, (bodyError, body) => {
    if (bodyError) {
      sendJson(response, 400, { error: 'Malformed JSON' });
      return;
    }

    if (requestUrl.pathname !== '/deals'
        || (request.method !== 'GET' && request.method !== 'POST')) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    if (request.method === 'GET') {
      handleGet(requestUrl, response);
      return;
    }

    handlePost(body, response);
  });
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(process.env.PORT || 3000);
}

module.exports = {
  server,
  handleRequest,
};
