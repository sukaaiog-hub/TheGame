/**
 * Red Eclipse 2 browser arena maps: Rift, Processing, Ares.
 * Defines multi-level AABB geometry, ramps, jump pads, weapon/health pickups,
 * spawns, and bot navigation waypoints, plus exact collision & raycast helpers.
 */

export const MAPS = {
  rift: {
    id: 'rift',
    name: 'Rift Citadel',
    subtitle: 'Public DM Default · Multi-tier skybridge citadel with wall-run lanes',
    skyColor: 0x0b1224,
    fogColor: 0x0d162c,
    fogDensity: 0.011,
    ambientColor: 0x7b92b8,
    sunColor: 0xffd6b0,
    accentHex: '#ef4444',
    bounds: { x: 34, y: 28, z: 34 },
    boxes: [
      // Main arena floor & boundary walls
      { x: 0, y: -1, z: 0, w: 68, h: 2, d: 68, mat: 'floor' },
      { x: 0, y: 7, z: -34.5, w: 70, h: 16, d: 1, mat: 'wall' },
      { x: 0, y: 7, z: 34.5, w: 70, h: 16, d: 1, mat: 'wall' },
      { x: -34.5, y: 7, z: 0, w: 1, h: 16, d: 70, mat: 'wall' },
      { x: 34.5, y: 7, z: 0, w: 1, h: 16, d: 70, mat: 'wall' },

      // Central rift monument & upper bridge
      { x: 0, y: 2.5, z: 0, w: 10, h: 5, d: 10, mat: 'panel' },
      { x: 0, y: 5.2, z: 0, w: 14, h: 0.8, d: 6, mat: 'trim' },

      // North & South sniper balconies
      { x: 0, y: 4.5, z: -24, w: 22, h: 1, d: 8, mat: 'panel' },
      { x: 0, y: 4.5, z: 24, w: 22, h: 1, d: 8, mat: 'panel' },

      // Side wall-run corridor walls (East & West flanks)
      { x: -21, y: 4.2, z: 0, w: 1.5, h: 8.4, d: 28, mat: 'wall' },
      { x: 21, y: 4.2, z: 0, w: 1.5, h: 8.4, d: 28, mat: 'wall' },
      { x: -27.5, y: 3.2, z: 0, w: 8, h: 0.8, d: 12, mat: 'panel' },
      { x: 27.5, y: 3.2, z: 0, w: 8, h: 0.8, d: 12, mat: 'panel' },

      // Cover blocks & mid-court pillars
      { x: -11, y: 1.8, z: -12, w: 3.5, h: 3.6, d: 3.5, mat: 'pillar' },
      { x: 11, y: 1.8, z: -12, w: 3.5, h: 3.6, d: 3.5, mat: 'pillar' },
      { x: -11, y: 1.8, z: 12, w: 3.5, h: 3.6, d: 3.5, mat: 'pillar' },
      { x: 11, y: 1.8, z: 12, w: 3.5, h: 3.6, d: 3.5, mat: 'pillar' },

      // Step ledges for non-jump-pad climbing
      { x: -13.5, y: 1.2, z: -24, w: 5, h: 2.4, d: 6, mat: 'panel' },
      { x: 13.5, y: 1.2, z: 24, w: 5, h: 2.4, d: 6, mat: 'panel' },
      { x: 0, y: 2.5, z: -12, w: 6, h: 0.7, d: 4, mat: 'trim' },
      { x: 0, y: 2.5, z: 12, w: 6, h: 0.7, d: 4, mat: 'trim' },
    ],
    ramps: [
      { x: 0, y: 0, z: -17, w: 5, h: 5.0, d: 7, axis: 'z', dir: -1 },
      { x: 0, y: 0, z: 17, w: 5, h: 5.0, d: 7, axis: 'z', dir: 1 },
    ],
    jumpPads: [
      { x: -16, y: 0.1, z: 0, radius: 1.8, vx: 6, vy: 18.5, vz: 0 },
      { x: 16, y: 0.1, z: 0, radius: 1.8, vx: -6, vy: 18.5, vz: 0 },
      { x: -24, y: 0.1, z: -22, radius: 1.8, vx: 6, vy: 17.0, vz: 4 },
      { x: 24, y: 0.1, z: 22, radius: 1.8, vx: -6, vy: 17.0, vz: -4 },
    ],
    pickups: [
      { id: 'pk_rift_rocket', x: 0, y: 6.4, z: 0, kind: 'weapon', weapon: 'rocket' },
      { id: 'pk_rift_rifle_n', x: 0, y: 5.8, z: -25, kind: 'weapon', weapon: 'rifle' },
      { id: 'pk_rift_rifle_s', x: 0, y: 5.8, z: 25, kind: 'weapon', weapon: 'zapper' },
      { id: 'pk_rift_plasma', x: -27.5, y: 4.4, z: 0, kind: 'weapon', weapon: 'plasma' },
      { id: 'pk_rift_flamer', x: 27.5, y: 4.4, z: 0, kind: 'weapon', weapon: 'flamer' },
      { id: 'pk_rift_gren', x: 0, y: 1.0, z: -8, kind: 'weapon', weapon: 'grenade' },
      { id: 'pk_rift_hp1', x: -15, y: 1.0, z: -15, kind: 'health', amount: 45 },
      { id: 'pk_rift_hp2', x: 15, y: 1.0, z: 15, kind: 'health', amount: 45 },
      { id: 'pk_rift_imp1', x: -27.5, y: 1.0, z: 14, kind: 'impulse', amount: 100 },
      { id: 'pk_rift_imp2', x: 27.5, y: 1.0, z: -14, kind: 'impulse', amount: 100 },
    ],
    spawns: [
      { x: -24, y: 1.2, z: -26, yaw: -2.4, team: 'alpha' },
      { x: 24, y: 1.2, z: 26, yaw: 0.7, team: 'omega' },
      { x: 24, y: 1.2, z: -26, yaw: 2.4, team: 'alpha' },
      { x: -24, y: 1.2, z: 26, yaw: -0.7, team: 'omega' },
      { x: -28, y: 4.5, z: 0, yaw: -1.57, team: 'alpha' },
      { x: 28, y: 4.5, z: 0, yaw: 1.57, team: 'omega' },
      { x: -15, y: 1.2, z: 16, yaw: -0.9, team: 'omega' },
      { x: 15, y: 1.2, z: -16, yaw: 2.2, team: 'alpha' },
    ],
    waypoints: [
      { x: 0, y: 6.2, z: 0 },
      { x: 0, y: 5.5, z: -24 },
      { x: 0, y: 5.5, z: 24 },
      { x: -16, y: 1.0, z: 0 },
      { x: 16, y: 1.0, z: 0 },
      { x: -15, y: 1.0, z: -15 },
      { x: 15, y: 1.0, z: -15 },
      { x: -15, y: 1.0, z: 15 },
      { x: 15, y: 1.0, z: 15 },
      { x: -27.5, y: 4.2, z: 0 },
      { x: 27.5, y: 4.2, z: 0 },
      { x: -28, y: 1.0, z: -18 },
      { x: 28, y: 1.0, z: 18 },
    ],
  },

  processing: {
    id: 'processing',
    name: 'Processing Plant',
    subtitle: 'Industrial Reactor Core · Tight flanking lanes & overhead catwalks',
    skyColor: 0x160d0a,
    fogColor: 0x1b100c,
    fogDensity: 0.012,
    ambientColor: 0xc2957b,
    sunColor: 0xffaa70,
    accentHex: '#f59e0b',
    bounds: { x: 30, y: 26, z: 30 },
    boxes: [
      { x: 0, y: -1, z: 0, w: 60, h: 2, d: 60, mat: 'floor' },
      { x: 0, y: 7, z: -30.5, w: 62, h: 16, d: 1, mat: 'wall' },
      { x: 0, y: 7, z: 30.5, w: 62, h: 16, d: 1, mat: 'wall' },
      { x: -30.5, y: 7, z: 0, w: 1, h: 16, d: 62, mat: 'wall' },
      { x: 30.5, y: 7, z: 0, w: 1, h: 16, d: 62, mat: 'wall' },

      // Reactor core ring & center tower
      { x: 0, y: 4.5, z: 0, w: 6, h: 9, d: 6, mat: 'pillar' },
      { x: -8, y: 3.4, z: 0, w: 6, h: 0.8, d: 16, mat: 'panel' },
      { x: 8, y: 3.4, z: 0, w: 6, h: 0.8, d: 16, mat: 'panel' },
      { x: 0, y: 3.4, z: -8, w: 16, h: 0.8, d: 6, mat: 'panel' },
      { x: 0, y: 3.4, z: 8, w: 16, h: 0.8, d: 6, mat: 'panel' },

      // High wall-run ducts
      { x: -18, y: 4.0, z: -12, w: 1.5, h: 8, d: 16, mat: 'wall' },
      { x: 18, y: 4.0, z: 12, w: 1.5, h: 8, d: 16, mat: 'wall' },
      { x: -18, y: 4.0, z: 12, w: 1.5, h: 8, d: 16, mat: 'wall' },
      { x: 18, y: 4.0, z: -12, w: 1.5, h: 8, d: 16, mat: 'wall' },

      // Corner bunkers
      { x: -23, y: 1.8, z: -23, w: 6, h: 3.6, d: 6, mat: 'panel' },
      { x: 23, y: 1.8, z: 23, w: 6, h: 3.6, d: 6, mat: 'panel' },
      { x: -23, y: 1.8, z: 23, w: 6, h: 3.6, d: 6, mat: 'panel' },
      { x: 23, y: 1.8, z: -23, w: 6, h: 3.6, d: 6, mat: 'panel' },
    ],
    ramps: [
      { x: -14, y: 0, z: 0, w: 6, h: 3.8, d: 6, axis: 'x', dir: 1 },
      { x: 14, y: 0, z: 0, w: 6, h: 3.8, d: 6, axis: 'x', dir: -1 },
    ],
    jumpPads: [
      { x: 0, y: 0.1, z: -18, radius: 1.8, vx: 0, vy: 17.5, vz: 6 },
      { x: 0, y: 0.1, z: 18, radius: 1.8, vx: 0, vy: 17.5, vz: -6 },
      { x: -24, y: 0.1, z: 0, radius: 1.8, vx: 7, vy: 16.5, vz: 0 },
      { x: 24, y: 0.1, z: 0, radius: 1.8, vx: -7, vy: 16.5, vz: 0 },
    ],
    pickups: [
      { id: 'pk_proc_rocket', x: -8, y: 4.6, z: 0, kind: 'weapon', weapon: 'rocket' },
      { id: 'pk_proc_plasma', x: 8, y: 4.6, z: 0, kind: 'weapon', weapon: 'plasma' },
      { id: 'pk_proc_flamer', x: 0, y: 4.6, z: -8, kind: 'weapon', weapon: 'flamer' },
      { id: 'pk_proc_rifle', x: 0, y: 4.6, z: 8, kind: 'weapon', weapon: 'rifle' },
      { id: 'pk_proc_hp1', x: -14, y: 1.0, z: -14, kind: 'health', amount: 50 },
      { id: 'pk_proc_hp2', x: 14, y: 1.0, z: 14, kind: 'health', amount: 50 },
      { id: 'pk_proc_imp1', x: -14, y: 1.0, z: 14, kind: 'impulse', amount: 100 },
      { id: 'pk_proc_imp2', x: 14, y: 1.0, z: -14, kind: 'impulse', amount: 100 },
    ],
    spawns: [
      { x: -25, y: 1.2, z: -12, yaw: -1.5, team: 'alpha' },
      { x: 25, y: 1.2, z: 12, yaw: 1.5, team: 'omega' },
      { x: -12, y: 1.2, z: -25, yaw: 3.1, team: 'alpha' },
      { x: 12, y: 1.2, z: 25, yaw: 0, team: 'omega' },
      { x: -25, y: 1.2, z: 12, yaw: -1.6, team: 'omega' },
      { x: 25, y: 1.2, z: -12, yaw: 1.6, team: 'alpha' },
    ],
    waypoints: [
      { x: -8, y: 4.5, z: 0 },
      { x: 8, y: 4.5, z: 0 },
      { x: 0, y: 4.5, z: -8 },
      { x: 0, y: 4.5, z: 8 },
      { x: -14, y: 1.0, z: -14 },
      { x: 14, y: 1.0, z: 14 },
      { x: -14, y: 1.0, z: 14 },
      { x: 14, y: 1.0, z: -14 },
      { x: 0, y: 1.0, z: -18 },
      { x: 0, y: 1.0, z: 18 },
      { x: -24, y: 1.0, z: 0 },
      { x: 24, y: 1.0, z: 0 },
    ],
  },

  ares: {
    id: 'ares',
    name: 'Ares Orbital',
    subtitle: 'High-Speed Parkour Deck · Open vertical sightlines & boost rings',
    skyColor: 0x09111a,
    fogColor: 0x0d1926,
    fogDensity: 0.01,
    ambientColor: 0x8bb4d9,
    sunColor: 0xd9f2ff,
    accentHex: '#38bdf8',
    bounds: { x: 32, y: 30, z: 32 },
    boxes: [
      { x: 0, y: -1, z: 0, w: 64, h: 2, d: 64, mat: 'floor' },
      { x: 0, y: 7, z: -32.5, w: 66, h: 16, d: 1, mat: 'wall' },
      { x: 0, y: 7, z: 32.5, w: 66, h: 16, d: 1, mat: 'wall' },
      { x: -32.5, y: 7, z: 0, w: 1, h: 16, d: 66, mat: 'wall' },
      { x: 32.5, y: 7, z: 0, w: 1, h: 16, d: 66, mat: 'wall' },

      // Center high deck + parkour arches
      { x: 0, y: 6.2, z: 0, w: 14, h: 1, d: 14, mat: 'trim' },
      { x: -14, y: 3.4, z: 0, w: 8, h: 0.8, d: 10, mat: 'panel' },
      { x: 14, y: 3.4, z: 0, w: 8, h: 0.8, d: 10, mat: 'panel' },
      { x: 0, y: 3.4, z: -14, w: 10, h: 0.8, d: 8, mat: 'panel' },
      { x: 0, y: 3.4, z: 14, w: 10, h: 0.8, d: 8, mat: 'panel' },

      // Long wall-run rails
      { x: -23, y: 4.5, z: 0, w: 1.4, h: 9, d: 34, mat: 'wall' },
      { x: 23, y: 4.5, z: 0, w: 1.4, h: 9, d: 34, mat: 'wall' },

      // Symmetrical cover pillars
      { x: -9, y: 2.0, z: -9, w: 3, h: 4, d: 3, mat: 'pillar' },
      { x: 9, y: 2.0, z: -9, w: 3, h: 4, d: 3, mat: 'pillar' },
      { x: -9, y: 2.0, z: 9, w: 3, h: 4, d: 3, mat: 'pillar' },
      { x: 9, y: 2.0, z: 9, w: 3, h: 4, d: 3, mat: 'pillar' },
    ],
    ramps: [
      { x: -20, y: 0, z: -12, w: 5, h: 3.8, d: 8, axis: 'z', dir: 1 },
      { x: 20, y: 0, z: 12, w: 5, h: 3.8, d: 8, axis: 'z', dir: -1 },
    ],
    jumpPads: [
      { x: 0, y: 0.1, z: -23, radius: 2.0, vx: 0, vy: 19.5, vz: 8 },
      { x: 0, y: 0.1, z: 23, radius: 2.0, vx: 0, vy: 19.5, vz: -8 },
      { x: -14, y: 3.85, z: 0, radius: 1.6, vx: 7, vy: 14.5, vz: 0 },
      { x: 14, y: 3.85, z: 0, radius: 1.6, vx: -7, vy: 14.5, vz: 0 },
    ],
    pickups: [
      { id: 'pk_ares_rifle', x: 0, y: 7.4, z: 0, kind: 'weapon', weapon: 'rifle' },
      { id: 'pk_ares_rocket', x: 0, y: 4.6, z: -14, kind: 'weapon', weapon: 'rocket' },
      { id: 'pk_ares_zapper', x: 0, y: 4.6, z: 14, kind: 'weapon', weapon: 'zapper' },
      { id: 'pk_ares_gren', x: 0, y: 1.0, z: 0, kind: 'weapon', weapon: 'grenade' },
      { id: 'pk_ares_hp1', x: -18, y: 1.0, z: -18, kind: 'health', amount: 50 },
      { id: 'pk_ares_hp2', x: 18, y: 1.0, z: 18, kind: 'health', amount: 50 },
      { id: 'pk_ares_imp1', x: -27, y: 1.0, z: 0, kind: 'impulse', amount: 100 },
      { id: 'pk_ares_imp2', x: 27, y: 1.0, z: 0, kind: 'impulse', amount: 100 },
    ],
    spawns: [
      { x: -26, y: 1.2, z: -24, yaw: -2.4, team: 'alpha' },
      { x: 26, y: 1.2, z: 24, yaw: 0.8, team: 'omega' },
      { x: 26, y: 1.2, z: -24, yaw: 2.4, team: 'alpha' },
      { x: -26, y: 1.2, z: 24, yaw: -0.8, team: 'omega' },
      { x: 0, y: 7.5, z: 0, yaw: 0, team: 'alpha' },
      { x: -27, y: 1.2, z: 0, yaw: -1.57, team: 'omega' },
    ],
    waypoints: [
      { x: 0, y: 7.2, z: 0 },
      { x: -14, y: 4.4, z: 0 },
      { x: 14, y: 4.4, z: 0 },
      { x: 0, y: 4.4, z: -14 },
      { x: 0, y: 4.4, z: 14 },
      { x: 0, y: 1.0, z: -23 },
      { x: 0, y: 1.0, z: 23 },
      { x: -18, y: 1.0, z: -18 },
      { x: 18, y: 1.0, z: 18 },
      { x: -27, y: 1.0, z: 0 },
      { x: 27, y: 1.0, z: 0 },
    ],
  },
};

