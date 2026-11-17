'use client';

import React, { useState } from 'react';
import { OPERATOR_LIST } from '@/game/operators';
import type { GameMode, BrPlayer, BrRoom, MapId, OperatorId } from '@/game/types';
import { MAP_LIST } from '@/game/world';

interface WaitingRoomProps {
  room: BrRoom;
  players: BrPlayer[];
  localPlayerId: string;
  onlinePlayerIds: string[];
  onToggleReady: () => Promise<void>;
  onSelectOperator: (operatorId: OperatorId) => Promise<void>;
  onUpdateSettings: (opts: { mapId?: MapId; mode?: GameMode; botCount?: number }) => Promise<void>;
  onStartMatch: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  busy: boolean;
  errorMessage?: string | null;
}

export default function WaitingRoom({
  room,
  players,
  localPlayerId,
  onlinePlayerIds,
  onToggleReady,
  onSelectOperator,
  onUpdateSettings,
  onStartMatch,
  onLeaveRoom,
  busy,
  errorMessage,
}: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);

  const localPlayer = players.find((p) => p.player_id === localPlayerId);
  const isHost = room.host_id === localPlayerId || Boolean(localPlayer?.is_host);
  const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const allReady = sortedPlayers.length >= 1 && sortedPlayers.every((p) => p.is_host || p.is_ready);
  const canLaunch = isHost && (sortedPlayers.length >= 2 || room.bot_count >= 1) && allReady;

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}?room=${room.code}` : room.code;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#090d16_60%,_#03060d_100%)] px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Top Banner */}
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-amber-500/30 bg-slate-900/80 p-6 backdrop-blur sm:flex-row sm:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-mono text-xs font-black tracking-widest text-amber-300">
                CODE: {room.code}
              </span>
              <span className="rounded-lg bg-cyan-500/15 px-2.5 py-1 text-xs font-bold text-cyan-300">
                {room.mode === 'coop_squad' ? 'Co-op Squad vs Bots' : 'PvP Free-For-All'}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white sm:text-3xl">{room.name}</h1>
            <p className="text-xs text-slate-400">
              {sortedPlayers.length}/{room.max_players} Human Survivors • {room.bot_count} AI Rivals
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-xs font-black text-cyan-200 transition hover:bg-cyan-500/25"
            >
              {copied ? 'Invite Link Copied!' : 'Copy Invite Link'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLeaveRoom()}
              className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-black text-rose-200 transition hover:bg-rose-500/20"
            >
              Leave Lobby
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/50 bg-rose-950/60 px-4 py-3 text-sm font-semibold text-rose-200">
            {errorMessage}
          </div>
        )}

        {/* Squad Roster + Settings */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* 4 Drop Pod Seats */}
          <div className="space-y-3 rounded-3xl border border-slate-700/80 bg-slate-900/75 p-6 lg:col-span-7">
            <h2 className="text-sm font-black tracking-wider text-slate-300 uppercase">
              Drop Pod Roster ({sortedPlayers.length}/{room.max_players})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: room.max_players }).map((_, seat) => {
                const p = sortedPlayers.find((item) => item.seat_index === seat);
                if (!p) {
                  return (
                    <div
                      key={seat}
                      className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-xs font-semibold text-slate-500"
                    >
                      Open Slot #{seat + 1} — Share Code {room.code}
                    </div>
                  );
                }

                const op = OPERATOR_LIST.find((o) => o.id === p.operator_id) ?? OPERATOR_LIST[0];
                const isOnline =
                  onlinePlayerIds.length === 0 || onlinePlayerIds.includes(p.player_id);
                const isMe = p.player_id === localPlayerId;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-2xl border p-3.5 ${
                      isMe
                        ? 'border-cyan-400/50 bg-cyan-950/25'
                        : 'border-slate-800 bg-slate-950/75'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/25 text-xs font-black text-white shadow-inner"
                        style={{ backgroundColor: op.suitColor }}
                      >
                        {op.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-black text-white">
                            {p.nickname}
                          </span>
                          {p.is_host && (
                            <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-black text-amber-300">
                              HOST
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                          <span>{op.name}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase ${
                        p.is_host || p.is_ready
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p.is_host ? 'Leader' : p.is_ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Operator Selector */}
            <div className="pt-3">
              <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">
                Select Tactical Operator Armor
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OPERATOR_LIST.map((op) => {
                  const chosen = localPlayer?.operator_id === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void onSelectOperator(op.id)}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                        chosen
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                      }`}
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-white/40"
                        style={{ backgroundColor: op.suitColor }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white">{op.name}</div>
                        <div className="truncate text-[10px] text-slate-400">{op.role}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Match Settings & Launch */}
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-700/80 bg-slate-900/75 p-6 lg:col-span-5">
            <div className="space-y-4">
              <h2 className="text-sm font-black tracking-wider text-slate-300 uppercase">
                Match Configuration
              </h2>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-400 uppercase">
                  Map Biome
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {MAP_LIST.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!isHost || busy}
                      onClick={() => void onUpdateSettings({ mapId: m.id })}
                      className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
                        room.map_id === m.id
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-slate-800 bg-slate-950/70'
                      } ${!isHost ? 'cursor-default opacity-80' : 'hover:border-slate-600'}`}
                    >
                      <div>
                        <div className="text-xs font-black text-white">{m.name}</div>
                        <div className="text-[11px] text-slate-400">{m.subtitle}</div>
                      </div>
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: m.accentColor }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-400 uppercase">
                    Mode
                  </label>
                  <select
                    disabled={!isHost || busy}
                    value={room.mode}
                    onChange={(e) => void onUpdateSettings({ mode: e.target.value as GameMode })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
                  >
                    <option value="pvp_royale">PvP Free-For-All</option>
                    <option value="coop_squad">Co-op Squad vs Bots</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-400 uppercase">
                    AI Rivals ({room.bot_count})
                  </label>
                  <select
                    disabled={!isHost || busy}
                    value={room.bot_count}
                    onChange={(e) => void onUpdateSettings({ botCount: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
                  >
                    {[0, 3, 6, 8, 10, 12].map((b) => (
                      <option key={b} value={b}>
                        {b} Bots
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {!isHost ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onToggleReady()}
                  className={`w-full rounded-2xl px-5 py-3.5 text-sm font-black uppercase transition ${
                    localPlayer?.is_ready
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-amber-500 text-slate-950 hover:brightness-110'
                  }`}
                >
                  {localPlayer?.is_ready ? 'Ready! Waiting for Host' : 'Mark Ready'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !canLaunch}
                  onClick={() => void onStartMatch()}
                  className="royale-glow w-full rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 px-5 py-4 text-sm font-black tracking-wide text-slate-950 uppercase transition hover:brightness-110 disabled:opacity-45"
                >
                  {!allReady
                    ? 'Waiting for All Players to Ready Up...'
                    : sortedPlayers.length < 2 && room.bot_count === 0
                      ? 'Need 2+ Humans or 1+ Bot to Launch'
                      : `Deploy Match (${sortedPlayers.length + room.bot_count} Combatants)`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
