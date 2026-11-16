'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import LobbyScreen from '@/components/LobbyScreen';
import RaceView from '@/components/RaceView';
import WaitingRoom from '@/components/WaitingRoom';
import { MultiplayerRoomChannel } from '@/game/multiplayer';
import type {
  KartId,
  LobbyPlayer,
  LobbyRoom,
  MultiplayerBroadcast,
  TrackId,
} from '@/game/types';
import {
  getOrCreatePlayerIdentity,
  getSupabaseClient,
  savePlayerIdentity,
} from '@/lib/supabase';

export default function HomePage() {
  const [playerId, setPlayerId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('TuxRacer');
  const [kartId, setKartId] = useState<KartId>('tux');
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  const [room, setRoom] = useState<LobbyRoom | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [onlinePresenceIds, setOnlinePresenceIds] = useState<string[]>([]);
  const [startAtEpochMs, setStartAtEpochMs] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const channelRef = useRef<MultiplayerRoomChannel | null>(null);
  const incomingBroadcastRef = useRef<((msg: MultiplayerBroadcast) => void) | null>(null);
  const autoJoinedRef = useRef(false);

  // Initialize persistent browser identity & check ?room=XXXXXX URL parameter
  useEffect(() => {
    const id = getOrCreatePlayerIdentity();
    setPlayerId(id.playerId);
    setNickname(id.nickname);
    setKartId(id.kartId);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('room');
      if (code) setInitialJoinCode(code.toUpperCase());
    }
  }, []);

  const refreshRoomSnapshot = useCallback(async (roomId: string) => {
    try {
      const supabase = getSupabaseClient();
      const [{ data: roomRow }, { data: playerRows }] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase
          .from('room_players')
          .select('*')
          .eq('room_id', roomId)
          .order('seat_index', { ascending: true }),
      ]);

      if (!roomRow) {
        setRoom(null);
        setPlayers([]);
        return;
      }

      const typedRoom = roomRow as LobbyRoom;
      setRoom(typedRoom);
      setPlayers((playerRows ?? []) as LobbyPlayer[]);

      if (typedRoom.status === 'countdown' || typedRoom.status === 'racing') {
        const startedAtMs = typedRoom.started_at
          ? new Date(typedRoom.started_at).getTime()
          : Date.now() + 3000;
        setStartAtEpochMs(startedAtMs);
      }
    } catch {
      // ignore transient poll failures
    }
  }, []);

  // Connect & maintain Supabase Realtime channel while in a room
  useEffect(() => {
    if (!room?.id || !room?.code || !playerId) {
      if (channelRef.current) {
        void channelRef.current.destroy();
        channelRef.current = null;
      }
      return;
    }

    const supabase = getSupabaseClient();
    const ch = new MultiplayerRoomChannel(supabase, room.code, room.id, playerId, {
      onBroadcast: (msg) => {
        if (msg.type === 'race_start') {
          setStartAtEpochMs(msg.startAtEpochMs);
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'countdown',
                  track_id: msg.trackId,
                  laps: msg.laps,
                  started_at: new Date(msg.startAtEpochMs).toISOString(),
                }
              : prev
          );
        } else if (msg.type === 'lobby_nudge') {
          void refreshRoomSnapshot(room.id);
        }
        incomingBroadcastRef.current?.(msg);
      },
      onPresenceSync: (ids) => setOnlinePresenceIds(ids),
      onDbChange: () => {
        void refreshRoomSnapshot(room.id);
      },
    });
    channelRef.current = ch;

    // Backup lightweight lobby sync poll every 4s while waiting
    const poll = setInterval(() => {
      void refreshRoomSnapshot(room.id);
    }, 4000);

    return () => {
      clearInterval(poll);
      void ch.destroy();
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [room?.id, room?.code, playerId, refreshRoomSnapshot]);

  const handleNicknameChange = (next: string) => {
    setNickname(next);
    if (playerId) savePlayerIdentity({ playerId, nickname: next, kartId });
  };

  const handleKartChange = (next: KartId) => {
    setKartId(next);
    if (playerId) savePlayerIdentity({ playerId, nickname, kartId: next });
  };

  const handleCreateRoom = async (opts: {
    name: string;
    trackId: TrackId;
    laps: number;
    maxPlayers: number;
    aiFill: boolean;
  }) => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const safeNick = nickname.trim() || 'TuxHost';
      const { data, error } = await supabase.rpc('create_lobby_room', {
        p_name: opts.name.trim() || 'TuxKart Grand Prix',
        p_host_id: playerId,
        p_nickname: safeNick,
        p_kart_id: kartId,
        p_track_id: opts.trackId,
        p_laps: opts.laps,
        p_max_players: opts.maxPlayers,
        p_ai_fill: opts.aiFill,
      });

      if (error || !data) {
        throw new Error(error?.message || 'Failed to create multiplayer room');
      }

      const createdRoom = data as LobbyRoom;
      setRoom(createdRoom);
      await refreshRoomSnapshot(createdRoom.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create room');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = useCallback(
    async (code: string) => {
      setErrorMsg(null);
      setBusy(true);
      try {
        const supabase = getSupabaseClient();
        const safeNick = nickname.trim() || 'Racer';
        const { data, error } = await supabase.rpc('join_room_seat', {
          p_room_code: code.trim().toUpperCase(),
          p_player_id: playerId,
          p_nickname: safeNick,
          p_kart_id: kartId,
        });

        if (error || !data) {
          throw new Error(error?.message || 'Unable to join room');
        }

        const joined = data as { room: LobbyRoom; player: LobbyPlayer };
        setRoom(joined.room);
        await refreshRoomSnapshot(joined.room.id);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to join room');
      } finally {
        setBusy(false);
      }
    },
    [playerId, nickname, kartId, refreshRoomSnapshot]
  );

  // Auto-join if URL contains ?room=CODE
  useEffect(() => {
    if (initialJoinCode && playerId && !room && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      void handleJoinRoom(initialJoinCode);
    }
  }, [initialJoinCode, playerId, room, handleJoinRoom]);

  const handleSelectKartInLobby = async (nextKart: KartId) => {
    handleKartChange(nextKart);
    if (!room) return;
    const supabase = getSupabaseClient();
    await supabase
      .from('room_players')
      .update({ kart_id: nextKart })
      .eq('room_id', room.id)
      .eq('player_id', playerId);
    channelRef.current?.send({ type: 'lobby_nudge' });
    await refreshRoomSnapshot(room.id);
  };

  const handleToggleReady = async () => {
    if (!room) return;
    const me = players.find((p) => p.player_id === playerId);
    if (!me) return;
    const supabase = getSupabaseClient();
    await supabase
      .from('room_players')
      .update({ is_ready: !me.is_ready })
      .eq('id', me.id);
    channelRef.current?.send({ type: 'lobby_nudge' });
    await refreshRoomSnapshot(room.id);
  };

  const handleUpdateRoomSettings = async (
    patch: Partial<Pick<LobbyRoom, 'track_id' | 'laps' | 'max_players' | 'ai_fill'>>
  ) => {
    if (!room || room.host_id !== playerId) return;
    const supabase = getSupabaseClient();
    await supabase.from('rooms').update(patch).eq('id', room.id);
    channelRef.current?.send({ type: 'lobby_nudge' });
    await refreshRoomSnapshot(room.id);
  };

  const handleStartRace = async () => {
    if (!room || room.host_id !== playerId) return;
    const startAt = Date.now() + 3400;
    const supabase = getSupabaseClient();

    await supabase
      .from('rooms')
      .update({
        status: 'countdown',
        started_at: new Date(startAt).toISOString(),
      })
      .eq('id', room.id);

    channelRef.current?.send({
      type: 'race_start',
      startAtEpochMs: startAt,
      trackId: room.track_id,
      laps: room.laps,
    });

    setStartAtEpochMs(startAt);
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            status: 'countdown',
            started_at: new Date(startAt).toISOString(),
          }
        : prev
    );
  };

  const handleRematch = async () => {
    if (!room) return;
    const supabase = getSupabaseClient();
    await supabase.rpc('reset_lobby_room', {
      p_room_id: room.id,
      p_player_id: playerId,
    });
    channelRef.current?.send({ type: 'lobby_nudge' });
    await refreshRoomSnapshot(room.id);
  };

  const handleLeaveRoom = async () => {
    if (room && playerId) {
      try {
        const supabase = getSupabaseClient();
        await supabase.rpc('leave_room_seat', {
          p_room_id: room.id,
          p_player_id: playerId,
        });
      } catch {
        // ignore leave failure
      }
    }
    setRoom(null);
    setPlayers([]);
    setStartAtEpochMs(0);
    if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
      window.history.replaceState({}, '', '/');
    }
  };

  if (!room) {
    return (
      <LobbyScreen
        nickname={nickname}
        kartId={kartId}
        onChangeNickname={handleNicknameChange}
        onChangeKart={handleKartChange}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        busy={busy}
        errorMsg={errorMsg}
        initialJoinCode={initialJoinCode}
      />
    );
  }

  if (room.status === 'countdown' || room.status === 'racing') {
    return (
      <RaceView
        room={room}
        players={players}
        localPlayerId={playerId}
        startAtEpochMs={startAtEpochMs || Date.now() + 3000}
        channelRef={channelRef}
        incomingBroadcastRef={incomingBroadcastRef}
        onRematch={handleRematch}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return (
    <WaitingRoom
      room={room}
      players={players}
      localPlayerId={playerId}
      onlinePresenceIds={onlinePresenceIds}
      onSelectKart={handleSelectKartInLobby}
      onToggleReady={handleToggleReady}
      onUpdateRoomSettings={handleUpdateRoomSettings}
      onStartRace={handleStartRace}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}
