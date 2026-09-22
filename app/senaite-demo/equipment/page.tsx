import { instruments } from '@/lib/demo-data';
import { evaluateEquipmentStatus, evaluateInstrumentCalibration, DEMO_AS_OF_DATE } from '@/lib/senaite-demo-equipment';
import { projectUpcomingCalibrations } from '@/lib/senaite-demo-calibration-schedule';
import { CheckCircle2, AlertTriangle, HelpCircle, Wrench, Calendar, MapPin } from 'lucide-react';

const equipmentStatus = evaluateEquipmentStatus(instruments);

const CALIBRATION_HORIZON_DAYS = 30;
const dueForCalibration = projectUpcomingCalibrations(
  instruments,
  new Date(`${DEMO_AS_OF_DATE}T00:00:00Z`),
  CALIBRATION_HORIZON_DAYS,
);

const BADGE_STYLES: Record<string, { icon: typeof CheckCircle2; wrap: string; text: string; label: string }> = {
  current: { icon: CheckCircle2, wrap: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'All Calibrations Current' },
  overdue: { icon: AlertTriangle, wrap: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Calibration Overdue' },
  invalid: { icon: HelpCircle, wrap: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Calibration Data Invalid' },
};

const INSTRUMENT_BADGE_STYLES: Record<string, string> = {
  current: 'bg-green-100 text-green-700 border-green-200',
  overdue: 'bg-amber-100 text-amber-700 border-amber-200',
  invalid: 'bg-red-100 text-red-700 border-red-200',
};

function formatHeadline(): string {
  const { totalInstruments, overdueCount, invalidCount, nextCalibrationDue, nextDueInstrumentName } = equipmentStatus;
  if (invalidCount > 0) {
    return `${totalInstruments} instruments — ${invalidCount} with invalid calibration data`;
  }
  if (overdueCount > 0) {
    return `${totalInstruments} instruments — ${overdueCount} calibration${overdueCount === 1 ? '' : 's'} overdue`;
  }
  if (nextCalibrationDue && nextDueInstrumentName) {
    return `${totalInstruments} instruments — All calibrated. Next due: ${nextDueInstrumentName} (${nextCalibrationDue})`;
  }
  return `${totalInstruments} instruments — All calibrated`;
}

function formatDueInDays(dueInDays: number): string {
  const rounded = Math.round(dueInDays);
  if (rounded < 0) {
    const overdueBy = Math.abs(rounded);
    return `Overdue by ${overdueBy} day${overdueBy === 1 ? '' : 's'}`;
  }
  if (rounded === 0) return 'Due today';
  return `Due in ${rounded} day${rounded === 1 ? '' : 's'}`;
}

export default function EquipmentPage() {
  const badge = BADGE_STYLES[equipmentStatus.status];
  const BadgeIcon = badge.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipment & Calibration</h1>
          <p className="text-sm text-slate-500 mt-1">{formatHeadline()}</p>
        </div>
        <div className={`flex items-center gap-2 border rounded-lg px-4 py-2 ${badge.wrap}`}>
          <BadgeIcon className={`w-5 h-5 ${badge.text}`} />
          <span className={`text-sm font-medium ${badge.text}`}>{badge.label}</span>
        </div>
      </div>

      {/* Due for calibration */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Due for Calibration (Next {CALIBRATION_HORIZON_DAYS} Days)
        </h2>
        {dueForCalibration.length === 0 ? (
          <p className="text-sm text-slate-500">No instruments overdue or due within {CALIBRATION_HORIZON_DAYS} days.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dueForCalibration.map(({ instrument, dueInDays, evaluation }) => (
              <li key={instrument.serialNumber} className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-slate-900">{instrument.name}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    evaluation.status === 'overdue'
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {formatDueInDays(dueInDays)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Instrument cards */}
      <div className="space-y-4">
        {instruments.map(inst => {
          const evaluation = evaluateInstrumentCalibration(inst);
          return (
          <div key={inst.serialNumber} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{inst.name}</h3>
                  <p className="text-sm text-slate-500">{inst.model} — S/N: {inst.serialNumber}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${INSTRUMENT_BADGE_STYLES[evaluation.status]}`}>
                  {evaluation.status === 'current' ? 'Calibrated' : evaluation.status === 'overdue' ? 'Overdue' : 'Invalid'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Location</p>
                    <p className="text-slate-700">{inst.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Last Calibration</p>
                    <p className="text-slate-700">{inst.lastCalibration}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-xs text-slate-500">Next Calibration</p>
                    <p className="font-medium text-blue-700">{inst.nextCalibration}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Last Maintenance</p>
                    <p className="text-slate-700">{inst.lastMaintenance}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Maintenance log */}
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Maintenance Log</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left py-1 pr-4">Date</th>
                    <th className="text-left py-1 pr-4">Type</th>
                    <th className="text-left py-1 pr-4">Performed By</th>
                    <th className="text-left py-1 pr-4">Notes</th>
                    <th className="text-left py-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.maintenanceLog.map((entry, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1.5 pr-4 text-slate-600 font-mono">{entry.date}</td>
                      <td className="py-1.5 pr-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          entry.type === 'Calibration' ? 'bg-blue-100 text-blue-700' :
                          entry.type === 'Preventive Maintenance' ? 'bg-purple-100 text-purple-700' :
                          entry.type === 'Verification' ? 'bg-teal-100 text-teal-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4 text-slate-600">{entry.performedBy}</td>
                      <td className="py-1.5 pr-4 text-slate-500 max-w-[300px] truncate">{entry.notes}</td>
                      <td className="py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          entry.result === 'Pass' ? 'bg-green-100 text-green-700' :
                          entry.result === 'Adjusted' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {entry.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
