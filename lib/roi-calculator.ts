export type CurrentTool = 'excel' | 'paper' | 'other-lims';

function sanitizeSamples(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeStaff(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function calculateROI(samplesPerMonth: number, staffCount: number, currentTool: CurrentTool) {
  const samples = sanitizeSamples(samplesPerMonth);
  const staff = sanitizeStaff(staffCount);

  // Time per sample (minutes) by current tool
  const timePerSample: Record<CurrentTool, number> = {
    'excel': 12,
    'paper': 18,
    'other-lims': 6,
  };

  // LIMS BOX time per sample (minutes)
  const limsBoxTimePerSample = 4;

  // Error rates (% of samples with data entry errors)
  const errorRates: Record<CurrentTool, number> = {
    'excel': 3.5,
    'paper': 6.0,
    'other-lims': 1.5,
  };
  const limsBoxErrorRate = 0.2;

  // Monthly reporting hours by tool
  const reportingHoursPerBatch: Record<CurrentTool, number> = {
    'excel': 3,
    'paper': 4.5,
    'other-lims': 1.5,
  };
  const limsBoxReportingHoursPerBatch = 0.25;
  const batchesPerMonth = Math.ceil(samples / 20);

  // Calculations
  const currentMinutesPerMonth = samples * timePerSample[currentTool];
  const limsBoxMinutesPerMonth = samples * limsBoxTimePerSample;
  const dataMgmtHoursSaved = Math.round((currentMinutesPerMonth - limsBoxMinutesPerMonth) / 60);

  const currentReportingHours = batchesPerMonth * reportingHoursPerBatch[currentTool];
  const limsBoxReportingHours = batchesPerMonth * limsBoxReportingHoursPerBatch;
  const reportingHoursSaved = Math.round(currentReportingHours - limsBoxReportingHours);

  const totalHoursSaved = dataMgmtHoursSaved + reportingHoursSaved;

  const errorReduction = Math.round(((errorRates[currentTool] - limsBoxErrorRate) / errorRates[currentTool]) * 100);

  // Cost calculation (avg lab tech rate $35/hr)
  const hourlyRate = 35;
  const monthlySavings = totalHoursSaved * hourlyRate;

  // Current tool cost estimate
  const currentToolCost: Record<CurrentTool, number> = {
    'excel': 0,
    'paper': 50,
    'other-lims': 2500,
  };

  const limsBoxCost = staff <= 3 ? 500 : staff <= 10 ? 1200 : 2500;
  const netMonthlySavings = monthlySavings - limsBoxCost + currentToolCost[currentTool];

  return {
    totalHoursSaved,
    dataMgmtHoursSaved,
    reportingHoursSaved,
    errorReduction,
    monthlySavings,
    limsBoxCost,
    netMonthlySavings,
    currentToolCost: currentToolCost[currentTool],
    annualSavings: netMonthlySavings * 12,
  };
}

export function formatNetSavings(value: number): { text: string; negative: boolean } {
  const negative = value < 0;
  const magnitude = Math.abs(value).toLocaleString('en-US');
  return {
    text: negative ? `-$${magnitude}` : `$${magnitude}`,
    negative,
  };
}
