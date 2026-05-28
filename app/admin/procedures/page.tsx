import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "../_components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ProceduresPage() {
  const procedures = await prisma.procedure.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { authorizations: { where: { isActive: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Procedures</h1>
          <p className="text-sm text-slate-600 mt-1">
            ISO 15189 §6.2.4 — procedure-specific authorization tracking
          </p>
        </div>
        <Link
          href="/admin/procedures/new"
          className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          + New procedure
        </Link>
      </div>

      {procedures.length === 0 ? (
        <p className="text-sm text-slate-500">No procedures yet. Create one to start tracking authorizations.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-left px-4 py-2 font-medium">Active auths</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {procedures.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-slate-600 font-mono text-xs">{p.procedureCode ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600 max-w-xs truncate">{p.description ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{p._count.authorizations}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/procedures/${p.id}`}
                      className="text-sm text-slate-600 underline hover:text-slate-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
