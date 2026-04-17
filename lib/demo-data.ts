export type QCRun = { date: string; result: number };
export type QCAnalyte = {
  name: string;
  unit: string;
  mean: number;
  sd: number;
  controlLot: string;
  runs: QCRun[];
};

function generateRuns(mean: number, sd: number, days = 90, seed = 1): QCRun[] {
  const out: QCRun[] = [];
  const start = new Date('2026-01-14T00:00:00Z');
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const z = (rand() + rand() + rand() + rand() - 2) * 1.2;
    const result = Math.round((mean + z * sd) * 100) / 100;
    out.push({ date: d.toISOString().slice(0, 10), result });
  }
  return out;
}

export const allQCData: QCAnalyte[] = [
  { name: 'Lead (Pb)', unit: 'µg/L', mean: 10.0, sd: 0.4, controlLot: 'CL-PB-2025-11', runs: generateRuns(10.0, 0.4, 90, 11) },
  { name: 'Copper (Cu)', unit: 'µg/L', mean: 50.0, sd: 1.8, controlLot: 'CL-CU-2025-11', runs: generateRuns(50.0, 1.8, 90, 23) },
  { name: 'Arsenic (As)', unit: 'µg/L', mean: 5.0, sd: 0.2, controlLot: 'CL-AS-2025-11', runs: generateRuns(5.0, 0.2, 90, 37) },
  { name: 'Nitrate (NO3)', unit: 'mg/L', mean: 5.0, sd: 0.15, controlLot: 'CL-NO3-2025-11', runs: generateRuns(5.0, 0.15, 90, 51) },
];

export const qcSummary = {
  totalRuns: allQCData.reduce((n, a) => n + a.runs.length, 0),
  passRate: '100%',
  controlLots: allQCData.map(a => a.controlLot),
};

export const sampleCounts = {
  total: 847,
  byStatus: {
    Published: 612,
    Verified: 158,
    Received: 42,
    Registered: 32,
    'Pending Verification': 3,
  },
  byType: {
    'Drinking Water': 384,
    Groundwater: 211,
    Wastewater: 172,
    Soil: 80,
  },
};

type Instrument = {
  name: string;
  model: string;
  serialNumber: string;
  location: string;
  calibrationStatus: string;
  lastCalibration: string;
  nextCalibration: string;
  lastMaintenance: string;
  maintenanceLog: Array<{ date: string; action: string; technician: string }>;
};

