import samplesJson from '@/data/synthetic/samples.json';
import resultsJson from '@/data/synthetic/results.json';
import testsJson from '@/data/synthetic/tests.json';
import { askBot, type BotResponse, type BotSource } from './engine';

interface SyntheticContainer {
  matrix: string;
  type: string;
  quantity: number;
}

interface SyntheticTest {
  code: string;
  name: string;
  discipline: string;
  valid_matrices: string[];
  containers_per_test: SyntheticContainer[];
  units: string;
  detection_limit: number;
  turnaround_hours: number;
}

interface SyntheticSample {
  id: string;
  matrix: string;
  container: string;
  status: string;
  received_at: string;
  expected_report_at: string;
  test_codes: string[];
}

interface SyntheticResult {
  sample_id: string;
  test_code: string;
  analyte: string;
  value: number | null;
  flag: string;
  units: string;
  detection_limit: number;
}

const samples = samplesJson as SyntheticSample[];
const results = resultsJson as SyntheticResult[];
const tests = testsJson as SyntheticTest[];
const sampleById = new Map(samples.map((sample) => [sample.id, sample]));
const testByCode = new Map(tests.map((test) => [test.code, test]));

export const DEMO_MAX_QUESTION_LENGTH = 500;
export const DEMO_SAMPLE_ID = 'SYN-26041-0001';

const PHI_PATTERN =
  /\b(patient|subject|demographic|date of birth|dob|address|phone|email|ssn|social security|medical record|mrn)\b/i;
const INTERPRETATION_PATTERN =
  /\b(interpret|diagnos|treat|medical advice|clinical meaning|what does (?:this|the result) mean|is (?:this|the result) (?:bad|normal|positive|negative))\b/i;
const ATTESTATION_PATTERN =
  /\b(attest|certif(?:y|ied|ication)|guarantee|validate)\b.*\b(compliance|compliant|clia|hipaa|part\s*11|iso)\b|\b(clia|hipaa|part\s*11|iso)\b.*\b(compliant|certified|guaranteed)\b/i;
const INJECTION_PATTERN =
  /\b(ignore|bypass|override)\b.{0,40}\b(instruction|guardrail|policy|system)\b|\b(reveal|print|show)\b.{0,30}\b(system prompt|hidden prompt|secret)\b/i;

const SAMPLE_SOURCE = (sampleId: string): BotSource => ({
  title: `Synthetic sample ${sampleId}`,
  path: '/demo/assistant#synthetic-samples',
});

const RESULT_SOURCE = (sampleId: string): BotSource => ({
  title: `Synthetic results for ${sampleId}`,
  path: '/demo/assistant#synthetic-results',
});

const TEST_SOURCE = (testCode: string): BotSource => ({
  title: `Synthetic test ${testCode}`,
  path: '/demo/assistant#synthetic-catalog',
});

function refusal(answer: string): BotResponse {
  return { answer, grounded: false, sources: [] };
}

function missing(answer: string): BotResponse {
  return {
    answer,
    grounded: false,
    sources: [],
  };
}

function findSample(question: string): SyntheticSample | undefined {
  const id = question.toUpperCase().match(/\bSYN-26\d{3}-\d{4}\b/)?.[0];
  return id ? sampleById.get(id) : undefined;
}

function findTest(question: string): SyntheticTest | undefined {
  const upperQuestion = question.toUpperCase();
  const byCode = tests.find((test) => upperQuestion.includes(test.code));
  if (byCode) return byCode;

  const lowerQuestion = question.toLowerCase();
  return tests.find((test) => lowerQuestion.includes(test.name.toLowerCase()));
}

function findMatrix(question: string): string | undefined {
  const lowerQuestion = question.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  return ['serum', 'plasma', 'swab', 'urine', 'drinking_water', 'wastewater', 'surface_water'].find(
    (matrix) => lowerQuestion.includes(matrix),
  );
}

function humanizeStatus(status: string): string {
  return status.replaceAll('_', ' ');
}

function formatResult(result: SyntheticResult): string {
  if (result.value === null) {
    return `${result.analyte}: below detection (${result.detection_limit} ${result.units}), flag ${result.flag}`;
  }
  return `${result.analyte}: ${result.value} ${result.units}, flag ${result.flag}`;
}

function answerStatus(sample: SyntheticSample): BotResponse {
  return {
    answer:
      `${sample.id} is ${humanizeStatus(sample.status)} in this fabricated demo dataset. ` +
      `It was received at ${sample.received_at}.`,
    grounded: true,
    sources: [SAMPLE_SOURCE(sample.id)],
  };
}

function answerResults(sample: SyntheticSample): BotResponse {
  const sampleResults = results.filter((result) => result.sample_id === sample.id);
  if (sampleResults.length === 0) {
    return {
      answer: `${sample.id} has no synthetic results recorded yet. Its current status is ${humanizeStatus(sample.status)}.`,
      grounded: true,
      sources: [SAMPLE_SOURCE(sample.id), RESULT_SOURCE(sample.id)],
    };
  }

  return {
    answer: `Synthetic results recorded for ${sample.id}: ${sampleResults.map(formatResult).join('; ')}.`,
    grounded: true,
    sources: [SAMPLE_SOURCE(sample.id), RESULT_SOURCE(sample.id)],
  };
}

