import { evaluateCrossmatchHold, type CrossmatchHoldInput, type CrossmatchHoldStatus } from './ohworks-bloodbank-crossmatch-hold';
import { computeReadSchedule, isReadOverdue, type MicroSpecimenType } from './ohworks-micro-culture-incubation';

/** Fixed synthetic "now"; every timestamp below is fabricated and evaluated against it. */
export const DEMO_NOW = '2026-09-20T12:00:00.000Z';
/** Fabricated grace period, not a manufacturer or regulatory value. */
export const DEMO_GRACE_PERIOD_HOURS = 4;

/** Fabricated crossmatch requests and cultures; no patient identifiers of any kind. */
export function createPilotCrossmatchCultureFixtures(): {
  crossmatchRequests: { id: string; input: CrossmatchHoldInput }[];
  cultures: { id: string; specimenType: MicroSpecimenType; platedAt: string; requiresExtendedIncubation: boolean }[];
} {
  return {
    crossmatchRequests: [
      {
        id: 'SYNTHETIC-XM-001',
        input: {
          abo: 'O', rhD: 'negative', antibodyScreenResult: 'negative', priorAntibodyIdentified: [],
          requestedUnitCount: 2, sampleAgeHours: 10, maxSampleAgeHoursForType: 72,
        },
      },
      {
        id: 'SYNTHETIC-XM-002',
        input: {
          abo: 'A', rhD: 'positive', antibodyScreenResult: 'positive', priorAntibodyIdentified: [],
          requestedUnitCount: 2, sampleAgeHours: 12, maxSampleAgeHoursForType: 72,
        },
      },
      {
        id: 'SYNTHETIC-XM-003',
        input: {
          abo: 'B', rhD: 'negative', antibodyScreenResult: 'pending', priorAntibodyIdentified: [],
          requestedUnitCount: 1, sampleAgeHours: 5, maxSampleAgeHoursForType: 72,
        },
      },
      {
        id: 'SYNTHETIC-XM-004',
        input: {
          abo: 'AB', rhD: 'positive', antibodyScreenResult: 'negative', priorAntibodyIdentified: [],
          requestedUnitCount: 3, sampleAgeHours: 80, maxSampleAgeHoursForType: 72,
        },
      },
      {
        id: 'SYNTHETIC-XM-005',
        input: {
          abo: 'O', rhD: 'positive', antibodyScreenResult: 'negative', priorAntibodyIdentified: ['Anti-K'],
          requestedUnitCount: 2, sampleAgeHours: 20, maxSampleAgeHoursForType: 72,
        },
      },
    ],
    cultures: [
      { id: 'SYNTHETIC-CULTURE-001', specimenType: 'blood', platedAt: '2026-09-17T00:00:00.000Z', requiresExtendedIncubation: false },
      { id: 'SYNTHETIC-CULTURE-002', specimenType: 'urine', platedAt: '2026-09-20T10:00:00.000Z', requiresExtendedIncubation: false },
      { id: 'SYNTHETIC-CULTURE-003', specimenType: 'wound', platedAt: '2026-09-19T10:00:00.000Z', requiresExtendedIncubation: false },
      { id: 'SYNTHETIC-CULTURE-004', specimenType: 'respiratory', platedAt: '2026-09-16T12:00:00.000Z', requiresExtendedIncubation: true },
    ],
  };
}

export type PilotCrossmatchRow = CrossmatchHoldInput & {
  id: string;
  status: CrossmatchHoldStatus;
  requiresExtendedCrossmatch: boolean;
  reason: string;
};

export type PilotCultureReadRow = {
  label: string;
  dueAt: string;
  overdue: boolean;
};

export type PilotCultureRow = {
  id: string;
  specimenType: MicroSpecimenType;
  platedAt: string;
  requiresExtendedIncubation: boolean;
  reads: PilotCultureReadRow[];
  finalNegativeAt: string;
};

export type PilotCrossmatchCultureView = {
  now: string;
  gracePeriodHours: number;
  crossmatchRows: PilotCrossmatchRow[];
  cultureRows: PilotCultureRow[];
  counts: { crossmatchOnHold: number; cultureReadsOverdue: number };
};

/** Read-only synthetic evaluation; no blood product is issued and no culture is reported. */
export function buildPilotCrossmatchCultureView(): PilotCrossmatchCultureView {
  const fixtures = createPilotCrossmatchCultureFixtures();

  const crossmatchRows: PilotCrossmatchRow[] = fixtures.crossmatchRequests.map(({ id, input }) => {
    const decision = evaluateCrossmatchHold(input);
    return { id, ...input, ...decision };
  });

  const cultureRows: PilotCultureRow[] = fixtures.cultures.map(({ id, specimenType, platedAt, requiresExtendedIncubation }) => {
    const schedule = computeReadSchedule({ specimenType, platedAt, requiresExtendedIncubation });
    const reads = schedule.reads.map((read) => ({
      ...read,
      overdue: isReadOverdue({ dueAt: read.dueAt, now: DEMO_NOW, gracePeriodHours: DEMO_GRACE_PERIOD_HOURS }),
    }));
    return { id, specimenType, platedAt, requiresExtendedIncubation, reads, finalNegativeAt: schedule.finalNegativeAt };
  });

  return {
    now: DEMO_NOW,
    gracePeriodHours: DEMO_GRACE_PERIOD_HOURS,
    crossmatchRows,
    cultureRows,
    counts: {
      crossmatchOnHold: crossmatchRows.filter((row) => row.status !== 'clear_to_crossmatch').length,
      cultureReadsOverdue: cultureRows.reduce((sum, row) => sum + row.reads.filter((read) => read.overdue).length, 0),
    },
  };
}