export const instruments: Instrument[] = [
  {
    name: 'ICP-MS Agilent 7900',
    model: 'Agilent 7900',
    serialNumber: 'MY19280013',
    location: 'Room 201 — Metals Lab',
    calibrationStatus: 'Calibrated',
    lastCalibration: '2026-03-28',
    nextCalibration: '2026-04-28',
    lastMaintenance: '2026-03-01',
    maintenanceLog: [
      { date: '2026-03-28', action: 'Daily performance check — passed', technician: 'J. Martinez' },
      { date: '2026-03-01', action: 'Nebulizer replaced, cones cleaned', technician: 'J. Martinez' },
      { date: '2026-02-02', action: 'Quarterly PM — passed', technician: 'Vendor (Agilent)' },
    ],
  },
  {
    name: 'GC-MS Agilent 7890B/5977B',
    model: 'Agilent 7890B/5977B',
    serialNumber: 'US18320104',
    location: 'Room 203 — VOC Lab',
    calibrationStatus: 'Calibrated',
    lastCalibration: '2026-03-25',
    nextCalibration: '2026-04-25',
    lastMaintenance: '2026-02-14',
    maintenanceLog: [
      { date: '2026-03-25', action: 'BFB tune passed', technician: 'K. Chen' },
      { date: '2026-02-14', action: 'Source cleaned, column trimmed', technician: 'K. Chen' },
    ],
  },
  {
    name: 'IC Thermo Dionex ICS-6000',
    model: 'Dionex ICS-6000',
    serialNumber: '21100412',
    location: 'Room 205 — Anions Lab',
    calibrationStatus: 'Calibrated',
    lastCalibration: '2026-04-02',
    nextCalibration: '2026-05-02',
    lastMaintenance: '2026-01-20',
    maintenanceLog: [
      { date: '2026-04-02', action: '5-level calibration — all R² > 0.999', technician: 'R. Nguyen' },
      { date: '2026-01-20', action: 'Suppressor regenerated, eluent replaced', technician: 'R. Nguyen' },
    ],
  },
  {
    name: 'pH Meter Mettler Toledo S220',
    model: 'Mettler Toledo S220',
    serialNumber: 'B832847124',
    location: 'Room 101 — Wet Chem',
    calibrationStatus: 'Calibrated',
    lastCalibration: '2026-04-13',
    nextCalibration: '2026-04-20',
    lastMaintenance: '2026-04-01',
    maintenanceLog: [
      { date: '2026-04-13', action: '3-point calibration (pH 4, 7, 10)', technician: 'S. Lee' },
      { date: '2026-04-01', action: 'Electrode replaced', technician: 'S. Lee' },
    ],
  },
  {
    name: 'UV-Vis Hach DR6000',
    model: 'Hach DR6000',
    serialNumber: '1713032',
    location: 'Room 101 — Wet Chem',
    calibrationStatus: 'Calibrated',
    lastCalibration: '2026-04-05',
    nextCalibration: '2026-05-05',
    lastMaintenance: '2026-03-15',
    maintenanceLog: [
      { date: '2026-04-05', action: 'Wavelength verification with didymium filter — passed', technician: 'S. Lee' },
      { date: '2026-03-15', action: 'Lamp replaced', technician: 'S. Lee' },
    ],
  },
];

export const equipmentSummary = {
  totalInstruments: instruments.length,
  nextCalibrationDue: 'Apr 20, 2026',
};

type Competency = {
  name: string;
  certifiedDate: string;
  expirationDate: string;
  status: string;
  assessedBy: string;
};

type Staff = {
  name: string;
  role: string;
  employeeId: string;
  hireDate: string;
  signatureEnabled: boolean;
  competencies: Competency[];
};

export const staff: Staff[] = [
  {
    name: 'Julia Martinez',
    role: 'Senior Analyst — Metals',
    employeeId: 'EMP-0012',
    hireDate: '2019-06-03',
    signatureEnabled: true,
    competencies: [
      { name: 'EPA 200.8 (ICP-MS Metals)', certifiedDate: '2024-05-01', expirationDate: '2026-05-01', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'Chain of Custody', certifiedDate: '2024-01-15', expirationDate: '2026-06-30', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'Safety / PPE', certifiedDate: '2025-09-01', expirationDate: '2026-09-01', status: 'Current', assessedBy: 'HR' },
    ],
  },
  {
    name: 'Kevin Chen',
    role: 'Senior Analyst — VOCs',
    employeeId: 'EMP-0018',
    hireDate: '2020-09-14',
    signatureEnabled: true,
    competencies: [
      { name: 'EPA 524.2 (VOCs P&T)', certifiedDate: '2024-08-10', expirationDate: '2026-08-10', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'EPA 8260D (VOC GC-MS)', certifiedDate: '2024-08-10', expirationDate: '2026-08-10', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'Safety / PPE', certifiedDate: '2025-09-01', expirationDate: '2026-09-01', status: 'Current', assessedBy: 'HR' },
    ],
  },
  {
    name: 'Raj Nguyen',
    role: 'Analyst — Anions / Wet Chemistry',
    employeeId: 'EMP-0024',
    hireDate: '2022-02-07',
    signatureEnabled: true,
    competencies: [
      { name: 'EPA 300.0 (Anions by IC)', certifiedDate: '2024-11-15', expirationDate: '2026-11-15', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'SM 4500-H+ (pH)', certifiedDate: '2024-11-15', expirationDate: '2026-11-15', status: 'Current', assessedBy: 'J. Martinez' },
      { name: 'Safety / PPE', certifiedDate: '2025-09-01', expirationDate: '2026-09-01', status: 'Current', assessedBy: 'HR' },
    ],
  },
  {
    name: 'Samira Lee',
    role: 'Sample Receiving Coordinator',
    employeeId: 'EMP-0031',
    hireDate: '2023-04-18',
    signatureEnabled: true,
    competencies: [
      { name: 'Chain of Custody', certifiedDate: '2025-04-18', expirationDate: '2027-04-18', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'Sample Receipt & Login', certifiedDate: '2025-04-18', expirationDate: '2027-04-18', status: 'Current', assessedBy: 'Dr. P. Huang' },
      { name: 'Safety / PPE', certifiedDate: '2025-09-01', expirationDate: '2026-09-01', status: 'Current', assessedBy: 'HR' },
    ],
  },
];

