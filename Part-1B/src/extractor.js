const crypto = require('crypto');

const DOMAINS = Object.freeze([
  'BFSI',
  'Healthcare',
  'Retail',
  'General',
]);

const CATEGORIES = Object.freeze([
  'Legacy Modernization',
  'Cost & Operational Efficiency',
  'Compliance & Security',
  'Customer Experience',
  'Data & Analytics',
]);

const SEVERITIES = Object.freeze(['High', 'Medium', 'Low']);
const DEFAULT_DOMAIN = 'General';

const CATEGORY_RULES = Object.freeze({
  'Legacy Modernization': [
    'legacy',
    'mainframe',
    'end of life',
    'outdated',
    'obsolete',
    'monolithic',
    'modernization',
    'modernize',
    'migration',
    'migrate',
    'unsupported',
    'technical debt',
  ],
  'Cost & Operational Efficiency': [
    'cost',
    'costs',
    'manual',
    'inefficient',
    'operational efficiency',
    'automation',
    'automate',
    'reconciliation',
    'processing delay',
    'operating cost',
    'labor',
    'overhead',
    'turnaround time',
    'productivity',
    'expensive',
  ],
  'Compliance & Security': [
    'compliance',
    'regulatory',
    'audit',
    'security',
    'privacy',
    'access control',
    'breach',
    'fraud',
    'risk',
    'hipaa',
    'pci',
    'gdpr',
    'kyc',
    'aml',
  ],
  'Customer Experience': [
    'customer',
    'client experience',
    'satisfaction',
    'complaint',
    'wait time',
    'call center',
    'contact center',
    'support',
    'service across channels',
    'abandon calls',
    'response time',
    'retention',
    'patient experience',
    'shopping experience',
    'checkout',
    'omnichannel',
  ],
  'Data & Analytics': [
    'analytics',
    'reporting',
    'insight',
    'dashboard',
    'forecast',
    'visibility',
    'silo',
    'data quality',
    'real-time',
    'clinical data',
    'transaction data',
    'sales analytics',
    'demand forecasting',
  ],
});

const DOMAIN_RULES = Object.freeze({
  BFSI: Object.freeze({
    'Legacy Modernization': ['core banking', 'claims platform', 'policy administration'],
    'Cost & Operational Efficiency': ['claims processing', 'payment reconciliation', 'loan servicing'],
    'Compliance & Security': ['anti-money laundering', 'know your customer', 'financial regulation'],
    'Customer Experience': ['digital banking', 'customer onboarding'],
    'Data & Analytics': ['risk analytics', 'portfolio analytics', 'regulatory reporting'],
  }),
  Healthcare: Object.freeze({
    'Legacy Modernization': ['electronic health record', 'clinical system', 'patient record'],
    'Cost & Operational Efficiency': ['manual coding', 'billing workflow', 'patient intake'],
    'Compliance & Security': ['protected health information', 'patient privacy', 'clinical compliance'],
    'Customer Experience': ['patient access', 'appointment scheduling'],
    'Data & Analytics': ['population health', 'care analytics', 'clinical reporting'],
  }),
  Retail: Object.freeze({
    'Legacy Modernization': ['point of sale', 'store system', 'legacy inventory'],
    'Cost & Operational Efficiency': ['inventory reconciliation', 'order fulfillment', 'manual replenishment'],
    'Compliance & Security': ['cardholder data', 'payment security', 'consumer privacy'],
    'Customer Experience': ['customer loyalty', 'shopping experience', 'omnichannel'],
    'Data & Analytics': ['inventory visibility', 'demand forecasting', 'product data'],
  }),
  General: Object.freeze({}),
});

const SEVERITY_RULES = Object.freeze({
  High: [
    'critical',
    'severe',
    'urgent',
    'fail',
    'breach',
    'cannot',
    'high risk',
    'regulatory penalty',
  ],
  Medium: [
    'delay',
    'manual',
    'limited',
    'inconsistent',
    'rising',
    'increasing',
    'slow',
    'difficulty',
    'repeated',
  ],
});

const ACTION_SUMMARIES = Object.freeze({
  'Legacy Modernization': 'Modernize legacy technology to address',
  'Cost & Operational Efficiency': 'Automate and streamline operations to address',
  'Compliance & Security': 'Strengthen compliance and security controls to address',
  'Customer Experience': 'Improve customer service by addressing',
  'Data & Analytics': 'Improve data and analytics capabilities to address',
});

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

class ProviderError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ProviderError';
    this.statusCode = 502;
  }
}

function summarizePainPoints(painPoints) {
  return {
    totalPainPoints: painPoints.length,
    highSeverityCount: painPoints.filter(
      (painPoint) => painPoint.severity === 'High',
    ).length,
  };
}

function createPainPointId(index, category, evidenceQuote) {
  const hash = crypto
    .createHash('sha256')
    .update(`${index}\u0000${category}\u0000${evidenceQuote}`)
    .digest('hex')
    .slice(0, 12);

  return `pp-${hash}`;
}

function hasGroundedEvidence(evidenceQuote, rfpText) {
  return (
    typeof evidenceQuote === 'string' &&
    evidenceQuote.length > 0 &&
    rfpText.toLowerCase().includes(evidenceQuote.toLowerCase())
  );
}

