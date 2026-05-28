import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/app/admin/_components/StatusBadge";
import { addAuthorization, revokeAuthorizationAction } from "../../actions";
import { isAuthorizationActive } from "@/lib/personnel-pack-v15/service";

export default async function PersonnelV15DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [person, procedures] = await Promise.all([
    prisma.person.findUnique({
      where: { id },
      include: {
        competencies: {
          include: {
            reviewEvents: {
              orderBy: { reviewedAt: "desc" },
            },
          },
          orderBy: { type: "asc" },
        },
        authorizations: {
          include: {
            document: {
              include: {
                versions: {
                  where: { supersededDate: null },
                  orderBy: { effectiveDate: "desc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ revokedAt: "asc" }, { authorizedAt: "desc" }],
        },
      },
    }),
    prisma.personnelPackDocument.findMany({
      where: { kind: "procedure" },
      orderBy: { title: "asc" },
    }),
  ]);

  if (!person) return notFound();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{person.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {person.role}
            {person.cliaCertNumber ? ` · ${person.cliaCertNumber}` : ""}
          </p>
        </div>
        <Link href={`/admin/people/${person.id}`} className="text-sm underline">
          Open v1 record
        </Link>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Authorizations</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {person.authorizations.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-500">No procedure authorizations recorded.</div>
            ) : (
              person.authorizations.map((authorization) => (
                <div key={authorization.id} className="px-5 py-4 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{authorization.document.title}</div>
                      <div className="text-slate-500">
                        {authorization.scope || "General scope"} · Authorized by {authorization.authorizedBy} on{" "}
                        {formatDate(authorization.authorizedAt)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Current procedure version {authorization.document.versions[0]?.versionNumber || "Missing"}
                      </div>
                    </div>
                    {isAuthorizationActive(authorization) ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-600">Revoked</span>
                    )}
                  </div>

                  {isAuthorizationActive(authorization) ? (
                    <form action={revokeAuthorizationAction} className="mt-3 grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-4">
                      <input type="hidden" name="authorizationId" value={authorization.id} />
                      <input type="hidden" name="personId" value={person.id} />
                      <input type="hidden" name="procedureId" value={authorization.documentId} />
                      <input type="date" name="revokedAt" className="rounded-md border border-slate-300 px-3 py-2" required />
                      <input name="revokedBy" className="rounded-md border border-slate-300 px-3 py-2" placeholder="Revoked by" required />
                      <input name="revocationReason" className="rounded-md border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Reason" required />
                      <button className="rounded-md bg-slate-900 px-4 py-2 text-white md:col-span-4 md:justify-self-start">
                        Revoke and log
                      </button>
                    </form>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">
                      Revoked by {authorization.revokedBy} on {formatDate(authorization.revokedAt)} · {authorization.revocationReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Grant authorization</h2>
          <form action={addAuthorization} className="mt-4 space-y-3 text-sm">
            <input type="hidden" name="personId" value={person.id} />
            <label className="block">
              <span className="mb-1 block text-slate-600">Procedure</span>
              <select name="documentId" className="w-full rounded-md border border-slate-300 px-3 py-2" required>
                <option value="">Select a procedure</option>
                {procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>
                    {procedure.code} · {procedure.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Authorized date</span>
              <input type="date" name="authorizedAt" className="w-full rounded-md border border-slate-300 px-3 py-2" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Lab director signature</span>
              <input name="authorizedBy" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Typed name" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Scope</span>
              <input name="scope" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="All shifts / supervised only" />
            </label>
            <button className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800">
              Save authorization
            </button>
          </form>
        </section>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Review history</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {person.competencies.map((competency) => (
            <div key={competency.id} className="px-5 py-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{competency.type}</div>
                  <div className="text-slate-500">
                    {competency.reviewEvents[0]
                      ? `Latest ${competency.reviewEvents[0].reviewType.replaceAll("_", " ")} review on ${formatDate(competency.reviewEvents[0].reviewedAt)}`
                      : "No ISO review events logged"}
                  </div>
                </div>
                <Link href={`/personnel-pack/v15/competency/${competency.id}`} className="underline">
                  Open review history
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
