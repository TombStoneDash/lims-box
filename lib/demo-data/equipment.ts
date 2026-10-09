export interface Instrument {
  name: string;
  model: string;
  serialNumber: string;
  location: string;
  lastCalibration: string;
  nextCalibration: string;
  calibrationStatus: 'Current' | 'Due Soon' | 'Overdue';
  lastMaintenance: string;
  nextMaintenance: string;
  maintenanceLog: MaintenanceEntry[];
}

export interface MaintenanceEntry {
  date: string;
  type: 'Calibration' | 'Preventive Maintenance' | 'Repair' | 'Verification';
  performedBy: string;
  notes: string;
  result: 'Pass' | 'Adjusted' | 'Fail';
}

export const instruments: Instrument[] = [
  {
    name: 'Chemistry Analyzer',
    model: 'Beckman AU480',
    serialNumber: 'BA-480-2023-0147',
    location: 'Chemistry Lab — Bench A',
    lastCalibration: '2026-03-28',
    nextCalibration: '2026-04-28',
    calibrationStatus: 'Current',
    lastMaintenance: '2026-03-28',
    nextMaintenance: '2026-04-28',
    maintenanceLog: [
      { date: '2026-03-28', type: 'Calibration', performedBy: 'Sarah Chen', notes: 'Full 6-point calibration — all analytes within spec', result: 'Pass' },
      { date: '2026-03-28', type: 'Preventive Maintenance', performedBy: 'Mike Torres', notes: 'Replaced sample probe tubing, cleaned cuvettes', result: 'Pass' },
      { date: '2026-02-28', type: 'Calibration', performedBy: 'Sarah Chen', notes: 'Monthly calibration — glucose recalibrated after QC shift', result: 'Adjusted' },
      { date: '2026-01-28', type: 'Calibration', performedBy: 'Sarah Chen', notes: 'Full calibration — all within spec', result: 'Pass' },
    ],
  },
  {
    name: 'Hematology Analyzer',
    model: 'Sysmex XN-550',
    serialNumber: 'SX-550-2024-0289',
    location: 'Hematology Lab — Bench B',
    lastCalibration: '2026-03-30',
    nextCalibration: '2026-04-28',
    calibrationStatus: 'Current',
    lastMaintenance: '2026-03-30',
    nextMaintenance: '2026-04-28',
    maintenanceLog: [
      { date: '2026-03-30', type: 'Calibration', performedBy: 'Mike Torres', notes: 'CBC calibration with e-CHECK — all parameters within range', result: 'Pass' },
      { date: '2026-03-30', type: 'Preventive Maintenance', performedBy: 'Mike Torres', notes: 'Cleaned apertures, replaced diluent line', result: 'Pass' },
      { date: '2026-03-01', type: 'Calibration', performedBy: 'Mike Torres', notes: 'Monthly calibration — all pass', result: 'Pass' },
      { date: '2026-02-01', type: 'Verification', performedBy: 'Sarah Chen', notes: 'Linearity verification — all within acceptable limits', result: 'Pass' },
    ],
  },
  {
    name: 'Centrifuge',
    model: 'Eppendorf 5804R',
    serialNumber: 'EP-5804-2022-0531',
    location: 'Specimen Processing — Station 1',
    lastCalibration: '2026-04-01',
    nextCalibration: '2026-04-28',
    calibrationStatus: 'Current',
    lastMaintenance: '2026-04-01',
    nextMaintenance: '2026-04-28',
    maintenanceLog: [
      { date: '2026-04-01', type: 'Calibration', performedBy: 'Ana Patel', notes: 'RPM verification with tachometer — 3000±50 RPM confirmed', result: 'Pass' },
      { date: '2026-04-01', type: 'Preventive Maintenance', performedBy: 'Ana Patel', notes: 'Inspected rotor, cleaned chamber, checked seals', result: 'Pass' },
      { date: '2026-03-01', type: 'Calibration', performedBy: 'Ana Patel', notes: 'Monthly RPM and timer verification', result: 'Pass' },
    ],
  },
  {
    name: 'Microscope',
    model: 'Olympus CX43',
    serialNumber: 'OL-CX43-2023-0082',
    location: 'Hematology Lab — Station 2',
    lastCalibration: '2026-04-05',
    nextCalibration: '2026-04-28',
    calibrationStatus: 'Current',
    lastMaintenance: '2026-04-05',
    nextMaintenance: '2026-04-28',
    maintenanceLog: [
      { date: '2026-04-05', type: 'Preventive Maintenance', performedBy: 'James Kim', notes: 'Cleaned optics, aligned illumination, verified objectives 10x/40x/100x', result: 'Pass' },
      { date: '2026-04-05', type: 'Verification', performedBy: 'Sarah Chen', notes: 'Stage micrometer verification — all objectives within spec', result: 'Pass' },
      { date: '2026-03-05', type: 'Preventive Maintenance', performedBy: 'James Kim', notes: 'Monthly optics cleaning and alignment check', result: 'Pass' },
    ],
  },
  {
    name: 'Refrigerator (Reagent Storage)',
    model: 'Thermo Fisher TSX505',
    serialNumber: 'TF-505-2024-0193',
    location: 'Reagent Storage Room',
    lastCalibration: '2026-04-10',
    nextCalibration: '2026-04-28',
    calibrationStatus: 'Current',
    lastMaintenance: '2026-04-10',
    nextMaintenance: '2026-04-28',
    maintenanceLog: [
      { date: '2026-04-10', type: 'Calibration', performedBy: 'James Kim', notes: 'Temperature probe calibration — 4.0°C ± 0.2°C confirmed with NIST-traceable thermometer', result: 'Pass' },
      { date: '2026-04-10', type: 'Preventive Maintenance', performedBy: 'James Kim', notes: 'Cleaned condenser coils, verified door seal, checked alarm function', result: 'Pass' },
      { date: '2026-03-10', type: 'Calibration', performedBy: 'Ana Patel', notes: 'Monthly temperature verification', result: 'Pass' },
    ],
  },
];

export const equipmentSummary = {
  totalInstruments: instruments.length,
  allCalibrated: instruments.every(i => i.calibrationStatus === 'Current'),
  nextCalibrationDue: '2026-04-28',
  overdueCount: 0,
};
