import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSignOff } from "../../actions";

const SCOPES = ["Initial competency", "Annual re-competency", "Method validation"];

export default async function NewSignOffPage({
  searchParams,
}: {
  searchParams: Promise<{ personId?: string }>;
}) {
  const { personId } = await searchParams;
  if (!personId) return notFound();
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) return notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Director sign-off</h1>
        <p className="text-sm text-slate-600 mt-1">For {person.name}</p>
      </div>
      <form action={createSignOff} className="space-y-4">
        <input type="hidden" name="personId" value={person.id} />
        <Field name="directorName" label="Director name + credentials" required placeholder="Dr. Robert Kim, MD" />
        <Select name="scope" label="Scope" options={SCOPES} required />
        <Field name="signedAt" label="Signed date" type="date" defaultValue={today} required />
        <Textarea name="notes" label="Notes (optional)" />
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Save sign-off
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
  defaultValue,
  placeholder,
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
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
  required = false,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <select
        name={name}
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
