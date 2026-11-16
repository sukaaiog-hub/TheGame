import { getKartDefinition } from './karts';
import { BuiltTrack, getStartGridTransform, projectPointOntoTrack } from './tracks';
import type { InputState, KartId, RacerState } from './types';

export interface CreateRacerParams {
  id: string;
  seatIndex: number;
  nickname: string;
  kartId: KartId;
  isLocal: boolean;
  isAi: boolean;
  isHost: boolean;
}

export function createInitialRacer(
  params: CreateRacerParams,
  track: BuiltTrack
): RacerState {
  const grid = getStartGridTransform(track, params.seatIndex);
  const proj = projectPointOntoTrack(track, grid.x, grid.z, grid.segmentIndex);

  return {
    id: params.id,
    seatIndex: params.seatIndex,
    nickname: params.nickname,
    kartId: params.kartId,
    isLocal: params.isLocal,
    isAi: params.isAi,
    isHost: params.isHost,

    x: grid.x,
    y: grid.y,
    z: grid.z,
    yaw: grid.yaw,
    vx: 0,
    vz: 0,
    speed: 0,
    steerAngle: 0,

    isDrifting: false,
    driftDir: 0,
    driftCharge: 0,
    driftTier: 0,
    boostTimer: 0,
    boostPower: 1.0,

    heldItem: null,
    shieldTimer: 0,
    spinTimer: 0,
    onRoad: true,
    offRoadPenalty: 0,

    segmentIndex: proj.segmentIndex,
    distanceAlong: proj.distanceAlong,
    progress01: proj.progress01,
    highestCheckpoint: -1,
    lap: 1,
    lapStartMs: 0,
    bestLapMs: null,
    finished: false,
    finishTimeMs: null,
    finishOrder: null,
    position: params.seatIndex + 1,

    lastPacketSeq: 0,
    lastUpdatedAt: Date.now(),
  };
}

export function getDriftTier(chargeSeconds: number): 0 | 1 | 2 | 3 {
  if (chargeSeconds >= 2.05) return 3;
  if (chargeSeconds >= 1.2) return 2;
  if (chargeSeconds >= 0.5) return 1;
  return 0;
}

