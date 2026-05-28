import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "../../_components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ProcedureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const procedure = await prisma.procedure.findUnique({
    where: { id },
    include: {
      authorizations: {
        include: { person: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!procedure) return notFound();

  const active = procedure.authorizations.filter((a) => a.isActive);
  const revoked = procedure.authorizations.filter((a) => !a.isActive);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{procedure.name}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {procedure.procedureCode && (
              <span className="font-mono text-xs mr-2 border border-slate-200 rounded px-1.5 py-0.5">
                {procedure.procedureCode}
              </span>
            )}
            {procedure.description ?? "No description"}
          </p>
        </div>
        <Link href="/admin/procedures" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          ← Back
        </Link>
      </div>

      {/* Authorized personnel — active */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Authorized personnel</h2>
          <span className="text-xs text-slate-500">ISO 15189 §6.2.4</span>
        </div>

        {active.length === 0 ? (
          <p className="text-sm text-slate-500">
            No one is currently authorized for this procedure.{" "}
            <Link href="/admin/people" className="underline hover:text-slate-900">
              Go to People
            </Link>{" "}
            to grant authorizations.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Role</th>
                  <th className="text-left px-4 py-2 font-medium">Authorized date</th>
                  <th className="text-left px-4 py-2 font-medium">Authorized by</th>
                  <th className="text-left px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.map((auth) => (
                  <tr key={auth.id}>
                    <td className="px-4 py-2 font-medium">{auth.person.name}</td>
                    <td className="px-4 py-2 text-slate-600">{auth.person.role}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(auth.authorizedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{auth.authorizedBy}</td>
                    <td className="px-4 py-2 text-slate-600">{auth.scope ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/people/${auth.personId}`}
                        className="text-xs text-slate-600 underline hover:text-slate-900"
                      >
                        Personnel record
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Revoked authorizations */}
      {revoked.length > 0 && (
        <section>
          <h2 className="text-base font-medium text-slate-600 mb-3">Revoked authorizations</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 opacity-75">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Authorized</th>
                  <th className="text-left px-4 py-2 font-medium">Revoked</th>
                  <th className="text-left px-4 py-2 font-medium">Revoked by</th>
                  <th className="text-left px-4 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revoked.map((auth) => (
                  <tr key={auth.id}>
                    <td className="px-4 py-2 text-slate-500">{auth.person.name}</td>
                    <td className="px-4 py-2 text-slate-500">{formatDate(auth.authorizedAt)}</td>
                    <td className="px-4 py-2 text-slate-500">{formatDate(auth.revokedAt)}</td>
                    <td className="px-4 py-2 text-slate-500">{auth.revokedBy ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{auth.revocationReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
