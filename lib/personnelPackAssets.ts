/**
 * Personnel Pack asset registry boundary.
 *
 * A strict, dependency-injected lookup from a supported accreditation selection to its
 * approved, non-secret asset metadata (label + public URL). The caller always supplies the
 * asset map explicitly — this module never imports or hardcodes one — so the set of
 * "supported" selections is controlled entirely by whatever map the caller injects, and this
 * boundary stays testable without touching real fulfillment wiring.
 *
 * Lookup failures return a fixed reason code, never the raw input, so a request cannot use
 * this path to smuggle applicant-supplied text into logs or error responses.
 */

export interface PersonnelPackAssetMetadata {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

export type PersonnelPackAssetMap = Readonly<Record<string, PersonnelPackAssetMetadata>>;

export type PersonnelPackAssetLookupFailureReason =
  | 'missing_selection'
  | 'malformed_selection'
  | 'unknown_selection';

export type PersonnelPackAssetLookupResult =
  | { readonly ok: true; readonly asset: PersonnelPackAssetMetadata }
  | { readonly ok: false; readonly reason: PersonnelPackAssetLookupFailureReason };

const SELECTION_MAX_LENGTH = 64;
const SELECTION_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Accreditation selections are short fixed tokens (e.g. "iso15189"), never free text. */
export function normalizePersonnelPackSelection(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > SELECTION_MAX_LENGTH) return null;
  const normalized = trimmed.toLowerCase();
  if (!SELECTION_PATTERN.test(normalized)) return null;
  return normalized;
}

/**
 * Resolves a raw accreditation selection against an injected asset map. Returns the approved
 * asset metadata on success, or a fixed failure reason on any other outcome — the raw
 * `selection` value is never included in the result.
 */
export function resolvePersonnelPackAsset(
  selection: unknown,
  assets: PersonnelPackAssetMap,
): PersonnelPackAssetLookupResult {
  if (selection === null || selection === undefined || selection === '') {
    return { ok: false, reason: 'missing_selection' };
  }
  if (typeof selection === 'string' && selection.trim().length === 0) {
    return { ok: false, reason: 'missing_selection' };
  }

  const normalized = normalizePersonnelPackSelection(selection);
  if (!normalized) {
    return { ok: false, reason: 'malformed_selection' };
  }

  if (!Object.prototype.hasOwnProperty.call(assets, normalized)) {
    return { ok: false, reason: 'unknown_selection' };
  }

  return { ok: true, asset: assets[normalized] };
}