export function stepKartPhysics(
  racer: RacerState,
  input: InputState,
  track: BuiltTrack,
  dt: number,
  raceElapsedMs: number,
  totalLaps: number,
  canMove: boolean
): { completedLap: boolean; triggeredDriftBoostTier: number } {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  const kart = getKartDefinition(racer.kartId);

  let completedLap = false;
  let triggeredDriftBoostTier = 0;

  if (racer.shieldTimer > 0) {
    racer.shieldTimer = Math.max(0, racer.shieldTimer - clampedDt);
  }
  if (racer.boostTimer > 0) {
    racer.boostTimer = Math.max(0, racer.boostTimer - clampedDt);
    if (racer.boostTimer === 0) racer.boostPower = 1.0;
  }

  // Handle rescue button (reset onto track centerline)
  if (canMove && input.rescue && racer.spinTimer <= 0) {
    const proj = projectPointOntoTrack(track, racer.x, racer.z, racer.segmentIndex);
    racer.x = proj.surfaceX;
    racer.y = proj.surfaceY;
    racer.z = proj.surfaceZ;
    racer.yaw = proj.trackYaw;
    racer.vx = 0;
    racer.vz = 0;
    racer.speed = 0;
    racer.isDrifting = false;
    racer.driftCharge = 0;
    racer.driftTier = 0;
    return { completedLap, triggeredDriftBoostTier };
  }

  // Handle spin-out recovery
  if (racer.spinTimer > 0) {
    racer.spinTimer = Math.max(0, racer.spinTimer - clampedDt);
    racer.yaw += 11.5 * clampedDt;
    racer.vx *= Math.pow(0.08, clampedDt);
    racer.vz *= Math.pow(0.08, clampedDt);
    racer.x += racer.vx * clampedDt;
    racer.z += racer.vz * clampedDt;
    racer.speed = Math.hypot(racer.vx, racer.vz);
    racer.isDrifting = false;
    racer.driftCharge = 0;
    racer.driftTier = 0;
  } else if (!canMove) {
    racer.vx = 0;
    racer.vz = 0;
    racer.speed = 0;
    racer.steerAngle = input.steer * 0.4;
  } else {
    // Active driving physics
    const fx = Math.sin(racer.yaw);
    const fz = Math.cos(racer.yaw);
    const forwardSpeed = racer.vx * fx + racer.vz * fz;

    // Drift state machine
    const steerInput = Math.max(-1, Math.min(1, input.steer));
    if (input.drift && forwardSpeed > 14 && !racer.isDrifting && Math.abs(steerInput) > 0.18) {
      racer.isDrifting = true;
      racer.driftDir = steerInput > 0 ? 1 : -1;
      racer.driftCharge = 0;
      racer.driftTier = 0;
    } else if (racer.isDrifting && (!input.drift || forwardSpeed < 6)) {
      const tier = racer.driftTier;
      if (tier > 0) {
        const durations = [0, 0.7, 1.2, 1.8];
        const powers = [1.0, 1.26, 1.38, 1.5];
        racer.boostTimer = Math.max(racer.boostTimer, durations[tier] * kart.driftBoost);
        racer.boostPower = Math.max(racer.boostPower, powers[tier]);
        triggeredDriftBoostTier = tier;
      }
      racer.isDrifting = false;
      racer.driftDir = 0;
      racer.driftCharge = 0;
      racer.driftTier = 0;
    }

    // Steering & drift angular velocity (note: right steer = +1 decreases yaw in +Z/+Y RH coords)
    let turnInput = steerInput;
    if (racer.isDrifting) {
      // Locked drift direction + smooth counter/tighten control
      turnInput = racer.driftDir * 0.68 + steerInput * 0.42;
      const intoTurn = steerInput * racer.driftDir > 0 ? 1.25 : 0.65;
      const chargeRate = 0.92 + 0.55 * Math.abs(steerInput) * intoTurn;
      racer.driftCharge += clampedDt * chargeRate * kart.driftBoost;
      racer.driftTier = getDriftTier(racer.driftCharge);
    }

    const speedTurnFactor = Math.min(1, Math.abs(forwardSpeed) / 11);
    const reverseSign = forwardSpeed < -1.5 ? -1 : 1;
    racer.yaw -= turnInput * kart.handling * speedTurnFactor * reverseSign * clampedDt;
    racer.steerAngle = turnInput * 0.45;

    // Updated forward & right unit vectors
    const nfx = Math.sin(racer.yaw);
    const nfz = Math.cos(racer.yaw);
    const nrx = -nfz;
    const nrz = nfx;

    // Boost & off-road limits
    const boostMult = racer.boostTimer > 0 ? racer.boostPower : 1.0;
    const offRoadCap = !racer.onRoad && racer.boostTimer <= 0 ? 0.62 : 1.0;
    const effectiveMaxSpeed = kart.maxSpeed * boostMult * offRoadCap;
    const maxReverseSpeed = -18;

    let vForward = racer.vx * nfx + racer.vz * nfz;
    let vRight = racer.vx * nrx + racer.vz * nrz;

    if (input.throttle > 0) {
      const accelBoost = racer.boostTimer > 0 ? 1.85 : 1.0;
      vForward += input.throttle * kart.accel * accelBoost * clampedDt;
    }
    if (input.brake > 0) {
      if (vForward > 2) {
        vForward -= input.brake * kart.accel * 1.65 * clampedDt;
      } else {
        vForward -= input.brake * kart.accel * 0.75 * clampedDt;
      }
    }

    // Aerodynamic / rolling resistance
    if (input.throttle <= 0.05 && input.brake <= 0.05) {
      vForward *= Math.pow(0.32, clampedDt);
    } else if (!racer.onRoad && racer.boostTimer <= 0) {
      vForward *= Math.pow(0.58, clampedDt);
    }

    // Boost forces minimum cruise speed up to boosted max
    if (racer.boostTimer > 0 && vForward < effectiveMaxSpeed * 0.92) {
      vForward = Math.min(effectiveMaxSpeed, vForward + kart.accel * 2.4 * clampedDt);
    }

    vForward = Math.max(maxReverseSpeed, Math.min(effectiveMaxSpeed, vForward));

    // Lateral tire grip (looser during drift for smooth slide!)
    const lateralGrip = racer.isDrifting ? 0.065 : 0.008;
    vRight *= Math.pow(lateralGrip, clampedDt);

    racer.vx = nfx * vForward + nrx * vRight;
    racer.vz = nfz * vForward + nrz * vRight;
    racer.x += racer.vx * clampedDt;
    racer.z += racer.vz * clampedDt;
    racer.speed = vForward;
  }

  // Project onto track spline: height, off-road status, wall boundaries, boost pads, laps
  const proj = projectPointOntoTrack(track, racer.x, racer.z, racer.segmentIndex);
  racer.y = proj.surfaceY;
  racer.onRoad = proj.onRoad;
  racer.offRoadPenalty = proj.onRoad ? 0 : 1;
  racer.segmentIndex = proj.segmentIndex;
  racer.distanceAlong = proj.distanceAlong;
  racer.progress01 = proj.progress01;

  // Guardrail clamp & smooth wall-scrape recovery
  if (proj.outsideWall) {
    const sign = proj.signedLateral >= 0 ? 1 : -1;
    const clampedLat = sign * track.wallHalfWidth;
    racer.x = proj.surfaceX + proj.normalX * clampedLat;
    racer.z = proj.surfaceZ + proj.normalZ * clampedLat;

    // Bounce outward lateral velocity component inward while preserving forward flow
    const latVel = racer.vx * proj.normalX + racer.vz * proj.normalZ;
    if (latVel * sign > 0) {
      racer.vx -= proj.normalX * latVel * 1.15;
      racer.vz -= proj.normalZ * latVel * 1.15;
      racer.vx *= 0.9;
      racer.vz *= 0.9;

      let yawDiff = proj.trackYaw - racer.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      racer.yaw += yawDiff * 0.14;
    }
  }

  // Boost pads check
  if (canMove && racer.spinTimer <= 0) {
    for (const pad of track.boostPads) {
      const dx = racer.x - pad.x;
      const dz = racer.z - pad.z;
      if (dx * dx + dz * dz < 16) {
        racer.boostTimer = Math.max(racer.boostTimer, 1.15);
        racer.boostPower = Math.max(racer.boostPower, 1.44);
      }
    }
  }

  // Checkpoint & lap validation
  const sector = Math.min(
    track.numCheckpoints - 1,
    Math.floor(racer.progress01 * track.numCheckpoints)
  );

  if (racer.highestCheckpoint === -1) {
    if (sector === 0) {
      racer.highestCheckpoint = 0;
      racer.lapStartMs = raceElapsedMs;
    }
  } else {
    if (sector > racer.highestCheckpoint && sector <= racer.highestCheckpoint + 2) {
      racer.highestCheckpoint = sector;
    } else if (racer.highestCheckpoint >= track.numCheckpoints - 2 && sector === 0) {
      // Completed a valid forward lap!
      const lapDuration = Math.max(1000, Math.round(raceElapsedMs - racer.lapStartMs));
      if (racer.bestLapMs === null || lapDuration < racer.bestLapMs) {
        racer.bestLapMs = lapDuration;
      }
      racer.lapStartMs = raceElapsedMs;
      racer.highestCheckpoint = 0;
      racer.lap += 1;
      completedLap = true;

      if (racer.lap > totalLaps && !racer.finished) {
        racer.finished = true;
        racer.finishTimeMs = Math.max(1000, Math.round(raceElapsedMs));
      }
    }
  }

  racer.lastUpdatedAt = Date.now();
  return { completedLap, triggeredDriftBoostTier };
}

export function resolveKartCollisions(racers: RacerState[]): void {
  const minRadius = 2.4;
  const minDistSq = minRadius * minRadius;

  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;

      if (distSq > 0.0001 && distSq < minDistSq) {
        const dist = Math.sqrt(distSq);
        const overlap = minRadius - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        const wA = getKartDefinition(a.kartId).weight;
        const wB = getKartDefinition(b.kartId).weight;
        const totalW = wA + wB;
        const shareA = wB / totalW;
        const shareB = wA / totalW;

        a.x -= nx * overlap * shareA;
        a.z -= nz * overlap * shareA;
        b.x += nx * overlap * shareB;
        b.z += nz * overlap * shareB;

        // Impulse exchange along contact normal
        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const relAlongNormal = rvx * nx + rvz * nz;
        if (relAlongNormal < 0) {
          const impulse = -(1 + 0.45) * relAlongNormal;
          a.vx -= impulse * shareA * nx;
          a.vz -= impulse * shareA * nz;
          b.vx += impulse * shareB * nx;
          b.vz += impulse * shareB * nz;
        }
      }
    }
  }
}
