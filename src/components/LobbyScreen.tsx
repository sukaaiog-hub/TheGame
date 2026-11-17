'use client';

import React, { useEffect, useState } from 'react';
import { formatDurationMs } from '@/game/multiplayer';
import { OPERATOR_LIST } from '@/game/operators';
import type { GameMode, BrPublicRoomSummary, LeaderboardRow, MapId, OperatorId } from '@/game/types';
import { MAP_LIST } from '@/game/world';

interface LobbyScreenProps {
  nickname: string;
  operatorId: OperatorId;
  onUpdateIdentity: (nickname: string, operatorId: OperatorId) => void;
  onCreateRoom: (opts: {
    roomName: string;
    mapId: MapId;
    mode: GameMode;
    maxPlayers: number;
    botCount: number;
  }) => Promise<void>;
  onJoinRoom: (code: string) => Promise<void>;
  onStartSolo: (mapId: MapId, botCount: number) => void;
  busy: boolean;
  errorMessage: string | null;
}

export default function LobbyScreen({
  nickname,
  operatorId,
  onUpdateIdentity,
  onCreateRoom,
  onJoinRoom,
  onStartSolo,
  busy,
  errorMessage,
}: LobbyScreenProps) {
  const [nameInput, setNameInput] = useState(nickname);
  const [selectedOp, setSelectedOp] = useState<OperatorId>(operatorId);
  const [roomName, setRoomName] = useState('Dropzone Alpha');
  const [mapId, setMapId] = useState<MapId>('verdan_valley');
  const [mode, setMode] = useState<GameMode>('pvp_royale');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [botCount, setBotCount] = useState(8);
  const [soloMapId, setSoloMapId] = useState<MapId>('verdan_valley');
  const [soloBots, setSoloBots] = useState(9);
  const [joinCode, setJoinCode] = useState('');
  const [openRooms, setOpenRooms] = useState<BrPublicRoomSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [lbMap, setLbMap] = useState<MapId | 'all'>('all');

  useEffect(() => {
    setNameInput(nickname);
  }, [nickname]);

  useEffect(() => {
    setSelectedOp(operatorId);
  }, [operatorId]);

  const fetchLobbyData = async (filterMap: MapId | 'all') => {
    try {
      const [roomsRes, lbRes] = await Promise.all([
        fetch('/api/rooms', { cache: 'no-store' }),
        fetch(
          filterMap === 'all' ? '/api/leaderboard' : `/api/leaderboard?mapId=${filterMap}`,
          { cache: 'no-store' }
        ),
      ]);
      if (roomsRes.ok) {
        const json = (await roomsRes.json()) as { rooms?: BrPublicRoomSummary[] };
        setOpenRooms(json.rooms ?? []);
      }
      if (lbRes.ok) {
        const json = (await lbRes.json()) as { results?: LeaderboardRow[] };
        setLeaderboard(json.results ?? []);
      }
    } catch {
      // ignore offline transient polling
    }
  };

  useEffect(() => {
    void fetchLobbyData(lbMap);
    const id = setInterval(() => void fetchLobbyData(lbMap), 7000);
    return () => clearInterval(id);
  }, [lbMap]);

  const handleSelectOperator = (op: OperatorId) => {
    setSelectedOp(op);
    onUpdateIdentity(nameInput.trim() || nickname, op);
  };

  const commitNickname = () => {
    const clean = nameInput.trim().slice(0, 18) || nickname;
    setNameInput(clean);
    onUpdateIdentity(clean, selectedOp);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#090d16_58%,_#03060d_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <header className="mb-7 flex flex-col justify-between gap-4 rounded-3xl border border-amber-500/25 bg-slate-900/75 p-6 backdrop-blur-md lg:flex-row lg:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-xs font-bold tracking-widest text-amber-300 uppercase">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Top-Down Tactical Battle Royale • 3–4 Players + AI Rivals
            </div>
            <h1 className="bg-gradient-to-r from-amber-300 via-orange-200 to-cyan-300 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-5xl">
              DROPZONE ROYALE
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
              Loot military crates &amp; orbital airdrops, weave between cutaway buildings and trees,
              throw frag grenades, and outlast rival players inside the shrinking electric storm.
            </p>
          </div>

          {/* Callsign + Quick Operator Preview */}
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/75 p-4 lg:w-80">
            <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Operator Callsign
            </label>
            <input
              type="text"
              maxLength={18}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitNickname}
              placeholder="Enter callsign..."
              className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-bold text-white outline-none transition focus:border-amber-400"
            />
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {OPERATOR_LIST.map((op) => {
                const active = selectedOp === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => handleSelectOperator(op.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs font-bold transition ${
                      active
                        ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-white/40"
                      style={{ backgroundColor: op.suitColor }}
                    />
                    <span className="truncate">{op.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-rose-500/50 bg-rose-950/60 px-4 py-3 text-sm font-semibold text-rose-200">
            {errorMessage}
          </div>
        )}

        {/* Primary Cards Grid */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Host Multiplayer Match */}
          <section className="rounded-3xl border border-amber-500/30 bg-slate-900/75 p-6 backdrop-blur lg:col-span-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Host 3–4P Royale Lobby</h2>
              <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">
                Realtime PvP / Co-op
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
                  Lobby Name
                </label>
                <input
                  type="text"
                  maxLength={28}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm font-semibold text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
                  Drop Zone Map
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {MAP_LIST.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMapId(m.id)}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        mapId === m.id
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: m.accentColor }}
                        />
                        <span className="truncate text-xs font-black text-white">{m.name}</span>
                      </div>
                      <p className="line-clamp-2 text-[10px] leading-tight text-slate-400">
                        {m.subtitle}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
                    Match Rules
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as GameMode)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-400"
                  >
                    <option value="pvp_royale">PvP Free-For-All</option>
                    <option value="coop_squad">Co-op Squad vs Bots</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
                    Human Slots ({maxPlayers})
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[2, 3, 4].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setMaxPlayers(cnt)}
                        className={`rounded-xl border py-2 text-xs font-black transition ${
                          maxPlayers === cnt
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        {cnt}P
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>AI Rival Combatants</span>
                  <span className="text-amber-300">{botCount} Bots</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={botCount}
                  onChange={(e) => setBotCount(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-amber-400"
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  commitNickname();
                  void onCreateRoom({
                    roomName: roomName.trim() || 'Dropzone Alpha',
                    mapId,
                    mode,
                    maxPlayers,
                    botCount,
                  });
                }}
                className="royale-glow w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3.5 text-sm font-black tracking-wide text-slate-950 uppercase transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Deploying Lobby...' : 'Create Multiplayer Lobby'}
              </button>
            </div>
          </section>

          {/* Center Column: Join + Instant Solo Drop */}
          <section className="flex flex-col gap-6 lg:col-span-4">
            {/* Instant Solo vs Bots */}
            <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/75 p-6 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-black text-white">Instant Solo Drop</h2>
                <span className="rounded-lg bg-cyan-500/20 px-2.5 py-1 text-xs font-bold text-cyan-300">
                  Play Immediately
                </span>
              </div>
              <p className="mb-4 text-xs text-slate-400">
                Drop straight onto the island against smart AI scavengers. Great for practicing
                loot routes, grenades, and gunplay.
              </p>

              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {MAP_LIST.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSoloMapId(m.id)}
                    className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                      soloMapId === m.id
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {m.name.split(' ')[0]}
                  </button>
                ))}
              </div>

              <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                <span className="font-bold text-slate-400">Enemy Bots</span>
                <div className="flex gap-1.5">
                  {[5, 9, 12].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setSoloBots(b)}
                      className={`rounded-lg px-2.5 py-1 font-black ${
                        soloBots === b
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  commitNickname();
                  onStartSolo(soloMapId, soloBots);
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-3 text-sm font-black tracking-wide text-slate-950 uppercase transition hover:brightness-110"
              >
                Drop Solo vs {soloBots} Bots
              </button>
            </div>

            {/* Join Room by Code + Open Rooms */}
            <div className="flex-1 rounded-3xl border border-slate-700/80 bg-slate-900/75 p-6 backdrop-blur">
              <h2 className="mb-3 text-lg font-black text-white">Join Friend&apos;s Room</h2>
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-black tracking-widest text-amber-300 uppercase outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={busy || joinCode.trim().length < 4}
                  onClick={() => {
                    commitNickname();
                    void onJoinRoom(joinCode.trim().toUpperCase());
                  }}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-950 uppercase transition hover:bg-amber-300 disabled:opacity-40"
                >
                  Join
                </button>
              </div>

              <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                Active Drop Lobbies ({openRooms.length})
              </div>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {openRooms.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                    No open rooms right now. Create one or drop solo!
                  </p>
                ) : (
                  openRooms.map((r) => {
                    const count = r.br_players?.length ?? 0;
                    const joinable = r.status === 'waiting' && count < r.max_players;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-black text-white">{r.name}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                              {r.code}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {count}/{r.max_players} Humans • {r.bot_count} Bots •{' '}
                            {r.mode === 'coop_squad' ? 'Co-op' : 'FFA'}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!joinable || busy}
                          onClick={() => {
                            commitNickname();
                            void onJoinRoom(r.code);
                          }}
                          className="ml-2 shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-black text-amber-300 transition hover:bg-amber-400 hover:text-slate-950 disabled:opacity-35"
                        >
                          {r.status === 'waiting' ? 'Join' : 'In Match'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Right Column: Controls Guide & Top Survivors Leaderboard */}
          <section className="flex flex-col gap-6 lg:col-span-3">
            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 backdrop-blur">
              <h3 className="mb-3 text-sm font-black tracking-wider text-amber-300 uppercase">
                Combat Controls
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex justify-between">
                  <span className="text-slate-400">Move</span>
                  <span className="font-bold text-white">W A S D / Arrows</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Aim &amp; Fire</span>
                  <span className="font-bold text-white">Mouse + Left Click</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Open Crate / Loot</span>
                  <span className="font-bold text-cyan-300">E or F</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Throw Frag Grenade</span>
                  <span className="font-bold text-orange-300">G or Right Click</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Tactical Dash</span>
                  <span className="font-bold text-emerald-300">Shift / Space</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Reload / Medkit</span>
                  <span className="font-bold text-white">R / H</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Swap Weapons</span>
                  <span className="font-bold text-white">1 / 2 / Q / Wheel</span>
                </li>
              </ul>
            </div>

            <div className="flex-1 rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-black tracking-wider text-cyan-300 uppercase">
                  Top Survivors
                </h3>
                <select
                  value={lbMap}
                  onChange={(e) => setLbMap(e.target.value as MapId | 'all')}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-bold text-slate-200"
                >
                  <option value="all">All Maps</option>
                  {MAP_LIST.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                {leaderboard.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                    No recorded matches yet. Claim the first Victory Royale!
                  </p>
                ) : (
                  leaderboard.slice(0, 8).map((row, idx) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800/90 bg-slate-950/60 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`font-black ${
                            row.placement === 1 ? 'text-amber-300' : 'text-slate-400'
                          }`}
                        >
                          #{row.placement}
                        </span>
                        <span className="truncate font-bold text-white">{row.nickname}</span>
                      </div>
                      <div className="shrink-0 text-right font-mono text-[11px] text-slate-300">
                        <span className="font-bold text-rose-300">{row.kills}K</span> •{' '}
                        {formatDurationMs(row.survival_ms)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
