import {
  createWeaponInstance,
  DEFAULT_RESERVE_AMMO,
  getScaledWeaponDamage,
  RARITY_META,
  rollCrateDrops,
  WEAPONS,
} from './weapons';
import { raycastWalls, resolveCircleVsWorld, segmentIntersectsRect } from './world';
import type {
  BuiltWorld,
  BulletEntity,
  FighterState,
  GrenadeEntity,
  LootCrate,
  LootDrop,
  OperatorId,
  StormState,
  WeaponId,
} from './types';

export interface CreateFighterParams {
  id: string;
  seatIndex: number;
  teamIndex: number;
  nickname: string;
  operatorId: OperatorId;
  isLocal: boolean;
  isAi: boolean;
  isHost: boolean;
  spawnX: number;
  spawnY: number;
}

export interface FighterInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  firing: boolean;
  dash: boolean;
  reload: boolean;
  interact: boolean;
  heal: boolean;
  throwGrenade: boolean;
  switchSlot: 0 | 1 | 'toggle' | null;
}

export function createInitialFighter(params: CreateFighterParams): FighterState {
  return {
    id: params.id,
    seatIndex: params.seatIndex,
    teamIndex: params.teamIndex,
    nickname: params.nickname,
    operatorId: params.operatorId,
    isLocal: params.isLocal,
    isAi: params.isAi,
    isHost: params.isHost,

    x: params.spawnX,
    y: params.spawnY,
    vx: 0,
    vy: 0,
    aimAngle: -Math.PI / 2,
    radius: 19,

    hp: 100,
    maxHp: 100,
    armor: 25,
    maxArmor: 100,
    alive: true,
    eliminatedAtMs: null,
    placement: null,
    kills: 0,
    damageDealt: 0,

    weapons: [createWeaponInstance('pistol', 'common'), null],
    activeSlot: 0,
    reserveAmmo: { ...DEFAULT_RESERVE_AMMO },
    medkits: 1,
    grenades: 1,

    reloadingUntilMs: 0,
    healingUntilMs: 0,
    lastShotAtMs: 0,
    dashCooldownUntilMs: 0,
    dashingUntilMs: 0,
    dashDirX: 0,
    dashDirY: 0,
    muzzleFlashUntilMs: 0,
    hitFlashUntilMs: 0,
    walkPhase: 0,
    recoilOffset: 0,

    aiGoalX: params.spawnX,
    aiGoalY: params.spawnY,
    aiNextDecisionAtMs: 0,
    aiStrafeSign: params.seatIndex % 2 === 0 ? 1 : -1,

    lastPacketSeq: 0,
    lastUpdatedAt: Date.now(),
  };
}

export function getActiveWeapon(fighter: FighterState) {
  return fighter.weapons[fighter.activeSlot] ?? fighter.weapons[0] ?? fighter.weapons[1];
}

export function finishReloadIfReady(fighter: FighterState, nowMs: number): boolean {
  if (fighter.reloadingUntilMs <= 0 || nowMs < fighter.reloadingUntilMs) return false;
  fighter.reloadingUntilMs = 0;

  const slot = fighter.weapons[fighter.activeSlot];
  if (!slot) return false;

  const wDef = WEAPONS[slot.weaponId];
  const needed = Math.max(0, wDef.magSize - slot.magAmmo);
  const avail = fighter.reserveAmmo[wDef.ammoType];
  const take = Math.min(needed, avail);
  slot.magAmmo += take;
  fighter.reserveAmmo[wDef.ammoType] -= take;
  return take > 0;
}

export function finishHealIfReady(fighter: FighterState, nowMs: number): boolean {
  if (fighter.healingUntilMs <= 0 || nowMs < fighter.healingUntilMs) return false;
  fighter.healingUntilMs = 0;
  if (fighter.medkits <= 0 || !fighter.alive) return false;
  fighter.medkits -= 1;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + 55);
  return true;
}

