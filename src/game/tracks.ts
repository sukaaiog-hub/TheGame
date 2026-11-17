import type { BoostPad, ItemBoxState, TrackDefinition, TrackId } from './types';

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  tx: number; // unit tangent x
  ty: number; // unit tangent y
  tz: number; // unit tangent z
  nx: number; // horizontal right normal x (in XZ plane)
  nz: number; // horizontal right normal z
  yaw: number; // atan2(tx, tz)
  dist: number; // cumulative arc distance from start
}

export interface BuiltTrack {
  def: TrackDefinition;
  samples: TrackSample[];
  totalLength: number;
  roadWidth: number;
  wallHalfWidth: number;
  boostPads: BoostPad[];
  initialItemBoxes: ItemBoxState[];
  numCheckpoints: number;
}

export interface TrackProjection {
  segmentIndex: number;
  distanceAlong: number;
  progress01: number;
  signedLateral: number;
  surfaceX: number;
  surfaceY: number;
  surfaceZ: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  trackYaw: number;
  onRoad: boolean;
  outsideWall: boolean;
}

export const TRACKS: Record<TrackId, TrackDefinition> = {
  lighthouse_bay: {
    id: 'lighthouse_bay',
    name: 'Lighthouse Bay',
    subtitle: 'Sun-drenched coastal circuit with sweeping hairpin turns',
    difficulty: 'Beginner',
    roadWidth: 22,
    skyTopColor: '#0284c7',
    skyBottomColor: '#bae6fd',
    fogColor: '#93c5fd',
    groundColor: '#eab308',
    roadColor: '#334155',
    curbColorA: '#ef4444',
    curbColorB: '#f8fafc',
    accentColor: '#38bdf8',
    controlPoints: [
      [0, 0, -40],
      [0, 0, 75],
      [40, 2, 165],
      [130, 5, 195],
      [215, 3, 145],
      [230, 0, 55],
      [170, 2, -10],
      [195, 5, -95],
      [140, 4, -175],
      [45, 1, -175],
      [-15, 0, -115],
    ],
  },
  frozen_tundra: {
    id: 'frozen_tundra',
    name: 'Frozen Tundra',
    subtitle: 'Alpine snowways, rapid S-bends, and glacial speedways',
    difficulty: 'Intermediate',
    roadWidth: 20,
    skyTopColor: '#0f172a',
    skyBottomColor: '#38bdf8',
    fogColor: '#1e3a5f',
    groundColor: '#e2e8f0',
    roadColor: '#475569',
    curbColorA: '#0ea5e9',
    curbColorB: '#f8fafc',
    accentColor: '#67e8f9',
    controlPoints: [
      [0, 0, -50],
      [0, 0, 90],
      [-55, 4, 170],
      [-155, 8, 165],
      [-215, 5, 75],
      [-155, 2, 0],
      [-210, 6, -95],
      [-145, 7, -190],
      [-45, 3, -195],
      [55, 4, -155],
      [45, 1, -90],
    ],
  },
  magma_caldera: {
    id: 'magma_caldera',
    name: 'Magma Caldera',
    subtitle: 'Volcanic switchbacks above glowing lava rivers',
    difficulty: 'Expert',
    roadWidth: 19,
    skyTopColor: '#1c0a09',
    skyBottomColor: '#ea580c',
    fogColor: '#451a03',
    groundColor: '#292524',
    roadColor: '#1c1917',
    curbColorA: '#f97316',
    curbColorB: '#facc15',
    accentColor: '#fb923c',
    controlPoints: [
      [0, 0, -45],
      [0, 0, 85],
      [65, 6, 175],
      [175, 10, 170],
      [230, 5, 85],
      [145, 3, 25],
      [215, 7, -65],
      [175, 9, -175],
      [65, 5, -205],
      [-45, 7, -160],
      [-55, 2, -85],
    ],
  },
};

export const TRACK_LIST: TrackDefinition[] = Object.values(TRACKS);

