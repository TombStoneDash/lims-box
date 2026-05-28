import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "../../_components/StatusBadge";
import { createDocumentVersion } from "../../pp-actions";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!doc) return notFound();

  const currentVersion = doc.versions.find((v) => v.isCurrent);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{doc.title}</h1>
          <p className="text-sm text-slate-600 mt-1">
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs mr-2">
              {doc.docType}
            </span>
            Created {formatDate(doc.createdAt)}
          </p>
        </div>
        <Link href="/admin/documents" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          ← Back
        </Link>
      </div>

      {/* Current version callout */}
      {currentVersion ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm">
          <span className="font-medium text-green-800">Current version:</span>{" "}
          <span className="text-green-700">
            v{currentVersion.versionNumber} — effective {formatDate(currentVersion.effectiveDate)}
            {" · "}approved by {currentVersion.approvedBy}
          </span>
          {currentVersion.documentContentUrl && (
            <a
              href={currentVersion.documentContentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-3 text-green-700 underline hover:text-green-900"
            >
              View document ↗
            </a>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          No versions yet. Add the first version below.
        </div>
      )}

      {/* New version form */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Add new version</h2>
        <form action={createDocumentVersion} className="space-y-4 max-w-xl">
          <input type="hidden" name="documentId" value={doc.id} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Version number <span className="text-red-500">*</span>
              </label>
              <input
                name="versionNumber"
                type="text"
                required
                placeholder="e.g. 2.0"
                pattern="^\d+\.\d+$"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Effective date <span className="text-red-500">*</span>
              </label>
              <input
                name="effectiveDate"
                type="date"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Revision summary <span className="text-red-500">*</span>
            </label>
            <textarea
              name="revisionSummary"
              required
              rows={2}
              placeholder="What changed in this version…"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Approved by (lab director name — typed attestation) <span className="text-red-500">*</span>
            </label>
            <input
              name="approvedBy"
              type="text"
              required
              placeholder="Dr. Jane Smith"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">Type the approving director&apos;s full name. Serves as the version approval record.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document URL (optional)</label>
            <input
              name="documentContentUrl"
              type="url"
              placeholder="https://…"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Save version
          </button>
        </form>
      </section>

      {/* Version history */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Version history</h2>
        {doc.versions.length === 0 ? (
          <p className="text-sm text-slate-500">No versions on record.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Version</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Effective</th>
                  <th className="text-left px-4 py-2 font-medium">Superseded</th>
                  <th className="text-left px-4 py-2 font-medium">Approved by</th>
                  <th className="text-left px-4 py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 font-mono font-medium">v{v.versionNumber}</td>
                    <td className="px-4 py-2">
                      {v.isCurrent ? (
                        <span className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                          Current
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                          Superseded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(v.effectiveDate)}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(v.supersededDate)}</td>
                    <td className="px-4 py-2 text-slate-600">{v.approvedBy}</td>
                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate">{v.revisionSummary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
