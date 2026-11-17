import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { KART_LIST } from './karts';
import { createInitialRacer } from './physics';
import { BuiltTrack } from './tracks';
import type {
  KartId,
  LobbyPlayer,
  LobbyRoom,
  MultiplayerBroadcast,
  NetworkKartPacket,
  RacerState,
} from './types';

export function toNetworkPacket(racer: RacerState, seq: number): NetworkKartPacket {
  return {
    id: racer.id,
    seq,
    x: Number(racer.x.toFixed(3)),
    y: Number(racer.y.toFixed(3)),
    z: Number(racer.z.toFixed(3)),
    yaw: Number(racer.yaw.toFixed(4)),
    vx: Number(racer.vx.toFixed(2)),
    vz: Number(racer.vz.toFixed(2)),
    speed: Number(racer.speed.toFixed(2)),
    steerAngle: Number(racer.steerAngle.toFixed(3)),
    isDrifting: racer.isDrifting,
    driftDir: racer.driftDir,
    driftTier: racer.driftTier,
    boostTimer: Number(racer.boostTimer.toFixed(2)),
    heldItem: racer.heldItem,
    shieldTimer: Number(racer.shieldTimer.toFixed(2)),
    spinTimer: Number(racer.spinTimer.toFixed(2)),
    lap: racer.lap,
    progress01: Number(racer.progress01.toFixed(4)),
    finished: racer.finished,
    finishTimeMs: racer.finishTimeMs,
    bestLapMs: racer.bestLapMs,
  };
}

export function applyRemotePacket(racer: RacerState, pkt: NetworkKartPacket): boolean {
  const now = Date.now();
  const isRecoveringAfterSilence = now - racer.lastUpdatedAt > 2000;
  if (
    !isRecoveringAfterSilence &&
    pkt.seq <= racer.lastPacketSeq &&
    racer.lastPacketSeq - pkt.seq < 500
  ) {
    return false;
  }
  racer.lastPacketSeq = pkt.seq;
  racer.lastUpdatedAt = now;

  const dist = Math.hypot(pkt.x - racer.x, pkt.z - racer.z);
  if (dist > 18) {
    // Hard snap on large desync / rescue
    racer.x = pkt.x;
    racer.y = pkt.y;
    racer.z = pkt.z;
    racer.yaw = pkt.yaw;
  } else {
    // Smooth blend toward authoritative peer position
    racer.x += (pkt.x - racer.x) * 0.55;
    racer.y += (pkt.y - racer.y) * 0.65;
    racer.z += (pkt.z - racer.z) * 0.55;
    let yawDiff = pkt.yaw - racer.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    racer.yaw += yawDiff * 0.6;
  }

  racer.vx = pkt.vx;
  racer.vz = pkt.vz;
  racer.speed = pkt.speed;
  racer.steerAngle = pkt.steerAngle;
  racer.isDrifting = pkt.isDrifting;
  racer.driftDir = pkt.driftDir;
  racer.driftTier = pkt.driftTier;
  racer.boostTimer = pkt.boostTimer;
  racer.heldItem = pkt.heldItem;
  racer.shieldTimer = pkt.shieldTimer;
  racer.spinTimer = pkt.spinTimer;
  racer.lap = pkt.lap;
  racer.progress01 = pkt.progress01;
  racer.finished = pkt.finished;
  racer.finishTimeMs = pkt.finishTimeMs;
  racer.bestLapMs = pkt.bestLapMs;
  return true;
}

