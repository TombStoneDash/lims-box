import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "app/clinical/page.tsx"),
  "utf8",
);

const hrefs = [...source.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1]);

test("clinical page has exactly one route into the synthetic demo", () => {
  const demoHrefs = hrefs.filter((href) => href.startsWith("/senaite-demo"));
  assert.deepEqual(demoHrefs, ["/senaite-demo"]);
});

test("clinical page demo CTA is labeled clearly, not implied to be the intake form", () => {
  assert.match(source, /View the synthetic demo/);
});

test("clinical page has no /demo hrefs (that route belongs to a different surface)", () => {
  for (const href of hrefs) {
    assert.doesNotMatch(href, /^\/demo(\/|$)/, href);
  }
});

test("clinical page does not claim to hold or display real customer data", () => {
  assert.doesNotMatch(source, /real (customer|patient) data/i);
  assert.doesNotMatch(source, /live customer data/i);
  assert.match(source, /No PHI, no customer data/);
  assert.match(source, /[Ss]ynthetic data only/);
});

test("clinical page does not imply the demo is connected to a live production system", () => {
  assert.match(source, /not connected to any live production\s+system/);
  assert.doesNotMatch(source, /connects? (directly )?to your (LIS|EHR)/i);
  assert.doesNotMatch(source, /(?<!no )(?<!not )live LIS integration/i);
});

test("clinical page distinguishes demonstrated capabilities from coming-soon / integration-dependent claims", () => {
  assert.match(source, /Demonstrated today/);
  assert.match(source, /Coming soon \/ integration-dependent/);
  assert.match(source, /DEMONSTRATED_TODAY/);
  assert.match(source, /COMING_SOON/);
  assert.match(source, /not built/i);
});

test("clinical page still routes to the human intake form as a distinct CTA from the demo", () => {
  assert.ok(hrefs.includes("/clinical/intake"));
});
