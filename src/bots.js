/**
 * Red Eclipse 2 AI Bot Controller.
 * Steers across waypoints/jump-pads, tracks targets with LOS checks,
 * strafes & double-jumps in combat, and chooses optimal weapons by distance.
 */
import { raycastMap } from './maps.js';

export const BOT_NAMES = [
  'AlphaBot',
  'VegaBot',
  'Kestrel',
  'NyxUnit',
  'OrionAI',
  'Cipher',
  'Helios',
  'RiftRunner',
];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function hasLineOfSight(a, b, map) {
  const ox = a.x;
  const oy = a.y + 1.45;
  const oz = a.z;
  const tx = b.x;
  const ty = b.y + 1.25;
  const tz = b.z;
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.1) return true;
  const hit = raycastMap({ x: ox, y: oy, z: oz }, { x: dx / dist, y: dy / dist, z: dz / dist }, dist - 0.3, map);
  return !hit;
}

export function computeBotDecision(bot, entities, map, mode, dt, skill = 0.75) {
  bot.aiState = bot.aiState || {
    waypointIdx: Math.floor(Math.random() * map.waypoints.length),
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeTimer: 0,
    stuckTimer: 0,
    lastX: bot.x,
    lastZ: bot.z,
    jumpCooldown: 0,
    fireCooldown: 0,
  };
  const ai = bot.aiState;
  ai.strafeTimer -= dt;
  ai.jumpCooldown = Math.max(0, ai.jumpCooldown - dt);
  ai.fireCooldown = Math.max(0, ai.fireCooldown - dt);

  if (ai.strafeTimer <= 0) {
    ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
    ai.strafeTimer = 0.6 + Math.random() * 1.1;
  }

  // Stuck check
  const moved = Math.hypot(bot.x - ai.lastX, bot.z - ai.lastZ);
  ai.lastX = bot.x;
  ai.lastZ = bot.z;
  if (moved < 0.04) {
    ai.stuckTimer += dt;
  } else {
    ai.stuckTimer = 0;
  }

  // Find nearest visible enemy
  let bestTarget = null;
  let bestDist = Infinity;
  let bestVisible = false;

  for (const other of entities) {
    if (other.id === bot.id || !other.alive) continue;
    if (mode === 'tdm' && other.team === bot.team) continue;
    const d = Math.hypot(other.x - bot.x, other.y - bot.y, other.z - bot.z);
    const vis = d < 58 && hasLineOfSight(bot, other, map);
    const score = vis ? d * 0.5 : d;
    if (score < bestDist) {
      bestDist = score;
      bestTarget = other;
      bestVisible = vis;
    }
  }

  let goal = map.waypoints[ai.waypointIdx % map.waypoints.length];
  if (bestTarget && bestVisible) {
    goal = bestTarget;
  } else if (Math.hypot(goal.x - bot.x, goal.z - bot.z) < 2.8 || ai.stuckTimer > 1.2) {
    ai.waypointIdx = Math.floor(Math.random() * map.waypoints.length);
    goal = map.waypoints[ai.waypointIdx];
    if (ai.stuckTimer > 1.2) {
      ai.stuckTimer = 0;
    }
  }

  // Choose weapon based on distance & owned arsenal
  if (mode === 'instagib') {
    bot.weaponId = 'rifle';
  } else if (bestTarget && bestVisible) {
    const actualDist = Math.hypot(bestTarget.x - bot.x, bestTarget.y - bot.y, bestTarget.z - bot.z);
    const owned = bot.ownedWeapons || ['pistol', 'sword'];
    if (actualDist < 4.0 && owned.includes('sword')) bot.weaponId = 'sword';
    else if (actualDist < 12 && owned.includes('shotgun')) bot.weaponId = 'shotgun';
    else if (actualDist > 26 && owned.includes('rifle')) bot.weaponId = 'rifle';
    else if (actualDist > 14 && owned.includes('rocket')) bot.weaponId = 'rocket';
    else if (owned.includes('plasma')) bot.weaponId = 'plasma';
    else if (owned.includes('smg')) bot.weaponId = 'smg';
    else bot.weaponId = 'pistol';
  }

  // Aiming
  const lookTarget = (bestTarget && bestVisible) ? bestTarget : goal;
  const dx = lookTarget.x - bot.x;
  const dy = (lookTarget.y + ((bestTarget && bestVisible) ? 1.15 : 0.8)) - (bot.y + 1.5);
  const dz = lookTarget.z - bot.z;
  const horiz = Math.max(0.001, Math.hypot(dx, dz));
  // yaw = 0 looks along -Z, so atan2(-dx, -dz)
  const targetYaw = Math.atan2(-dx, -dz);
  const targetPitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, horiz)));

  const turnRate = (5.5 + skill * 5.0) * dt;
  const dyaw = wrapAngle(targetYaw - bot.yaw);
  bot.yaw = wrapAngle(bot.yaw + Math.max(-turnRate, Math.min(turnRate, dyaw)));
  bot.pitch += (targetPitch - bot.pitch) * Math.min(1, (6 + skill * 6) * dt);

  const distToTarget = bestTarget ? Math.hypot(bestTarget.x - bot.x, bestTarget.z - bot.z) : 99;
  let forward = 1;
  let strafe = 0;

  if (bestTarget && bestVisible) {
    if (distToTarget < 6 && bot.weaponId !== 'sword') forward = -0.4;
    else if (distToTarget < 12 && bot.weaponId !== 'sword') forward = 0.2;
    else forward = 1;
    strafe = ai.strafeDir;
  }

  let jumpJustPressed = false;
  let dashJustPressed = false;
  if (ai.jumpCooldown <= 0 && (bot.wallNormal || ai.stuckTimer > 0.7 || (bestVisible && Math.random() < 0.04))) {
    jumpJustPressed = true;
    ai.jumpCooldown = 0.75 + Math.random() * 0.8;
  }
  if (bot.impulse > 70 && bestVisible && distToTarget > 18 && Math.random() < 0.025) {
    dashJustPressed = true;
  }

  const aligned = Math.abs(dyaw) < (0.28 - skill * 0.12);
  const wantsFire = mode !== 'trial' && bestTarget && bestVisible && aligned && distToTarget < 64;

  return {
    forward,
    strafe,
    jumpJustPressed,
    dashJustPressed,
    crouch: false,
    wantsFire,
    aimJitter: (1 - skill) * 0.06,
  };
}
