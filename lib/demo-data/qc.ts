export interface QCRun {
  date: string;
  analyte: string;
  result: number;
  mean: number;
  sd: number;
  controlLot: string;
  status: 'Pass' | 'Warning' | 'Fail';
  runBy: string;
}

export interface QCAnalyte {
  name: string;
  unit: string;
  mean: number;
  sd: number;
  controlLot: string;
  runs: QCRun[];
}

const staff = ['Sarah Chen', 'Mike Torres', 'Ana Patel', 'James Kim'];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateQCRuns(
  analyte: string,
  unit: string,
  mean: number,
  sd: number,
  controlLot: string,
  seed: number,
): QCAnalyte {
  const rand = seededRandom(seed);
  const runs: QCRun[] = [];

  for (let day = 0; day < 90; day++) {
    const date = new Date(2026, 0, 14);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];

    // Generate within ±2SD for clean audit (slight natural variation)
    const zScore = (rand() - 0.5) * 3.2; // ~±1.6 SD typical
    const result = Math.round((mean + zScore * sd) * 10) / 10;
    const deviation = Math.abs(result - mean) / sd;

    runs.push({
      date: dateStr,
      analyte,
      result,
      mean,
      sd,
      controlLot,
      status: deviation <= 2 ? 'Pass' : deviation <= 3 ? 'Warning' : 'Fail',
      runBy: staff[Math.floor(rand() * staff.length)],
    });
  }

  return { name: analyte, unit, mean, sd, controlLot, runs };
}

export const glucoseQC = generateQCRuns(
  'Glucose', 'mg/dL', 100.0, 3.5, 'GL-2026-A1', 42,
);

export const hba1cQC = generateQCRuns(
  'HbA1c', '%', 5.7, 0.2, 'HA-2026-B3', 84,
);

export const cbcWbcQC = generateQCRuns(
  'WBC (CBC)', 'x10³/µL', 7.5, 0.5, 'CBC-2026-C2', 126,
);

export const cbcRbcQC = generateQCRuns(
  'RBC (CBC)', 'x10⁶/µL', 4.8, 0.15, 'CBC-2026-C2', 168,
);

export const cbcHgbQC = generateQCRuns(
  'Hemoglobin (CBC)', 'g/dL', 14.0, 0.4, 'CBC-2026-C2', 210,
);

export const allQCData: QCAnalyte[] = [glucoseQC, hba1cQC, cbcWbcQC, cbcRbcQC, cbcHgbQC];

export const qcSummary = {
  totalRuns: allQCData.reduce((sum, a) => sum + a.runs.length, 0),
  passRate: '100%',
  outOfRange: 0,
  lastRunDate: '2026-04-13',
  controlLots: ['GL-2026-A1', 'HA-2026-B3', 'CBC-2026-C2'],
};
