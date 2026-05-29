import Link from "next/link";
import { createDocument } from "../../pp-actions";

const DOC_TYPES = ["SOP", "procedure_manual", "policy", "form"];

export default function NewDocumentPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New controlled document</h1>
        <p className="text-sm text-slate-600 mt-1">Creates a document record. Add versions after saving.</p>
      </div>

      <form action={createDocument} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="title">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Urinalysis SOP"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="docType">
            Document type <span className="text-red-500">*</span>
          </label>
          <select
            id="docType"
            name="docType"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">Select type…</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Create document
          </button>
          <Link href="/admin/documents" className="text-sm text-slate-600 hover:text-slate-900 self-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
