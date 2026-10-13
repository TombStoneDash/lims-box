import {
  evaluateInstrumentCalibration,
  type InstrumentCalibrationInput,
  type InstrumentEvaluation,
} from './senaite-demo-equipment';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Date-only deadlines are UTC midnight; dueInDays can be fractional or negative. */
export function projectUpcomingCalibrations(
  instruments: InstrumentCalibrationInput[],
  asOf: Date,
  horizonDays: number,
): Array<{
  instrument: InstrumentCalibrationInput;
  dueInDays: number;
  evaluation: InstrumentEvaluation;
}> {
  if (!Array.isArray(instruments)) {
    throw new TypeError('projectUpcomingCalibrations: instruments must be an array');
  }
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new TypeError('projectUpcomingCalibrations: asOf must be a valid Date');
  }
  // Existing dashboard uses +Infinity for an unlimited forward horizon.
  if (!Number.isFinite(horizonDays) && horizonDays !== Infinity) {
    throw new TypeError('projectUpcomingCalibrations: horizonDays must be finite or positive Infinity');
  }

  const asOfTime = asOf.getTime();
  const asOfDate = asOf.toISOString().slice(0, 10);
  const horizonTime = asOfTime + horizonDays * MILLISECONDS_PER_DAY;

  return instruments.flatMap(instrument => {
    const evaluation = evaluateInstrumentCalibration(instrument, asOfDate);
    if (evaluation.nextCalibration === null) return [];

    const dueTime = new Date(`${evaluation.nextCalibration}T00:00:00Z`).getTime();
    if (evaluation.status !== 'overdue' && !(dueTime >= asOfTime && dueTime <= horizonTime)) {
      return [];
    }

    return [{ instrument, dueInDays: (dueTime - asOfTime) / MILLISECONDS_PER_DAY, evaluation }];
  }).sort((a, b) => {
    const overdueOrder = Number(b.evaluation.status === 'overdue') - Number(a.evaluation.status === 'overdue');
    if (overdueOrder) return overdueOrder;
    if (a.dueInDays !== b.dueInDays) return a.dueInDays - b.dueInDays;
    if (a.instrument.serialNumber !== b.instrument.serialNumber) {
      return a.instrument.serialNumber < b.instrument.serialNumber ? -1 : 1;
    }
    return a.instrument.name < b.instrument.name ? -1 : a.instrument.name > b.instrument.name ? 1 : 0;
  });
}
