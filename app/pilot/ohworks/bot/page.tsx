import type { Metadata } from 'next';
import { BookMarked, Bot, CircuitBoard, ShieldAlert } from 'lucide-react';
import { AssistantConsole } from './assistant-console';
import { getAssistantSuggestions, pilotMeta, resolveRoleView } from '@/lib/ohworks-pilot';

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
        <SummaryCard label="Assistant role" value={role.label} icon="assistant" />
        <SummaryCard label="Corpus version" value={pilotMeta.corpusVersion} icon="corpus" />
        <SummaryCard label="Discovery simulator" value={pilotMeta.discoveryVersionId} icon="discovery" />
        <SummaryCard label="Boundary" value="No live integration claims" icon="boundary" />
      </section>

      <AssistantConsole
        key={role.id}
        roleId={role.id}
        roleLabel={role.label}
        roleNote={role.note}
        expertSuggestions={getAssistantSuggestions('expert', role.id)}
        discoverySuggestions={getAssistantSuggestions('discovery', role.id)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: 'assistant' | 'corpus' | 'discovery' | 'boundary';
}) {
  const iconClassName = 'h-5 w-5 text-teal-700';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
        </div>
        {icon === 'assistant' && <Bot className={iconClassName} />}
        {icon === 'corpus' && <BookMarked className={iconClassName} />}
        {icon === 'discovery' && <CircuitBoard className={iconClassName} />}
        {icon === 'boundary' && <ShieldAlert className={iconClassName} />}
      </div>
    </div>
  );
}
