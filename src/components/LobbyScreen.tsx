'use client';

import React, { useEffect, useState } from 'react';
import {
  Flag,
  Gamepad2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { KART_LIST } from '@/game/karts';
import { formatRaceTime } from '@/game/multiplayer';
import { TRACK_LIST } from '@/game/tracks';
import type { KartId, LobbyRoom, TrackId } from '@/game/types';

interface PublicRoomSummary extends LobbyRoom {
  room_players?: Array<{
    id: string;
    nickname: string;
    kart_id: KartId;
    seat_index: number;
    is_host: boolean;
    is_ready: boolean;
  }>;
}

interface LeaderboardRow {
  id: string;
  track_id: TrackId;
  nickname: string;
  kart_id: KartId;
  finish_position: number;
  total_time_ms: number;
  best_lap_ms: number | null;
}

interface LobbyScreenProps {
  nickname: string;
  kartId: KartId;
  onChangeNickname: (nick: string) => void;
  onChangeKart: (kart: KartId) => void;
  onPlaySingle: (opts: {
    trackId: TrackId;
    laps: number;
    aiCount: number;
  }) => void;
  onCreateRoom: (opts: {
    name: string;
    trackId: TrackId;
    laps: number;
    maxPlayers: number;
    aiFill: boolean;
  }) => Promise<void>;
  onJoinRoom: (code: string) => Promise<void>;
  busy: boolean;
  errorMsg: string | null;
  initialJoinCode?: string;
}

export default function LobbyScreen({
  nickname,
  kartId,
  onChangeNickname,
  onChangeKart,
  onPlaySingle,
  onCreateRoom,
  onJoinRoom,
  busy,
  errorMsg,
  initialJoinCode = '',
}: LobbyScreenProps) {
  const [singleTrackId, setSingleTrackId] = useState<TrackId>('lighthouse_bay');
  const [singleLaps, setSingleLaps] = useState(3);
  const [singleAiCount, setSingleAiCount] = useState(3);

  const [roomName, setRoomName] = useState('Sunday Grand Prix');
  const [trackId, setTrackId] = useState<TrackId>('lighthouse_bay');
  const [laps, setLaps] = useState(3);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [aiFill, setAiFill] = useState(true);
  const [joinCode, setJoinCode] = useState(initialJoinCode);

  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [leaderboardTrack, setLeaderboardTrack] = useState<TrackId>('lighthouse_bay');
  const [records, setRecords] = useState<LeaderboardRow[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
        setPublicRooms(data.rooms ?? []);
      }
    } catch {
      // ignore transient network errors
    } finally {
      setLoadingRooms(false);
    }
  };

  const fetchLeaderboard = async (tid: TrackId) => {
    setLoadingRecords(true);
    try {
      const res = await fetch(`/api/leaderboard?trackId=${tid}`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { results?: LeaderboardRow[] };
        setRecords(data.results ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    void fetchRooms();
    const timer = setInterval(() => void fetchRooms(), 8000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void fetchLeaderboard(leaderboardTrack);
  }, [leaderboardTrack]);

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode.toUpperCase());
    }
  }, [initialJoinCode]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#0f294a_0%,_#060913_65%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-cyan-500/25 bg-slate-900/75 p-5 shadow-2xl backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
              <Zap className="h-4 w-4" />
              SuperTuxKart-Inspired WebGL 3D Racer
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
              TUXKART <span className="text-cyan-400">RUSH</span>
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Real-time 3–4 player online multiplayer kart racing powered by Three.js + Supabase Realtime.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-col">
              <label className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Driver Nickname
              </label>
              <input
                type="text"
                maxLength={20}
                value={nickname}
                onChange={(e) => onChangeNickname(e.target.value)}
                placeholder="Your Name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3.5 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-400 sm:w-48"
              />
            </div>
            <div className="flex items-center gap-1.5 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 sm:mt-5">
              <ShieldCheck className="h-4 w-4" />
              Online Ready
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="mb-5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm font-medium text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Driver Kart Quick Pick */}
        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-200">
              <Gamepad2 className="h-4 w-4 text-cyan-400" />
              Choose Your Racer
            </h2>
            <span className="text-xs text-slate-400">You can also switch karts inside the lobby</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {KART_LIST.map((k) => {
              const selected = k.id === kartId;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onChangeKart(k.id)}
                  className={`group rounded-xl border p-3 text-left transition ${
                    selected
                      ? 'border-cyan-400 bg-cyan-500/15 shadow-lg shadow-cyan-500/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-white">{k.name}</span>
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-white/40"
                      style={{ backgroundColor: k.primaryColor }}
                    />
                  </div>
                  <div className="text-[11px] font-medium text-slate-400">{k.species}</div>
                  <div className="mt-2 space-y-1 text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <span>Speed</span>
                      <span className="font-bold text-slate-200">{Math.round((k.maxSpeed / 60) * 100)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Drift</span>
                      <span className="font-bold text-cyan-300">{Math.round(k.driftBoost * 100)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Single Player Quick Play */}
        <section className="mb-6 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-slate-900/80 to-cyan-500/10 p-5 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                <Zap className="h-4 w-4" />
                Instant Solo Arcade Mode
              </div>
              <h2 className="mt-1 text-xl font-black text-white">
                Play Single Player
              </h2>
              <p className="mt-0.5 text-xs text-slate-300">
                Jump straight onto the track solo or race up to 3 AI bots immediately—no lobby wait required.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 lg:w-auto">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Circuit
                </label>
                <select
                  value={singleTrackId}
                  onChange={(e) => setSingleTrackId(e.target.value as TrackId)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-amber-400"
                >
                  {TRACK_LIST.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Opponents
                </label>
                <select
                  value={singleAiCount}
                  onChange={(e) => setSingleAiCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-amber-400"
                >
                  <option value={3}>3 AI Bots (4 Karts)</option>
                  <option value={2}>2 AI Bots (3 Karts)</option>
                  <option value={1}>1 AI Rival (1v1)</option>
                  <option value={0}>Solo Time Trial</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Laps
                </label>
                <select
                  value={singleLaps}
                  onChange={(e) => setSingleLaps(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-amber-400"
                >
                  <option value={1}>1 Lap</option>
                  <option value={2}>2 Laps</option>
                  <option value={3}>3 Laps</option>
                  <option value={5}>5 Laps</option>
                </select>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onPlaySingle({
                    trackId: singleTrackId,
                    laps: singleLaps,
                    aiCount: singleAiCount,
                  })
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:brightness-110 disabled:opacity-50"
              >
                <Flag className="h-4 w-4" />
                Play Solo
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Create 3-4 Player Room */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 lg:col-span-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
              <Plus className="h-5 w-5 text-cyan-400" />
              Host Multiplayer Room (Up to 4 Players)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Create a room and share the 6-character code with 2–3 friends, or test right away with AI bots.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Room Name
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Circuit
                </label>
                <div className="grid gap-2">
                  {TRACK_LIST.map((t) => {
                    const active = t.id === trackId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTrackId(t.id)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                          active
                            ? 'border-cyan-400 bg-cyan-500/15'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{t.name}</div>
                          <div className="text-xs text-slate-400">{t.subtitle}</div>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{
                            backgroundColor: `${t.accentColor}22`,
                            color: t.accentColor,
                          }}
                        >
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
                    Max Players
                  </label>
                  <select
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-cyan-400"
                  >
                    <option value={4}>4 Players (Recommended)</option>
                    <option value={3}>3 Players</option>
                    <option value={2}>2 Players</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Laps
                  </label>
                  <select
                    value={laps}
                    onChange={(e) => setLaps(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-cyan-400"
                  >
                    <option value={1}>1 Lap (Quick)</option>
                    <option value={2}>2 Laps</option>
                    <option value={3}>3 Laps (Standard)</option>
                    <option value={5}>5 Laps (Endurance)</option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-white">Fill Empty Seats with AI Bots</div>
                  <div className="text-xs text-slate-400">
                    Race a full 4-kart grid even before all 4 humans join
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={aiFill}
                  onChange={(e) => setAiFill(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onCreateRoom({
                    name: roomName,
                    trackId,
                    laps,
                    maxPlayers,
                    aiFill,
                  })
                }
                className="arcade-glow flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <Flag className="h-4 w-4" />
                {busy ? 'Creating Room...' : 'Create Multiplayer Room'}
              </button>
            </div>
          </section>

          {/* Right: Join by Code, Active Rooms, Leaderboard */}
          <div className="space-y-6 lg:col-span-7">
            {/* Join by Code */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
                <Users className="h-5 w-5 text-emerald-400" />
                Join a Friend&apos;s Room
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (joinCode.trim()) void onJoinRoom(joinCode.trim().toUpperCase());
                }}
                className="mt-3 flex flex-col gap-2.5 sm:flex-row"
              >
                <input
                  type="text"
                  maxLength={8}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-char room code (e.g. KART42)"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono text-base font-bold uppercase tracking-widest text-cyan-300 outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={busy || joinCode.trim().length < 4}
                  className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:bg-emerald-400 disabled:opacity-40"
                >
                  Join Room
                </button>
              </form>

              {/* Public Rooms List */}
              <div className="mt-5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Open Multiplayer Lobbies
                  </span>
                  <button
                    type="button"
                    onClick={() => void fetchRooms()}
                    className="flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {publicRooms.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-xs text-slate-400">
                    No active rooms right now. Click &ldquo;Create Multiplayer Room&rdquo; to start a 3–4 player match!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {publicRooms.map((r) => {
                      const count = r.room_players?.length ?? 0;
                      const joinable = r.status === 'waiting' && count < r.max_players;
                      const trackMeta = TRACK_LIST.find((t) => t.id === r.track_id);
                      return (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{r.name}</span>
                              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-cyan-300">
                                {r.code}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {trackMeta?.name ?? r.track_id} • {r.laps} Laps •{' '}
                              <span className="font-semibold text-slate-200">
                                {count}/{r.max_players} Players
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!joinable || busy}
                            onClick={() => void onJoinRoom(r.code)}
                            className="rounded-lg bg-cyan-500/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-500 hover:text-slate-950 disabled:opacity-40"
                          >
                            {r.status !== 'waiting' ? 'In Race' : count >= r.max_players ? 'Full' : 'Join'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Track Records Leaderboard */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
                  <Trophy className="h-5 w-5 text-amber-400" />
                  Track Leaderboard
                </h2>
                <div className="flex gap-1.5">
                  {TRACK_LIST.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setLeaderboardTrack(t.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        leaderboardTrack === t.id
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {t.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {loadingRecords ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading times...</div>
              ) : records.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-5 text-center text-xs text-slate-400">
                  No recorded times yet on this circuit. Finish a race to set the track record!
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Driver</th>
                        <th className="py-2 pr-3">Kart</th>
                        <th className="py-2 pr-3">Total Time</th>
                        <th className="py-2">Best Lap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 6).map((row, idx) => (
                        <tr key={row.id} className="border-b border-slate-800/50 text-slate-200">
                          <td className="py-2 pr-3 font-black text-amber-400">{idx + 1}</td>
                          <td className="py-2 pr-3 font-semibold">{row.nickname}</td>
                          <td className="py-2 pr-3 uppercase text-slate-400">{row.kart_id}</td>
                          <td className="py-2 pr-3 font-mono font-bold text-cyan-300">
                            {formatRaceTime(row.total_time_ms)}
                          </td>
                          <td className="py-2 font-mono text-slate-400">
                            {formatRaceTime(row.best_lap_ms)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                <Sparkles className="h-4 w-4 shrink-0 text-cyan-400" />
                <span>
                  Controls: <strong className="text-slate-200">WASD / Arrows</strong> Drive •{' '}
                  <strong className="text-slate-200">Space</strong> Drift + Mini-Turbo •{' '}
                  <strong className="text-slate-200">E / Enter</strong> Use Item •{' '}
                  <strong className="text-slate-200">R</strong> Reset
                </span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
