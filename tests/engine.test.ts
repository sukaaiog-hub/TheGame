import { describe, expect, it } from 'vitest';
import { computeAiInput } from '@/game/ai';
import { applyHitToRacer, rollPowerupForPosition, stepItemBoxes, stepProjectiles, useRacerItem } from '@/game/items';
import { KART_LIST } from '@/game/karts';
import { createInitialRacer, resolveKartCollisions, stepKartPhysics } from '@/game/physics';
import { buildStandings, updateRacePositions } from '@/game/standings';
import { buildTrackData, getStartGridTransform, projectPointOntoTrack, TRACK_LIST } from '@/game/tracks';
import type { InputState, ProjectileState, RacerState } from '@/game/types';

const NEUTRAL_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  useItem: false,
  rescue: false,
};

describe('Tracks & Karts', () => {
  it('builds all tracks with valid splines, boost pads, item boxes, and 4 unique grid slots', () => {
    for (const def of TRACK_LIST) {
      const track = buildTrackData(def.id);
      expect(track.samples.length).toBe(260);
      expect(track.totalLength).toBeGreaterThan(500);
      expect(track.boostPads.length).toBe(4);
      expect(track.initialItemBoxes.length).toBe(12);

      const slots = [0, 1, 2, 3].map((seat) => getStartGridTransform(track, seat));
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const dist = Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z);
          expect(dist).toBeGreaterThan(4);
        }
      }
    }
    expect(KART_LIST.length).toBe(6);
  });
});

describe('Kart Physics, Steering, Drift & Lap Validation', () => {
  it('steers right toward the track right-hand normal and stays bounded inside guardrails', () => {
    const track = buildTrackData('lighthouse_bay');
    const racer = createInitialRacer(
      { id: 'p1', seatIndex: 0, nickname: 'Tux', kartId: 'tux', isLocal: true, isAi: false, isHost: true },
      track
    );
    const startProj = projectPointOntoTrack(track, racer.x, racer.z);

    // Accelerate straight then steer right (+1)
    for (let i = 0; i < 60; i++) {
      stepKartPhysics(racer, { ...NEUTRAL_INPUT, throttle: 1, steer: i > 20 ? 1 : 0 }, track, 0.016, i * 16, 3, true);
    }
    const afterProj = projectPointOntoTrack(track, racer.x, racer.z);
    expect(afterProj.signedLateral).toBeGreaterThan(startProj.signedLateral);
    expect(Math.abs(afterProj.signedLateral)).toBeLessThanOrEqual(track.wallHalfWidth + 0.05);
  });

  it('charges drift tier while drifting and triggers a mini-turbo boost upon release', () => {
    const track = buildTrackData('frozen_tundra');
    const racer = createInitialRacer(
      { id: 'p1', seatIndex: 0, nickname: 'Sara', kartId: 'sara', isLocal: true, isAi: false, isHost: true },
      track
    );
    // Position racer entering Turn 1 sweep of Frozen Tundra
    const curveSample = track.samples[34];
    racer.x = curveSample.x;
    racer.y = curveSample.y;
    racer.z = curveSample.z;
    racer.yaw = curveSample.yaw;
    racer.segmentIndex = 34;

    // Accelerate up to cruising speed
    for (let i = 0; i < 45; i++) {
      stepKartPhysics(racer, { ...NEUTRAL_INPUT, throttle: 1 }, track, 0.02, i * 20, 3, true);
    }
    expect(racer.speed).toBeGreaterThan(20);

    // Drift right through the sweeping turn for 1.1s
    for (let i = 0; i < 55; i++) {
      stepKartPhysics(
        racer,
        { ...NEUTRAL_INPUT, throttle: 1, steer: i < 25 ? 1 : 0.3, drift: true },
        track,
        0.02,
        1000 + i * 20,
        3,
        true
      );
    }
    expect(racer.isDrifting).toBe(true);
    expect(racer.driftTier).toBeGreaterThanOrEqual(2);

    // Release drift -> triggers boost
    const res = stepKartPhysics(racer, { ...NEUTRAL_INPUT, throttle: 1, steer: 0, drift: false }, track, 0.02, 2100, 3, true);
    expect(res.triggeredDriftBoostTier).toBeGreaterThanOrEqual(2);
    expect(racer.boostTimer).toBeGreaterThan(0.5);
  });

  it('prevents false laps when reversing across the start line and completes a 2-lap race with AI controller', () => {
    const track = buildTrackData('lighthouse_bay');
    const racer = createInitialRacer(
      { id: 'ai-1', seatIndex: 0, nickname: 'AI Tux', kartId: 'tux', isLocal: false, isAi: true, isHost: false },
      track
    );

    // Try reversing across the finish line at race start
    for (let i = 0; i < 40; i++) {
      stepKartPhysics(racer, { ...NEUTRAL_INPUT, brake: 1 }, track, 0.02, i * 20, 2, true);
    }
    expect(racer.lap).toBe(1);
    expect(racer.finished).toBe(false);

    // Now drive forward using AI controller to complete 2 laps
    let elapsedMs = 1000;
    const dt = 0.03;
    const racers: RacerState[] = [racer];
    for (let step = 0; step < 5000 && !racer.finished; step++) {
      const aiIn = computeAiInput(racer, racers, track, elapsedMs);
      stepKartPhysics(racer, aiIn, track, dt, elapsedMs, 2, true);
      elapsedMs += dt * 1000;
    }

    expect(racer.finished).toBe(true);
    expect(racer.lap).toBe(3); // Finished 2 laps -> incremented to 3
    expect(racer.bestLapMs).not.toBeNull();
    expect(racer.finishTimeMs).not.toBeNull();
  });

  it('resolves elastic kart-to-kart collisions without NaN or overlap sticking', () => {
    const track = buildTrackData('magma_caldera');
    const r1 = createInitialRacer(
      { id: 'p1', seatIndex: 0, nickname: 'A', kartId: 'konqi', isLocal: true, isAi: false, isHost: true },
      track
    );
    const r2 = createInitialRacer(
      { id: 'p2', seatIndex: 1, nickname: 'B', kartId: 'wilber', isLocal: false, isAi: false, isHost: false },
      track
    );
    r2.x = r1.x + 0.8;
    r2.z = r1.z + 0.4;
    r1.vx = 20;
    r2.vx = -15;

    resolveKartCollisions([r1, r2]);
    const dist = Math.hypot(r2.x - r1.x, r2.z - r1.z);
    expect(dist).toBeGreaterThanOrEqual(2.39);
    expect(Number.isFinite(r1.vx)).toBe(true);
    expect(Number.isFinite(r2.vx)).toBe(true);
  });
});