export const trainingSummary = {
  totalStaff: staff.length,
  nextExpiration: 'Jun 06, 2026',
  nextExpirationName: 'Chain of Custody — J. Martinez',
};

export const featuredSample = {
  id: 'SA-2026-0847',
  type: 'Drinking Water',
  clientName: 'City of Mesa Water Dept',
  priority: 'Normal',
  status: 'Pending Verification',
  dateRegistered: '2026-04-11 08:30',
  dateReceived: '2026-04-11 09:02',
  collectedBy: 'Ana Patel',
  receivedBy: 'Samira Lee',
  analyst: 'Julia Martinez',
};

export const sampleResults = [
  { analyte: 'Lead (Pb)', result: '3.2', unit: 'µg/L', refRange: '< 15 µg/L (MCL)', flag: 'Below MCL' },
  { analyte: 'Copper (Cu)', result: '420', unit: 'µg/L', refRange: '< 1,300 µg/L (MCL)', flag: 'Below MCL' },
  { analyte: 'Arsenic (As)', result: '8.0', unit: 'µg/L', refRange: '< 10 µg/L (MCL)', flag: 'Below MCL' },
  { analyte: 'Nitrate (NO3)', result: '6.4', unit: 'mg/L', refRange: '< 10 mg/L (MCL)', flag: 'Below MCL' },
  { analyte: 'pH', result: '7.3', unit: 'SU', refRange: '6.5 – 8.5', flag: 'In range' },
];

export const sampleAuditTrail = [
  { timestamp: '2026-04-11T15:32:04Z', action: 'Results Entered', field: 'Nitrate', oldValue: '', newValue: '6.4 mg/L', userName: 'Julia Martinez', reason: 'Initial data entry' },
  { timestamp: '2026-04-11T15:33:21Z', action: 'Results Entered', field: 'Lead', oldValue: '', newValue: '3.2 µg/L', userName: 'Julia Martinez', reason: 'Initial data entry' },
  { timestamp: '2026-04-11T15:34:02Z', action: 'Results Entered', field: 'Copper', oldValue: '', newValue: '420 µg/L', userName: 'Julia Martinez', reason: 'Initial data entry' },
  { timestamp: '2026-04-11T15:36:10Z', action: 'Status Change', field: 'Status', oldValue: 'Received', newValue: 'In Progress', userName: 'Julia Martinez', reason: 'Analysis begun' },
  { timestamp: '2026-04-11T17:02:44Z', action: 'Status Change', field: 'Status', oldValue: 'In Progress', newValue: 'Pending Verification', userName: 'Julia Martinez', reason: 'Analyst work complete' },
  { timestamp: '2026-04-11T17:03:11Z', action: 'e-Signature', field: 'Analyst sign-off', oldValue: '', newValue: 'Julia Martinez (EMP-0012)', userName: 'Julia Martinez', reason: '21 CFR Part 11 e-signature' },
];
