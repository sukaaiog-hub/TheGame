import { getActiveWeapon, type FighterInput } from './combat';
import { WEAPONS } from './weapons';
import { raycastWalls } from './world';
import type { BuiltWorld, FighterState, LootDrop, StormState } from './types';

export function computeAiFighterInput(
  bot: FighterState,
  fighters: FighterState[],
  world: BuiltWorld,
  drops: LootDrop[],
  storm: StormState,
  nowMs: number
): FighterInput {
  if (!bot.alive) {
    return {
      moveX: 0,
      moveY: 0,
      aimAngle: bot.aimAngle,
      firing: false,
      dash: false,
      reload: false,
      interact: false,
      heal: false,
      throwGrenade: false,
      switchSlot: null,
    };
  }

  const activeWeapon = getActiveWeapon(bot);
  const wDef = activeWeapon ? WEAPONS[activeWeapon.weaponId] : WEAPONS.pistol;

  // Find closest visible living enemy
  let nearestEnemy: FighterState | null = null;
  let nearestEnemyDist = Infinity;
  let visibleEnemy: FighterState | null = null;
  let visibleEnemyDist = Infinity;

  for (const other of fighters) {
    if (!other.alive || other.id === bot.id || other.teamIndex === bot.teamIndex) continue;
    const d = Math.hypot(other.x - bot.x, other.y - bot.y);
    if (d < nearestEnemyDist) {
      nearestEnemyDist = d;
      nearestEnemy = other;
    }
    if (d < 850) {
      const los = raycastWalls(world, bot.x, bot.y, other.x, other.y);
      if (!los.hit && d < visibleEnemyDist) {
        visibleEnemyDist = d;
        visibleEnemy = other;
      }
    }
  }

  // Storm safety priority
  const distToStormCenter = Math.hypot(bot.x - storm.centerX, bot.y - storm.centerY);
  const outsideOrNearStorm = distToStormCenter > storm.currentRadius * 0.84;

  // Heal if damaged behind cover
  const shouldHeal =
    bot.medkits > 0 &&
    bot.hp < 52 &&
    bot.healingUntilMs === 0 &&
    (!visibleEnemy || visibleEnemyDist > 340);

  // Switch to better gun if holding starter pistol while owning another weapon
  let switchSlot: 0 | 1 | 'toggle' | null = null;
  if (
    bot.activeSlot === 0 &&
    bot.weapons[0]?.weaponId === 'pistol' &&
    bot.weapons[1] !== null
  ) {
    switchSlot = 1;
  }

  // Determine navigation goal
  let moveX = 0;
  let moveY = 0;
  let aimAngle = bot.aimAngle;
  let firing = false;
  let dash = false;
  let throwGrenade = false;
  let interact = false;

  if (outsideOrNearStorm) {
    const dx = storm.centerX - bot.x;
    const dy = storm.centerY - bot.y;
    const len = Math.hypot(dx, dy) || 1;
    moveX = dx / len;
    moveY = dy / len;
    aimAngle = Math.atan2(moveY, moveX);
    if (distToStormCenter > storm.currentRadius && nowMs >= bot.dashCooldownUntilMs) {
      dash = true;
    }
  } else if (visibleEnemy) {
    const dx = visibleEnemy.x - bot.x;
    const dy = visibleEnemy.y - bot.y;
    const d = Math.hypot(dx, dy) || 1;
    // Slight predictive aim lead
    const leadT = Math.min(0.28, d / wDef.bulletSpeed);
    const tx = visibleEnemy.x + visibleEnemy.vx * leadT;
    const ty = visibleEnemy.y + visibleEnemy.vy * leadT;
    aimAngle = Math.atan2(ty - bot.y, tx - bot.x);

    const idealRange =
      wDef.id === 'shotgun' ? 190 : wDef.id === 'sniper' ? 520 : 310;
    const radialPush = d > idealRange + 70 ? 0.8 : d < idealRange - 70 ? -0.75 : 0;

    if (nowMs >= bot.aiNextDecisionAtMs) {
      bot.aiStrafeSign = Math.random() < 0.5 ? 1 : -1;
      bot.aiNextDecisionAtMs = nowMs + 800 + Math.random() * 900;
    }

    const ux = dx / d;
    const uy = dy / d;
    const px = -uy * bot.aiStrafeSign;
    const py = ux * bot.aiStrafeSign;
    moveX = ux * radialPush + px * 0.85;
    moveY = uy * radialPush + py * 0.85;

    if (d <= wDef.range * 0.92 && bot.healingUntilMs === 0) {
      firing = true;
    }
    if (d > 220 && d < 420 && bot.grenades > 0 && Math.random() < 0.008) {
      throwGrenade = true;
    }
    if (bot.hp < 45 && nowMs >= bot.dashCooldownUntilMs && Math.random() < 0.04) {
      dash = true;
    }
  } else {
    // Scavenge loot drops or unopened crates, or hunt nearest enemy
    const hasOnlyPistol = bot.weapons[1] === null && bot.weapons[0]?.weaponId === 'pistol';
    let targetX = bot.aiGoalX;
    let targetY = bot.aiGoalY;
    let foundInterest = false;

    // 1. Grab nearby ground weapon/armor/med drops
    let bestDropDist = 420;
    for (const drop of drops) {
      if (drop.kind === 'weapon' || drop.kind === 'armor' || drop.kind === 'medkit') {
        const d = Math.hypot(drop.x - bot.x, drop.y - bot.y);
        if (d < bestDropDist) {
          bestDropDist = d;
          targetX = drop.x;
          targetY = drop.y;
          foundInterest = true;
          if (d < 44) interact = true;
        }
      }
    }

    // 2. Crack open nearby crates if under-geared
    if (!foundInterest && (hasOnlyPistol || bot.armor < 50)) {
      let bestCrateDist = 520;
      for (const c of world.crates) {
        if (c.opened) continue;
        const d = Math.hypot(c.x - bot.x, c.y - bot.y);
        if (d < bestCrateDist) {
          bestCrateDist = d;
          targetX = c.x;
          targetY = c.y;
          foundInterest = true;
          if (d < 62) {
            interact = true;
          } else if (d < 220) {
            const los = raycastWalls(world, bot.x, bot.y, c.x, c.y);
            if (!los.hit) {
              aimAngle = Math.atan2(c.y - bot.y, c.x - bot.x);
              firing = true;
            }
          }
        }
      }
    }

    // 3. Otherwise patrol toward nearest rival or storm center
    if (!foundInterest) {
      if (nearestEnemy && nearestEnemyDist < 950) {
        targetX = nearestEnemy.x;
        targetY = nearestEnemy.y;
      } else if (nowMs >= bot.aiNextDecisionAtMs || Math.hypot(bot.aiGoalX - bot.x, bot.aiGoalY - bot.y) < 55) {
        bot.aiGoalX = storm.centerX + (Math.random() - 0.5) * storm.currentRadius * 0.85;
        bot.aiGoalY = storm.centerY + (Math.random() - 0.5) * storm.currentRadius * 0.85;
        bot.aiNextDecisionAtMs = nowMs + 2200;
        targetX = bot.aiGoalX;
        targetY = bot.aiGoalY;
      }
    }

    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 24) {
      moveX = dx / d;
      moveY = dy / d;
      if (!firing) aimAngle = Math.atan2(moveY, moveX);
    }
  }

  return {
    moveX,
    moveY,
    aimAngle,
    firing,
    dash,
    reload: false,
    interact,
    heal: shouldHeal,
    throwGrenade,
    switchSlot,
  };
}
