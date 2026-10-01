import React from 'react';
import { staff, trainingSummary, TRAINING_SUMMARY_AS_OF_DATE } from '@/lib/demo-data';
import { evaluateCompetency, evaluateStaffTraining, evaluateTrainingRegistry } from '@/lib/senaite-demo-training-status';
import { CheckCircle2, GraduationCap, User, Shield, Pen } from 'lucide-react';

const COMPETENCY_STATUS_LABEL: Record<string, string> = {
  current: 'Current',
  expired: 'Expired',
  invalid: 'Date unreadable',
};

const COMPETENCY_STATUS_STYLE: Record<string, string> = {
  current: 'bg-green-100 text-green-700',
  'expiring-soon': 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-700',
  invalid: 'bg-slate-200 text-slate-800',
};

function competencyStatusLabel(status: string, daysRemaining: number | null): string {
  if (status === 'expiring-soon') {
    return `Expires in ${daysRemaining ?? 0} days`;
  }
  return COMPETENCY_STATUS_LABEL[status] ?? COMPETENCY_STATUS_LABEL.invalid;
}

function staffStatusLabel(evaluation: ReturnType<typeof evaluateStaffTraining>): string {
  if (evaluation.status === 'current') return 'All current';
  if (evaluation.invalidCount > 0) return `${evaluation.invalidCount} unreadable date(s)`;
  if (evaluation.expiredCount > 0) return `${evaluation.expiredCount} expired`;
  return `${evaluation.expiringSoonCount} expiring soon`;
}

function registrySummaryText(registry: ReturnType<typeof evaluateTrainingRegistry>): string {
  if (registry.status === 'current') {
    return `${registry.totalStaff} staff — all competencies current as of April 13, 2026 (synthetic)`;
  }
  return `${registry.totalStaff} staff — ${registry.expiredCount} expired, ${registry.expiringSoonCount} expiring within 60 days (as of April 13, 2026, synthetic)`;
}

export default function TrainingPage() {
  const registry = evaluateTrainingRegistry(staff);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Personnel & Training</h1>
          <p className="text-sm text-slate-500 mt-1">{registrySummaryText(registry)}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
            <Pen className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">Electronic Signatures Enabled</span>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-700">{registrySummaryText(registry)}</span>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800 mb-2">
          <span className="font-medium">Synthetic training snapshot as of {TRAINING_SUMMARY_AS_OF_DATE}.</span> All training statuses and reminders reflect this fixed demo date.
        </p>
        <p className="text-sm text-blue-800">
          <span className="font-medium">Next expiration:</span> {trainingSummary.nextExpirationName} — expires {trainingSummary.nextExpiration}, {trainingSummary.nextExpirationDaysRemaining} days after the demo&apos;s fixed date of April 13, 2026
        </p>
      </div>

      {/* Staff cards */}
      <div className="space-y-4">
        {staff.map(member => {
          const staffEvaluation = evaluateStaffTraining(member);
          return (
          <div key={member.employeeId} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{member.name}</h3>
                    <p className="text-sm text-slate-500">{member.role} — {member.employeeId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.signatureEnabled && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> e-Signature
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded-full text-[10px] font-medium border ${COMPETENCY_STATUS_STYLE[staffEvaluation.status]} ${staffEvaluation.status === 'current' ? 'border-green-200' : staffEvaluation.status === 'expiring-soon' ? 'border-amber-200' : staffEvaluation.status === 'expired' ? 'border-red-200' : 'border-slate-300'}`}>
                    {staffStatusLabel(staffEvaluation)}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-500 mb-3">Hire Date: {member.hireDate}</div>
            </div>

            {/* Competency table */}
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> Competencies
              </p>
              <table className="w-full text-xs">
                <caption className="sr-only">Synthetic competency records for {member.name}</caption>
                <thead>
                  <tr className="text-slate-400">
                    <th scope="col" className="text-left py-1 pr-4">Competency</th>
                    <th scope="col" className="text-left py-1 pr-4">Certified Date</th>
                    <th scope="col" className="text-left py-1 pr-4">Expiration</th>
                    <th scope="col" className="text-left py-1 pr-4">Status</th>
                    <th scope="col" className="text-left py-1">Assessed By</th>
                  </tr>
                </thead>
                <tbody>
                  {member.competencies.map((comp, i) => {
                    const compEvaluation = evaluateCompetency(comp);
                    return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1.5 pr-4 text-slate-700 font-medium">{comp.name}</td>
                      <td className="py-1.5 pr-4 text-slate-600 font-mono">{comp.certifiedDate}</td>
                      <td className="py-1.5 pr-4 text-slate-600 font-mono">{comp.expirationDate}</td>
                      <td className="py-1.5 pr-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${COMPETENCY_STATUS_STYLE[compEvaluation.status]}`}>
                          {competencyStatusLabel(compEvaluation.status, compEvaluation.daysRemaining)}
                        </span>
                      </td>
                      <td className="py-1.5 text-slate-500">{comp.assessedBy}</td>
                    </tr>
                    );
                  })}
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
