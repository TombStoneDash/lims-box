import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import {
  explainAccessionBlock,
  explainAccessionBlockNextAction,
  runAccessionWorkflow,
  type AccessionBlockCode,
  type AccessionContext,
  type AccessionEventInput,
} from '@/lib/ohworks-accession-workflow';
import {
  evaluateSampleAcceptance,
  explainSampleRejectionReason,
  explainSampleRejectionNextAction,
  type SampleAcceptancePolicy,
  type SampleSubmission,
} from '@/lib/ohworks-sample-rejection';

/**
 * All identifiers, events, and submissions on this page are fabricated for
 * the local supervised demo. Nothing here reads, writes, or references a
 * real sample, patient, or customer record.
 */

const DEMO_TENANT_ID = 'tenant-synthetic-ohworks';

type BlockedAccessionScenario = {
  sampleId: string;
  summary: string;
};

const BLOCKED_ACCESSION_SCENARIOS: BlockedAccessionScenario[] = [
  { sampleId: 'sample-synthetic-1001', summary: 'Chain-of-custody note flagged the submission as compromised at intake.' },
  { sampleId: 'sample-synthetic-1002', summary: 'A technical reviewer attempted to accession a sample still missing a verified requisition.' },
  { sampleId: 'sample-synthetic-1003', summary: 'A second event arrived for an already-terminal sample.' },
];

function buildBlockedAccession(scenarioIndex: number): {
  scenario: BlockedAccessionScenario;
  blockCode: AccessionBlockCode;
} | null {
  const scenario = BLOCKED_ACCESSION_SCENARIOS[scenarioIndex];
  const context: AccessionContext = { tenantId: DEMO_TENANT_ID, sampleId: scenario.sampleId };

  const eventSets: AccessionEventInput[][] = [
    [
      { eventId: 'evt-1001-a', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'receive', actorClass: 'submitter', reasonCode: 'sample-intake-logged', occurredAt: '2026-01-01T08:00:00.000Z' },
      { eventId: 'evt-1001-b', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'reject', actorClass: 'accessioner', reasonCode: 'chain-of-custody-broken', occurredAt: '2026-01-01T08:05:00.000Z' },
      { eventId: 'evt-1001-c', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T08:10:00.000Z' },
    ],
    [
      { eventId: 'evt-1002-a', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'receive', actorClass: 'submitter', reasonCode: 'sample-intake-logged', occurredAt: '2026-01-01T09:00:00.000Z' },
      { eventId: 'evt-1002-b', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'hold', actorClass: 'accessioner', reasonCode: 'insufficient-sample-volume', occurredAt: '2026-01-01T09:05:00.000Z' },
      { eventId: 'evt-1002-c', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'accession', actorClass: 'quality-reviewer', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T09:00:00.000Z' },
    ],
    [
      { eventId: 'evt-1003-a', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'receive', actorClass: 'submitter', reasonCode: 'sample-intake-logged', occurredAt: '2026-01-01T10:00:00.000Z' },
      { eventId: 'evt-1003-b', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'cancel', actorClass: 'submitter', reasonCode: 'submitted-in-error', occurredAt: '2026-01-01T10:05:00.000Z' },
      { eventId: 'evt-1003-c', sampleId: scenario.sampleId, tenantId: DEMO_TENANT_ID, kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T10:10:00.000Z' },
    ],
  ];

  const result = runAccessionWorkflow(context, eventSets[scenarioIndex]);
  const blockedStep = result.steps.find((step): step is Extract<typeof step, { allowed: false }> => step.allowed === false);
  if (!blockedStep) {
    return null;
  }
  return { scenario, blockCode: blockedStep.blockCode };
}

const REJECTED_SAMPLE_POLICY: SampleAcceptancePolicy = {
  tenantId: DEMO_TENANT_ID,
  approvedPairs: [{ matrix: 'urine', container: 'sterile-cup' }],
  volumeRules: [{ matrix: 'urine', unit: 'mL', minVolume: 20, maxVolume: 200 }],
  temperatureRanges: [{ matrix: 'urine', unit: 'C', minTemperature: 2, maxTemperature: 8 }],
  sealRule: { acceptedSealStates: ['intact'] },
  duplicateRule: { replayDisposition: 'HOLD' },
  holdRule: { conditions: [] },
  timestampBound: { referenceTime: '2026-01-01T12:00:00.000Z', maxAgeMs: 24 * 60 * 60 * 1000 },
};

const REJECTED_SAMPLES: SampleSubmission[] = [
  {
    sampleId: 'sample-synthetic-2001',
    tenantId: DEMO_TENANT_ID,
    matrix: 'urine',
    container: 'unsealed-vial',
    volume: 50,
    volumeUnit: 'mL',
    temperature: 4,
    temperatureUnit: 'C',
    sealState: 'intact',
    collectedAt: '2026-01-01T09:00:00.000Z',
  },
  {
    sampleId: 'sample-synthetic-2002',
    tenantId: DEMO_TENANT_ID,
    matrix: 'urine',
    container: 'sterile-cup',
    volume: 5,
    volumeUnit: 'mL',
    temperature: 4,
    temperatureUnit: 'C',
    sealState: 'intact',
    collectedAt: '2026-01-01T09:00:00.000Z',
  },
  {
    sampleId: 'sample-synthetic-2003',
    tenantId: DEMO_TENANT_ID,
    matrix: 'urine',
    container: 'sterile-cup',
    volume: 50,
    volumeUnit: 'mL',
    temperature: 4,
    temperatureUnit: 'C',
    sealState: 'broken',
    collectedAt: '2026-01-01T09:00:00.000Z',
  },
];

export default function OHWorksAccessionRejections() {
  const blockedAccessions = BLOCKED_ACCESSION_SCENARIOS.map((_, index) => buildBlockedAccession(index)).filter(
    (result): result is NonNullable<typeof result> => result !== null,
  );

  const rejectedDecisions = evaluateSampleAcceptance(REJECTED_SAMPLE_POLICY, REJECTED_SAMPLES).filter(
    (decision) => decision.status === 'REJECT',
  );

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Accession rejection review</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Every blocked or rejected synthetic accession shown here carries a bounded reason code and a
          concrete next corrective action. No raw field value, note text, or identity data is ever shown -
          only the deterministic, privacy-safe explanation the workflow and acceptance policy produce.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <ShieldAlert className="h-5 w-5 text-rose-600" />
          <h2 className="font-semibold">Blocked accession events</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {blockedAccessions.map(({ scenario, blockCode }) => (
            <article key={scenario.sampleId} className="grid gap-3 px-6 py-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h3 className="font-mono text-sm font-semibold text-slate-950">{scenario.sampleId}</h3>
                <p className="mt-2 text-sm text-slate-600">{scenario.summary}</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
                <p className="font-semibold">{explainAccessionBlock(blockCode)}</p>
                <p className="mt-2 flex items-start gap-2 text-rose-800">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{explainAccessionBlockNextAction(blockCode)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
          <h2 className="font-semibold">Rejected sample submissions</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {rejectedDecisions.map((decision) => (
            <article key={decision.sampleId} className="grid gap-3 px-6 py-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h3 className="font-mono text-sm font-semibold text-slate-950">{decision.sampleId}</h3>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-700">Rejected</p>
              </div>
              <div className="space-y-3">
                {decision.reasons.map((reason) => (
                  <div key={reason.code} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <p className="font-semibold">{explainSampleRejectionReason(reason)}</p>
                    <p className="mt-2 flex items-start gap-2 text-amber-800">
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{explainSampleRejectionNextAction(reason)}</span>
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
