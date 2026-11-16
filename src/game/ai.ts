import { BuiltTrack } from './tracks';
import type { InputState, RacerState } from './types';

export function computeAiInput(
  racer: RacerState,
  allRacers: RacerState[],
  track: BuiltTrack,
  elapsedMs: number
): InputState {
  const n = track.samples.length;
  // Slightly different racing line per AI seat so bots spread across the road naturally
  const baseLane = ((racer.seatIndex % 4) - 1.5) * (track.roadWidth * 0.14);
  const waveOffset = Math.sin(elapsedMs * 0.0011 + racer.seatIndex * 2.1) * (track.roadWidth * 0.1);
  let targetLateral = baseLane + waveOffset;

  // Avoid directly rear-ending a racer close in front
  for (const other of allRacers) {
    if (other.id === racer.id) continue;
    const dx = other.x - racer.x;
    const dz = other.z - racer.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 36) {
      const fx = Math.sin(racer.yaw);
      const fz = Math.cos(racer.yaw);
      const ahead = dx * fx + dz * fz;
      if (ahead > 0) {
        targetLateral += racer.seatIndex % 2 === 0 ? -4.5 : 4.5;
        break;
      }
    }
  }

  const lookAheadIdx = (racer.segmentIndex + 9) % n;
  const targetSample = track.samples[lookAheadIdx];
  const tx = targetSample.x + targetSample.nx * targetLateral;
  const tz = targetSample.z + targetSample.nz * targetLateral;

  const desiredYaw = Math.atan2(tx - racer.x, tz - racer.z);
  let angleDiff = desiredYaw - racer.yaw;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // Note: positive steer turns right (decreases yaw), negative steer turns left (increases yaw)
  const steer = Math.max(-1, Math.min(1, -angleDiff * 1.9));
  const shouldDrift = Math.abs(angleDiff) > 0.36 && racer.speed > 26;

  // Smart AI item usage
  let useItem = false;
  if (racer.heldItem) {
    if (racer.heldItem === 'shield' || racer.heldItem === 'zipper' || racer.heldItem === 'plunger') {
      useItem = true;
    } else if (racer.heldItem === 'swatter') {
      useItem = allRacers.some(
        (o) => o.id !== racer.id && !o.finished && Math.hypot(o.x - racer.x, o.z - racer.z) < 12
      );
    } else if (racer.heldItem === 'bowling') {
      useItem = Math.abs(angleDiff) < 0.25;
    }
  }

  return {
    throttle: 1,
    brake: 0,
    steer,
    drift: shouldDrift,
    useItem,
    rescue: false,
  };
}
