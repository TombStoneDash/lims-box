// Server-side, read-only loader for a locally supplied lims-knowledge bundle.
// Set LIMS_FOUNDER_KNOWLEDGE_DIR to its root (MANIFEST.tsv + SOURCES.tsv +
// redacted/). Unset/missing/invalid input yields no founder answers. There is
// no download, recursive scan, original/text fallback, write, or paid path.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { CorpusEntry } from './corpus';
import { filterCommercialClaims } from './output-claims-filter';
import { EVIDENCE_MISSING_ANSWER, type BotResponse } from './engine';
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
// markers appear. Only the explicitly approved, admitted file inventory is
// eligible; the legacy public corpus additionally admits only FOUNDER_EXCERPTS.
const SENSITIVE_DOCUMENT = /\b(?:ssn|social\s+security|genetic|genomic|ancestry|23andme|aamc|date\s+of\s+birth|dob|references)\b|\b\d{3}[-\s]\d{2}[-\s]\d{4}\b|\b\d{9,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i;

/** Shared admission gate; never read originals or unlisted files. */
function verifiedFounderDocuments(root: string | undefined): string[] {
  if (!root) return [];
  try {
    if (lstatSync(root).isSymbolicLink()) return [];
    const bundleRoot = realpathSync(root);
    const decode = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const manifest = parseTsv<FounderManifestRow>(
      decode(readBundleFile(bundleRoot, 'MANIFEST.tsv', MAX_METADATA_BYTES)),
      ['path', 'sha256', 'size', 'origin', 'source_location', 'added'], 'path',
    );
    const sourceBytes = readBundleFile(bundleRoot, FOUNDER_SOURCES_PATH, MAX_METADATA_BYTES);
    const sourceManifest = manifest.find((record) => record.path === FOUNDER_SOURCES_PATH);
    if (!sourceManifest || sourceManifest.origin !== 'HT_ORIGINAL'
      || sourceBytes.length !== Number(sourceManifest.size)
      || createHash('sha256').update(sourceBytes).digest('hex') !== sourceManifest.sha256.toLowerCase()) return [];
    const sources = parseTsv<FounderSourceRow>(
      decode(sourceBytes),
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

/** Existing public excerpt pages retain their narrow publication boundary. */
export function loadFounderCorpus(root = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const admittedPassages = new Set<string>();
  for (const text of verifiedFounderDocuments(root)) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    for (const excerpt of FOUNDER_EXCERPTS) {
      if (admittedPassages.has(excerpt.id) || !normalized.includes(excerpt.text)) continue;
      const answer = `Founder archive (historical experience): ${excerpt.text}`;
      if (filterCommercialClaims(`${excerpt.title} ${answer}`).blocked) continue;
      entries.push({
        id: `founder-${excerpt.id}`, title: excerpt.title,
        source: `${FOUNDER_CITATION_PREFIX}founder-${excerpt.id}#${excerpt.id}`,
        keywords: [...excerpt.keywords], text: answer,
      });
      admittedPassages.add(excerpt.id);
    }
  }
  return entries;
}

export interface FounderFact {
  id: string;
  title: string;
  text: string;
  source: string;
}

/**
 * The approved inventory is every paragraph in the merged, eligible files.
 * Blank lines delimit complete passages; never split a passage by length.
 * Whitespace normalization is for identity only; answers preserve source text.
 * This index lives for one request, so holds/deletion revoke it immediately.
 */
export function loadFounderFactIndex(root = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR): FounderFact[] {
  const facts = new Map<string, FounderFact>();
  for (const document of verifiedFounderDocuments(root)) {
    for (const paragraph of document.split(/\r?\n[^\S\r\n]*\r?\n(?:[^\S\r\n]*\r?\n)*/)) {
      const text = paragraph.trim();
      if (!text) continue;
      const normalized = text.replace(/\s+/g, ' ');
      if (facts.has(normalized)) continue;
      // Public passage identity, never a private document hash or source alias.
      const id = `founder-fact-${createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`;
      facts.set(normalized, {
        id, title: `${normalized.slice(0, 100)} [${id}]`, text,
        source: `${FOUNDER_CITATION_PREFIX}${id}#fact`,
      });
    }
  }
  return [...facts.values()];
}

/** Exact whole-question forms; a matching name inside other text is not evidence. */
export function founderFactQuestions(fact: FounderFact): string[] {
  return [
    `What does the founder archive say about "${fact.title}"?`,
    `Show founder fact ${fact.id}.`,
  ];
}

export function askFounderArchive(question: string): BotResponse | null {
  if (!/\b(?:founder|hudson|hud|taylor)\b/i.test(question)) return null;
  const matches = loadFounderFactIndex().filter((fact) =>
    founderFactQuestions(fact).includes(question));
  if (matches.length !== 1) {
    return { answer: EVIDENCE_MISSING_ANSWER, grounded: false, sources: [] };
  }
  const fact = matches[0];
  return {
    answer: `Founder archive (historical experience): ${fact.text}`,
    grounded: true,
    sources: [{ title: fact.title, path: fact.source }],
  };
}
