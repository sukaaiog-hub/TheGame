import { describe, expect, it } from 'vitest';
import {
  applyDamageToFighter,
  createInitialFighter,
  openCrateToDrops,
  stepBullets,
  stepFighterMovement,
  stepGrenades,
  tryFireWeapon,
  tryPickupLootDrop,
  tryThrowGrenade,
} from '@/game/combat';
import { WEAPONS } from '@/game/weapons';
import {
  buildWorldFromSeed,
  getSafeDropSpawns,
  getStormStateAt,
  raycastWalls,
  resolveCircleVsWorld,
} from '@/game/world';

describe('Battle Royale Deterministic World & Collisions', () => {
  it('builds identical buildings, walls, trees, and loot crates from the same seed', () => {
    const w1 = buildWorldFromSeed('verdan_valley', 424242);
    const w2 = buildWorldFromSeed('verdan_valley', 424242);
    const w3 = buildWorldFromSeed('rust_refinery', 99999);

    expect(w1.buildings.length).toBeGreaterThanOrEqual(9);
    expect(w1.crates.length).toBeGreaterThanOrEqual(25);
    expect(w1.crates[0]).toEqual(w2.crates[0]);
    expect(w1.walls.length).toBe(w2.walls.length);
    expect(w3.def.id).toBe('rust_refinery');
  });

  it('resolves wall collisions cleanly while allowing safe spawn points', () => {
    const world = buildWorldFromSeed('arctic_outpost', 777);
    const spawns = getSafeDropSpawns(world, 12, 0);
    expect(spawns.length).toBe(12);

    for (const sp of spawns) {
      const clamped = resolveCircleVsWorld(world, sp.x, sp.y, 19);
      expect(Math.hypot(clamped.x - sp.x, clamped.y - sp.y)).toBeLessThan(0.5);
    }

    // Raycast against central building north wall must stop the ray
    const centerB = world.buildings[0];
    const hit = raycastWalls(world, centerB.x + 20, centerB.y - 60, centerB.x + 20, centerB.y + 60);
    expect(hit.hit).toBe(true);
    expect(hit.hitY).toBeLessThanOrEqual(centerB.y + 20);
  });

  it('shrinks the storm circle deterministically across 4 phases', () => {
    const world = buildWorldFromSeed('verdan_valley', 12345);
    const early = getStormStateAt(5000, world);
    const mid = getStormStateAt(85000, world);
    const late = getStormStateAt(150000, world);

    expect(early.phase).toBe(1);
    expect(early.shrinking).toBe(false);
    expect(mid.currentRadius).toBeLessThan(early.currentRadius);
    expect(late.currentRadius).toBeLessThan(mid.currentRadius);
    expect(late.damagePerSecond).toBeGreaterThan(early.damagePerSecond);
  });
});

