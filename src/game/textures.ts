import { mulberry32 } from './world';
import type { BuildingZone, CrateKind, MapId, TreeProp, WallRect } from './types';

export interface BiomeTextureAtlas {
  mapId: MapId;
  groundPattern: CanvasPattern | null;
  roadPattern: CanvasPattern | null;
  waterPattern: CanvasPattern | null;
  floors: Record<BuildingZone['floorKind'], CanvasPattern | null>;
  roofs: Record<BuildingZone['roofStyle'], CanvasPattern | null>;
  walls: Record<WallRect['kind'], CanvasPattern | null>;
  crates: Record<CrateKind, HTMLCanvasElement>;
  trees: Record<TreeProp['variant'], HTMLCanvasElement>;
}

const atlasCache = new Map<MapId, BiomeTextureAtlas>();

function makeOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function buildGroundCanvas(mapId: MapId): HTMLCanvasElement {
  const [c, ctx] = makeOffscreen(256, 256);
  const rng = mulberry32(mapId === 'verdan_valley' ? 101 : mapId === 'rust_refinery' ? 202 : 303);

  if (mapId === 'verdan_valley') {
    ctx.fillStyle = '#2f5e34';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle organic meadow mottling
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(34, 84, 42, 0.35)' : 'rgba(74, 124, 68, 0.28)';
      ctx.beginPath();
      ctx.arc(rng() * 256, rng() * 256, 8 + rng() * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fine grass blades
    for (let i = 0; i < 420; i++) {
      const gx = rng() * 256;
      const gy = rng() * 256;
      ctx.strokeStyle = rng() < 0.6 ? 'rgba(92, 152, 74, 0.45)' : 'rgba(25, 58, 30, 0.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rng() - 0.5) * 4, gy - 4 - rng() * 5);
      ctx.stroke();
    }
    // Tiny wildflower / pebble accents
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = rng() < 0.4 ? 'rgba(250, 204, 21, 0.4)' : 'rgba(203, 213, 225, 0.25)';
      ctx.fillRect(rng() * 256, rng() * 256, 2.5, 2.5);
    }
  } else if (mapId === 'rust_refinery') {
    ctx.fillStyle = '#8b6341';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(118, 80, 50, 0.36)' : 'rgba(166, 122, 78, 0.28)';
      ctx.beginPath();
      ctx.arc(rng() * 256, rng() * 256, 6 + rng() * 20, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dry desert cracks & gravel pebbles
    ctx.strokeStyle = 'rgba(68, 43, 26, 0.35)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 22; i++) {
      const sx = rng() * 256;
      const sy = rng() * 256;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng() - 0.5) * 28, sy + (rng() - 0.5) * 28);
      ctx.stroke();
    }
    for (let i = 0; i < 190; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(62, 42, 28, 0.32)' : 'rgba(214, 178, 132, 0.32)';
      ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
    }
  } else {
    ctx.fillStyle = '#cbdce8';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(148, 178, 202, 0.28)' : 'rgba(241, 248, 255, 0.42)';
      ctx.beginPath();
      ctx.ellipse(rng() * 256, rng() * 256, 18 + rng() * 28, 7 + rng() * 10, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    // Crisp frost glints & wind streaks
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255, 255, 255, 0.55)' : 'rgba(100, 145, 180, 0.25)';
      ctx.fillRect(rng() * 256, rng() * 256, 2.2, 2.2);
    }
  }
  return c;
}

function buildRoadCanvas(): HTMLCanvasElement {
  const [c, ctx] = makeOffscreen(128, 128);
  const rng = mulberry32(404);
  ctx.fillStyle = '#333942';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 360; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)';
    ctx.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  return c;
}

function buildWaterCanvas(mapId: MapId): HTMLCanvasElement {
  const [c, ctx] = makeOffscreen(128, 128);
  const rng = mulberry32(505);
  ctx.fillStyle =
    mapId === 'rust_refinery' ? '#7c2d12' : mapId === 'arctic_outpost' ? '#075985' : '#0c4a6e';
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle =
    mapId === 'rust_refinery'
      ? 'rgba(251, 146, 60, 0.25)'
      : 'rgba(125, 211, 252, 0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    ctx.beginPath();
    ctx.arc(x, y, 10 + rng() * 14, 0.2, 1.8);
    ctx.stroke();
  }
  return c;
}

