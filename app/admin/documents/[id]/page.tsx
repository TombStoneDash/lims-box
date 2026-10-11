import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminMutationsEnabled } from "@/lib/admin-capabilities";
import { formatDate, formatTimestampDate } from "../../_components/StatusBadge";

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
  const mutationsEnabled = adminMutationsEnabled();

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
            Created {formatTimestampDate(doc.createdAt)}
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
          No versions on record for this document.
        </div>
      )}

      {!mutationsEnabled ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
          <p>
            Adding or approving document versions is disabled on this read-only view. Use the
            synthetic operator sandbox to rehearse these actions without changing shared records.
          </p>
          <Link
            href="/demo/operator"
            className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Open operator sandbox
          </Link>
        </div>
      ) : null}

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
                    <td className="px-4 py-2 text-slate-600">{formatTimestampDate(v.supersededDate)}</td>
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
