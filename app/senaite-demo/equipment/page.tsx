import { instruments, equipmentSummary } from '@/lib/demo-data';
import { CheckCircle2, Wrench, Calendar, MapPin } from 'lucide-react';

export default function EquipmentPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipment & Calibration</h1>
          <p className="text-sm text-slate-500 mt-1">{equipmentSummary.totalInstruments} instruments — All calibrated</p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">All Calibrations Current</span>
        </div>
      </div>

      {/* Instrument cards */}
      <div className="space-y-4">
        {instruments.map(inst => (
          <div key={inst.serialNumber} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{inst.name}</h3>
                  <p className="text-sm text-slate-500">{inst.model} — S/N: {inst.serialNumber}</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                  {inst.calibrationStatus}
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
        ))}
      </div>
    </div>
  );
}
