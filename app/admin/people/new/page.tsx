import { createPerson } from "../../actions";
import Link from "next/link";

export default function NewPersonPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add person</h1>
        <p className="text-sm text-slate-600 mt-1">Add a new active person to the lab roster.</p>
      </div>
      <form action={createPerson} className="space-y-4">
        <Field name="name" label="Full name" required />
        <Field
          name="role"
          label="Role"
          required
          placeholder="MLT, MT, Lab Director, CLIA Lab Director, etc."
        />
        <Field name="cliaCertNumber" label="CLIA / cert number (optional)" />
        <Field name="hireDate" label="Hire date" type="date" required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked />
          Active
        </label>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Save person
          </button>
          <Link href="/admin/people" className="text-sm text-slate-600 hover:text-slate-900 self-center">
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
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}
