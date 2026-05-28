import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "../_components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const docs = await prisma.document.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      versions: { where: { isCurrent: true }, take: 1 },
      _count: { select: { versions: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Controlled Documents</h1>
          <p className="text-sm text-slate-600 mt-1">
            ISO 15189 §4.3 + §6.2.1 — version-controlled SOPs, policies, and procedure manuals
          </p>
        </div>
        <Link
          href="/admin/documents/new"
          className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          + New document
        </Link>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">No documents yet. Create one to start tracking versions.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Current version</th>
                <th className="text-left px-4 py-2 font-medium">Versions</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((doc) => {
                const current = doc.versions[0];
                return (
                  <tr key={doc.id}>
                    <td className="px-4 py-2 font-medium">{doc.title}</td>
                    <td className="px-4 py-2 text-slate-600">
                      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                        {doc.docType}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {current ? (
                        <span>
                          v{current.versionNumber}{" "}
                          <span className="text-xs text-slate-400">(effective {formatDate(current.effectiveDate)})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">No versions</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{doc._count.versions}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(doc.createdAt)}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/documents/${doc.id}`}
                        className="text-sm text-slate-600 underline hover:text-slate-900"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
