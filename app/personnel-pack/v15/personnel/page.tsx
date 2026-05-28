import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PersonnelV15IndexPage() {
  const people = await prisma.person.findMany({
    where: { active: true },
    include: {
      authorizations: {
        where: { revokedAt: null },
      },
      competencies: {
        include: {
          reviewEvents: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Personnel authorizations</h1>
        <p className="mt-1 text-sm text-slate-600">Grant procedure access and audit competency review history per person.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Person</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Active authorizations</th>
              <th className="px-4 py-3 text-left font-medium">Competencies with ISO review</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.map((person) => {
              const reviewedCompetencies = person.competencies.filter((competency) => competency.reviewEvents.length > 0).length;
              return (
                <tr key={person.id}>
                  <td className="px-4 py-3 font-medium">{person.name}</td>
                  <td className="px-4 py-3 text-slate-600">{person.role}</td>
                  <td className="px-4 py-3 text-slate-600">{person.authorizations.length}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {reviewedCompetencies}/{person.competencies.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/personnel-pack/v15/personnel/${person.id}`} className="underline">
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
