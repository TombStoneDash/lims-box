/**
 * Synthetic/fabricated inputs only: deterministic in-process rule chaining.
 * NOT evidence of a live SENAITE connection and NOT a release authority:
 * a human technical review is still required.
 */
import { resolveEffectiveTestDefinition, type TestDefinitionVersion, type EffectiveVersionResolution } from './ohworks-effective-dating';
import { convertResultUnit, UnitConversionError, type UnitConversionResult } from './ohworks-unit-conversion';
import { evaluateReferenceRange, type ReferenceRangeEvaluation } from './ohworks-reference-range';
import { evaluateResultDelta, explainDeltaCheckReason, DeltaCheckInputError, type DeltaCheckSampleResult, type DeltaLimitRule, type DeltaCheckStatus } from './ohworks-delta-check';
import { evaluateQCRules, explainQCRuleCode, QCRuleEvaluationInputError, type QCRuleEvaluationInput } from './ohworks-qc-rules';
import { applyVolumeLedgerEvents, explainVolumeLedgerReason, VolumeLedgerInputError, type SpecimenVolumeState, type VolumeLedgerEventInput, type VolumeLedgerSummary } from './ohworks-volume-ledger';
import { evaluateAutoVerification, type AutoVerificationQCState, type AutoVerificationRequest } from './ohworks-autoverification';
import { computeTurnaroundTime, TurnaroundTimeInputError, type TurnaroundInput, type TurnaroundResult } from './ohworks-turnaround-time';

import { evaluateSpecimenStability, explainStabilityCheckReason, StabilityWindowInputError, type StorageConditionEntry, type StabilityWindowDeclaration, type StabilityCheckOutcome } from './ohworks-stability-window';
import { evaluateCriticalRepeat, explainCriticalRepeatReason, CriticalRepeatPolicyInputError, type CriticalRepeatPolicy, type CriticalRepeatResult, type CriticalRepeatOutcome } from './ohworks-critical-repeat';
import { planReflexTests, type ReflexRule } from './ohworks-reflex-rules';
import { formatReportedResult, ReportingFormatError, explainReportingFormatError, type ReportingFormat } from './ohworks-reporting-format';

export type SyntheticLabDayStep = 'effective-definition' | 'unit-conversion' | 'reference-range' | 'delta-check' | 'qc-rules' | 'volume-ledger' | 'autoverification' | 'turnaround-time' | 'specimen-stability' | 'critical-repeat' | 'reflex-plan' | 'reporting-format';
export type SyntheticLabDayTrace = { step: SyntheticLabDayStep; decision: string; reasonCodes: string[]; explanation: string };
export type SyntheticLabDayResultInput = {
  resultId: string;
  subjectId: string;
  specimenId: string;
  runId: string;
  testCode: string;
  /** Registry code, e.g. GLUCOSE; identities must be fabricated. */
  analyteCode: string;
  value: number;
  instrumentUnit: string;
  resultTimestamp: string;
  /** Limits and previous result must be expressed in the resolved reporting unit. */
  limitOfDetection: number;
  upperLimitOfQuantitation: number;
  previousResult?: DeltaCheckSampleResult;
  deltaRules: DeltaLimitRule[];
  measurementRange: AutoVerificationRequest['measurementRange'];
  criticalLimits: AutoVerificationRequest['criticalLimits'];
  instrumentFlags: string[];
  consumptionVolume: number;
};
export type SyntheticLabDayInput = {
  catalog: TestDefinitionVersion[];
  /** QC sequence may include prior control runs for the multirule evaluator. */
  runs: { runId: string; qc?: QCRuleEvaluationInput }[];
  specimens: { volume: SpecimenVolumeState; turnaround: TurnaroundInput }[];
  /** Processed in caller order, including cumulative specimen consumption. */
  results: SyntheticLabDayResultInput[];
  extended?: {
    stability?: { bySpecimenId: Record<string, { collectedAt: string; history: StorageConditionEntry[]; windows: StabilityWindowDeclaration[] }> };
    criticalRepeat?: { policies: CriticalRepeatPolicy[]; repeatsByResultId: Record<string, CriticalRepeatResult[]> };
    reflex?: { knownAnalytes: string[]; rules: ReflexRule[] };
    reportingFormats?: ReportingFormat[];
  };
};
export type SyntheticLabDayResult = {
  resultId: string;
  specimenId: string;
  runId: string;
  outcome: 'AUTO_RELEASE' | 'HOLD_FOR_REVIEW' | 'HOLD';
  holdReasonCodes: string[];
  trace: SyntheticLabDayTrace[];
  definition?: EffectiveVersionResolution['version'];
  converted?: UnitConversionResult;
  referenceRange?: ReferenceRangeEvaluation;
  volumeLedger?: VolumeLedgerSummary;
  turnaround?: TurnaroundResult;
  stability?: StabilityCheckOutcome;
  criticalRepeat?: CriticalRepeatOutcome;
  reflexAdditions?: string[];
  reportString?: string;
};
export type SyntheticLabDayReport = {
  results: SyntheticLabDayResult[];
  extendedTotals?: { stabilityExpired: number; criticalNotifyBlocked: number; reflexAdditions: number; censoredReports: number };
  totals: { released: number; held: number; heldByReason: Record<string, number>; tatBreaches: number };
};

