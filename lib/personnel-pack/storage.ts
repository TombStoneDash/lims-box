import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import type { PersonnelPackStorage } from './fulfillment';

// Use a pre-provisioned bucket. Request handlers never create buckets, change
// permissions or expose provider URLs. No filesystem fallback on serverless hosts.
export function createPersonnelPackStorage(
  client: () => SupabaseClient | null = getSupabase,
  bucketName = process.env.PERSONNEL_PACK_STORAGE_BUCKET || 'personnel-packs',
): PersonnelPackStorage {
  function bucket() {
    const supabase = client();
    if (!supabase) throw new Error('pdf_storage_unavailable');
    return supabase.storage.from(bucketName);
  }
  return {
    async read(key) {
      const { data, error } = await bucket().download(key);
      if (error) {
        if ('statusCode' in error && String(error.statusCode) === '404') return null;
        // Supabase Storage also uses a 400 response with a structured not-found code.
        if (error.statusCode === 'NoSuchKey') return null;
        throw new Error('pdf_storage_read_failed');
      }
      if (!data) throw new Error('pdf_storage_read_failed');
      return Buffer.from(await data.arrayBuffer());
    },
    async putIfAbsent(key, bytes) {
      const { error } = await bucket().upload(key, bytes, {
        contentType: 'application/pdf', upsert: false, cacheControl: '0',
      });
      if (!error) return true;
      if ('statusCode' in error && String(error.statusCode) === '409') return false;
      if (error.statusCode === 'Duplicate' || error.statusCode === 'ResourceAlreadyExists') return false;
      throw new Error('pdf_storage_write_failed');
    },
  };
}
