'use client';

import React, { useEffect, useRef, useState } from 'react';
import { computeAiFighterInput } from '@/game/ai';
import { BattleSoundEngine } from '@/game/audio';
import {
  applyDamageToFighter,
  getActiveWeapon,
  openCrateToDrops,
  spawnDeathLootStash,
  stepBullets,
  stepFighterMovement,
  stepGrenades,
  tryFireWeapon,
  tryPickupLootDrop,
  tryThrowGrenade,
  type FighterInput,
} from '@/game/combat';
import {
  applyRemoteFighterPacket,
  BrRoomChannel,
  buildMatchRoster,
  buildMatchStandings,
  extrapolateRemoteFighter,
  formatDurationMs,
  toFighterPacket,
} from '@/game/multiplayer';
import { TopDownArenaRenderer } from '@/game/renderer';
import type {
  BrBroadcast,
  BrPlayer,
  BrRoom,
  BuiltWorld,
  BulletEntity,
  DamageFloat,
  FighterState,
  GrenadeEntity,
  KillFeedEntry,
  LootDrop,
  MatchStanding,
  ParticleFx,
  ScorchDecal,
  ShellCasing,
  StormState,
} from '@/game/types';
import { RARITY_META, WEAPONS } from '@/game/weapons';
import { buildWorldFromSeed, getStormStateAt } from '@/game/world';

interface ArenaViewProps {
  room: BrRoom;
  players: BrPlayer[];
  localPlayerId: string;
  isSolo: boolean;
  startAtEpochMs: number;
  channel: BrRoomChannel | null;
  broadcastSubscribeTick: number;
  onRegisterBroadcastHandler: (fn: (msg: BrBroadcast) => void) => void;
  onFinishMatch: (standings: MatchStanding[]) => Promise<void>;
  onPlayAgain: () => Promise<void>;
  onLeaveMatch: () => Promise<void>;
}

interface HudSnapshot {
  countdownSec: number | null;
  aliveCount: number;
  totalCombatants: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  kills: number;
  medkits: number;
  grenades: number;
  dashReadyPct: number;
  healing: boolean;
  reloading: boolean;
  activeSlot: 0 | 1;
  slot0Label: string;
  slot0Ammo: string;
  slot0Color: string;
  slot1Label: string;
  slot1Ammo: string;
  slot1Color: string;
  stormPhase: number;
  stormShrinking: boolean;
  stormNextSec: number;
  inStorm: boolean;
  matchElapsedMs: number;
  localAlive: boolean;
  localPlacement: number | null;
  killFeed: KillFeedEntry[];
  airdropBanner: string | null;
  nearbyPrompt: string | null;
}

