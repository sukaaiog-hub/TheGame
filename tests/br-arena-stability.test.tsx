// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rendererLifecycle = vi.hoisted(() => ({
  constructions: 0,
}));

vi.mock('@/game/renderer', () => {
  class MockTopDownArenaRenderer {
    constructor() {
      rendererLifecycle.constructions += 1;
    }
    resize() {}
    addShake() {}
    screenToWorld(sx: number, sy: number) {
      return { x: sx, y: sy };
    }
    render() {}
  }
  return { TopDownArenaRenderer: MockTopDownArenaRenderer };
});

vi.mock('@/game/audio', () => {
  class MockBattleSoundEngine {
    unlock() {}
    setMuted() {}
    playWeaponShot() {}
    playHitmarker() {}
    playCrateBreak() {}
    playPickup() {}
    playExplosion() {}
    playDash() {}
    playCountdown() {}
    playElimination() {}
    playAirdropChime() {}
    dispose() {}
  }
  return { BattleSoundEngine: MockBattleSoundEngine };
});

import ArenaView from '@/components/ArenaView';
import type { BrPlayer, BrRoom } from '@/game/types';

const nowIso = new Date().toISOString();

const baseRoom: BrRoom = {
  id: 'room-stable-1',
  code: 'DROP99',
  name: 'Stability Test',
  host_id: 'p1',
  map_id: 'verdan_valley',
  mode: 'pvp_royale',
  max_players: 4,
  bot_count: 3,
  match_seed: 44444,
  status: 'active',
  created_at: nowIso,
  updated_at: nowIso,
  started_at: nowIso,
  finished_at: null,
};

const basePlayers: BrPlayer[] = [
  {
    id: 'row-1',
    room_id: 'room-stable-1',
    player_id: 'p1',
    nickname: 'HostOne',
    operator_id: 'vanguard',
    seat_index: 0,
    team_index: 0,
    is_host: true,
    is_ready: true,
    joined_at: nowIso,
    last_seen_at: nowIso,
  },
  {
    id: 'row-2',
    room_id: 'room-stable-1',
    player_id: 'p2',
    nickname: 'GuestTwo',
    operator_id: 'viper',
    seat_index: 1,
    team_index: 1,
    is_host: false,
    is_ready: true,
    joined_at: nowIso,
    last_seen_at: nowIso,
  },
];

describe('ArenaView Match Simulation Stability', () => {
  afterEach(() => {
    rendererLifecycle.constructions = 0;
  });

  it('does not tear down or reconstruct renderer when room/players/channel props update mid-match', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    // Mock 2d context on offscreen minimap canvas
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      act(() => {
        root.render(
          React.createElement(ArenaView, {
            room: baseRoom,
            players: basePlayers,
            localPlayerId: 'p1',
            isSolo: false,
            startAtEpochMs: Date.now() + 2000,
            channel: null,
            broadcastSubscribeTick: 0,
            onRegisterBroadcastHandler: () => {},
            onFinishMatch: async () => {},
            onPlayAgain: async () => {},
            onLeaveMatch: async () => {},
          })
        );
      });

      expect(rendererLifecycle.constructions).toBe(1);

      // Simulate mid-match DB poll returning cloned objects, changed startAt, and incremented channel tick
      act(() => {
        root.render(
          React.createElement(ArenaView, {
            room: { ...baseRoom, status: 'active' },
            players: basePlayers.map((p) => ({ ...p })),
            localPlayerId: 'p1',
            isSolo: false,
            startAtEpochMs: Date.now() + 1500,
            channel: null,
            broadcastSubscribeTick: 2,
            onRegisterBroadcastHandler: () => {},
            onFinishMatch: async () => {},
            onPlayAgain: async () => {},
            onLeaveMatch: async () => {},
          })
        );
      });

      // Must STILL be 1 construction — zero mid-match reset!
      expect(rendererLifecycle.constructions).toBe(1);

      act(() => {
        root.unmount();
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      div.remove();
    }
  });
});
