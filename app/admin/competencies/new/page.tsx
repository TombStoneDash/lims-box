import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createCompetency } from "../../actions";

const COMPETENCY_TYPES = [
  "Direct Observation",
  "Sample Re-test",
  "QC Review",
  "Problem Solving",
  "Maintenance",
  "Blind Sample",
];

const STATUSES = ["completed", "due", "overdue", "exempt"];

export default async function NewCompetencyPage({
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
        <h1 className="text-2xl font-semibold">Log competency</h1>
        <p className="text-sm text-slate-600 mt-1">For {person.name}</p>
      </div>
      <form action={createCompetency} className="space-y-4">
        <input type="hidden" name="personId" value={person.id} />
        <Select name="type" label="Competency type" options={COMPETENCY_TYPES} required />
        <Select name="status" label="Status" options={STATUSES} defaultValue="completed" required />
        <Field name="completedAt" label="Completed date" type="date" />
        <Field name="expiresAt" label="Expires" type="date" />
        <Textarea name="notes" label="Notes (optional)" />
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Save competency
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
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
  required = false,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-500 focus:outline-none"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        name={name}
        rows={3}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}
