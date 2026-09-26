// LIMS BOX first-contact dry run (Hermes spec AUTO_FIRST_CONTACT_SPEC_20260926.md,
// revision 3, section 2). The contact, early-access and waitlist routes log
// what the shared rule would decide. Read-only: nothing is sent or written,
// and it only runs when FIRST_CONTACT_EMAIL_ENABLED is set.
import { firstContactDryRun, normalizeEmail } from './first-contact';

// Applicant mail cannot go out until lims.bot is verified in Resend, so every
// LIMS first contact is a draft for Hudson until then (spec sections 2 and 5).
export const LIMS_SENDING_BLOCKER = 'LIMS_SENDING_DOMAIN_UNVERIFIED';

export interface LimsHistorySources {
  /** Earlier Prisma `prospect` rows (early access and waitlist). */
  countProspectsBefore: (email: string, before: Date) => Promise<number>;
  /** Earlier Supabase `limsbox_early_access` rows (contact form); null when Supabase is not configured. */
  countEarlyAccessBefore: ((email: string, before: Date) => Promise<number>) | null;
}

/**
 * True when the address appears in LIMS BOX's history before this request
 * started, so the request's own write is never mistaken for an earlier contact.
 * The sources are counted in parallel.
 */
export async function limsPriorContact(
  sources: LimsHistorySources,
  email: string,
  requestStartedAt: Date,
): Promise<boolean> {
  const address = normalizeEmail(email);
  const counts = await Promise.all([
    sources.countProspectsBefore(address, requestStartedAt),
    sources.countEarlyAccessBefore ? sources.countEarlyAccessBefore(address, requestStartedAt) : Promise.resolve(0),
  ]);
  return counts.some((count) => count > 0);
}

export function limsFirstContactDryRun(args: {
  endpoint: 'contact' | 'early-access' | 'waitlist';
  email: string;
  sources: () => LimsHistorySources;
  /** When the route started handling this request (before its own writes). */
  requestStartedAt: Date;
  /** The route already sent (or attempted) the applicant confirmation now (spec 1.5). */
  coveredByTransactional: boolean;
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
}): Promise<void> {
  return firstContactDryRun({
    product: 'lims',
    endpoint: args.endpoint,
    email: args.email,
    env: args.env ?? process.env,
    log: args.log,
    extraBlockers: [LIMS_SENDING_BLOCKER],
    lookupFacts: async () => ({
      knownOwnProduct: await limsPriorContact(args.sources(), args.email, args.requestStartedAt),
      coveredByTransactional: args.coveredByTransactional,
    }),
  });
}

// ilike treats % and _ as wildcards; escape them so the match is exact
// (case-insensitive, since older rows keep the case people typed).
const exactIlike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

interface CountingClient {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): {
      ilike(column: string, pattern: string): {
        lt(column: string, value: string): PromiseLike<{ count: number | null; error: unknown }>;
      };
    };
  };
}

/** Supabase count of earlier limsbox_early_access rows (read-only, head request). */
export function supabaseEarlyAccessCounter(client: CountingClient) {
  return async (email: string, before: Date): Promise<number> => {
    const { count, error } = await client
      .from('limsbox_early_access')
      .select('id', { count: 'exact', head: true })
      .ilike('email', exactIlike(email))
      .lt('created_at', before.toISOString());
    if (error) throw error;
    return count ?? 0;
  };
}

interface ProspectCounter {
  prospect: {
    count(args: { where: { email: { equals: string; mode: 'insensitive' }; createdAt: { lt: Date } } }): Promise<number>;
  };
}

/** Prisma count of earlier prospect rows (read-only). */
export function prismaProspectCounter(client: ProspectCounter) {
  return (email: string, before: Date): Promise<number> =>
    client.prospect.count({ where: { email: { equals: email, mode: 'insensitive' }, createdAt: { lt: before } } });
}
