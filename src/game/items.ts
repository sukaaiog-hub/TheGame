import { projectPointOntoTrack, BuiltTrack } from './tracks';
import type { ItemBoxState, PowerupType, ProjectileState, RacerState } from './types';

export const POWERUP_META: Record<
  PowerupType,
  { name: string; shortLabel: string; color: string; description: string }
> = {
  zipper: {
    name: 'Nitro Zipper',
    shortLabel: 'BOOST',
    color: '#38bdf8',
    description: 'Instant supersonic turbo burst!',
  },
  bowling: {
    name: 'Bowling Ball',
    shortLabel: 'BALL',
    color: '#f97316',
    description: 'Heavy ball that bounces off track walls and spins rivals.',
  },
  plunger: {
    name: 'Homing Plunger',
    shortLabel: 'HOMING',
    color: '#ec4899',
    description: 'Locks onto the kart directly ahead of you!',
  },
  shield: {
    name: 'Bubblegum Shield',
    shortLabel: 'SHIELD',
    color: '#c084fc',
    description: 'Blocks 1 incoming attack for 8 seconds.',
  },
  swatter: {
    name: 'Shockwave Swatter',
    shortLabel: 'SHOCK',
    color: '#facc15',
    description: 'Blasts nearby karts within range into a spin!',
  },
};

export function rollPowerupForPosition(
  position: number,
  totalRacers: number,
  rng: () => number = Math.random
): PowerupType {
  const r = rng();
  if (position <= 1) {
    // Leader odds: defensive/skill shots
    if (r < 0.35) return 'shield';
    if (r < 0.68) return 'bowling';
    if (r < 0.85) return 'swatter';
    return 'zipper';
  }
  if (position >= Math.max(3, totalRacers)) {
    // Trailing racer odds: catch-up power
    if (r < 0.42) return 'zipper';
    if (r < 0.72) return 'plunger';
    if (r < 0.88) return 'swatter';
    return 'bowling';
  }
  // Mid-pack odds
  if (r < 0.28) return 'zipper';
  if (r < 0.54) return 'plunger';
  if (r < 0.76) return 'bowling';
  if (r < 0.9) return 'shield';
  return 'swatter';
}

export function stepItemBoxes(
  boxes: ItemBoxState[],
  racers: RacerState[],
  dt: number
): { collected: Array<{ boxId: string; racerId: string; powerup: PowerupType }> } {
  const collected: Array<{ boxId: string; racerId: string; powerup: PowerupType }> = [];

  for (const box of boxes) {
    if (!box.active) {
      box.respawnTimer = Math.max(0, box.respawnTimer - dt);
      if (box.respawnTimer === 0) box.active = true;
      continue;
    }

    for (const racer of racers) {
      if (racer.finished) continue;
      const dx = racer.x - box.x;
      const dz = racer.z - box.z;
      if (dx * dx + dz * dz < 6.8) {
        box.active = false;
        box.respawnTimer = 4.2;
        if (!racer.heldItem) {
          const powerup = rollPowerupForPosition(racer.position, racers.length);
          racer.heldItem = powerup;
          collected.push({ boxId: box.id, racerId: racer.id, powerup });
        }
        break;
      }
    }
  }

  return { collected };
}