export const PLAYER_RADIUS = 0.55;
export const PLAYER_HEIGHT = 1.8;

/**
 * Resolves entity AABB against map boxes & ramps, detecting ground & wall contact.
 */
export function resolveEntityCollision(ent, map, radius = PLAYER_RADIUS, height = PLAYER_HEIGHT) {
  let grounded = false;
  let wallNormal = null;

  // Step 1: Resolve XZ against solid boxes that vertically overlap the player
  for (const b of map.boxes) {
    const minY = b.y - b.h / 2;
    const maxY = b.y + b.h / 2;
    if (ent.y >= maxY - 0.05 || ent.y + height <= minY + 0.05) continue;

    const minX = b.x - b.w / 2 - radius;
    const maxX = b.x + b.w / 2 + radius;
    const minZ = b.z - b.d / 2 - radius;
    const maxZ = b.z + b.d / 2 + radius;

    if (ent.x > minX && ent.x < maxX && ent.z > minZ && ent.z < maxZ) {
      const dxLeft = ent.x - minX;
      const dxRight = maxX - ent.x;
      const dzFront = ent.z - minZ;
      const dzBack = maxZ - ent.z;
      const minPen = Math.min(dxLeft, dxRight, dzFront, dzBack);

      if (minPen === dxLeft) {
        ent.x = minX;
        if (ent.vx > 0) ent.vx = 0;
        wallNormal = { x: -1, z: 0 };
      } else if (minPen === dxRight) {
        ent.x = maxX;
        if (ent.vx < 0) ent.vx = 0;
        wallNormal = { x: 1, z: 0 };
      } else if (minPen === dzFront) {
        ent.z = minZ;
        if (ent.vz > 0) ent.vz = 0;
        wallNormal = { x: 0, z: -1 };
      } else {
        ent.z = maxZ;
        if (ent.vz < 0) ent.vz = 0;
        wallNormal = { x: 0, z: 1 };
      }
    }
  }

  // Also detect nearby vertical wall within 0.35m for wall-run/kick
  if (!wallNormal) {
    const probe = radius + 0.36;
    for (const b of map.boxes) {
      if (b.h < 2.2) continue;
      const minY = b.y - b.h / 2;
      const maxY = b.y + b.h / 2;
      if (ent.y >= maxY - 0.2 || ent.y + height <= minY + 0.2) continue;
      const minX = b.x - b.w / 2 - probe;
      const maxX = b.x + b.w / 2 + probe;
      const minZ = b.z - b.d / 2 - probe;
      const maxZ = b.z + b.d / 2 + probe;
      if (ent.x > minX && ent.x < maxX && ent.z > minZ && ent.z < maxZ) {
        const dx = Math.min(ent.x - minX, maxX - ent.x);
        const dz = Math.min(ent.z - minZ, maxZ - ent.z);
        if (dx < dz) {
          wallNormal = { x: (ent.x - b.x) >= 0 ? 1 : -1, z: 0 };
        } else {
          wallNormal = { x: 0, z: (ent.z - b.z) >= 0 ? 1 : -1 };
        }
        break;
      }
    }
  }

  // Step 2: Vertical resolution against boxes
  for (const b of map.boxes) {
    const minX = b.x - b.w / 2 - radius * 0.92;
    const maxX = b.x + b.w / 2 + radius * 0.92;
    const minZ = b.z - b.d / 2 - radius * 0.92;
    const maxZ = b.z + b.d / 2 + radius * 0.92;
    if (ent.x <= minX || ent.x >= maxX || ent.z <= minZ || ent.z >= maxZ) continue;

    const minY = b.y - b.h / 2;
    const maxY = b.y + b.h / 2;

    if (ent.vy <= 0 && ent.y <= maxY + 0.08 && ent.y >= maxY - 0.95) {
      ent.y = maxY;
      ent.vy = 0;
      grounded = true;
    } else if (ent.vy > 0 && ent.y + height >= minY && ent.y < minY) {
      ent.y = minY - height;
      ent.vy = 0;
    }
  }

  // Step 3: Sloped ramps
  for (const r of map.ramps) {
    const halfW = r.w / 2 + radius * 0.6;
    const halfD = r.d / 2 + radius * 0.6;
    if (ent.x < r.x - halfW || ent.x > r.x + halfW || ent.z < r.z - halfD || ent.z > r.z + halfD) {
      continue;
    }
    let t = 0;
    if (r.axis === 'z') {
      const local = (ent.z - (r.z - r.d / 2)) / r.d;
      t = r.dir > 0 ? local : 1 - local;
    } else {
      const local = (ent.x - (r.x - r.w / 2)) / r.w;
      t = r.dir > 0 ? local : 1 - local;
    }
    t = Math.max(0, Math.min(1, t));
    const surfaceY = r.y + t * r.h;
    if (ent.vy <= 2 && ent.y <= surfaceY + 0.35 && ent.y >= surfaceY - 1.2) {
      ent.y = surfaceY;
      ent.vy = Math.max(0, ent.vy);
      grounded = true;
    }
  }

  // Hard bounds safety clamp
  ent.x = Math.max(-map.bounds.x, Math.min(map.bounds.x, ent.x));
  ent.z = Math.max(-map.bounds.z, Math.min(map.bounds.z, ent.z));
  if (ent.y < 0) {
    ent.y = 0;
    ent.vy = 0;
    grounded = true;
  }

  return { grounded, wallNormal };
}

