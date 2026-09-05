import { AlertTriangle } from 'lucide-react';

export function LaboratoryUnavailable() {
  return <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5" /> SENAITE laboratory service unavailable</div><p className="mt-2">Laboratory records are not available. No sample, result, workflow, instrument, audit, or report fixture data has been substituted.</p></div>;
}
