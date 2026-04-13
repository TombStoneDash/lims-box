import { featuredSample, sampleAuditTrail, sampleResults } from '@/lib/demo-data';
import { ArrowLeft, FileText, Shield, Clock, User, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function SampleDetailPage() {
  const sample = featuredSample;
  const audit = sampleAuditTrail;
  const results = sampleResults;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/demo" className="hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <span>/</span>
        <span>Samples</span>
        <span>/</span>
        <span className="text-slate-900 font-medium">{sample.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sample {sample.id}</h1>
          <p className="text-sm text-slate-500 mt-1">{sample.clientName}</p>
        </div>
        <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 text-orange-700 border border-orange-200">
          {sample.status}
        </span>
      </div>

      {/* Sample details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details card */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Sample Information
          </h2>
          <dl className="space-y-3">
            {[
              ['Sample ID', sample.id],
              ['Sample Type', sample.type],
              ['Client', sample.clientName],
              ['Priority', sample.priority],
              ['Date Registered', sample.dateRegistered],
              ['Date Received', sample.dateReceived],
              ['Collected By', sample.collectedBy],
              ['Received By', sample.receivedBy],
              ['Analyst', sample.analyst],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-sm font-medium text-slate-900">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Results card */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Results
          </h2>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left pb-2">Analyte</th>
                <th className="text-right pb-2">Result</th>
                <th className="text-right pb-2">Ref Range</th>
                <th className="text-right pb-2">Flag</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {results.map(r => (
                <tr key={r.analyte} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700">{r.analyte}</td>
                  <td className="py-2 text-right font-mono font-medium text-slate-900">{r.result} {r.unit}</td>
                  <td className="py-2 text-right text-slate-500 text-xs">{r.refRange}</td>
                  <td className="py-2 text-right">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{r.flag}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Chain of custody card */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Chain of Custody
          </h2>
          <dl className="space-y-3">
            {[
              ['COC Number', 'COC-2026-0847'],
              ['Collected By', 'Ana Patel'],
              ['Collection Time', '2026-04-11 08:15'],
              ['Received By', 'Mike Torres'],
              ['Receipt Time', '2026-04-11 09:02'],
              ['Condition', 'Good — no issues noted'],
              ['Processed By', 'Mike Torres'],
              ['Processing', 'Centrifuged 3000 RPM x 10 min'],
              ['Analyzed By', 'James Kim'],
              ['Analysis Time', '2026-04-11 10:22'],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-sm font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Audit trail */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" /> Audit Trail
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="text-left py-2 pr-4">Timestamp</th>
                <th className="text-left py-2 pr-4">Action</th>
                <th className="text-left py-2 pr-4">Field</th>
                <th className="text-left py-2 pr-4">Old Value</th>
                <th className="text-left py-2 pr-4">New Value</th>
                <th className="text-left py-2 pr-4">User</th>
                <th className="text-left py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((entry, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      entry.action.includes('Signature') ? 'bg-purple-100 text-purple-700' :
                      entry.action.includes('Status') ? 'bg-blue-100 text-blue-700' :
                      entry.action.includes('Results') ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{entry.field || '—'}</td>
                  <td className="py-2 pr-4 text-slate-400 font-mono text-xs">{entry.oldValue || '—'}</td>
                  <td className="py-2 pr-4 text-slate-900 font-mono text-xs">{entry.newValue || '—'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-600">{entry.userName}</span>
                    </div>
                  </td>
                  <td className="py-2 text-slate-500 text-xs max-w-[200px] truncate">{entry.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
          {audit.length} audit entries — All timestamps UTC — IP addresses logged
        </div>
      </div>
    </div>
  );
}
