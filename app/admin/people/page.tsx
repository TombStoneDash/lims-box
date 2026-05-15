import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge, formatDate } from "../_components/StatusBadge";

function worstStatus(comps: { status: string; expiresAt: Date | null }[]): string {
  const now = new Date();
  if (comps.some((c) => c.status === "overdue" || (c.expiresAt && c.expiresAt < now && c.status !== "completed"))) {
    return "overdue";
  }
  if (comps.some((c) => c.status === "due")) return "due";
  if (comps.length === 0) return "no records";
  return "completed";
}

export default async function PeopleListPage() {
  const people = await prisma.person.findMany({
    where: { active: true },
    include: {
      competencies: true,
      trainings: { orderBy: { completedAt: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-slate-600 mt-1">{people.length} active</p>
        </div>
        <Link
          href="/admin/people/new"
          className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Add person
        </Link>
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
                  <StatusBadge status={worstStatus(p.competencies)} />
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