function createExtractionResult(mode, clientDomain, painPoints) {
  return {
    mode,
    clientDomain,
    painPoints,
    summary: summarizePainPoints(painPoints),
  };
}

function splitSentences(rfpText) {
  return rfpText
    .split(/(?<=[.!?])\s+|\r?\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function matchingKeywords(text, keywords) {
  const normalizedText = text.toLowerCase();
  return keywords.filter((keyword) =>
    normalizedText.includes(keyword.toLowerCase()),
  );
}

function chooseCategory(sentence, clientDomain) {
  const domainRules = DOMAIN_RULES[clientDomain] || DOMAIN_RULES.General;
  let bestCategory = null;
  let bestScore = 0;

  for (const category of CATEGORIES) {
    const sharedMatches = matchingKeywords(sentence, CATEGORY_RULES[category]);
    const domainMatches = matchingKeywords(
      sentence,
      domainRules[category] || [],
    );
    const score = sharedMatches.length + domainMatches.length * 2;

    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
    }
  }

  return bestCategory;
}

function determineSeverity(sentence) {
  if (matchingKeywords(sentence, SEVERITY_RULES.High).length > 0) {
    return 'High';
  }

  if (matchingKeywords(sentence, SEVERITY_RULES.Medium).length > 0) {
    return 'Medium';
  }

  return 'Low';
}

function extractFallbackPainPoints(rfpText, clientDomain) {
  const painPoints = [];

  for (const sentence of splitSentences(rfpText)) {
    const category = chooseCategory(sentence, clientDomain);
    if (!category) {
      continue;
    }

    const index = painPoints.length + 1;
    painPoints.push({
      id: createPainPointId(index, category, sentence),
      category,
      severity: determineSeverity(sentence),
      summary: `${ACTION_SUMMARIES[category]}: ${sentence}`,
      evidenceQuote: sentence,
    });
  }

  return painPoints;
}

function validateProviderPainPoints(value, rfpText) {
  if (!value || !Array.isArray(value.painPoints)) {
    throw new ProviderError('LLM provider returned an invalid pain-point list');
  }

  const ids = new Set();
  return value.painPoints.map((painPoint) => {
    if (
      !painPoint ||
      typeof painPoint.id !== 'string' ||
      !painPoint.id.trim() ||
      ids.has(painPoint.id) ||
      !CATEGORIES.includes(painPoint.category) ||
      !SEVERITIES.includes(painPoint.severity) ||
      typeof painPoint.summary !== 'string' ||
      !painPoint.summary.trim() ||
      !hasGroundedEvidence(painPoint.evidenceQuote, rfpText)
    ) {
      throw new ProviderError('LLM provider returned an invalid pain point');
    }

    ids.add(painPoint.id);
    return {
      id: painPoint.id,
      category: painPoint.category,
      severity: painPoint.severity,
      summary: painPoint.summary.trim(),
      evidenceQuote: painPoint.evidenceQuote,
    };
  });
}

async function requestChatCompletion(messages, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = (env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = env.LLM_MODEL || DEFAULT_MODEL;

  if (typeof fetchImpl !== 'function') {
    throw new ProviderError('Global fetch is unavailable in this Node runtime');
  }

  let response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
      }),
    });
  } catch (error) {
    throw new ProviderError('Unable to reach the configured LLM provider', {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new ProviderError(
      `LLM provider returned HTTP ${response.status || 'error'}`,
    );
  }

  let responseBody;
  try {
    responseBody = await response.json();
  } catch (error) {
    throw new ProviderError('LLM provider returned invalid JSON', {
      cause: error,
    });
  }

  const content = responseBody?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new ProviderError('LLM provider returned no extraction content');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new ProviderError('LLM provider returned invalid extraction JSON', {
      cause: error,
    });
  }
}

async function extractLivePainPoints(rfpText, clientDomain, options) {
  const value = await requestChatCompletion(
    [
      {
        role: 'system',
        content: [
          'Extract distinct client pain points from the supplied RFP text.',
          'Return only a JSON object with a painPoints array.',
          `Each item must use these categories: ${CATEGORIES.join('; ')}.`,
          `Each item must use one severity: ${SEVERITIES.join('; ')}.`,
          'Each item must have id, category, severity, summary, and evidenceQuote.',
          'evidenceQuote must be a non-empty verbatim substring of the RFP text.',
          'Summaries must be actionable and must not add unsupported facts.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({ rfpText, clientDomain }),
      },
    ],
    options,
  );

  return validateProviderPainPoints(value, rfpText);
}

async function extractPainPoints(
  { rfpText, clientDomain = DEFAULT_DOMAIN },
  options = {},
) {
  const env = options.env || process.env;
  if (env.LLM_API_KEY) {
    const painPoints = await extractLivePainPoints(
      rfpText,
      clientDomain,
      options,
    );
    return createExtractionResult('llm', clientDomain, painPoints);
  }

  const painPoints = extractFallbackPainPoints(rfpText, clientDomain);
  return createExtractionResult('fallback', clientDomain, painPoints);
}

module.exports = {
  CATEGORIES,
  DEFAULT_DOMAIN,
  DOMAINS,
  ProviderError,
  SEVERITIES,
  createExtractionResult,
  createPainPointId,
  extractFallbackPainPoints,
  extractPainPoints,
  hasGroundedEvidence,
  requestChatCompletion,
  summarizePainPoints,
  validateProviderPainPoints,
};
