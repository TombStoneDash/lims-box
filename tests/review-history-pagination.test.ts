import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagedResponseLookahead } from '../lib/personnel-pack-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('two supplied rows under limit=2 report has_more=false with no next_cursor', async () => {
  const rows = [{ id: 'r1' }, { id: 'r2' }];
  const res = pagedResponseLookahead(rows, 2);
  const body = await res.json();
  assert.deepEqual(body.data, rows);
  assert.equal(body.pagination.has_more, false);
  assert.equal(body.pagination.next_cursor, null);
});

test('three lookahead rows under limit=2 trim the extra row and report has_more=true with the second row as next_cursor', async () => {
  const rows = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
  const res = pagedResponseLookahead(rows, 2);
  const body = await res.json();
  assert.deepEqual(body.data, [{ id: 'r1' }, { id: 'r2' }]);
  assert.equal(body.pagination.has_more, true);
  assert.equal(body.pagination.next_cursor, 'r2');
});

test('the reviews route requests limit + 1 rows and passes them through pagedResponseLookahead as a call expression', () => {
  const routePath = path.join(__dirname, '../app/api/competencies/[id]/reviews/route.ts');
  const source = readFileSync(routePath, 'utf8');

  assert.match(
    source,
    /take:\s*limit\s*\+\s*1\b/,
    'expected the review-history query to request limit + 1 rows (lookahead)'
  );
  assert.match(
    source,
    /pagedResponseLookahead\(\s*events\s*,\s*limit\s*\)/,
    'expected the route to call pagedResponseLookahead(events, limit), not just import the identifier'
  );
});
