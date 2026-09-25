import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const pagePath = path.join(__dirname, '../../app/blog/page.tsx');
const source = ts.createSourceFile(
  pagePath, readFileSync(pagePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
// Execute the page's private formatter without exporting a non-route Next.js API
// or copying its implementation into the test.
const formatter = source.statements.find((statement): statement is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === 'formatDate');
assert.ok(formatter, 'expected the blog index publication-date formatter');
const { outputText } = ts.transpileModule(formatter.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
});

const fixtures = [
  ['2026-04-13', 'April 13, 2026'],
  ['2026-01-01', 'January 1, 2026'],
  ['2024-02-29', 'February 29, 2024'],
];

for (const timeZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
  test(`blog index preserves authored calendar dates in ${timeZone}`, () => {
    const originalTZ = process.env.TZ;
    // Each timezone lives only in a child process; the parent environment and
    // concurrent tests never change, including when an assertion fails.
    const result = spawnSync(process.execPath, ['--eval', `${outputText}
      const dates = JSON.parse(process.argv[1]);
      process.stdout.write(JSON.stringify(dates.map(date => formatDate(date))));
    `, JSON.stringify(fixtures.map(([date]) => date))], {
      env: { ...process.env, TZ: timeZone },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(process.env.TZ, originalTZ, 'parent timezone must remain unchanged');
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), fixtures.map(([, displayed]) => displayed));
  });
}