export function useRacerItem(
  user: RacerState,
  allRacers: RacerState[]
): {
  used: PowerupType | null;
  spawnedProjectile: ProjectileState | null;
  shockwaveHits: string[];
} {
  const item = user.heldItem;
  if (!item || user.spinTimer > 0) {
    return { used: null, spawnedProjectile: null, shockwaveHits: [] };
  }

  user.heldItem = null;

  if (item === 'zipper') {
    user.boostTimer = Math.max(user.boostTimer, 1.65);
    user.boostPower = Math.max(user.boostPower, 1.54);
    return { used: item, spawnedProjectile: null, shockwaveHits: [] };
  }

  if (item === 'shield') {
    user.shieldTimer = 8.0;
    return { used: item, spawnedProjectile: null, shockwaveHits: [] };
  }

  if (item === 'swatter') {
    const hits: string[] = [];
    for (const other of allRacers) {
      if (other.id === user.id || other.finished) continue;
      const dx = other.x - user.x;
      const dz = other.z - user.z;
      if (dx * dx + dz * dz <= 196) {
        hits.push(other.id);
      }
    }
    return { used: item, spawnedProjectile: null, shockwaveHits: hits };
  }

  // Projectile (bowling or plunger)
  const fx = Math.sin(user.yaw);
  const fz = Math.cos(user.yaw);
  const speed = item === 'bowling' ? 92 : 76;

  let targetId: string | null = null;
  if (item === 'plunger') {
    // Target the racer immediately ahead in race position, or nearest rival in front
    const ahead = allRacers.find(
      (r) => r.id !== user.id && !r.finished && r.position === user.position - 1
    );
    targetId = ahead?.id ?? null;
  }

  const proj: ProjectileState = {
    id: `proj-${user.id}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    ownerId: user.id,
    kind: item,
    x: user.x + fx * 3.2,
    y: user.y + 0.7,
    z: user.z + fz * 3.2,
    vx: fx * speed,
    vz: fz * speed,
    yaw: user.yaw,
    ttl: item === 'bowling' ? 5.5 : 6.0,
    bouncesLeft: item === 'bowling' ? 4 : 1,
    targetId,
  };

  return { used: item, spawnedProjectile: proj, shockwaveHits: [] };
}

export function applyHitToRacer(racer: RacerState): { blockedByShield: boolean } {
  if (racer.shieldTimer > 0) {
    racer.shieldTimer = 0;
    return { blockedByShield: true };
  }
  racer.spinTimer = 1.35;
  racer.boostTimer = 0;
  racer.boostPower = 1.0;
  racer.isDrifting = false;
  racer.driftCharge = 0;
  racer.driftTier = 0;
  return { blockedByShield: false };
}

export function stepProjectiles(
  projectiles: ProjectileState[],
  racers: RacerState[],
  track: BuiltTrack,
  dt: number
): Array<{ targetId: string; ownerId: string; kind: 'bowling' | 'plunger' }> {
  const hits: Array<{ targetId: string; ownerId: string; kind: 'bowling' | 'plunger' }> = [];
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.ttl -= clampedDt;
    if (p.ttl <= 0) {
      projectiles.splice(i, 1);
      continue;
    }

    // Homing guidance for plunger
    if (p.kind === 'plunger' && p.targetId) {
      const target = racers.find((r) => r.id === p.targetId && !r.finished);
      if (target) {
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        const desiredVx = (dx / dist) * 76;
        const desiredVz = (dz / dist) * 76;
        const steerAlpha = Math.min(1, 5.5 * clampedDt);
        p.vx += (desiredVx - p.vx) * steerAlpha;
        p.vz += (desiredVz - p.vz) * steerAlpha;
        const spd = Math.hypot(p.vx, p.vz) || 1;
        p.vx = (p.vx / spd) * 76;
        p.vz = (p.vz / spd) * 76;
      }
    }

    p.x += p.vx * clampedDt;
    p.z += p.vz * clampedDt;
    p.yaw = Math.atan2(p.vx, p.vz);

    const proj = projectPointOntoTrack(track, p.x, p.z);
    p.y = proj.surfaceY + 0.7;

    if (proj.outsideWall) {
      if (p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
        const sign = proj.signedLateral >= 0 ? 1 : -1;
        p.x = proj.surfaceX + proj.normalX * sign * (track.wallHalfWidth - 0.5);
        p.z = proj.surfaceZ + proj.normalZ * sign * (track.wallHalfWidth - 0.5);
        const latVel = p.vx * proj.normalX + p.vz * proj.normalZ;
        p.vx -= 2 * latVel * proj.normalX;
        p.vz -= 2 * latVel * proj.normalZ;
      } else {
        projectiles.splice(i, 1);
        continue;
      }
    }

    // Check racer collisions (skip owner during first 0.25s)
    let hitSomeone = false;
    for (const r of racers) {
      if (r.finished) continue;
      if (r.id === p.ownerId && p.ttl > (p.kind === 'bowling' ? 5.25 : 5.75)) continue;
      const dx = r.x - p.x;
      const dz = r.z - p.z;
      if (dx * dx + dz * dz < 6.2) {
        hits.push({ targetId: r.id, ownerId: p.ownerId, kind: p.kind });
        projectiles.splice(i, 1);
        hitSomeone = true;
        break;
      }
    }
    if (hitSomeone) continue;
  }

  return hits;
}
