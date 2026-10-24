// Point 8 receipt: inventory a SENAITE site before a backup and after the
// restore, then compare. Read-only; prints counts and checksums, never records.
//
//   SENAITE_BASE_URL=https://<host>/senaite SENAITE_API_TOKEN=<read-only> \
//     npm run senaite:backup-inventory > before.json
//   (back up, restore into a fresh SENAITE, then inventory it to after.json)
//   npm run senaite:backup-inventory -- --compare before.json after.json
//
// Exit 0: inventory read / restore verified. 1: error or differences. 2: not configured.
import { readFileSync } from 'node:fs';
import { compareSenaiteInventories, createSenaiteInventoryReader } from '../lib/senaite-backup-inventory';

async function main(args: string[]): Promise<number> {
  if (args[0] === '--compare') {
    if (args.length !== 3) {
      console.error('usage: --compare <before.json> <after.json>');
      return 1;
    }
    const [before, after] = args.slice(1).map(file => {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    });
    const comparison = compareSenaiteInventories(before, after);
    console.log(JSON.stringify(comparison, null, 2));
    return comparison.ok ? 0 : 1;
  }
  if (args.length !== 0) {
    console.error('usage: [--compare <before.json> <after.json>]');
    return 1;
  }
  const result = await createSenaiteInventoryReader().read();
  if (result.status === 'not_configured') {
    console.error('not configured: set SENAITE_BASE_URL (https site root) and SENAITE_API_TOKEN');
    return 2;
  }
  if (result.status === 'error') {
    console.error(`inventory failed: ${result.code}${result.portalType ? ` (${result.portalType})` : ''}`);
    return 1;
  }
  console.log(JSON.stringify(result.inventory, null, 2));
  return 0;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; });
