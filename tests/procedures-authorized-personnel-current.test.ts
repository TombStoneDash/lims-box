import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/procedures/[id]/authorized-personnel/route";
import { prisma } from "../lib/prisma";

test("GET /api/procedures/:id/authorized-personnel scopes to current authorizations", async (t) => {
  const procedureDelegate = prisma.procedure as unknown as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
  };
  const authorizationDelegate = prisma.authorization as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindUnique = procedureDelegate.findUnique;
  const originalFindMany = authorizationDelegate.findMany;

  t.after(async () => {
    procedureDelegate.findUnique = originalFindUnique;
    authorizationDelegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  await t.test("returns the current authorizations for an existing procedure", async () => {
    procedureDelegate.findUnique = async () => ({ id: "proc-1" });
    let capturedWhere: unknown;
    authorizationDelegate.findMany = async (args: { where: unknown }) => {
      capturedWhere = args.where;
      return [];
    };

    const response = await GET(new NextRequest("http://x"), {
      params: Promise.resolve({ id: "proc-1" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(capturedWhere, {
      procedureId: "proc-1",
      isActive: true,
      person: { active: true },
    });
  });

  await t.test("returns 404 when the procedure does not exist", async () => {
    procedureDelegate.findUnique = async () => null;
    authorizationDelegate.findMany = async () => {
      throw new Error("should not be called");
    };

    const response = await GET(new NextRequest("http://x"), {
      params: Promise.resolve({ id: "missing-proc" }),
    });

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error?.code ?? body.code, "NOT_FOUND");
  });
});