export function stepFighterMovement(
  fighter: FighterState,
  input: FighterInput,
  world: BuiltWorld,
  storm: StormState,
  dt: number,
  nowMs: number,
  canAct: boolean
): {
  dashed: boolean;
  reloaded: boolean;
  healed: boolean;
  stormDamaged: boolean;
} {
  if (!fighter.alive) {
    return { dashed: false, reloaded: false, healed: false, stormDamaged: false };
  }

  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  fighter.recoilOffset = Math.max(0, fighter.recoilOffset - clampedDt * 24);

  const reloaded = finishReloadIfReady(fighter, nowMs);
  const healed = finishHealIfReady(fighter, nowMs);

  // Switch active weapon slot
  if (canAct && input.switchSlot !== null) {
    const nextSlot: 0 | 1 =
      input.switchSlot === 'toggle'
        ? fighter.activeSlot === 0
          ? 1
          : 0
        : input.switchSlot;
    if (nextSlot !== fighter.activeSlot && fighter.weapons[nextSlot]) {
      fighter.activeSlot = nextSlot;
      fighter.reloadingUntilMs = 0;
    }
  }

  // Trigger reload
  if (canAct && input.reload && fighter.reloadingUntilMs === 0) {
    const slot = getActiveWeapon(fighter);
    if (slot) {
      const def = WEAPONS[slot.weaponId];
      if (slot.magAmmo < def.magSize && fighter.reserveAmmo[def.ammoType] > 0) {
        fighter.reloadingUntilMs = nowMs + def.reloadMs;
        fighter.healingUntilMs = 0;
      }
    }
  }

  // Trigger medkit healing
  if (canAct && input.heal && fighter.healingUntilMs === 0 && fighter.medkits > 0 && fighter.hp < fighter.maxHp) {
    fighter.healingUntilMs = nowMs + 1600;
  }

  fighter.aimAngle = input.aimAngle;

  if (!canAct) {
    fighter.vx = 0;
    fighter.vy = 0;
    return { dashed: false, reloaded, healed, stormDamaged: false };
  }

  let mx = input.moveX;
  let my = input.moveY;
  const mLen = Math.hypot(mx, my);
  if (mLen > 0.001) {
    mx /= mLen;
    my /= mLen;
  }

  let dashed = false;
  if (input.dash && nowMs >= fighter.dashCooldownUntilMs && nowMs >= fighter.dashingUntilMs) {
    const dx = mLen > 0.1 ? mx : Math.cos(fighter.aimAngle);
    const dy = mLen > 0.1 ? my : Math.sin(fighter.aimAngle);
    fighter.dashDirX = dx;
    fighter.dashDirY = dy;
    fighter.dashingUntilMs = nowMs + 175;
    fighter.dashCooldownUntilMs = nowMs + 2200;
    fighter.healingUntilMs = 0;
    dashed = true;
  }

  const baseSpeed = 272;
  const weaponMod = getActiveWeapon(fighter)?.weaponId === 'sniper' ? 0.92 : 1.0;
  const healSlow = fighter.healingUntilMs > 0 ? 0.55 : 1.0;

  if (nowMs < fighter.dashingUntilMs) {
    fighter.vx = fighter.dashDirX * 670;
    fighter.vy = fighter.dashDirY * 670;
  } else {
    const targetVx = mx * baseSpeed * weaponMod * healSlow;
    const targetVy = my * baseSpeed * weaponMod * healSlow;
    const alpha = Math.min(1, clampedDt * 18);
    fighter.vx += (targetVx - fighter.vx) * alpha;
    fighter.vy += (targetVy - fighter.vy) * alpha;
  }

  const nextX = fighter.x + fighter.vx * clampedDt;
  const nextY = fighter.y + fighter.vy * clampedDt;
  const resolved = resolveCircleVsWorld(world, nextX, nextY, fighter.radius);
  fighter.x = resolved.x;
  fighter.y = resolved.y;

  const speed = Math.hypot(fighter.vx, fighter.vy);
  if (speed > 20) {
    fighter.walkPhase += speed * clampedDt * 0.055;
  }

  // Storm damage outside safe zone
  let stormDamaged = false;
  const distToStormCenter = Math.hypot(fighter.x - storm.centerX, fighter.y - storm.centerY);
  if (distToStormCenter > storm.currentRadius) {
    fighter.hp -= storm.damagePerSecond * clampedDt;
    stormDamaged = true;
    if (fighter.hp <= 0) {
      fighter.hp = 0;
      fighter.alive = false;
      fighter.eliminatedAtMs = nowMs;
    }
  }

  return { dashed, reloaded, healed, stormDamaged };
}

