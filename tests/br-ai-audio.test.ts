import { describe, expect, it } from 'vitest';
import { computeAiFighterInput } from '@/game/ai';
import { createInitialFighter, tryPickupLootDrop } from '@/game/combat';
import { buildWorldFromSeed, getStormStateAt } from '@/game/world';

describe('Tactical Battle Royale AI Rivals', () => {
  it('rushes toward nearby unopened crates when carrying only starter pistol', () => {
    const world = buildWorldFromSeed('verdan_valley', 12345);
    const crate = world.crates[0];
    const bot = createInitialFighter({
      id: 'bot-1',
      seatIndex: 1,
      teamIndex: 1,
      nickname: 'BotAlpha',
      operatorId: 'spectre',
      isLocal: false,
      isAi: true,
      isHost: false,
      spawnX: crate.x - 120,
      spawnY: crate.y,
    });

    const storm = getStormStateAt(2000, world);
    const aiIn = computeAiFighterInput(bot, [bot], world, [], storm, 2000);
    expect(aiIn.moveX).toBeGreaterThan(0.5);
  });

  it('aims and fires when an enemy fighter is within clear line of sight', () => {
    const world = buildWorldFromSeed('rust_refinery', 9876);
    const bot = createInitialFighter({
      id: 'bot-1',
      seatIndex: 1,
      teamIndex: 1,
      nickname: 'BotStriker',
      operatorId: 'titan',
      isLocal: false,
      isAi: true,
      isHost: false,
      spawnX: 1400,
      spawnY: 1400,
    });
    const enemy = createInitialFighter({
      id: 'human-1',
      seatIndex: 0,
      teamIndex: 0,
      nickname: 'PlayerOne',
      operatorId: 'vanguard',
      isLocal: true,
      isAi: false,
      isHost: true,
      spawnX: 1520,
      spawnY: 1400,
    });
    tryPickupLootDrop(
      bot,
      {
        id: 'ar-drop',
        x: 1400,
        y: 1400,
        kind: 'weapon',
        rarity: 'rare',
        weaponId: 'rifle',
        spawnedAtMs: 1000,
      },
      false
    );

    const storm = getStormStateAt(5000, world);
    const aiIn = computeAiFighterInput(bot, [bot, enemy], world, [], storm, 5000);
    expect(aiIn.firing).toBe(true);
    expect(Math.abs(aiIn.aimAngle)).toBeLessThan(0.2);
  });
});
