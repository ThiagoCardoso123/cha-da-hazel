import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Area } from './types';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Endereço público usado no QR Code (cai no endereço atual se não configurado). */
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/+$/, '');

export const PHOTO_BUCKET = 'hazel-photos';

let client: SupabaseClient | null = null;

/**
 * Cada área guarda a própria sessão. Assim o mesmo celular pode ser
 * convidado em "/" e pai/mãe em "/admin" sem um derrubar o outro.
 */
export function initClient(area: Area): void {
  if (!configured || client) return;
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storageKey: `hazel-${area}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

export function sb(): SupabaseClient {
  if (!client) throw new Error('Supabase não configurado');
  return client;
}