export function tryFireWeapon(
  fighter: FighterState,
  nowMs: number,
  rng: () => number = Math.random
): {
  bullets: BulletEntity[];
  firedWeaponId: WeaponId | null;
  startedAutoReload: boolean;
} {
  if (!fighter.alive) {
    return { bullets: [], firedWeaponId: null, startedAutoReload: false };
  }

  const slot = getActiveWeapon(fighter);
  if (!slot) {
    return { bullets: [], firedWeaponId: null, startedAutoReload: false };
  }

  const wDef = WEAPONS[slot.weaponId];

  // Auto-reload if empty
  if (slot.magAmmo <= 0) {
    if (fighter.reloadingUntilMs === 0 && fighter.reserveAmmo[wDef.ammoType] > 0) {
      fighter.reloadingUntilMs = nowMs + wDef.reloadMs;
      fighter.healingUntilMs = 0;
      return { bullets: [], firedWeaponId: null, startedAutoReload: true };
    }
    return { bullets: [], firedWeaponId: null, startedAutoReload: false };
  }

  if (fighter.reloadingUntilMs > 0 || nowMs - fighter.lastShotAtMs < wDef.fireRateMs) {
    return { bullets: [], firedWeaponId: null, startedAutoReload: false };
  }

  // Cancel healing on shot
  fighter.healingUntilMs = 0;
  fighter.lastShotAtMs = nowMs;
  fighter.muzzleFlashUntilMs = nowMs + 60;
  fighter.recoilOffset = Math.min(10, fighter.recoilOffset + wDef.recoilKick);
  slot.magAmmo -= 1;

  const damagePerPellet = getScaledWeaponDamage(slot.weaponId, slot.rarity);
  const muzzleX = fighter.x + Math.cos(fighter.aimAngle) * wDef.barrelLength;
  const muzzleY = fighter.y + Math.sin(fighter.aimAngle) * wDef.barrelLength;
  const bullets: BulletEntity[] = [];

  for (let i = 0; i < wDef.pellets; i++) {
    const jitter = (rng() - 0.5) * 2 * wDef.spreadRad;
    const angle = fighter.aimAngle + jitter;
    bullets.push({
      id: `b-${fighter.id}-${nowMs}-${i}-${Math.floor(rng() * 9999)}`,
      ownerId: fighter.id,
      teamIndex: fighter.teamIndex,
      weaponId: slot.weaponId,
      rarity: slot.rarity,
      x: muzzleX,
      y: muzzleY,
      prevX: fighter.x,
      prevY: fighter.y,
      vx: Math.cos(angle) * wDef.bulletSpeed,
      vy: Math.sin(angle) * wDef.bulletSpeed,
      damage: damagePerPellet,
      armorPenetration: wDef.armorPenetration,
      distanceTraveled: 0,
      maxRange: wDef.range,
      color: wDef.tracerColor,
    });
  }

  // Trigger auto-reload on last bullet
  let startedAutoReload = false;
  if (slot.magAmmo === 0 && fighter.reserveAmmo[wDef.ammoType] > 0) {
    fighter.reloadingUntilMs = nowMs + wDef.reloadMs;
    startedAutoReload = true;
  }

  return { bullets, firedWeaponId: slot.weaponId, startedAutoReload };
}

export function applyDamageToFighter(
  target: FighterState,
  rawDamage: number,
  armorPenetration: number,
  nowMs: number
): { hpLost: number; armorLost: number; totalShown: number; eliminated: boolean } {
  if (!target.alive) {
    return { hpLost: 0, armorLost: 0, totalShown: 0, eliminated: false };
  }

  let armorLost = 0;
  let hpLost = rawDamage;

  if (target.armor > 0) {
    const absorbRatio = Math.max(0.25, 0.72 - armorPenetration * 0.45);
    const maxAbsorb = rawDamage * absorbRatio;
    armorLost = Math.min(target.armor, maxAbsorb);
    target.armor -= armorLost;
    hpLost = rawDamage - armorLost;
  }

  hpLost = Math.max(1, Math.round(hpLost));
  target.hp = Math.max(0, target.hp - hpLost);
  target.hitFlashUntilMs = nowMs + 110;

  let eliminated = false;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.eliminatedAtMs = nowMs;
    eliminated = true;
  }

  return {
    hpLost,
    armorLost: Math.round(armorLost),
    totalShown: Math.round(hpLost + armorLost),
    eliminated,
  };
}

