const fs = require('fs');
const path = require('path');

const {
  CATEGORIES,
  DOMAINS,
  SEVERITIES,
  extractPainPoints,
  hasGroundedEvidence,
  requestChatCompletion,
} = require('../src/extractor');

const THRESHOLDS = Object.freeze({
  macroF1: 0.7,
  overallRubricMean: 3.5,
  perDimensionMean: 3,
});

const RUBRIC_DIMENSIONS = Object.freeze([
  'actionability',
  'specificity',
  'domainRelevance',
]);

const ACTION_WORDS = Object.freeze([
  'modernize',
  'automate',
  'strengthen',
  'improve',
  'streamline',
  'unify',
  'enable',
  'implement',
  'enhance',
  'integrate',
  'consolidate',
  'reduce',
]);

const OUTCOME_WORDS = Object.freeze([
  'reduce',
  'prevent',
  'improve',
  'lower',
  'shorten',
  'enable',
  'increase',
  'avoid',
  'minimize',
  'disrupt',
]);

const DOMAIN_WORDS = Object.freeze({
  BFSI: [
    'bank',
    'banking',
    'claims',
    'financial',
    'kyc',
    'payment',
    'account',
    'transaction',
    'risk',
    'bfsi',
  ],
  Healthcare: [
    'patient',
    'clinical',
    'health',
    'hipaa',
    'medical',
    'care',
    'ehr',
  ],
  Retail: [
    'retail',
    'store',
    'inventory',
    'sales',
    'product',
    'checkout',
    'channel',
    'customer',
  ],
  General: ['service', 'system', 'process', 'data', 'operations'],
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateLayer1(result) {
  const findings = [];

  if (!isRecord(result)) {
    return { passed: false, findings: ['Result must be an object'] };
  }

  if (!['llm', 'fallback'].includes(result.mode)) {
    findings.push('mode must be llm or fallback');
  }
  if (!DOMAINS.includes(result.clientDomain)) {
    findings.push('clientDomain is not an allowed value');
  }
  if (!Array.isArray(result.painPoints)) {
    findings.push('painPoints must be an array');
  }
  if (!isRecord(result.summary)) {
    findings.push('summary must be an object');
  }

  const painPoints = Array.isArray(result.painPoints) ? result.painPoints : [];
  const ids = new Set();
  for (const [index, painPoint] of painPoints.entries()) {
    if (!isRecord(painPoint)) {
      findings.push(`painPoints[${index}] must be an object`);
      continue;
    }

    if (typeof painPoint.id !== 'string' || !painPoint.id.trim()) {
      findings.push(`painPoints[${index}].id must be a non-empty string`);
    } else if (ids.has(painPoint.id)) {
      findings.push(`painPoints[${index}].id must be unique`);
    } else {
      ids.add(painPoint.id);
    }

    if (!CATEGORIES.includes(painPoint.category)) {
      findings.push(`painPoints[${index}].category is not allowed`);
    }
    if (!SEVERITIES.includes(painPoint.severity)) {
      findings.push(`painPoints[${index}].severity is not allowed`);
    }
    if (typeof painPoint.summary !== 'string' || !painPoint.summary.trim()) {
      findings.push(`painPoints[${index}].summary must be non-empty`);
    }
    if (
      typeof painPoint.evidenceQuote !== 'string' ||
      !painPoint.evidenceQuote.trim()
    ) {
      findings.push(`painPoints[${index}].evidenceQuote must be non-empty`);
    }
  }

  if (isRecord(result.summary)) {
    if (result.summary.totalPainPoints !== painPoints.length) {
      findings.push('summary.totalPainPoints does not match painPoints.length');
    }
    const highSeverityCount = painPoints.filter(
      (painPoint) => painPoint && painPoint.severity === 'High',
    ).length;
    if (result.summary.highSeverityCount !== highSeverityCount) {
      findings.push(
        'summary.highSeverityCount does not match High-severity pain points',
      );
    }
  }

  return { passed: findings.length === 0, findings };
}

function evaluateEvidence(rfpText, painPoints) {
  const quotes = (Array.isArray(painPoints) ? painPoints : []).map(
    (painPoint, index) => {
      const grounded = hasGroundedEvidence(
        painPoint?.evidenceQuote,
        rfpText,
      );
      return {
        painPointId:
          typeof painPoint?.id === 'string' ? painPoint.id : `index-${index}`,
        grounded,
      };
    },
  );
  const groundedCount = quotes.filter((quote) => quote.grounded).length;

  return {
    passed: groundedCount === quotes.length,
    groundedCount,
    ungroundedCount: quotes.length - groundedCount,
    quotes,
  };
}

function getExpectedCategories(goldCase) {
  if (Array.isArray(goldCase.expectedCategories)) {
    return [...new Set(goldCase.expectedCategories)];
  }

  return [
    ...new Set(
      (goldCase.expectedPainPoints || []).map(
        (painPoint) => painPoint.category,
      ),
    ),
  ];
}

function getPredictedCategories(painPoints) {
  return [
    ...new Set(
      (Array.isArray(painPoints) ? painPoints : [])
        .map((painPoint) => painPoint.category)
        .filter((category) => CATEGORIES.includes(category)),
    ),
  ];
}

function roundScore(value) {
  return Number(value.toFixed(4));
}

function calculateCategoryMetrics(caseLabels) {
  const metrics = CATEGORIES.map((category) => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    for (const labels of caseLabels) {
      const expected = labels.expectedCategories.includes(category);
      const predicted = labels.predictedCategories.includes(category);
      if (expected && predicted) {
        truePositive += 1;
      } else if (!expected && predicted) {
        falsePositive += 1;
      } else if (expected && !predicted) {
        falseNegative += 1;
      }
    }

    const precisionDenominator = truePositive + falsePositive;
    const recallDenominator = truePositive + falseNegative;
    const precision =
      precisionDenominator === 0 ? 0 : truePositive / precisionDenominator;
    const recall =
      recallDenominator === 0 ? 0 : truePositive / recallDenominator;
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);

    return {
      category,
      tp: truePositive,
      fp: falsePositive,
      fn: falseNegative,
      precision: roundScore(precision),
      recall: roundScore(recall),
      f1: roundScore(f1),
    };
  });

  return metrics;
}

