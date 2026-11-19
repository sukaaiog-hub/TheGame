import { describe, it, expect } from 'vitest';
import { WEAPONS, WEAPON_LIST, getModeLoadout } from '../src/weapons.js';
import { MAPS, resolveEntityCollision, raycastMap } from '../src/maps.js';
import { stepPlayerPhysics } from '../src/physics.js';
import { hasLineOfSight, computeBotDecision } from '../src/bots.js';

describe('Red Eclipse 2 Weapons', () => {
  it('defines 10 distinct RE2 weapons with valid colors and stats', () => {
    expect(WEAPON_LIST).toHaveLength(10);
    for (const w of WEAPON_LIST) {
      expect(WEAPONS[w.id]).toBeDefined();
      expect(w.clipSize).toBeGreaterThan(0);
      expect(w.fireDelayMs).toBeGreaterThan(0);
    }
  });

  it('returns proper mode loadouts', () => {
    expect(getModeLoadout('instagib')).toEqual(['rifle']);
    expect(getModeLoadout('trial')).toEqual(['sword', 'pistol']);
    expect(getModeLoadout('dm')).toContain('rocket');
  });
});

describe('Arena Maps & Collision', () => {
  it('has rift, processing, and ares maps with spawns, pads, pickups, and waypoints', () => {
    for (const id of ['rift', 'processing', 'ares']) {
      const m = MAPS[id];
      expect(m).toBeDefined();
      expect(m.boxes.length).toBeGreaterThan(4);
      expect(m.spawns.length).toBeGreaterThan(3);
      expect(m.jumpPads.length).toBeGreaterThan(0);
      expect(m.pickups.length).toBeGreaterThan(0);
      expect(m.waypoints.length).toBeGreaterThan(5);
    }
  });

  it('resolves floor grounding and blocks walking through walls', () => {
    const map = MAPS.rift;
    const ent = { x: 0, y: 0.04, z: -20, vx: 0, vy: -5, vz: 0 };
    const res = resolveEntityCollision(ent, map);
    expect(res.grounded).toBe(true);
    expect(ent.y).toBe(0);

    // Push into north boundary wall (z = -34.5, width = 1 -> min edge -34)
    const entWall = { x: 0, y: 1, z: -34.1, vx: 0, vy: 0, vz: -10 };
    const wRes = resolveEntityCollision(entWall, map);
    expect(wRes.wallNormal).toEqual({ x: 0, z: 1 });
    expect(entWall.z).toBeGreaterThanOrEqual(-33.5);
  });

  it('raycasts map geometry accurately', () => {
    const map = MAPS.rift;
    // Shoot straight down at open floor (y=0) from (x=-15, y=5, z=-20)
    const hit = raycastMap({ x: -15, y: 5, z: -20 }, { x: 0, y: -1, z: 0 }, 20, map);
    expect(hit).not.toBeNull();
    expect(hit.dist).toBeCloseTo(5, 2);
    expect(hit.normal.y).toBe(1);
  });
});

describe('Impulse Parkour Physics', () => {
  function mkEnt(overrides = {}) {
    return {
      x: -10, y: 0, z: -20, vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: 0, tilt: 0, targetTilt: 0,
      grounded: true, wallNormal: null, wallRunning: false,
      crouching: false, sliding: false, airJumps: 1,
      impulse: 100, dashCooldown: 0, padCooldown: 0,
      shockTimer: 0, burnTimer: 0, bleedTimer: 0,
      ...overrides,
    };
  }

  it('performs ground jump, double jump, and impulse dash', () => {
    const map = MAPS.rift;
    const ent = mkEnt();
    const events = [];
    stepPlayerPhysics(ent, { forward: 1, strafe: 0, jumpJustPressed: true }, map, 0.016, events);
    expect(events.some((e) => e.type === 'jump')).toBe(true);
    expect(ent.vy).toBeGreaterThan(8);

    events.length = 0;
    stepPlayerPhysics(ent, { forward: 1, strafe: 0, jumpJustPressed: true }, map, 0.016, events);
    expect(events.some((e) => e.type === 'doublejump')).toBe(true);

    events.length = 0;
    const impBefore = ent.impulse;
    stepPlayerPhysics(ent, { forward: 1, strafe: 0, dashJustPressed: true }, map, 0.016, events);
    expect(events.some((e) => e.type === 'dash')).toBe(true);
    expect(ent.impulse).toBeLessThan(impBefore);
    expect(Math.hypot(ent.vx, ent.vz)).toBeGreaterThan(18);
  });

  it('executes wall-kick off vertical wall and jump pad launch', () => {
    const map = MAPS.rift;
    const ent = mkEnt({ x: -20.0, y: 2.5, z: 0, grounded: false, wallNormal: { x: 1, z: 0 } });
    const events = [];
    stepPlayerPhysics(ent, { forward: 1, strafe: 0, jumpJustPressed: true }, map, 0.016, events);
    expect(events.some((e) => e.type === 'wallkick')).toBe(true);
    expect(ent.vx).toBeGreaterThan(10);
    expect(ent.vy).toBeGreaterThan(9);

    // Jump pad at (-16, 0.1, 0) in rift
    const padEnt = mkEnt({ x: -16, y: 0.1, z: 0, grounded: true });
    const padEvents = [];
    stepPlayerPhysics(padEnt, { forward: 0, strafe: 0 }, map, 0.016, padEvents);
    expect(padEvents.some((e) => e.type === 'jumppad')).toBe(true);
    expect(padEnt.vy).toBeGreaterThan(15);
  });
});

describe('AI Bot Navigation & LOS', () => {
  it('distinguishes obstructed vs clear line of sight', () => {
    const map = MAPS.rift;
    // Central monument blocks (0,0,-8) from (0,0,8)
    const a = { x: 0, y: 0, z: -8 };
    const b = { x: 0, y: 0, z: 8 };
    expect(hasLineOfSight(a, b, map)).toBe(false);

    // Open lane
    const c = { x: -15, y: 0, z: -20 };
    const d = { x: -15, y: 0, z: -10 };
    expect(hasLineOfSight(c, d, map)).toBe(true);
  });

  it('computes valid bot steering toward enemy in line of sight', () => {
    const map = MAPS.rift;
    const bot = {
      id: 'bot_1', team: 'omega', alive: true,
      x: -15, y: 0, z: -20, yaw: 0, pitch: 0,
      impulse: 100, wallNormal: null, ownedWeapons: ['pistol', 'rifle'],
      weaponId: 'pistol',
    };
    const player = {
      id: 'p1', team: 'alpha', alive: true,
      x: -15, y: 0, z: -10,
    };
    const dec = computeBotDecision(bot, [bot, player], map, 'dm', 0.05, 0.9);
    expect(typeof dec.forward).toBe('number');
    expect(typeof dec.wantsFire).toBe('boolean');
  });
});
