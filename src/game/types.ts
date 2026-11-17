export type MapId = 'verdan_valley' | 'rust_refinery' | 'arctic_outpost';

export type GameMode = 'pvp_royale' | 'coop_squad';

export type OperatorId =
  | 'vanguard'
  | 'spectre'
  | 'titan'
  | 'nomad'
  | 'viper'
  | 'valkyrie';

export type WeaponId =
  | 'pistol'
  | 'smg'
  | 'shotgun'
  | 'rifle'
  | 'sniper'
  | 'plasma';

export type AmmoType = 'light' | 'shells' | 'heavy' | 'energy';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type CrateKind = 'wood_crate' | 'military_case' | 'med_crate' | 'supply_drop';

export type LootItemKind = 'weapon' | 'armor' | 'medkit' | 'ammo' | 'grenade';

export type RoomStatus = 'waiting' | 'countdown' | 'active' | 'finished';

export interface OperatorDefinition {
  id: OperatorId;
  name: string;
  callsign: string;
  role: string;
  tagline: string;
  suitColor: string;
  vestColor: string;
  visorColor: string;
  accentColor: string;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  shortName: string;
  ammoType: AmmoType;
  pellets: number;
  spreadRad: number;
  baseDamage: number;
  fireRateMs: number;
  magSize: number;
  reloadMs: number;
  bulletSpeed: number;
  range: number;
  armorPenetration: number;
  recoilKick: number;
  tracerColor: string;
  barrelLength: number;
  silhouette: 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'plasma';
}

export interface WeaponInstance {
  weaponId: WeaponId;
  rarity: Rarity;
  magAmmo: number;
}

export interface WallRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'brick' | 'concrete' | 'container_red' | 'container_blue' | 'container_gold' | 'sandbag' | 'rock';
  blocksBullets: boolean;
}

export interface BuildingZone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floorKind: 'wood' | 'tile' | 'metal';
  roofStyle: 'shingle' | 'steel' | 'slate';
}

export interface TreeProp {
  id: string;
  x: number;
  y: number;
  trunkRadius: number;
  canopyRadius: number;
  variant: 'oak' | 'pine' | 'palm';
}

export interface RoadStrip {
  x: number;
  y: number;
  w: number;
  h: number;
  orientation: 'h' | 'v';
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  themeTag: string;
  accentColor: string;
  worldSize: number;
  playMargin: number;
  groundColor: string;
  roadColor: string;
  waterColor: string;
  sandColor: string;
  stormColor: string;
  pois: Array<{ name: string; x: number; y: number }>;
}

export interface BuiltWorld {
  def: MapDefinition;
  seed: number;
  walls: WallRect[];
  buildings: BuildingZone[];
  roads: RoadStrip[];
  trees: TreeProp[];
  crates: LootCrate[];
}

export interface LootCrate {
  id: string;
  x: number;
  y: number;
  kind: CrateKind;
  hp: number;
  maxHp: number;
  opened: boolean;
  hitFlashUntilMs: number;
}

export interface LootDrop {
  id: string;
  x: number;
  y: number;
  kind: LootItemKind;
  rarity: Rarity;
  weaponId?: WeaponId;
  ammoType?: AmmoType;
  amount?: number;
  armorValue?: number;
  spawnedAtMs: number;
}

export interface FighterState {
  id: string;
  seatIndex: number;
  teamIndex: number;
  nickname: string;
  operatorId: OperatorId;
  isLocal: boolean;
  isAi: boolean;
  isHost: boolean;

  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  radius: number;

  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  alive: boolean;
  eliminatedAtMs: number | null;
  placement: number | null;
  kills: number;
  damageDealt: number;

  weapons: [WeaponInstance | null, WeaponInstance | null];
  activeSlot: 0 | 1;
  reserveAmmo: Record<AmmoType, number>;
  medkits: number;
  grenades: number;

  reloadingUntilMs: number;
  healingUntilMs: number;
  lastShotAtMs: number;
  dashCooldownUntilMs: number;
  dashingUntilMs: number;
  dashDirX: number;
  dashDirY: number;
  muzzleFlashUntilMs: number;
  hitFlashUntilMs: number;
  walkPhase: number;
  recoilOffset: number;

  // AI state helpers
  aiGoalX: number;
  aiGoalY: number;
  aiNextDecisionAtMs: number;
  aiStrafeSign: number;

  // Network tracking
  lastPacketSeq: number;
  lastUpdatedAt: number;
}

