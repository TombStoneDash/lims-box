export type LiaisonImportOptions = {
  /** Exact, case-sensitive assay codes. All configured assays expect numeric results. */
  serviceKeywordByAssayCode: Readonly<Record<string, string>>;
};

export type LiaisonResult = {
  sampleId: string;
  keyword: string;
  value: number;
  unit: string;
  flag: string;
  capturedAtIso: string;
  instrument: string;
};

export type LiaisonRejectionReason =
  | 'invalid-header' | 'malformed-record' | 'missing-sample-id'
  | 'unknown-assay-code' | 'non-numeric-value' | 'duplicate-sample-assay'
  | 'bad-timestamp' | 'missing-instrument-serial';

type RecordRow = { line: number; fields: string[]; malformed: boolean };
const HEADER = ['sample id', 'assay code', 'result value', 'unit', 'flag', 'run timestamp', 'instrument serial'];

/** Quoted delimiters, doubled quotes and embedded newlines are literal field content. */
function readRecords(text: string, delimiter: string): RecordRow[] {
  const rows: RecordRow[] = [];
  let fields: string[] = [];
  let field = '';
  let state: 'plain' | 'quoted' | 'closed' = 'plain';
  let malformed = false;
  let line = 1;
  let startLine = 1;
  const finish = () => {
    rows.push({ line: startLine, fields: [...fields, field], malformed });
    fields = [];
    field = '';
    malformed = false;
    state = 'plain';
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\n' && state !== 'quoted') {
      finish();
      line += 1;
      startLine = line;
    } else if (char === delimiter && state !== 'quoted') {
      fields.push(field);
      field = '';
      state = 'plain';
    } else if (char === '"') {
      if (state === 'quoted') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else state = 'closed';
      } else if (state === 'plain' && field === '') state = 'quoted';
      else malformed = true;
    } else {
      if (state === 'closed') malformed = true;
      field += char;
      if (char === '\n') line += 1;
    }
  }
  if (state === 'quoted') malformed = true;
  finish();
  // Ignore only trailing blank physical lines, never interior empty records.
  while (rows.length && !rows[rows.length - 1].malformed &&
    rows[rows.length - 1].fields.length === 1 && rows[rows.length - 1].fields[0] === '') rows.pop();
  return rows;
}

function timestampIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59 || zone === '-00:00')) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * Pure parser: no I/O, clock reads, inferred assay mappings or qualitative values.
 * Requires the seven named columns in order (header case/outer whitespace ignored).
 * Comma, tab or semicolon delimiter must be uniquely established by that header.
 * Rejections use 1-based physical record-start lines, including the header.
 * Every occurrence of a duplicated sample/assay pair is rejected, even if another
 * occurrence has an invalid value. Malformed quoting is never resynchronized by guessing.
 * Units/flags are passed through; an empty flag or unit is allowed without inference.
 * Timestamps require an explicit ISO timezone and at most millisecond precision.
 */
export function parseLiaisonExport(text: string, { serviceKeywordByAssayCode }: LiaisonImportOptions): {
  results: LiaisonResult[];
  rejected: { line: number; reason: LiaisonRejectionReason }[];
} {
  const results: LiaisonResult[] = [];
  const rejected: { line: number; reason: LiaisonRejectionReason }[] = [];
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const candidates = [',', '\t', ';'].map(delimiter => readRecords(normalized, delimiter))
    .filter(rows => rows[0] && !rows[0].malformed && rows[0].fields.length === HEADER.length &&
      rows[0].fields.every((field, index) => field.trim().toLowerCase() === HEADER[index]));
  if (candidates.length !== 1) return { results, rejected: [{ line: 1, reason: 'invalid-header' }] };
  const rows = candidates[0].slice(1);
  const counts = new Map<string, number>();
  const keyFor = (fields: string[]) => JSON.stringify([fields[0].trim(), fields[1].trim()]);
  for (const row of rows) {
    if (!row.malformed && row.fields.length === HEADER.length) {
      const key = keyFor(row.fields);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const row of rows) {
    const reject = (reason: LiaisonRejectionReason) => rejected.push({ line: row.line, reason });
    if (row.malformed || row.fields.length !== HEADER.length || row.fields.some(field => field.includes('\r'))) {
      reject('malformed-record'); continue;
    }
    const [sampleId, assay, valueText, unit, flag, timestamp, instrument] = row.fields.map(field => field.trim());
    if (!sampleId) { reject('missing-sample-id'); continue; }
    if ((counts.get(keyFor(row.fields)) ?? 0) > 1) { reject('duplicate-sample-assay'); continue; }
    const keyword = Object.prototype.hasOwnProperty.call(serviceKeywordByAssayCode, assay)
      ? serviceKeywordByAssayCode[assay] : undefined;
    if (typeof keyword !== 'string' || !keyword.trim()) { reject('unknown-assay-code'); continue; }
    const value = Number(valueText);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(valueText) || !Number.isFinite(value) ||
      (value === 0 && /[1-9]/.test(valueText.split(/[eE]/)[0]))) {
      reject('non-numeric-value'); continue;
    }
    const capturedAtIso = timestampIso(timestamp);
    if (!capturedAtIso) { reject('bad-timestamp'); continue; }
    if (!instrument) { reject('missing-instrument-serial'); continue; }
    results.push({ sampleId, keyword, value, unit, flag, capturedAtIso, instrument });
  }
  return { results, rejected };
}
