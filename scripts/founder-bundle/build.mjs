import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFounderText, redactFounderNames } from '../../lib/bot/founder-privacy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MAX_DOCUMENT = 256 * 1024;
const approvedDirectory = 'approved';
const added = '2026-10-06T00:00:00Z';
const tsv = (keys, rows) => `${keys.join('\t')}\n${rows.map((row) => keys.map((key) => row[key] ?? '').join('\t')).join('\n')}\n`;

// Label-based identifiers include short and alphanumeric values. Remove the
// remainder of an identifier line, including wrapped values, conservatively.
export const IDENTIFIER = /\b(?:AMCAS|AAMC|SSN|social\s+security|date\s+of\s+birth|DOB|passport|MRN|NPI|EIN)\b[^\r\n\u2028]*(?:\r?\n[ \t]*[A-Z]*-?\d[\w-]*)?|(?:\b(?:application|account|member|policy|licen[cs]e|case|reference|ID|No\.)(?:[ \t]+(?:number|no\.?|ID))*[ \t]*(?:[:#=–—-][ \t]*)?(?:\r?\n[ \t]*)?|#\s*(?:(?:ID|number|No\.)\s*)?(?:[:#=–—-]\s*)?)(?:[A-Z]*-?\d[\w./-]*|[A-Z]{2,}(?=[ \t]*(?:$|[.,;])))[^\r\n\u2028]*/gim;

// Secondary redaction cannot authorize a document outside the allow-list.
export function redact(text) {
  return redactFounderNames(normalizeFounderText(text)
    .replace(IDENTIFIER, '[private identifier redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email redacted]')
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '[url redacted]')
    .replace(/\b(?:SSN|social\s+security|AAMC(?:\s+ID)?|date\s+of\s+birth|DOB)\s*[:#-]?[^\r\n\u2028]*/gi, '[private identifier redacted]')
    .replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, '[private identifier redacted]')
    .replace(/\+\d{1,3}[ .-](?:\(?\d{1,4}\)?[ .-]){1,4}\d{2,4}\b/g, '[phone redacted]')
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone redacted]')
    .replace(/\bP\.?\s*O\.?\s*Box\s+\d+\b/gi, '[postal address redacted]')
    .replace(/\b\d{1,6}[A-Z]?(?:-\d{1,6}[A-Z]?)?\s+(?:[\w.'’-]+\s+){0,7}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl|terrace|ter|parkway|pkwy|highway|hwy)\b\.?\s*(?:(?:apt|suite|ste|unit|#)\.?\s*[\w-]+)?/gi, '[street redacted]')
    .replace(/\b[A-Z]{2},?\s+\d{5}(?:-\d{4})?\b/g, '[statezip redacted]')
    .replace(/\b\d{5}-\d{4}\b/g, '[postal code redacted]')
    .replace(/\d{6,}/g, '[private identifier redacted]')
    .replace(/[ \t]+$/gm, ''));
}

const sensitive = /\b(?:ssn|social\s+security|genetic|genomic|ancestry|23andme|aamc|amcas|date\s+of\s+birth|dob|references)\b|\b\d{3}[-\s]\d{2}[-\s]\d{4}\b|\d{6,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i;

export function parseAllowlist(text) {
  const paths = text.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!paths.length || new Set(paths).size !== paths.length) throw new Error('invalid_allowlist');
  for (const relative of paths) {
    if (path.isAbsolute(relative) || /[*?\[\]{}]/.test(relative) || relative.split('/').some((part) =>
      !part || part === '.' || part === '..' || part.toUpperCase() === '15_HT_FOUNDER_INTAKE' || part.includes('\\')))
      throw new Error('forbidden_source_path');
  }
  return paths;
}

export function build(input, output) {
  // A fresh output prevents stale documents surviving a later source hold.
  if (path.resolve(input) === path.resolve(output)) throw new Error('output_is_input');
  if (lstatSafe(output) && (lstatSync(output).isSymbolicLink() || readdirSync(output).length)) throw new Error('output_must_be_empty');
  // The allow-list is the complete input inventory. Never scan an input tree.
  const paths = parseAllowlist(readFileSync(path.join(here, 'ALLOWLIST.txt'), 'utf8'));
  const policy = JSON.parse(readFileSync(path.join(here, 'admission.json'), 'utf8'));
  if (!paths.length || new Set(paths).size !== paths.length || policy.length !== paths.length
    || policy.some((entry) => !paths.includes(entry.path))) throw new Error('invalid_allowlist');
  const files = new Map();
  const sources = [];
  const manifest = [];
  const paragraphs = [];
  for (const relative of paths) {
    const approved = policy.find((entry) => entry.path === relative);
    let file = path.resolve(input);
    if (lstatSync(file).isSymbolicLink()) throw new Error('invalid_input_root');
    for (const part of relative.split('/')) {
      file = path.join(file, part);
      if (lstatSync(file).isSymbolicLink()) throw new Error('invalid_input_file');
    }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_DOCUMENT) throw new Error('invalid_input_file');
    const raw = readFileSync(file);
    if (sha(raw) !== approved.sha256) throw new Error('changed_allowlisted_source');
    const original = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    // Admission was decided by whole-document review, not by content filters.
    const text = redact(original);
    const redacted = Buffer.from(text);
    if (!text.trim() || text.includes('\uFFFD') || text.includes('\0') || sensitive.test(text)
      || redacted.length > MAX_DOCUMENT) throw new Error('invalid_redacted_source');
    if (sha(redacted) !== approved.redactedSha256) throw new Error('changed_reviewed_output');
    const source = { alias: approved.alias, status: 'INTEGRATED', sha256: approved.sha256,
      redacted: `${approvedDirectory}/redacted/${approved.sha256}.txt`, bot_status: 'REDACTED_CANDIDATE' };
    sources.push(source);
    files.set(source.redacted, redacted);
    manifest.push({ path: source.redacted, sha256: sha(redacted), size: redacted.length,
      origin: 'HT_ORIGINAL', source_location: `derived:contact-redaction of sha256:${source.sha256}`, added });
    paragraphs.push(...text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
  }
  const sourceBytes = Buffer.from(tsv(['alias', 'status', 'sha256', 'redacted', 'bot_status'], sources));
  files.set(`${approvedDirectory}/SOURCES.tsv`, sourceBytes);
  manifest.push({ path: `${approvedDirectory}/SOURCES.tsv`, sha256: sha(sourceBytes), size: sourceBytes.length, origin: 'HT_ORIGINAL', source_location: 'derived:founder-source-map', added });
  files.set('MANIFEST.tsv', Buffer.from(tsv(['path', 'sha256', 'size', 'origin', 'source_location', 'added'], manifest)));
  const report = { documents: sources.length, paragraphOccurrences: paragraphs.length,
    distinctParagraphs: new Set(paragraphs.map((p) => p.replace(/\s+/g, ' '))).size,
    selection: 'ALLOWLIST_ONLY', excludedTrees: ['15_HT_FOUNDER_INTAKE'],
    unlistedSources: 'EXCLUDED' };
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
  if (!process.argv[2]) throw new Error('Usage: node scripts/founder-bundle/build.mjs SOURCE_ROOT [EMPTY_OUTPUT_DIR]');
  console.log(JSON.stringify(build(path.resolve(process.argv[2]), path.resolve(process.argv[3] ?? 'knowledge/founder')), null, 2));
}
