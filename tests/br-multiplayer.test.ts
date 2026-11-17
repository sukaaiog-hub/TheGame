import { describe, expect, it } from 'vitest';
import {
  applyRemoteFighterPacket,
  buildMatchRoster,
  buildMatchStandings,
  computeSyncedStartAtEpochMs,
  shouldReplaceBrPlayersState,
  shouldReplaceBrRoomState,
  toFighterPacket,
} from '@/game/multiplayer';
import type { BrPlayer, BrRoom } from '@/game/types';
import { buildWorldFromSeed } from '@/game/world';

const nowIso = new Date().toISOString();

const sampleRoom: BrRoom = {
  id: 'room-1',
  code: 'ABC123',
  name: 'Dropzone',
  host_id: 'p1',
  map_id: 'verdan_valley',
  mode: 'pvp_royale',
  max_players: 4,
  bot_count: 6,
  match_seed: 77777,
  status: 'active',
  created_at: nowIso,
  updated_at: nowIso,
  started_at: nowIso,
  finished_at: null,
};

const samplePlayers: BrPlayer[] = [
  {
    id: 'row-1',
    room_id: 'room-1',
    player_id: 'p1',
    nickname: 'Alice',
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
    room_id: 'room-1',
    player_id: 'p2',
    nickname: 'Bob',
    operator_id: 'spectre',
    seat_index: 1,
    team_index: 1,
    is_host: false,
    is_ready: true,
    joined_at: nowIso,
    last_seen_at: nowIso,
  },
  {
    id: 'row-3',
    room_id: 'room-1',
    player_id: 'p3',
    nickname: 'Charlie',
    operator_id: 'titan',
    seat_index: 2,
    team_index: 2,
    is_host: false,
    is_ready: true,
    joined_at: nowIso,
    last_seen_at: nowIso,
  },
];

describe('Battle Royale Multiplayer Sync & Roster', () => {
  it('assigns distinct teams in PvP Royale and shared human team in Co-op Squad', () => {
    const world = buildWorldFromSeed('verdan_valley', 77777);
    const ffa = buildMatchRoster(sampleRoom, samplePlayers, 'p1', world);
    expect(ffa).toHaveLength(9);
    const ffaHumans = ffa.filter((f) => !f.isAi);
    expect(new Set(ffaHumans.map((h) => h.teamIndex)).size).toBe(3);

    const coop = buildMatchRoster(
      { ...sampleRoom, mode: 'coop_squad' },
      samplePlayers,
      'p1',
      world
    );
    const coopHumans = coop.filter((f) => !f.isAi);
    expect(new Set(coopHumans.map((h) => h.teamIndex))).toEqual(new Set([0]));
  });

  it('interpolates remote fighter packets and rejects stale out-of-order sequences', () => {
    const world = buildWorldFromSeed('verdan_valley', 77777);
    const roster = buildMatchRoster(sampleRoom, samplePlayers, 'p1', world);
    const bob = roster.find((f) => f.id === 'p2')!;
    const origX = bob.x;

    const pkt10 = { ...toFighterPacket(bob, 10), x: origX + 20, hp: 72 };
    expect(applyRemoteFighterPacket(bob, pkt10)).toBe(true);
    expect(bob.hp).toBe(72);
    expect(bob.x).toBeGreaterThan(origX);

    const stalePkt = { ...pkt10, seq: 8, hp: 100 };
    expect(applyRemoteFighterPacket(bob, stalePkt)).toBe(false);
    expect(bob.hp).toBe(72);
  });

  it('deduplicates unchanged room/player snapshots and handles clock skew sync', () => {
    expect(shouldReplaceBrRoomState(sampleRoom, { ...sampleRoom })).toBe(false);
    expect(shouldReplaceBrRoomState(sampleRoom, { ...sampleRoom, status: 'finished' })).toBe(true);
    expect(shouldReplaceBrPlayersState(samplePlayers, samplePlayers.map((p) => ({ ...p })))).toBe(false);

    const synced = computeSyncedStartAtEpochMs(500_000, 497_000, 1_000_000);
    expect(synced).toBe(1_003_000);
  });

  it('computes final standings ranking survivor #1 and later eliminations higher', () => {
    const world = buildWorldFromSeed('verdan_valley', 77777);
    const roster = buildMatchRoster(sampleRoom, samplePlayers, 'p1', world);
    const [p1, p2, p3] = roster;
    p1.alive = true;
    p1.kills = 4;
    p2.alive = false;
    p2.eliminatedAtMs = 45000;
    p3.alive = false;
    p3.eliminatedAtMs = 20000;

    const standings = buildMatchStandings([p3, p2, p1], 60000);
    expect(standings[0].playerId).toBe(p1.id);
    expect(standings[0].placement).toBe(1);
    expect(standings[1].playerId).toBe(p2.id);
    expect(standings[2].playerId).toBe(p3.id);
  });

  it('returns fresh unmutated crates when buildWorldFromSeed reuses cached geometry', () => {
    const w1 = buildWorldFromSeed('verdan_valley', 88888);
    const originalCount = w1.crates.length;
    w1.crates[0].opened = true;
    w1.crates.push({
      id: 'extra-airdrop',
      x: 1400,
      y: 1400,
      kind: 'supply_drop',
      hp: 150,
      maxHp: 150,
      opened: false,
      hitFlashUntilMs: 0,
    });

    const w2 = buildWorldFromSeed('verdan_valley', 88888);
    expect(w2.crates).toHaveLength(originalCount);
    expect(w2.crates[0].opened).toBe(false);
  });
});
