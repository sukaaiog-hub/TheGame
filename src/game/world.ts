import type {
  BuildingZone,
  BuiltWorld,
  CrateKind,
  LootCrate,
  MapDefinition,
  MapId,
  RoadStrip,
  StormState,
  TreeProp,
  WallRect,
} from './types';

export const MAPS: Record<MapId, MapDefinition> = {
  verdan_valley: {
    id: 'verdan_valley',
    name: 'Verdant Island',
    subtitle: 'Emerald meadows, crossroad compounds, timber forests, and high-tier bunkers',
    themeTag: 'Classic BR',
    accentColor: '#22c55e',
    worldSize: 2800,
    playMargin: 130,
    groundColor: '#2f5e34',
    roadColor: '#3f4652',
    waterColor: '#0c4a6e',
    sandColor: '#c2a66d',
    stormColor: '#7c3aed',
    pois: [
      { name: 'Central Plaza', x: 1400, y: 1400 },
      { name: 'North Barracks', x: 1400, y: 540 },
      { name: 'Timber Mill', x: 560, y: 1360 },
      { name: 'Dockside Depot', x: 2220, y: 1440 },
      { name: 'South Bunker', x: 1420, y: 2260 },
    ],
  },
  rust_refinery: {
    id: 'rust_refinery',
    name: 'Rust Refinery',
    subtitle: 'Arid canyon badlands packed with shipping containers and armored vaults',
    themeTag: 'CQB Intense',
    accentColor: '#f59e0b',
    worldSize: 2800,
    playMargin: 130,
    groundColor: '#8d6644',
    roadColor: '#48423c',
    waterColor: '#78350f',
    sandColor: '#b98f5c',
    stormColor: '#dc2626',
    pois: [
      { name: 'Scrap Yard', x: 1400, y: 1400 },
      { name: 'Refinery North', x: 1380, y: 560 },
      { name: 'Fuel Tanks', x: 580, y: 1380 },
      { name: 'Cargo Docks', x: 2220, y: 1380 },
      { name: 'Outpost Alpha', x: 1400, y: 2240 },
    ],
  },
  arctic_outpost: {
    id: 'arctic_outpost',
    name: 'Arctic Outpost',
    subtitle: 'Frostbound airbase hangars, frozen pine groves, and sniper sightlines',
    themeTag: 'Long Range',
    accentColor: '#38bdf8',
    worldSize: 2800,
    playMargin: 130,
    groundColor: '#c8d9e6',
    roadColor: '#334155',
    waterColor: '#0369a1',
    sandColor: '#94a3b8',
    stormColor: '#2563eb',
    pois: [
      { name: 'Command Hangar', x: 1400, y: 1400 },
      { name: 'Radar North', x: 1400, y: 540 },
      { name: 'Glacier Camp', x: 560, y: 1420 },
      { name: 'Ice Docks', x: 2240, y: 1400 },
      { name: 'Reactor South', x: 1400, y: 2240 },
    ],
  },
};