const trackCache = new Map<TrackId, BuiltTrack>();

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function buildTrackData(trackId: TrackId): BuiltTrack {
  const cached = trackCache.get(trackId);
  if (cached) return cached;

  const def = TRACKS[trackId] ?? TRACKS.lighthouse_bay;
  const pts = def.controlPoints;
  const nCtrl = pts.length;
  const sampleCount = 260;

  const rawPoints: Array<[number, number, number]> = [];
  for (let i = 0; i < sampleCount; i++) {
    const u = (i / sampleCount) * nCtrl;
    const seg = Math.floor(u) % nCtrl;
    const t = u - Math.floor(u);

    const p0 = pts[(seg - 1 + nCtrl) % nCtrl];
    const p1 = pts[seg];
    const p2 = pts[(seg + 1) % nCtrl];
    const p3 = pts[(seg + 2) % nCtrl];

    rawPoints.push([
      catmullRom(p0[0], p1[0], p2[0], p3[0], t),
      catmullRom(p0[1], p1[1], p2[1], p3[1], t),
      catmullRom(p0[2], p1[2], p2[2], p3[2], t),
    ]);
  }

  const samples: TrackSample[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < sampleCount; i++) {
    const curr = rawPoints[i];
    const prev = rawPoints[(i - 1 + sampleCount) % sampleCount];
    const next = rawPoints[(i + 1) % sampleCount];

    if (i > 0) {
      const dx = curr[0] - prev[0];
      const dy = curr[1] - prev[1];
      const dz = curr[2] - prev[2];
      cumulativeDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const txRaw = next[0] - prev[0];
    const tyRaw = next[1] - prev[1];
    const tzRaw = next[2] - prev[2];
    const tLen = Math.hypot(txRaw, tyRaw, tzRaw) || 1;
    const tx = txRaw / tLen;
    const ty = tyRaw / tLen;
    const tz = tzRaw / tLen;

    // Horizontal tangent for XZ normal (right side relative to forward tangent)
    const hLen = Math.hypot(tx, tz) || 1;
    const hx = tx / hLen;
    const hz = tz / hLen;
    // Right-hand vector in XZ when +Z is forward & +X is left/right: cross(up=(0,1,0), forward=(hx,0,hz)) = (hz, 0, -hx)
    const nx = -hz;
    const nz = hx;
    const yaw = Math.atan2(tx, tz);

    samples.push({
      x: curr[0],
      y: curr[1],
      z: curr[2],
      tx,
      ty,
      tz,
      nx,
      nz,
      yaw,
      dist: cumulativeDist,
    });
  }

  // Add closing segment distance for total loop length
  const last = rawPoints[sampleCount - 1];
  const first = rawPoints[0];
  const closeDist = Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]);
  const totalLength = cumulativeDist + closeDist;

  // Place boost pads along straightaways / exits
  const boostFractions = [0.14, 0.38, 0.62, 0.86];
  const boostPads: BoostPad[] = boostFractions.map((frac, idx) => {
    const sIdx = Math.floor(frac * sampleCount) % sampleCount;
    const s = samples[sIdx];
    const lateralOffset = idx % 2 === 0 ? -def.roadWidth * 0.16 : def.roadWidth * 0.16;
    return {
      id: `boost-${idx}`,
      x: s.x + s.nx * lateralOffset,
      y: s.y + 0.08,
      z: s.z + s.nz * lateralOffset,
      yaw: s.yaw,
      distanceAlong: s.dist,
    };
  });

  // Place 4 rows of 3 mystery item boxes around the track
  const itemFractions = [0.1, 0.32, 0.56, 0.78];
  const initialItemBoxes: ItemBoxState[] = [];
  itemFractions.forEach((frac, rowIdx) => {
    const sIdx = Math.floor(frac * sampleCount) % sampleCount;
    const s = samples[sIdx];
    [-def.roadWidth * 0.28, 0, def.roadWidth * 0.28].forEach((lat, colIdx) => {
      initialItemBoxes.push({
        id: `box-${rowIdx}-${colIdx}`,
        x: s.x + s.nx * lat,
        y: s.y + 1.35,
        z: s.z + s.nz * lat,
        active: true,
        respawnTimer: 0,
      });
    });
  });

  const built: BuiltTrack = {
    def,
    samples,
    totalLength,
    roadWidth: def.roadWidth,
    wallHalfWidth: def.roadWidth * 0.74,
    boostPads,
    initialItemBoxes,
    numCheckpoints: 8,
  };

  trackCache.set(trackId, built);
  return built;
}

export function getStartGridTransform(
  track: BuiltTrack,
  seatIndex: number
): { x: number; y: number; z: number; yaw: number; segmentIndex: number; distanceAlong: number } {
  const n = track.samples.length;
  // Staggered 2x2 grid just behind index 0
  const row = Math.floor(seatIndex / 2); // 0 or 1
  const col = seatIndex % 2; // 0 (left) or 1 (right)
  const backSteps = 5 + row * 5;
  const idx = (n - backSteps) % n;
  const s = track.samples[idx];
  const lateral = col === 0 ? -track.roadWidth * 0.22 : track.roadWidth * 0.22;

  return {
    x: s.x + s.nx * lateral,
    y: s.y,
    z: s.z + s.nz * lateral,
    yaw: s.yaw,
    segmentIndex: idx,
    distanceAlong: s.dist,
  };
}

export function projectPointOntoTrack(
  track: BuiltTrack,
  x: number,
  z: number,
  hintIndex?: number
): TrackProjection {
  const samples = track.samples;
  const n = samples.length;

  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
    // Fast local window search (+/- 24 samples) first
    for (let offset = -24; offset <= 24; offset++) {
      const i = (hintIndex + offset + n) % n;
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  // Fallback full scan if far from hint or no hint provided
  if (hintIndex === undefined || bestDistSq > track.wallHalfWidth * track.wallHalfWidth * 3.2) {
    bestDistSq = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  const s = samples[bestIdx];
  const next = samples[(bestIdx + 1) % n];

  const dx = x - s.x;
  const dz = z - s.z;
  const forwardProj = dx * s.tx + dz * s.tz;
  const segLen =
    bestIdx === n - 1
      ? track.totalLength - s.dist
      : Math.max(0.01, next.dist - s.dist);

  const frac = Math.max(-0.5, Math.min(1.0, forwardProj / segLen));
  const interpY = s.y + (next.y - s.y) * Math.max(0, frac);

  const signedLateral = dx * s.nx + dz * s.nz;
  let distanceAlong = s.dist + forwardProj;
  if (distanceAlong < 0) distanceAlong += track.totalLength;
  if (distanceAlong >= track.totalLength) distanceAlong -= track.totalLength;

  const halfRoad = track.roadWidth * 0.5;
  return {
    segmentIndex: bestIdx,
    distanceAlong,
    progress01: Math.max(0, Math.min(0.9999, distanceAlong / track.totalLength)),
    signedLateral,
    surfaceX: s.x + s.tx * forwardProj,
    surfaceY: interpY,
    surfaceZ: s.z + s.tz * forwardProj,
    tangentX: s.tx,
    tangentZ: s.tz,
    normalX: s.nx,
    normalZ: s.nz,
    trackYaw: s.yaw,
    onRoad: Math.abs(signedLateral) <= halfRoad,
    outsideWall: Math.abs(signedLateral) > track.wallHalfWidth,
  };
}