function validateDataset(dataset) {
  if (!Array.isArray(dataset) || dataset.length < 5) {
    throw new Error('Gold dataset must contain at least five cases');
  }

  const caseIds = new Set();
  const categories = new Set();
  for (const goldCase of dataset) {
    if (
      !isRecord(goldCase) ||
      typeof goldCase.id !== 'string' ||
      !goldCase.id.trim() ||
      typeof goldCase.rfpText !== 'string' ||
      !DOMAINS.includes(goldCase.clientDomain)
    ) {
      throw new Error('Gold dataset contains an invalid case');
    }
    if (caseIds.has(goldCase.id)) {
      throw new Error(`Gold dataset case ID is duplicated: ${goldCase.id}`);
    }
    caseIds.add(goldCase.id);

    for (const category of getExpectedCategories(goldCase)) {
      if (!CATEGORIES.includes(category)) {
        throw new Error(`Gold dataset contains an invalid category: ${category}`);
      }
      categories.add(category);
    }
  }

  const missingCategories = CATEGORIES.filter(
    (category) => !categories.has(category),
  );
  if (missingCategories.length > 0) {
    throw new Error(
      `Gold dataset is missing categories: ${missingCategories.join(', ')}`,
    );
  }
}

function clampScore(value) {
  return Math.max(1, Math.min(5, value));
}

