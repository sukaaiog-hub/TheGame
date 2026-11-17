'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ArenaView from '@/components/ArenaView';
import LobbyScreen from '@/components/LobbyScreen';
import WaitingRoom from '@/components/WaitingRoom';
import {
  BrRoomChannel,
  computeSyncedStartAtEpochMs,
  shouldReplaceBrPlayersState,
  shouldReplaceBrRoomState,
} from '@/game/multiplayer';
import type {
  BrBroadcast,
  BrPlayer,
  BrRoom,
  GameMode,
  MapId,
  MatchStanding,
  OperatorId,
} from '@/game/types';
import {
  getOrCreateAgentIdentity,
  getSupabaseClient,
  saveAgentIdentity,
  type AgentIdentity,
} from '@/lib/supabase';

interface SoloRunConfig {
  id: string;
  mapId: MapId;
  botCount: number;
  seed: number;
  startAtEpochMs: number;
}

export default function HomePage() {
  const [identity, setIdentity] = useState<AgentIdentity | null>(null);
  const [room, setRoom] = useState<BrRoom | null>(null);
  const [players, setPlayers] = useState<BrPlayer[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [startAtEpochMs, setStartAtEpochMs] = useState<number>(Date.now() + 3000);
  const [soloRun, setSoloRun] = useState<SoloRunConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [broadcastTick, setBroadcastTick] = useState(0);

  const channelRef = useRef<BrRoomChannel | null>(null);
  const broadcastHandlerRef = useRef<(msg: BrBroadcast) => void>(() => {});
  const autoJoinedCodeRef = useRef<string | null>(null);
  const resultSubmittedRef = useRef<string | null>(null);
  const roomStatusRef = useRef<string | null>(null);

  roomStatusRef.current = room?.status ?? null;

  useEffect(() => {
    const id = getOrCreateAgentIdentity();
    setIdentity(id);
  }, []);

  const updateIdentity = useCallback(
    (nickname: string, operatorId: OperatorId) => {
      setIdentity((prev) => {
        const next: AgentIdentity = {
          playerId: prev?.playerId ?? getOrCreateAgentIdentity().playerId,
          nickname,
          operatorId,
        };
        saveAgentIdentity(next);
        return next;
      });
    },
    []
  );

  const refreshRoomSnapshot = useCallback(async (roomId: string) => {
    try {
      const supabase = getSupabaseClient();
      const [{ data: roomRow }, { data: playerRows }] = await Promise.all([
        supabase.from('br_rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase
          .from('br_players')
          .select('*')
          .eq('room_id', roomId)
          .order('seat_index', { ascending: true }),
      ]);

      if (!roomRow) {
        setRoom(null);
        setPlayers([]);
        return;
      }

      const typedRoom = roomRow as BrRoom;
      setRoom((prev) => (shouldReplaceBrRoomState(prev, typedRoom) ? typedRoom : prev));

      if (typedRoom.status === 'active' || typedRoom.status === 'countdown') {
        if (typedRoom.started_at) {
          const parsed = Date.parse(typedRoom.started_at);
          if (Number.isFinite(parsed)) {
            setStartAtEpochMs((prev) =>
              Math.abs(parsed - prev) > 250 && Math.abs(parsed - Date.now()) < 10_000
                ? parsed
                : prev
            );
          }
        }
      }

      if (playerRows) {
        const typedPlayers = playerRows as BrPlayer[];
        setPlayers((prev) =>
          shouldReplaceBrPlayersState(prev, typedPlayers) ? typedPlayers : prev
        );
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  const handleChannelBroadcast = useCallback(
    (msg: BrBroadcast) => {
      if (msg.type === 'match_countdown') {
        const synced = computeSyncedStartAtEpochMs(msg.startAtEpochMs, msg.sentAtEpochMs);
        setStartAtEpochMs(synced);
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                status: 'active',
                match_seed: msg.matchSeed,
                started_at: new Date(synced).toISOString(),
              }
            : prev
        );
      } else if (msg.type === 'room_reset') {
        resultSubmittedRef.current = null;
        if (room?.id) void refreshRoomSnapshot(room.id);
      }
      broadcastHandlerRef.current(msg);
    },
    [refreshRoomSnapshot, room?.id]
  );

  const handleBroadcastRef = useRef(handleChannelBroadcast);
  handleBroadcastRef.current = handleChannelBroadcast;

  // Bind Supabase Realtime room channel while inside a room
  useEffect(() => {
    if (!room?.id || !room?.code || !identity?.playerId) return;

    const supabase = getSupabaseClient();
    const ch = new BrRoomChannel(supabase, room.code, room.id, identity.playerId, {
      onBroadcast: (msg) => handleBroadcastRef.current(msg),
      onPresenceSync: (ids) => setOnlineIds(ids),
      onDbChange: () => {
        if (roomStatusRef.current === 'waiting') {
          void refreshRoomSnapshot(room.id);
        }
      },
    });
    channelRef.current = ch;
    setBroadcastTick((t) => t + 1);

    const pollId = setInterval(() => {
      if (roomStatusRef.current === 'waiting') {
        void refreshRoomSnapshot(room.id);
      }
    }, 3500);

    return () => {
      clearInterval(pollId);
      channelRef.current = null;
      void ch.destroy();
    };
  }, [room?.id, room?.code, identity?.playerId, refreshRoomSnapshot]);

  const handleCreateRoom = useCallback(
    async (opts: {
      roomName: string;
      mapId: MapId;
      mode: GameMode;
      maxPlayers: number;
      botCount: number;
    }) => {
      if (!identity) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('create_br_room', {
          p_host_id: identity.playerId,
          p_host_nickname: identity.nickname,
          p_operator_id: identity.operatorId,
          p_room_name: opts.roomName,
          p_map_id: opts.mapId,
          p_mode: opts.mode,
          p_max_players: opts.maxPlayers,
          p_bot_count: opts.botCount,
        });
        if (error) throw error;
        const createdRoom = data as BrRoom;
        setRoom(createdRoom);
        await refreshRoomSnapshot(createdRoom.id);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to create room');
      } finally {
        setBusy(false);
      }
    },
    [identity, refreshRoomSnapshot]
  );

  const handleJoinRoom = useCallback(
    async (code: string) => {
      if (!identity) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('join_br_room', {
          p_code: code.trim().toUpperCase(),
          p_player_id: identity.playerId,
          p_nickname: identity.nickname,
          p_operator_id: identity.operatorId,
        });
        if (error) throw error;
        const row = data as { room_id: string };
        await refreshRoomSnapshot(row.room_id);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not join room');
      } finally {
        setBusy(false);
      }
    },
    [identity, refreshRoomSnapshot]
  );

  // Auto-join via ?room=CODE query parameter
  useEffect(() => {
    if (!identity || room || soloRun) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room')?.trim().toUpperCase();
    if (code && code.length >= 4 && autoJoinedCodeRef.current !== code) {
      autoJoinedCodeRef.current = code;
      void handleJoinRoom(code);
    }
  }, [identity, room, soloRun, handleJoinRoom]);

  const handleToggleReady = useCallback(async () => {
    if (!room || !identity) return;
    const me = players.find((p) => p.player_id === identity.playerId);
    if (!me) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('br_players')
        .update({ is_ready: !me.is_ready })
        .eq('id', me.id);
      await refreshRoomSnapshot(room.id);
    } finally {
      setBusy(false);
    }
  }, [room, identity, players, refreshRoomSnapshot]);

  const handleSelectOperator = useCallback(
    async (operatorId: OperatorId) => {
      if (!room || !identity) return;
      updateIdentity(identity.nickname, operatorId);
      const me = players.find((p) => p.player_id === identity.playerId);
      if (!me) return;
      const supabase = getSupabaseClient();
      await supabase.from('br_players').update({ operator_id: operatorId }).eq('id', me.id);
      await refreshRoomSnapshot(room.id);
    },
    [room, identity, players, updateIdentity, refreshRoomSnapshot]
  );

  const handleUpdateSettings = useCallback(
    async (opts: { mapId?: MapId; mode?: GameMode; botCount?: number }) => {
      if (!room) return;
      const supabase = getSupabaseClient();
      await supabase
        .from('br_rooms')
        .update({
          ...(opts.mapId ? { map_id: opts.mapId } : {}),
          ...(opts.mode ? { mode: opts.mode } : {}),
          ...(typeof opts.botCount === 'number' ? { bot_count: opts.botCount } : {}),
        })
        .eq('id', room.id);
      await refreshRoomSnapshot(room.id);
    },
    [room, refreshRoomSnapshot]
  );

  const handleStartMatch = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      const nowEpoch = Date.now();
      const startEpoch = nowEpoch + 3200;
      const seed = Math.floor(Math.random() * 900_000_000) + 100_000;
      const supabase = getSupabaseClient();
      await supabase
        .from('br_rooms')
        .update({
          status: 'active',
          match_seed: seed,
          started_at: new Date(startEpoch).toISOString(),
        })
        .eq('id', room.id);

      setStartAtEpochMs(startEpoch);
      resultSubmittedRef.current = null;
      channelRef.current?.send({
        type: 'match_countdown',
        startAtEpochMs: startEpoch,
        sentAtEpochMs: nowEpoch,
        matchSeed: seed,
      });
      await refreshRoomSnapshot(room.id);
    } finally {
      setBusy(false);
    }
  }, [room, refreshRoomSnapshot]);

  const handleLeaveRoom = useCallback(async () => {
    if (soloRun) {
      setSoloRun(null);
      return;
    }
    if (!room || !identity) {
      setRoom(null);
      setPlayers([]);
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.rpc('leave_br_room', {
        p_room_id: room.id,
        p_player_id: identity.playerId,
      });
    } catch {
      // ignore
    } finally {
      setRoom(null);
      setPlayers([]);
      setBusy(false);
    }
  }, [soloRun, room, identity]);

  const handleStartSolo = useCallback((mapId: MapId, botCount: number) => {
    resultSubmittedRef.current = null;
    setSoloRun({
      id: `solo-${Date.now()}`,
      mapId,
      botCount,
      seed: Math.floor(Math.random() * 900_000_000) + 100_000,
      startAtEpochMs: Date.now() + 2500,
    });
  }, []);

  const handleFinishMatch = useCallback(
    async (standings: MatchStanding[]) => {
      if (!identity) return;
      const runKey = soloRun?.id ?? room?.id ?? 'unknown';
      if (resultSubmittedRef.current === runKey) return;
      resultSubmittedRef.current = runKey;

      const myRow = standings.find((s) => s.playerId === identity.playerId);
      if (myRow) {
        try {
          await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: soloRun ? null : room?.id ?? null,
              mapId: soloRun?.mapId ?? room?.map_id ?? 'verdan_valley',
              mode: soloRun ? 'pvp_royale' : room?.mode ?? 'pvp_royale',
              playerId: identity.playerId,
              nickname: identity.nickname,
              operatorId: identity.operatorId,
              isAi: false,
              placement: myRow.placement,
              kills: myRow.kills,
              damageDealt: myRow.damageDealt,
              survivalMs: myRow.survivalMs,
            }),
          });
        } catch {
          // non-blocking
        }
      }

      if (!soloRun && room && room.host_id === identity.playerId) {
        try {
          const supabase = getSupabaseClient();
          await supabase
            .from('br_rooms')
            .update({ status: 'finished', finished_at: new Date().toISOString() })
            .eq('id', room.id);
        } catch {
          // ignore
        }
      }
    },
    [identity, soloRun, room]
  );

  const handlePlayAgain = useCallback(async () => {
    if (soloRun) {
      handleStartSolo(soloRun.mapId, soloRun.botCount);
      return;
    }
    if (!room || !identity) return;
    if (room.host_id === identity.playerId) {
      const supabase = getSupabaseClient();
      await supabase.rpc('reset_br_room', { p_room_id: room.id });
      channelRef.current?.send({ type: 'room_reset' });
    }
    await refreshRoomSnapshot(room.id);
  }, [soloRun, handleStartSolo, room, identity, refreshRoomSnapshot]);

  const registerBroadcastHandler = useCallback((fn: (msg: BrBroadcast) => void) => {
    broadcastHandlerRef.current = fn;
  }, []);

  if (!identity) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060913] text-sm font-bold text-slate-400">
        Initializing Operator Profile...
      </div>
    );
  }

  // Solo Mode Active Arena
  if (soloRun) {
    const nowIso = new Date().toISOString();
    const soloRoom: BrRoom = {
      id: soloRun.id,
      code: 'SOLO00',
      name: 'Solo Drop',
      host_id: identity.playerId,
      map_id: soloRun.mapId,
      mode: 'pvp_royale',
      max_players: 1,
      bot_count: soloRun.botCount,
      match_seed: soloRun.seed,
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
      started_at: new Date(soloRun.startAtEpochMs).toISOString(),
      finished_at: null,
    };
    const soloPlayers: BrPlayer[] = [
      {
        id: 'solo-human',
        room_id: soloRun.id,
        player_id: identity.playerId,
        nickname: identity.nickname,
        operator_id: identity.operatorId,
        seat_index: 0,
        team_index: 0,
        is_host: true,
        is_ready: true,
        joined_at: nowIso,
        last_seen_at: nowIso,
      },
    ];
    return (
      <ArenaView
        key={soloRun.id}
        room={soloRoom}
        players={soloPlayers}
        localPlayerId={identity.playerId}
        isSolo
        startAtEpochMs={soloRun.startAtEpochMs}
        channel={null}
        broadcastSubscribeTick={0}
        onRegisterBroadcastHandler={registerBroadcastHandler}
        onFinishMatch={handleFinishMatch}
        onPlayAgain={handlePlayAgain}
        onLeaveMatch={handleLeaveRoom}
      />
    );
  }

  // Multiplayer Active Match
  if (room && (room.status === 'active' || room.status === 'countdown' || room.status === 'finished')) {
    return (
      <ArenaView
        key={room.id}
        room={room}
        players={players}
        localPlayerId={identity.playerId}
        isSolo={false}
        startAtEpochMs={startAtEpochMs}
        channel={channelRef.current}
        broadcastSubscribeTick={broadcastTick}
        onRegisterBroadcastHandler={registerBroadcastHandler}
        onFinishMatch={handleFinishMatch}
        onPlayAgain={handlePlayAgain}
        onLeaveMatch={handleLeaveRoom}
      />
    );
  }

  // Multiplayer Waiting Lobby
  if (room) {
    return (
      <WaitingRoom
        room={room}
        players={players}
        localPlayerId={identity.playerId}
        onlinePlayerIds={onlineIds}
        onToggleReady={handleToggleReady}
        onSelectOperator={handleSelectOperator}
        onUpdateSettings={handleUpdateSettings}
        onStartMatch={handleStartMatch}
        onLeaveRoom={handleLeaveRoom}
        busy={busy}
      />
    );
  }

  // Main Menu / Server Browser
  return (
    <LobbyScreen
      nickname={identity.nickname}
      operatorId={identity.operatorId}
      onUpdateIdentity={updateIdentity}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onStartSolo={handleStartSolo}
      busy={busy}
      errorMessage={errorMessage}
    />
  );
}
