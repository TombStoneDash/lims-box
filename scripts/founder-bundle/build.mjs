import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFounderText, redactFounderNames } from '../../lib/bot/founder-privacy.mjs';

import { parseFounderAllowlist, readConfinedFile } from '../../lib/bot/founder-document-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MAX_DOCUMENT = 256 * 1024;
const intake = '16_FOUNDER_PUBLIC';
const added = '2026-10-06T00:00:00Z';
const tsv = (keys, rows) => `${keys.join('\t')}\n${rows.map((row) => keys.map((key) => row[key] ?? '').join('\t')).join('\n')}\n`;

// Label-based identifiers include short and alphanumeric values. Remove the
// remainder of an identifier line, including wrapped values, conservatively.
export const IDENTIFIER = /\b(?:AMCAS|AAMC|SSN|social\s+security|date\s+of\s+birth|DOB|passport|MRN|NPI|EIN)\b[^\r\n\u2028]*(?:\r?\n[ \t]*[A-Z]*-?\d[\w-]*)?|(?:\b(?:application|account|member|policy|licen[cs]e|case|reference|ID|No\.)(?:[ \t]+(?:number|no\.?|ID))*[ \t]*(?:[:#=–—-][ \t]*)?(?:\r?\n[ \t]*)?|#\s*(?:(?:ID|number|No\.)\s*)?(?:[:#=–—-]\s*)?)(?:[A-Z]*-?\d[\w./-]*|[A-Z]{2,}(?=[ \t]*(?:$|[.,;])))[^\r\n\u2028]*/gim;

// Review/hold status is preserved separately; redaction never promotes a hold.
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

export function build(input, output, allowlistFile = path.join(here, 'ALLOWLIST.txt')) {
  if (path.resolve(input) === path.resolve(output)) throw new Error('output_is_input');
  if (lstatSafe(output) && (lstatSync(output).isSymbolicLink() || readdirSync(output).length)) throw new Error('output_must_be_empty');
  const policyBytes = readFileSync(allowlistFile);
  const entries = parseFounderAllowlist(policyBytes.toString('utf8'));
  const files = new Map();
  const sources = [];
  const manifest = [];
  const paragraphs = [];
  // Iterate ONLY reviewed paths. Never enumerate the ingest or salvage paragraphs.
  for (const [i, entry] of entries.entries()) {
    const raw = readConfinedFile(input, entry.source, MAX_DOCUMENT);
    if (sha(raw) !== entry.sha256) throw new Error('changed_approved_source');
    const original = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    const text = redact(original);
    if (!text.trim() || text.includes('\0') || text.includes('\uFFFD')) throw new Error('invalid_approved_text');
    const redacted = Buffer.from(text);
    if (redacted.length > MAX_DOCUMENT) throw new Error('oversize_approved_redaction');
    if (sha(redacted) !== entry.redactedSha256) throw new Error('changed_approved_redaction');
    const relative = intake + '/redacted/' + entry.sha256 + '.txt';
    files.set(relative, redacted);
    sources.push({ alias: 'FLI-' + String(i + 2).padStart(3, '0'), status: 'INTEGRATED', sha256: entry.sha256, redacted: relative, bot_status: 'REDACTED_CANDIDATE' });
    manifest.push({ path: relative, sha256: sha(redacted), size: redacted.length, origin: 'HT_ORIGINAL', source_location: 'derived:contact-redaction of sha256:' + entry.sha256, added });
    paragraphs.push(...text.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean));
  }
  const sourceBytes = Buffer.from(tsv(['alias', 'status', 'sha256', 'redacted', 'bot_status'], sources));
  files.set(intake + '/SOURCES.tsv', sourceBytes);
  manifest.push({ path: intake + '/SOURCES.tsv', sha256: sha(sourceBytes), size: sourceBytes.length, origin: 'HT_ORIGINAL', source_location: 'derived:founder-source-map', added });
  files.set('MANIFEST.tsv', Buffer.from(tsv(['path', 'sha256', 'size', 'origin', 'source_location', 'added'], manifest)));
  const report = { documents: entries.length, paragraphs: paragraphs.length, distinctParagraphs: new Set(paragraphs.map(p => p.replace(/\s+/g, ' '))).size, allowlistSha256: sha(policyBytes), excludedFolder: '15_HT_FOUNDER_INTAKE' };
  files.set('BUILD_REPORT.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
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
  if (!process.argv[2]) throw new Error('Usage: node scripts/founder-bundle/build.mjs EVIDENCE_ROOT [EMPTY_OUTPUT_DIR]');
  console.log(JSON.stringify(build(path.resolve(process.argv[2]), path.resolve(process.argv[3] ?? 'knowledge/founder')), null, 2));
}