function scoreDeterministically(goldCase, extraction) {
  const painPoints = Array.isArray(extraction.painPoints)
    ? extraction.painPoints
    : [];
  if (painPoints.length === 0) {
    return {
      actionability: 1,
      specificity: 1,
      domainRelevance: 1,
    };
  }

  const actionabilityScores = [];
  const specificityScores = [];
  const domainScores = [];
  const domainWords = DOMAIN_WORDS[goldCase.clientDomain] || DOMAIN_WORDS.General;

  for (const painPoint of painPoints) {
    const summary =
      typeof painPoint?.summary === 'string'
        ? painPoint.summary.toLowerCase()
        : '';
    const evidence =
      typeof painPoint?.evidenceQuote === 'string'
        ? painPoint.evidenceQuote.toLowerCase()
        : '';
    const combined = `${summary} ${evidence}`;
    const hasAction = ACTION_WORDS.some((word) => summary.includes(word));
    const hasOutcome = OUTCOME_WORDS.some((word) => combined.includes(word));
    const summaryIsSpecific = summary.split(/\s+/u).length >= 7;
    actionabilityScores.push(
      clampScore(
        2 + Number(hasAction) + Number(hasOutcome) + Number(summaryIsSpecific),
      ),
    );

    const evidenceWordCount = evidence.split(/\s+/u).filter(Boolean).length;
    const hasDomainDetail = domainWords.some((word) => combined.includes(word));
    const categoryWords = CATEGORY_RULES_FOR_SCORE[painPoint?.category] || [];
    const hasCategoryDetail = categoryWords.some((word) =>
      combined.includes(word),
    );
    specificityScores.push(
      clampScore(
        2 +
          Number(evidenceWordCount >= 10) +
          Number(hasDomainDetail) +
          Number(hasCategoryDetail),
      ),
    );

    const domainMatches = domainWords.some((word) => combined.includes(word));
    domainScores.push(
      clampScore(2 + Number(domainMatches) * 2 + Number(goldCase.clientDomain === 'General')),
    );
  }

  return {
    actionability: roundScore(
      actionabilityScores.reduce((sum, score) => sum + score, 0) /
        actionabilityScores.length,
    ),
    specificity: roundScore(
      specificityScores.reduce((sum, score) => sum + score, 0) /
        specificityScores.length,
    ),
    domainRelevance: roundScore(
      domainScores.reduce((sum, score) => sum + score, 0) / domainScores.length,
    ),
  };
}

const CATEGORY_RULES_FOR_SCORE = Object.freeze({
  'Legacy Modernization': ['legacy', 'mainframe', 'modernize', 'platform', 'system'],
  'Cost & Operational Efficiency': ['manual', 'cost', 'automate', 'reconciliation', 'turnaround'],
  'Compliance & Security': ['audit', 'compliance', 'security', 'control', 'regulatory'],
  'Customer Experience': ['customer', 'wait', 'support', 'service', 'experience'],
  'Data & Analytics': ['data', 'analytics', 'report', 'forecast', 'visibility'],
});

function validateRubricScores(value) {
  if (!isRecord(value)) {
    throw new Error('LLM judge must return a score object');
  }

  const scores = {};
  for (const dimension of RUBRIC_DIMENSIONS) {
    const score = value[dimension];
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error(`LLM judge ${dimension} score must be an integer from 1 to 5`);
    }
    scores[dimension] = score;
  }
  return scores;
}

async function scoreWithLlmJudge(goldCase, extraction, options) {
  const judgment = await requestChatCompletion(
    [
      {
        role: 'system',
        content: [
          'Score the extraction on actionability, specificity, and domain relevance.',
          'Use an integer from 1 (poor) to 5 (excellent) for each dimension.',
          'Return only a JSON object with actionability, specificity, and domainRelevance numbers.',
          'Judge only the supplied RFP and extraction; do not reward unsupported claims.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          clientDomain: goldCase.clientDomain,
          rfpText: goldCase.rfpText,
          painPoints: extraction.painPoints,
        }),
      },
    ],
    options,
  );

  return validateRubricScores(judgment.scores || judgment);
}

function calculateRubricMeans(caseResults) {
  const means = {};
  for (const dimension of RUBRIC_DIMENSIONS) {
    const scores = caseResults.map((result) => result.layer3.scores[dimension]);
    means[dimension] = roundScore(
      scores.reduce((sum, score) => sum + score, 0) / scores.length,
    );
  }

  const allScores = caseResults.flatMap((result) =>
    RUBRIC_DIMENSIONS.map((dimension) => result.layer3.scores[dimension]),
  );
  means.overall = roundScore(
    allScores.reduce((sum, score) => sum + score, 0) / allScores.length,
  );
  return means;
}

