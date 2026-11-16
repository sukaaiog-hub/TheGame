'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Flag,
  LogOut,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { computeAiInput } from '@/game/ai';
import { SoundEngine } from '@/game/audio';
import {
  applyHitToRacer,
  POWERUP_META,
  stepItemBoxes,
  stepProjectiles,
  useRacerItem,
} from '@/game/items';
import { getKartDefinition } from '@/game/karts';
import {
  applyRemotePacket,
  buildRaceRoster,
  extrapolateRemoteKart,
  formatRaceTime,
  MultiplayerRoomChannel,
  toNetworkPacket,
} from '@/game/multiplayer';
import { resolveKartCollisions, stepKartPhysics } from '@/game/physics';
import { KartSceneRenderer } from '@/game/renderer';
import { buildStandings, updateRacePositions } from '@/game/standings';
import { buildTrackData } from '@/game/tracks';
import type {
  InputState,
  ItemBoxState,
  LobbyPlayer,
  LobbyRoom,
  MultiplayerBroadcast,
  PowerupType,
  ProjectileState,
  RacerState,
  RaceStanding,
} from '@/game/types';

interface RaceHudSnapshot {
  countdownLabel: string;
  canMove: boolean;
  elapsedMs: number;
  position: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  speedKmh: number;
  driftTier: 0 | 1 | 2 | 3;
  heldItem: PowerupType | null;
  shieldActive: boolean;
  boosting: boolean;
  localFinished: boolean;
  standings: RaceStanding[];
  racersMinimap: Array<{
    id: string;
    x: number;
    z: number;
    color: string;
    isLocal: boolean;
    position: number;
    nickname: string;
  }>;
}

interface RaceViewProps {
  room: LobbyRoom;
  players: LobbyPlayer[];
  localPlayerId: string;
  startAtEpochMs: number;
  channelRef: React.MutableRefObject<MultiplayerRoomChannel | null>;
  incomingBroadcastRef: React.MutableRefObject<((msg: MultiplayerBroadcast) => void) | null>;
  onRematch: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

export default function RaceView({
  room,
  players,
  localPlayerId,
  startAtEpochMs,
  channelRef,
  incomingBroadcastRef,
  onRematch,
  onLeaveRoom,
}: RaceViewProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<KartSceneRenderer | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);

  const track = useMemo(() => buildTrackData(room.track_id), [room.track_id]);
  const isHost = room.host_id === localPlayerId;

