import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/prospects/route";
import { prisma } from "../../lib/prisma";

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

test("POST /api/prospects normalizes fieldBenchSplit", async (t) => {
  const prospectDelegate = prisma.prospect as unknown as {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  const originalCreate = prospectDelegate.create;

  t.after(async () => {
    prospectDelegate.create = originalCreate;
    await prisma.$disconnect();
  });

  let capturedData: { fieldBenchSplit: unknown } | undefined;
  prospectDelegate.create = async (args: { data: { fieldBenchSplit: unknown } }) => {
    capturedData = args.data;
    return { id: "prospect-1" };
  };

  const basePayload = {
    track: "environmental",
    name: "Dana Lee",
    email: "dana.lee@example.com",
    labName: "Example Lab",
    labSize: "10-50",
  };

  await t.test("rounds and clamps finite numbers and plain decimal text", async () => {
    const cases: Array<[unknown, number]> = [
      [42.6, 43],
      ["50", 50],
      [" 7.2 ", 7],
      [250, 100],
      [-5, 0],
    ];
    for (const [input, expected] of cases) {
      const response = await post({ ...basePayload, fieldBenchSplit: input });
      assert.equal(response.status, 200);
      assert.equal(capturedData?.fieldBenchSplit, expected, `input ${JSON.stringify(input)}`);
    }
  });

  await t.test("stores null for everything else", async () => {
    const inputs: unknown[] = [
      undefined,
      "",
      "   ",
      null,
      true,
      false,
      [],
      [5],
      {},
      "0x32",
      "Infinity",
      "1e2",
      "abc",
    ];
    for (const input of inputs) {
      const payload: Record<string, unknown> = { ...basePayload };
      if (input !== undefined) {
        payload.fieldBenchSplit = input;
      }
      const response = await post(payload);
      assert.equal(response.status, 200);
      assert.equal(capturedData?.fieldBenchSplit, null, `input ${JSON.stringify(input)}`);
    }
  });

  await t.test("ignores fieldBenchSplit for non-environmental tracks", async () => {
    const response = await post({
      track: "clinical",
      name: "Casey Kim",
      email: "casey.kim@example.com",
      labName: "Example Clinical Lab",
      labSize: "10-50",
      fieldBenchSplit: 50,
    });
    assert.equal(response.status, 200);
    assert.equal(capturedData?.fieldBenchSplit, null);
  });
});
