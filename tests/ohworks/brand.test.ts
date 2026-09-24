import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contrastRatio, DEFAULT_SYNTHETIC_BRAND, OHWORKS_BRAND_LIMITS,
  OHWorksBrandError, parseOHWorksBrand, type OHWorksBrand,
} from '../../lib/ohworks-brand';

function reject(input: unknown, field: string, code?: string) {
  const result = parseOHWorksBrand(input);
  assert.ok(result instanceof OHWorksBrandError);
  assert.ok(result.issues.some((issue) => issue.field === field && (!code || issue.code === code)),
    `Expected ${field}: ${code}`);
}

test('valid synthetic brand is trimmed, copied and frozen', () => {
  const input = { ...DEFAULT_SYNTHETIC_BRAND, labName: '  SYNTHETIC-Laboratory  ' };
  const result = parseOHWorksBrand(input);
  assert.ok(!(result instanceof OHWorksBrandError));
  assert.deepEqual(result, DEFAULT_SYNTHETIC_BRAND);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(DEFAULT_SYNTHETIC_BRAND));
  assert.equal(Reflect.set(result, 'labName', 'SYNTHETIC-Changed'), false);
  input.labName = 'SYNTHETIC-Changed';
  assert.equal(result.labName, DEFAULT_SYNTHETIC_BRAND.labName);
  assert.ok(!(parseOHWorksBrand({ ...DEFAULT_SYNTHETIC_BRAND, logoPath: 'SYNTHETIC-logo.png' }) instanceof OHWorksBrandError));
  assert.ok(!(parseOHWorksBrand(Object.assign(Object.create(null), DEFAULT_SYNTHETIC_BRAND)) instanceof OHWorksBrandError));
});

test('rejects non-plain objects', () => {
  for (const input of [null, undefined, [], 1, 'SYNTHETIC-invalid', new Map(), new (class {})()]) {
    reject(input, '$', 'object');
  }
});

test('reports every missing or bad field, without stopping at the first', () => {
  const result = parseOHWorksBrand({});
  assert.ok(result instanceof OHWorksBrandError);
  assert.deepEqual(result.issues.map((issue) => issue.field), Object.keys(DEFAULT_SYNTHETIC_BRAND));
  const bad = Object.fromEntries(Object.keys(DEFAULT_SYNTHETIC_BRAND).map((field) => [field, '<SYNTHETIC-invalid>']));
  const errors = parseOHWorksBrand(bad);
  assert.ok(errors instanceof OHWorksBrandError);
  assert.deepEqual([...new Set(errors.issues.map((issue) => issue.field))], Object.keys(DEFAULT_SYNTHETIC_BRAND));
});

for (const field of Object.keys(DEFAULT_SYNTHETIC_BRAND) as (keyof OHWorksBrand)[]) {
  test(`${field}: rejects non-string, empty, over-limit, HTML and controls`, () => {
    for (const value of [null, 42, {}, []]) reject({ ...DEFAULT_SYNTHETIC_BRAND, [field]: value }, field, 'string');
    reject({ ...DEFAULT_SYNTHETIC_BRAND, [field]: '' }, field, 'empty');
    reject({ ...DEFAULT_SYNTHETIC_BRAND, [field]: 'SYNTHETIC-' + 'x'.repeat(OHWORKS_BRAND_LIMITS[field]) }, field, 'length');
    for (const value of ['<b>SYNTHETIC-text</b>', 'SYNTHETIC-\x00', 'SYNTHETIC-\x7f', 'SYNTHETIC-\u0085', 'SYNTHETIC-\u202e', '\nSYNTHETIC-text']) {
      reject({ ...DEFAULT_SYNTHETIC_BRAND, [field]: value }, field, 'unsafe-text');
    }
  });
}

