/**
 * Fail-closed, deterministic storage-condition excursion log for the
 * synthetic OHWorks pilot.
 *
 * Given a specimen's required storage band (a bounded name that carries a
 * temperature range, a light ceiling, and a humidity ceiling) and an
 * ordered, caller-supplied list of sensor readings, this module classifies
 * every reading as `within_tolerance`, `minor`, or `critical`, groups
 * consecutive non-tolerant readings into excursions (with a start, end,
 * duration, and the reading that drove the excursion's severity), and
 * decides whether the specimen remains usable.
 *
 * It never reads the clock or a sensor itself: every timestamp and reading
 * value is supplied by the caller, so a given input always produces the
 * same output. An unknown storage band, an empty reading list, a missing or
 * unparsable timestamp, timestamps that are not strictly increasing, a
 * non-finite reading value, or a reading value outside its physically
 * possible range all fail closed by throwing StorageConditionLogError
 * rather than guessing at a classification.
 */

/** Bounded storage bands this module knows declared limits for. */
export type StorageBandName = 'frozen' | 'refrigerated' | 'controlled_room_temperature';

/** The only severities a reading or excursion can ever be classified as. */
export type StorageConditionSeverity = 'within_tolerance' | 'minor' | 'critical';

/** Fabricated sensor reading. Never derived from a real cold-chain device. */
export type SensorReading = {
  /** UTC timestamp (must end in "Z") the reading was taken. */
  timestamp: string;
  temperatureC: number;
  lightLux: number;
  humidityPercent: number;
};

type StorageBandLimits = {
  minTemperatureC: number;
  maxTemperatureC: number;
  minorToleranceC: number;
  maxLightLux: number;
  minorToleranceLux: number;
  maxHumidityPercent: number;
  minorToleranceHumidityPercent: number;
};

/**
 * Declared limits per bounded storage band. Every threshold is a fabricated,
 * fixed value for the synthetic pilot, not sourced from a real specimen
 * handling manual. `minorTolerance*` is the additional margin beyond the
 * primary limit that is still logged as `minor` rather than `critical`.
 */
const KNOWN_STORAGE_BANDS: Record<StorageBandName, StorageBandLimits> = {
  frozen: {
    minTemperatureC: -25,
    maxTemperatureC: -15,
    minorToleranceC: 3,
    maxLightLux: 50,
    minorToleranceLux: 10,
    maxHumidityPercent: 70,
    minorToleranceHumidityPercent: 10,
  },
  refrigerated: {
    minTemperatureC: 2,
    maxTemperatureC: 8,
    minorToleranceC: 2,
    maxLightLux: 200,
    minorToleranceLux: 50,
    maxHumidityPercent: 60,
    minorToleranceHumidityPercent: 10,
  },
  controlled_room_temperature: {
    minTemperatureC: 20,
    maxTemperatureC: 25,
    minorToleranceC: 2,
    maxLightLux: 500,
    minorToleranceLux: 100,
    maxHumidityPercent: 65,
    minorToleranceHumidityPercent: 10,
  },
};

function isKnownStorageBand(value: string): value is StorageBandName {
  return Object.prototype.hasOwnProperty.call(KNOWN_STORAGE_BANDS, value);
}

export type StorageExcursion = {
  severity: 'minor' | 'critical';
  startTimestamp: string;
  endTimestamp: string;
  durationMs: number;
  /** Index into the original readings array of the reading that drove this excursion's severity. */
  worstReadingIndex: number;
  worstReading: SensorReading;
};

export type ReadingClassification = {
  index: number;
  timestamp: string;
  severity: StorageConditionSeverity;
};

export type StorageConditionLogEvaluation = {
  bandName: StorageBandName;
  readingClassifications: ReadingClassification[];
  excursions: StorageExcursion[];
  usable: boolean;
  decisionRuleCode: 'no-critical-excursions' | 'critical-excursion-detected';
};

export type StorageConditionLogErrorCode =
  | 'storage-band-unknown'
  | 'readings-empty'
  | 'reading-timestamp-missing'
  | 'reading-timestamp-invalid'
  | 'readings-timestamps-unordered'
  | 'reading-value-non-finite'
  | 'reading-value-out-of-range';

