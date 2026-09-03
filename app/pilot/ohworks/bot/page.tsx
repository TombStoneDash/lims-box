import type { Metadata } from 'next';
import { BookMarked, Bot, CircuitBoard, ShieldAlert } from 'lucide-react';
import { AssistantConsole } from './assistant-console';
import { pilotMeta, resolveRoleView } from '@/lib/ohworks-pilot';

export const metadata: Metadata = {
  title: 'OHWorks Expert Assistant - LIMS BOX',
  description: 'Deterministic synthetic OHWorks assistant and discovery simulator.',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksAssistantPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">OHWorks expert assistant and discovery simulator</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          This assistant is deterministic and local to the OHWorks route. It cites stable source IDs plus corpus metadata,
          filters records through the S1 tenant and data-class policy, and refuses unsupported clinical, compliance,
          release, or live-integration requests.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Assistant role', role.label, Bot],
          ['Corpus version', pilotMeta.corpusVersion, BookMarked],
          ['Discovery simulator', pilotMeta.discoveryVersionId, CircuitBoard],
          ['Boundary', 'No live integration claims', ShieldAlert],
        ].map(([label, value, Icon]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{String(label)}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{String(value)}</p>
              </div>
              <Icon className="h-5 w-5 text-teal-700" />
            </div>
          </div>
        ))}
      </section>

      <AssistantConsole key={role.id} roleId={role.id} />
    </div>
  );
}
