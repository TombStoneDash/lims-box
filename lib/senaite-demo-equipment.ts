export type InstrumentCalibrationInput = {
  serialNumber: string;
  name: string;
  calibrationStatus: string;
  nextCalibration: string;
};

export type InstrumentStatusValue = 'current' | 'overdue' | 'invalid';

export type InstrumentEvaluation = {
  serialNumber: string;
  name: string;
  status: InstrumentStatusValue;
  nextCalibration: string | null;
};

export type EquipmentEvaluationSummary = {
  status: InstrumentStatusValue;
  totalInstruments: number;
  currentCount: number;
  overdueCount: number;
  invalidCount: number;
  nextCalibrationDue: string | null;
  nextDueInstrumentName: string | null;
  overdueInstruments: string[];
  invalidInstruments: string[];
};

export const DEMO_AS_OF_DATE = '2026-04-13';

const VALID_CALIBRATION_STATUSES = new Set(['Calibrated']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isValidInstrumentInput(instrument: InstrumentCalibrationInput): boolean {
  if (!instrument || typeof instrument.serialNumber !== 'string' || instrument.serialNumber.length === 0) {
    return false;
  }
  if (typeof instrument.calibrationStatus !== 'string' || !VALID_CALIBRATION_STATUSES.has(instrument.calibrationStatus)) {
    return false;
  }
  return isValidIsoDate(instrument.nextCalibration);
}

export function evaluateInstrumentCalibration(
  instrument: InstrumentCalibrationInput,
  asOfDate: string = DEMO_AS_OF_DATE,
): InstrumentEvaluation {
  if (!isValidInstrumentInput(instrument)) {
    return {
      serialNumber: instrument?.serialNumber ?? '',
      name: instrument?.name ?? '',
      status: 'invalid',
      nextCalibration: null,
    };
  }

  return {
    serialNumber: instrument.serialNumber,
    name: instrument.name,
    status: instrument.nextCalibration < asOfDate ? 'overdue' : 'current',
    nextCalibration: instrument.nextCalibration,
  };
}

export function evaluateEquipmentStatus(
  instruments: InstrumentCalibrationInput[],
  asOfDate: string = DEMO_AS_OF_DATE,
): EquipmentEvaluationSummary {
  if (!Array.isArray(instruments) || instruments.length === 0) {
    return {
      status: 'invalid',
      totalInstruments: 0,
      currentCount: 0,
      overdueCount: 0,
      invalidCount: 0,
      nextCalibrationDue: null,
      nextDueInstrumentName: null,
      overdueInstruments: [],
      invalidInstruments: [],
    };
  }

  const evaluations = instruments.map(instrument => evaluateInstrumentCalibration(instrument, asOfDate));

  const currentEvals = evaluations.filter(e => e.status === 'current');
  const overdueEvals = evaluations.filter(e => e.status === 'overdue');
  const invalidEvals = evaluations.filter(e => e.status === 'invalid');

  // Tie-break on serialNumber (the fixture's stable unique key) so the
  // reported "next due" instrument is deterministic when dates collide.
  const nextDue = [...currentEvals].sort((a, b) => {
    if (a.nextCalibration! < b.nextCalibration!) return -1;
    if (a.nextCalibration! > b.nextCalibration!) return 1;
    return a.serialNumber < b.serialNumber ? -1 : a.serialNumber > b.serialNumber ? 1 : 0;
  })[0];

  const status: InstrumentStatusValue =
    invalidEvals.length > 0 ? 'invalid' : overdueEvals.length > 0 ? 'overdue' : 'current';

  return {
    status,
    totalInstruments: instruments.length,
    currentCount: currentEvals.length,
    overdueCount: overdueEvals.length,
    invalidCount: invalidEvals.length,
    nextCalibrationDue: nextDue?.nextCalibration ?? null,
    nextDueInstrumentName: nextDue?.name ?? null,
    overdueInstruments: overdueEvals.map(e => e.name),
    invalidInstruments: invalidEvals.map(e => e.name),
  };
}
