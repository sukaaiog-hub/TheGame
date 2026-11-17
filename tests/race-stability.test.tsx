// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyPlayer, LobbyRoom, MultiplayerBroadcast, RacerState } from '@/game/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rendererStats = {
  constructions: 0,
  disposals: 0,
  lastRacers: [] as RacerState[],
};

vi.mock('@/game/renderer', () => {
  return {
    KartSceneRenderer: class MockRenderer {
      constructor() {
        rendererStats.constructions += 1;
      }
      renderFrame(racers: RacerState[]) {
        rendererStats.lastRacers = racers.map((r) => ({ ...r }));
      }
      toggleCameraMode() {
        return false;
      }
      dispose() {
        rendererStats.disposals += 1;
      }
    },
  };
});

vi.mock('@/game/audio', () => {
  return {
    SoundEngine: class MockSound {
      unlock() {}
      setMuted() {}
      playCountdownBeep() {}
      playBoost() {}
      playLap() {}
      playHit() {}
      playItemPickup() {}
      playProjectileFire() {}
      updateEngine() {}
      dispose() {}
    },
  };
});

import RaceView from '@/components/RaceView';

function makeRoom(overrides: Partial<LobbyRoom> = {}): LobbyRoom {
  return {
    id: 'room-multi-1',
    code: 'RACE99',
    name: '2 Player Test Room',
    host_id: 'p1',
    track_id: 'lighthouse_bay',
    laps: 3,
    max_players: 2,
    ai_fill: false,
    status: 'countdown',
    created_at: '2026-11-16T10:00:00.000Z',
    updated_at: '2026-11-16T10:00:00.000Z',
    started_at: '2026-11-16T10:00:03.400Z',
    finished_at: null,
    ...overrides,
  };
}

function makePlayers(): LobbyPlayer[] {
  return [
    {
      id: 'rp-1',
      room_id: 'room-multi-1',
      player_id: 'p1',
      nickname: 'PlayerOne',
      kart_id: 'tux',
      seat_index: 0,
      is_host: true,
      is_ready: true,
      joined_at: '2026-11-16T10:00:00.000Z',
      last_seen_at: '2026-11-16T10:00:00.000Z',
    },
    {
      id: 'rp-2',
      room_id: 'room-multi-1',
      player_id: 'p2',
      nickname: 'PlayerTwo',
      kart_id: 'wilber',
      seat_index: 1,
      is_host: false,
      is_ready: true,
      joined_at: '2026-11-16T10:00:01.000Z',
      last_seen_at: '2026-11-16T10:00:01.000Z',
    },
  ];
}

describe('RaceView Multiplayer Mid-Race Stability', () => {
  let rafQueue: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let perfNowValue: number;

  beforeEach(() => {
    rendererStats.constructions = 0;
    rendererStats.disposals = 0;
    rendererStats.lastRacers = [];
    rafQueue = new Map();
    nextRafId = 1;
    perfNowValue = 1000;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.spyOn(performance, 'now').mockImplementation(() => perfNowValue);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafQueue.set(id, cb);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      rafQueue.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stepFrames(count: number, stepMs = 40) {
    for (let i = 0; i < count; i++) {
      perfNowValue += stepMs;
      const callbacks = Array.from(rafQueue.entries());
      rafQueue.clear();
      for (const [, cb] of callbacks) {
        cb(perfNowValue);
      }
    }
  }

  it('never resets karts back to start when room/players/host props refresh mid-race', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const channelRef = { current: null } as React.MutableRefObject<null>;
    const incomingBroadcastRef = {
      current: null,
    } as React.MutableRefObject<((msg: MultiplayerBroadcast) => void) | null>;

    // Start time in the past so local kart can immediately drive
    const startAt = Date.now() - 500;
    const initialRoom = makeRoom();
    const initialPlayers = makePlayers();

    act(() => {
      root.render(
        <RaceView
          key={initialRoom.id}
          room={initialRoom}
          players={initialPlayers}
          localPlayerId="p1"
          startAtEpochMs={startAt}
          channelRef={channelRef}
          incomingBroadcastRef={incomingBroadcastRef}
          onRematch={async () => {}}
          onLeaveRoom={async () => {}}
        />
      );
    });

    expect(rendererStats.constructions).toBe(1);
    expect(rendererStats.disposals).toBe(0);

    // Record initial starting position on frame 1
    act(() => {
      stepFrames(1, 16);
    });
    const startZ = rendererStats.lastRacers.find((r) => r.id === 'p1')!.z;

    // Hold throttle & drive forward for ~2 seconds of simulated frames
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      stepFrames(50, 40);
    });

    const drivenZ = rendererStats.lastRacers.find((r) => r.id === 'p1')!.z;
    expect(drivenZ).toBeGreaterThan(startZ + 20);

    // Simulate multiple 4s DB refresh snapshots arriving mid-race with brand new object refs,
    // shifted startAtEpochMs, updated_at timestamps, and even a host_id migration
    act(() => {
      root.render(
        <RaceView
          key={initialRoom.id}
          room={makeRoom({
            updated_at: '2026-11-16T10:00:04.000Z',
            host_id: 'p2',
          })}
          players={makePlayers()}
          localPlayerId="p1"
          startAtEpochMs={startAt + 50}
          channelRef={channelRef}
          incomingBroadcastRef={incomingBroadcastRef}
          onRematch={async () => {}}
          onLeaveRoom={async () => {}}
        />
      );
      stepFrames(5, 40);
    });

    const afterRefreshZ = rendererStats.lastRacers.find((r) => r.id === 'p1')!.z;
    expect(rendererStats.constructions).toBe(1);
    expect(rendererStats.disposals).toBe(0);
    expect(afterRefreshZ).toBeGreaterThan(drivenZ);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
