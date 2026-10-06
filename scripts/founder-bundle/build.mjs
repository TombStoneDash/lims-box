import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MAX_DOCUMENT = 256 * 1024;
const intake = '15_HT_FOUNDER_INTAKE';
const added = '2026-09-25T17:24:12Z';
const tsv = (keys, rows) => `${keys.join('\t')}\n${rows.map((row) => keys.map((key) => row[key] ?? '').join('\t')).join('\n')}\n`;

// This token inventory is a manual review of the hash-pinned input collection,
// including single-name mentions, inverted names and publication authors. Hashes
// avoid adding a new plaintext directory of third parties to the repository.
// Changed source bytes still require admission AND a fresh name review.
const privateNames = new Set(JSON.parse(readFileSync(path.join(here, 'private-name-tokens.json'), 'utf8')));

// Label-based identifiers include short and alphanumeric values. Remove the
// remainder of an identifier line, including wrapped values, conservatively.
export const IDENTIFIER = /\b(?:AMCAS|AAMC|SSN|social\s+security|date\s+of\s+birth|DOB|passport|MRN|NPI|EIN)\b[^\r\n\u2028]*(?:\r?\n[ \t]*[A-Z]*-?\d[\w-]*)?|(?:\b(?:application|account|member|policy|licen[cs]e|case|reference|ID|No\.)(?:[ \t]+(?:number|no\.?|ID))*[ \t]*(?:[:#=–—-][ \t]*)?(?:\r?\n[ \t]*)?|#\s*(?:(?:ID|number|No\.)\s*)?(?:[:#=–—-]\s*)?)(?:[A-Z]*-?\d[\w./-]*|[A-Z]{2,}(?=[ \t]*(?:$|[.,;])))[^\r\n\u2028]*/gim;

// Review/hold status is preserved separately; redaction never promotes a hold.
export function redact(text) {
  return text
    .normalize('NFKC')
    .replace(IDENTIFIER, '[PRIVATE IDENTIFIER REDACTED]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[EMAIL REDACTED]')
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '[URL REDACTED]')
    .replace(/\b(?:SSN|social\s+security|AAMC(?:\s+ID)?|date\s+of\s+birth|DOB)\s*[:#-]?[^\r\n\u2028]*/gi, '[PRIVATE IDENTIFIER REDACTED]')
    .replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, '[PRIVATE IDENTIFIER REDACTED]')
    .replace(/\+\d{1,3}[ .-](?:\(?\d{1,4}\)?[ .-]){1,4}\d{2,4}\b/g, '[PHONE REDACTED]')
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE REDACTED]')
    .replace(/\bP\.?\s*O\.?\s*Box\s+\d+\b/gi, '[POSTAL ADDRESS REDACTED]')
    .replace(/\b\d{1,6}[A-Z]?(?:-\d{1,6}[A-Z]?)?\s+(?:[\w.'’-]+\s+){0,7}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl|terrace|ter|parkway|pkwy|highway|hwy)\b\.?\s*(?:(?:apt|suite|ste|unit|#)\.?\s*[\w-]+)?/gi, '[STREET REDACTED]')
    .replace(/\b[A-Z]{2},?\s+\d{5}(?:-\d{4})?\b/g, '[STATEZIP REDACTED]')
    .replace(/\b\d{5}-\d{4}\b/g, '[POSTAL CODE REDACTED]')
    .replace(/\d{6,}/g, '[PRIVATE IDENTIFIER REDACTED]')
    .replace(/\p{L}+/gu, (token) => privateNames.has(sha(token.toLowerCase())) ? '[PERSON REDACTED]' : token)
    .replace(/[ \t]+$/gm, '');
}

const sensitive = /\b(?:ssn|social\s+security|genetic|genomic|ancestry|23andme|aamc|amcas|date\s+of\s+birth|dob|references)\b|\b\d{3}[-\s]\d{2}[-\s]\d{4}\b|\d{6,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i;

export function build(input, output) {
  // A fresh output prevents stale documents surviving a later source hold.
  if (path.resolve(input) === path.resolve(output)) throw new Error('output_is_input');
  if (lstatSafe(output) && (lstatSync(output).isSymbolicLink() || readdirSync(output).length)) throw new Error('output_must_be_empty');
  const bytes = readFileSync(path.join(input, 'MANIFEST.tsv'));
  if (sha(bytes) !== '70e594a87dc3849e64085fce87bfb25b4d802f9016ff569351e863f2e5fe9904') throw new Error('unreviewed_ingest_manifest');
  const [header, ...lines] = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  const rows = lines.map((line) => Object.fromEntries(header.split('\t').map((key, i) => [key, line.split('\t')[i]])));
  const policy = JSON.parse(readFileSync(path.join(here, 'admission.json'), 'utf8'));
  if (rows.length !== 117 || policy.length !== 117) throw new Error('incomplete_inventory');
  const files = new Map();
  const sources = [];
  const manifest = [];
  const skips = [];
  for (const row of rows) {
    const approved = policy.find((entry) => entry.alias === row.alias && entry.sha256 === row.sha256);
    if (!approved) throw new Error('unreviewed_source');
    const source = { alias: row.alias, status: approved.status, sha256: row.sha256, redacted: '', bot_status: approved.bot_status };
    sources.push(source);
    let reason = source.status !== 'INTEGRATED' ? source.status : source.bot_status !== 'REDACTED_CANDIDATE' ? source.bot_status : '';
    if (!reason) {
      if (row.text !== `text/${row.sha256}.txt`) throw new Error('invalid_text_path');
      const file = path.join(input, row.text);
      if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) throw new Error('invalid_input_file');
      if (lstatSync(file).size > MAX_DOCUMENT) reason = 'OVERSIZE_256_KIB';
      else {
        const raw = readFileSync(file);
        if (sha(raw) !== approved.textSha256) throw new Error('changed_extracted_text');
        const text = redact(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        const redacted = Buffer.from(text);
        if (!text.trim() || text.includes('\uFFFD') || text.includes('\0') || sensitive.test(text)) reason = 'RESIDUAL_SENSITIVE_OR_INVALID_TEXT';
        else if (redacted.length > MAX_DOCUMENT) reason = 'OVERSIZE_256_KIB';
        else {
          source.redacted = `${intake}/redacted/${row.sha256}.txt`;
          files.set(source.redacted, redacted);
          manifest.push({ path: source.redacted, sha256: sha(redacted), size: redacted.length, origin: 'HT_ORIGINAL', source_location: `derived:contact-redaction of sha256:${row.sha256}`, added });
        }
      }
    }
    if (reason) {
      skips.push({ alias: row.alias, reason });
      if (source.bot_status === 'REDACTED_CANDIDATE') source.bot_status = 'REDACTED_NEEDS_HUMAN_REVIEW';
    }
  }
  const sourceBytes = Buffer.from(tsv(['alias', 'status', 'sha256', 'redacted', 'bot_status'], sources));
  files.set(`${intake}/SOURCES.tsv`, sourceBytes);
  manifest.push({ path: `${intake}/SOURCES.tsv`, sha256: sha(sourceBytes), size: sourceBytes.length, origin: 'HT_ORIGINAL', source_location: 'derived:founder-source-map', added });
  files.set('MANIFEST.tsv', Buffer.from(tsv(['path', 'sha256', 'size', 'origin', 'source_location', 'added'], manifest)));
  const report = { inputRows: rows.length, documents: manifest.length - 1, skips };
  files.set('BUILD_REPORT.json', Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
  if ([...files.values()].reduce((total, value) => total + value.length, 0) >= 20 * 1024 * 1024) throw new Error('bundle_over_20_mib');
  for (const [relative, content] of files) {
    const target = path.join(output, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, { flag: 'wx' });
  }
  return report;
}

function lstatSafe(file) {
  try { return lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/founder-bundle/build.mjs INGEST_DIR [EMPTY_OUTPUT_DIR]');
  console.log(JSON.stringify(build(path.resolve(process.argv[2]), path.resolve(process.argv[3] ?? 'knowledge/founder')), null, 2));
}