test('text limits apply after trimming and accept the exact boundary', () => {
  for (const field of ['labName', 'legalName', 'reportFooter'] as const) {
    const value = 'SYNTHETIC-' + 'x'.repeat(OHWORKS_BRAND_LIMITS[field] - 10);
    const result = parseOHWorksBrand({ ...DEFAULT_SYNTHETIC_BRAND, [field]: `  ${value}  ` });
    assert.ok(!(result instanceof OHWorksBrandError));
    assert.equal(result[field], value);
    reject({ ...DEFAULT_SYNTHETIC_BRAND, [field]: '   ' }, field, 'empty');
  }
});

test('rejects unknown fields and accessors without executing getters', () => {
  reject({ ...DEFAULT_SYNTHETIC_BRAND, 'SYNTHETIC-extra': true }, 'SYNTHETIC-extra', 'unknown-field');
  reject({ ...DEFAULT_SYNTHETIC_BRAND, [Symbol('SYNTHETIC-extra')]: true }, '$symbol', 'unknown-field');
  const input = { ...DEFAULT_SYNTHETIC_BRAND };
  Object.defineProperty(input, 'labName', { get() { throw new Error('SYNTHETIC-getter must not run'); } });
  reject(input, 'labName', 'string');
});

test('colors require exactly six hexadecimal digits', () => {
  for (const field of ['primaryColor', 'accentColor']) {
    for (const value of ['#123', '123456', '#GG0000', '#12345678', ' #123456']) {
      reject({ ...DEFAULT_SYNTHETIC_BRAND, [field]: value }, field, 'color');
    }
  }
});

test('contrast math matches known pairs and is symmetric', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.ok(Math.abs(contrastRatio('#777777', '#FFFFFF') - 4.478089453577214) < 1e-12);
  assert.equal(contrastRatio('#FFFFFF', '#777777'), contrastRatio('#777777', '#FFFFFF'));
  assert.equal(contrastRatio('#123456', '#123456'), 1);
  assert.throws(() => contrastRatio('#fff', '#000000'), RangeError);
});

test('primary contrast uses the unrounded 4.5 threshold; accent has no threshold', () => {
  reject({ ...DEFAULT_SYNTHETIC_BRAND, primaryColor: '#777777' }, 'primaryColor', 'contrast');
  reject({ ...DEFAULT_SYNTHETIC_BRAND, primaryColor: '#FFFFFF' }, 'primaryColor', 'contrast');
  assert.ok(!(parseOHWorksBrand({ ...DEFAULT_SYNTHETIC_BRAND, primaryColor: '#767676', accentColor: '#ffffff' }) instanceof OHWorksBrandError));
});

test('rejects unsafe or unsupported logo paths', () => {
  for (const logoPath of ['/SYNTHETIC-logo.svg', '../SYNTHETIC-logo.svg', 'SYNTHETIC-assets/../SYNTHETIC-logo.png',
    'SYNTHETIC-..logo.svg', 'C:\\SYNTHETIC-logo.png', 'SYNTHETIC-assets\\SYNTHETIC-logo.png',
    'https://SYNTHETIC-example.invalid/SYNTHETIC-logo.svg', '//SYNTHETIC-logo.svg',
    'SYNTHETIC-logo.jpg', 'SYNTHETIC-logo.svg?x', 'SYNTHETIC-logo.svg#x',
    '%2e%2e/SYNTHETIC-logo.svg', 'SYNTHETIC-assets//SYNTHETIC-logo.png']) {
    reject({ ...DEFAULT_SYNTHETIC_BRAND, logoPath }, 'logoPath', 'path');
  }
});

test('rejects malformed support email', () => {
  for (const supportEmail of ['SYNTHETIC-invalid', 'SYNTHETIC-@', 'SYNTHETIC-a@@SYNTHETIC-example.invalid',
    'SYNTHETIC-a b@SYNTHETIC-example.invalid', 'SYNTHETIC-a..b@SYNTHETIC-example.invalid',
    'SYNTHETIC-a@-SYNTHETIC-example.invalid', 'SYNTHETIC-a@SYNTHETIC-example..invalid']) {
    reject({ ...DEFAULT_SYNTHETIC_BRAND, supportEmail }, 'supportEmail', 'email');
  }
});
