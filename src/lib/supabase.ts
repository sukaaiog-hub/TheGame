import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { OperatorId } from '@/game/types';

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
        eventsPerSecond: 35,
      },
    },
  });
  return browserClient;
}

export interface AgentIdentity {
  playerId: string;
  nickname: string;
  operatorId: OperatorId;
}

const STORAGE_KEY = 'dropzone_royale_identity_v1';

export function getOrCreateAgentIdentity(): AgentIdentity {
  if (typeof window === 'undefined') {
    return { playerId: 'ssr-agent', nickname: 'Agent-01', operatorId: 'vanguard' };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentIdentity>;
      if (parsed.playerId && parsed.nickname) {
        return {
          playerId: parsed.playerId,
          nickname: parsed.nickname,
          operatorId: parsed.operatorId ?? 'vanguard',
        };
      }
    }
  } catch {
    // ignore storage errors
  }

  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;

  const identity: AgentIdentity = {
    playerId: uuid,
    nickname: `Agent-${uuid.slice(0, 4).toUpperCase()}`,
    operatorId: 'vanguard',
  };
  saveAgentIdentity(identity);
  return identity;
}

export function saveAgentIdentity(identity: AgentIdentity): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore quota errors
  }
}