/**
 * Exact slab raycast against map boxes. Returns closest hit { dist, point, normal } or null.
 */
export function raycastMap(origin, dir, maxDist, map) {
  let closest = null;

  for (const b of map.boxes) {
    const minX = b.x - b.w / 2;
    const maxX = b.x + b.w / 2;
    const minY = b.y - b.h / 2;
    const maxY = b.y + b.h / 2;
    const minZ = b.z - b.d / 2;
    const maxZ = b.z + b.d / 2;

    let tmin = 0;
    let tmax = maxDist;
    let hitNormal = { x: 0, y: 0, z: 0 };

    // X slab
    if (Math.abs(dir.x) < 1e-8) {
      if (origin.x < minX || origin.x > maxX) continue;
    } else {
      const inv = 1 / dir.x;
      let t1 = (minX - origin.x) * inv;
      let t2 = (maxX - origin.x) * inv;
      let n = -1;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        n = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitNormal = { x: n, y: 0, z: 0 };
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    // Y slab
    if (Math.abs(dir.y) < 1e-8) {
      if (origin.y < minY || origin.y > maxY) continue;
    } else {
      const inv = 1 / dir.y;
      let t1 = (minY - origin.y) * inv;
      let t2 = (maxY - origin.y) * inv;
      let n = -1;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        n = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitNormal = { x: 0, y: n, z: 0 };
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    // Z slab
    if (Math.abs(dir.z) < 1e-8) {
      if (origin.z < minZ || origin.z > maxZ) continue;
    } else {
      const inv = 1 / dir.z;
      let t1 = (minZ - origin.z) * inv;
      let t2 = (maxZ - origin.z) * inv;
      let n = -1;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        n = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitNormal = { x: 0, y: 0, z: n };
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    const dist = tmin > 0 ? tmin : tmax;
    if (dist <= 0.0001 || dist > maxDist) continue;
    if (closest && dist >= closest.dist) continue;

    closest = {
      dist,
      point: {
        x: origin.x + dir.x * dist,
        y: origin.y + dir.y * dist,
        z: origin.z + dir.z * dist,
      },
      normal: hitNormal,
    };
  }

  return closest;
}
