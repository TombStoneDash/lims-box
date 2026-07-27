import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

// Regression coverage for issue #70 (duplicate Vercel projects): every
// non-canonical host that serves this app — including the five legacy
// domains still attached to the legacy `limsbot` Vercel project — must
// 308 to https://lims.bot at the app layer. The vercel.json variant of
// this rule is ignored on Next.js deployments (verified live 2026-07-25:
// www.lims.bot returned 200 despite the rule), so the redirects have to
// stay in next.config.js. If a host is removed here, it either regains a
// duplicate product surface or breaks when domains are consolidated.

const REQUIRED_HOSTS = [
  "www.lims.bot",
  "limsbot.com",
  "www.limsbot.com",
  "limsbox.com",
  "www.limsbox.com",
  "thelimsbox.com",
];

const CANONICAL_ORIGIN = "https://lims.bot";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require(path.join(__dirname, "..", "..", "next.config.js"));

test("next.config.js 308s every non-canonical host to lims.bot", async () => {
  const redirects: Array<{
    source: string;
    destination: string;
    permanent: boolean;
    has?: Array<{ type: string; value: string }>;
  }> = await nextConfig.redirects();

  for (const host of REQUIRED_HOSTS) {
    const rule = redirects.find((r) =>
      (r.has ?? []).some((h) => h.type === "host" && h.value === host)
    );
    assert.ok(rule, `missing host redirect for ${host}`);
    assert.equal(rule!.permanent, true, `${host} redirect must be permanent (308)`);
    assert.equal(
      rule!.source,
      "/:path*",
      `${host} redirect must cover every path`
    );
    assert.ok(
      rule!.destination.startsWith(`${CANONICAL_ORIGIN}/`) ||
        rule!.destination === `${CANONICAL_ORIGIN}/:path*`,
      `${host} must redirect to the canonical origin, got ${rule!.destination}`
    );
  }
});

test("the canonical host is never redirected", async () => {
  const redirects: Array<{
    has?: Array<{ type: string; value: string }>;
  }> = await nextConfig.redirects();

  const canonicalRule = redirects.find((r) =>
    (r.has ?? []).some((h) => h.type === "host" && h.value === "lims.bot")
  );
  assert.equal(canonicalRule, undefined, "lims.bot itself must not host-redirect");
});