export function extrapolateRemoteKart(racer: RacerState, dt: number): void {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  // Dampen dead-reckoning velocity if packets pause briefly so ghost karts don't overshoot walls
  if (Date.now() - racer.lastUpdatedAt > 250) {
    const decay = Math.pow(0.12, clampedDt);
    racer.vx *= decay;
    racer.vz *= decay;
  }
  racer.x += racer.vx * clampedDt;
  racer.z += racer.vz * clampedDt;
  if (racer.boostTimer > 0) racer.boostTimer = Math.max(0, racer.boostTimer - clampedDt);
  if (racer.shieldTimer > 0) racer.shieldTimer = Math.max(0, racer.shieldTimer - clampedDt);
  if (racer.spinTimer > 0) {
    racer.spinTimer = Math.max(0, racer.spinTimer - clampedDt);
    racer.yaw += 10 * clampedDt;
  }
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

export function shouldReplaceRoomState(
  prev: LobbyRoom | null,
  next: LobbyRoom | null
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return true;
  return (
    prev.id !== next.id ||
    prev.code !== next.code ||
    prev.name !== next.name ||
    prev.host_id !== next.host_id ||
    prev.track_id !== next.track_id ||
    prev.laps !== next.laps ||
    prev.max_players !== next.max_players ||
    prev.ai_fill !== next.ai_fill ||
    prev.status !== next.status ||
    prev.started_at !== next.started_at ||
    prev.finished_at !== next.finished_at
  );
}

export function shouldReplacePlayersState(
  prev: LobbyPlayer[],
  next: LobbyPlayer[]
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
      a.kart_id !== b.kart_id ||
      a.seat_index !== b.seat_index ||
      a.is_host !== b.is_host ||
      a.is_ready !== b.is_ready
    ) {
      return true;
    }
  }
  return false;
}

export function buildRaceRoster(
  room: LobbyRoom,
  players: LobbyPlayer[],
  localPlayerId: string,
  track: BuiltTrack
): RacerState[] {
  const sortedHumans = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const racers: RacerState[] = [];
  const usedSeats = new Set<number>();
  const usedKarts = new Set<KartId>();

  for (const p of sortedHumans) {
    usedSeats.add(p.seat_index);
    usedKarts.add(p.kart_id);
    racers.push(
      createInitialRacer(
        {
          id: p.player_id,
          seatIndex: p.seat_index,
          nickname: p.nickname,
          kartId: p.kart_id,
          isLocal: p.player_id === localPlayerId,
          isAi: false,
          isHost: p.is_host,
        },
        track
      )
    );
  }

  if (room.ai_fill) {
    const aiNames = ['TurboBot', 'GlacierAI', 'DriftBot', 'NitroBot'];
    const availableKarts = KART_LIST.filter((k) => !usedKarts.has(k.id));
    let aiIdx = 0;

    for (let seat = 0; seat < room.max_players; seat++) {
      if (usedSeats.has(seat)) continue;
      const kartDef = availableKarts[aiIdx % availableKarts.length] ?? KART_LIST[seat % KART_LIST.length];
      racers.push(
        createInitialRacer(
          {
            id: `ai-seat-${seat}`,
            seatIndex: seat,
            nickname: `${kartDef.name} [AI]`,
            kartId: kartDef.id,
            isLocal: false,
            isAi: true,
            isHost: false,
          },
          track
        )
      );
      aiIdx++;
      if (aiIdx >= aiNames.length) break;
    }
  }

  return racers.sort((a, b) => a.seatIndex - b.seatIndex);
}

export function formatRaceTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '--:--.--';
  const totalCentis = Math.floor(ms / 10);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export interface RoomChannelCallbacks {
  onBroadcast: (msg: MultiplayerBroadcast) => void;
  onPresenceSync: (onlineIds: string[]) => void;
  onDbChange: () => void;
  onStatusChange?: (status: string) => void;
}

export class MultiplayerRoomChannel {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;
  private roomId: string;

  constructor(
    supabase: SupabaseClient,
    roomCode: string,
    roomId: string,
    playerId: string,
    callbacks: RoomChannelCallbacks
  ) {
    this.supabase = supabase;
    this.roomId = roomId;

    this.channel = supabase.channel(`tuxkart:room:${roomCode}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: playerId },
      },
    });

    this.channel
      .on('broadcast', { event: 'game' }, (payload) => {
        if (payload?.payload) {
          callbacks.onBroadcast(payload.payload as MultiplayerBroadcast);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        callbacks.onPresenceSync(Object.keys(state));
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => callbacks.onDbChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => callbacks.onDbChange()
      );

    this.channel.subscribe(async (status) => {
      callbacks.onStatusChange?.(status);
      if (status === 'SUBSCRIBED') {
        await this.channel.track({ playerId, joinedAt: Date.now() });
      }
    });
  }

  public send(msg: MultiplayerBroadcast): void {
    void this.channel.send({
      type: 'broadcast',
      event: 'game',
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

  public getRoomId(): string {
    return this.roomId;
  }
}
