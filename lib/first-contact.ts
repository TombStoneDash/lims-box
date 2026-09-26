// Automatic first-contact email: shared decision logic, ported from
// trashalert-web src/lib/first-contact.ts (#767, #768) (Hermes spec
// outbox/reviews/AUTO_FIRST_CONTACT_SPEC_20260926.md, revision 3).
//
// This build is DRY-RUN ONLY. There is no sender here and nothing is written
// to the database: callers get a decision and a log line keyed by an HMAC of
// the normalized address, never the address itself. Sending needs, per the
// spec, the flag on, FIRST_CONTACT_SCOPE set by Hudson's decision, the HMAC key,
// approved copy, and a first_contact_log table (DDL, Main) that this build
// does not create.
import { createHmac } from 'node:crypto'

export type FirstContactScope = 'per-product' | 'cross-product'
export type FirstContactMode = 'off' | 'dry-run'

export interface FirstContactConfig {
  mode: FirstContactMode
  /** Null until Hudson's decision is recorded; neither scope is ever assumed. */
  scope: FirstContactScope | null
  hmacKey: string | null
  /** Why sending is not possible yet (always non-empty in this build). */
  blockers: string[]
}

export function readFirstContactConfig(env: Record<string, string | undefined>): FirstContactConfig {
  const flag = (env.FIRST_CONTACT_EMAIL_ENABLED ?? '').trim().toLowerCase()
  const rawScope = (env.FIRST_CONTACT_SCOPE ?? '').trim()
  const scope: FirstContactScope | null =
    rawScope === 'per-product' || rawScope === 'cross-product' ? rawScope : null
  const hmacKey = (env.FIRST_CONTACT_HMAC_KEY ?? '').trim() || null
  const blockers = ['SEND_NOT_BUILT']
  if (!scope) blockers.push('SCOPE_UNSET')
  if (!hmacKey) blockers.push('HMAC_KEY_MISSING')
  // Any non-empty flag value turns on the dry-run log only.
  const mode: FirstContactMode = flag && flag !== 'false' && flag !== '0' && flag !== 'off' ? 'dry-run' : 'off'
  if (mode === 'off') blockers.unshift('FLAG_OFF')
  return { mode, scope, hmacKey, blockers }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** HMAC-SHA-256 of the normalized address (spec 4b); null without a key. */
export function emailHmac(email: string, key: string | null): string | null {
  if (!key) return null
  return createHmac('sha256', key).update(normalizeEmail(email), 'utf8').digest('hex')
}

export interface FirstContactFacts {
  /** A first-contact row for this product already exists. */
  alreadyLogged: boolean
  /** Hit on the notable-people list (spec 3.2). */
  notable: boolean
  /** Earlier contact with this same product (spec 3.1 item 1). */
  knownOwnProduct: boolean
  /** Earlier first contact from another product (spec 3.1 item 2). */
  knownOtherProduct: boolean
  /** On Hudson's known-correspondents list (spec 3.1 item 3). */
  knownCorrespondent: boolean
  /** A transactional email (for example double opt-in) already goes out now (spec 1.5). */
  coveredByTransactional: boolean
}

export type FirstContactDecision =
  | 'already_logged'
  | 'draft_for_hudson'
  | 'skipped_known'
  | 'covered_by_transactional'
  | 'would_send'

/** Spec section 1, step 3, for one scope. */
export function decideFirstContact(facts: FirstContactFacts, scope: FirstContactScope): FirstContactDecision {
  if (facts.alreadyLogged) return 'already_logged'
  if (facts.notable) return 'draft_for_hudson'
  const known = facts.knownOwnProduct || facts.knownCorrespondent ||
    (scope === 'cross-product' && facts.knownOtherProduct)
  if (known) return 'skipped_known'
  if (facts.coveredByTransactional) return 'covered_by_transactional'
  return 'would_send'
}

/** With the scope unset, report both outcomes instead of assuming one. */
export function decideForConfiguredScope(facts: FirstContactFacts, scope: FirstContactScope | null) {
  return scope
    ? { scope, decision: decideFirstContact(facts, scope) }
    : {
        scope: 'unset' as const,
        perProduct: decideFirstContact(facts, 'per-product'),
        crossProduct: decideFirstContact(facts, 'cross-product'),
      }
}

// ---- Send results and retries (spec 4a) ---------------------------------

export type SendOutcome = 'sent' | 'failed' | 'unresolved' | 'permanent'

/**
 * Classify a provider result. `status` is the HTTP status when the provider
 * answered; `transportError` is set when there was no usable answer.
 */
export function classifySendResult(result: {
  messageId?: string | null
  status?: number | null
  errorName?: string | null
  transportError?: boolean
}): SendOutcome {
  if (result.messageId) return 'sent'
  if (result.transportError || result.status == null) return 'unresolved'
  if (result.status >= 500) return 'unresolved'
  const name = (result.errorName ?? '').toLowerCase()
  if (/invalid_to|invalid_recipient|suppress|bounce/.test(name)) return 'permanent'
  // 408 (request timeout) and 409 (a concurrent request with the same
  // idempotency key) do not prove the email was refused: treat as unclear.
  if (result.status === 408 || result.status === 409) return 'unresolved'
  if (result.status === 429 || (result.status >= 400 && result.status < 500)) return 'failed'
  return 'unresolved'
}

export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000
export const MAX_ATTEMPTS = 3

export type RetryAction = 'none' | 'wait' | 'retry' | 'resolve_delivery' | 'draft_for_hudson'

/** What the retry job may do with a log row. Unclear rows are never resent. */
export function nextRetryAction(
  row: { outcome: string; attempts: number; updatedAt: string },
  now: Date,
): RetryAction {
  const age = now.getTime() - new Date(row.updatedAt).getTime()
  switch (row.outcome) {
    case 'failed':
      if (row.attempts >= MAX_ATTEMPTS) return 'draft_for_hudson'
      // Inside the window a retry may only return the cached first response.
      return age >= IDEMPOTENCY_WINDOW_MS ? 'retry' : 'wait'
    case 'pending':
      return age >= IDEMPOTENCY_WINDOW_MS ? 'resolve_delivery' : 'wait'
    case 'unresolved':
      return 'resolve_delivery'
    case 'permanent':
      return 'draft_for_hudson'
    default:
      return 'none'
  }
}

// ---- Dry-run hook for inbound routes ------------------------------------

export interface DryRunInput {
  product: string
  endpoint: string
  email: string
  env: Record<string, string | undefined>
  /** Read-only facts lookup; only called when the dry-run log is on. */
  lookupFacts: () => Promise<Partial<FirstContactFacts>>
  log?: (line: string) => void
  /** Upper bound on the lookup so a signup response is never held up for long. */
  timeoutMs?: number
  /** Product-specific reasons sending is not possible yet (appended to the config's). */
  extraBlockers?: string[]
}

export const DRY_RUN_LOOKUP_TIMEOUT_MS = 1500
const LOOKUP_TIMED_OUT = Symbol('lookup timed out')

/**
 * Logs one decision line and never throws, sends or writes. With the flag off
 * it returns immediately without calling lookupFacts (no extra queries).
 */
export async function firstContactDryRun(input: DryRunInput): Promise<void> {
  const config = readFirstContactConfig(input.env)
  if (config.mode === 'off') return
  const log = input.log ?? ((line: string) => console.log(line))
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<typeof LOOKUP_TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(LOOKUP_TIMED_OUT), input.timeoutMs ?? DRY_RUN_LOOKUP_TIMEOUT_MS)
    })
    const found = await Promise.race([input.lookupFacts(), timeout])
    if (found === LOOKUP_TIMED_OUT) {
      log(JSON.stringify({ event: 'first_contact_dry_run_timeout', product: input.product, endpoint: input.endpoint }))
      return
    }
    const facts: FirstContactFacts = {
      alreadyLogged: false,
      notable: false,
      knownOwnProduct: false,
      knownOtherProduct: false,
      knownCorrespondent: false,
      coveredByTransactional: false,
      ...found,
    }
    log(JSON.stringify({
      event: 'first_contact_dry_run',
      product: input.product,
      endpoint: input.endpoint,
      email_hmac: emailHmac(input.email, config.hmacKey),
      ...decideForConfiguredScope(facts, config.scope),
      blockers: [...config.blockers, ...(input.extraBlockers ?? [])],
    }))
  } catch {
    log(JSON.stringify({ event: 'first_contact_dry_run_error', product: input.product, endpoint: input.endpoint }))
  } finally {
    if (timer) clearTimeout(timer)
  }
}