export default function ArenaView({
  room,
  players,
  localPlayerId,
  isSolo,
  startAtEpochMs,
  channel,
  broadcastSubscribeTick,
  onRegisterBroadcastHandler,
  onFinishMatch,
  onPlayAgain,
  onLeaveMatch,
}: ArenaViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs prevent background room polls or prop churn from resetting the live match
  const roomRef = useRef(room);
  const playersRef = useRef(players);
  const localPlayerIdRef = useRef(localPlayerId);
  const isSoloRef = useRef(isSolo);
  const startAtRef = useRef(startAtEpochMs);
  const channelRef = useRef(channel);
  const onFinishMatchRef = useRef(onFinishMatch);
  const onLeaveMatchRef = useRef(onLeaveMatch);

  roomRef.current = room;
  playersRef.current = players;
  localPlayerIdRef.current = localPlayerId;
  isSoloRef.current = isSolo;
  startAtRef.current = startAtEpochMs;
  channelRef.current = channel;
  onFinishMatchRef.current = onFinishMatch;
  onLeaveMatchRef.current = onLeaveMatch;

  const [muted, setMuted] = useState(false);
  const [touchPad, setTouchPad] = useState(false);
  const [finalStandings, setFinalStandings] = useState<MatchStanding[] | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    countdownSec: 3,
    aliveCount: 10,
    totalCombatants: 10,
    hp: 100,
    maxHp: 100,
    armor: 25,
    maxArmor: 100,
    kills: 0,
    medkits: 1,
    grenades: 1,
    dashReadyPct: 1,
    healing: false,
    reloading: false,
    activeSlot: 0,
    slot0Label: 'P220 Tactical',
    slot0Ammo: '12 / 60',
    slot0Color: '#94a3b8',
    slot1Label: 'Empty Slot',
    slot1Ammo: '--',
    slot1Color: '#475569',
    stormPhase: 1,
    stormShrinking: false,
    stormNextSec: 22,
    inStorm: false,
    matchElapsedMs: 0,
    localAlive: true,
    localPlacement: null,
    killFeed: [],
    airdropBanner: null,
    nearbyPrompt: null,
  });

  const soundRef = useRef<BattleSoundEngine | null>(null);
  const virtualInputRef = useRef({
    moveX: 0,
    moveY: 0,
    firing: false,
    interactPressed: false,
    grenadePressed: false,
    healPressed: false,
    dashPressed: false,
    reloadPressed: false,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
      setTouchPad(true);
    }
  }, []);

  const handleBroadcastRef = useRef<(msg: BrBroadcast) => void>(() => {});
  useEffect(() => {
    onRegisterBroadcastHandler((msg) => {
      handleBroadcastRef.current(msg);
    });
  }, [onRegisterBroadcastHandler, broadcastSubscribeTick]);

  // MAIN SIMULATION & RENDERING EFFECT (keyed strictly by room.id & isSolo)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentRoom = roomRef.current;
    const currentPlayers = playersRef.current;
    const myId = localPlayerIdRef.current;
    const soloMode = isSoloRef.current;
    const isHost = soloMode || currentRoom.host_id === myId;

    const world: BuiltWorld = buildWorldFromSeed(currentRoom.map_id, currentRoom.match_seed);
    const fighters: FighterState[] = buildMatchRoster(currentRoom, currentPlayers, myId, world);
    const localFighter = fighters.find((f) => f.id === myId) ?? fighters[0];

    const bullets: BulletEntity[] = [];
    const grenades: GrenadeEntity[] = [];
    const drops: LootDrop[] = [];
    const particles: ParticleFx[] = [];
    const casings: ShellCasing[] = [];
    const floats: DamageFloat[] = [];
    const scorches: ScorchDecal[] = [];
    const killFeed: KillFeedEntry[] = [];

    const renderer = new TopDownArenaRenderer(container);
    const sound = new BattleSoundEngine();
    soundRef.current = sound;

    // Pre-render static minimap layer
    const mmStatic = document.createElement('canvas');
    mmStatic.width = 168;
    mmStatic.height = 168;
    const mms = mmStatic.getContext('2d')!;
    const mmScale = 168 / world.def.worldSize;
    mms.fillStyle = world.def.waterColor;
    mms.fillRect(0, 0, 168, 168);
    mms.fillStyle = world.def.groundColor;
    const pm = world.def.playMargin * mmScale;
    mms.fillRect(pm, pm, 168 - pm * 2, 168 - pm * 2);
    mms.fillStyle = world.def.roadColor;
    for (const r of world.roads) {
      mms.fillRect(r.x * mmScale, r.y * mmScale, r.w * mmScale, r.h * mmScale);
    }
    mms.fillStyle = 'rgba(226, 232, 240, 0.45)';
    for (const b of world.buildings) {
      mms.fillRect(
        b.x * mmScale,
        b.y * mmScale,
        Math.max(3, b.w * mmScale),
        Math.max(3, b.h * mmScale)
      );
    }

    const keys = new Set<string>();
    let mouseScreenX = container.clientWidth * 0.65;
    let mouseScreenY = container.clientHeight * 0.5;
    let mouseDown = false;
    let wantInteract = false;
    let wantReload = false;
    let wantHeal = false;
    let wantGrenade = false;
    let wantDash = false;
    let wantSwitchSlot: 0 | 1 | 'toggle' | null = null;
    let hitmarkerUntilMs = 0;
    let packetSeq = 0;
    let matchEnded = false;
    let airdropBanner: string | null = null;
    let airdropBannerUntilMs = 0;
    let nextAirdropAtMatchMs = 38_000;
    let localPlacement: number | null = null;
    let spectateTargetId = localFighter.id;

    const soundAttenuation = (x: number, y: number): number => {
      const dist = Math.hypot(x - localFighter.x, y - localFighter.y);
      return Math.max(0, 1 - dist / 1100);
    };

    const pushKillFeed = (
      killerName: string,
      victimName: string,
      weaponLabel: string,
      now: number
    ) => {
      killFeed.unshift({
        id: `${now}-${victimName}`,
        killerName,
        victimName,
        weaponLabel,
        createdAtMs: now,
      });
      if (killFeed.length > 5) killFeed.pop();
    };

    const spawnBurstParticles = (
      x: number,
      y: number,
      color: string,
      count: number,
      speedMax: number,
      radius: number,
      lifeMs: number,
      now: number
    ) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 35 + Math.random() * speedMax;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          radius: radius * (0.7 + Math.random() * 0.6),
          color,
          alpha: 0.95,
          bornAtMs: now,
          lifeMs: lifeMs * (0.7 + Math.random() * 0.5),
          kind: 'spark',
        });
      }
      if (particles.length > 350) {
        particles.splice(0, particles.length - 350);
      }
    };

    const spawnDamageFloat = (
      x: number,
      y: number,
      text: string,
      color: string,
      now: number
    ) => {
      floats.push({ x, y, text, color, bornAtMs: now });
      if (floats.length > 40) floats.shift();
    };

    const spawnCasing = (f: FighterState, now: number) => {
      const perp = f.aimAngle + Math.PI / 2;
      const spd = 75 + Math.random() * 65;
      casings.push({
        x: f.x + Math.cos(f.aimAngle) * 10,
        y: f.y + Math.sin(f.aimAngle) * 10,
        vx: Math.cos(perp) * spd,
        vy: Math.sin(perp) * spd,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 16,
        color: '#facc15',
        bornAtMs: now,
      });
      if (casings.length > 140) casings.shift();
    };

    const finalizeLocalElimination = (
      victim: FighterState,
      attackerId: string | null,
      weaponLabel: string,
      matchElapsedMs: number,
      now: number
    ) => {
      victim.alive = false;
      victim.eliminatedAtMs = matchElapsedMs;
      const aliveLeft = fighters.filter((f) => f.alive).length;
      if (victim.id === localFighter.id) {
        localPlacement = aliveLeft + 1;
      }

      const killer = attackerId ? fighters.find((f) => f.id === attackerId) : undefined;
      if (killer && killer.id !== victim.id) {
        killer.kills += 1;
      }

      const dropped = spawnDeathLootStash(victim);
      drops.push(...dropped);
      pushKillFeed(killer ? killer.nickname : 'THE STORM', victim.nickname, weaponLabel, now);
      spawnBurstParticles(victim.x, victim.y, '#ef4444', 18, 220, 5, 520, now);
      sound.playElimination(attackerId === myId);

      if (victim.id === myId || (isHost && victim.isAi)) {
        channelRef.current?.send({
          type: 'fighter_eliminated',
          victimId: victim.id,
          attackerId,
          weaponLabel,
          drops: dropped,
        });
      }
    };

    // Broadcast message listener
    handleBroadcastRef.current = (msg: BrBroadcast) => {
      const now = performance.now();
      if (msg.type === 'fighter_state') {
        const target = fighters.find((f) => f.id === msg.packet.id);
        if (target && target.id !== myId) {
          applyRemoteFighterPacket(target, msg.packet);
        }
      } else if (msg.type === 'ai_batch') {
        if (!isHost) {
          for (const pkt of msg.packets) {
            const target = fighters.find((f) => f.id === pkt.id);
            if (target) applyRemoteFighterPacket(target, pkt);
          }
        }
      } else if (msg.type === 'fire_bullets') {
        if (msg.ownerId === myId) return;
        const shooter = fighters.find((f) => f.id === msg.ownerId);
        if (shooter) {
          shooter.muzzleFlashUntilMs = now + 70;
          shooter.recoilOffset = 6;
        }
        for (const b of msg.bullets) {
          bullets.push({
            ...b,
            ownerId: msg.ownerId,
            teamIndex: msg.teamIndex,
            weaponId: msg.weaponId,
            rarity: msg.rarity,
            prevX: b.x,
            prevY: b.y,
            distanceTraveled: 0,
          });
        }
        const bx = msg.bullets[0]?.x ?? localFighter.x;
        const by = msg.bullets[0]?.y ?? localFighter.y;
        sound.playWeaponShot(msg.weaponId, soundAttenuation(bx, by));
      } else if (msg.type === 'throw_grenade') {
        if (msg.grenade.ownerId === myId) return;
        grenades.push({
          ...msg.grenade,
          explodeAtMs: now + 1350,
        });
      } else if (msg.type === 'damage_hit') {
        const target = fighters.find((f) => f.id === msg.targetId);
        if (!target || !target.alive) return;
        const shouldAuthoritativelyApply = target.id === myId || (isHost && target.isAi);
        if (shouldAuthoritativelyApply) {
          const res = applyDamageToFighter(target, msg.damage, msg.armorPenetration, now);
          if (msg.attackerId) {
            const atk = fighters.find((f) => f.id === msg.attackerId);
            if (atk) atk.damageDealt += res.totalShown;
          }
          spawnDamageFloat(
            msg.hitX,
            msg.hitY - 12,
            `-${res.totalShown}`,
            res.armorLost > 0 ? '#38bdf8' : '#fca5a5',
            now
          );
          spawnBurstParticles(msg.hitX, msg.hitY, '#ef4444', 6, 130, 3.5, 300, now);
          if (target.id === myId) {
            sound.playHitmarker(res.armorLost > 0);
            renderer.addShake(7);
          }
          if (res.eliminated) {
            const matchElapsed = Math.max(0, Date.now() - startAtRef.current);
            finalizeLocalElimination(target, msg.attackerId, msg.weaponLabel, matchElapsed, now);
          }
        }
      } else if (msg.type === 'crate_opened') {
        const crate = world.crates.find((c) => c.id === msg.crateId);
        if (crate && !crate.opened) {
          crate.opened = true;
          crate.hp = 0;
          drops.push(...msg.drops);
          spawnBurstParticles(crate.x, crate.y, '#fbbf24', 10, 150, 4, 380, now);
          if (msg.openerId !== myId) {
            const d = Math.hypot(crate.x - localFighter.x, crate.y - localFighter.y);
            if (d < 700) sound.playCrateBreak();
          }
        }
      } else if (msg.type === 'loot_picked') {
        const idx = drops.findIndex((d) => d.id === msg.dropId);
        if (idx >= 0) drops.splice(idx, 1);
      } else if (msg.type === 'fighter_eliminated') {
        const victim = fighters.find((f) => f.id === msg.victimId);
        if (victim && victim.alive) {
          victim.alive = false;
          victim.eliminatedAtMs = Math.max(0, Date.now() - startAtRef.current);
          const killer = msg.attackerId
            ? fighters.find((f) => f.id === msg.attackerId)
            : undefined;
          if (killer && killer.id !== victim.id) killer.kills += 1;
          drops.push(...msg.drops);
          pushKillFeed(
            killer ? killer.nickname : 'THE STORM',
            victim.nickname,
            msg.weaponLabel,
            now
          );
          spawnBurstParticles(victim.x, victim.y, '#ef4444', 18, 220, 5, 520, now);
          sound.playElimination(msg.attackerId === myId);
        }
      } else if (msg.type === 'airdrop_spawned') {
        world.crates.push(msg.crate);
        airdropBanner = 'ORBITAL SUPPLY DROP LANDED!';
        airdropBannerUntilMs = now + 4500;
        sound.playAirdropChime();
      } else if (msg.type === 'match_finished') {
        if (!matchEnded) {
          matchEnded = true;
          setFinalStandings(msg.standings);
          void onFinishMatchRef.current(msg.standings);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'KeyF') wantInteract = true;
      if (e.code === 'KeyR') wantReload = true;
      if (e.code === 'KeyH' || e.code === 'Digit4') wantHeal = true;
      if (e.code === 'KeyG') wantGrenade = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') wantDash = true;
      if (e.code === 'Digit1') wantSwitchSlot = 0;
      if (e.code === 'Digit2') wantSwitchSlot = 1;
      if (e.code === 'KeyQ') wantSwitchSlot = 'toggle';
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseScreenX = e.clientX - rect.left;
      mouseScreenY = e.clientY - rect.top;
    };
    const onMouseDown = (e: MouseEvent) => {
      sound.unlock();
      if (e.button === 0) mouseDown = true;
      if (e.button === 2) wantGrenade = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDown = false;
    };
    const onWheel = () => {
      wantSwitchSlot = 'toggle';
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onResize = () => renderer.resize(container);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('contextmenu', onContextMenu);

    let lastFrameMs = performance.now();
    let lastNetSendMs = 0;
    let lastAiSendMs = 0;
    let lastHudUpdateMs = 0;
    let lastMinimapDrawMs = 0;
    let lastCountdownBeep = -1;
    let rafId = 0;

    const tick = (nowMs: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
      lastFrameMs = nowMs;

      const epochNow = Date.now();
      const countdownMs = startAtRef.current - epochNow;
      const matchActive = countdownMs <= 0 && !matchEnded;
      const matchElapsedMs = Math.max(0, epochNow - startAtRef.current);
      const storm: StormState = getStormStateAt(matchElapsedMs, world);

      if (countdownMs > 0) {
        const sec = Math.ceil(countdownMs / 1000);
        if (sec !== lastCountdownBeep && sec <= 3) {
          lastCountdownBeep = sec;
          sound.playCountdown(false);
        }
      } else if (lastCountdownBeep !== 0) {
        lastCountdownBeep = 0;
        sound.playCountdown(true);
      }

      // Host spawns Orbital Supply Drop every 38 seconds
      if (matchActive && isHost && matchElapsedMs >= nextAirdropAtMatchMs) {
        nextAirdropAtMatchMs += 38_000;
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * Math.min(280, storm.currentRadius * 0.4);
        const dropX = Math.max(
          world.def.playMargin + 120,
          Math.min(
            world.def.worldSize - world.def.playMargin - 120,
            storm.centerX + Math.cos(angle) * rad
          )
        );
        const dropY = Math.max(
          world.def.playMargin + 120,
          Math.min(
            world.def.worldSize - world.def.playMargin - 120,
            storm.centerY + Math.sin(angle) * rad
          )
        );
        const crate = {
          id: `airdrop-${Math.round(matchElapsedMs)}`,
          x: dropX,
          y: dropY,
          kind: 'supply_drop' as const,
          hp: 150,
          maxHp: 150,
          opened: false,
          hitFlashUntilMs: 0,
        };
        world.crates.push(crate);
        airdropBanner = 'ORBITAL SUPPLY DROP LANDED!';
        airdropBannerUntilMs = nowMs + 4500;
        sound.playAirdropChime();
        channelRef.current?.send({ type: 'airdrop_spawned', crate });
      }

      // 1. Local Fighter Input & Simulation
      if (localFighter.alive) {
        let mx = virtualInputRef.current.moveX;
        let my = virtualInputRef.current.moveY;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;

        const worldAim = renderer.screenToWorld(mouseScreenX, mouseScreenY);
        const aimAngle = Math.atan2(worldAim.y - localFighter.y, worldAim.x - localFighter.x);

        const localInput: FighterInput = {
          moveX: Math.max(-1, Math.min(1, mx)),
          moveY: Math.max(-1, Math.min(1, my)),
          aimAngle,
          firing: mouseDown || virtualInputRef.current.firing,
          dash: wantDash || virtualInputRef.current.dashPressed,
          reload: wantReload || virtualInputRef.current.reloadPressed,
          interact: wantInteract || virtualInputRef.current.interactPressed,
          heal: wantHeal || virtualInputRef.current.healPressed,
          throwGrenade: wantGrenade || virtualInputRef.current.grenadePressed,
          switchSlot: wantSwitchSlot,
        };

        wantDash = false;
        wantReload = false;
        wantInteract = false;
        wantGrenade = false;
        wantHeal = false;
        wantSwitchSlot = null;
        virtualInputRef.current.dashPressed = false;
        virtualInputRef.current.reloadPressed = false;
        virtualInputRef.current.interactPressed = false;
        virtualInputRef.current.grenadePressed = false;
        virtualInputRef.current.healPressed = false;

        const stepRes = stepFighterMovement(
          localFighter,
          localInput,
          world,
          storm,
          dt,
          nowMs,
          matchActive
        );
        if (stepRes.dashed) sound.playDash();
        if (stepRes.healed) {
          sound.playPickup();
          spawnDamageFloat(localFighter.x, localFighter.y - 28, '+55 HP', '#4ade80', nowMs);
        }
        if (!localFighter.alive && matchActive) {
          finalizeLocalElimination(localFighter, null, 'Electric Storm', matchElapsedMs, nowMs);
        }

        if (matchActive && localFighter.alive) {
          // Auto-pickup ammo packets gently when walking over them
          for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            if (d.kind === 'ammo' && Math.hypot(d.x - localFighter.x, d.y - localFighter.y) < 32) {
              const res = tryPickupLootDrop(localFighter, d, false);
              if (res.picked) {
                drops.splice(i, 1);
                sound.playPickup();
                spawnDamageFloat(localFighter.x, localFighter.y - 24, res.label, '#fde047', nowMs);
                channelRef.current?.send({
                  type: 'loot_picked',
                  dropId: d.id,
                  pickerId: localFighter.id,
                });
              }
            }
          }

          // Explicit [E] / [F] interact with nearest crate or loot item
          if (localInput.interact) {
            let handled = false;
            let bestDropIdx = -1;
            let bestDist = 58;
            for (let i = 0; i < drops.length; i++) {
              const d = Math.hypot(drops[i].x - localFighter.x, drops[i].y - localFighter.y);
              if (d < bestDist) {
                bestDist = d;
                bestDropIdx = i;
              }
            }
            if (bestDropIdx >= 0) {
              const drop = drops[bestDropIdx];
              const res = tryPickupLootDrop(localFighter, drop, true);
              if (res.picked) {
                drops.splice(bestDropIdx, 1);
                sound.playPickup();
                spawnDamageFloat(localFighter.x, localFighter.y - 26, res.label, '#38bdf8', nowMs);
                channelRef.current?.send({
                  type: 'loot_picked',
                  dropId: drop.id,
                  pickerId: localFighter.id,
                });
                handled = true;
              }
            }
            if (!handled) {
              for (const c of world.crates) {
                if (!c.opened && Math.hypot(c.x - localFighter.x, c.y - localFighter.y) < 68) {
                  const spawned = openCrateToDrops(c);
                  drops.push(...spawned);
                  sound.playCrateBreak();
                  spawnBurstParticles(c.x, c.y, '#fbbf24', 10, 150, 4, 380, nowMs);
                  channelRef.current?.send({
                    type: 'crate_opened',
                    crateId: c.id,
                    openerId: localFighter.id,
                    drops: spawned,
                  });
                  break;
                }
              }
            }
          }

          // Firing
          if (localInput.firing) {
            const shot = tryFireWeapon(localFighter, nowMs);
            if (shot.bullets.length > 0 && shot.firedWeaponId) {
              bullets.push(...shot.bullets);
              spawnCasing(localFighter, nowMs);
              sound.playWeaponShot(shot.firedWeaponId, 1.0);
              renderer.addShake(
                shot.firedWeaponId === 'shotgun' || shot.firedWeaponId === 'sniper' ? 5.2 : 1.9
              );
              channelRef.current?.send({
                type: 'fire_bullets',
                ownerId: localFighter.id,
                teamIndex: localFighter.teamIndex,
                weaponId: shot.firedWeaponId,
                rarity: getActiveWeapon(localFighter)?.rarity ?? 'common',
                bullets: shot.bullets.map((b) => ({
                  id: b.id,
                  x: b.x,
                  y: b.y,
                  vx: b.vx,
                  vy: b.vy,
                  damage: b.damage,
                  armorPenetration: b.armorPenetration,
                  maxRange: b.maxRange,
                  color: b.color,
                })),
              });
            }
          }

          // Throwing Grenade
          if (localInput.throwGrenade) {
            const g = tryThrowGrenade(localFighter, nowMs);
            if (g) {
              grenades.push(g);
              channelRef.current?.send({
                type: 'throw_grenade',
                grenade: g,
              });
            }
          }
        }
      }

      // 2. Host AI Simulation + Remote Player Extrapolation
      for (const f of fighters) {
        if (!f.alive || f.id === localFighter.id) continue;

        if (matchActive) {
          if (f.isAi) {
            if (isHost) {
              const aiIn = computeAiFighterInput(f, fighters, world, drops, storm, nowMs);
              stepFighterMovement(f, aiIn, world, storm, dt, nowMs, true);
              if (!f.alive) {
                finalizeLocalElimination(f, null, 'Electric Storm', matchElapsedMs, nowMs);
                continue;
              }

              if (aiIn.interact) {
                for (let i = drops.length - 1; i >= 0; i--) {
                  if (Math.hypot(drops[i].x - f.x, drops[i].y - f.y) < 48) {
                    const res = tryPickupLootDrop(f, drops[i], false);
                    if (res.picked) {
                      const picked = drops[i];
                      drops.splice(i, 1);
                      channelRef.current?.send({
                        type: 'loot_picked',
                        dropId: picked.id,
                        pickerId: f.id,
                      });
                      break;
                    }
                  }
                }
                for (const c of world.crates) {
                  if (!c.opened && Math.hypot(c.x - f.x, c.y - f.y) < 62) {
                    const spawned = openCrateToDrops(c);
                    drops.push(...spawned);
                    channelRef.current?.send({
                      type: 'crate_opened',
                      crateId: c.id,
                      openerId: f.id,
                      drops: spawned,
                    });
                    break;
                  }
                }
              }

              if (aiIn.firing) {
                const shot = tryFireWeapon(f, nowMs);
                if (shot.bullets.length > 0 && shot.firedWeaponId) {
                  bullets.push(...shot.bullets);
                  spawnCasing(f, nowMs);
                  sound.playWeaponShot(shot.firedWeaponId, soundAttenuation(f.x, f.y));
                  channelRef.current?.send({
                    type: 'fire_bullets',
                    ownerId: f.id,
                    teamIndex: f.teamIndex,
                    weaponId: shot.firedWeaponId,
                    rarity: getActiveWeapon(f)?.rarity ?? 'common',
                    bullets: shot.bullets.map((b) => ({
                      id: b.id,
                      x: b.x,
                      y: b.y,
                      vx: b.vx,
                      vy: b.vy,
                      damage: b.damage,
                      armorPenetration: b.armorPenetration,
                      maxRange: b.maxRange,
                      color: b.color,
                    })),
                  });
                }
              }

              if (aiIn.throwGrenade) {
                const g = tryThrowGrenade(f, nowMs);
                if (g) {
                  grenades.push(g);
                  channelRef.current?.send({
                    type: 'throw_grenade',
                    grenade: g,
                  });
                }
              }
            } else {
              extrapolateRemoteFighter(f, dt);
            }
          } else {
            extrapolateRemoteFighter(f, dt);
          }
        }
      }

      // 3. Step Bullets + Hit Registration
      const bulletStep = stepBullets(bullets, fighters, world, dt, nowMs);
      for (const imp of bulletStep.wallImpacts) {
        spawnBurstParticles(imp.x, imp.y, '#cbd5e1', 4, 90, 2.4, 220, nowMs);
      }
      for (const cd of bulletStep.crateDamages) {
        spawnBurstParticles(cd.hitX, cd.hitY, '#fbbf24', 5, 110, 3, 260, nowMs);
        if (
          cd.broken &&
          !cd.crate.opened &&
          (cd.ownerId === myId || (isHost && cd.ownerId.startsWith('bot-')))
        ) {
          const spawned = openCrateToDrops(cd.crate);
          drops.push(...spawned);
          sound.playCrateBreak();
          channelRef.current?.send({
            type: 'crate_opened',
            crateId: cd.crate.id,
            openerId: cd.ownerId,
            drops: spawned,
          });
        }
      }
      for (const hit of bulletStep.fighterHits) {
        const target = hit.target;
        const shooterIsLocal = hit.bullet.ownerId === myId;
        const shooterIsHostAi = isHost && hit.bullet.ownerId.startsWith('bot-');

        if (shooterIsLocal) {
          hitmarkerUntilMs = nowMs + 130;
          sound.playHitmarker(target.armor > 0);
        }

        if (shooterIsLocal || shooterIsHostAi) {
          const wpnName = WEAPONS[hit.bullet.weaponId].shortName;
          if (target.id === myId || (isHost && target.isAi)) {
            const dmgRes = applyDamageToFighter(
              target,
              hit.bullet.damage,
              hit.bullet.armorPenetration,
              nowMs
            );
            const atk = fighters.find((x) => x.id === hit.bullet.ownerId);
            if (atk) atk.damageDealt += dmgRes.totalShown;
            spawnDamageFloat(
              hit.hitX,
              hit.hitY - 12,
              `-${dmgRes.totalShown}`,
              dmgRes.armorLost > 0 ? '#38bdf8' : '#fca5a5',
              nowMs
            );
            spawnBurstParticles(hit.hitX, hit.hitY, '#ef4444', 6, 140, 3.2, 290, nowMs);
            if (dmgRes.eliminated) {
              finalizeLocalElimination(target, hit.bullet.ownerId, wpnName, matchElapsedMs, nowMs);
            }
          } else {
            spawnDamageFloat(
              hit.hitX,
              hit.hitY - 12,
              `-${Math.round(hit.bullet.damage)}`,
              '#fde047',
              nowMs
            );
            spawnBurstParticles(hit.hitX, hit.hitY, '#ef4444', 5, 130, 3, 270, nowMs);
            channelRef.current?.send({
              type: 'damage_hit',
              targetId: target.id,
              attackerId: hit.bullet.ownerId,
              damage: hit.bullet.damage,
              armorPenetration: hit.bullet.armorPenetration,
              weaponLabel: wpnName,
              hitX: hit.hitX,
              hitY: hit.hitY,
            });
          }
        }
      }

      // 4. Step Grenades + Explosions
      const gRes = stepGrenades(grenades, fighters, world, dt, nowMs);
      for (const exp of gRes.explosions) {
        sound.playExplosion(soundAttenuation(exp.x, exp.y));
        renderer.addShake(Math.max(0, 14 * soundAttenuation(exp.x, exp.y)));
        scorches.push({ x: exp.x, y: exp.y, radius: 52, bornAtMs: nowMs });
        if (scorches.length > 35) scorches.shift();

        particles.push({
          x: exp.x,
          y: exp.y,
          vx: 0,
          vy: 0,
          radius: 175,
          color: '#f97316',
          alpha: 0.9,
          bornAtMs: nowMs,
          lifeMs: 420,
          kind: 'ring',
        });
        spawnBurstParticles(exp.x, exp.y, '#fbbf24', 24, 280, 6, 560, nowMs);

        const isOwner = exp.ownerId === myId || (isHost && exp.ownerId.startsWith('bot-'));
        if (isOwner) {
          for (const c of exp.brokenCrates) {
            if (!c.opened) {
              const spawned = openCrateToDrops(c);
              drops.push(...spawned);
              channelRef.current?.send({
                type: 'crate_opened',
                crateId: c.id,
                openerId: exp.ownerId,
                drops: spawned,
              });
            }
          }

          for (const h of exp.hits) {
            if (h.target.id === myId || (isHost && h.target.isAi)) {
              const res = applyDamageToFighter(h.target, h.damage, 0.35, nowMs);
              const atk = fighters.find((x) => x.id === exp.ownerId);
              if (atk && atk.id !== h.target.id) atk.damageDealt += res.totalShown;
              spawnDamageFloat(
                h.target.x,
                h.target.y - 16,
                `-${res.totalShown}`,
                '#fb923c',
                nowMs
              );
              if (res.eliminated) {
                finalizeLocalElimination(
                  h.target,
                  exp.ownerId,
                  'Frag Grenade',
                  matchElapsedMs,
                  nowMs
                );
              }
            } else {
              channelRef.current?.send({
                type: 'damage_hit',
                targetId: h.target.id,
                attackerId: exp.ownerId,
                damage: h.damage,
                armorPenetration: 0.35,
                weaponLabel: 'Frag Grenade',
                hitX: h.target.x,
                hitY: h.target.y,
              });
            }
          }
        }
      }

      // Update casings & particles
      for (let i = casings.length - 1; i >= 0; i--) {
        const c = casings[i];
        if (nowMs - c.bornAtMs > 6000) {
          casings.splice(i, 1);
          continue;
        }
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx *= Math.pow(0.03, dt);
        c.vy *= Math.pow(0.03, dt);
        c.angle += c.spin * dt;
        c.spin *= Math.pow(0.05, dt);
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (nowMs - p.bornAtMs > p.lifeMs) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.15, dt);
        p.vy *= Math.pow(0.15, dt);
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        if (nowMs - floats[i].bornAtMs > 900) floats.splice(i, 1);
      }
      for (let i = scorches.length - 1; i >= 0; i--) {
        if (nowMs - scorches[i].bornAtMs > 15000) scorches.splice(i, 1);
      }

      // 5. Check Victory Condition (only 1 team or 1 fighter left)
      const aliveFighters = fighters.filter((f) => f.alive);
      const aliveTeams = new Set(aliveFighters.map((f) => f.teamIndex));
      if (matchActive && !matchEnded && fighters.length > 1 && aliveTeams.size <= 1) {
        matchEnded = true;
        const standings = buildMatchStandings(fighters, matchElapsedMs);
        setFinalStandings(standings);
        if (isHost) {
          channelRef.current?.send({ type: 'match_finished', standings });
        }
        void onFinishMatchRef.current(standings);
      }

      // 6. Send Network Sync Packets (~20Hz)
      if (!soloMode && channelRef.current && nowMs - lastNetSendMs >= 50) {
        lastNetSendMs = nowMs;
        packetSeq += 1;
        channelRef.current.send({
          type: 'fighter_state',
          packet: toFighterPacket(localFighter, packetSeq),
        });
      }
      if (!soloMode && isHost && channelRef.current && nowMs - lastAiSendMs >= 75) {
        lastAiSendMs = nowMs;
        packetSeq += 1;
        const aiPackets = fighters
          .filter((f) => f.isAi && f.alive)
          .map((f) => toFighterPacket(f, packetSeq));
        if (aiPackets.length > 0) {
          channelRef.current.send({ type: 'ai_batch', packets: aiPackets });
        }
      }

      // 7. Render 2D Tactical Canvas
      if (!localFighter.alive) {
        const teammate = aliveFighters.find((f) => f.teamIndex === localFighter.teamIndex);
        spectateTargetId = teammate?.id ?? aliveFighters[0]?.id ?? localFighter.id;
      } else {
        spectateTargetId = localFighter.id;
      }

      renderer.render(
        {
          world,
          fighters,
          localFighterId: spectateTargetId,
          bullets,
          grenades,
          drops,
          storm,
          particles,
          casings,
          floats,
          scorches,
          mouseScreenX,
          mouseScreenY,
          hitmarkerUntilMs,
          nowMs,
        },
        dt
      );

      // 8. Draw Minimap (~15Hz)
      if (minimapCanvasRef.current && nowMs - lastMinimapDrawMs >= 65) {
        lastMinimapDrawMs = nowMs;
        const mc = minimapCanvasRef.current.getContext('2d');
        if (mc) {
          mc.clearRect(0, 0, 168, 168);
          mc.drawImage(mmStatic, 0, 0);

          mc.save();
          mc.strokeStyle = world.def.stormColor;
          mc.lineWidth = 2;
          mc.beginPath();
          mc.arc(
            storm.centerX * mmScale,
            storm.centerY * mmScale,
            Math.max(2, storm.currentRadius * mmScale),
            0,
            Math.PI * 2
          );
          mc.stroke();

          if (storm.targetRadius < storm.currentRadius - 10) {
            mc.strokeStyle = 'rgba(255,255,255,0.5)';
            mc.setLineDash([4, 3]);
            mc.lineWidth = 1;
            mc.beginPath();
            mc.arc(
              storm.centerX * mmScale,
              storm.centerY * mmScale,
              storm.targetRadius * mmScale,
              0,
              Math.PI * 2
            );
            mc.stroke();
          }
          mc.restore();

          for (const c of world.crates) {
            if (!c.opened && c.kind === 'supply_drop') {
              mc.fillStyle = '#fbbf24';
              mc.fillRect(c.x * mmScale - 3, c.y * mmScale - 3, 6, 6);
            }
          }

          for (const f of fighters) {
            if (!f.alive) continue;
            if (f.id === localFighter.id) {
              mc.fillStyle = '#38bdf8';
              mc.beginPath();
              mc.arc(f.x * mmScale, f.y * mmScale, 4, 0, Math.PI * 2);
              mc.fill();
              mc.strokeStyle = '#ffffff';
              mc.lineWidth = 1.2;
              mc.stroke();
            } else if (f.teamIndex === localFighter.teamIndex) {
              mc.fillStyle = '#22c55e';
              mc.beginPath();
              mc.arc(f.x * mmScale, f.y * mmScale, 3.2, 0, Math.PI * 2);
              mc.fill();
            }
          }
        }
      }

      // 9. Update React HUD (~12Hz)
      if (nowMs - lastHudUpdateMs >= 80) {
        lastHudUpdateMs = nowMs;
        const w0 = localFighter.weapons[0];
        const w1 = localFighter.weapons[1];
        const activeBanner = nowMs < airdropBannerUntilMs ? airdropBanner : null;

        let nearbyPrompt: string | null = null;
        if (localFighter.alive) {
          for (const d of drops) {
            if (Math.hypot(d.x - localFighter.x, d.y - localFighter.y) < 58) {
              nearbyPrompt =
                d.kind === 'weapon' && d.weaponId
                  ? `Press [E] Equip ${WEAPONS[d.weaponId].name}`
                  : d.kind === 'armor'
                    ? `Press [E] +${d.armorValue} Armor`
                    : d.kind === 'medkit'
                      ? 'Press [E] Medkit'
                      : d.kind === 'grenade'
                        ? 'Press [E] Frag Grenade'
                        : 'Press [E] Ammo';
              break;
            }
          }
          if (!nearbyPrompt) {
            for (const c of world.crates) {
              if (!c.opened && Math.hypot(c.x - localFighter.x, c.y - localFighter.y) < 68) {
                nearbyPrompt =
                  c.kind === 'supply_drop' ? 'Press [E] Open Supply Drop' : 'Press [E] Open Crate';
                break;
              }
            }
          }
        }

        const dashRem = Math.max(0, localFighter.dashCooldownUntilMs - nowMs);
        const distStorm = Math.hypot(
          localFighter.x - storm.centerX,
          localFighter.y - storm.centerY
        );

        const w0Reserve = w0 ? localFighter.reserveAmmo[WEAPONS[w0.weaponId].ammoType] : 0;
        const w1Reserve = w1 ? localFighter.reserveAmmo[WEAPONS[w1.weaponId].ammoType] : 0;

        setHud({
          countdownSec: countdownMs > 0 ? Math.ceil(countdownMs / 1000) : null,
          aliveCount: aliveFighters.length,
          totalCombatants: fighters.length,
          hp: Math.ceil(localFighter.hp),
          maxHp: localFighter.maxHp,
          armor: Math.ceil(localFighter.armor),
          maxArmor: localFighter.maxArmor,
          kills: localFighter.kills,
          medkits: localFighter.medkits,
          grenades: localFighter.grenades,
          dashReadyPct: dashRem <= 0 ? 1 : Math.max(0, 1 - dashRem / 2200),
          healing: localFighter.healingUntilMs > nowMs,
          reloading: localFighter.reloadingUntilMs > nowMs,
          activeSlot: localFighter.activeSlot,
          slot0Label: w0 ? WEAPONS[w0.weaponId].shortName : 'Empty',
          slot0Ammo: w0 ? `${w0.magAmmo} / ${w0Reserve}` : '--',
          slot0Color: w0 ? RARITY_META[w0.rarity].color : '#475569',
          slot1Label: w1 ? WEAPONS[w1.weaponId].shortName : 'Empty Slot',
          slot1Ammo: w1 ? `${w1.magAmmo} / ${w1Reserve}` : '--',
          slot1Color: w1 ? RARITY_META[w1.rarity].color : '#475569',
          stormPhase: storm.phase,
          stormShrinking: storm.shrinking,
          stormNextSec: storm.secondsToNextChange,
          inStorm: distStorm > storm.currentRadius,
          matchElapsedMs,
          localAlive: localFighter.alive,
          localPlacement,
          killFeed: killFeed.slice(0, 4),
          airdropBanner: activeBanner,
          nearbyPrompt,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('contextmenu', onContextMenu);
      sound.dispose();
    };
  }, [room.id, isSolo]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      {/* Main 2D Canvas */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Left Tactical Match Telemetry & Kill Feed */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2 backdrop-blur-md">
          <div className="flex items-center gap-1.5 border-r border-slate-700 pr-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-xs font-bold text-slate-400 uppercase">Alive</span>
            <span className="font-mono text-base font-black text-white">
              {hud.aliveCount}/{hud.totalCombatants}
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-r border-slate-700 pr-3">
            <span className="text-xs font-bold text-slate-400 uppercase">Kills</span>
            <span className="font-mono text-base font-black text-rose-400">{hud.kills}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                hud.stormShrinking ? 'animate-ping bg-violet-400' : 'bg-violet-400'
              }`}
            />
            <span className="text-xs font-bold text-violet-300">
              Zone {hud.stormPhase} • {hud.stormShrinking ? 'CLOSING' : `${hud.stormNextSec}s`}
            </span>
          </div>
        </div>

        {hud.inStorm && hud.localAlive && (
          <div className="rounded-xl border border-violet-500/70 bg-violet-950/90 px-3 py-1.5 text-xs font-black tracking-wide text-violet-200 uppercase animate-pulse">
            OUTSIDE SAFE ZONE — TAKING STORM DAMAGE!
          </div>
        )}

        {hud.airdropBanner && (
          <div className="rounded-xl border border-amber-400/80 bg-amber-950/90 px-3 py-1.5 text-xs font-black tracking-wide text-amber-200 uppercase">
            {hud.airdropBanner}
          </div>
        )}

        {/* Kill Feed */}
        <div className="flex flex-col gap-1">
          {hud.killFeed.map((k) => (
            <div
              key={k.id}
              className="flex items-center gap-1.5 rounded-lg bg-slate-950/75 px-2.5 py-1 text-[11px] font-bold text-slate-200 backdrop-blur"
            >
              <span className="text-amber-300">{k.killerName}</span>
              <span className="text-slate-500">[{k.weaponLabel}]</span>
              <span className="text-rose-400">{k.victimName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top-Right Minimap & Action Controls */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="overflow-hidden rounded-2xl border-2 border-slate-700/90 bg-slate-950/90 shadow-2xl">
          <canvas
            ref={minimapCanvasRef}
            width={168}
            height={168}
            className="block h-[144px] w-[144px] sm:h-[168px] sm:w-[168px]"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTouchPad((v) => !v)}
            className="rounded-xl border border-slate-700 bg-slate-950/85 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-cyan-400"
          >
            {touchPad ? 'Hide Pad' : 'Touch Pad'}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-xl border border-slate-700 bg-slate-950/85 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-amber-400"
          >
            {muted ? 'Unmute' : 'Audio On'}
          </button>
          <button
            type="button"
            onClick={() => void onLeaveMatchRef.current()}
            className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-900"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Center Countdown Banner */}
      {hud.countdownSec !== null && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <div className="rounded-3xl border border-amber-400/50 bg-slate-950/90 px-10 py-6 text-center shadow-2xl">
            <div className="text-xs font-black tracking-[0.3em] text-amber-300 uppercase">
              Drop Pods Deploying
            </div>
            <div className="mt-1 text-6xl font-black text-white">{hud.countdownSec}</div>
          </div>
        </div>
      )}

      {/* Nearby Loot Hint */}
      {hud.nearbyPrompt && hud.localAlive && (
        <div className="pointer-events-none absolute bottom-32 left-1/2 z-20 -translate-x-1/2 rounded-full border border-cyan-400/60 bg-slate-950/90 px-4 py-1.5 text-xs font-black text-cyan-200 shadow-lg">
          {hud.nearbyPrompt}
        </div>
      )}

      {/* Eliminated Spectator Banner */}
      {!hud.localAlive && !finalStandings && (
        <div className="absolute top-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-rose-500/60 bg-slate-950/90 px-5 py-2.5 backdrop-blur">
          <div>
            <div className="text-xs font-black text-rose-400 uppercase">
              Eliminated — #{hud.localPlacement ?? hud.aliveCount + 1} Place
            </div>
            <div className="text-[11px] text-slate-300">Spectating live match...</div>
          </div>
          <button
            type="button"
            onClick={() => void onLeaveMatchRef.current()}
            className="rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-400"
          >
            Return to Lobby
          </button>
        </div>
      )}

      {/* Bottom Tactical HUD */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex w-[94%] max-w-2xl -translate-x-1/2 flex-col gap-2">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/85 p-3 backdrop-blur-md">
          <div className="mb-1.5 flex items-center justify-between text-xs font-black">
            <div className="flex items-center gap-3">
              <span className="text-emerald-300">
                HP {hud.hp}/{hud.maxHp}
              </span>
              <span className="text-sky-300">
                ARMOR {hud.armor}/{hud.maxArmor}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-emerald-200">[H] Medkit: {hud.medkits}</span>
              <span className="text-orange-300">[G] Frag: {hud.grenades}</span>
              <span className={hud.dashReadyPct >= 1 ? 'text-cyan-300' : 'text-slate-500'}>
                [Shift] Dash {Math.round(hud.dashReadyPct * 100)}%
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-sky-400 transition-all duration-100"
                style={{ width: `${(hud.armor / hud.maxArmor) * 100}%` }}
              />
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.hp > 50 ? 'bg-emerald-400' : hud.hp > 25 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
              />
            </div>
          </div>

          {(hud.reloading || hud.healing) && (
            <div className="mt-1.5 text-center text-[11px] font-black tracking-wider text-amber-300 uppercase">
              {hud.reloading ? 'Reloading Magazine...' : 'Applying Tactical Medkit...'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div
            className="flex items-center justify-between rounded-xl border-2 bg-slate-950/90 px-3 py-2"
            style={{
              borderColor: hud.activeSlot === 0 ? hud.slot0Color : 'rgba(51,65,85,0.7)',
            }}
          >
            <div>
              <div className="text-[10px] font-bold text-slate-400">[1] PRIMARY</div>
              <div className="text-xs font-black" style={{ color: hud.slot0Color }}>
                {hud.slot0Label}
              </div>
            </div>
            <div className="font-mono text-xs font-black text-white">{hud.slot0Ammo}</div>
          </div>

          <div
            className="flex items-center justify-between rounded-xl border-2 bg-slate-950/90 px-3 py-2"
            style={{
              borderColor: hud.activeSlot === 1 ? hud.slot1Color : 'rgba(51,65,85,0.7)',
            }}
          >
            <div>
              <div className="text-[10px] font-bold text-slate-400">[2] SECONDARY</div>
              <div className="text-xs font-black" style={{ color: hud.slot1Color }}>
                {hud.slot1Label}
              </div>
            </div>
            <div className="font-mono text-xs font-black text-white">{hud.slot1Ammo}</div>
          </div>
        </div>
      </div>

      {/* Optional Mobile / Touch Controls */}
      {touchPad && (
        <>
          <div className="pointer-events-auto absolute bottom-32 left-4 z-20 grid grid-cols-3 gap-1.5">
            <div />
            <button
              type="button"
              onTouchStart={() => (virtualInputRef.current.moveY = -1)}
              onTouchEnd={() => (virtualInputRef.current.moveY = 0)}
              onMouseDown={() => (virtualInputRef.current.moveY = -1)}
              onMouseUp={() => (virtualInputRef.current.moveY = 0)}
              className="h-11 w-11 rounded-xl border border-slate-600 bg-slate-900/85 text-xs font-black text-white"
            >
              ▲
            </button>
            <div />
            <button
              type="button"
              onTouchStart={() => (virtualInputRef.current.moveX = -1)}
              onTouchEnd={() => (virtualInputRef.current.moveX = 0)}
              onMouseDown={() => (virtualInputRef.current.moveX = -1)}
              onMouseUp={() => (virtualInputRef.current.moveX = 0)}
              className="h-11 w-11 rounded-xl border border-slate-600 bg-slate-900/85 text-xs font-black text-white"
            >
              ◀
            </button>
            <button
              type="button"
              onTouchStart={() => (virtualInputRef.current.moveY = 1)}
              onTouchEnd={() => (virtualInputRef.current.moveY = 0)}
              onMouseDown={() => (virtualInputRef.current.moveY = 1)}
              onMouseUp={() => (virtualInputRef.current.moveY = 0)}
              className="h-11 w-11 rounded-xl border border-slate-600 bg-slate-900/85 text-xs font-black text-white"
            >
              ▼
            </button>
            <button
              type="button"
              onTouchStart={() => (virtualInputRef.current.moveX = 1)}
              onTouchEnd={() => (virtualInputRef.current.moveX = 0)}
              onMouseDown={() => (virtualInputRef.current.moveX = 1)}
              onMouseUp={() => (virtualInputRef.current.moveX = 0)}
              className="h-11 w-11 rounded-xl border border-slate-600 bg-slate-900/85 text-xs font-black text-white"
            >
              ▶
            </button>
          </div>
          <div className="pointer-events-auto absolute right-4 bottom-32 z-20 flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onTouchStart={() => (virtualInputRef.current.interactPressed = true)}
                onClick={() => (virtualInputRef.current.interactPressed = true)}
                className="rounded-xl bg-cyan-500/85 px-3 py-2 text-xs font-black text-slate-950"
              >
                LOOT
              </button>
              <button
                type="button"
                onTouchStart={() => (virtualInputRef.current.healPressed = true)}
                onClick={() => (virtualInputRef.current.healPressed = true)}
                className="rounded-xl bg-emerald-500/85 px-3 py-2 text-xs font-black text-slate-950"
              >
                HEAL
              </button>
              <button
                type="button"
                onTouchStart={() => (virtualInputRef.current.grenadePressed = true)}
                onClick={() => (virtualInputRef.current.grenadePressed = true)}
                className="rounded-xl bg-orange-500/85 px-3 py-2 text-xs font-black text-slate-950"
              >
                FRAG
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onTouchStart={() => (virtualInputRef.current.dashPressed = true)}
                onClick={() => (virtualInputRef.current.dashPressed = true)}
                className="rounded-xl bg-sky-500/85 px-3 py-2 text-xs font-black text-slate-950"
              >
                DASH
              </button>
              <button
                type="button"
                onTouchStart={() => (virtualInputRef.current.reloadPressed = true)}
                onClick={() => (virtualInputRef.current.reloadPressed = true)}
                className="rounded-xl bg-amber-400/85 px-3 py-2 text-xs font-black text-slate-950"
              >
                RELOAD
              </button>
              <button
                type="button"
                onTouchStart={() => (virtualInputRef.current.firing = true)}
                onTouchEnd={() => (virtualInputRef.current.firing = false)}
                onMouseDown={() => (virtualInputRef.current.firing = true)}
                onMouseUp={() => (virtualInputRef.current.firing = false)}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white"
              >
                FIRE
              </button>
            </div>
          </div>
        </>
      )}

      {/* Victory Royale / Final Match Standings Modal */}
      {finalStandings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-400/40 bg-slate-900/95 p-6 shadow-2xl">
            <div className="mb-4 text-center">
              <div className="text-xs font-black tracking-[0.28em] text-amber-300 uppercase">
                Match Complete • {formatDurationMs(hud.matchElapsedMs)}
              </div>
              <h2 className="mt-1 bg-gradient-to-r from-amber-300 via-yellow-200 to-cyan-300 bg-clip-text text-3xl font-black text-transparent sm:text-4xl">
                {finalStandings.find((s) => s.playerId === localPlayerId)?.placement === 1
                  ? 'VICTORY ROYALE!'
                  : `${finalStandings[0]?.nickname ?? 'SURVIVOR'} WINS THE DROP!`}
              </h2>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {finalStandings.map((row) => {
                const isMe = row.playerId === localPlayerId;
                return (
                  <div
                    key={row.playerId}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${
                      isMe
                        ? 'border-cyan-400 bg-cyan-500/15'
                        : row.placement === 1
                          ? 'border-amber-400/50 bg-amber-500/10'
                          : 'border-slate-800 bg-slate-950/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 font-mono text-sm font-black ${
                          row.placement === 1 ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        #{row.placement}
                      </span>
                      <div>
                        <span className="font-black text-white">{row.nickname}</span>
                        {row.isAi && (
                          <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                            BOT
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 font-mono">
                      <span className="font-bold text-rose-300">{row.kills} Kills</span>
                      <span className="text-sky-300">{row.damageDealt} DMG</span>
                      <span className="text-slate-400">{formatDurationMs(row.survivalMs)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void onPlayAgain()}
                className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-sm font-black text-slate-950 uppercase transition hover:brightness-110"
              >
                {isSolo
                  ? 'Drop Again'
                  : room.host_id === localPlayerId
                    ? 'Back to Squad Lobby'
                    : 'Check Lobby Reset'}
              </button>
              <button
                type="button"
                onClick={() => void onLeaveMatchRef.current()}
                className="rounded-2xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-black text-white uppercase transition hover:bg-slate-700"
              >
                Main Menu
              </button>
            </div>
            {!isSolo && room.host_id !== localPlayerId && (
              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                Waiting for the host to reset the squad lobby, or click Main Menu to leave.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
