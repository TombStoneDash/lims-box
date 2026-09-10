import { AlertOctagon, Cable, CheckCircle2, GitBranch, ShieldAlert } from 'lucide-react';
import {
  discoveryGates,
  faultCategories,
  instrumentMappings,
  interfaceControls,
  pilotMeta,
  resolveRoleView,
} from '@/lib/ohworks-pilot';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksInstrumentWorkbench({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">LIAISON XL and Orchidlive discovery simulator</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          {pilotMeta.instrumentCandidate}. The workbench shows safe adapter boundaries and unresolved supplier
          questions only. It does not claim a validated customer interface, supported topology, or live transport.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        {[
          ['01', 'Receive', 'Accept only synthetic simulated payloads and capture a stable messageSourceId before any interpretation.'],
          ['02', 'Parse', 'Record parser version, mapping version, and disposition for every ingest attempt.'],
          ['03', 'Decide', 'Structured results can proceed only from approved mappings; all other inputs quarantine.'],
          ['04', 'Review', 'Human review and release remain separate from ingestion and from this discovery simulator.'],
        ].map(([step, title, detail]) => (
          <div key={step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold text-teal-700">{step}</span>
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Cable className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-semibold">Adapter controls</h2>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {interfaceControls.map(([label, text]) => (
              <div key={label} className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-amber-900">
            <ShieldAlert className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Discovery lock</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-amber-950">
            Current role view: {role.label}. Every role sees the same discovery warning because no role in this
            demo has authority to convert the hypothesis into a supported integration claim.
          </p>
          <div className="mt-5 rounded-xl bg-white/70 p-4 ring-1 ring-amber-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Unverified hypothesis only</p>
            <p className="mt-2 text-sm font-semibold">LIAISON XL -&gt; Orchidlive -&gt; LIMS BOX</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              The simulator shows the chain as a discovery question, not a confirmed OHWorks fact. Supplier documents
              and synthetic message samples remain required before any adapter code would be warranted.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-teal-700" />
            <h2 className="font-semibold">Versioned synthetic mapping set</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Instrument code</th>
                <th className="px-4 py-3">Canonical test</th>
                <th className="px-4 py-3">Components</th>
                <th className="px-4 py-3">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instrumentMappings.map((mapping) => (
                <tr key={mapping.instrumentCode}>
                  <td className="px-6 py-4 font-mono text-xs font-semibold">{mapping.instrumentCode}</td>
                  <td className="px-4 py-4">{mapping.canonicalTest}</td>
                  <td className="px-4 py-4 text-slate-600">{mapping.components}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {mapping.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {faultCategories.map((fault) => (
          <div key={fault.name} className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <AlertOctagon className="h-5 w-5 text-rose-500" />
            <h3 className="mt-3 text-sm font-semibold">{fault.name}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">{fault.action}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-2 text-emerald-900">
          <CheckCircle2 className="h-5 w-5" />
          <h2 className="font-semibold">Supplier questions still open</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {discoveryGates.map((gate) => (
            <div key={gate.id} className="rounded-xl bg-white/75 p-4 ring-1 ring-emerald-100">
              <p className="text-sm font-semibold text-slate-900">{gate.area}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{gate.question}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">{gate.owner}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
