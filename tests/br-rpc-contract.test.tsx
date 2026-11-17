// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let mockJoinError: { message: string } | null = null;

const fakeRoom = {
  id: '00000000-0000-0000-0000-000000000123',
  code: 'XYZ789',
  name: 'Dropzone Alpha',
  host_id: 'test-player-id',
  map_id: 'verdan_valley',
  mode: 'pvp_royale',
  max_players: 4,
  bot_count: 8,
  match_seed: 55555,
  status: 'waiting',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  finished_at: null,
};

const fakePlayers = [
  {
    id: 'p-row-1',
    room_id: fakeRoom.id,
    player_id: 'test-player-id',
    nickname: 'Tester',
    operator_id: 'vanguard',
    seat_index: 0,
    team_index: 0,
    is_host: true,
    is_ready: true,
    joined_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  },
];

vi.mock('@/lib/supabase', () => {
  const channelStub = {
    on: () => channelStub,
    subscribe: () => channelStub,
    send: async () => 'ok',
    track: async () => 'ok',
    untrack: async () => 'ok',
    presenceState: () => ({}),
  };

  const clientStub = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'create_br_room') {
        return { data: fakeRoom, error: null };
      }
      if (fn === 'join_br_room') {
        if (mockJoinError) {
          return { data: null, error: mockJoinError };
        }
        return { data: { room: fakeRoom, player: fakePlayers[0] }, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'br_rooms' ? fakeRoom : null,
            error: null,
          }),
          order: async () => ({
            data: table === 'br_players' ? fakePlayers : [],
            error: null,
          }),
        }),
      }),
    }),
    channel: () => channelStub,
    removeChannel: async () => 'ok',
  };

  return {
    getOrCreateAgentIdentity: () => ({
      playerId: 'test-player-id',
      nickname: 'Tester',
      operatorId: 'vanguard',
    }),
    saveAgentIdentity: () => {},
    getSupabaseClient: () => clientStub,
  };
});

import HomePage from '@/app/page';

describe('HomePage RPC Parameter Contract & WaitingRoom Flow', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    mockJoinError = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rooms: [], results: [] }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes exact create_br_room Postgres params and enters WaitingRoom', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    try {
      await act(async () => {
        root.render(React.createElement(HomePage));
      });

      const createBtn = Array.from(div.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create Multiplayer Lobby')
      );
      expect(createBtn).toBeTruthy();

      await act(async () => {
        createBtn!.click();
      });

      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0].fn).toBe('create_br_room');
      expect(Object.keys(rpcCalls[0].args).sort()).toEqual([
        'p_bot_count',
        'p_host_id',
        'p_map_id',
        'p_max_players',
        'p_mode',
        'p_name',
        'p_nickname',
        'p_operator_id',
      ]);
      expect(div.textContent).toContain('CODE: XYZ789');
    } finally {
      await act(async () => root.unmount());
      div.remove();
    }
  });

  it('surfaces real Supabase PostgREST error messages on failed join', async () => {
    mockJoinError = { message: 'Lobby not found' };
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    try {
      await act(async () => {
        root.render(React.createElement(HomePage));
      });

      const input = div.querySelector('input[placeholder="ROOM CODE"]') as HTMLInputElement;
      expect(input).toBeTruthy();

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'BAD999');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const joinBtn = Array.from(div.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Join'
      );
      expect(joinBtn).toBeTruthy();

      await act(async () => {
        joinBtn!.click();
      });

      expect(rpcCalls[0].fn).toBe('join_br_room');
      expect(Object.keys(rpcCalls[0].args).sort()).toEqual([
        'p_nickname',
        'p_operator_id',
        'p_player_id',
        'p_room_code',
      ]);
      expect(div.textContent).toContain('Lobby not found');
    } finally {
      await act(async () => root.unmount());
      div.remove();
    }
  });
});
