import Link from "next/link";
import { adminMutationsEnabled } from "@/lib/admin-capabilities";

export default function NewPersonPage() {
  const mutationsEnabled = adminMutationsEnabled();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add person</h1>
        <p className="text-sm text-slate-600 mt-1">
          This admin view is a synthetic, read-only database view.
        </p>
      </div>
      {!mutationsEnabled ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 space-y-3">
          <p>
            Adding a person here is disabled. Use the protected operator sandbox to rehearse
            adding people — it runs entirely in your browser and never writes to the shared
            database.
          </p>
          <Link
            href="/demo/operator"
            className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Open operator sandbox
          </Link>
        </div>
      ) : null}
      <Link href="/admin/people" className="text-sm text-slate-600 hover:text-slate-900">
        Back to people
      </Link>
    </div>
  );
}
