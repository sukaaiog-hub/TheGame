import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createInitialFighter, getActiveWeapon } from './combat';
import { OPERATOR_LIST } from './operators';
import { createWeaponInstance } from './weapons';
import { getSafeDropSpawns } from './world';
import type {
  BrBroadcast,
  BrPlayer,
  BrRoom,
  BuiltWorld,
  FighterState,
  MatchStanding,
  NetworkFighterPacket,
  OperatorId,
} from './types';

export function toFighterPacket(fighter: FighterState, seq: number): NetworkFighterPacket {
  const active = getActiveWeapon(fighter);
  return {
    id: fighter.id,
    seq,
    x: Number(fighter.x.toFixed(1)),
    y: Number(fighter.y.toFixed(1)),
    vx: Number(fighter.vx.toFixed(1)),
    vy: Number(fighter.vy.toFixed(1)),
    aimAngle: Number(fighter.aimAngle.toFixed(3)),
    hp: Math.round(fighter.hp),
    armor: Math.round(fighter.armor),
    alive: fighter.alive,
    kills: fighter.kills,
    damageDealt: Math.round(fighter.damageDealt),
    activeWeaponId: active?.weaponId ?? 'pistol',
    activeRarity: active?.rarity ?? 'common',
    dashing: Date.now() < fighter.dashingUntilMs,
    healing: fighter.healingUntilMs > 0,
    reloading: fighter.reloadingUntilMs > 0,
  };
}

export function applyRemoteFighterPacket(
  fighter: FighterState,
  pkt: NetworkFighterPacket
): boolean {
  const now = Date.now();
  const staleReconnect = now - fighter.lastUpdatedAt > 2000;
  if (
    !staleReconnect &&
    pkt.seq <= fighter.lastPacketSeq &&
    fighter.lastPacketSeq - pkt.seq < 500
  ) {
    return false;
  }

  fighter.lastPacketSeq = pkt.seq;
  fighter.lastUpdatedAt = now;

  const dist = Math.hypot(pkt.x - fighter.x, pkt.y - fighter.y);
  if (dist > 140) {
    fighter.x = pkt.x;
    fighter.y = pkt.y;
  } else {
    fighter.x += (pkt.x - fighter.x) * 0.55;
    fighter.y += (pkt.y - fighter.y) * 0.55;
  }

  let angleDiff = pkt.aimAngle - fighter.aimAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  fighter.aimAngle += angleDiff * 0.65;

  fighter.vx = pkt.vx;
  fighter.vy = pkt.vy;
  fighter.hp = pkt.hp;
  fighter.armor = pkt.armor;
  fighter.alive = pkt.alive;
  fighter.kills = pkt.kills;
  fighter.damageDealt = pkt.damageDealt;

  const cur = getActiveWeapon(fighter);
  if (!cur || cur.weaponId !== pkt.activeWeaponId || cur.rarity !== pkt.activeRarity) {
    fighter.weapons[fighter.activeSlot] = createWeaponInstance(pkt.activeWeaponId, pkt.activeRarity);
  }

  const spd = Math.hypot(pkt.vx, pkt.vy);
  if (spd > 15) {
    fighter.walkPhase += 0.3;
  }

  return true;
}

export function extrapolateRemoteFighter(fighter: FighterState, dt: number): void {
  if (!fighter.alive) return;
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  if (Date.now() - fighter.lastUpdatedAt > 220) {
    const decay = Math.pow(0.12, clampedDt);
    fighter.vx *= decay;
    fighter.vy *= decay;
  }
  fighter.x += fighter.vx * clampedDt;
  fighter.y += fighter.vy * clampedDt;
  const spd = Math.hypot(fighter.vx, fighter.vy);
  if (spd > 20) {
    fighter.walkPhase += spd * clampedDt * 0.055;
  }
}

export function buildMatchRoster(
  room: BrRoom,
  players: BrPlayer[],
  localPlayerId: string,
  world: BuiltWorld
): FighterState[] {
  const sortedHumans = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const botCount = Math.max(0, Math.min(12, room.bot_count));
  const totalCount = sortedHumans.length + botCount;
  const coopCount = room.mode === 'coop_squad' ? sortedHumans.length : 0;
  const spawns = getSafeDropSpawns(world, totalCount, coopCount);

  const fighters: FighterState[] = [];
  const usedOperators = new Set<OperatorId>();

  sortedHumans.forEach((p, idx) => {
    usedOperators.add(p.operator_id);
    const sp = spawns[idx] ?? spawns[0];
    fighters.push(
      createInitialFighter({
        id: p.player_id,
        seatIndex: p.seat_index,
        teamIndex: room.mode === 'coop_squad' ? 0 : p.seat_index,
        nickname: p.nickname,
        operatorId: p.operator_id,
        isLocal: p.player_id === localPlayerId,
        isAi: false,
        isHost: p.is_host,
        spawnX: sp.x,
        spawnY: sp.y,
      })
    );
  });

  const botCallsigns = [
    'Reaper-AI',
    'Kestrel-AI',
    'Blitz-AI',
    'Phantom-AI',
    'Mantis-AI',
    'Cobra-AI',
    'Lynx-AI',
    'Havoc-AI',
    'Atlas-AI',
    'Nova-AI',
    'Talon-AI',
    'Apex-AI',
  ];

  const remainingOps = OPERATOR_LIST.filter((o) => !usedOperators.has(o.id));
  const opPool = remainingOps.length > 0 ? remainingOps : OPERATOR_LIST;

  for (let b = 0; b < botCount; b++) {
    const sp = spawns[sortedHumans.length + b] ?? spawns[0];
    const op = opPool[b % opPool.length];
    const teamIndex =
      room.mode === 'coop_squad' ? 10 + Math.floor(b / 3) : 10 + b;
    fighters.push(
      createInitialFighter({
        id: `bot-${b}`,
        seatIndex: sortedHumans.length + b,
        teamIndex,
        nickname: botCallsigns[b % botCallsigns.length],
        operatorId: op.id,
        isLocal: false,
        isAi: true,
        isHost: false,
        spawnX: sp.x,
        spawnY: sp.y,
      })
    );
  }

  return fighters;
}

