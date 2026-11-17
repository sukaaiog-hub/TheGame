import type {
  AmmoType,
  CrateKind,
  LootDrop,
  Rarity,
  WeaponDefinition,
  WeaponId,
  WeaponInstance,
} from './types';

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pistol: {
    id: 'pistol',
    name: 'PX-9 Tactical Pistol',
    shortName: 'PISTOL',
    ammoType: 'light',
    pellets: 1,
    spreadRad: 0.04,
    baseDamage: 18,
    fireRateMs: 240,
    magSize: 14,
    reloadMs: 1050,
    bulletSpeed: 980,
    range: 640,
    armorPenetration: 0.25,
    recoilKick: 2.5,
    tracerColor: '#fef08a',
    barrelLength: 22,
    silhouette: 'pistol',
  },
  smg: {
    id: 'smg',
    name: 'Vector-9 SMG',
    shortName: 'VECTOR SMG',
    ammoType: 'light',
    pellets: 1,
    spreadRad: 0.085,
    baseDamage: 14,
    fireRateMs: 82,
    magSize: 32,
    reloadMs: 1350,
    bulletSpeed: 1050,
    range: 590,
    armorPenetration: 0.28,
    recoilKick: 2.0,
    tracerColor: '#38bdf8',
    barrelLength: 27,
    silhouette: 'smg',
  },
  shotgun: {
    id: 'shotgun',
    name: 'M870 Breacher',
    shortName: 'SHOTGUN',
    ammoType: 'shells',
    pellets: 7,
    spreadRad: 0.21,
    baseDamage: 15,
    fireRateMs: 740,
    magSize: 6,
    reloadMs: 1650,
    bulletSpeed: 920,
    range: 380,
    armorPenetration: 0.22,
    recoilKick: 7.5,
    tracerColor: '#fb923c',
    barrelLength: 31,
    silhouette: 'shotgun',
  },
  rifle: {
    id: 'rifle',
    name: 'MK-47 Ranger AR',
    shortName: 'RANGER AR',
    ammoType: 'heavy',
    pellets: 1,
    spreadRad: 0.045,
    baseDamage: 24,
    fireRateMs: 130,
    magSize: 28,
    reloadMs: 1550,
    bulletSpeed: 1260,
    range: 840,
    armorPenetration: 0.36,
    recoilKick: 3.4,
    tracerColor: '#facc15',
    barrelLength: 34,
    silhouette: 'rifle',
  },
  sniper: {
    id: 'sniper',
    name: 'Phantom .50 Marksman',
    shortName: 'SNIPER',
    ammoType: 'heavy',
    pellets: 1,
    spreadRad: 0.008,
    baseDamage: 66,
    fireRateMs: 1080,
    magSize: 5,
    reloadMs: 1900,
    bulletSpeed: 1850,
    range: 1240,
    armorPenetration: 0.62,
    recoilKick: 9.0,
    tracerColor: '#e879f9',
    barrelLength: 42,
    silhouette: 'sniper',
  },
  plasma: {
    id: 'plasma',
    name: 'Helios Apex LMG',
    shortName: 'HELIOS LMG',
    ammoType: 'energy',
    pellets: 1,
    spreadRad: 0.052,
    baseDamage: 26,
    fireRateMs: 96,
    magSize: 45,
    reloadMs: 1850,
    bulletSpeed: 1380,
    range: 920,
    armorPenetration: 0.5,
    recoilKick: 2.8,
    tracerColor: '#22d3ee',
    barrelLength: 38,
    silhouette: 'plasma',
  },
};

export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; glow: string; damageMult: number; rank: number }
> = {
  common: {
    label: 'Common',
    color: '#94a3b8',
    glow: 'rgba(148,163,184,0.35)',
    damageMult: 1.0,
    rank: 1,
  },
  uncommon: {
    label: 'Uncommon',
    color: '#22c55e',
    glow: 'rgba(34,197,94,0.45)',
    damageMult: 1.12,
    rank: 2,
  },
  rare: {
    label: 'Rare',
    color: '#38bdf8',
    glow: 'rgba(56,189,248,0.55)',
    damageMult: 1.24,
    rank: 3,
  },
  epic: {
    label: 'Epic',
    color: '#a855f7',
    glow: 'rgba(168,85,247,0.6)',
    damageMult: 1.36,
    rank: 4,
  },
  legendary: {
    label: 'Legendary',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.75)',
    damageMult: 1.5,
    rank: 5,
  },
};

export const DEFAULT_RESERVE_AMMO: Record<AmmoType, number> = {
  light: 45,
  shells: 12,
  heavy: 20,
  energy: 30,
};

export function createWeaponInstance(weaponId: WeaponId, rarity: Rarity = 'common'): WeaponInstance {
  return {
    weaponId,
    rarity,
    magAmmo: WEAPONS[weaponId].magSize,
  };
}

export function getScaledWeaponDamage(weaponId: WeaponId, rarity: Rarity): number {
  return Math.round(WEAPONS[weaponId].baseDamage * RARITY_META[rarity].damageMult);
}

