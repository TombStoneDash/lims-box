// Real read-only history sources for the LIMS first-contact dry run.
import { prisma } from '@/lib/prisma';
import { getSupabase } from '@/lib/supabase';
import { prismaProspectCounter, supabaseEarlyAccessCounter, type LimsHistorySources } from '@/lib/first-contact-lims';

export function limsHistorySources(): LimsHistorySources {
  const supabase = getSupabase();
  return {
    countProspectsBefore: prismaProspectCounter(prisma),
    countEarlyAccessBefore: supabase ? supabaseEarlyAccessCounter(supabase as never) : null,
  };
}
