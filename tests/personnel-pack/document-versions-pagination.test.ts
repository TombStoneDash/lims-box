import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagedResponseLookahead } from '../../lib/personnel-pack-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('limit supplied rows report has_more=false with no next_cursor', async () => {
  const rows = [{ id: 'v1' }, { id: 'v2' }];
  const res = pagedResponseLookahead(rows, 2);
  const body = await res.json();
  assert.deepEqual(body.data, rows);
  assert.equal(body.pagination.has_more, false);
  assert.equal(body.pagination.next_cursor, null);
});

test('limit + 1 lookahead rows trim the extra row and report has_more=true with the last returned row as next_cursor', async () => {
  const rows = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }];
  const res = pagedResponseLookahead(rows, 2);
  const body = await res.json();
  assert.deepEqual(body.data, [{ id: 'v1' }, { id: 'v2' }]);
  assert.equal(body.pagination.has_more, true);
  assert.equal(body.pagination.next_cursor, 'v2');
});

test('the document versions route requests limit + 1 rows and passes them through pagedResponseLookahead as a call expression', () => {
  const routePath = path.join(__dirname, '../../app/api/documents/[id]/versions/route.ts');
  const source = readFileSync(routePath, 'utf8');

  assert.match(
    source,
    /take:\s*limit\s*\+\s*1\b/,
    'expected the document version history query to request limit + 1 rows (lookahead)'
  );
  assert.match(
    source,
    /pagedResponseLookahead\(\s*versions\s*,\s*limit\s*\)/,
    'expected the route to call pagedResponseLookahead(versions, limit), not just import the identifier'
  );

  const getMatch = source.match(/export async function GET[\s\S]*?\n}\n/);
  assert.ok(getMatch, 'expected to find the GET handler');
  assert.doesNotMatch(
    getMatch[0],
    /pagedResponse\(/,
    'expected GET to no longer call the non-lookahead pagedResponse('
  );
});