  const [muted, setMuted] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);

  const [hud, setHud] = useState<RaceHudSnapshot>({
    countdownLabel: '3',
    canMove: false,
    elapsedMs: 0,
    position: 1,
    totalRacers: players.length,
    lap: 1,
    totalLaps: room.laps,
    speedKmh: 0,
    driftTier: 0,
    heldItem: null,
    shieldActive: false,
    boosting: false,
    localFinished: false,
    standings: [],
    racersMinimap: [],
  });

  // Live input state ref (keyboard + touch)
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<{
    left: boolean;
    right: boolean;
    throttle: boolean;
    brake: boolean;
    drift: boolean;
    useItem: boolean;
    rescue: boolean;
  }>({
    left: false,
    right: false,
    throttle: false,
    brake: false,
    drift: false,
    useItem: false,
    rescue: false,
  });
  const itemTriggerQueuedRef = useRef(false);
  const rescueQueuedRef = useRef(false);

  // Minimap coordinate bounds
  const minimapBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of track.samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z;
      if (s.z > maxZ) maxZ = s.z;
    }
    const pad = 32;
    minX -= pad;
    maxX += pad;
    minZ -= pad;
    maxZ += pad;
    const span = Math.max(maxX - minX, maxZ - minZ, 1);
    return { minX, minZ, span };
  }, [track]);

  const minimapPath = useMemo(() => {
    const pts = track.samples
      .filter((_, idx) => idx % 3 === 0)
      .map((s) => {
        const px = 120 - ((s.x - minimapBounds.minX) / minimapBounds.span) * 120;
        const py = ((s.z - minimapBounds.minZ) / minimapBounds.span) * 120;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      });
    return `M ${pts.join(' L ')} Z`;
  }, [track, minimapBounds]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
      setShowTouchControls(true);
    }
  }, []);

  useEffect(() => {
    if (!canvasHostRef.current) return;

    const sound = new SoundEngine();
    soundRef.current = sound;
    const renderer = new KartSceneRenderer(canvasHostRef.current, track);
    rendererRef.current = renderer;

    const racers: RacerState[] = buildRaceRoster(room, players, localPlayerId, track);
    const itemBoxes: ItemBoxState[] = track.initialItemBoxes.map((b) => ({ ...b }));
    const projectiles: ProjectileState[] = [];

    let packetSeq = 1;
    let lastBroadcastAt = 0;
    let lastHudAt = 0;
    let lastCountdownStep = 4;
    let raceActive = false;
    let resultSubmitted = false;
    let lastTime = performance.now();

    const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => {
        setToast((prev) => (prev === msg ? null : prev));
      }, 2800);
    };

    const submitLocalResult = async (local: RacerState) => {
      if (resultSubmitted || !local.finishTimeMs) return;
      resultSubmitted = true;
      try {
        await fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: room.id,
            trackId: room.track_id,
            playerId: local.id,
            nickname: local.nickname,
            kartId: local.kartId,
            isAi: false,
            finishPosition: local.position,
            totalTimeMs: local.finishTimeMs,
            bestLapMs: local.bestLapMs,
          }),
        });
      } catch {
        // ignore network issues on result save
      }
    };

    // Wire real-time broadcast handler
    incomingBroadcastRef.current = (msg: MultiplayerBroadcast) => {
      if (msg.type === 'kart_state') {
        const target = racers.find((r) => r.id === msg.packet.id && !r.isLocal);
        if (target) applyRemotePacket(target, msg.packet);
      } else if (msg.type === 'ai_batch' && !isHost) {
        for (const pkt of msg.packets) {
          const target = racers.find((r) => r.id === pkt.id && r.isAi);
          if (target) applyRemotePacket(target, pkt);
        }
      } else if (msg.type === 'item_box_taken') {
        const box = itemBoxes.find((b) => b.id === msg.boxId);
        if (box) {
          box.active = false;
          box.respawnTimer = 4.2;
        }
      } else if (msg.type === 'projectile_spawn') {
        if (!projectiles.some((p) => p.id === msg.projectile.id)) {
          projectiles.push({ ...msg.projectile });
        }
      } else if (msg.type === 'racer_hit') {
        const target = racers.find((r) => r.id === msg.targetId);
        const attacker = racers.find((r) => r.id === msg.attackerId);
        if (target) {
          const res = applyHitToRacer(target);
          if (target.isLocal) sound.playHit(res.blockedByShield);
          if (attacker) {
            showToast(
              res.blockedByShield
                ? `${target.nickname} blocked ${attacker.nickname}'s attack!`
                : `${attacker.nickname} hit ${target.nickname} with ${POWERUP_META[msg.kind].name}!`
            );
          }
        }
      }
    };

    // Keyboard listeners
    const onKeyDown = (e: KeyboardEvent) => {
      sound.unlock();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!keysRef.current[e.code]) {
        if (e.code === 'KeyE' || e.code === 'Enter') itemTriggerQueuedRef.current = true;
        if (e.code === 'KeyR') rescueQueuedRef.current = true;
        if (e.code === 'KeyC') renderer.toggleCameraMode();
      }
      keysRef.current[e.code] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);

    let rafId = 0;

    const frame = (nowPerf: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (nowPerf - lastTime) / 1000));
      lastTime = nowPerf;

      const epochNow = Date.now();
      const msUntilStart = startAtEpochMs - epochNow;
      const elapsedMs = Math.max(0, epochNow - startAtEpochMs);

      let countdownLabel = '';
      if (msUntilStart > 2100) {
        countdownLabel = '3';
        if (lastCountdownStep > 3) {
          lastCountdownStep = 3;
          sound.playCountdownBeep(false);
        }
      } else if (msUntilStart > 1100) {
        countdownLabel = '2';
        if (lastCountdownStep > 2) {
          lastCountdownStep = 2;
          sound.playCountdownBeep(false);
        }
      } else if (msUntilStart > 100) {
        countdownLabel = '1';
        if (lastCountdownStep > 1) {
          lastCountdownStep = 1;
          sound.playCountdownBeep(false);
        }
      } else if (msUntilStart > -850) {
        countdownLabel = 'GO!';
        if (!raceActive) {
          raceActive = true;
          sound.playCountdownBeep(true);
        }
      } else {
        raceActive = true;
      }

      const canMove = msUntilStart <= 0;

      // Read local input
      const k = keysRef.current;
      const t = touchRef.current;
      const throttle = k['ArrowUp'] || k['KeyW'] || t.throttle ? 1 : 0;
      const brake = k['ArrowDown'] || k['KeyS'] || t.brake ? 1 : 0;
      const left = k['ArrowLeft'] || k['KeyA'] || t.left ? 1 : 0;
      const right = k['ArrowRight'] || k['KeyD'] || t.right ? 1 : 0;
      const drift = Boolean(k['Space'] || k['ShiftLeft'] || k['ShiftRight'] || t.drift);
      const useItem = itemTriggerQueuedRef.current || t.useItem;
      const rescue = rescueQueuedRef.current || t.rescue;
      itemTriggerQueuedRef.current = false;
      rescueQueuedRef.current = false;
      t.useItem = false;
      t.rescue = false;

      const localRacer = racers.find((r) => r.isLocal) ?? racers[0];

      // Step local player & host AI bots; extrapolate remote peers
      for (const r of racers) {
        if (r.isLocal) {
          const input: InputState = r.finished
            ? computeAiInput(r, racers, track, elapsedMs)
            : { throttle, brake, steer: right - left, drift, useItem, rescue };

          const prevLap = r.lap;
          const prevBoost = r.boostTimer;
          const stepRes = stepKartPhysics(r, input, track, dt, elapsedMs, room.laps, canMove);

          if (stepRes.triggeredDriftBoostTier > 0 || (prevBoost <= 0.05 && r.boostTimer > 0.5)) {
            sound.playBoost();
          }
          if (r.lap > prevLap && stepRes.completedLap) {
            sound.playLap(r.finished);
            if (r.finished) {
              void submitLocalResult(r);
            }
          }

          if (canMove && !r.finished && input.useItem && r.heldItem) {
            const itemRes = useRacerItem(r, racers);
            if (itemRes.used === 'zipper') {
              sound.playBoost();
            } else if (itemRes.spawnedProjectile) {
              sound.playProjectileFire();
              projectiles.push(itemRes.spawnedProjectile);
              channelRef.current?.send({
                type: 'projectile_spawn',
                projectile: itemRes.spawnedProjectile,
              });
            } else if (itemRes.shockwaveHits.length > 0) {
              sound.playProjectileFire();
              for (const hitId of itemRes.shockwaveHits) {
                const victim = racers.find((v) => v.id === hitId);
                if (victim) {
                  applyHitToRacer(victim);
                  channelRef.current?.send({
                    type: 'racer_hit',
                    targetId: hitId,
                    attackerId: r.id,
                    kind: 'swatter',
                  });
                }
              }
            }
          }
        } else if (r.isAi && isHost) {
          const aiIn = computeAiInput(r, racers, track, elapsedMs);
          stepKartPhysics(r, aiIn, track, dt, elapsedMs, room.laps, canMove);
          if (canMove && !r.finished && aiIn.useItem && r.heldItem) {
            const itemRes = useRacerItem(r, racers);
            if (itemRes.spawnedProjectile) {
              projectiles.push(itemRes.spawnedProjectile);
              channelRef.current?.send({
                type: 'projectile_spawn',
                projectile: itemRes.spawnedProjectile,
              });
            } else if (itemRes.shockwaveHits.length > 0) {
              for (const hitId of itemRes.shockwaveHits) {
                const victim = racers.find((v) => v.id === hitId);
                if (victim) {
                  applyHitToRacer(victim);
                  channelRef.current?.send({
                    type: 'racer_hit',
                    targetId: hitId,
                    attackerId: r.id,
                    kind: 'swatter',
                  });
                }
              }
            }
          }
        } else {
          // Remote human or remote AI between packets
          extrapolateRemoteKart(r, dt);
        }
      }

      // Kart-to-kart collisions & item box checks
      if (canMove) {
        resolveKartCollisions(racers);
        const boxRes = stepItemBoxes(itemBoxes, racers, dt);
        for (const col of boxRes.collected) {
          if (col.racerId === localRacer.id) {
            sound.playItemPickup();
          }
          if (col.racerId === localRacer.id || isHost) {
            channelRef.current?.send({ type: 'item_box_taken', boxId: col.boxId });
          }
        }

        const projHits = stepProjectiles(projectiles, racers, track, dt);
        for (const h of projHits) {
          const target = racers.find((r) => r.id === h.targetId);
          if (!target) continue;
          // Authority: hit applies cleanly on local target or host for AI targets
          if (target.isLocal || (isHost && target.isAi)) {
            const res = applyHitToRacer(target);
            if (target.isLocal) sound.playHit(res.blockedByShield);
            channelRef.current?.send({
              type: 'racer_hit',
              targetId: h.targetId,
              attackerId: h.ownerId,
              kind: h.kind,
            });
          }
        }
      }

      updateRacePositions(racers);

      // Update engine sound
      const localDef = getKartDefinition(localRacer.kartId);
      sound.updateEngine(
        localRacer.speed,
        localDef.maxSpeed,
        localRacer.boostTimer > 0,
        canMove && !localRacer.finished
      );

      // Broadcast local state + host AI batch at ~22Hz
      if (epochNow - lastBroadcastAt >= 45) {
        lastBroadcastAt = epochNow;
        channelRef.current?.send({
          type: 'kart_state',
          packet: toNetworkPacket(localRacer, packetSeq),
        });
        if (isHost) {
          const aiPackets = racers.filter((r) => r.isAi).map((r) => toNetworkPacket(r, packetSeq));
          if (aiPackets.length > 0) {
            channelRef.current?.send({ type: 'ai_batch', packets: aiPackets });
          }
        }
        packetSeq += 1;
      }

      // Render 3D scene
      renderer.renderFrame(racers, localRacer.id, itemBoxes, projectiles, nowPerf / 1000, dt);

      // Refresh React HUD at ~12Hz
      if (nowPerf - lastHudAt >= 80) {
        lastHudAt = nowPerf;
        setHud({
          countdownLabel,
          canMove,
          elapsedMs,
          position: localRacer.position,
          totalRacers: racers.length,
          lap: Math.min(room.laps, localRacer.lap),
          totalLaps: room.laps,
          speedKmh: Math.round(Math.abs(localRacer.speed) * 2.4),
          driftTier: localRacer.isDrifting ? localRacer.driftTier : 0,
          heldItem: localRacer.heldItem,
          shieldActive: localRacer.shieldTimer > 0,
          boosting: localRacer.boostTimer > 0,
          localFinished: localRacer.finished,
          standings: localRacer.finished ? buildStandings(racers, elapsedMs) : [],
          racersMinimap: racers.map((r) => ({
            id: r.id,
            x: r.x,
            z: r.z,
            color: getKartDefinition(r.kartId).primaryColor,
            isLocal: r.isLocal,
            position: r.position,
            nickname: r.nickname,
          })),
        });
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      incomingBroadcastRef.current = null;
      sound.dispose();
      renderer.dispose();
    };
  }, [room, players, localPlayerId, startAtEpochMs, track, isHost, channelRef, incomingBroadcastRef]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  };

  const itemMeta = hud.heldItem ? POWERUP_META[hud.heldItem] : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      {/* Three.js WebGL Mount */}
      <div ref={canvasHostRef} className="h-full w-full" />

      {/* Top Left HUD: Rank, Lap, Clock */}
      <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/75 px-4 py-2.5 backdrop-blur-md">
          <div className="text-3xl font-black tracking-tight text-amber-400">
            {ORDINAL[hud.position] ?? `${hud.position}th`}
            <span className="ml-1 text-sm font-bold text-slate-400">/ {hud.totalRacers}</span>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lap</div>
            <div className="text-lg font-black text-white">
              {hud.lap} <span className="text-sm text-slate-400">/ {hud.totalLaps}</span>
            </div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Time</div>
            <div className="font-mono text-lg font-bold text-cyan-300">
              {formatRaceTime(hud.elapsedMs)}
            </div>
          </div>
        </div>

        {/* Held Item & Active Status */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-[190px] items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/75 px-3.5 py-2 backdrop-blur-md">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 text-xs font-black"
              style={{
                backgroundColor: itemMeta ? `${itemMeta.color}33` : 'rgba(15,23,42,0.8)',
                color: itemMeta ? itemMeta.color : '#64748b',
              }}
            >
              {itemMeta ? itemMeta.shortLabel : '?'}
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Item [E / Enter]
              </div>
              <div className="text-xs font-extrabold text-white">
                {itemMeta ? itemMeta.name : 'Hit ? Box'}
              </div>
            </div>
          </div>

          {hud.shieldActive && (
            <div className="flex items-center gap-1 rounded-full border border-purple-400/50 bg-purple-500/25 px-3 py-1.5 text-xs font-bold text-purple-200 backdrop-blur">
              <Shield className="h-3.5 w-3.5" /> Shielded
            </div>
          )}
        </div>
      </div>

      {/* Top Center Event Toast */}
      {toast && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/40 bg-slate-950/85 px-4 py-1.5 text-xs font-bold text-amber-200 shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      {/* Top Right: Controls + Standings + Live Minimap */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTouchControls((v) => !v)}
            className="rounded-xl border border-white/15 bg-slate-950/75 px-2.5 py-2 text-xs font-bold text-slate-200 backdrop-blur hover:bg-slate-800"
            title="Toggle On-Screen Touch Controls"
          >
            Pad
          </button>
          <button
            type="button"
            onClick={() => {
              rescueQueuedRef.current = true;
            }}
            className="rounded-xl border border-white/15 bg-slate-950/75 p-2 text-slate-200 backdrop-blur hover:bg-slate-800"
            title="Rescue onto Track (R)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rendererRef.current?.toggleCameraMode()}
            className="rounded-xl border border-white/15 bg-slate-950/75 p-2 text-slate-200 backdrop-blur hover:bg-slate-800"
            title="Switch Camera (C)"
          >
            <Camera className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-xl border border-white/15 bg-slate-950/75 p-2 text-slate-200 backdrop-blur hover:bg-slate-800"
            title="Toggle Sound"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void onLeaveRoom()}
            className="rounded-xl border border-rose-500/30 bg-rose-950/75 px-3 py-2 text-xs font-bold text-rose-200 backdrop-blur hover:bg-rose-800/80"
          >
            <LogOut className="inline h-3.5 w-3.5 mr-1" />
            Exit
          </button>
        </div>

        {/* Minimap */}
        <div className="pointer-events-none rounded-2xl border border-white/15 bg-slate-950/70 p-2 backdrop-blur-md">
          <svg width="120" height="120" viewBox="0 0 120 120" className="overflow-visible">
            <path d={minimapPath} fill="none" stroke="rgba(148,163,184,0.45)" strokeWidth="5" />
            {hud.racersMinimap.map((r) => {
              const cx = 120 - ((r.x - minimapBounds.minX) / minimapBounds.span) * 120;
              const cy = ((r.z - minimapBounds.minZ) / minimapBounds.span) * 120;
              return (
                <circle
                  key={r.id}
                  cx={cx}
                  cy={cy}
                  r={r.isLocal ? 5 : 3.8}
                  fill={r.color}
                  stroke={r.isLocal ? '#ffffff' : '#0f172a'}
                  strokeWidth={r.isLocal ? 2 : 1}
                />
              );
            })}
          </svg>
        </div>

        {/* Compact Live Order */}
        <div className="pointer-events-none w-44 space-y-1 rounded-xl border border-white/10 bg-slate-950/70 p-2 text-[11px] backdrop-blur">
          {[...hud.racersMinimap]
            .sort((a, b) => a.position - b.position)
            .map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between rounded px-1.5 py-0.5 ${
                  r.isLocal ? 'bg-cyan-500/20 font-bold text-white' : 'text-slate-300'
                }`}
              >
                <span className="truncate">
                  {r.position}. {r.nickname}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
              </div>
            ))}
        </div>
      </div>

      {/* Bottom Left Speedometer & Drift Charge */}
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-white/15 bg-slate-950/75 px-4 py-3 backdrop-blur-md">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-black text-white">{hud.speedKmh}</span>
          <span className="text-xs font-bold uppercase text-slate-400">km/h</span>
          {hud.boosting && (
            <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-cyan-500/25 px-1.5 py-0.5 text-[10px] font-black text-cyan-300">
              <Zap className="h-3 w-3" /> TURBO
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase text-slate-400">Drift</span>
          {[1, 2, 3].map((tier) => {
            const active = hud.driftTier >= tier;
            const col =
              tier === 3 ? 'bg-purple-400' : tier === 2 ? 'bg-orange-400' : 'bg-cyan-400';
            return (
              <span
                key={tier}
                className={`h-2 w-7 rounded-full transition ${
                  active ? col : 'bg-slate-800'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom Center Controls Hint */}
      {!showTouchControls && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/65 px-4 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur sm:block">
          <span className="font-bold text-white">WASD / Arrows</span> Drive •{' '}
          <span className="font-bold text-white">Space</span> Drift •{' '}
          <span className="font-bold text-white">E / Enter</span> Item •{' '}
          <span className="font-bold text-white">R</span> Rescue •{' '}
          <span className="font-bold text-white">C</span> Camera
        </div>
      )}

      {/* Touch / Mobile Controls */}
      {showTouchControls && !hud.localFinished && (
        <div className="absolute inset-x-4 bottom-20 flex items-end justify-between pointer-events-none sm:bottom-6">
          <div className="flex gap-2 pointer-events-auto">
            <button
              type="button"
              onPointerDown={() => {
                soundRef.current?.unlock();
                touchRef.current.left = true;
              }}
              onPointerUp={() => {
                touchRef.current.left = false;
              }}
              onPointerLeave={() => {
                touchRef.current.left = false;
              }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-slate-900/80 text-xl font-black text-white active:bg-cyan-500/40"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={() => {
                soundRef.current?.unlock();
                touchRef.current.right = true;
              }}
              onPointerUp={() => {
                touchRef.current.right = false;
              }}
              onPointerLeave={() => {
                touchRef.current.right = false;
              }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-slate-900/80 text-xl font-black text-white active:bg-cyan-500/40"
            >
              ▶
            </button>
          </div>

          <div className="flex gap-2 pointer-events-auto">
            <button
              type="button"
              onPointerDown={() => {
                touchRef.current.useItem = true;
              }}
              className="flex h-14 w-16 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-500/30 text-xs font-black text-amber-200 active:bg-amber-500/60"
            >
              ITEM
            </button>
            <button
              type="button"
              onPointerDown={() => {
                touchRef.current.drift = true;
              }}
              onPointerUp={() => {
                touchRef.current.drift = false;
              }}
              onPointerLeave={() => {
                touchRef.current.drift = false;
              }}
              className="flex h-14 w-16 items-center justify-center rounded-2xl border border-cyan-400/50 bg-cyan-500/30 text-xs font-black text-cyan-100 active:bg-cyan-500/60"
            >
              DRIFT
            </button>
            <button
              type="button"
              onPointerDown={() => {
                touchRef.current.brake = true;
              }}
              onPointerUp={() => {
                touchRef.current.brake = false;
              }}
              onPointerLeave={() => {
                touchRef.current.brake = false;
              }}
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/40 bg-rose-500/30 text-xs font-black text-rose-100"
            >
              BRK
            </button>
            <button
              type="button"
              onPointerDown={() => {
                soundRef.current?.unlock();
                touchRef.current.throttle = true;
              }}
              onPointerUp={() => {
                touchRef.current.throttle = false;
              }}
              onPointerLeave={() => {
                touchRef.current.throttle = false;
              }}
              className="flex h-16 w-20 items-center justify-center rounded-2xl border border-emerald-400/60 bg-emerald-500/40 text-sm font-black text-white active:bg-emerald-500/70"
            >
              GAS
            </button>
          </div>
        </div>
      )}

      {/* Countdown Overlay */}
      {hud.countdownLabel && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`rounded-3xl border px-12 py-6 text-7xl font-black tracking-tighter shadow-2xl backdrop-blur-md ${
              hud.countdownLabel === 'GO!'
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-300'
                : 'border-amber-400/50 bg-slate-950/80 text-amber-300'
            }`}
          >
            {hud.countdownLabel}
          </div>
        </div>
      )}

      {/* Finish Podium Modal */}
      {hud.localFinished && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-cyan-500/30 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-7 w-7 text-amber-400" />
                <div>
                  <h2 className="text-2xl font-black text-white">RACE FINISH!</h2>
                  <p className="text-xs text-slate-400">
                    {room.name} • Final Standings
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-amber-400/20 px-3 py-1 text-sm font-black text-amber-300">
                {ORDINAL[hud.position] ?? `${hud.position}th`} Place
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {hud.standings.map((s) => {
                const kDef = getKartDefinition(s.kartId);
                return (
                  <div
                    key={s.playerId}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                      s.playerId === localPlayerId
                        ? 'border-cyan-400 bg-cyan-500/15'
                        : 'border-slate-800 bg-slate-950/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-base font-black text-amber-400">#{s.position}</span>
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: kDef.primaryColor }}
                      />
                      <div>
                        <div className="text-sm font-bold text-white">{s.nickname}</div>
                        <div className="text-[11px] text-slate-400">
                          {kDef.name} {s.isAi ? '• AI' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="font-bold text-cyan-300">{formatRaceTime(s.totalTimeMs)}</div>
                      <div className="text-slate-400">Best {formatRaceTime(s.bestLapMs)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {isHost ? (
                <button
                  type="button"
                  disabled={rematchBusy}
                  onClick={async () => {
                    setRematchBusy(true);
                    await onRematch();
                    setRematchBusy(false);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-slate-950 hover:brightness-110 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {rematchBusy ? 'Returning...' : 'Rematch (Back to Lobby)'}
                </button>
              ) : (
                <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-xs font-semibold text-slate-300">
                  <Flag className="h-4 w-4 text-cyan-400" />
                  Waiting for Host to start next race...
                </div>
              )}

              <button
                type="button"
                onClick={() => void onLeaveRoom()}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-700"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
