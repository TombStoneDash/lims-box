import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updatePerson } from "../../../actions";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return notFound();

  const update = updatePerson.bind(null, person.id);
  const hireDateValue = person.hireDate.toISOString().slice(0, 10);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit person</h1>
        <p className="text-sm text-slate-600 mt-1">{person.name}</p>
      </div>
      <form action={update} className="space-y-4">
        <Field name="name" label="Full name" defaultValue={person.name} required />
        <Field name="role" label="Role" defaultValue={person.role} required />
        <Field name="cliaCertNumber" label="CLIA / cert number" defaultValue={person.cliaCertNumber ?? ""} />
        <Field name="hireDate" label="Hire date" type="date" defaultValue={hireDateValue} required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={person.active} />
          Active
        </label>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Save changes
          </button>
          <Link href={`/admin/people/${person.id}`} className="text-sm text-slate-600 hover:text-slate-900 self-center">
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
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}