const ERROR_MESSAGES: Record<StorageConditionLogErrorCode, string> = {
  'storage-band-unknown': 'The storage band is not a recognized bounded value.',
  'readings-empty': 'The sensor reading list must contain at least one reading.',
  'reading-timestamp-missing': 'A sensor reading is missing its timestamp.',
  'reading-timestamp-invalid': 'A sensor reading timestamp could not be parsed as a UTC timestamp.',
  'readings-timestamps-unordered': 'Sensor reading timestamps must be strictly increasing.',
  'reading-value-non-finite': 'A sensor reading value must be a finite number.',
  'reading-value-out-of-range': 'A sensor reading value is outside its physically possible range.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainStorageConditionLogError(code: StorageConditionLogErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a storage-condition log. */
export class StorageConditionLogError extends Error {
  readonly code: StorageConditionLogErrorCode;
  readonly readingIndex?: number;

  constructor(code: StorageConditionLogErrorCode, readingIndex?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = 'StorageConditionLogError';
    this.code = code;
    this.readingIndex = readingIndex;
  }
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

const SEVERITY_RANK: Record<StorageConditionSeverity, number> = {
  within_tolerance: 0,
  minor: 1,
  critical: 2,
};

function worstOf(...severities: StorageConditionSeverity[]): StorageConditionSeverity {
  return severities.reduce((worst, current) =>
    SEVERITY_RANK[current] > SEVERITY_RANK[worst] ? current : worst,
  );
}

function classifyRange(
  value: number,
  min: number,
  max: number,
  minorTolerance: number,
): StorageConditionSeverity {
  if (value >= min && value <= max) {
    return 'within_tolerance';
  }
  if (value >= min - minorTolerance && value <= max + minorTolerance) {
    return 'minor';
  }
  return 'critical';
}

function classifyUpperBound(
  value: number,
  max: number,
  minorTolerance: number,
): StorageConditionSeverity {
  if (value <= max) {
    return 'within_tolerance';
  }
  if (value <= max + minorTolerance) {
    return 'minor';
  }
  return 'critical';
}

function classifyReading(reading: SensorReading, limits: StorageBandLimits): StorageConditionSeverity {
  const temperatureSeverity = classifyRange(
    reading.temperatureC,
    limits.minTemperatureC,
    limits.maxTemperatureC,
    limits.minorToleranceC,
  );
  const lightSeverity = classifyUpperBound(reading.lightLux, limits.maxLightLux, limits.minorToleranceLux);
  const humiditySeverity = classifyUpperBound(
    reading.humidityPercent,
    limits.maxHumidityPercent,
    limits.minorToleranceHumidityPercent,
  );
  return worstOf(temperatureSeverity, lightSeverity, humiditySeverity);
}

function validateReading(reading: SensorReading, index: number): void {
  const { timestamp, temperatureC, lightLux, humidityPercent } = reading;

  if (timestamp === undefined || timestamp === null || timestamp === '') {
    throw new StorageConditionLogError('reading-timestamp-missing', index);
  }
  if (!isUtcTimestamp(timestamp)) {
    throw new StorageConditionLogError('reading-timestamp-invalid', index);
  }

  if (!Number.isFinite(temperatureC) || !Number.isFinite(lightLux) || !Number.isFinite(humidityPercent)) {
    throw new StorageConditionLogError('reading-value-non-finite', index);
  }

  if (lightLux < 0 || humidityPercent < 0 || humidityPercent > 100) {
    throw new StorageConditionLogError('reading-value-out-of-range', index);
  }
}

/**
 * Evaluate a fabricated specimen's storage-condition sensor log against its
 * declared storage band, returning a per-reading classification, the
 * grouped excursions, and a usability decision.
 *
 * Fail-closed: an unrecognized storage band, an empty reading list, a
 * missing or unparsable reading timestamp, timestamps that are not strictly
 * increasing, a non-finite reading value, or a reading value outside its
 * physically possible range all throw StorageConditionLogError instead of
 * guessing at a classification.
 */
export function evaluateStorageConditionLog(
  bandName: string,
  readings: SensorReading[],
): StorageConditionLogEvaluation {
  if (!isKnownStorageBand(bandName)) {
    throw new StorageConditionLogError('storage-band-unknown');
  }

  if (readings.length === 0) {
    throw new StorageConditionLogError('readings-empty');
  }

  readings.forEach(validateReading);

  for (let i = 1; i < readings.length; i += 1) {
    if (Date.parse(readings[i].timestamp) <= Date.parse(readings[i - 1].timestamp)) {
      throw new StorageConditionLogError('readings-timestamps-unordered', i);
    }
  }

  const limits = KNOWN_STORAGE_BANDS[bandName];

  const readingClassifications: ReadingClassification[] = readings.map((reading, index) => ({
    index,
    timestamp: reading.timestamp,
    severity: classifyReading(reading, limits),
  }));

  const excursions: StorageExcursion[] = [];
  let runStartIndex: number | null = null;

  const closeRun = (runEndIndex: number) => {
    if (runStartIndex === null) {
      return;
    }
    const runClassifications = readingClassifications.slice(runStartIndex, runEndIndex + 1);
    const severity = worstOf(...runClassifications.map((c) => c.severity)) as 'minor' | 'critical';
    const worstIndex = runClassifications.find((c) => c.severity === severity)?.index ?? runStartIndex;
    excursions.push({
      severity,
      startTimestamp: readings[runStartIndex].timestamp,
      endTimestamp: readings[runEndIndex].timestamp,
      durationMs: Date.parse(readings[runEndIndex].timestamp) - Date.parse(readings[runStartIndex].timestamp),
      worstReadingIndex: worstIndex,
      worstReading: readings[worstIndex],
    });
    runStartIndex = null;
  };

  readingClassifications.forEach((classification, index) => {
    if (classification.severity === 'within_tolerance') {
      closeRun(index - 1);
      return;
    }
    if (runStartIndex === null) {
      runStartIndex = index;
    }
  });
  closeRun(readingClassifications.length - 1);

  const hasCriticalExcursion = excursions.some((excursion) => excursion.severity === 'critical');

  return {
    bandName,
    readingClassifications,
    excursions,
    usable: !hasCriticalExcursion,
    decisionRuleCode: hasCriticalExcursion ? 'critical-excursion-detected' : 'no-critical-excursions',
  };
}
