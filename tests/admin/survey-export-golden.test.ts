import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";
import { GET } from "../../app/api/admin/personnel-pack/survey-export/route";
import { prisma } from "../../lib/prisma";

interface GoldenFixture {
  fixtureNotice: string;
  clockIso: string;
  generatedAt: string;
  people: Array<Record<string, unknown>>;
  expected: {
    status: number;
    contentType: string;
    contentDisposition: string;
    cacheControl: string;
    entryNames: string[];
    manifest: string;
    zipSha256: string;
    pdfText: Record<string, string[]>;
  };
}

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/survey-export.golden.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as GoldenFixture;

const dateFields = new Set([
  "authorizedAt",
  "completedAt",
  "createdAt",
  "expiresAt",
  "hireDate",
  "revokedAt",
  "signedAt",
  "updatedAt",
]);

function reviveFixtureDates(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reviveFixtureDates);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      dateFields.has(key) && child !== null
        ? new Date(String(child))
        : reviveFixtureDates(child),
    ]),
  );
}

function formatUtcDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function installDeterministicDate(): () => void {
  const originalDate = globalThis.Date;
  const clockMs = new originalDate(fixture.clockIso).valueOf();

  const deterministicDate = new Proxy(originalDate, {
    apply() {
      return new originalDate(clockMs).toISOString();
    },
    construct(target, args) {
      const date = Reflect.construct(
        target,
        args.length === 0 ? [clockMs] : args,
      ) as Date;
      Object.defineProperties(date, {
        getDate: {
          configurable: true,
          value: () => date.getUTCDate(),
        },
        getFullYear: {
          configurable: true,
          value: () => date.getUTCFullYear(),
        },
        getHours: {
          configurable: true,
          value: () => date.getUTCHours(),
        },
        getMinutes: {
          configurable: true,
          value: () => date.getUTCMinutes(),
        },
        getMonth: {
          configurable: true,
          value: () => date.getUTCMonth(),
        },
        getSeconds: {
          configurable: true,
          value: () => date.getUTCSeconds(),
        },
        getTimezoneOffset: {
          configurable: true,
          value: () => 0,
        },
        toLocaleDateString: {
          configurable: true,
          value: () => formatUtcDate(date),
        },
        toLocaleString: {
          configurable: true,
          value: () =>
            date.valueOf() === clockMs
              ? fixture.generatedAt
              : formatUtcDate(date),
        },
      });
      return date;
    },
    get(target, property) {
      if (property === "now") {
        return () => clockMs;
      }
      return Reflect.get(target, property, target);
    },
  }) as DateConstructor;

  globalThis.Date = deterministicDate;
  return () => {
    globalThis.Date = originalDate;
  };
}

function extractPdfText(pdf: Uint8Array): string[] {
  const pdfSource = Buffer.from(pdf).toString("latin1");
  const inflatedStreams: string[] = [];

  for (const match of pdfSource.matchAll(
    /stream\r?\n([\s\S]*?)\r?\nendstream/g,
  )) {
    try {
      inflatedStreams.push(
        inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"),
      );
    } catch {
      // PDFKit also emits non-content streams. Only Flate text streams matter.
    }
  }

  const lines: string[] = [];
  for (const stream of inflatedStreams) {
    for (const textMatch of stream.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const chunks = Array.from(
        textMatch[1].matchAll(/<([0-9a-fA-F]+)>/g),
        (hexMatch) => Buffer.from(hexMatch[1], "hex"),
      );
      const line = new TextDecoder("windows-1252")
        .decode(Buffer.concat(chunks))
        .replace(/\s+/g, " ")
        .trim();
      if (line) {
        lines.push(line);
      }
    }
  }

  return lines;
}

test("survey export matches the deterministic fictional golden bundle", async (t) => {
  assert.match(fixture.fixtureNotice, /fictional/i);

  const delegate = prisma.person as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = delegate.findMany;
  const restoreDate = installDeterministicDate();
  let findManyCalls = 0;

  delegate.findMany = async () => {
    findManyCalls += 1;
    return reviveFixtureDates(fixture.people) as unknown[];
  };

  t.after(async () => {
    delegate.findMany = originalFindMany;
    restoreDate();
    await prisma.$disconnect();
  });

  const response = await GET();
  const zipBytes = new Uint8Array(await response.arrayBuffer());
  const entries = unzipSync(zipBytes);

  assert.equal(findManyCalls, 1, "the database delegate must be fully stubbed");
  assert.equal(response.status, fixture.expected.status);
  assert.equal(response.headers.get("content-type"), fixture.expected.contentType);
  assert.equal(
    response.headers.get("content-disposition"),
    fixture.expected.contentDisposition,
  );
  assert.equal(
    response.headers.get("cache-control"),
    fixture.expected.cacheControl,
  );
  assert.equal(
    createHash("sha256").update(zipBytes).digest("hex"),
    fixture.expected.zipSha256,
  );
  assert.deepEqual(Object.keys(entries).sort(), fixture.expected.entryNames);
  assert.equal(
    strFromU8(entries["MANIFEST.txt"]),
    fixture.expected.manifest,
  );

  for (const [entryName, expectedText] of Object.entries(
    fixture.expected.pdfText,
  )) {
    assert.ok(entries[entryName], `missing expected PDF entry: ${entryName}`);
    assert.deepEqual(extractPdfText(entries[entryName]), expectedText);
  }
});
