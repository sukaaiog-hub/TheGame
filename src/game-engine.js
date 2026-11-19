/**
 * Core Red Eclipse 2 Browser Game Simulation & Loop.
 */
import { MAPS, raycastMap } from './maps.js';
import { WEAPONS, WEAPON_LIST, getModeLoadout } from './weapons.js';
import { stepPlayerPhysics } from './physics.js';
import { SoundFX } from './audio.js';
import { BOT_NAMES, computeBotDecision } from './bots.js';
import { ArenaRenderer } from './renderer.js';

function createActor({ id, name, isBot, isRemote, team, mode, map, spawnIdx }) {
  const sp = map.spawns[spawnIdx % map.spawns.length];
  const owned = getModeLoadout(mode);
  const ammo = {};
  for (const w of WEAPON_LIST) ammo[w.id] = w.clipSize;
  return {
    id,
    name,
    isBot,
    isRemote,
    team,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: sp.yaw,
    pitch: 0,
    tilt: 0,
    targetTilt: 0,
    grounded: false,
    wallNormal: null,
    wallRunning: false,
    crouching: false,
    sliding: false,
    airJumps: 1,
    hp: 100,
    maxHp: 100,
    impulse: 100,
    alive: true,
    respawnTimer: 0,
    weaponId: owned[0] || 'pistol',
    ownedWeapons: [...owned],
    ammo,
    nextFireTime: 0,
    reloadingUntil: 0,
    kills: 0,
    deaths: 0,
    score: 0,
    burnTimer: 0,
    burnSource: null,
    bleedTimer: 0,
    bleedSource: null,
    shockTimer: 0,
    dotTick: 0,
    hitFlash: 0,
    dashCooldown: 0,
    padCooldown: 0,
  };
}

function getAimDir(yaw, pitch, spread = 0) {
  const sx = spread ? (Math.random() - 0.5) * spread * 2 : 0;
  const sy = spread ? (Math.random() - 0.5) * spread * 2 : 0;
  const cosP = Math.cos(pitch + sy);
  const sinP = Math.sin(pitch + sy);
  const sinY = Math.sin(yaw + sx);
  const cosY = Math.cos(yaw + sx);
  return {
    x: -sinY * cosP,
    y: sinP,
    z: -cosY * cosP,
  };
}

function rayHitActor(origin, dir, maxDist, shooter, actors, mode) {
  let closest = null;
  for (const a of actors) {
    if (!a.alive || a.id === shooter.id) continue;
    if (mode === 'tdm' && a.team === shooter.team) continue;

    // Cylinder/capsule approximation: center XZ, Y in [a.y, a.y + 1.85]
    const cx = a.x;
    const cz = a.z;
    const rad = 0.62;
    const ocx = origin.x - cx;
    const ocz = origin.z - cz;
    const a2 = dir.x * dir.x + dir.z * dir.z;
    if (a2 < 1e-6) continue;
    const b2 = 2 * (ocx * dir.x + ocz * dir.z);
    const c2 = ocx * ocx + ocz * ocz - rad * rad;
    const disc = b2 * b2 - 4 * a2 * c2;
    if (disc < 0) continue;
    const t = (-b2 - Math.sqrt(disc)) / (2 * a2);
    if (t < 0.2 || t > maxDist) continue;
    const hitY = origin.y + dir.y * t;
    if (hitY < a.y - 0.1 || hitY > a.y + 1.92) continue;

    if (!closest || t < closest.dist) {
      closest = {
        actor: a,
        dist: t,
        point: {
          x: origin.x + dir.x * t,
          y: hitY,
          z: origin.z + dir.z * t,
        },
        headshot: hitY >= a.y + 1.38,
      };
    }
  }
  return closest;
}

