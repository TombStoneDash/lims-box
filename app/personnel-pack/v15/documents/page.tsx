import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/app/admin/_components/StatusBadge";
import { isCurrentDocumentVersion } from "@/lib/personnel-pack-v15/service";

export default async function ControlledDocumentsPage() {
  const documents = await prisma.personnelPackDocument.findMany({
    include: {
      versions: {
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      },
      authorizations: {
        where: { revokedAt: null },
      },
    },
    orderBy: [{ kind: "asc" }, { code: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Controlled documents</h1>
        <p className="mt-1 text-sm text-slate-600">Upload revisions, retain history, and confirm current versions.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Kind</th>
              <th className="px-4 py-3 text-left font-medium">Current version</th>
              <th className="px-4 py-3 text-left font-medium">Effective</th>
              <th className="px-4 py-3 text-left font-medium">Active authorizations</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((document) => {
              const currentVersion = document.versions.find((version) => isCurrentDocumentVersion(version));
              return (
                <tr key={document.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{document.code}</td>
                  <td className="px-4 py-3 font-medium">{document.title}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{document.kind}</td>
                  <td className="px-4 py-3">{currentVersion?.versionNumber || "Missing"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(currentVersion?.effectiveDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{document.authorizations.length}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/personnel-pack/v15/documents/${document.id}`} className="underline">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
