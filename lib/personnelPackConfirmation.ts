/**
 * Personnel Pack confirmation download contract (issue #94).
 *
 * Pure, dependency-injected mapping from an already-validated accreditation
 * selection to the data a confirmation template needs. It does not decide
 * which selections are supported (that stays PR #127's asset registry via
 * the injected lookup), does not track attempt/retry state (PR #115), does
 * not implement a claim flow (PR #124), does not judge selection validity
 * (PR #129), and does not manage form UI states (PR #130). It also never
 * takes an applicant identity, so there is nothing PII to leak.
 */

export interface PersonnelPackConfirmationAsset {
  readonly approved: boolean;
  readonly downloadUrl: string;
  readonly packLabel: string;
}

/** Caller-supplied lookup for the (already-registered) asset behind a selection. Rejections and thrown errors both fail closed. */
export type PersonnelPackAssetLookup = (
  selection: string,
) => Promise<PersonnelPackConfirmationAsset | null>;

export interface PersonnelPackDownloadConfirmation {
  readonly kind: 'automatic-download';
  readonly packLabel: string;
  readonly downloadUrl: string;
}

export type PersonnelPackManualFulfillmentReason =
  | 'unknown_selection'
  | 'asset_lookup_failed'
  | 'asset_not_approved'
  | 'asset_url_invalid';

export interface PersonnelPackManualFulfillmentConfirmation {
  readonly kind: 'manual-fulfillment';
  readonly reason: PersonnelPackManualFulfillmentReason;
}

export type PersonnelPackConfirmationTemplateData =
  | PersonnelPackDownloadConfirmation
  | PersonnelPackManualFulfillmentConfirmation;

const ALLOWED_DOWNLOAD_URL_PROTOCOLS = new Set(['https:', 'http:']);

/** A "working" download URL: parses cleanly and uses a fetchable protocol. Never treats a string as a URL by regex alone. */
function isWorkingDownloadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return ALLOWED_DOWNLOAD_URL_PROTOCOLS.has(parsed.protocol);
}

function manualFulfillment(
  reason: PersonnelPackManualFulfillmentReason,
): PersonnelPackManualFulfillmentConfirmation {
  return { kind: 'manual-fulfillment', reason };
}

/**
 * Resolves confirmation template data for a validated accreditation selection.
 * Returns an automatic-download outcome only when the injected lookup reports a
 * configured, approved asset with a working URL; every other path (unknown
 * selection, lookup error, unapproved asset, malformed URL) fails closed to a
 * typed manual-fulfillment outcome instead of throwing or guessing.
 */
export async function resolvePersonnelPackConfirmation(
  selection: string | null | undefined,
  lookupAsset: PersonnelPackAssetLookup,
): Promise<PersonnelPackConfirmationTemplateData> {
  const trimmedSelection = typeof selection === 'string' ? selection.trim() : '';
  if (trimmedSelection.length === 0) {
    return manualFulfillment('unknown_selection');
  }

  let asset: PersonnelPackConfirmationAsset | null;
  try {
    asset = await lookupAsset(trimmedSelection);
  } catch {
    return manualFulfillment('asset_lookup_failed');
  }

  if (!asset) {
    return manualFulfillment('unknown_selection');
  }

  if (!asset.approved) {
    return manualFulfillment('asset_not_approved');
  }

  if (!isWorkingDownloadUrl(asset.downloadUrl)) {
    return manualFulfillment('asset_url_invalid');
  }

  return {
    kind: 'automatic-download',
    packLabel: asset.packLabel,
    downloadUrl: asset.downloadUrl,
  };
}
