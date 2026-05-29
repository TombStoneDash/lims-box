import Link from "next/link";
import { createProcedure } from "../../pp-actions";

export default function NewProcedurePage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New procedure</h1>
        <p className="text-sm text-slate-600 mt-1">
          Add a procedure that personnel can be authorized to perform.
        </p>
      </div>

      <form action={createProcedure} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="name">
            Procedure name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Urinalysis Dipstick"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="procedureCode">
            Procedure code (optional)
          </label>
          <input
            id="procedureCode"
            name="procedureCode"
            type="text"
            placeholder="e.g. PROC-UA-001"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="description">
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Brief description of this procedure…"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Create procedure
          </button>
          <Link href="/admin/procedures" className="text-sm text-slate-600 hover:text-slate-900 self-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