export interface BulletEntity {
  id: string;
  ownerId: string;
  teamIndex: number;
  weaponId: WeaponId;
  rarity: Rarity;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  armorPenetration: number;
  distanceTraveled: number;
  maxRange: number;
  color: string;
}

export interface GrenadeEntity {
  id: string;
  ownerId: string;
  teamIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  explodeAtMs: number;
  exploded: boolean;
}

export interface StormState {
  phase: number;
  centerX: number;
  centerY: number;
  currentRadius: number;
  targetRadius: number;
  shrinking: boolean;
  damagePerSecond: number;
  secondsToNextChange: number;
}

export interface ParticleFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  bornAtMs: number;
  lifeMs: number;
  kind: 'spark' | 'smoke' | 'blood' | 'shield' | 'splinter' | 'ring' | 'dust';
}

export interface ShellCasing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  color: string;
  bornAtMs: number;
}

export interface DamageFloat {
  x: number;
  y: number;
  text: string;
  color: string;
  bornAtMs: number;
}

export interface ScorchDecal {
  x: number;
  y: number;
  radius: number;
  bornAtMs: number;
}

export interface BrRoom {
  id: string;
  code: string;
  name: string;
  host_id: string;
  map_id: MapId;
  mode: GameMode;
  max_players: number;
  bot_count: number;
  match_seed: number;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface BrPlayer {
  id: string;
  room_id: string;
  player_id: string;
  nickname: string;
  operator_id: OperatorId;
  seat_index: number;
  team_index: number;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface NetworkFighterPacket {
  id: string;
  seq: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  armor: number;
  alive: boolean;
  kills: number;
  damageDealt: number;
  activeWeaponId: WeaponId;
  activeRarity: Rarity;
  dashing: boolean;
  healing: boolean;
  reloading: boolean;
}

export type BrBroadcast =
  | {
      type: 'match_start';
      startAtEpochMs: number;
      sentAtEpochMs?: number;
      mapId: MapId;
      mode: GameMode;
      matchSeed: number;
      botCount: number;
    }
  | {
      type: 'match_countdown';
      startAtEpochMs: number;
      sentAtEpochMs?: number;
      matchSeed: number;
    }
  | { type: 'room_reset' }
  | { type: 'match_finished'; standings: MatchStanding[] }
  | { type: 'fighter_state'; packet: NetworkFighterPacket }
  | { type: 'ai_batch'; packets: NetworkFighterPacket[] }
  | {
      type: 'fire_bullets';
      ownerId: string;
      teamIndex: number;
      weaponId: WeaponId;
      rarity: Rarity;
      bullets: Array<{
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        damage: number;
        armorPenetration: number;
        maxRange: number;
        color: string;
      }>;
    }
  | { type: 'throw_grenade'; grenade: GrenadeEntity }
  | {
      type: 'damage_hit';
      targetId: string;
      attackerId: string;
      damage: number;
      armorPenetration: number;
      weaponLabel: string;
      hitX: number;
      hitY: number;
    }
  | {
      type: 'fighter_eliminated';
      victimId: string;
      attackerId: string | null;
      weaponLabel: string;
      drops: LootDrop[];
    }
  | { type: 'crate_opened'; crateId: string; openerId: string; drops: LootDrop[] }
  | { type: 'loot_picked'; dropId: string; pickerId: string }
  | { type: 'airdrop_spawned'; crate: LootCrate }
  | { type: 'lobby_nudge' };

export interface BrPublicRoomSummary {
  id: string;
  code: string;
  name: string;
  host_id: string;
  map_id: MapId;
  mode: GameMode;
  max_players: number;
  bot_count: number;
  match_seed: number;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  br_players?: Array<{
    id: string;
    nickname: string;
    operator_id: OperatorId;
    seat_index: number;
    team_index: number;
    is_host: boolean;
    is_ready: boolean;
  }>;
}

export interface LeaderboardRow {
  id: string;
  map_id: MapId;
  mode: GameMode;
  player_id: string;
  nickname: string;
  operator_id: OperatorId;
  placement: number;
  kills: number;
  damage_dealt: number;
  survival_ms: number;
  created_at: string;
}

export interface KillFeedEntry {
  id: string;
  killerName: string;
  victimName: string;
  weaponLabel: string;
  createdAtMs: number;
}

export interface MatchStanding {
  playerId: string;
  nickname: string;
  operatorId: OperatorId;
  isAi: boolean;
  teamIndex: number;
  placement: number;
  kills: number;
  damageDealt: number;
  survivalMs: number;
}