export const MAP_LIST: MapDefinition[] = Object.values(MAPS);

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addCompoundBuilding(
  walls: WallRect[],
  buildings: BuildingZone[],
  crates: LootCrate[],
  id: string,
  name: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  wallKind: WallRect['kind'],
  floorKind: BuildingZone['floorKind'],
  roofStyle: BuildingZone['roofStyle'],
  rng: () => number,
  crateKind: CrateKind = 'military_case'
): void {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const t = 18;
  const doorW = 76;

  buildings.push({ id, name, x, y, w, h, floorKind, roofStyle });

  // Top wall with centered doorway
  const topSeg = (w - doorW) / 2;
  walls.push({ id: `${id}-n1`, x, y, w: topSeg, h: t, kind: wallKind, blocksBullets: true });
  walls.push({
    id: `${id}-n2`,
    x: x + topSeg + doorW,
    y,
    w: topSeg,
    h: t,
    kind: wallKind,
    blocksBullets: true,
  });

  // Bottom wall with centered doorway
  walls.push({
    id: `${id}-s1`,
    x,
    y: y + h - t,
    w: topSeg,
    h: t,
    kind: wallKind,
    blocksBullets: true,
  });
  walls.push({
    id: `${id}-s2`,
    x: x + topSeg + doorW,
    y: y + h - t,
    w: topSeg,
    h: t,
    kind: wallKind,
    blocksBullets: true,
  });

  // Left & right walls with optional side doorways for larger buildings
  if (w >= 260 && h >= 220) {
    const sideSeg = (h - 2 * t - doorW) / 2;
    walls.push({
      id: `${id}-w1`,
      x,
      y: y + t,
      w: t,
      h: sideSeg,
      kind: wallKind,
      blocksBullets: true,
    });
    walls.push({
      id: `${id}-w2`,
      x,
      y: y + t + sideSeg + doorW,
      w: t,
      h: sideSeg,
      kind: wallKind,
      blocksBullets: true,
    });
    walls.push({
      id: `${id}-e1`,
      x: x + w - t,
      y: y + t,
      w: t,
      h: sideSeg,
      kind: wallKind,
      blocksBullets: true,
    });
    walls.push({
      id: `${id}-e2`,
      x: x + w - t,
      y: y + t + sideSeg + doorW,
      w: t,
      h: sideSeg,
      kind: wallKind,
      blocksBullets: true,
    });
  } else {
    walls.push({
      id: `${id}-w`,
      x,
      y: y + t,
      w: t,
      h: h - 2 * t,
      kind: wallKind,
      blocksBullets: true,
    });
    walls.push({
      id: `${id}-e`,
      x: x + w - t,
      y: y + t,
      w: t,
      h: h - 2 * t,
      kind: wallKind,
      blocksBullets: true,
    });
  }

  // Interior loot crates (1-2 per building)
  const crateHp = crateKind === 'military_case' ? 90 : 65;
  crates.push({
    id: `crate-${id}-1`,
    x: cx - (rng() < 0.5 ? 48 : -48),
    y: cy - 26,
    kind: crateKind,
    hp: crateHp,
    maxHp: crateHp,
    opened: false,
    hitFlashUntilMs: 0,
  });
  crates.push({
    id: `crate-${id}-2`,
    x: cx + (rng() < 0.5 ? 44 : -44),
    y: cy + 36,
    kind: rng() < 0.38 ? 'med_crate' : 'wood_crate',
    hp: 65,
    maxHp: 65,
    opened: false,
    hitFlashUntilMs: 0,
  });
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  pad: number = 0
): boolean {
  return (
    ax - pad < bx + bw &&
    ax + aw + pad > bx &&
    ay - pad < by + bh &&
    ay + ah + pad > by
  );
}

const worldCache = new Map<string, BuiltWorld>();

