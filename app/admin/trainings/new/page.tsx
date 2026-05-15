import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createTraining } from "../../actions";

export default async function NewTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ personId?: string }>;
}) {
  const { personId } = await searchParams;
  if (!personId) return notFound();
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) return notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Log training</h1>
        <p className="text-sm text-slate-600 mt-1">For {person.name}</p>
      </div>
      <form action={createTraining} className="space-y-4">
        <input type="hidden" name="personId" value={person.id} />
        <Field name="course" label="Course title" required />
        <Field name="provider" label="Provider (optional)" />
        <Field name="completedAt" label="Completed date" type="date" required />
        <Field name="hours" label="Hours (optional)" type="number" step="0.5" />
        <Field
          name="certificate"
          label="Certificate filename (manual upload reference)"
          placeholder="e.g. uploads/cert-2026-05.pdf"
        />
        <p className="text-xs text-slate-500 -mt-2">
          v1: drop certificate PDFs into <code className="font-mono">./uploads/</code> and reference the filename here.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Save training
          </button>
          <Link
            href={`/admin/people/${person.id}`}
            className="text-sm text-slate-600 hover:text-slate-900 self-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  step,
  placeholder,
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}