export class ArenaGameEngine {
  constructor({ canvas, config, realtime, onHudUpdate, onMatchEnd, onExit }) {
    this.canvas = canvas;
    this.config = config;
    this.realtime = realtime || null;
    this.onHudUpdate = onHudUpdate;
    this.onMatchEnd = onMatchEnd;
    this.onExit = onExit;

    this.map = MAPS[config.mapId] || MAPS.rift;
    this.mode = config.mode || 'dm';
    this.sound = new SoundFX();
    this.renderer = new ArenaRenderer(canvas);
    this.renderer.loadMap(this.map);

    this.sensitivity = config.sensitivity ?? 0.0022;
    this.fragLimit = this.mode === 'trial' ? 999 : (config.fragLimit ?? 15);
    this.durationSec = config.durationSec ?? 180;
    this.timeLeft = this.durationSec;
    this.elapsed = 0;
    this.ended = false;
    this.paused = false;
    this.scoped = false;
    this.scoreboardOpen = false;
    this.hitmarkerTimer = 0;
    this.hitmarkerHead = false;
    this.damageFlash = 0;
    this.trickBanner = { text: '', timer: 0 };
    this.killfeed = [];

    this.keys = new Set();
    this.jumpQueued = false;
    this.dashQueued = false;
    this.mouseDownLeft = false;
    this.mouseDownRight = false;

    this.projectiles = [];
    this.projSeq = 1;
    this.pickupTimers = new Map();
    for (const pk of this.map.pickups) {
      this.pickupTimers.set(pk.id, 0);
    }

    // Create local player
    this.localId = config.playerId || `web_${Math.random().toString(36).slice(2, 10)}`;
    this.localPlayer = createActor({
      id: this.localId,
      name: config.playerName || 'ArenaRunner',
      isBot: false,
      isRemote: false,
      team: 'alpha',
      mode: this.mode,
      map: this.map,
      spawnIdx: 0,
    });

    this.actors = [this.localPlayer];
    this.remoteActors = new Map();

    // Spawn bots
    const botCount = this.mode === 'trial' ? 0 : (config.botCount ?? 4);
    const botSkill = config.botDifficulty === 'nightmare' ? 0.92 : config.botDifficulty === 'casual' ? 0.45 : 0.72;
    this.botSkill = botSkill;
    for (let i = 0; i < botCount; i++) {
      const team = this.mode === 'tdm' ? (i % 2 === 0 ? 'omega' : 'alpha') : (i % 2 === 0 ? 'omega' : 'alpha');
      this.actors.push(
        createActor({
          id: `bot_${i + 1}`,
          name: BOT_NAMES[i % BOT_NAMES.length],
          isBot: true,
          isRemote: false,
          team,
          mode: this.mode,
          map: this.map,
          spawnIdx: i + 1,
        })
      );
    }

    this._setupRealtime();
    this._bindInputs();

    this.lastFrame = performance.now();
    this.lastNetSend = 0;
    this.rafId = 0;
  }

  _setupRealtime() {
    if (!this.realtime) return;

    this.realtime.on('presence', (peers) => {
      const seen = new Set();
      for (const p of peers) {
        if (!p || p.id === this.localId) continue;
        seen.add(p.id);
        if (!this.remoteActors.has(p.id)) {
          const actor = createActor({
            id: p.id,
            name: p.name || 'RemotePlayer',
            isBot: false,
            isRemote: true,
            team: p.team || 'omega',
            mode: this.mode,
            map: this.map,
            spawnIdx: 1,
          });
          this.remoteActors.set(p.id, actor);
          this.actors.push(actor);
        }
      }
      for (const [id, actor] of this.remoteActors.entries()) {
        if (!seen.has(id)) {
          this.remoteActors.delete(id);
          this.actors = this.actors.filter((a) => a.id !== id);
        }
      }
    });

    this.realtime.on('player_state', (s) => {
      let actor = this.remoteActors.get(s.id);
      if (!actor) {
        actor = createActor({
          id: s.id,
          name: s.name || 'RemotePlayer',
          isBot: false,
          isRemote: true,
          team: s.team || 'omega',
          mode: this.mode,
          map: this.map,
          spawnIdx: 1,
        });
        this.remoteActors.set(s.id, actor);
        this.actors.push(actor);
      }
      actor.x = s.x;
      actor.y = s.y;
      actor.z = s.z;
      actor.yaw = s.yaw;
      actor.pitch = s.pitch;
      actor.weaponId = s.weaponId || 'pistol';
      actor.hp = s.hp ?? 100;
      actor.alive = s.alive ?? true;
      actor.kills = s.kills ?? actor.kills;
      actor.deaths = s.deaths ?? actor.deaths;
      actor.score = s.score ?? actor.score;
      actor.team = s.team || actor.team;
    });

    this.realtime.on('fire', (f) => {
      if (f.beam) {
        this.renderer.addBeam(f.beam.start, f.beam.end, f.beam.color, 0.14);
      }
      if (f.proj) {
        this.projectiles.push({
          ...f.proj,
          id: `rem_${this.projSeq++}`,
          remoteVisual: true,
        });
      }
    });

    this.realtime.on('damage', (d) => {
      if (d.targetId !== this.localId || !this.localPlayer.alive) return;
      const shooter = this.actors.find((a) => a.id === d.attackerId) || { id: d.attackerId, name: d.attackerName || 'Opponent' };
      this._applyDamage(this.localPlayer, shooter, d.dmg, d.weaponId, d.residual, d.knockbackVec, false);
    });

    this.realtime.on('kill', (k) => {
      this._pushKillfeed(k.killerName, k.victimName, k.weaponId, k.headshot);
    });
  }