export function buildWorldFromSeed(mapId: MapId, seed: number): BuiltWorld {
  const key = `${mapId}:${seed}`;
  const cached = worldCache.get(key);
  if (cached) {
    return {
      ...cached,
      crates: cached.crates.map((c) => ({ ...c })),
    };
  }

  const def = MAPS[mapId] ?? MAPS.verdan_valley;
  const rng = mulberry32(seed || 1337);
  const size = def.worldSize;

  const walls: WallRect[] = [];
  const buildings: BuildingZone[] = [];
  const trees: TreeProp[] = [];
  const crates: LootCrate[] = [];

  // Crossroad tactical asphalt highways
  const roads: RoadStrip[] = [
    { x: 180, y: size / 2 - 58, w: size - 360, h: 116, orientation: 'h' },
    { x: size / 2 - 58, y: 180, w: 116, h: size - 360, orientation: 'v' },
  ];

  // Outer perimeter containment wall border along island shoreline
  const m = def.playMargin;
  const wallT = 36;
  walls.push({ id: 'border-n', x: m, y: m, w: size - m * 2, h: wallT, kind: 'concrete', blocksBullets: true });
  walls.push({ id: 'border-s', x: m, y: size - m - wallT, w: size - m * 2, h: wallT, kind: 'concrete', blocksBullets: true });
  walls.push({ id: 'border-w', x: m, y: m, w: wallT, h: size - m * 2, kind: 'concrete', blocksBullets: true });
  walls.push({ id: 'border-e', x: size - m - wallT, y: m, w: wallT, h: size - m * 2, kind: 'concrete', blocksBullets: true });

  const wallStyle: WallRect['kind'] =
    mapId === 'rust_refinery' ? 'concrete' : mapId === 'arctic_outpost' ? 'concrete' : 'brick';
  const floorStyle: BuildingZone['floorKind'] =
    mapId === 'rust_refinery' ? 'metal' : mapId === 'arctic_outpost' ? 'tile' : 'wood';
  const roofStyle: BuildingZone['roofStyle'] =
    mapId === 'rust_refinery' ? 'steel' : mapId === 'arctic_outpost' ? 'slate' : 'shingle';

  // 5 major landmark compounds + 4 corner outposts
  addCompoundBuilding(walls, buildings, crates, 'b-center', def.pois[0].name, 1400, 1400, 320, 260, wallStyle, floorStyle, roofStyle, rng, 'military_case');
  addCompoundBuilding(walls, buildings, crates, 'b-north', def.pois[1].name, 1400, 560, 290, 230, wallStyle, floorStyle, roofStyle, rng, 'military_case');
  addCompoundBuilding(walls, buildings, crates, 'b-west', def.pois[2].name, 560, 1400, 280, 230, wallStyle, floorStyle, roofStyle, rng, 'wood_crate');
  addCompoundBuilding(walls, buildings, crates, 'b-east', def.pois[3].name, 2240, 1400, 280, 230, wallStyle, floorStyle, roofStyle, rng, 'military_case');
  addCompoundBuilding(walls, buildings, crates, 'b-south', def.pois[4].name, 1400, 2240, 290, 230, wallStyle, floorStyle, roofStyle, rng, 'wood_crate');

  const cornerCoords: Array<[number, number, string]> = [
    [660, 660, 'NW Outpost'],
    [2140, 660, 'NE Outpost'],
    [660, 2140, 'SW Outpost'],
    [2140, 2140, 'SE Outpost'],
  ];
  cornerCoords.forEach(([cx, cy, label], idx) => {
    addCompoundBuilding(
      walls,
      buildings,
      crates,
      `b-corner-${idx}`,
      label,
      cx,
      cy,
      210,
      180,
      wallStyle,
      floorStyle,
      roofStyle,
      rng,
      idx % 2 === 0 ? 'military_case' : 'wood_crate'
    );
  });

  // Scatter tactical shipping containers & sandbag barricades in open yards
  const containerKinds: Array<WallRect['kind']> = ['container_red', 'container_blue', 'container_gold'];
  let coverCount = 0;
  for (let attempt = 0; attempt < 95 && coverCount < 26; attempt++) {
    const horizontal = rng() < 0.5;
    const isSandbag = rng() < 0.38;
    const cw = isSandbag ? (horizontal ? 110 : 28) : horizontal ? 128 : 54;
    const ch = isSandbag ? (horizontal ? 28 : 110) : horizontal ? 54 : 128;
    const cx = 240 + rng() * (size - 480 - cw);
    const cy = 240 + rng() * (size - 480 - ch);

    const overlapsBuilding = buildings.some((b) => rectsOverlap(cx, cy, cw, ch, b.x, b.y, b.w, b.h, 75));
    const overlapsRoad = roads.some((r) => rectsOverlap(cx, cy, cw, ch, r.x, r.y, r.w, r.h, 24));
    const overlapsWall = walls.some((w) => rectsOverlap(cx, cy, cw, ch, w.x, w.y, w.w, w.h, 42));
    if (overlapsBuilding || overlapsRoad || overlapsWall) continue;

    const kind = isSandbag
      ? 'sandbag'
      : containerKinds[Math.floor(rng() * containerKinds.length)];

    walls.push({
      id: `cover-${coverCount}`,
      x: Math.round(cx),
      y: Math.round(cy),
      w: cw,
      h: ch,
      kind,
      blocksBullets: true,
    });

    // Put a loot crate beside half the shipping containers
    if (rng() < 0.58) {
      const sideX = cx + cw + 26;
      const sideY = cy + ch / 2;
      const ck: CrateKind = rng() < 0.28 ? 'military_case' : rng() < 0.5 ? 'med_crate' : 'wood_crate';
      crates.push({
        id: `crate-cov-${coverCount}`,
        x: Math.round(sideX),
        y: Math.round(sideY),
        kind: ck,
        hp: ck === 'military_case' ? 90 : 65,
        maxHp: ck === 'military_case' ? 90 : 65,
        opened: false,
        hitFlashUntilMs: 0,
      });
    }
    coverCount++;
  }

  // Scatter boulders for natural cover
  let rockCount = 0;
  for (let attempt = 0; attempt < 60 && rockCount < 18; attempt++) {
    const rw = 46 + Math.round(rng() * 28);
    const rh = 44 + Math.round(rng() * 26);
    const rx = 220 + rng() * (size - 440 - rw);
    const ry = 220 + rng() * (size - 440 - rh);
    const overlapsAny =
      buildings.some((b) => rectsOverlap(rx, ry, rw, rh, b.x, b.y, b.w, b.h, 60)) ||
      roads.some((r) => rectsOverlap(rx, ry, rw, rh, r.x, r.y, r.w, r.h, 20)) ||
      walls.some((w) => rectsOverlap(rx, ry, rw, rh, w.x, w.y, w.w, w.h, 36));
    if (overlapsAny) continue;

    walls.push({
      id: `rock-${rockCount}`,
      x: Math.round(rx),
      y: Math.round(ry),
      w: rw,
      h: rh,
      kind: 'rock',
      blocksBullets: true,
    });
    rockCount++;
  }

  // Additional field loot crates along roads and clearings
  let fieldCrates = 0;
  for (let attempt = 0; attempt < 90 && fieldCrates < 18; attempt++) {
    const fx = 280 + rng() * (size - 560);
    const fy = 280 + rng() * (size - 560);
    const blocked =
      walls.some((w) => rectsOverlap(fx - 30, fy - 30, 60, 60, w.x, w.y, w.w, w.h, 12)) ||
      crates.some((c) => Math.hypot(c.x - fx, c.y - fy) < 110);
    if (blocked) continue;

    const ck: CrateKind = rng() < 0.24 ? 'military_case' : rng() < 0.42 ? 'med_crate' : 'wood_crate';
    crates.push({
      id: `crate-field-${fieldCrates}`,
      x: Math.round(fx),
      y: Math.round(fy),
      kind: ck,
      hp: ck === 'military_case' ? 90 : 65,
      maxHp: ck === 'military_case' ? 90 : 65,
      opened: false,
      hitFlashUntilMs: 0,
    });
    fieldCrates++;
  }

  // Scatter textured trees (solid trunk + translucent overhead canopy)
  const treeVariant: TreeProp['variant'] =
    mapId === 'arctic_outpost' ? 'pine' : mapId === 'rust_refinery' ? 'palm' : 'oak';
  let treeCount = 0;
  for (let attempt = 0; attempt < 180 && treeCount < 58; attempt++) {
    const tx = 210 + rng() * (size - 420);
    const ty = 210 + rng() * (size - 420);
    const canopyRadius = 46 + rng() * 20;
    const blocked =
      buildings.some((b) => rectsOverlap(tx - 55, ty - 55, 110, 110, b.x, b.y, b.w, b.h, 30)) ||
      roads.some((r) => rectsOverlap(tx - 40, ty - 40, 80, 80, r.x, r.y, r.w, r.h, 16)) ||
      walls.some((w) => rectsOverlap(tx - 35, ty - 35, 70, 70, w.x, w.y, w.w, w.h, 16)) ||
      crates.some((c) => Math.hypot(c.x - tx, c.y - ty) < 70) ||
      trees.some((t) => Math.hypot(t.x - tx, t.y - ty) < 88);
    if (blocked) continue;

    trees.push({
      id: `tree-${treeCount}`,
      x: Math.round(tx),
      y: Math.round(ty),
      trunkRadius: 15,
      canopyRadius: Math.round(canopyRadius),
      variant: treeVariant,
    });
    treeCount++;
  }

  const world: BuiltWorld = { def, seed, walls, buildings, roads, trees, crates };
  worldCache.set(key, {
    ...world,
    crates: world.crates.map((c) => ({ ...c })),
  });
  return world;
}

