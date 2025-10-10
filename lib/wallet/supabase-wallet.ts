// Утилиты для интеграции Supabase с Web3-авторизацией
import { createClient } from '@supabase/supabase-js';
import type { WalletUser } from '@/types/wallet';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getUserByWallet(wallet_address: string): Promise<WalletUser | null> {
  const { data, error } = await supabase
    .from('User')
    .select('*')
    .eq('wallet_address', wallet_address)
    .single();
  if (error) return null;
  return data as WalletUser;
}

export async function updateNonce(userId: string, nonce: string, expires_at: string) {
  return supabase
    .from('User')
    .update({ nonce, nonce_expires_at: expires_at })
    .eq('id', userId);
}

export async function createOrUpdateWalletUser(wallet_address: string, chain: string): Promise<WalletUser> {
  // Можно расширить под мультичейн, сейчас только address
  const { data, error } = await supabase
    .from('User')
    .upsert({
      wallet_address,
      auth_type: 'wallet',
    }, { onConflict: 'wallet_address' })
    .select()
    .single();
  if (error || !data) throw error;
  return data as WalletUser;
}