export function stepBullets(
  bullets: BulletEntity[],
  fighters: FighterState[],
  world: BuiltWorld,
  dt: number,
  nowMs: number
): {
  wallImpacts: Array<{ x: number; y: number; color: string }>;
  crateDamages: Array<{ crate: LootCrate; ownerId: string; broken: boolean; hitX: number; hitY: number }>;
  fighterHits: Array<{ bullet: BulletEntity; target: FighterState; hitX: number; hitY: number }>;
} {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  const wallImpacts: Array<{ x: number; y: number; color: string }> = [];
  const crateDamages: Array<{ crate: LootCrate; ownerId: string; broken: boolean; hitX: number; hitY: number }> = [];
  const fighterHits: Array<{ bullet: BulletEntity; target: FighterState; hitX: number; hitY: number }> = [];

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.prevX = b.x;
    b.prevY = b.y;
    const stepX = b.vx * clampedDt;
    const stepY = b.vy * clampedDt;
    const nextX = b.x + stepX;
    const nextY = b.y + stepY;

    // 1. Check solid walls
    const wallHit = raycastWalls(world, b.prevX, b.prevY, nextX, nextY);
    let maxT = wallHit.hit ? wallHit.t : 1;

    // 2. Check unopened loot crates (destructible!)
    let hitCrate: LootCrate | null = null;
    let crateHitX = nextX;
    let crateHitY = nextY;
    for (const c of world.crates) {
      if (c.opened) continue;
      const half = c.kind === 'supply_drop' ? 24 : 20;
      const cRes = segmentIntersectsRect(b.prevX, b.prevY, nextX, nextY, c.x - half, c.y - half, half * 2, half * 2);
      if (cRes.hit && cRes.t < maxT) {
        maxT = cRes.t;
        hitCrate = c;
        crateHitX = cRes.hitX;
        crateHitY = cRes.hitY;
      }
    }

    // 3. Check enemy fighters along segment
    let hitTarget: FighterState | null = null;
    let targetHitX = nextX;
    let targetHitY = nextY;
    for (const f of fighters) {
      if (!f.alive || f.id === b.ownerId || f.teamIndex === b.teamIndex) continue;
      const hitRes = segmentIntersectsRect(
        b.prevX,
        b.prevY,
        nextX,
        nextY,
        f.x - f.radius,
        f.y - f.radius,
        f.radius * 2,
        f.radius * 2
      );
      if (hitRes.hit && hitRes.t < maxT) {
        maxT = hitRes.t;
        hitTarget = f;
        hitCrate = null;
        targetHitX = hitRes.hitX;
        targetHitY = hitRes.hitY;
      }
    }

    if (hitTarget) {
      fighterHits.push({ bullet: b, target: hitTarget, hitX: targetHitX, hitY: targetHitY });
      bullets.splice(i, 1);
      continue;
    }

    if (hitCrate) {
      hitCrate.hp = Math.max(0, hitCrate.hp - b.damage);
      hitCrate.hitFlashUntilMs = nowMs + 85;
      crateDamages.push({
        crate: hitCrate,
        ownerId: b.ownerId,
        broken: hitCrate.hp <= 0,
        hitX: crateHitX,
        hitY: crateHitY,
      });
      bullets.splice(i, 1);
      continue;
    }

    if (wallHit.hit) {
      wallImpacts.push({ x: wallHit.hitX, y: wallHit.hitY, color: b.color });
      bullets.splice(i, 1);
      continue;
    }

    b.x = nextX;
    b.y = nextY;
    b.distanceTraveled += Math.hypot(stepX, stepY);
    if (b.distanceTraveled >= b.maxRange) {
      bullets.splice(i, 1);
    }
  }

  return { wallImpacts, crateDamages, fighterHits };
}

