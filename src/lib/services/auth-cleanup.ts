import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
/** Use only with the ID returned from a newly successful create/invite call. */
export async function cleanupNewAuthUser(client:SupabaseClient,userId:string,ownerId:string) {
 const {error}=await client.rpc('discard_unused_invited_cleaner',{target_user:userId,expected_owner:ownerId});
 if(error){console.error('[new-account-cleanup] payee',error);return false;}
 const result=await client.auth.admin.deleteUser(userId);
 if(result.error){console.error('[new-account-cleanup] auth',result.error);return false;}
 return true;
}
