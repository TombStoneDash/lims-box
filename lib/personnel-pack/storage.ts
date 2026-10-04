import { createHash } from 'node:crypto';
import { GENERATED_PACK_KEY, PDF_SOURCE_SHA256, generatePersonnelPackPdf } from './pdf';

export interface PersonnelPackPdfArtifact {
  key: string;
  sourceSha256: string;
  sha256: string;
  bytes: Uint8Array;
}

export interface PersonnelPackPdfStore {
  read(key: string): Promise<PersonnelPackPdfArtifact | null>;
  /** Atomic first-writer wins. Never overwrite an artifact or customer record. */
  putIfAbsent(artifact: PersonnelPackPdfArtifact): Promise<void>;
}

interface PdfSqlClient {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/** Existing PostgreSQL storage, private to server code; no public URL or new provider. */
export function createPrismaPersonnelPackPdfStore(client: PdfSqlClient): PersonnelPackPdfStore {
  return {
    async read(key) {
      const rows = await client.$queryRaw<PersonnelPackPdfArtifact[]>`
        SELECT "key", "sourceSha256", "sha256", "bytes"
        FROM "PersonnelPackPdfArtifact" WHERE "key" = ${key}
      `;
      return rows[0] ?? null;
    },
    async putIfAbsent(artifact) {
      await client.$executeRaw`
        INSERT INTO "PersonnelPackPdfArtifact" ("key", "sourceSha256", "sha256", "bytes")
        VALUES (${artifact.key}, ${artifact.sourceSha256}, ${artifact.sha256}, ${Buffer.from(artifact.bytes)})
        ON CONFLICT ("key") DO NOTHING
      `;
    },
  };
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyPersonnelPackPdf(artifact: PersonnelPackPdfArtifact): Buffer {
  const bytes = Buffer.from(artifact.bytes);
  if (artifact.key !== GENERATED_PACK_KEY || artifact.sourceSha256 !== PDF_SOURCE_SHA256 ||
      bytes.length < 100 || bytes.length > 2_000_000 ||
      bytes.subarray(0, 5).toString() !== '%PDF-' || !bytes.subarray(-32).toString().includes('%%EOF') ||
      digest(bytes) !== artifact.sha256) {
    throw new Error('personnel_pack_pdf_integrity_failed');
  }
  return bytes;
}

/** Generate once per template version; every success is backed by verified durable bytes. */
export async function ensurePersonnelPackPdf(
  store: PersonnelPackPdfStore,
  generate: () => Promise<Buffer> = generatePersonnelPackPdf,
): Promise<Buffer> {
  const existing = await store.read(GENERATED_PACK_KEY);
  if (existing) return verifyPersonnelPackPdf(existing);
  const bytes = await generate();
  const artifact = { key: GENERATED_PACK_KEY, sourceSha256: PDF_SOURCE_SHA256, sha256: digest(bytes), bytes };
  verifyPersonnelPackPdf(artifact);
  await store.putIfAbsent(artifact);
  // Read back the winner even if another server wrote the same version concurrently.
  const persisted = await store.read(GENERATED_PACK_KEY);
  if (!persisted) throw new Error('personnel_pack_pdf_not_persisted');
  return verifyPersonnelPackPdf(persisted);
}
