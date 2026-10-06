// Server-side, read-only loader for a locally supplied lims-knowledge bundle.
// Set LIMS_FOUNDER_KNOWLEDGE_DIR to its root (MANIFEST.tsv + SOURCES.tsv +
// redacted/). Unset/missing/invalid input yields no founder answers. There is
// no download, recursive scan, original/text fallback, write, or paid path.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { CorpusEntry } from './corpus';
import { EVIDENCE_MISSING_ANSWER, type BotResponse } from './engine';
import { filterCommercialClaims } from './output-claims-filter';
import {
  admitFounderSource,
  FOUNDER_EXCERPTS,
  FOUNDER_REDACTED_PATH,
  FOUNDER_SOURCES_PATH,
  type FounderManifestRow,
  type FounderSourceRow,
} from './source-registry';

const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 256 * 1024;
export const FOUNDER_CITATION_PREFIX = '/bot/sources/';

function readBundleFile(root: string, relative: string, maxBytes: number): Buffer {
  // Metadata uses fixed names; document names must pass the registry's strict
  // hash-path grammar. Reject links at every component, including directories.
  let file = root;
  for (const component of relative.split('/')) {
    if (!component || component === '.' || component === '..' || component.includes('\\')) throw new Error('invalid_path');
    file = path.join(file, component);
    if (lstatSync(file).isSymbolicLink()) throw new Error('symlink');
  }
  if (!realpathSync(file).startsWith(`${root}${path.sep}`)) throw new Error('outside_bundle');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('invalid_file');
    const bytes = readFileSync(fd);
    if (bytes.length > maxBytes) throw new Error('oversize');
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function parseTsv<T>(text: string, required: string[], uniqueKey: string): T[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headers = (lines.shift() ?? '').split('\t');
  if (new Set(headers).size !== headers.length || required.some((key) => !headers.includes(key))) {
    throw new Error('invalid_headers');
  }
  const seen = new Set<string>();
  return lines.filter((line) => line.length > 0).map((line) => {
    const values = line.split('\t');
    if (values.length !== headers.length) throw new Error('invalid_row');
    const row = Object.fromEntries(headers.map((key, index) => [key, values[index]]));
    if (!row[uniqueKey] || seen.has(row[uniqueKey])) throw new Error('ambiguous_row');
    seen.add(row[uniqueKey]);
    return row as T;
  });
}

// Defense in depth: reject an entire candidate if these residual sensitive
// markers appear. The legacy corpus remains excerpt-only; the founder-only
// index uses the task-approved paragraph scope after the same admission checks.
const SENSITIVE_DOCUMENT = /\b(?:ssn|social\s+security|genetic|genomic|ancestry|23andme|aamc|date\s+of\s+birth|dob|references)\b|\b\d{3}[-\s]\d{2}[-\s]\d{4}\b|\b\d{9,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i;

/** Re-read on each founder request so a hold/removal takes effect immediately. */
function loadVerifiedDocuments(root: string | undefined): string[] {
  if (!root) return [];
  try {
    if (lstatSync(root).isSymbolicLink()) return [];
    const bundleRoot = realpathSync(root);
    const manifest = parseTsv<FounderManifestRow>(
      new TextDecoder('utf-8', { fatal: true }).decode(readBundleFile(bundleRoot, 'MANIFEST.tsv', MAX_METADATA_BYTES)),
      ['path', 'sha256', 'size', 'origin', 'source_location', 'added'], 'path',
    );
    const sourceBytes = readBundleFile(bundleRoot, FOUNDER_SOURCES_PATH, MAX_METADATA_BYTES);
    const sourceManifest = manifest.find((record) => record.path === FOUNDER_SOURCES_PATH);
    if (!sourceManifest || sourceManifest.origin !== 'HT_ORIGINAL'
      || sourceBytes.length !== Number(sourceManifest.size)
      || createHash('sha256').update(sourceBytes).digest('hex') !== sourceManifest.sha256.toLowerCase()) return [];
    const sources = parseTsv<FounderSourceRow>(
      new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes),
      ['alias', 'status', 'sha256', 'redacted', 'bot_status'], 'alias',
    );
    const documents: string[] = [];
    for (const record of manifest) {
      if (!FOUNDER_REDACTED_PATH.test(record.path)) continue;
      const matching = sources.filter((source) => source.redacted === record.path);
      // Conflicting aliases (including a hold) cannot be resolved by row order.
      if (matching.length !== 1 || !admitFounderSource(record, matching[0])) continue;
      const size = Number(record.size);
      if (!Number.isSafeInteger(size) || size > MAX_DOCUMENT_BYTES) continue;
      let bytes: Buffer;
      try {
        bytes = readBundleFile(bundleRoot, record.path, MAX_DOCUMENT_BYTES);
      } catch {
        continue;
      }
      if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== record.sha256.toLowerCase()) continue;
      const text = bytes.toString('utf8');
      if (text.includes('\uFFFD') || SENSITIVE_DOCUMENT.test(text)) continue;
      documents.push(text);
    }
    return documents;
  } catch {
    // No document, private path, parser input, or identifier enters logs.
    return [];
  }
}

