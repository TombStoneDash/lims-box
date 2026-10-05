// Server-side, read-only loader for a locally supplied lims-knowledge bundle.
// Set LIMS_FOUNDER_KNOWLEDGE_DIR to its root (MANIFEST.tsv + SOURCES.tsv +
// redacted/). Unset/missing/invalid input yields no founder answers. There is
// no download, recursive scan, original/text fallback, write, or paid path.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { CorpusEntry } from './corpus';
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
// markers appear. Privacy does not depend on this regex being exhaustive:
// only the exact, reviewed FOUNDER_EXCERPTS may enter the answer corpus.
const SENSITIVE_DOCUMENT = /\b(?:ssn|social\s+security|genetic|genomic|ancestry|23andme|aamc|date\s+of\s+birth|dob|references)\b|\b\d{3}[-\s]\d{2}[-\s]\d{4}\b|\b\d{9,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i;

/** Re-read on each founder request so a hold/removal takes effect immediately. */
export function loadFounderCorpus(root = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR): CorpusEntry[] {
  if (!root) return [];
  try {
    const bundleRoot = realpathSync(root);
    const manifest = parseTsv<FounderManifestRow>(
      readBundleFile(bundleRoot, 'MANIFEST.tsv', MAX_METADATA_BYTES).toString('utf8'),
      ['path', 'sha256', 'size', 'origin', 'source_location', 'added'], 'path',
    );
    const sourceBytes = readBundleFile(bundleRoot, FOUNDER_SOURCES_PATH, MAX_METADATA_BYTES);
    const sourceManifest = manifest.find((record) => record.path === FOUNDER_SOURCES_PATH);
    if (!sourceManifest || sourceManifest.origin !== 'HT_ORIGINAL'
      || sourceBytes.length !== Number(sourceManifest.size)
      || createHash('sha256').update(sourceBytes).digest('hex') !== sourceManifest.sha256.toLowerCase()) return [];
    const sources = parseTsv<FounderSourceRow>(
      sourceBytes.toString('utf8'),
      ['alias', 'status', 'sha256', 'redacted', 'bot_status'], 'alias',
    );
    const entries: CorpusEntry[] = [];
    const admittedPassages = new Set<string>();
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
  } catch {
    // No document, private path, parser input, or identifier enters logs.
    return [];
  }
}