export function tryThrowGrenade(
  fighter: FighterState,
  nowMs: number,
  rng: () => number = Math.random
): GrenadeEntity | null {
  if (!fighter.alive || fighter.grenades <= 0) return null;
  fighter.grenades -= 1;
  const speed = 510;
  return {
    id: `g-${fighter.id}-${nowMs}-${Math.floor(rng() * 9999)}`,
    ownerId: fighter.id,
    teamIndex: fighter.teamIndex,
    x: fighter.x + Math.cos(fighter.aimAngle) * 22,
    y: fighter.y + Math.sin(fighter.aimAngle) * 22,
    vx: Math.cos(fighter.aimAngle) * speed,
    vy: Math.sin(fighter.aimAngle) * speed,
    explodeAtMs: nowMs + 1350,
    exploded: false,
  };
}

export function stepGrenades(
  grenades: GrenadeEntity[],
  fighters: FighterState[],
  world: BuiltWorld,
  dt: number,
  nowMs: number
): {
  explosions: Array<{
    x: number;
    y: number;
    ownerId: string;
    hits: Array<{ target: FighterState; damage: number }>;
    brokenCrates: LootCrate[];
  }>;
} {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  const explosions: Array<{
    x: number;
    y: number;
    ownerId: string;
    hits: Array<{ target: FighterState; damage: number }>;
    brokenCrates: LootCrate[];
  }> = [];

  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    const drag = Math.pow(0.14, clampedDt);
    g.vx *= drag;
    g.vy *= drag;

    const nx = g.x + g.vx * clampedDt;
    const ny = g.y + g.vy * clampedDt;
    const wallHit = raycastWalls(world, g.x, g.y, nx, ny);
    if (wallHit.hit) {
      g.vx *= -0.55;
      g.vy *= -0.55;
    } else {
      const clamped = resolveCircleVsWorld(world, nx, ny, 7);
      g.x = clamped.x;
      g.y = clamped.y;
    }

    if (nowMs >= g.explodeAtMs && !g.exploded) {
      g.exploded = true;
      const radius = 175;
      const hits: Array<{ target: FighterState; damage: number }> = [];
      for (const f of fighters) {
        if (!f.alive) continue;
        if (f.teamIndex === g.teamIndex && f.id !== g.ownerId) continue;
        const d = Math.hypot(f.x - g.x, f.y - g.y);
        if (d <= radius) {
          const dmg = Math.round(92 * (1 - d / (radius * 1.2)));
          if (dmg > 0) hits.push({ target: f, damage: dmg });
        }
      }
      const brokenCrates: LootCrate[] = [];
      for (const c of world.crates) {
        if (c.opened) continue;
        if (Math.hypot(c.x - g.x, c.y - g.y) <= radius * 0.85) {
          c.hp = 0;
          brokenCrates.push(c);
        }
      }
      explosions.push({ x: g.x, y: g.y, ownerId: g.ownerId, hits, brokenCrates });
      grenades.splice(i, 1);
    }
  }

  return { explosions };
}

export function openCrateToDrops(
  crate: LootCrate,
  rng: () => number = Math.random
): LootDrop[] {
  if (crate.opened) return [];
  crate.opened = true;
  crate.hp = 0;
  return rollCrateDrops(crate.kind, crate.x, crate.y, rng, `drop-${crate.id}`);
}