/** No QC is distinct from an accepted empty control sequence. */
function evaluateRun(qc?: QCRuleEvaluationInput): { state: AutoVerificationQCState; trace: SyntheticLabDayTrace } {
  if (!qc || qc.results.length === 0) {
    return { state: 'missing', trace: { step: 'qc-rules', decision: 'missing', reasonCodes: ['qc-missing'], explanation: 'No fabricated control results were supplied.' } };
  }
  try {
    const evaluation = evaluateQCRules(qc);
    const states = { accepted: 'in-control', warning: 'warning', rejected: 'out-of-control' } as const;
    return { state: states[evaluation.status], trace: {
      step: 'qc-rules', decision: evaluation.status,
      reasonCodes: [...new Set(evaluation.firings.map(f => f.rule))],
      explanation: evaluation.firings.map(f => explainQCRuleCode(f.rule)).join(' ') || 'Fabricated controls passed the declared QC rules.',
    } };
  } catch (error) {
    if (!(error instanceof QCRuleEvaluationInputError)) throw error;
    return { state: 'out-of-control', trace: { step: 'qc-rules', decision: 'HOLD', reasonCodes: [error.code], explanation: error.message } };
  }
}

export function runSyntheticLabDay(input: SyntheticLabDayInput): SyntheticLabDayReport {
  let censoredReports = 0;
  const qcCache = new Map<string, ReturnType<typeof evaluateRun>>();
  const events = new Map<string, VolumeLedgerEventInput[]>();
  const results = input.results.map((result): SyntheticLabDayResult => {
    const report: SyntheticLabDayResult = { resultId: result.resultId, specimenId: result.specimenId, runId: result.runId, outcome: 'HOLD', holdReasonCodes: [], trace: [] };
    const hold = (codes: string[]) => report.holdReasonCodes.push(...codes);
    const trace = (step: SyntheticLabDayStep, decision: string, reasonCodes: string[], explanation: string) => report.trace.push({ step, decision, reasonCodes, explanation });
    const definition = resolveEffectiveTestDefinition(input.catalog, result.testCode, result.resultTimestamp);
    trace('effective-definition', definition.decision, [definition.reasonCode], definition.reason);
    if (input.extended?.stability) {
      const declaration = input.extended.stability.bySpecimenId[result.specimenId];
      if (!declaration) {
        trace('specimen-stability', 'not-declared', [], 'No stability declaration was supplied for this fabricated specimen.');
      } else {
        try {
          report.stability = evaluateSpecimenStability({ ...declaration, specimenId: result.specimenId, analyteCode: result.analyteCode, resultAt: result.resultTimestamp });
          trace('specimen-stability', report.stability.status, [report.stability.reasonCode], explainStabilityCheckReason(report.stability.reasonCode));
          if (report.stability.status === 'expired') hold([report.stability.reasonCode]);
        } catch (error) {
          if (!(error instanceof StabilityWindowInputError)) throw error;
          trace('specimen-stability', 'HOLD', [error.code], error.message);
          hold([error.code]);
        }
      }
    }
    if (!definition.version) {
      hold([definition.reasonCode]);
      return report;
    }
    report.definition = definition.version;
    try {
      report.converted = convertResultUnit({ analyteCode: result.analyteCode, value: result.value, fromUnit: result.instrumentUnit, toUnit: definition.version.units });
    } catch (error) {
      if (!(error instanceof UnitConversionError)) throw error;
      trace('unit-conversion', 'HOLD', [error.code], error.message);
      hold([error.code]);
      return report;
    }
    const converted = report.converted;
    trace('unit-conversion', 'converted', [], `Converted fabricated value to ${converted.unit}.`);
    const reference = evaluateReferenceRange({ result: converted.value, unit: converted.unit, limitOfDetection: result.limitOfDetection, upperLimitOfQuantitation: result.upperLimitOfQuantitation, referenceRange: { ...definition.version.referenceInterval, unit: definition.version.units } });
    report.referenceRange = reference;
    trace('reference-range', reference.classification, reference.reasons.map(r => r.code), reference.flag);
    if (reference.classification === 'invalid') hold(reference.reasons.map(r => r.code));
    let deltaStatus: DeltaCheckStatus = 'block';
    try {
      const delta = evaluateResultDelta({ current: { subjectId: result.subjectId, analyteCode: result.analyteCode, value: converted.value, unit: converted.unit, capturedAt: result.resultTimestamp }, prior: result.previousResult ?? null, rules: result.deltaRules });
      deltaStatus = delta.status;
      trace('delta-check', delta.status, [delta.reasonCode], explainDeltaCheckReason(delta.reasonCode));
    } catch (error) {
      if (!(error instanceof DeltaCheckInputError)) throw error;
      trace('delta-check', 'HOLD', [error.code], error.message);
      hold([error.code]);
    }
    // Lazy cache preserves step order and evaluates each encountered run once.
    let qc = qcCache.get(result.runId);
    if (!qc) {
      const runs = input.runs.filter(run => run.runId === result.runId);
      qc = runs.length === 1 ? evaluateRun(runs[0].qc) : evaluateRun();
      qcCache.set(result.runId, qc);
    }
    report.trace.push({ ...qc.trace, reasonCodes: [...qc.trace.reasonCodes] });
    if (qc.trace.decision === 'HOLD') hold(qc.trace.reasonCodes);
    const specimens = input.specimens.filter(s => s.volume.accessionId === result.specimenId);
    const specimen = specimens.length === 1 ? specimens[0] : undefined;
    if (!specimen) {
      trace('volume-ledger', 'HOLD', ['specimen-missing-or-duplicate'], 'Exactly one fabricated specimen is required.');
      hold(['specimen-missing-or-duplicate']);
    } else {
      const proposed: VolumeLedgerEventInput[] = [...(events.get(result.specimenId) ?? []), { entryType: 'CONSUMPTION', eventId: `SYNTHETIC-TEST-RUN-${result.resultId}`, kind: 'TEST_RUN', amount: result.consumptionVolume, timestamp: Date.parse(result.resultTimestamp) }];
      try {
        const ledger = applyVolumeLedgerEvents({ specimen: specimen.volume, events: proposed });
        report.volumeLedger = ledger;
        if (ledger.status === 'INVALID') {
          trace('volume-ledger', 'HOLD', [ledger.failure.code], explainVolumeLedgerReason(ledger.failure.code));
          hold([ledger.failure.code]);
        } else {
          events.set(result.specimenId, proposed);
          trace('volume-ledger', 'VALID', [], 'Fabricated TEST_RUN consumption posted to the in-process ledger.');
        }
      } catch (error) {
        if (!(error instanceof VolumeLedgerInputError)) throw error;
        trace('volume-ledger', 'HOLD', [error.code], error.message);
        hold([error.code]);
      }
    }
    const verification = evaluateAutoVerification({ result: { analyteCode: result.analyteCode, value: converted.value, unit: converted.unit, instrumentFlags: result.instrumentFlags }, qcState: qc.state, deltaCheckStatus: deltaStatus, measurementRange: result.measurementRange, criticalLimits: result.criticalLimits });
    trace('autoverification', verification.decision, [...verification.reasons], verification.reasons.length ? `Human review required: ${verification.reasons.join(', ')}.` : 'Rule decision only; human technical review is still required.');
    report.outcome = report.holdReasonCodes.length ? 'HOLD' : verification.decision;
    hold([...verification.reasons]);
    const extendedHold = (codes: string[]) => {
      hold(codes);
      report.outcome = 'HOLD';
    };
    const repeatConfig = input.extended?.criticalRepeat;
    const policy = repeatConfig?.policies.find(p => p.analyteCode === result.analyteCode);
    if (repeatConfig && policy && verification.reasons.includes('value-critical')) {
      try {
        report.criticalRepeat = evaluateCriticalRepeat({
          first: { subjectId: result.subjectId, analyteCode: result.analyteCode, value: converted.value, unit: converted.unit, capturedAt: result.resultTimestamp },
          repeats: repeatConfig.repeatsByResultId[result.resultId] ?? [], policy,
        });
        trace('critical-repeat', report.criticalRepeat.status, [report.criticalRepeat.reasonCode], explainCriticalRepeatReason(report.criticalRepeat.reasonCode));
      } catch (error) {
        if (!(error instanceof CriticalRepeatPolicyInputError)) throw error;
        trace('critical-repeat', 'HOLD', [error.code], error.message);
        extendedHold([error.code]);
      }
    }
    if (input.extended?.reflex) {
      const plan = planReflexTests({ ...input.extended.reflex, results: [{ analyte: result.analyteCode, value: converted.value }] });
      if (plan.status === 'ok') {
        report.reflexAdditions = plan.additions.map(addition => addition.analyte);
        trace('reflex-plan', 'ok', [], `Fabricated reflex plan adds ${plan.additions.length} analytes.`);
      } else {
        const codes = plan.rejections.map(rejection => rejection.code);
        trace('reflex-plan', 'blocked', codes, `Reflex planning blocked: ${codes.join(', ')}.`);
        extendedHold(codes);
      }
    }
    if (input.extended?.reportingFormats) {
      try {
        const formatted = formatReportedResult({ analyteCode: result.analyteCode, value: converted.value, formats: input.extended.reportingFormats });
        report.reportString = formatted.reportString;
        if (formatted.censoring !== null) censoredReports += 1;
        trace('reporting-format', formatted.censoring ?? 'formatted', [], `Fabricated report: ${formatted.reportString}.`);
      } catch (error) {
        if (!(error instanceof ReportingFormatError)) throw error;
        trace('reporting-format', 'HOLD', [error.code], explainReportingFormatError(error.code));
        extendedHold([error.code]);
      }
    }
    if (specimen) {
      try {
        report.turnaround = computeTurnaroundTime(specimen.turnaround);
        trace('turnaround-time', report.turnaround.status, [], `Fabricated turnaround: ${report.turnaround.totalDurationMinutes} minutes.`);
      } catch (error) {
        if (!(error instanceof TurnaroundTimeInputError)) throw error;
        trace('turnaround-time', 'invalid', [error.code], error.message);
      }
    } else {
      trace('turnaround-time', 'unavailable', ['specimen-missing-or-duplicate'], 'No unambiguous specimen timestamps are available.');
    }
    report.holdReasonCodes = [...new Set(report.holdReasonCodes)];
    return report;
  });
  const heldByReason: Record<string, number> = {};
  for (const result of results) for (const code of result.holdReasonCodes) heldByReason[code] = (heldByReason[code] ?? 0) + 1;
  const released = results.filter(r => r.outcome === 'AUTO_RELEASE').length;
  const report: SyntheticLabDayReport = { results, totals: { released, held: results.length - released, heldByReason, tatBreaches: new Set(results.filter(r => r.turnaround?.status === 'breached').map(r => r.specimenId)).size } };
  if (input.extended !== undefined) {
    report.extendedTotals = {
      stabilityExpired: results.filter(r => r.stability?.status === 'expired').length,
      criticalNotifyBlocked: results.filter(r => r.criticalRepeat?.notifyAllowed === false).length,
      reflexAdditions: results.reduce((sum, r) => sum + (r.reflexAdditions?.length ?? 0), 0),
      censoredReports,
    };
  }
  return report;
}
