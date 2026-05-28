import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/app/admin/_components/StatusBadge";
import { addDocumentVersion } from "../../actions";
import { isCurrentDocumentVersion } from "@/lib/personnel-pack-v15/service";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.personnelPackDocument.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      },
      authorizations: {
        where: { revokedAt: null },
        include: {
          person: true,
        },
        orderBy: { authorizedAt: "desc" },
      },
    },
  });

  if (!document) return notFound();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{document.code}</p>
          <h1 className="mt-1 text-2xl font-semibold">{document.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {document.kind === "procedure" ? "Procedure" : "Form"} · {document.description || "No description"}
          </p>
        </div>
        {document.kind === "procedure" ? (
          <Link href={`/personnel-pack/v15/procedures/${document.id}`} className="text-sm underline">
            Authorized personnel
          </Link>
        ) : null}
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Version history</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {document.versions.map((version) => (
              <div key={version.id} className="px-5 py-4 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    Version {version.versionNumber}
                    {isCurrentDocumentVersion(version) ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Current</span>
                    ) : null}
                  </div>
                  <div className="text-slate-500">Effective {formatDate(version.effectiveDate)}</div>
                </div>
                <div className="mt-2 text-slate-600">{version.revisionSummary}</div>
                <div className="mt-2 text-xs text-slate-500">
                  Approved by {version.approvedBy} on {formatDate(version.approvedAt)}
                  {version.supersededDate ? ` · Superseded ${formatDate(version.supersededDate)}` : ""}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono">{version.documentContentUrl || "No file path"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Upload new revision</h2>
            <form action={addDocumentVersion} className="mt-4 space-y-3 text-sm">
              <input type="hidden" name="documentId" value={document.id} />
              <label className="block">
                <span className="mb-1 block text-slate-600">Version number</span>
                <input name="versionNumber" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="1.2" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-600">Effective date</span>
                <input type="date" name="effectiveDate" className="w-full rounded-md border border-slate-300 px-3 py-2" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-600">Approved by</span>
                <input name="approvedBy" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Lab director name" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-600">File path or URL</span>
                <input name="documentContentUrl" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="/uploads/sop-v1-2.pdf" />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-600">Revision summary</span>
                <textarea name="revisionSummary" className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2" required />
              </label>
              <button className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800">
                Save version
              </button>
            </form>
          </section>

          {document.kind === "procedure" ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Active authorizations</h2>
              <div className="mt-3 space-y-2 text-sm">
                {document.authorizations.length === 0 ? (
                  <p className="text-slate-500">No active authorizations.</p>
                ) : (
                  document.authorizations.map((authorization) => (
                    <div key={authorization.id} className="rounded-md border border-slate-200 p-3">
                      <div className="font-medium">{authorization.person.name}</div>
                      <div className="text-slate-500">
                        {authorization.scope || "General scope"} · Authorized {formatDate(authorization.authorizedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