/** Legacy public citations retain their reviewed excerpt boundary. */
export function loadFounderCorpus(root = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const admittedPassages = new Set<string>();
  for (const text of loadVerifiedDocuments(root)) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    for (const excerpt of FOUNDER_EXCERPTS) {
      if (admittedPassages.has(excerpt.id) || !normalized.includes(excerpt.text)) continue;
      const answer = `Founder archive (historical experience): ${excerpt.text}`;
      if (filterCommercialClaims(`${excerpt.title} ${answer}`).blocked) continue;
      entries.push({
        id: `founder-${excerpt.id}`,
        title: excerpt.title,
        // Public IDs identify reviewed passages, never private documents.
        source: `${FOUNDER_CITATION_PREFIX}founder-${excerpt.id}#${excerpt.id}`,
        keywords: [...excerpt.keywords],
        text: answer,
      });
      admittedPassages.add(excerpt.id);
    }
  }
  return entries;
}

/** Request-local index of complete approved paragraphs; no persistent cache. */
export function loadFounderIndex(root = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR): CorpusEntry[] {
  const passages = new Map<string, CorpusEntry>();
  for (const document of loadVerifiedDocuments(root)) {
    for (const paragraph of document.split(/\r?\n[ \t]*\r?\n/).filter((p) => p.trim().length > 0)) {
      const normalized = paragraph.replace(/\s+/g, ' ').trim();
      if (passages.has(normalized)) continue;
      // Public fact identity is derived from passage content, never a file hash.
      const token = createHash('sha256').update(normalized).digest('hex')
        .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
      const id = `founder-fact-${token}`;
      const title = normalized.split(/(?<=[.!?])\s/)[0].slice(0, 160);
      const text = `Founder archive (historical experience): ${paragraph}`;
      if (filterCommercialClaims(`${title} ${text}`).blocked) continue;
      passages.set(normalized, { id, title, text, keywords: [],
        source: `${FOUNDER_CITATION_PREFIX}${id}#${id}` });
    }
  }
  return [...passages.values()];
}

/** Named questions only: no scoring, inference, generation or user interpolation. */
export function askFounderQuestion(question: string): BotResponse {
  const refusal: BotResponse = { answer: EVIDENCE_MISSING_ANSWER, grounded: false, sources: [] };
  const match = /^(?:What is the founder fact|Tell me about the founder fact|Quote the founder fact) "([^"\r\n]+)"[?.]?$/i.exec(question.trim());
  if (!match) return refusal;
  const name = match[1].toLowerCase();
  const matches = loadFounderIndex().filter((entry) =>
    entry.id.toLowerCase() === name || entry.title.toLowerCase() === name);
  if (matches.length !== 1) return refusal;
  const entry = matches[0];
  return { answer: entry.text, grounded: true, sources: [{ title: entry.title, path: entry.source }] };
}
