import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../../app/api/procedures/route";
import { prisma } from "../../lib/prisma";
import { CURRENT_AUTHORIZATION_WHERE } from "../../lib/current-authorization";

test("GET /api/procedures scopes authorization _count to current authorizations", async (t) => {
  const procedureDelegate = prisma.procedure as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = procedureDelegate.findMany;

  t.after(async () => {
    procedureDelegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  let captured: { where: unknown; include: unknown } | undefined;
  procedureDelegate.findMany = async (args: { where: unknown; include: unknown }) => {
    captured = args;
    return [];
  };

  const response = await GET();

  assert.equal(response.status, 200);
  assert.ok(captured);
  assert.deepEqual(captured!.where, { active: true });

  const include = captured!.include as {
    _count: { select: { authorizations: { where: unknown } } };
  };
  assert.deepEqual(include._count.select.authorizations.where, CURRENT_AUTHORIZATION_WHERE);
  assert.deepEqual(include._count.select.authorizations.where, {
    isActive: true,
    person: { active: true },
  });
});