function answerTat(sample: SyntheticSample): BotResponse {
  const orderedTests = sample.test_codes.map((code) => testByCode.get(code)).filter(Boolean);
  const longestTat = Math.max(...orderedTests.map((test) => test.turnaround_hours));
  return {
    answer:
      `${sample.id} has a synthetic expected-report time of ${sample.expected_report_at}. ` +
      `That is based on the longest configured turnaround among its ordered tests: ${longestTat} hours.`,
    grounded: true,
    sources: [SAMPLE_SOURCE(sample.id), ...orderedTests.map((test) => TEST_SOURCE(test.code))],
  };
}

function answerContainer(test: SyntheticTest, matrix: string | undefined): BotResponse {
  const selectedMatrix = matrix ?? (test.valid_matrices.length === 1 ? test.valid_matrices[0] : undefined);
  if (!selectedMatrix) {
    return missing(
      `${test.code} supports multiple matrices (${test.valid_matrices.join(', ')}). Specify the synthetic matrix to get the correct container.`,
    );
  }

  const container = test.containers_per_test.find((entry) => entry.matrix === selectedMatrix);
  if (!container) {
    return missing(`${test.code} is not configured for ${selectedMatrix} in the synthetic catalog.`);
  }

  return {
    answer: `${test.code} for ${selectedMatrix} requires ${container.quantity} × ${container.type} in the synthetic catalog.`,
    grounded: true,
    sources: [TEST_SOURCE(test.code)],
  };
}

function answerOrder(sample: SyntheticSample, test: SyntheticTest): BotResponse {
  if (!test.valid_matrices.includes(sample.matrix)) {
    return {
      answer:
        `${test.code} cannot be added to ${sample.id}: the sample matrix is ${sample.matrix}, ` +
        `but the synthetic catalog permits ${test.valid_matrices.join(', ')}.`,
      grounded: true,
      sources: [SAMPLE_SOURCE(sample.id), TEST_SOURCE(test.code)],
    };
  }

  const container = test.containers_per_test.find((entry) => entry.matrix === sample.matrix);
  if (!container) {
    return missing(
      `${test.code} has no container configured for ${sample.matrix} in the synthetic catalog.`,
    );
  }

  return {
    answer:
      `For this read-only demo, select ${sample.id}, choose test ${test.code}, and confirm the ` +
      `${sample.matrix} matrix with ${container.quantity} × ${container.type}. ` +
      'The assistant does not create or modify orders.',
    grounded: true,
    sources: [SAMPLE_SOURCE(sample.id), TEST_SOURCE(test.code)],
  };
}

export function askDemoAssistant(rawQuestion: unknown): BotResponse {
  if (typeof rawQuestion !== 'string' || rawQuestion.trim().length === 0) {
    return missing('Ask about a synthetic sample ID or synthetic test code shown in this demo.');
  }

  const question = rawQuestion.trim().slice(0, DEMO_MAX_QUESTION_LENGTH);

  if (PHI_PATTERN.test(question)) {
    return refusal(
      'I cannot provide patient or subject demographics. This demo contains fabricated operational records only and no PHI.',
    );
  }
  if (INTERPRETATION_PATTERN.test(question)) {
    return refusal(
      'I can report the fabricated value and flag, but I cannot interpret results, diagnose, or provide treatment advice.',
    );
  }
  if (ATTESTATION_PATTERN.test(question)) {
    return refusal(
      'I cannot attest that a lab or product is compliant, certified, accredited, or validated. Those determinations require human-controlled, customer-specific evidence.',
    );
  }
  if (INJECTION_PATTERN.test(question)) {
    return refusal('I cannot bypass the demo guardrails or reveal hidden instructions.');
  }

  const sample = findSample(question);
  const test = findTest(question);

  if (/\b(status|state|progress)\b/i.test(question)) {
    return sample
      ? answerStatus(sample)
      : missing('Include a valid synthetic sample ID, such as SYN-26041-0001, to check status.');
  }
  if (/\b(results?|values?|findings?)\b/i.test(question)) {
    return sample
      ? answerResults(sample)
      : missing('Include a valid synthetic sample ID to retrieve fabricated results.');
  }
  if (/\b(tat|turnaround|due|expected report|when.*report|report.*when)\b/i.test(question)) {
    return sample
      ? answerTat(sample)
      : missing('Include a valid synthetic sample ID to retrieve its expected-report time.');
  }
  if (/\b(container|tube|specimen|collect)\b/i.test(question)) {
    return test
      ? answerContainer(test, findMatrix(question))
      : missing('Include a valid synthetic test code to retrieve its matrix-specific container.');
  }
  if (/\b(order|request|add test)\b/i.test(question)) {
    if (!sample || !test) {
      return missing('Include both a valid synthetic sample ID and synthetic test code to check ordering.');
    }
    return answerOrder(sample, test);
  }

  return askBot(question);
}
