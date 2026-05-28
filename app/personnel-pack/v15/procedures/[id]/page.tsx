import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/app/admin/_components/StatusBadge";
import { isAuthorizationActive } from "@/lib/personnel-pack-v15/service";

export default async function ProcedureAuthorizedPersonnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procedure = await prisma.personnelPackDocument.findUnique({
    where: { id },
    include: {
      versions: {
        where: { supersededDate: null },
        orderBy: { effectiveDate: "desc" },
        take: 1,
      },
      authorizations: {
        include: {
          person: true,
        },
        orderBy: [{ revokedAt: "asc" }, { authorizedAt: "desc" }],
      },
    },
  });

  if (!procedure || procedure.kind !== "procedure") return notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{procedure.code}</p>
        <h1 className="mt-1 text-2xl font-semibold">{procedure.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Current version {procedure.versions[0]?.versionNumber || "missing"} · Effective{" "}
          {formatDate(procedure.versions[0]?.effectiveDate)}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Person</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Authorized by</th>
              <th className="px-4 py-3 text-left font-medium">Scope</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {procedure.authorizations.map((authorization) => (
              <tr key={authorization.id}>
                <td className="px-4 py-3 font-medium">{authorization.person.name}</td>
                <td className="px-4 py-3 text-slate-600">{authorization.person.role}</td>
                <td className="px-4 py-3 text-slate-600">
                  {authorization.authorizedBy} · {formatDate(authorization.authorizedAt)}
                </td>
                <td className="px-4 py-3 text-slate-600">{authorization.scope || "General scope"}</td>
                <td className="px-4 py-3">
                  {isAuthorizationActive(authorization)
                    ? "Active"
                    : `Revoked ${formatDate(authorization.revokedAt)} by ${authorization.revokedBy}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
