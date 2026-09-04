export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></div>
      {action}
    </div>
  );
}
