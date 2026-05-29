/**
 * Personnel Pack v1.5 — shared utilities
 * ISO 15189 clause 6.2 extension helpers
 */

/** Standardised error JSON shape for all personnel-pack API routes. */
export function apiError(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  status = 400
): Response {
  return Response.json({ error: { code, message, details } }, { status });
}

/** Cursor-paginated response envelope. */
export function pagedResponse<T extends { id: string }>(
  data: T[],
  limit: number
): Response {
  const hasMore = data.length === limit;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  return Response.json({ data, pagination: { next_cursor: nextCursor, has_more: hasMore } });
}

/** Parse `?limit` and `?cursor` from a URL. */
export function parsePagination(url: URL): { limit: number; cursor: string | null } {
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const cursor = url.searchParams.get("cursor") ?? null;
  return { limit, cursor };
}

/** Version number format: "1.0", "2.3", etc. */
export const VERSION_NUMBER_RE = /^\d+\.\d+$/;

/** Allowed review types. */
export const REVIEW_TYPES = [
  "initial",
  "six_month",
  "annual",
  "corrective_action",
  "ad_hoc",
] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

/** Allowed review outcomes. */
export const REVIEW_OUTCOMES = [
  "competent",
  "requires_remediation",
  "restricted",
  "suspended",
] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/**
 * Calculate the default next review due date from the review date.
 * Spec: calculated from `reviewedAt`, NOT from prior `nextReviewDue`.
 */
export function calcNextReviewDue(reviewType: ReviewType, reviewedAt: Date): Date | null {
  const d = new Date(reviewedAt);
  switch (reviewType) {
    case "initial":
    case "six_month":
      d.setMonth(d.getMonth() + 6);
      return d;
    case "annual":
      d.setFullYear(d.getFullYear() + 1);
      return d;
    case "corrective_action":
      d.setMonth(d.getMonth() + 3);
      return d;
    case "ad_hoc":
      return null;
  }
}

/** Human-readable label for review types. */
export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  initial: "Initial",
  six_month: "6-Month",
  annual: "Annual",
  corrective_action: "Corrective Action",
  ad_hoc: "Ad Hoc",
};

/** Human-readable label for review outcomes. */
export const REVIEW_OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  competent: "Competent",
  requires_remediation: "Requires Remediation",
  restricted: "Restricted",
  suspended: "Suspended",
};
