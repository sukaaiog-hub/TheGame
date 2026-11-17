'use client';

import React, { useState } from 'react';
import { Check, Copy, Crown, LogOut, Play, Sparkles, Users } from 'lucide-react';
import { getKartDefinition, KART_LIST } from '@/game/karts';
import { TRACK_LIST } from '@/game/tracks';
import type { KartId, LobbyPlayer, LobbyRoom, TrackId } from '@/game/types';

interface WaitingRoomProps {
  room: LobbyRoom;
  players: LobbyPlayer[];
  localPlayerId: string;
  onlinePresenceIds: string[];
  onSelectKart: (kartId: KartId) => Promise<void>;
  onToggleReady: () => Promise<void>;
  onUpdateRoomSettings: (patch: Partial<Pick<LobbyRoom, 'track_id' | 'laps' | 'max_players' | 'ai_fill'>>) => Promise<void>;
  onStartRace: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

export default function WaitingRoom({
  room,
  players,
  localPlayerId,
  onlinePresenceIds,
  onSelectKart,
  onToggleReady,
  onUpdateRoomSettings,
  onStartRace,
  onLeaveRoom,
}: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);

  const localPlayer = players.find((p) => p.player_id === localPlayerId);
  const isHost = room.host_id === localPlayerId;
  const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);

  const copyInvite = async () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?room=${room.code}`
        : room.code;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const seats = Array.from({ length: room.max_players }, (_, seatIndex) => {
    const occupant = sortedPlayers.find((p) => p.seat_index === seatIndex);
    return { seatIndex, occupant };
  });

  const nonHostReadyCount = players.filter((p) => !p.is_host && p.is_ready).length;
  const nonHostTotal = players.filter((p) => !p.is_host).length;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#112a4d_0%,_#060913_70%)] px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* Top Lobby Bar */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-5 backdrop-blur">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
              <Users className="h-4 w-4" />
              Multiplayer Paddock ({players.length}/{room.max_players} Humans)
            </div>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{room.name}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-slate-950 px-4 py-2.5 transition hover:border-cyan-400"
            >
              <span className="text-xs font-semibold uppercase text-slate-400">Code</span>
              <span className="font-mono text-lg font-black tracking-widest text-cyan-300">
                {room.code}
              </span>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4 text-slate-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void onLeaveRoom()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-rose-600/25 hover:text-rose-200"
            >
              <LogOut className="h-4 w-4" />
              Leave
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* 4-Seat Starting Grid */}
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/75 p-5 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                Starting Grid ({room.max_players} Racers)
              </h2>
              <span className="text-xs text-slate-400">
                Share invite link to bring 3–4 players into this room
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {seats.map(({ seatIndex, occupant }) => {
                if (!occupant) {
                  return (
                    <div
                      key={seatIndex}
                      className="flex min-h-[116px] flex-col justify-between rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-4"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>GRID SEAT #{seatIndex + 1}</span>
                        <span>{room.ai_fill ? 'AI FILL ACTIVE' : 'OPEN'}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-400">
                        {room.ai_fill
                          ? 'AI Bot will race here unless a human joins'
                          : 'Waiting for another player...'}
                      </div>
                    </div>
                  );
                }

                const kDef = getKartDefinition(occupant.kart_id);
                const isSelf = occupant.player_id === localPlayerId;
                const isOnline =
                  onlinePresenceIds.length === 0 ||
                  onlinePresenceIds.includes(occupant.player_id);

                return (
                  <div
                    key={occupant.id}
                    className={`flex min-h-[116px] flex-col justify-between rounded-xl border p-4 transition ${
                      isSelf
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-950/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">
                        SEAT #{seatIndex + 1} {isSelf ? '(YOU)' : ''}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {occupant.is_host && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                            <Crown className="h-3 w-3" /> HOST
                          </span>
                        )}
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                          title={isOnline ? 'Connected' : 'Syncing'}
                        />
                      </div>
                    </div>

                    <div className="my-1 flex items-center gap-2.5">
                      <span
                        className="h-8 w-8 shrink-0 rounded-lg border border-white/20"
                        style={{ backgroundColor: kDef.primaryColor }}
                      />
                      <div>
                        <div className="font-extrabold text-white">{occupant.nickname}</div>
                        <div className="text-xs text-slate-400">
                          {kDef.name} ({kDef.species})
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          occupant.is_ready || occupant.is_host
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {occupant.is_host
                          ? 'Host Ready'
                          : occupant.is_ready
                            ? 'READY!'
                            : 'Picking Kart...'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kart Selection Garage */}
            <div className="pt-2">
              <h3 className="mb-2.5 text-sm font-bold uppercase tracking-wider text-slate-300">
                Your Kart Selection
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KART_LIST.map((k) => {
                  const chosen = localPlayer?.kart_id === k.id;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => void onSelectKart(k.id)}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        chosen
                          ? 'border-cyan-400 bg-cyan-500/15'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{k.name}</span>
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: k.primaryColor }}
                        />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{k.tagline}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Race Settings & Launch Controls */}
          <section className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/75 p-5 lg:col-span-5">
            <div className="space-y-4">
              <h2 className="text-lg font-extrabold text-white">Race Settings</h2>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Circuit
                </label>
                <div className="grid gap-2">
                  {TRACK_LIST.map((t) => {
                    const selected = room.track_id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!isHost}
                        onClick={() => void onUpdateRoomSettings({ track_id: t.id as TrackId })}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                          selected
                            ? 'border-cyan-400 bg-cyan-500/15'
                            : 'border-slate-800 bg-slate-950/60'
                        } ${!isHost ? 'cursor-default opacity-85' : 'hover:border-slate-600'}`}
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{t.name}</div>
                          <div className="text-xs text-slate-400">{t.subtitle}</div>
                        </div>
                        <span className="text-xs font-bold" style={{ color: t.accentColor }}>
                          {t.difficulty}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Laps
                  </label>
                  <select
                    disabled={!isHost}
                    value={room.laps}
                    onChange={(e) => void onUpdateRoomSettings({ laps: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    <option value={1}>1 Lap</option>
                    <option value={2}>2 Laps</option>
                    <option value={3}>3 Laps</option>
                    <option value={5}>5 Laps</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Max Players
                  </label>
                  <select
                    disabled={!isHost}
                    value={room.max_players}
                    onChange={(e) =>
                      void onUpdateRoomSettings({ max_players: Number(e.target.value) })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    <option value={2}>2 Players</option>
                    <option value={3}>3 Players</option>
                    <option value={4}>4 Players</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5">
                <span className="text-sm font-semibold text-slate-200">Fill empty seats with AI</span>
                <input
                  type="checkbox"
                  disabled={!isHost}
                  checked={room.ai_fill}
                  onChange={(e) => void onUpdateRoomSettings({ ai_fill: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>
            </div>

            <div className="mt-6 space-y-3">
              {isHost ? (
                <>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2 text-xs text-slate-300">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span>
                      {nonHostTotal === 0
                        ? 'You can start right now (with AI bots) or wait for friends to join.'
                        : `${nonHostReadyCount}/${nonHostTotal} guest players ready.`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onStartRace()}
                    className="arcade-glow flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3.5 text-base font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110"
                  >
                    <Play className="h-5 w-5 fill-current" />
                    Start Race!
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void onToggleReady()}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-black uppercase tracking-wider transition ${
                    localPlayer?.is_ready
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                      : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                  }`}
                >
                  <Check className="h-5 w-5" />
                  {localPlayer?.is_ready ? 'Ready! (Waiting for Host)' : 'Mark Ready'}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