export function resolveCircleVsWorld(
  world: BuiltWorld,
  x: number,
  y: number,
  radius: number
): { x: number; y: number } {
  let nx = x;
  let ny = y;

  // Clamp inside outer playable arena
  const minBound = world.def.playMargin + 36 + radius;
  const maxBound = world.def.worldSize - world.def.playMargin - 36 - radius;
  nx = Math.max(minBound, Math.min(maxBound, nx));
  ny = Math.max(minBound, Math.min(maxBound, ny));

  // Push out from rectangular walls
  for (let pass = 0; pass < 2; pass++) {
    for (const w of world.walls) {
      const closestX = Math.max(w.x, Math.min(nx, w.x + w.w));
      const closestY = Math.max(w.y, Math.min(ny, w.y + w.h));
      const dx = nx - closestX;
      const dy = ny - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radius * radius) {
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          nx += (dx / dist) * overlap;
          ny += (dy / dist) * overlap;
        } else {
          // Inside rect center fallback: push out along shallowest axis
          const leftPen = nx - w.x;
          const rightPen = w.x + w.w - nx;
          const topPen = ny - w.y;
          const botPen = w.y + w.h - ny;
          const minPen = Math.min(leftPen, rightPen, topPen, botPen);
          if (minPen === leftPen) nx = w.x - radius;
          else if (minPen === rightPen) nx = w.x + w.w + radius;
          else if (minPen === topPen) ny = w.y - radius;
          else ny = w.y + w.h + radius;
        }
      }
    }

    // Push out from solid tree trunks
    for (const t of world.trees) {
      const dx = nx - t.x;
      const dy = ny - t.y;
      const minR = radius + t.trunkRadius;
      const distSq = dx * dx + dy * dy;
      if (distSq < minR * minR && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = minR - dist;
        nx += (dx / dist) * overlap;
        ny += (dy / dist) * overlap;
      }
    }
  }

  return { x: nx, y: ny };
}