export function tryPickupLootDrop(
  fighter: FighterState,
  drop: LootDrop,
  explicitSwap: boolean
): { picked: boolean; label: string } {
  if (!fighter.alive) return { picked: false, label: '' };

  if (drop.kind === 'ammo' && drop.ammoType && drop.amount) {
    fighter.reserveAmmo[drop.ammoType] += drop.amount;
    return { picked: true, label: `+${drop.amount} ${drop.ammoType.toUpperCase()}` };
  }

  if (drop.kind === 'medkit') {
    if (fighter.medkits >= 4) return { picked: false, label: '' };
    fighter.medkits += drop.amount ?? 1;
    return { picked: true, label: '+1 MEDKIT' };
  }

  if (drop.kind === 'grenade') {
    if (fighter.grenades >= 4) return { picked: false, label: '' };
    fighter.grenades += drop.amount ?? 1;
    return { picked: true, label: '+1 GRENADE' };
  }

  if (drop.kind === 'armor' && drop.armorValue) {
    if (fighter.armor >= fighter.maxArmor) return { picked: false, label: '' };
    const nextArmor = Math.min(fighter.maxArmor, fighter.armor + drop.armorValue);
    if (nextArmor <= fighter.armor) return { picked: false, label: '' };
    fighter.armor = nextArmor;
    return { picked: true, label: `+${drop.armorValue} ARMOR` };
  }

  if (drop.kind === 'weapon' && drop.weaponId) {
    const newWeapon = createWeaponInstance(drop.weaponId, drop.rarity);
    const wDef = WEAPONS[drop.weaponId];

    // If fighter already owns same weapon of equal/higher rarity, top up ammo on explicit pickup
    const sameIdx = fighter.weapons.findIndex((w) => w?.weaponId === drop.weaponId);
    if (sameIdx !== -1) {
      const existing = fighter.weapons[sameIdx]!;
      if (RARITY_META[drop.rarity].rank > RARITY_META[existing.rarity].rank) {
        fighter.weapons[sameIdx] = newWeapon;
        return { picked: true, label: `${RARITY_META[drop.rarity].label.toUpperCase()} ${wDef.shortName}` };
      }
      if (explicitSwap) {
        fighter.reserveAmmo[wDef.ammoType] += Math.ceil(wDef.magSize * 0.75);
        return { picked: true, label: `+AMMO (${wDef.shortName})` };
      }
      return { picked: false, label: '' };
    }

    // Auto-fill empty slot #1 cleanly
    if (fighter.weapons[1] === null) {
      fighter.weapons[1] = newWeapon;
      fighter.activeSlot = 1;
      fighter.reloadingUntilMs = 0;
      return { picked: true, label: `${RARITY_META[drop.rarity].label.toUpperCase()} ${wDef.shortName}` };
    }

    // Auto-upgrade starter pistol in slot 0 when running over a better gun
    if (fighter.weapons[0]?.weaponId === 'pistol' && drop.weaponId !== 'pistol') {
      fighter.weapons[0] = newWeapon;
      fighter.activeSlot = 0;
      fighter.reloadingUntilMs = 0;
      return { picked: true, label: `${RARITY_META[drop.rarity].label.toUpperCase()} ${wDef.shortName}` };
    }

    // Explicit pickup [E/F] swaps active slot
    if (explicitSwap) {
      fighter.weapons[fighter.activeSlot] = newWeapon;
      fighter.reloadingUntilMs = 0;
      return { picked: true, label: `${RARITY_META[drop.rarity].label.toUpperCase()} ${wDef.shortName}` };
    }
  }

  return { picked: false, label: '' };
}

export function spawnDeathLootStash(
  victim: FighterState,
  rng: () => number = Math.random
): LootDrop[] {
  const drops: LootDrop[] = [];
  const now = Date.now();
  const baseId = `death-${victim.id}-${now}`;

  // Drop victim's non-pistol best gun + armor plate + medkit + ammo
  const bestGun =
    victim.weapons.find((w) => w && w.weaponId !== 'pistol') ?? victim.weapons[0];
  if (bestGun) {
    const ang = rng() * Math.PI * 2;
    drops.push({
      id: `${baseId}-w`,
      x: victim.x + Math.cos(ang) * 20,
      y: victim.y + Math.sin(ang) * 20,
      kind: 'weapon',
      rarity: bestGun.rarity,
      weaponId: bestGun.weaponId,
      spawnedAtMs: now,
    });
    drops.push({
      id: `${baseId}-a`,
      x: victim.x - Math.cos(ang) * 22,
      y: victim.y - Math.sin(ang) * 22,
      kind: 'ammo',
      rarity: 'uncommon',
      ammoType: WEAPONS[bestGun.weaponId].ammoType,
      amount: 28,
      spawnedAtMs: now,
    });
  }

  drops.push({
    id: `${baseId}-med`,
    x: victim.x + 14,
    y: victim.y - 24,
    kind: 'medkit',
    rarity: 'rare',
    amount: 1,
    spawnedAtMs: now,
  });

  return drops;
}
