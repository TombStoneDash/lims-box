import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/people/[id]/authorizations/route";
import { prisma } from "../../lib/prisma";

test("GET /api/people/:id/authorizations uses lookahead pagination", async (t) => {
  const personDelegate = prisma.person as unknown as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
  };
  const authorizationDelegate = prisma.authorization as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindUnique = personDelegate.findUnique;
  const originalFindMany = authorizationDelegate.findMany;

  t.after(async () => {
    personDelegate.findUnique = originalFindUnique;
    authorizationDelegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  await t.test("2 rows, limit=2 -> has_more false, next_cursor null", async () => {
    personDelegate.findUnique = async () => ({ id: "person-1" });
    const rows = [{ id: "auth-1" }, { id: "auth-2" }];
    authorizationDelegate.findMany = async (args: { take: number }) => rows.slice(0, args.take);

    const response = await GET(new NextRequest("http://x?limit=2"), {
      params: Promise.resolve({ id: "person-1" }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 2);
    assert.deepEqual(body.data.map((d: { id: string }) => d.id), ["auth-1", "auth-2"]);
    assert.equal(body.pagination.has_more, false);
    assert.equal(body.pagination.next_cursor, null);
  });

  await t.test("3 rows, limit=2 -> has_more true, next_cursor of 2nd row", async () => {
    personDelegate.findUnique = async () => ({ id: "person-1" });
    const rows = [{ id: "auth-1" }, { id: "auth-2" }, { id: "auth-3" }];
    authorizationDelegate.findMany = async (args: { take: number }) => rows.slice(0, args.take);

    const response = await GET(new NextRequest("http://x?limit=2"), {
      params: Promise.resolve({ id: "person-1" }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.map((d: { id: string }) => d.id), ["auth-1", "auth-2"]);
    assert.equal(body.pagination.has_more, true);
    assert.equal(body.pagination.next_cursor, "auth-2");
  });
});
