const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createServer } = require('../src/server');
const { CATEGORIES, extractPainPoints } = require('../src/extractor');
const {
  calculateCategoryMetrics,
  evaluateDataset,
  evaluateEvidence,
  runEvaluation,
  validateLayer1,
} = require('../eval/harness');

const sampleRfp =
  'Our legacy mainframe is approaching end of life and batch processing routinely fails, requiring urgent modernization.';

async function withServer(options, run) {
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function postExtraction(baseUrl, body) {
  return fetch(`${baseUrl}/extract-pain-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postRaw(baseUrl, body, contentType = 'application/json') {
  return fetch(`${baseUrl}/extract-pain-points`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
}

async function assertSpecificBadRequest(response) {
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /application\/json/i);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.ok(body.error.trim().length > 0);
  assert.equal(Object.keys(body).length, 1);
}

function createPayloadAtByteLength(byteLength) {
  const body = {
    rfpText: 'A valid RFP excerpt with enough text.',
    padding: '',
  };
  const baseLength = Buffer.byteLength(JSON.stringify(body));
  body.padding = 'x'.repeat(byteLength - baseLength);
  const serialized = JSON.stringify(body);
  assert.equal(Buffer.byteLength(serialized), byteLength);
  return serialized;
}

test('valid fallback requests return structured, grounded results for each domain', async () => {
  await withServer({ env: {}, fetchImpl: fetch }, async (baseUrl) => {
    for (const clientDomain of ['BFSI', 'Healthcare', 'Retail', 'General']) {
      const response = await postExtraction(baseUrl, {
        rfpText: sampleRfp,
        clientDomain,
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json/i);

      const result = await response.json();
      assert.equal(result.mode, 'fallback');
      assert.equal(result.clientDomain, clientDomain);
      assert.ok(Array.isArray(result.painPoints));
      assert.ok(result.painPoints.length > 0);

      for (const painPoint of result.painPoints) {
        assert.equal(typeof painPoint.id, 'string');
        assert.ok(painPoint.id.length > 0);
        assert.ok(painPoint.summary.trim().length > 0);
        assert.ok(sampleRfp.toLowerCase().includes(painPoint.evidenceQuote.toLowerCase()));
      }

      assert.equal(result.summary.totalPainPoints, result.painPoints.length);
      assert.equal(
        result.summary.highSeverityCount,
        result.painPoints.filter((painPoint) => painPoint.severity === 'High').length,
      );
    }

    const defaultResponse = await postExtraction(baseUrl, { rfpText: sampleRfp });
    assert.equal(defaultResponse.status, 200);
    assert.equal((await defaultResponse.json()).clientDomain, 'General');
  });
});

test('live mode uses the configured OpenAI-compatible provider without real network access', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                painPoints: [
                  {
                    id: 'live-1',
                    category: 'Legacy Modernization',
                    severity: 'High',
                    summary: 'Modernize the failing mainframe.',
                    evidenceQuote: 'Our legacy mainframe is approaching end of life',
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
  };

  await withServer(
    {
      env: {
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: 'https://llm.example/v1',
        LLM_MODEL: 'test-model',
      },
      fetchImpl,
    },
    async (baseUrl) => {
      const response = await postExtraction(baseUrl, { rfpText: sampleRfp });
      assert.equal(response.status, 200);
      const result = await response.json();

      assert.equal(result.mode, 'llm');
      assert.equal(result.clientDomain, 'General');
      assert.equal(result.painPoints[0].category, 'Legacy Modernization');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://llm.example/v1/chat/completions');
      assert.equal(calls[0].options.method, 'POST');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
    },
  );
});

test('invalid request classes return specific JSON errors and valid boundaries pass', async () => {
  await withServer({ env: {}, fetchImpl: fetch }, async (baseUrl) => {
    const invalidBodies = [
      JSON.stringify({}),
      JSON.stringify({ rfpText: null }),
      JSON.stringify({ rfpText: 42 }),
      JSON.stringify({ rfpText: '   ' }),
      JSON.stringify({ rfpText: 'a'.repeat(19) }),
      JSON.stringify({ rfpText: sampleRfp, clientDomain: null }),
      JSON.stringify({ rfpText: sampleRfp, clientDomain: 3 }),
      JSON.stringify({ rfpText: sampleRfp, clientDomain: 'Finance' }),
      'null',
      '[]',
    ];

    for (const body of invalidBodies) {
      await assertSpecificBadRequest(await postRaw(baseUrl, body));
    }

    await assertSpecificBadRequest(
      await postRaw(baseUrl, '{"rfpText":'),
    );
    await assertSpecificBadRequest(
      await postRaw(
        baseUrl,
        JSON.stringify({ rfpText: sampleRfp }),
        'text/plain',
      ),
    );

    const minimum = await postExtraction(baseUrl, {
      rfpText: 'a'.repeat(20),
    });
    assert.equal(minimum.status, 200);

    const unicodeMinimum = await postExtraction(baseUrl, {
      rfpText: '🙂'.repeat(20),
    });
    assert.equal(unicodeMinimum.status, 200);

    const maximum = await postExtraction(baseUrl, {
      rfpText: 'a'.repeat(50000),
    });
    assert.equal(maximum.status, 200);

    await assertSpecificBadRequest(
      await postExtraction(baseUrl, { rfpText: 'a'.repeat(50001) }),
    );

    const exactLimit = await postRaw(
      baseUrl,
      createPayloadAtByteLength(51200),
    );
    assert.equal(exactLimit.status, 200);

    await assertSpecificBadRequest(
      await postRaw(baseUrl, createPayloadAtByteLength(51201)),
    );
  });
});

test('unknown paths return the exact 404 JSON error', async () => {
  await withServer({ env: {}, fetchImpl: fetch }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/unknown`, { method: 'POST' });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/i);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  });
});

