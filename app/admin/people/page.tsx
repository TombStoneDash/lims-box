import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge, formatDate } from "../_components/StatusBadge";
import { worstCompetencyStatus } from "@/lib/personnel-competency-status";
import { adminMutationsEnabled } from "@/lib/admin-capabilities";

export default async function PeopleListPage() {
  const people = await prisma.person.findMany({
    where: { active: true },
    include: {
      competencies: true,
      trainings: { orderBy: { completedAt: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  const mutationsEnabled = adminMutationsEnabled();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-slate-600 mt-1">{people.length} active</p>
        </div>
        {!mutationsEnabled ? (
          <div className="text-right max-w-xs space-y-1">
            <p className="text-xs text-slate-500">
              Adding people is disabled on this read-only view.
            </p>
            <Link
              href="/demo/operator"
              className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Open operator sandbox
            </Link>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Role</th>
              <th className="text-left px-4 py-2 font-medium">CLIA cert #</th>
              <th className="text-left px-4 py-2 font-medium">Competency status</th>
              <th className="text-left px-4 py-2 font-medium">Last training</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 text-slate-700">{p.role}</td>
                <td className="px-4 py-2 text-slate-600 font-mono text-xs">{p.cliaCertNumber || "—"}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={worstCompetencyStatus(p.competencies, new Date())} />
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {p.trainings[0] ? `${p.trainings[0].course} · ${formatDate(p.trainings[0].completedAt)}` : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/admin/people/${p.id}`} className="text-slate-900 underline text-xs">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