async function evaluateDataset(dataset, options = {}) {
  validateDataset(dataset);

  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const extractor = options.extractor || extractPainPoints;
  const judge = options.judge || scoreWithLlmJudge;
  const scorerMode = env.LLM_API_KEY ? 'llm' : 'fallback';
  const caseResults = [];
  const caseLabels = [];

  for (const goldCase of dataset) {
    const extraction = await extractor(
      {
        rfpText: goldCase.rfpText,
        clientDomain: goldCase.clientDomain,
      },
      { env, fetchImpl },
    );
    const layer1 = validateLayer1(extraction);
    const painPoints = Array.isArray(extraction?.painPoints)
      ? extraction.painPoints
      : [];
    const layer2 = evaluateEvidence(goldCase.rfpText, painPoints);
    const scores = env.LLM_API_KEY
      ? await judge(goldCase, extraction, { env, fetchImpl })
      : scoreDeterministically(goldCase, extraction || {});

    caseResults.push({
      caseId: goldCase.id,
      layer1,
      layer2,
      layer3: { scores, scorerMode },
      overall: layer1.passed && layer2.passed ? 'PASS' : 'FAIL',
    });
    caseLabels.push({
      expectedCategories: getExpectedCategories(goldCase),
      predictedCategories: getPredictedCategories(painPoints),
    });
  }

  const categoryMetrics = calculateCategoryMetrics(caseLabels);
  const macroF1 = roundScore(
    categoryMetrics.reduce((sum, metric) => sum + metric.f1, 0) /
      categoryMetrics.length,
  );
  const rubricMeans = calculateRubricMeans(caseResults);
  const failures = [];

  if (caseResults.some((result) => !result.layer1.passed)) {
    failures.push('One or more Layer 1 cases failed');
  }
  if (caseResults.some((result) => !result.layer2.passed)) {
    failures.push('One or more evidence quotes were not grounded');
  }
  if (macroF1 < THRESHOLDS.macroF1) {
    failures.push(`Macro F1 is below ${THRESHOLDS.macroF1}`);
  }
  if (rubricMeans.overall < THRESHOLDS.overallRubricMean) {
    failures.push(
      `Mean rubric score is below ${THRESHOLDS.overallRubricMean}`,
    );
  }
  for (const dimension of RUBRIC_DIMENSIONS) {
    if (rubricMeans[dimension] < THRESHOLDS.perDimensionMean) {
      failures.push(
        `${dimension} mean is below ${THRESHOLDS.perDimensionMean}`,
      );
    }
  }

  return {
    caseResults,
    categoryMetrics,
    macroF1,
    rubricMeans,
    thresholds: THRESHOLDS,
    scorerMode,
    overall: {
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      passed: failures.length === 0,
      failures,
    },
  };
}

function printReport(report, logger = console.log) {
  logger(`Evaluation ${report.overall.status}`);
  logger(`Cases: ${report.caseResults.length}`);
  logger(`Macro F1: ${report.macroF1}`);
  logger(`Mean semantic score: ${report.rubricMeans.overall}`);
  for (const result of report.caseResults) {
    logger(
      `${result.caseId}: Layer 1 ${result.layer1.passed ? 'PASS' : 'FAIL'}, ` +
        `Layer 2 ${result.layer2.passed ? 'PASS' : 'FAIL'}, Layer 3 ` +
        `${result.layer3.scores.actionability}/` +
        `${result.layer3.scores.specificity}/` +
        `${result.layer3.scores.domainRelevance}`,
    );
  }
  if (report.overall.failures.length > 0) {
    logger(`Failures: ${report.overall.failures.join('; ')}`);
  }
}

async function runEvaluation(options = {}) {
  const dataset =
    options.dataset ||
    JSON.parse(
      fs.readFileSync(path.join(__dirname, 'gold-dataset.json'), 'utf8'),
    );
  const report = await evaluateDataset(dataset, options);
  const reportPath = options.reportPath || path.join(__dirname, 'report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  printReport(report, options.logger || console.log);
  return report;
}

if (require.main === module) {
  runEvaluation()
    .then((report) => {
      if (!report.overall.passed) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`Evaluation failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  THRESHOLDS,
  calculateCategoryMetrics,
  evaluateDataset,
  evaluateEvidence,
  runEvaluation,
  scoreDeterministically,
  validateDataset,
  validateLayer1,
  validateRubricScores,
};