test('configured provider failures return a JSON 502 without switching modes', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });

  await withServer(
    { env: { LLM_API_KEY: 'test-key' }, fetchImpl },
    async (baseUrl) => {
      const response = await postExtraction(baseUrl, { rfpText: sampleRfp });
      assert.equal(response.status, 502);
      assert.match(response.headers.get('content-type'), /application\/json/i);
      assert.equal(
        (await response.json()).error,
        'LLM provider returned HTTP 503',
      );
    },
  );
});

test('Layer 1 validates structure, enum values, and summary counts', () => {
  const validResult = {
    mode: 'fallback',
    clientDomain: 'BFSI',
    painPoints: [
      {
        id: 'pp-test',
        category: CATEGORIES[0],
        severity: 'High',
        summary: 'Modernize the failing platform.',
        evidenceQuote: 'The legacy platform is failing.',
      },
    ],
    summary: {
      totalPainPoints: 1,
      highSeverityCount: 1,
    },
  };

  assert.equal(validateLayer1(validResult).passed, true);
  assert.equal(
    validateLayer1({
      ...validResult,
      summary: { totalPainPoints: 2, highSeverityCount: 0 },
    }).passed,
    false,
  );
  assert.equal(
    validateLayer1({
      ...validResult,
      painPoints: [{ ...validResult.painPoints[0], category: 'Other' }],
    }).passed,
    false,
  );
});

test('category metrics handle zero denominators without nondeterministic values', () => {
  const metrics = calculateCategoryMetrics([
    { expectedCategories: [], predictedCategories: [] },
  ]);

  assert.equal(metrics.length, CATEGORIES.length);
  for (const metric of metrics) {
    assert.equal(metric.precision, 0);
    assert.equal(metric.recall, 0);
    assert.equal(metric.f1, 0);
  }
});

test('Layer 2 matches evidence case-insensitively and flags unsupported quotes', () => {
  const result = evaluateEvidence('The legacy platform is failing.', [
    { id: 'grounded', evidenceQuote: 'THE LEGACY PLATFORM' },
    { id: 'unsupported', evidenceQuote: 'a different platform' },
  ]);

  assert.equal(result.passed, false);
  assert.equal(result.groundedCount, 1);
  assert.equal(result.ungroundedCount, 1);
  assert.deepEqual(
    result.quotes.map((quote) => quote.grounded),
    [true, false],
  );
});

test('offline evaluation runs all layers repeatably and writes a JSON report', async () => {
  const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'eval', 'gold-dataset.json'), 'utf8'),
  );
  const fetchImpl = async () => {
    throw new Error('Offline evaluation must not call fetch');
  };
  const options = { env: {}, fetchImpl };
  const first = await evaluateDataset(dataset, options);
  const second = await evaluateDataset(dataset, options);

  assert.deepEqual(first, second);
  assert.equal(first.caseResults.length, 5);
  assert.equal(first.categoryMetrics.length, CATEGORIES.length);
  assert.equal(first.overall.status, 'PASS');
  for (const result of first.caseResults) {
    assert.equal(result.layer1.passed, true);
    assert.equal(result.layer2.passed, true);
    for (const score of Object.values(result.layer3.scores)) {
      assert.ok(score >= 1 && score <= 5);
    }
  }
  assert.equal(JSON.stringify(first).includes(dataset[0].rfpText), false);

  const reportPath = path.join(__dirname, '..', 'eval', 'report.test.json');
  try {
    await runEvaluation({
      ...options,
      dataset,
      reportPath,
      logger: () => {},
    });
    assert.equal(fs.existsSync(reportPath), true);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(reportPath, 'utf8')),
      first,
    );
  } finally {
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  }
});

test('LLM judge mode can be tested with a stubbed chat-completions response', async () => {
  const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'eval', 'gold-dataset.json'), 'utf8'),
  );
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionability: 4,
                specificity: 4,
                domainRelevance: 4,
              }),
            },
          },
        ],
      }),
    };
  };
  const offlineExtractor = (input) =>
    extractPainPoints(input, { env: {} });

  const report = await evaluateDataset(dataset, {
    env: { LLM_API_KEY: 'test-key' },
    fetchImpl,
    extractor: offlineExtractor,
  });

  assert.equal(report.scorerMode, 'llm');
  assert.equal(fetchCalls.length, dataset.length);
  assert.equal(report.overall.status, 'PASS');
});