function buildFloorCanvas(kind: BuildingZone['floorKind']): HTMLCanvasElement {
  const [c, ctx] = makeOffscreen(128, 128);
  const rng = mulberry32(kind === 'wood' ? 601 : kind === 'tile' ? 602 : 603);

  if (kind === 'wood') {
    ctx.fillStyle = '#7c5333';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,220,180,0.06)';
      ctx.fillRect(0, y, 128, 16);
      ctx.fillStyle = 'rgba(40, 24, 12, 0.45)';
      ctx.fillRect(0, y, 128, 1.5);
      const seam = ((y / 16) * 43) % 128;
      ctx.fillRect(seam, y, 1.5, 16);
    }
  } else if (kind === 'tile') {
    for (let y = 0; y < 128; y += 32) {
      for (let x = 0; x < 128; x += 32) {
        ctx.fillStyle = ((x + y) / 32) % 2 === 0 ? '#64748b' : '#475569';
        ctx.fillRect(x, y, 32, 32);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.strokeRect(x, y, 32, 32);
      }
    }
  } else {
    ctx.fillStyle = '#3f4752';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 16; y < 128; y += 32) {
      for (let x = 16; x < 128; x += 32) {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.16)';
        ctx.fillRect(x - 4, y - 1, 8, 2);
        ctx.fillRect(x - 1, y - 4, 2, 8);
      }
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(rng() * 128, rng() * 128, 3, 2);
    }
  }
  return c;
}

function buildRoofCanvas(style: BuildingZone['roofStyle']): HTMLCanvasElement {
  const [c, ctx] = makeOffscreen(128, 128);
  if (style === 'shingle') {
    ctx.fillStyle = '#5c3328';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y, 128, 15);
      ctx.fillStyle = 'rgba(24, 12, 8, 0.45)';
      ctx.fillRect(0, y + 15, 128, 1);
    }
  } else if (style === 'steel') {
    ctx.fillStyle = '#5b4636';
    ctx.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, 0, 3, 128);
      ctx.fillStyle = 'rgba(255,200,150,0.1)';
      ctx.fillRect(x + 3, 0, 3, 128);
    }
  } else {
    ctx.fillStyle = '#3b4f66';
    ctx.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
      ctx.fillRect(x, 0, 3, 128);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.14)';
      ctx.fillRect(x + 4, 0, 4, 128);
    }
  }
  return c;
}

