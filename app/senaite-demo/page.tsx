import { sampleCounts } from '@/lib/demo-data';
import { qcSummary } from '@/lib/demo-data';
import { equipmentSummary } from '@/lib/demo-data';
import { trainingSummary } from '@/lib/demo-data';
import { CheckCircle2, AlertTriangle, Clock, FlaskConical, Activity, Wrench, GraduationCap } from 'lucide-react';
import Link from 'next/link';

function StatCard({ label, value, sub, icon: Icon, color, href }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; href?: string;
}) {
  const card = (
    <div className={`bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow ${href ? 'cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default function DemoDashboard() {
  const { total, byStatus, byType } = sampleCounts;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laboratory Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time overview — April 13, 2026</p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">All Systems Operational</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Samples"
          value={total}
          sub="Jan 13 – Apr 13, 2026"
          icon={FlaskConical}
          color="bg-blue-500"
        />
        <StatCard
          label="QC Runs (90 days)"
          value={qcSummary.totalRuns}
          sub={`${qcSummary.passRate} pass rate — 0 out-of-range`}
          icon={Activity}
          color="bg-green-500"
          href="/demo/qc"
        />
        <StatCard
          label="Instruments"
          value={equipmentSummary.totalInstruments}
          sub={`All calibrated — next due ${equipmentSummary.nextCalibrationDue}`}
          icon={Wrench}
          color="bg-purple-500"
          href="/demo/equipment"
        />
        <StatCard
          label="Staff"
          value={trainingSummary.totalStaff}
          sub={`All training current — next exp. ${trainingSummary.nextExpiration}`}
          icon={GraduationCap}
          color="bg-teal-500"
          href="/demo/training"
        />
      </div>

      {/* Sample status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sample Status</h2>
          <div className="space-y-3">
            {Object.entries(byStatus).map(([status, count]) => {
              const pct = Math.round((count / total) * 100);
              const colors: Record<string, string> = {
                Published: 'bg-green-500',
                Verified: 'bg-blue-500',
                Received: 'bg-yellow-500',
                Registered: 'bg-slate-400',
                'Pending Verification': 'bg-orange-500',
              };
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{status}</span>
                    <span className="font-medium text-slate-900">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[status] || 'bg-slate-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sample Types</h2>
          <div className="space-y-3">
            {Object.entries(byType).map(([type, count]) => {
              const pct = Math.round((count / total) * 100);
              const colors: Record<string, string> = {
                Blood: 'bg-red-500',
                Urine: 'bg-amber-500',
                Swab: 'bg-sky-500',
                Tissue: 'bg-pink-500',
              };
              return (
                <div key={type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{type}</span>
                    <span className="font-medium text-slate-900">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[type] || 'bg-slate-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action items */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Action Items</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-800">3 samples pending verification</p>
              <p className="text-xs text-orange-600">SA-2026-0845, SA-2026-0846, SA-2026-0847 — awaiting supervisory review</p>
            </div>
            <Link href="/demo/samples/SA-2026-0847" className="ml-auto text-xs font-medium text-orange-700 hover:text-orange-900 underline">
              Review
            </Link>
          </div>
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">Instrument calibration due April 28</p>
              <p className="text-xs text-blue-600">All 5 instruments — 15 days remaining</p>
            </div>
            <Link href="/demo/equipment" className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 underline">
              View
            </Link>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">CAP audit readiness: PASS</p>
              <p className="text-xs text-green-600">All QC, training, calibration, and documentation requirements met</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
