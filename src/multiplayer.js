/**
 * Browser-to-browser online multiplayer via Supabase Realtime (Presence + Broadcast).
 * Zero VPS required for browser arenas.
 */
import { createClient } from '@supabase/supabase-js';

export function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export class RealtimeArenaClient {
  constructor({ supabaseUrl, supabaseAnonKey }) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 30 } },
    });
    this.channel = null;
    this.roomCode = null;
    this.localId = null;
    this.peers = new Map();
    this.handlers = {};
    this.connected = false;
  }

  on(event, fn) {
    this.handlers[event] = fn;
  }

  emit(event, payload) {
    if (this.handlers[event]) this.handlers[event](payload);
  }

  async joinRoom({ roomCode, playerId, playerName, team, mapId, mode, isHost }) {
    await this.leave();
    this.roomCode = roomCode.toUpperCase();
    this.localId = playerId;

    const channel = this.supabase.channel(`re2:room:${this.roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: playerId },
      },
    });
    this.channel = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      this.peers.clear();
      for (const [key, metas] of Object.entries(state)) {
        if (!Array.isArray(metas) || metas.length === 0) continue;
        this.peers.set(key, metas[metas.length - 1]);
      }
      this.emit('presence', Array.from(this.peers.values()));
    });

    channel.on('broadcast', { event: 'player_state' }, ({ payload }) => {
      if (payload && payload.id !== this.localId) {
        this.emit('player_state', payload);
      }
    });

    channel.on('broadcast', { event: 'fire' }, ({ payload }) => {
      if (payload && payload.id !== this.localId) {
        this.emit('fire', payload);
      }
    });

    channel.on('broadcast', { event: 'damage' }, ({ payload }) => {
      if (payload) {
        this.emit('damage', payload);
      }
    });

    channel.on('broadcast', { event: 'kill' }, ({ payload }) => {
      if (payload) {
        this.emit('kill', payload);
      }
    });

    channel.on('broadcast', { event: 'room_meta' }, ({ payload }) => {
      if (payload) {
        this.emit('room_meta', payload);
      }
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime room join timed out')), 9000);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          this.connected = true;
          await channel.track({
            id: playerId,
            name: playerName,
            team,
            mapId,
            mode,
            isHost: Boolean(isHost),
            joinedAt: Date.now(),
          });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`Realtime channel status: ${status}`));
        }
      });
    });

    return this.roomCode;
  }

  sendState(state) {
    if (!this.channel || !this.connected) return;
    this.channel.send({
      type: 'broadcast',
      event: 'player_state',
      payload: state,
    });
  }

  sendFire(fireEvent) {
    if (!this.channel || !this.connected) return;
    this.channel.send({
      type: 'broadcast',
      event: 'fire',
      payload: fireEvent,
    });
  }

  sendDamage(dmgEvent) {
    if (!this.channel || !this.connected) return;
    this.channel.send({
      type: 'broadcast',
      event: 'damage',
      payload: dmgEvent,
    });
  }

  sendKill(killEvent) {
    if (!this.channel || !this.connected) return;
    this.channel.send({
      type: 'broadcast',
      event: 'kill',
      payload: killEvent,
    });
  }

  sendRoomMeta(meta) {
    if (!this.channel || !this.connected) return;
    this.channel.send({
      type: 'broadcast',
      event: 'room_meta',
      payload: meta,
    });
  }

  async leave() {
    this.connected = false;
    this.peers.clear();
    if (this.channel) {
      try {
        await this.channel.unsubscribe();
        await this.supabase.removeChannel(this.channel);
      } catch {}
      this.channel = null;
    }
  }
}