export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { hit: boolean; t: number; hitX: number; hitY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-8) {
      if (q[i] < 0) return { hit: false, t: 1, hitX: x2, hitY: y2 };
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return { hit: false, t: 1, hitX: x2, hitY: y2 };
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return { hit: false, t: 1, hitX: x2, hitY: y2 };
        if (r < t1) t1 = r;
      }
    }
  }

  if (t0 <= t1 && t0 >= 0 && t0 <= 1) {
    return { hit: true, t: t0, hitX: x1 + t0 * dx, hitY: y1 + t0 * dy };
  }
  return { hit: false, t: 1, hitX: x2, hitY: y2 };
}

export function raycastWalls(
  world: BuiltWorld,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { hit: boolean; hitX: number; hitY: number; t: number } {
  let bestT = 1;
  let bestX = x2;
  let bestY = y2;
  let hit = false;

  for (const w of world.walls) {
    if (!w.blocksBullets) continue;
    const res = segmentIntersectsRect(x1, y1, x2, y2, w.x, w.y, w.w, w.h);
    if (res.hit && res.t < bestT) {
      bestT = res.t;
      bestX = res.hitX;
      bestY = res.hitY;
      hit = true;
    }
  }

  return { hit, hitX: bestX, hitY: bestY, t: bestT };
}

export function getSafeDropSpawns(
  world: BuiltWorld,
  totalFighters: number,
  coopSquadHumans: number = 0
): Array<{ x: number; y: number }> {
  const spawns: Array<{ x: number; y: number }> = [];
  const center = world.def.worldSize / 2;

  // Co-op squad spawns humans grouped cleanly at South Drop Zone
  for (let i = 0; i < coopSquadHumans; i++) {
    const rawX = center - 90 + i * 60;
    const rawY = center + 880;
    spawns.push(resolveCircleVsWorld(world, rawX, rawY, 22));
  }

  const remaining = Math.max(0, totalFighters - coopSquadHumans);
  const ringRadius = world.def.worldSize * 0.35;

  for (let i = 0; i < remaining; i++) {
    const angle = (i / Math.max(1, remaining)) * Math.PI * 2 + 0.35;
    const r = ringRadius * (i % 2 === 0 ? 1.0 : 0.78);
    const rawX = center + Math.cos(angle) * r;
    const rawY = center + Math.sin(angle) * r;
    spawns.push(resolveCircleVsWorld(world, rawX, rawY, 22));
  }

  return spawns;
}

export function getStormStateAt(elapsedMs: number, world: BuiltWorld): StormState {
  const sec = Math.max(0, elapsedMs / 1000);
  const size = world.def.worldSize;
  const rng = mulberry32((world.seed || 1337) + 999);
  const offsetX = (rng() - 0.5) * 320;
  const offsetY = (rng() - 0.5) * 320;
  const targetCx = size / 2 + offsetX;
  const targetCy = size / 2 + offsetY;

  const initialR = size * 0.62;
  // 4-phase Battle Royale storm schedule (fast, intense ~3-minute endgame!)
  const phases = [
    { start: 0, end: 22, rFrom: initialR, rTo: initialR, dmg: 2, shrinking: false },
    { start: 22, end: 48, rFrom: initialR, rTo: 920, dmg: 4, shrinking: true },
    { start: 48, end: 68, rFrom: 920, rTo: 920, dmg: 6, shrinking: false },
    { start: 68, end: 98, rFrom: 920, rTo: 500, dmg: 9, shrinking: true },
    { start: 98, end: 116, rFrom: 500, rTo: 500, dmg: 12, shrinking: false },
    { start: 116, end: 146, rFrom: 500, rTo: 185, dmg: 16, shrinking: true },
    { start: 146, end: 9999, rFrom: 185, rTo: 65, dmg: 22, shrinking: true },
  ];

  for (let idx = 0; idx < phases.length; idx++) {
    const p = phases[idx];
    if (sec <= p.end) {
      const span = Math.max(1, p.end - p.start);
      const t = Math.min(1, Math.max(0, (sec - p.start) / span));
      const radius = p.rFrom + (p.rTo - p.rFrom) * t;
      const centerBlend = Math.min(1, sec / 130);
      return {
        phase: Math.min(4, Math.floor(idx / 2) + 1),
        centerX: size / 2 + (targetCx - size / 2) * centerBlend,
        centerY: size / 2 + (targetCy - size / 2) * centerBlend,
        currentRadius: radius,
        targetRadius: p.rTo,
        shrinking: p.shrinking,
        damagePerSecond: p.dmg,
        secondsToNextChange: Math.max(0, Math.ceil(p.end - sec)),
      };
    }
  }

  return {
    phase: 4,
    centerX: targetCx,
    centerY: targetCy,
    currentRadius: 65,
    targetRadius: 65,
    shrinking: false,
    damagePerSecond: 22,
    secondsToNextChange: 0,
  };
}
