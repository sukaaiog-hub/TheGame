/**
 * Red Eclipse 2 Impulse Parkour Physics:
 * - Crisp ground strafe & air control
 * - Double jump
 * - Wall-run (reduced gravity + camera tilt along vertical walls)
 * - Wall-kick (off wallNormal + upward launch)
 * - Impulse Dash (Shift, uses impulse meter which regenerates)
 * - Crouch-Slide (C / Ctrl)
 * - Jump pads
 */
import { resolveEntityCollision, PLAYER_RADIUS, PLAYER_HEIGHT } from './maps.js';

export const MOVE_SPEED = 14.2;
export const GRAVITY = 24.0;
export const JUMP_VEL = 10.6;
export const DOUBLE_JUMP_VEL = 10.0;
export const IMPULSE_DASH_SPEED = 22.5;
export const WALL_KICK_HORIZ = 15.5;
export const WALL_KICK_UP = 11.4;

export function stepPlayerPhysics(ent, input, map, dt, events = []) {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  // Residual status effect timers
  if (ent.shockTimer > 0) ent.shockTimer = Math.max(0, ent.shockTimer - clampedDt);
  if (ent.burnTimer > 0) ent.burnTimer = Math.max(0, ent.burnTimer - clampedDt);
  if (ent.bleedTimer > 0) ent.bleedTimer = Math.max(0, ent.bleedTimer - clampedDt);
  if (ent.dashCooldown > 0) ent.dashCooldown = Math.max(0, ent.dashCooldown - clampedDt);
  if (ent.padCooldown > 0) ent.padCooldown = Math.max(0, ent.padCooldown - clampedDt);

  const speedMult = ent.shockTimer > 0 ? 0.72 : 1.0;

  // Regenerate impulse meter
  if (!ent.wallRunning && ent.grounded) {
    ent.impulse = Math.min(100, ent.impulse + 28 * clampedDt);
  } else {
    ent.impulse = Math.min(100, ent.impulse + 12 * clampedDt);
  }

  // Wish direction from yaw (yaw=0 looks along -Z)
  const sinY = Math.sin(ent.yaw);
  const cosY = Math.cos(ent.yaw);
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  let wishX = fwdX * (input.forward || 0) + rightX * (input.strafe || 0);
  let wishZ = fwdZ * (input.forward || 0) + rightZ * (input.strafe || 0);
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0.001) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const sliding = Boolean(input.crouch && ent.grounded && Math.hypot(ent.vx, ent.vz) > 8);
  ent.crouching = Boolean(input.crouch);
  ent.sliding = sliding;

  const targetSpeed = (sliding ? MOVE_SPEED * 1.24 : MOVE_SPEED) * speedMult;
  const accel = ent.grounded ? (sliding ? 3.5 : 14.0) : 5.2;

  if (wishLen > 0.001) {
    const targetVx = wishX * targetSpeed;
    const targetVz = wishZ * targetSpeed;
    const blend = Math.min(1, accel * clampedDt);
    // Preserve high parkour/rocket momentum while still allowing steering
    if (Math.hypot(ent.vx, ent.vz) <= targetSpeed + 0.5 || !ent.grounded) {
      ent.vx += (targetVx - ent.vx) * blend;
      ent.vz += (targetVz - ent.vz) * blend;
    } else {
      ent.vx += (targetVx - ent.vx) * (blend * 0.35);
      ent.vz += (targetVz - ent.vz) * (blend * 0.35);
    }
  } else if (ent.grounded) {
    const friction = sliding ? 1.8 : 11.0;
    const drop = Math.max(0, 1 - friction * clampedDt);
    ent.vx *= drop;
    ent.vz *= drop;
  }

  // Impulse Dash (Shift)
  if (input.dashJustPressed && ent.impulse >= 32 && ent.dashCooldown <= 0) {
    ent.impulse -= 32;
    ent.dashCooldown = 0.28;
    const dirX = wishLen > 0.05 ? wishX : fwdX;
    const dirZ = wishLen > 0.05 ? wishZ : fwdZ;
    ent.vx = dirX * IMPULSE_DASH_SPEED * speedMult;
    ent.vz = dirZ * IMPULSE_DASH_SPEED * speedMult;
    if (!ent.grounded) {
      ent.vy = Math.max(ent.vy, 4.8);
    }
    events.push({ type: 'dash' });
  }

  // Wall-run detection & gravity
  const horizSpeed = Math.hypot(ent.vx, ent.vz);
  const canWallRun = !ent.grounded && ent.wallNormal && horizSpeed > 5.5 && (input.forward || 0) > 0 && ent.impulse > 5;
  ent.wallRunning = canWallRun;

  if (canWallRun) {
    ent.vy = Math.max(ent.vy - GRAVITY * 0.18 * clampedDt, -2.5);
    ent.impulse = Math.max(0, ent.impulse - 14 * clampedDt);
    // Camera tilt away from wall
    const sideDot = rightX * ent.wallNormal.x + rightZ * ent.wallNormal.z;
    ent.targetTilt = sideDot * 0.19;
  } else {
    ent.vy -= GRAVITY * clampedDt;
    ent.targetTilt = sliding ? -0.05 : 0;
  }
  ent.tilt = (ent.tilt || 0) + (ent.targetTilt - (ent.tilt || 0)) * Math.min(1, 14 * clampedDt);

  // Jump / Double Jump / Wall-Kick
  if (input.jumpJustPressed) {
    if (ent.grounded) {
      ent.vy = JUMP_VEL;
      ent.grounded = false;
      ent.airJumps = 1;
      events.push({ type: 'jump' });
    } else if (ent.wallNormal && ent.impulse >= 18) {
      ent.impulse -= 18;
      ent.vx = ent.wallNormal.x * WALL_KICK_HORIZ + (wishLen > 0 ? wishX * 5.0 : fwdX * 5.0);
      ent.vz = ent.wallNormal.z * WALL_KICK_HORIZ + (wishLen > 0 ? wishZ * 5.0 : fwdZ * 5.0);
      ent.vy = WALL_KICK_UP;
      ent.airJumps = 1;
      events.push({ type: 'wallkick' });
    } else if (ent.airJumps > 0) {
      ent.airJumps -= 1;
      ent.vy = DOUBLE_JUMP_VEL;
      if (wishLen > 0.05) {
        ent.vx = Math.max(Math.abs(ent.vx), 11) * wishX;
        ent.vz = Math.max(Math.abs(ent.vz), 11) * wishZ;
      }
      events.push({ type: 'doublejump' });
    }
  }

  // Integrate position
  ent.x += ent.vx * clampedDt;
  ent.y += ent.vy * clampedDt;
  ent.z += ent.vz * clampedDt;

  const col = resolveEntityCollision(ent, map, PLAYER_RADIUS, ent.crouching ? 1.25 : PLAYER_HEIGHT);
  ent.grounded = col.grounded;
  ent.wallNormal = col.wallNormal;
  if (ent.grounded) {
    ent.airJumps = 1;
  }

  // Jump pads
  if (ent.padCooldown <= 0) {
    for (const pad of map.jumpPads) {
      const dx = ent.x - pad.x;
      const dz = ent.z - pad.z;
      const dy = Math.abs(ent.y - pad.y);
      if (dx * dx + dz * dz <= pad.radius * pad.radius && dy < 1.4) {
        ent.vx = pad.vx;
        ent.vy = pad.vy;
        ent.vz = pad.vz;
        ent.grounded = false;
        ent.airJumps = 1;
        ent.padCooldown = 0.35;
        events.push({ type: 'jumppad' });
        break;
      }
    }
  }
}
