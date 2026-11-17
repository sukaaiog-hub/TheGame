import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { KartId } from '@/game/types';

let browserClient: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  browserClient = createClient(cfg.url, cfg.anonKey, {
    realtime: {
      params: {
        eventsPerSecond: 30,
      },
    },
  });
  return browserClient;
}

export interface PlayerIdentity {
  playerId: string;
  nickname: string;
  kartId: KartId;
}

const STORAGE_KEY = 'tuxkart_rush_identity_v1';

export function getOrCreatePlayerIdentity(): PlayerIdentity {
  if (typeof window === 'undefined') {
    return { playerId: 'ssr-player', nickname: 'TuxRacer', kartId: 'tux' };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (parsed.playerId && parsed.nickname) {
        return {
          playerId: parsed.playerId,
          nickname: parsed.nickname,
          kartId: parsed.kartId ?? 'tux',
        };
      }
    }
  } catch {
    // ignore storage parse issues
  }

  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;

  const identity: PlayerIdentity = {
    playerId: uuid,
    nickname: `Racer-${uuid.slice(0, 4).toUpperCase()}`,
    kartId: 'tux',
  };
  savePlayerIdentity(identity);
  return identity;
}

export function savePlayerIdentity(identity: PlayerIdentity): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore quota errors
  }
}