export function getAmmoBundleAmount(ammoType: AmmoType): number {
  switch (ammoType) {
    case 'light':
      return 36;
    case 'shells':
      return 10;
    case 'heavy':
      return 24;
    case 'energy':
      return 35;
  }
}

export function rollCrateDrops(
  crateKind: CrateKind,
  x: number,
  y: number,
  rng: () => number = Math.random,
  idPrefix: string = `drop-${Date.now()}`
): LootDrop[] {
  const now = Date.now();
  const drops: LootDrop[] = [];
  const scatter = (idx: number, total: number): { dx: number; dy: number } => {
    const angle = (idx / Math.max(1, total)) * Math.PI * 2 + rng() * 0.5;
    const dist = 24 + rng() * 20;
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
  };

  if (crateKind === 'med_crate') {
    const p1 = scatter(0, 2);
    const p2 = scatter(1, 2);
    drops.push({
      id: `${idPrefix}-med`,
      x: x + p1.dx,
      y: y + p1.dy,
      kind: 'medkit',
      rarity: 'uncommon',
      amount: 1,
      spawnedAtMs: now,
    });
    drops.push({
      id: `${idPrefix}-arm`,
      x: x + p2.dx,
      y: y + p2.dy,
      kind: 'armor',
      rarity: rng() < 0.35 ? 'rare' : 'uncommon',
      armorValue: rng() < 0.35 ? 60 : 35,
      spawnedAtMs: now,
    });
    return drops;
  }

  if (crateKind === 'supply_drop') {
    const legendaryWeapons: WeaponId[] = ['plasma', 'sniper', 'rifle', 'shotgun'];
    const weaponId = legendaryWeapons[Math.floor(rng() * legendaryWeapons.length)];
    const rarity: Rarity = rng() < 0.72 ? 'legendary' : 'epic';
    const wDef = WEAPONS[weaponId];

    const items: Array<Omit<LootDrop, 'id' | 'x' | 'y' | 'spawnedAtMs'>> = [
      { kind: 'weapon', weaponId, rarity },
      { kind: 'ammo', ammoType: wDef.ammoType, amount: getAmmoBundleAmount(wDef.ammoType) * 2, rarity },
      { kind: 'armor', armorValue: 100, rarity: 'legendary' },
      { kind: 'medkit', amount: 2, rarity: 'rare' },
      { kind: 'grenade', amount: 2, rarity: 'epic' },
    ];

    items.forEach((item, idx) => {
      const s = scatter(idx, items.length);
      drops.push({
        id: `${idPrefix}-${idx}`,
        x: x + s.dx,
        y: y + s.dy,
        spawnedAtMs: now,
        ...item,
      });
    });
    return drops;
  }

  if (crateKind === 'military_case') {
    const pool: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper'];
    const weaponId = pool[Math.floor(rng() * pool.length)];
    const rRoll = rng();
    const rarity: Rarity = rRoll < 0.25 ? 'epic' : rRoll < 0.75 ? 'rare' : 'uncommon';
    const wDef = WEAPONS[weaponId];

    const items: Array<Omit<LootDrop, 'id' | 'x' | 'y' | 'spawnedAtMs'>> = [
      { kind: 'weapon', weaponId, rarity },
      { kind: 'ammo', ammoType: wDef.ammoType, amount: getAmmoBundleAmount(wDef.ammoType), rarity },
      rng() < 0.65
        ? { kind: 'armor', armorValue: rarity === 'epic' ? 75 : 50, rarity }
        : { kind: 'grenade', amount: 1, rarity: 'rare' },
    ];

    items.forEach((item, idx) => {
      const s = scatter(idx, items.length);
      drops.push({
        id: `${idPrefix}-${idx}`,
        x: x + s.dx,
        y: y + s.dy,
        spawnedAtMs: now,
        ...item,
      });
    });
    return drops;
  }

  // Standard wood_crate
  const pool: WeaponId[] = ['smg', 'shotgun', 'rifle', 'pistol', 'sniper'];
  const weaponId = pool[Math.floor(rng() * pool.length)];
  const rRoll = rng();
  const rarity: Rarity = rRoll < 0.16 ? 'rare' : rRoll < 0.56 ? 'uncommon' : 'common';
  const wDef = WEAPONS[weaponId];

  const items: Array<Omit<LootDrop, 'id' | 'x' | 'y' | 'spawnedAtMs'>> = [
    { kind: 'weapon', weaponId, rarity },
    { kind: 'ammo', ammoType: wDef.ammoType, amount: getAmmoBundleAmount(wDef.ammoType), rarity },
    rng() < 0.45
      ? { kind: 'medkit', amount: 1, rarity: 'common' }
      : { kind: 'armor', armorValue: 35, rarity: 'uncommon' },
  ];

  items.forEach((item, idx) => {
    const s = scatter(idx, items.length);
    drops.push({
      id: `${idPrefix}-${idx}`,
      x: x + s.dx,
      y: y + s.dy,
      spawnedAtMs: now,
      ...item,
    });
  });

  return drops;
}