describe('Powerups, Projectiles & 4-Player Standings', () => {
  it('handles item box collection, shields, bowling projectiles, and 4-player rankings', () => {
    const track = buildTrackData('lighthouse_bay');
    const racers: RacerState[] = [0, 1, 2, 3].map((seat) =>
      createInitialRacer(
        { id: `p${seat + 1}`, seatIndex: seat, nickname: `Player ${seat + 1}`, kartId: KART_LIST[seat].id, isLocal: seat === 0, isAi: false, isHost: seat === 0 },
        track
      )
    );

    // Roll powerup odds work across all positions
    expect(['shield', 'bowling', 'swatter', 'zipper']).toContain(rollPowerupForPosition(1, 4, () => 0.1));
    expect(rollPowerupForPosition(4, 4, () => 0.1)).toBe('zipper');

    // Box collection
    const boxes = track.initialItemBoxes.map((b) => ({ ...b }));
    racers[0].x = boxes[0].x;
    racers[0].z = boxes[0].z;
    const collected = stepItemBoxes(boxes, racers, 0.016);
    expect(collected.collected.length).toBe(1);
    expect(boxes[0].active).toBe(false);

    // Shield absorbs hit cleanly
    racers[1].heldItem = 'shield';
    useRacerItem(racers[1], racers);
    expect(racers[1].shieldTimer).toBe(8);
    const blocked = applyHitToRacer(racers[1]);
    expect(blocked.blockedByShield).toBe(true);
    expect(racers[1].shieldTimer).toBe(0);
    expect(racers[1].spinTimer).toBe(0);

    // Unshielded hit triggers spin-out
    const unblocked = applyHitToRacer(racers[1]);
    expect(unblocked.blockedByShield).toBe(false);
    expect(racers[1].spinTimer).toBeGreaterThan(1);

    // Bowling projectile steps & collides
    racers[0].heldItem = 'bowling';
    const fireRes = useRacerItem(racers[0], racers);
    expect(fireRes.spawnedProjectile).not.toBeNull();
    const projectiles: ProjectileState[] = [fireRes.spawnedProjectile!];
    racers[2].x = projectiles[0].x + Math.sin(projectiles[0].yaw) * 4;
    racers[2].z = projectiles[0].z + Math.cos(projectiles[0].yaw) * 4;
    const hits = stepProjectiles(projectiles, racers, track, 0.05);
    expect(hits.length).toBe(1);
    expect(hits[0].targetId).toBe('p3');

    // 4-player standings sorting
    racers[3].finished = true;
    racers[3].finishTimeMs = 95000;
    racers[2].lap = 3;
    racers[2].highestCheckpoint = 4;
    racers[2].progress01 = 0.6;
    racers[1].lap = 2;
    racers[1].highestCheckpoint = 2;
    racers[1].progress01 = 0.3;
    racers[0].lap = 1;
    racers[0].highestCheckpoint = 0;
    racers[0].progress01 = 0.1;

    updateRacePositions(racers);
    expect(racers[3].position).toBe(1);
    expect(racers[2].position).toBe(2);
    expect(racers[1].position).toBe(3);
    expect(racers[0].position).toBe(4);

    const standings = buildStandings(racers, 100000);
    expect(standings.map((s) => s.playerId)).toEqual(['p4', 'p3', 'p2', 'p1']);
  });
});
