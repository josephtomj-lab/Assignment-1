const http = require('http');
const { URL } = require('url');

const {
  DEFAULT_DOMAIN,
  DOMAINS,
  ProviderError,
  extractPainPoints,
} = require('./extractor');

const ROUTE = '/extract-pain-points';
const MAX_BODY_BYTES = 50 * 1024;

class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
    this.statusCode = 400;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    request.resume();
    return Promise.reject(new RequestError('Request body exceeds 50 KB'));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      request.removeListener('data', onData);
      request.resume();
      reject(error);
    };

    const onData = (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        fail(new RequestError('Request body exceeds 50 KB'));
        return;
      }

      chunks.push(chunk);
    };

    request.on('data', onData);
    request.once('end', () => {
      if (settled) {
        return;
      }

      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new RequestError('Request body must be valid JSON'));
      }
    });
    request.once('error', (error) => {
      fail(new RequestError(`Unable to read request body: ${error.message}`));
    });
    request.once('aborted', () => {
      fail(new RequestError('Request body was interrupted'));
    });
  });
}

function validateRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('Request body must be a JSON object');
  }

  if (!Object.hasOwn(body, 'rfpText')) {
    throw new RequestError('rfpText is required');
  }

  if (typeof body.rfpText !== 'string') {
    throw new RequestError('rfpText must be a string');
  }

  const rfpText = body.rfpText.trim();
  if (!rfpText) {
    throw new RequestError('rfpText must not be empty after trimming');
  }

  const characterCount = Array.from(rfpText).length;
  if (characterCount < 20) {
    throw new RequestError('rfpText must contain at least 20 characters');
  }
  if (characterCount > 50000) {
    throw new RequestError('rfpText must not exceed 50,000 characters');
  }

  let clientDomain = DEFAULT_DOMAIN;
  if (Object.hasOwn(body, 'clientDomain')) {
    if (
      typeof body.clientDomain !== 'string' ||
      !DOMAINS.includes(body.clientDomain)
    ) {
      throw new RequestError(
        'clientDomain must be BFSI, Healthcare, Retail, or General',
      );
    }

    clientDomain = body.clientDomain;
  }

  return { rfpText, clientDomain };
}

function createServer(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const extractor = options.extractor || extractPainPoints;

  return http.createServer(async (request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url || '/', 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'Request URL is invalid' });
      return;
    }

    if (requestUrl.pathname !== ROUTE || request.method !== 'POST') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    try {
      const contentType = request.headers['content-type'] || '';
      if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
        throw new RequestError('Content-Type must be application/json');
      }

      const body = await readJsonBody(request);
      const input = validateRequestBody(body);
      const result = await extractor(input, { env, fetchImpl });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      if (error instanceof ProviderError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      console.error('Unexpected extraction request failure:', error.message);
      sendJson(response, 500, { error: 'Internal server error' });
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(process.env.PORT || 3000);
}

module.exports = {
  MAX_BODY_BYTES,
  RequestError,
  ROUTE,
  createServer,
  readJsonBody,
  sendJson,
  validateRequestBody,
};
