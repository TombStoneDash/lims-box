import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Regression coverage for issue #64 (commercial proof cleanup): the fabricated
// "Clear Creek" case study, the unsupported "active technical collaboration
// with founder Ramon Bartl" claim, generic-attributed testimonials, and a
// handful of unqualified compliance/partnership claims were found live on
// lims.bot and removed or reframed. These assertions exist so none of it
// silently reappears.

const ROOT = path.join(__dirname, "..", "..");

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

// The evidence matrix page (app/evidence/page.tsx) is the intentional historical
// record of what was removed — it must name the banned entities to document them,
// so it's excluded from the "banned phrase" sweep below (its own test covers it).
const EVIDENCE_PAGE = path.join(ROOT, "app/evidence/page.tsx");

const SCAN_FILES = [
  ...["app", "components", "content", "lib"].flatMap((d) => walk(path.join(ROOT, d), [".tsx", ".ts", ".md"])),
  path.join(ROOT, "SUPABASE_SETUP.md"),
].filter((f) => f !== EVIDENCE_PAGE);

function read(relPath: string): string {
  // JSX text often wraps across lines, so collapse whitespace before matching
  // multi-word phrases — mirrors the normalization tests/bot/engine.test.ts uses.
  return readFileSync(path.join(ROOT, relPath), "utf8").replace(/\s+/g, " ");
}

// Fabricated entities / unsupported claims that must never reappear unlabeled
// anywhere in public site content, blog posts, or dev docs.
const BANNED_PHRASES: RegExp[] = [
  /clear creek/i,
  /rachel moreno/i,
  /david park,\s*senior analyst/i,
  /active technical collaboration/i,
  /in collaboration with its founder/i,
  /we contribute upstream/i,
  /currently running a 5-lab/i,
  /network of vc connectors/i,
];

test("no fabricated customer/case-study entities or unsupported collaboration claims remain anywhere in scanned content", () => {
  for (const file of SCAN_FILES) {
    const text = readFileSync(file, "utf8").replace(/\s+/g, " ");
    for (const pattern of BANNED_PHRASES) {
      assert.ok(
        !pattern.test(text),
        `Found banned phrase ${pattern} in ${path.relative(ROOT, file)} — issue #64 regression`,
      );
    }
  }
});

test("case study page is explicitly labeled as an illustrative/hypothetical scenario", () => {
  const source = read("app/case-study/page.tsx");
  assert.match(source, /hypothetical/i);
  assert.match(source, /illustrative/i);
  assert.doesNotMatch(source, /real results for real labs/i);
});

test("SENAITE/RidingBytes copy states the open-source technology fact without claiming an active collaboration", () => {
  const homepage = read("app/page.tsx");
  assert.match(homepage, /originally created by RidingBytes/i);
  assert.doesNotMatch(homepage, /active technical collaboration/i);

  const partners = read("app/partners/page.tsx");
  // Truthful, verifiable fact about the open-source project's founders is preserved.
  assert.match(partners, /Founded by Ramon Bartl and Lukas Graf/);
  // But no claim of an active partnership/consultation relationship with LIMS BOX.
  assert.doesNotMatch(partners, /technical consultation on ISO 17025/i);
  assert.doesNotMatch(partners, /backed by the people who built/i);
});

test("founder credentials remain accurate and present (must not regress while scrubbing unsupported claims)", () => {
  const about = read("app/about/page.tsx");
  assert.match(about, /MS Biochemistry \(UCSD \/ Salk\)/);
  assert.match(about, /Certified Water Specialist \(California\)/);
  assert.match(about, /State of Alaska Department of Health/);

  const personnelPack = read("app/personnel-pack/page.tsx");
  assert.match(personnelPack, /Built by Hudson Taylor/);
  assert.match(personnelPack, /State of Alaska Department of Health/);

  const press = read("app/press/page.tsx");
  assert.match(press, /Hudson Taylor is the founder of Tombstone Dash LLC/);
});

test("illustrative pain-point quotes on vertical pages are not presented as attributed customer testimonials", () => {
  for (const p of ["app/environmental/page.tsx", "app/clinical/page.tsx"]) {
    const source = read(p);
    assert.doesNotMatch(source, /<blockquote/);
    assert.match(source, /illustrative/i);
  }
});

test("compliance claims use hedged 'designed for / ready / built for' language instead of unqualified 'compliant'", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.doesNotMatch(pricing, /ISO 15189 §6\.2\.4 compliant/i);
  assert.match(pricing, /designed for ISO 15189 §6\.2\.4/i);

  const cliaTracker = read("app/clia-tracker/page.tsx");
  assert.doesNotMatch(cliaTracker, /CLIA §493\.1407 Compliance/);
  assert.match(cliaTracker, /Personnel documentation for CLIA §493\.1407 workflows/);

  const envLabs = read("app/for/environmental-labs/page.tsx");
  assert.doesNotMatch(envLabs, /40 CFR Part 136 Compliant/);
  assert.match(envLabs, /40 CFR Part 136 Ready/);
});

test("CLIA overview routes to the existing Personnel Pack without stale launch or certification claims", () => {
  const clia = read("app/clia/page.tsx");
  const cliaTracker = read("app/clia-tracker/page.tsx");

  assert.match(clia, /Personnel Pack is available now/);
  assert.match(clia, /href="\/clia-tracker"/);
  assert.doesNotMatch(clia, /June launch|coming soon/i);

  assert.match(cliaTracker, /href="\/clia"/);
  for (const source of [clia, cliaTracker]) {
    assert.doesNotMatch(source, /CLIA compliant|COLA approved|21 CFR Part 11 compliant|HIPAA compliant/i);
  }
  assert.doesNotMatch(cliaTracker, /Audit-Ready Compliance|ready for the inspector on day one|covers CLIA §493\.1407 end-to-end|Ready to pass the personnel section/i);
});

test("public capability evidence matrix exists with all four categories", () => {
  const evidence = read("app/evidence/page.tsx");
  assert.match(evidence, /Verified/);
  assert.match(evidence, /Demonstrated/);
  assert.match(evidence, /Proposed/);
  assert.match(evidence, /Not Publicly Claimable/);
  // The matrix itself must document the removed claims, not merely omit them.
  assert.match(evidence, /Clear Creek/);
  assert.match(evidence, /Ramon Bartl/);
});
