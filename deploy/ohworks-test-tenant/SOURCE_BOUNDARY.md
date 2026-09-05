# OHWorks real-SENAITE source boundary

- UI/API candidate: this repository and commit.
- SENAITE client, loader, OHWorks bundle, and result importer authority: clean
  source head `bcc97cc5df73941c3e34171e67a64b552e13425e` (tree
  `59322a5355c32859955f3cd36d9488632df7a867`).
- Existing importer entrypoint: `tools/import-results.js`; it alone writes
  results, uses `submit`, independently reads `to_be_verified`, and applies its
  existing duplicate ledger/quarantine behavior.
- Existing bundle loader entrypoint: `tools/load-client.js`; the five bundle
  files are mounted read-only and no second loader job or bridge is activated
  here.
- Personnel persistence: `/var/lib/ohworks-personnel/personnel-state.json`,
  separate from all SENAITE laboratory objects.

The runtime environment file is managed outside Git. `runtime.env.example`
contains variable names only. Missing SENAITE configuration or an API outage
returns an explicit unavailable state and empty laboratory collections.

This source candidate is not a deployment, customer acceptance, hosted-source
provenance closure, Caddy activation, DNS change, or public routing approval.
