import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/emailValidation";

export const dynamic = "force-dynamic";

interface ProspectPayload {
  track?: string;
  name?: string;
  email?: string;
  labName?: string;
  labSize?: string;
  accreditations?: string[] | string;
  painPoint?: string;
  source?: string;
  fieldBenchSplit?: number | string;
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  let payload: ProspectPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const track = clean(payload.track);
  const name = clean(payload.name);
  const email = normalizeEmail(payload.email);
  const labName = clean(payload.labName);
  const labSize = clean(payload.labSize);

  if (track !== "clinical" && track !== "environmental") {
    return NextResponse.json({ ok: false, error: "Invalid track" }, { status: 400 });
  }
  if (!name || !email || !labName || !labSize) {
    return NextResponse.json({ ok: false, error: "Missing required field" }, { status: 400 });
  }

  const accArr = Array.isArray(payload.accreditations)
    ? payload.accreditations.map(clean).filter(Boolean)
    : clean(payload.accreditations)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  let fieldBenchSplit: number | null = null;
  if (track === "environmental" && payload.fieldBenchSplit !== undefined && payload.fieldBenchSplit !== "") {
    const n = Number(payload.fieldBenchSplit);
    if (!isNaN(n)) fieldBenchSplit = Math.max(0, Math.min(100, Math.round(n)));
  }

  const prospect = await prisma.prospect.create({
    data: {
      track,
      name,
      email,
      labName,
      labSize,
      accreditations: JSON.stringify(accArr),
      painPoint: clean(payload.painPoint) || null,
      source: clean(payload.source) || null,
      fieldBenchSplit,
    },
  });

  return NextResponse.json({ ok: true, id: prospect.id });
}