function buildWallCanvas(kind: WallRect['kind']): HTMLCanvasElement {
  const [c, ctx] = makeOffscreen(64, 64);
  const rng = mulberry32(kind.length * 91);

  if (kind === 'brick') {
    ctx.fillStyle = '#7f3328';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(226, 200, 180, 0.26)';
    for (let y = 0; y < 64; y += 16) {
      ctx.fillRect(0, y, 64, 2);
      const off = (y / 16) % 2 === 0 ? 0 : 16;
      for (let x = off; x < 64; x += 32) ctx.fillRect(x, y, 2, 16);
    }
  } else if (kind === 'concrete') {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.strokeRect(1, 1, 62, 62);
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(rng() * 64, rng() * 64, 2, 2);
    }
  } else if (kind.startsWith('container')) {
    const base =
      kind === 'container_red'
        ? '#b91c1c'
        : kind === 'container_blue'
          ? '#1d4ed8'
          : '#b45309';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(x, 0, 2, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 2, 0, 2, 64);
    }
  } else if (kind === 'sandbag') {
    ctx.fillStyle = '#a68b5b';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      ctx.strokeStyle = 'rgba(66, 48, 22, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, y + 2, 28, 12);
      ctx.strokeRect(32, y + 2, 28, 12);
    }
  } else {
    ctx.fillStyle = '#57534e';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(168, 162, 158, 0.25)' : 'rgba(28, 25, 23, 0.3)';
      ctx.beginPath();
      ctx.arc(rng() * 64, rng() * 64, 5 + rng() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

function buildCrateSprite(kind: CrateKind): HTMLCanvasElement {
  const size = kind === 'supply_drop' ? 56 : 46;
  const [c, ctx] = makeOffscreen(size, size);
  const pad = 4;
  const inner = size - pad * 2;

  if (kind === 'wood_crate') {
    ctx.fillStyle = '#9a6532';
    ctx.fillRect(pad, pad, inner, inner);
    // Plank lines
    ctx.fillStyle = '#71461d';
    ctx.fillRect(pad, pad + inner * 0.33, inner, 2);
    ctx.fillRect(pad, pad + inner * 0.66, inner, 2);
    // Diagonal brace
    ctx.strokeStyle = '#b9824a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pad + 3, pad + 3);
    ctx.lineTo(size - pad - 3, size - pad - 3);
    ctx.stroke();
    // Steel frame & corner rivets
    ctx.strokeStyle = '#3f2e1d';
    ctx.lineWidth = 3;
    ctx.strokeRect(pad, pad, inner, inner);
  } else if (kind === 'military_case') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(pad, pad, inner, inner);
    ctx.fillStyle = '#334155';
    ctx.fillRect(pad + 4, pad + 4, inner - 8, inner - 8);
    // Glowing cyan/purple tactical trim
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(pad + 1, pad + 1, inner - 2, inner - 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(size / 2 - 8, size / 2 - 3, 16, 6);
  } else if (kind === 'med_crate') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(pad, pad, inner, inner);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(pad + 1, pad + 1, inner - 2, inner - 2);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(size / 2 - 3, size / 2 - 10, 6, 20);
    ctx.fillRect(size / 2 - 10, size / 2 - 3, 20, 6);
  } else {
    // Legendary orbital supply drop
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(pad, pad, inner, inner);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(pad + 1, pad + 1, inner - 2, inner - 2);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(size / 2, pad + 8);
    ctx.lineTo(size - pad - 8, size / 2);
    ctx.lineTo(size / 2, size - pad - 8);
    ctx.lineTo(pad + 8, size / 2);
    ctx.closePath();
    ctx.fill();
  }

  return c;
}

function buildTreeSprite(variant: TreeProp['variant']): HTMLCanvasElement {
  const size = 140;
  const [c, ctx] = makeOffscreen(size, size);
  const cx = size / 2;
  const cy = size / 2;

  if (variant === 'pine') {
    const layers = [
      { r: 54, col: '#134e4a' },
      { r: 44, col: '#115e59' },
      { r: 32, col: '#0f766e' },
      { r: 20, col: '#cbd5e1' }, // snow dust crown
    ];
    for (const l of layers) {
      ctx.fillStyle = l.col;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const rad = i % 2 === 0 ? l.r : l.r * 0.65;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else if (variant === 'palm') {
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = k % 2 === 0 ? '#3f6212' : '#4d7c0f';
      ctx.beginPath();
      ctx.ellipse(26, 0, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#713f12';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Rich oak canopy blobs
    const blobs = [
      { dx: -16, dy: -12, r: 34, col: '#14532d' },
      { dx: 18, dy: -10, r: 32, col: '#166534' },
      { dx: -10, dy: 18, r: 33, col: '#15803d' },
      { dx: 16, dy: 14, r: 30, col: '#16a34a' },
      { dx: -3, dy: -4, r: 26, col: '#22c55e' },
    ];
    for (const b of blobs) {
      ctx.fillStyle = b.col;
      ctx.beginPath();
      ctx.arc(cx + b.dx, cy + b.dy, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return c;
}

export function getBiomeTextureAtlas(
  ctx: CanvasRenderingContext2D,
  mapId: MapId
): BiomeTextureAtlas {
  const existing = atlasCache.get(mapId);
  if (existing) return existing;

  const atlas: BiomeTextureAtlas = {
    mapId,
    groundPattern: ctx.createPattern(buildGroundCanvas(mapId), 'repeat'),
    roadPattern: ctx.createPattern(buildRoadCanvas(), 'repeat'),
    waterPattern: ctx.createPattern(buildWaterCanvas(mapId), 'repeat'),
    floors: {
      wood: ctx.createPattern(buildFloorCanvas('wood'), 'repeat'),
      tile: ctx.createPattern(buildFloorCanvas('tile'), 'repeat'),
      metal: ctx.createPattern(buildFloorCanvas('metal'), 'repeat'),
    },
    roofs: {
      shingle: ctx.createPattern(buildRoofCanvas('shingle'), 'repeat'),
      steel: ctx.createPattern(buildRoofCanvas('steel'), 'repeat'),
      slate: ctx.createPattern(buildRoofCanvas('slate'), 'repeat'),
    },
    walls: {
      brick: ctx.createPattern(buildWallCanvas('brick'), 'repeat'),
      concrete: ctx.createPattern(buildWallCanvas('concrete'), 'repeat'),
      container_red: ctx.createPattern(buildWallCanvas('container_red'), 'repeat'),
      container_blue: ctx.createPattern(buildWallCanvas('container_blue'), 'repeat'),
      container_gold: ctx.createPattern(buildWallCanvas('container_gold'), 'repeat'),
      sandbag: ctx.createPattern(buildWallCanvas('sandbag'), 'repeat'),
      rock: ctx.createPattern(buildWallCanvas('rock'), 'repeat'),
    },
    crates: {
      wood_crate: buildCrateSprite('wood_crate'),
      military_case: buildCrateSprite('military_case'),
      med_crate: buildCrateSprite('med_crate'),
      supply_drop: buildCrateSprite('supply_drop'),
    },
    trees: {
      oak: buildTreeSprite('oak'),
      pine: buildTreeSprite('pine'),
      palm: buildTreeSprite('palm'),
    },
  };

  atlasCache.set(mapId, atlas);
  return atlas;
}
