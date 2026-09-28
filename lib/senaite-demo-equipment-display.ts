import type { InstrumentStatusValue } from './senaite-demo-equipment';

export type NextCalibrationDisplay = {
  textClass: string;
  iconClass: string;
  srSuffix: string;
};

const DISPLAY_BY_STATUS: Record<InstrumentStatusValue, NextCalibrationDisplay> = {
  current: { textClass: 'font-medium text-blue-700', iconClass: 'text-blue-400', srSuffix: '' },
  overdue: { textClass: 'font-semibold text-amber-800', iconClass: 'text-amber-600', srSuffix: ' (overdue)' },
  invalid: { textClass: 'font-semibold text-red-700', iconClass: 'text-red-500', srSuffix: ' (date unreadable)' },
};

export function nextCalibrationDisplay(status: InstrumentStatusValue): NextCalibrationDisplay {
  return DISPLAY_BY_STATUS[status] ?? DISPLAY_BY_STATUS.invalid;
}