  _bindInputs() {
    this._onKeyDown = (e) => {
      if (this.ended) return;
      this.sound.unlock();
      if (['Space', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Tab') {
        this.scoreboardOpen = true;
        return;
      }
      if (e.code === 'Space' && !this.keys.has('Space')) {
        this.jumpQueued = true;
      }
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.keys.has(e.code)) {
        this.dashQueued = true;
      }
      if (e.code === 'KeyR') {
        this._startReload(this.localPlayer);
      }
      if (e.code === 'KeyM') {
        this.sound.muted = !this.sound.muted;
      }
      if (e.code === 'Digit1') this._switchWeaponIndex(0);
      if (e.code === 'Digit2') this._switchWeaponIndex(1);
      if (e.code === 'Digit3') this._switchWeaponIndex(2);
      if (e.code === 'Digit4') this._switchWeaponIndex(3);
      if (e.code === 'Digit5') this._switchWeaponIndex(4);
      if (e.code === 'Digit6') this._switchWeaponIndex(5);
      if (e.code === 'Digit7') this._switchWeaponIndex(6);
      if (e.code === 'Digit8') this._switchWeaponIndex(7);
      if (e.code === 'Digit9') this._switchWeaponIndex(8);
      if (e.code === 'Digit0') this._switchWeaponIndex(9);

      this.keys.add(e.code);
    };

    this._onKeyUp = (e) => {
      if (e.code === 'Tab') {
        this.scoreboardOpen = false;
      }
      this.keys.delete(e.code);
    };

    this._onMouseMove = (e) => {
      if (document.pointerLockElement !== this.canvas || this.ended) return;
      const mult = this.scoped ? 0.45 : 1.0;
      this.localPlayer.yaw -= e.movementX * this.sensitivity * mult;
      this.localPlayer.pitch = Math.max(
        -1.48,
        Math.min(1.48, this.localPlayer.pitch - e.movementY * this.sensitivity * mult)
      );
    };

    this._onMouseDown = (e) => {
      if (this.ended) return;
      this.sound.unlock();
      if (document.pointerLockElement !== this.canvas) {
        this.requestLock();
        return;
      }
      if (e.button === 0) this.mouseDownLeft = true;
      if (e.button === 2) {
        if (this.localPlayer.weaponId === 'rifle') {
          this.scoped = !this.scoped;
        } else {
          this.mouseDownRight = true;
        }
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.mouseDownRight = false;
    };

    this._onWheel = (e) => {
      if (this.ended || document.pointerLockElement !== this.canvas) return;
      const owned = this.localPlayer.ownedWeapons;
      if (owned.length <= 1) return;
      const idx = owned.indexOf(this.localPlayer.weaponId);
      const next = (idx + (e.deltaY > 0 ? 1 : -1) + owned.length) % owned.length;
      this.localPlayer.weaponId = owned[next];
      this.scoped = false;
    };

    this._onContextMenu = (e) => e.preventDefault();

    this._onPointerLockChange = () => {
      this.paused = !this.ended && document.pointerLockElement !== this.canvas;
      if (this.paused) {
        this.mouseDownLeft = false;
        this.mouseDownRight = false;
      }
      this._emitHud();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _switchWeaponIndex(idx) {
    const targetId = WEAPON_LIST[idx]?.id;
    if (targetId && this.localPlayer.ownedWeapons.includes(targetId)) {
      this.localPlayer.weaponId = targetId;
      this.scoped = false;
    } else if (this.localPlayer.ownedWeapons[idx]) {
      this.localPlayer.weaponId = this.localPlayer.ownedWeapons[idx];
      this.scoped = false;
    }
  }

  requestLock() {
    this.sound.unlock();
    if (this.canvas.requestPointerLock) {
      try {
        this.canvas.requestPointerLock();
      } catch {}
    }
  }

  start() {
    this.lastFrame = performance.now();
    this.requestLock();
    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this._update(dt);
      this.renderer.render({
        localPlayer: this.localPlayer,
        actors: this.actors,
        projectiles: this.projectiles,
        pickupStates: new Map(
          Array.from(this.pickupTimers.entries()).map(([id, t]) => [id, t <= 0])
        ),
        timeSec: this.elapsed,
        dt,
        scoped: this.scoped,
      });
      if (!this.ended) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _startReload(actor) {
    const spec = WEAPONS[actor.weaponId];
    if (!spec || spec.reloadMs <= 0) return;
    if (actor.ammo[spec.id] >= spec.clipSize) return;
    if (actor.reloadingUntil > this.elapsed) return;
    actor.reloadingUntil = this.elapsed + spec.reloadMs / 1000;
  }

  _finishReloadIfReady(actor) {
    if (actor.reloadingUntil > 0 && this.elapsed >= actor.reloadingUntil) {
      const spec = WEAPONS[actor.weaponId];
      if (spec) actor.ammo[spec.id] = spec.clipSize;
      actor.reloadingUntil = 0;
    }
  }

  _fireWeapon(actor, secondary = false, aimJitter = 0) {
    if (!actor.alive || this.mode === 'trial') return;
    const spec = WEAPONS[actor.weaponId] || WEAPONS.pistol;
    if (actor.reloadingUntil > this.elapsed) return;
    if (this.elapsed < actor.nextFireTime) return;

    if (spec.clipSize < 900 && this.mode !== 'instagib') {
      if ((actor.ammo[spec.id] ?? 0) <= 0) {
        this._startReload(actor);
        return;
      }
      actor.ammo[spec.id] -= 1;
      if (actor.ammo[spec.id] <= 0) {
        this._startReload(actor);
      }
    }

    const delayMs = secondary ? spec.secDelayMs : spec.fireDelayMs;
    actor.nextFireTime = this.elapsed + (this.mode === 'instagib' ? 0.72 : delayMs / 1000);

    if (actor.id === this.localId) {
      this.sound.playWeapon(spec.id, secondary);
      this.renderer.triggerRecoil(spec.id === 'rocket' || spec.id === 'shotgun' || spec.id === 'rifle' ? 0.14 : 0.06);
    }

    const origin = {
      x: actor.x,
      y: actor.y + (actor.crouching ? 1.02 : 1.52),
      z: actor.z,
    };
    const kind = secondary && spec.secKind ? spec.secKind : spec.kind;

    // Melee / Dash Slash / Airblast
    if (kind === 'melee' || kind === 'melee_dash') {
      const dir = getAimDir(actor.yaw, actor.pitch, 0);
      if (kind === 'melee_dash' && actor.impulse >= 22) {
        actor.impulse -= 22;
        actor.vx = dir.x * 23;
        actor.vy = Math.max(actor.vy, 5) + dir.y * 8;
        actor.vz = dir.z * 23;
        if (actor.id === this.localId) this._showTrick('SWORD DASH');
      }
      const range = secondary ? (spec.secRange || 3.8) : spec.range;
      const hit = rayHitActor(origin, dir, range, actor, this.actors, this.mode);
      if (hit) {
        const dmg = secondary ? spec.secDamage : spec.damage;
        const kb = secondary ? spec.secKnockback : spec.knockback;
        this._applyDamage(
          hit.actor,
          actor,
          dmg,
          spec.id,
          secondary ? spec.secResidual : spec.residual,
          { x: dir.x * kb, y: 4.5, z: dir.z * kb },
          hit.headshot
        );
      }
      return;
    }

    if (kind === 'airblast') {
      const dir = getAimDir(actor.yaw, actor.pitch, 0);
      actor.vx -= dir.x * 12;
      actor.vy = Math.max(actor.vy, 3) - dir.y * 10;
      actor.vz -= dir.z * 12;
      for (const other of this.actors) {
        if (!other.alive || other.id === actor.id) continue;
        const dx = other.x - actor.x;
        const dy = other.y - actor.y;
        const dz = other.z - actor.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < (spec.secRange || 10) && dist > 0.01) {
          other.vx += (dx / dist) * 18;
          other.vy += 8;
          other.vz += (dz / dist) * 18;
        }
      }
      return;
    }

    // Hitscan (Rifle, Zapper, Shotgun primary)
    if (kind === 'hitscan') {
      const pellets = secondary ? 1 : (spec.pellets || 1);
      const spread = (spec.spread || 0) + aimJitter;
      const range = secondary && spec.secRange ? spec.secRange : spec.range;

      for (let i = 0; i < pellets; i++) {
        const dir = getAimDir(actor.yaw, actor.pitch, spread);
        const wallHit = raycastMap(origin, dir, range, this.map);
        const maxD = wallHit ? wallHit.dist : range;
        const actorHit = rayHitActor(origin, dir, maxD, actor, this.actors, this.mode);

        const endPt = actorHit
          ? actorHit.point
          : wallHit
            ? wallHit.point
            : {
                x: origin.x + dir.x * range,
                y: origin.y + dir.y * range,
                z: origin.z + dir.z * range,
              };

        this.renderer.addBeam(origin, endPt, spec.color, spec.id === 'rifle' ? 0.22 : 0.11);
        if (actor.id === this.localId && this.realtime) {
          this.realtime.sendFire({
            id: this.localId,
            beam: { start: origin, end: endPt, color: spec.color },
          });
        }

        if (actorHit) {
          let dmg = secondary && spec.secDamage ? spec.secDamage : spec.damage;
          if (this.mode === 'instagib' && spec.id === 'rifle') dmg = 150;
          else if (actorHit.headshot && spec.headshotDamage) dmg = spec.headshotDamage;
          else if (actorHit.headshot) dmg = Math.round(dmg * 1.45);

          this._applyDamage(
            actorHit.actor,
            actor,
            dmg,
            spec.id,
            secondary ? (spec.secResidual || spec.residual) : spec.residual,
            { x: dir.x * spec.knockback, y: 2.5, z: dir.z * spec.knockback },
            actorHit.headshot
          );
        }
      }
      return;
    }

    // Projectile (Pistol, SMG, Flamer, Plasma, Grenade, Rocket, Shotgun sec)
    const count = kind === 'burst' ? (spec.secPellets || 3) : 1;
    const speed = secondary && spec.secSpeed ? spec.secSpeed : spec.speed;
    const damage = secondary && spec.secDamage ? spec.secDamage : spec.damage;
    const splash = secondary && spec.secSplash ? spec.secSplash : spec.splash;
    const spread = (secondary && spec.secSpread ? spec.secSpread : spec.spread) + aimJitter;
    const fuseSec = (secondary && spec.secFuseMs ? spec.secFuseMs : (spec.fuseMs || 0)) / 1000;

    for (let i = 0; i < count; i++) {
      const dir = getAimDir(actor.yaw, actor.pitch, spread);
      const proj = {
        id: `p_${this.projSeq++}`,
        ownerId: actor.id,
        weaponId: spec.id,
        color: spec.color,
        x: origin.x + dir.x * 0.7,
        y: origin.y + dir.y * 0.7,
        z: origin.z + dir.z * 0.7,
        vx: dir.x * speed + (spec.id === 'grenade' ? actor.vx * 0.25 : 0),
        vy: dir.y * speed + (spec.id === 'grenade' ? 4.5 : 0),
        vz: dir.z * speed + (spec.id === 'grenade' ? actor.vz * 0.25 : 0),
        damage,
        splash,
        knockback: spec.knockback,
        gravity: spec.gravity || 0,
        bouncesLeft: spec.bounces || 0,
        residual: secondary ? (spec.secResidual || spec.residual) : spec.residual,
        fuseLeft: fuseSec > 0 ? fuseSec : 3.2,
        explodeOnTimeout: fuseSec > 0,
        remoteVisual: false,
      };
      this.projectiles.push(proj);
      if (actor.id === this.localId && this.realtime) {
        this.realtime.sendFire({
          id: this.localId,
          proj: {
            ownerId: proj.ownerId,
            weaponId: proj.weaponId,
            color: proj.color,
            x: proj.x,
            y: proj.y,
            z: proj.z,
            vx: proj.vx,
            vy: proj.vy,
            vz: proj.vz,
            gravity: proj.gravity,
            bouncesLeft: proj.bouncesLeft,
            fuseLeft: proj.fuseLeft,
          },
        });
      }
    }
  }

  _applyDamage(victim, attacker, dmg, weaponId, residual, knockbackVec, headshot = false) {
    if (!victim.alive || this.ended) return;
    if (victim.isRemote && attacker.id === this.localId && this.realtime) {
      this.realtime.sendDamage({
        targetId: victim.id,
        attackerId: attacker.id,
        attackerName: attacker.name,
        dmg,
        weaponId,
        residual,
        knockbackVec,
        headshot,
      });
    }

    victim.hp -= dmg;
    victim.hitFlash = 0.14;

    if (knockbackVec) {
      victim.vx += knockbackVec.x;
      victim.vy += knockbackVec.y;
      victim.vz += knockbackVec.z;
    }

    if (residual === 'burn') {
      victim.burnTimer = 2.6;
      victim.burnSource = attacker;
    } else if (residual === 'bleed') {
      victim.bleedTimer = 2.4;
      victim.bleedSource = attacker;
    } else if (residual === 'shock') {
      victim.shockTimer = 2.0;
    }

    if (attacker.id === this.localId && victim.id !== this.localId) {
      this.hitmarkerTimer = 0.18;
      this.hitmarkerHead = headshot;
      this.sound.playHitmarker(headshot);
      if (headshot) this._showTrick('HEADSHOT!');
    }
    if (victim.id === this.localId) {
      this.damageFlash = 0.35;
      this.sound.playDamage();
    }

    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.alive = false;
      victim.respawnTimer = 2.6;
      victim.deaths += 1;

      if (attacker && attacker.id !== victim.id) {
        attacker.kills += 1;
        attacker.score += headshot ? 125 : 100;
        if (attacker.id === this.localId) {
          this.sound.playKill();
          this._showTrick(headshot ? 'HEADSHOT FRAG +125' : `ELIMINATED ${victim.name}`);
        }
        this._pushKillfeed(attacker.name, victim.name, weaponId, headshot);
        if (attacker.id === this.localId && this.realtime) {
          this.realtime.sendKill({
            killerName: attacker.name,
            victimName: victim.name,
            weaponId,
            headshot,
          });
        }
        if (attacker.kills >= this.fragLimit) {
          this._finishMatch(attacker.name);
        }
      } else {
        this._pushKillfeed(victim.name, 'Self', weaponId, false);
      }
    }
  }

  _explode(proj, hitActor = null) {
    this.renderer.addExplosion({ x: proj.x, y: proj.y, z: proj.z }, proj.splash || 4, proj.color);
    this.sound.playExplosion();
    if (proj.remoteVisual) return;

    const shooter = this.actors.find((a) => a.id === proj.ownerId);
    const radius = proj.splash || 5.0;

    for (const a of this.actors) {
      if (!a.alive) continue;
      if (hitActor && a.id === hitActor.id) {
        this._applyDamage(
          a,
          shooter || a,
          proj.damage,
          proj.weaponId,
          proj.residual,
          { x: 0, y: 7, z: 0 },
          false
        );
        continue;
      }

      const dx = a.x - proj.x;
      const dy = (a.y + 0.9) - proj.y;
      const dz = a.z - proj.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;
      if (this.mode === 'tdm' && shooter && a.id !== shooter.id && a.team === shooter.team) continue;

      const falloff = 1 - (dist / radius) * 0.72;
      const isSelf = shooter && a.id === shooter.id;
      const dmg = Math.round(proj.damage * falloff * (isSelf ? 0.35 : 1.0));
      const inv = 1 / Math.max(0.25, dist);
      const kbMag = (proj.knockback || 18) * falloff * (isSelf ? 1.15 : 1.0);
      this._applyDamage(
        a,
        shooter || a,
        dmg,
        proj.weaponId,
        isSelf ? null : proj.residual,
        { x: dx * inv * kbMag, y: Math.max(4, dy * inv * kbMag + 5), z: dz * inv * kbMag },
        false
      );
    }
  }

  _pushKillfeed(killer, victim, weaponId, headshot) {
    this.killfeed.unshift({
      killer,
      victim,
      weapon: WEAPONS[weaponId]?.name || weaponId,
      color: WEAPONS[weaponId]?.hex || '#ef4444',
      headshot,
      time: this.elapsed,
    });
    if (this.killfeed.length > 5) this.killfeed.pop();
  }

  _showTrick(text) {
    this.trickBanner = { text, timer: 1.4 };
  }

  _respawnActor(a, idxHint = 0) {
    const spawns = this.map.spawns;
    const sp = spawns[(idxHint + Math.floor(Math.random() * spawns.length)) % spawns.length];
    a.x = sp.x;
    a.y = sp.y;
    a.z = sp.z;
    a.vx = 0;
    a.vy = 0;
    a.vz = 0;
    a.yaw = sp.yaw;
    a.pitch = 0;
    a.hp = 100;
    a.impulse = 100;
    a.alive = true;
    a.burnTimer = 0;
    a.bleedTimer = 0;
    a.shockTimer = 0;
    a.reloadingUntil = 0;
    for (const w of WEAPON_LIST) a.ammo[w.id] = w.clipSize;
  }

  _update(dt) {
    if (this.ended) return;

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      const sorted = [...this.actors].sort((a, b) => b.kills - a.kills || b.score - a.score);
      this._finishMatch(sorted[0]?.name || this.localPlayer.name);
      return;
    }

    this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.trickBanner.timer = Math.max(0, this.trickBanner.timer - dt);

    // Pickup respawn timers
    for (const [id, t] of this.pickupTimers.entries()) {
      if (t > 0) this.pickupTimers.set(id, Math.max(0, t - dt));
    }

    // Step actors
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (a.hitFlash > 0) a.hitFlash = Math.max(0, a.hitFlash - dt);

      if (!a.alive) {
        if (!a.isRemote) {
          a.respawnTimer -= dt;
          if (a.respawnTimer <= 0) this._respawnActor(a, i);
        }
        continue;
      }

      if (a.isRemote) continue;

      this._finishReloadIfReady(a);

      // Residual burn/bleed DoT ticks
      if (a.burnTimer > 0 || a.bleedTimer > 0) {
        a.dotTick += dt;
        if (a.dotTick >= 0.45) {
          a.dotTick = 0;
          const src = a.burnTimer > 0 ? a.burnSource : a.bleedSource;
          this._applyDamage(a, src || a, 5, a.burnTimer > 0 ? 'flamer' : 'sword', null, null, false);
          if (!a.alive) continue;
        }
      }

      let input;
      const events = [];
      if (a.isBot) {
        const dec = computeBotDecision(a, this.actors, this.map, this.mode, dt, this.botSkill);
        input = dec;
        stepPlayerPhysics(a, input, this.map, dt, events);
        if (dec.wantsFire) this._fireWeapon(a, false, dec.aimJitter);
      } else {
        const fwd = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
          (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
        const str = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
          (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
        input = {
          forward: fwd,
          strafe: str,
          jumpJustPressed: this.jumpQueued,
          dashJustPressed: this.dashQueued,
          crouch: this.keys.has('KeyC') || this.keys.has('ControlLeft'),
        };
        this.jumpQueued = false;
        this.dashQueued = false;

        if (!this.paused) {
          stepPlayerPhysics(a, input, this.map, dt, events);
          for (const ev of events) {
            this.sound.playParkour(ev.type);
            if (ev.type === 'wallkick') this._showTrick('WALL-KICK BOOST');
            else if (ev.type === 'dash') this._showTrick('IMPULSE DASH');
            else if (ev.type === 'jumppad') this._showTrick('GRAV LIFT');
          }
          if (a.wallRunning && this.trickBanner.timer <= 0.1) {
            this._showTrick('WALL-RUN');
          }
          if (this.mouseDownLeft || this.keys.has('KeyF')) {
            this._fireWeapon(a, false, 0);
          } else if (this.mouseDownRight || this.keys.has('KeyE')) {
            this._fireWeapon(a, true, 0);
          }
        }
      }

      // Check pickups
      for (const pk of this.map.pickups) {
        if ((this.pickupTimers.get(pk.id) || 0) > 0) continue;
        const d = Math.hypot(a.x - pk.x, (a.y + 0.8) - pk.y, a.z - pk.z);
        if (d < 1.65) {
          if (pk.kind === 'health' && a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + pk.amount);
            this.pickupTimers.set(pk.id, 10);
            if (a.id === this.localId) this.sound.playPickup();
          } else if (pk.kind === 'impulse' && a.impulse < 98) {
            a.impulse = 100;
            this.pickupTimers.set(pk.id, 8);
            if (a.id === this.localId) this.sound.playPickup();
          } else if (pk.kind === 'weapon' && this.mode !== 'instagib' && this.mode !== 'trial') {
            if (!a.ownedWeapons.includes(pk.weapon)) {
              a.ownedWeapons.push(pk.weapon);
              if (a.id === this.localId) a.weaponId = pk.weapon;
            }
            const spec = WEAPONS[pk.weapon];
            if (spec) a.ammo[pk.weapon] = spec.clipSize;
            this.pickupTimers.set(pk.id, 10);
            if (a.id === this.localId) {
              this.sound.playPickup();
              this._showTrick(`EQUIPPED ${spec.name.toUpperCase()}`);
            }
          }
        }
      }
    }

    // Step projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.fuseLeft -= dt;
      p.vy -= p.gravity * dt;

      const stepDist = Math.hypot(p.vx, p.vy, p.vz) * dt;
      const dir = stepDist > 1e-5
        ? { x: (p.vx * dt) / stepDist, y: (p.vy * dt) / stepDist, z: (p.vz * dt) / stepDist }
        : { x: 0, y: -1, z: 0 };

      // Check actor direct hit
      let hitActor = null;
      if (!p.remoteVisual && stepDist > 0) {
        const shooter = this.actors.find((a) => a.id === p.ownerId) || { id: p.ownerId, team: '' };
        const res = rayHitActor({ x: p.x, y: p.y, z: p.z }, dir, stepDist + 0.35, shooter, this.actors, this.mode);
        if (res) hitActor = res.actor;
      }

      if (hitActor) {
        p.x = hitActor.x;
        p.y = hitActor.y + 1.0;
        p.z = hitActor.z;
        if (p.splash > 0) {
          this._explode(p, hitActor);
        } else {
          const shooter = this.actors.find((a) => a.id === p.ownerId) || hitActor;
          this._applyDamage(
            hitActor,
            shooter,
            p.damage,
            p.weaponId,
            p.residual,
            { x: dir.x * (p.knockback || 5), y: 2, z: dir.z * (p.knockback || 5) },
            false
          );
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check map collision
      const wall = stepDist > 0 ? raycastMap({ x: p.x, y: p.y, z: p.z }, dir, stepDist + 0.15, this.map) : null;
      if (wall) {
        if (p.bouncesLeft > 0) {
          p.bouncesLeft -= 1;
          const dot = p.vx * wall.normal.x + p.vy * wall.normal.y + p.vz * wall.normal.z;
          p.vx = (p.vx - 2 * dot * wall.normal.x) * 0.72;
          p.vy = (p.vy - 2 * dot * wall.normal.y) * 0.72;
          p.vz = (p.vz - 2 * dot * wall.normal.z) * 0.72;
          p.x = wall.point.x + wall.normal.x * 0.12;
          p.y = wall.point.y + wall.normal.y * 0.12;
          p.z = wall.point.z + wall.normal.z * 0.12;
        } else {
          p.x = wall.point.x;
          p.y = wall.point.y;
          p.z = wall.point.z;
          if (p.splash > 0) this._explode(p, null);
          this.projectiles.splice(i, 1);
          continue;
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }

      if (p.fuseLeft <= 0) {
        if (p.explodeOnTimeout || p.splash > 0) this._explode(p, null);
        this.projectiles.splice(i, 1);
      }
    }

    // Send state over Supabase Realtime at ~20Hz
    if (this.realtime && this.elapsed - this.lastNetSend >= 0.05) {
      this.lastNetSend = this.elapsed;
      this.realtime.sendState({
        id: this.localId,
        name: this.localPlayer.name,
        team: this.localPlayer.team,
        x: Math.round(this.localPlayer.x * 100) / 100,
        y: Math.round(this.localPlayer.y * 100) / 100,
        z: Math.round(this.localPlayer.z * 100) / 100,
        yaw: Math.round(this.localPlayer.yaw * 1000) / 1000,
        pitch: Math.round(this.localPlayer.pitch * 1000) / 1000,
        weaponId: this.localPlayer.weaponId,
        hp: this.localPlayer.hp,
        alive: this.localPlayer.alive,
        kills: this.localPlayer.kills,
        deaths: this.localPlayer.deaths,
        score: this.localPlayer.score,
      });
    }

    this._emitHud();
  }

  _emitHud() {
    if (!this.onHudUpdate) return;
    const lp = this.localPlayer;
    const spec = WEAPONS[lp.weaponId] || WEAPONS.pistol;
    this.onHudUpdate({
      hp: Math.ceil(lp.hp),
      impulse: Math.round(lp.impulse),
      alive: lp.alive,
      respawnTimer: Math.max(0, Math.ceil(lp.respawnTimer)),
      weapon: spec,
      ammo: lp.ammo[spec.id] ?? 0,
      clipSize: spec.clipSize,
      reloading: lp.reloadingUntil > this.elapsed,
      ownedWeapons: lp.ownedWeapons,
      timeLeft: Math.ceil(this.timeLeft),
      kills: lp.kills,
      deaths: lp.deaths,
      score: lp.score,
      fragLimit: this.fragLimit,
      paused: this.paused,
      scoped: this.scoped,
      hitmarker: this.hitmarkerTimer > 0,
      hitmarkerHead: this.hitmarkerHead,
      damageFlash: this.damageFlash,
      trick: this.trickBanner.timer > 0 ? this.trickBanner.text : '',
      killfeed: this.killfeed.filter((k) => this.elapsed - k.time < 5.5),
      scoreboardOpen: this.scoreboardOpen,
      standings: [...this.actors]
        .sort((a, b) => b.kills - a.kills || b.score - a.score)
        .map((a) => ({
          id: a.id,
          name: a.name,
          team: a.team,
          isBot: a.isBot,
          kills: a.kills,
          deaths: a.deaths,
          score: a.score,
        })),
      speed: Math.round(Math.hypot(lp.vx, lp.vz) * 10) / 10,
      muted: this.sound.muted,
    });
  }

  _finishMatch(winnerName) {
    if (this.ended) return;
    this.ended = true;
    this.paused = false;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    const standings = [...this.actors]
      .sort((a, b) => b.kills - a.kills || b.score - a.score)
      .map((a) => ({
        auth_key: a.id,
        name: a.name,
        team: a.team,
        isBot: a.isBot,
        kills: a.kills,
        deaths: a.deaths,
        score: a.score,
      }));
    if (this.onMatchEnd) {
      this.onMatchEnd({
        map: this.map.id,
        mode: this.mode,
        duration_s: Math.max(10, Math.round(this.elapsed)),
        winner: winnerName,
        players: standings,
        server_id: this.realtime?.roomCode ? `web-room-${this.realtime.roomCode}` : 'web-browser',
      });
    }
  }

  destroy() {
    this.ended = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    this.renderer.destroy();
  }
}
