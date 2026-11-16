import type { RacerState, RaceStanding } from './types';

export function computeRaceScore(racer: RacerState): number {
  if (racer.finished && racer.finishTimeMs !== null) {
    // Finished racers always rank ahead of unfinished racers, sorted by fastest finish time
    return 1_000_000_000 - racer.finishTimeMs;
  }
  // If behind start line at start of race (highestCheckpoint === -1), treat as lap 0 + progress
  const effectiveLap = racer.highestCheckpoint === -1 ? 0 : racer.lap;
  return effectiveLap * 1000 + racer.progress01 * 900;
}

export function updateRacePositions(racers: RacerState[]): RacerState[] {
  const sorted = [...racers].sort((a, b) => computeRaceScore(b) - computeRaceScore(a));
  sorted.forEach((r, idx) => {
    r.position = idx + 1;
    if (r.finished && r.finishOrder === null) {
      r.finishOrder = idx + 1;
    }
  });
  return sorted;
}

export function buildStandings(racers: RacerState[], fallbackElapsedMs: number): RaceStanding[] {
  const sorted = updateRacePositions(racers);
  return sorted.map((r, idx) => ({
    playerId: r.id,
    nickname: r.nickname,
    kartId: r.kartId,
    isAi: r.isAi,
    position: idx + 1,
    totalTimeMs: r.finishTimeMs ?? Math.max(1000, Math.round(fallbackElapsedMs + idx * 800)),
    bestLapMs: r.bestLapMs,
  }));
}