export function buildMatchStandings(
  fighters: FighterState[],
  matchElapsedMs: number
): MatchStanding[] {
  const sorted = [...fighters].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive && !b.alive) {
      const ta = a.eliminatedAtMs ?? 0;
      const tb = b.eliminatedAtMs ?? 0;
      if (tb !== ta) return tb - ta;
    }
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.damageDealt - a.damageDealt;
  });

  return sorted.map((f, idx) => ({
    playerId: f.id,
    nickname: f.nickname,
    operatorId: f.operatorId,
    isAi: f.isAi,
    teamIndex: f.teamIndex,
    placement: idx + 1,
    kills: f.kills,
    damageDealt: Math.round(f.damageDealt),
    survivalMs: f.alive
      ? Math.max(1000, Math.round(matchElapsedMs))
      : Math.max(1000, Math.round(f.eliminatedAtMs ?? matchElapsedMs)),
  }));
}

export function computeSyncedStartAtEpochMs(
  msgStartAtMs: number,
  msgSentAtMs?: number,
  localNowMs: number = Date.now()
): number {
  if (typeof msgSentAtMs === 'number' && Number.isFinite(msgSentAtMs)) {
    const remaining = Math.max(0, Math.min(6000, msgStartAtMs - msgSentAtMs));
    return localNowMs + remaining;
  }
  const diff = msgStartAtMs - localNowMs;
  if (Math.abs(diff) > 10_000) {
    return localNowMs + 2500;
  }
  return msgStartAtMs;
}

export function shouldReplaceBrRoomState(
  prev: BrRoom | null,
  next: BrRoom | null
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return true;
  return (
    prev.id !== next.id ||
    prev.code !== next.code ||
    prev.name !== next.name ||
    prev.host_id !== next.host_id ||
    prev.map_id !== next.map_id ||
    prev.mode !== next.mode ||
    prev.max_players !== next.max_players ||
    prev.bot_count !== next.bot_count ||
    prev.match_seed !== next.match_seed ||
    prev.status !== next.status ||
    prev.started_at !== next.started_at ||
    prev.finished_at !== next.finished_at
  );
}

export function shouldReplaceBrPlayersState(
  prev: BrPlayer[],
  next: BrPlayer[]
): boolean {
  if (prev === next) return false;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.player_id !== b.player_id ||
      a.nickname !== b.nickname ||
      a.operator_id !== b.operator_id ||
      a.seat_index !== b.seat_index ||
      a.team_index !== b.team_index ||
      a.is_host !== b.is_host ||
      a.is_ready !== b.is_ready
    ) {
      return true;
    }
  }
  return false;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface BrChannelCallbacks {
  onBroadcast: (msg: BrBroadcast) => void;
  onPresenceSync: (onlineIds: string[]) => void;
  onDbChange: () => void;
}

export class BrRoomChannel {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;

  constructor(
    supabase: SupabaseClient,
    roomCode: string,
    roomId: string,
    playerId: string,
    callbacks: BrChannelCallbacks
  ) {
    this.supabase = supabase;
    this.channel = supabase.channel(`dropzone:room:${roomCode}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: playerId },
      },
    });

    this.channel
      .on('broadcast', { event: 'br' }, (payload) => {
        if (payload?.payload) {
          callbacks.onBroadcast(payload.payload as BrBroadcast);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        callbacks.onPresenceSync(Object.keys(state));
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'br_rooms', filter: `id=eq.${roomId}` },
        () => callbacks.onDbChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'br_players', filter: `room_id=eq.${roomId}` },
        () => callbacks.onDbChange()
      );

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel.track({ playerId, joinedAt: Date.now() });
      }
    });
  }

  public send(msg: BrBroadcast): void {
    void this.channel.send({
      type: 'broadcast',
      event: 'br',
      payload: msg,
    });
  }

  public async destroy(): Promise<void> {
    try {
      await this.channel.untrack();
    } catch {
      // ignore
    }
    await this.supabase.removeChannel(this.channel);
  }
}