describe('Combat, Weapons, Crates, Grenades & Loot', () => {
  it('fires 7 pellets from a shotgun, breaks loot crates, and equips loot drops', () => {
    const world = buildWorldFromSeed('verdan_valley', 555);
    const shooter = createInitialFighter({
      id: 'p1',
      seatIndex: 0,
      teamIndex: 0,
      nickname: 'Alpha',
      operatorId: 'vanguard',
      isLocal: true,
      isAi: false,
      isHost: true,
      spawnX: 1400,
      spawnY: 1400,
    });

    // Pick up rare shotgun drop into slot 1
    const shotgunPick = tryPickupLootDrop(
      shooter,
      {
        id: 'd1',
        x: 1400,
        y: 1400,
        kind: 'weapon',
        rarity: 'rare',
        weaponId: 'shotgun',
        spawnedAtMs: 1000,
      },
      false
    );
    expect(shotgunPick.picked).toBe(true);
    expect(shooter.activeSlot).toBe(1);

    const fire = tryFireWeapon(shooter, 2000);
    expect(fire.firedWeaponId).toBe('shotgun');
    expect(fire.bullets.length).toBe(WEAPONS.shotgun.pellets);

    // Open a military crate and verify rare/epic drops
    const milCrate = world.crates.find((c) => c.kind === 'military_case')!;
    const drops = openCrateToDrops(milCrate);
    expect(milCrate.opened).toBe(true);
    expect(drops.length).toBeGreaterThanOrEqual(2);
    expect(drops.some((d) => d.kind === 'weapon')).toBe(true);
  });

  it('registers bullet hits, armor absorption, elimination, and grenade blasts', () => {
    const world = buildWorldFromSeed('rust_refinery', 888);
    const attacker = createInitialFighter({
      id: 'p1',
      seatIndex: 0,
      teamIndex: 0,
      nickname: 'Striker',
      operatorId: 'titan',
      isLocal: true,
      isAi: false,
      isHost: true,
      spawnX: 900,
      spawnY: 900,
    });
    const victim = createInitialFighter({
      id: 'p2',
      seatIndex: 1,
      teamIndex: 1,
      nickname: 'Target',
      operatorId: 'spectre',
      isLocal: false,
      isAi: false,
      isHost: false,
      spawnX: 1020,
      spawnY: 900,
    });

    // Equip sniper & shoot straight right toward victim
    tryPickupLootDrop(
      attacker,
      {
        id: 'sniper-drop',
        x: 900,
        y: 900,
        kind: 'weapon',
        rarity: 'legendary',
        weaponId: 'sniper',
        spawnedAtMs: 1000,
      },
      false
    );
    attacker.aimAngle = 0;

    const { bullets } = tryFireWeapon(attacker, 5000, () => 0.5);
    expect(bullets.length).toBe(1);

    const stepRes = stepBullets(bullets, [attacker, victim], world, 0.05, 5050);
    // Sniper moves 1850 * 0.05 = 92.5px -> step once more to cover 120px distance
    const stepRes2 = stepBullets(bullets, [attacker, victim], world, 0.05, 5100);
    const allHits = [...stepRes.fighterHits, ...stepRes2.fighterHits];
    expect(allHits.length).toBe(1);

    const dmg = applyDamageToFighter(victim, allHits[0].bullet.damage, allHits[0].bullet.armorPenetration, 5100);
    expect(dmg.armorLost).toBeGreaterThan(0);
    expect(dmg.hpLost).toBeGreaterThan(50);
    expect(victim.hp).toBeLessThan(100);

    // Throw grenade next to victim and detonate
    attacker.x = 970;
    attacker.y = 900;
    const grenade = tryThrowGrenade(attacker, 6000);
    expect(grenade).not.toBeNull();
    const gList = [grenade!];
    const boom = stepGrenades(gList, [attacker, victim], world, 0.05, 7500);
    expect(boom.explosions.length).toBe(1);
    expect(boom.explosions[0].hits.some((h) => h.target.id === 'p2')).toBe(true);
  });

  it('applies storm tick damage when fighter stays outside safe zone', () => {
    const world = buildWorldFromSeed('verdan_valley', 101);
    const storm = getStormStateAt(150_000, world); // tight late circle
    const f = createInitialFighter({
      id: 'p1',
      seatIndex: 0,
      teamIndex: 0,
      nickname: 'StormRunner',
      operatorId: 'nomad',
      isLocal: true,
      isAi: false,
      isHost: true,
      spawnX: 250,
      spawnY: 250,
    });
    const res = stepFighterMovement(
      f,
      {
        moveX: 0,
        moveY: 0,
        aimAngle: 0,
        firing: false,
        dash: false,
        reload: false,
        interact: false,
        heal: false,
        throwGrenade: false,
        switchSlot: null,
      },
      world,
      storm,
      0.05,
      150_000,
      true
    );
    expect(res.stormDamaged).toBe(true);
    expect(f.hp).toBeLessThan(100);
  });
});
