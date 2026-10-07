// Server-side, read-only loader for a locally supplied lims-knowledge bundle.
// Set LIMS_FOUNDER_KNOWLEDGE_DIR to its root (MANIFEST.tsv + SOURCES.tsv +
// redacted/). Unset uses the shipped bundle; missing/invalid yields no answers. There is
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
const founderBundleRoot = () => process.env.LIMS_FOUNDER_KNOWLEDGE_DIR ?? path.join(process.cwd(), 'knowledge/founder');
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
const SENSITIVE_DOCUMENT = /\b(?:ssn|social\s+security|genetic|genomic|ancestry|23andme|aamc|amcas|date\s+of\s+birth|dob|references)\b|\b\d{3}[-\s]\d{2}[-\s]\d{4}\b|\d{6,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i;

export interface FounderBundleDiagnostics {
  root: string;
  exists: boolean;
  manifestRows: number;
  sourcesRows: number;
  documents: number;
  error: string | null;
}

// Shared across route bundles in the same Node process. Never log parser input,
// document content, or arbitrary exception messages.
const failureLogged = Symbol.for('lims.founderBundle.failureLogged');
const bundleReasons = new Set([
  'invalid_path', 'symlink', 'outside_bundle', 'invalid_file', 'oversize',
  'invalid_headers', 'invalid_row', 'ambiguous_row', 'sources_integrity',
  'document_integrity', 'document_rejected',
]);

/** Shared admission gate; never read originals or unlisted files. */
function readFounderBundle(root: string) {
  const diagnostics: FounderBundleDiagnostics = {
    root: path.resolve(root), exists: false, manifestRows: 0, sourcesRows: 0, documents: 0, error: null,
  };
  let file = '.';
  const fail = (error: unknown) => {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const reason = error instanceof Error && bundleReasons.has(error.message) ? error.message
      : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        && /^E[A-Z]+$/.test(error.code) ? error.code : 'load_failed';
    diagnostics.error ??= `${file}: ${name} (${reason})`;
    const state = globalThis as typeof globalThis & { [failureLogged]?: boolean };
    if (!state[failureLogged]) {
      state[failureLogged] = true;
      console.error(`[founder-bundle] ${JSON.stringify({ root: diagnostics.root, file, name, reason })}`);
    }
  };
  try {
    // The deployment root may itself be a symlink (or have symlinked parents).
    // Canonicalize once; readBundleFile still rejects every link below this root.
    const bundleRoot = realpathSync(diagnostics.root);
    diagnostics.exists = true;
    file = 'MANIFEST.tsv';
    const decode = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const manifest = parseTsv<FounderManifestRow>(
      decode(readBundleFile(bundleRoot, 'MANIFEST.tsv', MAX_METADATA_BYTES)),
      ['path', 'sha256', 'size', 'origin', 'source_location', 'added'], 'path',
    );
    diagnostics.manifestRows = manifest.length;
    file = FOUNDER_SOURCES_PATH;
    const sourceBytes = readBundleFile(bundleRoot, FOUNDER_SOURCES_PATH, MAX_METADATA_BYTES);
    const sourceManifest = manifest.find((record) => record.path === FOUNDER_SOURCES_PATH);
    if (!sourceManifest || sourceManifest.origin !== 'HT_ORIGINAL'
      || sourceBytes.length !== Number(sourceManifest.size)
      || createHash('sha256').update(sourceBytes).digest('hex') !== sourceManifest.sha256.toLowerCase()) throw new Error('sources_integrity');
    const sources = parseTsv<FounderSourceRow>(
      decode(sourceBytes),
      ['alias', 'status', 'sha256', 'redacted', 'bot_status'], 'alias',
    );
    diagnostics.sourcesRows = sources.length;
    const documents: string[] = [];
    for (const record of manifest) {
      if (!FOUNDER_REDACTED_PATH.test(record.path)) continue;
      const matching = sources.filter((source) => source.redacted === record.path);
      // Conflicting aliases (including a hold) cannot be resolved by row order.
      if (matching.length !== 1 || !admitFounderSource(record, matching[0])) continue;
      const size = Number(record.size);
      if (!Number.isSafeInteger(size) || size > MAX_DOCUMENT_BYTES) continue;
      file = record.path;
      let bytes: Buffer;
      try {
        bytes = readBundleFile(bundleRoot, record.path, MAX_DOCUMENT_BYTES);
      } catch (error) {
        fail(error);
        continue;
      }
      if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== record.sha256.toLowerCase()) {
        fail(new Error('document_integrity'));
        continue;
      }
      const text = bytes.toString('utf8');
      if (text.includes('\uFFFD') || SENSITIVE_DOCUMENT.test(text)) {
        fail(new Error('document_rejected'));
        continue;
      }
      documents.push(text);
    }
    diagnostics.documents = documents.length;
    return { documents, diagnostics };
  } catch (error) {
    fail(error);
    return { documents: [], diagnostics };
  }
}

/** Read-only snapshot using the same admission checks as answers. */
export function getFounderBundleDiagnostics(root = founderBundleRoot()): FounderBundleDiagnostics {
  return readFounderBundle(root).diagnostics;
}

/** Existing public excerpt pages retain their narrow publication boundary. */
export function loadFounderCorpus(root = founderBundleRoot()): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const admittedPassages = new Set<string>();
  for (const text of readFounderBundle(root).documents) {
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
export function loadFounderFactIndex(root = founderBundleRoot()): FounderFact[] {
  const facts = new Map<string, FounderFact>();
  for (const document of readFounderBundle(root).documents) {
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

const CAREER_QUERIES: Record<string, string> = {
  "what is hudson taylor's experience with laboratory information systems": 'Hudson Taylor reports roughly 15 years building and operating LIMS',
  'where was hudson a senior lims developer': '| Employer / Institution |',
  'what instrument interface did hudson build': '**Instrument interface engineering.**',
};
const careerPassage = (question: string) => CAREER_QUERIES[
  question.trim().toLowerCase().replace(/’/g, "'").replace(/\?$/, '')
];

/** Keep the general bot's existing product/bio routing outside reviewed career asks. */
export function askFounderCareer(question: string): BotResponse | null {
  return careerPassage(question) ? askFounderArchive(question) : null;
}

export function askFounderArchive(question: string): BotResponse | null {
  if (!/\b(?:founder|hudson|hud|taylor)\b/i.test(question)) return null;
  // Reviewed whole-question intents map to complete admitted passages. No
  // keyword fallback: private questions and appended instructions still refuse.
  const passage = careerPassage(question);
  const matches = loadFounderFactIndex().filter((fact) =>
    founderFactQuestions(fact).includes(question) || (passage && fact.text.startsWith(passage)));
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
