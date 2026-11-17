import { describe, expect, it } from 'vitest';
import {
  applyRemotePacket,
  buildRaceRoster,
  computeSyncedStartAtEpochMs,
  extrapolateRemoteKart,
  formatRaceTime,
  shouldReplacePlayersState,
  shouldReplaceRoomState,
  toNetworkPacket,
} from '@/game/multiplayer';
import { buildTrackData } from '@/game/tracks';
import type { LobbyPlayer, LobbyRoom } from '@/game/types';

function makeRoom(overrides: Partial<LobbyRoom> = {}): LobbyRoom {
  return {
    id: 'room-1',
    code: 'KART42',
    name: 'Test GP',
    host_id: 'p1',
    track_id: 'lighthouse_bay',
    laps: 3,
    max_players: 4,
    ai_fill: true,
    status: 'waiting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

function makePlayer(seat: number, id: string, kartId: LobbyPlayer['kart_id'] = 'tux'): LobbyPlayer {
  return {
    id: `row-${seat}`,
    room_id: 'room-1',
    player_id: id,
    nickname: `Driver ${seat + 1}`,
    kart_id: kartId,
    seat_index: seat,
    is_host: seat === 0,
    is_ready: true,
    joined_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
}

describe('Multiplayer Roster & AI Fill (3-4 Players)', () => {
  const track = buildTrackData('lighthouse_bay');

  it('builds a full 4-human roster with no AI bots when 4 players join', () => {
    const room = makeRoom({ max_players: 4, ai_fill: true });
    const players = [
      makePlayer(0, 'p1', 'tux'),
      makePlayer(1, 'p2', 'wilber'),
      makePlayer(2, 'p3', 'konqi'),
      makePlayer(3, 'p4', 'sara'),
    ];
    const roster = buildRaceRoster(room, players, 'p3', track);
    expect(roster.length).toBe(4);
    expect(roster.filter((r) => r.isAi).length).toBe(0);
    expect(roster.find((r) => r.id === 'p3')?.isLocal).toBe(true);
    expect(roster.map((r) => r.seatIndex)).toEqual([0, 1, 2, 3]);
  });

  it('fills empty seats up to max_players (4) with AI bots when 1-2 humans are in lobby', () => {
    const room = makeRoom({ max_players: 4, ai_fill: true });
    const roster = buildRaceRoster(
      room,
      [makePlayer(0, 'p1', 'tux'), makePlayer(1, 'p2', 'wilber')],
      'p1',
      track
    );
    expect(roster.length).toBe(4);
    expect(roster.filter((r) => !r.isAi).length).toBe(2);
    expect(roster.filter((r) => r.isAi).length).toBe(2);
  });

  it('keeps exactly 3 human racers when max_players is 3 and ai_fill is false', () => {
    const room = makeRoom({ max_players: 3, ai_fill: false });
    const roster = buildRaceRoster(
      room,
      [makePlayer(0, 'p1', 'tux'), makePlayer(1, 'p2', 'wilber'), makePlayer(2, 'p3', 'hexley')],
      'p2',
      track
    );
    expect(roster.length).toBe(3);
    expect(roster.every((r) => !r.isAi)).toBe(true);
  });

  it('supports single-player solo time trial (1 kart) and solo vs 3 AI bots (4 karts)', () => {
    const timeTrialRoom = makeRoom({ id: 'solo', code: 'SOLO', max_players: 1, ai_fill: false });
    const ttRoster = buildRaceRoster(timeTrialRoom, [makePlayer(0, 'p1', 'tux')], 'p1', track);
    expect(ttRoster.length).toBe(1);
    expect(ttRoster[0].isLocal).toBe(true);
    expect(ttRoster[0].isAi).toBe(false);

    const soloVsAiRoom = makeRoom({ id: 'solo', code: 'SOLO', max_players: 4, ai_fill: true });
    const vsAiRoster = buildRaceRoster(soloVsAiRoom, [makePlayer(0, 'p1', 'sara')], 'p1', track);
    expect(vsAiRoster.length).toBe(4);
    expect(vsAiRoster.filter((r) => r.isLocal).length).toBe(1);
    expect(vsAiRoster.filter((r) => r.isAi).length).toBe(3);
  });
});

describe('Network Packet Sync, Sequencing & Extrapolation', () => {
  const track = buildTrackData('frozen_tundra');

  it('rejects stale out-of-order packets and smoothly blends newer packets', () => {
    const room = makeRoom();
    const [r1, r2] = buildRaceRoster(
      room,
      [makePlayer(0, 'p1', 'tux'), makePlayer(1, 'p2', 'wilber')],
      'p1',
      track
    );

    const pkt10 = toNetworkPacket({ ...r2, x: r2.x + 2, z: r2.z + 3, speed: 35, vz: 35 }, 10);
    expect(applyRemotePacket(r2, pkt10)).toBe(true);
    expect(r2.lastPacketSeq).toBe(10);

    // Out-of-order older packet seq=8 must be ignored
    const pkt8 = toNetworkPacket({ ...r2, x: 999, z: 999 }, 8);
    expect(applyRemotePacket(r2, pkt8)).toBe(false);
    expect(r2.x).not.toBe(999);

    // Large teleport (> 18 units) snaps directly
    const pkt12 = toNetworkPacket({ ...r2, x: r2.x + 30, z: r2.z + 30 }, 12);
    expect(applyRemotePacket(r2, pkt12)).toBe(true);
    expect(r2.x).toBe(pkt12.x);

    // Extrapolation moves remote kart smoothly along velocity vector
    const prevZ = r2.z;
    r2.vz = 40;
    extrapolateRemoteKart(r2, 0.025);
    expect(r2.z).toBeCloseTo(prevZ + 1.0, 2);
    expect(r1.isLocal).toBe(true);

    // Silence > 2000ms allows peer sequence reset recovery on reconnect
    r2.lastUpdatedAt = Date.now() - 2500;
    const pktReset = toNetworkPacket({ ...r2, x: r2.x + 1, z: r2.z + 1 }, 1);
    expect(applyRemotePacket(r2, pktReset)).toBe(true);
    expect(r2.lastPacketSeq).toBe(1);

    // Prolonged silence dampens dead-reckoning velocity so ghost karts stop cleanly
    r2.vx = 50;
    r2.lastUpdatedAt = Date.now() - 600;
    extrapolateRemoteKart(r2, 0.05);
    expect(r2.vx).toBeLessThan(50);
  });

  it('deduplicates unchanged room/player snapshots and syncs countdowns across clock skew', () => {
    const rA = makeRoom({ status: 'countdown', started_at: '2026-11-16T10:00:03.400Z' });
    const rB = { ...rA, updated_at: '2026-11-16T10:00:07.400Z' };
    expect(shouldReplaceRoomState(rA, rB)).toBe(false);
    expect(shouldReplaceRoomState(rA, { ...rA, status: 'waiting' })).toBe(true);
    expect(shouldReplaceRoomState(rA, { ...rA, host_id: 'p2' })).toBe(true);

    const pListA = [makePlayer(0, 'p1'), makePlayer(1, 'p2')];
    const pListB = pListA.map((p) => ({ ...p, last_seen_at: '2026-11-16T10:00:07.400Z' }));
    expect(shouldReplacePlayersState(pListA, pListB)).toBe(false);
    expect(shouldReplacePlayersState(pListA, [makePlayer(0, 'p1')])).toBe(true);

    // Even if host clock is 30 seconds ahead of guest clock, countdown remains 3400ms on guest
    const hostSentAt = 2_000_000_000_000;
    const hostStartAt = hostSentAt + 3400;
    const guestNow = hostSentAt - 30_000;
    expect(computeSyncedStartAtEpochMs(hostStartAt, hostSentAt, guestNow)).toBe(guestNow + 3400);
  });

  it('formats race and lap times cleanly', () => {
    expect(formatRaceTime(null)).toBe('--:--.--');
    expect(formatRaceTime(65432)).toBe('01:05.43');
    expect(formatRaceTime(4210)).toBe('00:04.21');
  });
});
