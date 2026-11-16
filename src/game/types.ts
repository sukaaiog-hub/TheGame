export type TrackId = 'lighthouse_bay' | 'frozen_tundra' | 'magma_caldera';

export type KartId = 'tux' | 'wilber' | 'konqi' | 'sara' | 'hexley' | 'puffy';

export type PowerupType = 'zipper' | 'bowling' | 'plunger' | 'shield' | 'swatter';

export type RoomStatus = 'waiting' | 'countdown' | 'racing' | 'finished';

export interface KartDefinition {
  id: KartId;
  name: string;
  species: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  /** Units/sec top cruising speed */
  maxSpeed: number;
  /** Acceleration units/sec^2 */
  accel: number;
  /** Turn rate rad/sec */
  handling: number;
  /** Drift mini-turbo power multiplier */
  driftBoost: number;
  /** Collision mass factor */
  weight: number;
}

export interface TrackDefinition {
  id: TrackId;
  name: string;
  subtitle: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Expert';
  roadWidth: number;
  skyTopColor: string;
  skyBottomColor: string;
  fogColor: string;
  groundColor: string;
  roadColor: string;
  curbColorA: string;
  curbColorB: string;
  accentColor: string;
  controlPoints: Array<[number, number, number]>;
}

export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  drift: boolean;
  useItem: boolean;
  rescue: boolean;
}

export interface RacerState {
  id: string;
  seatIndex: number;
  nickname: string;
  kartId: KartId;
  isLocal: boolean;
  isAi: boolean;
  isHost: boolean;

  // Spatial physics
  x: number;
  y: number;
  z: number;
  yaw: number; // radians, 0 points +Z
  vx: number;
  vz: number;
  speed: number;
  steerAngle: number;

  // Drift & boost
  isDrifting: boolean;
  driftDir: number; // -1 or 1
  driftCharge: number; // seconds charged
  driftTier: 0 | 1 | 2 | 3;
  boostTimer: number;
  boostPower: number;

  // Items & status effects
  heldItem: PowerupType | null;
  shieldTimer: number;
  spinTimer: number;
  onRoad: boolean;
  offRoadPenalty: number;

  // Race progress
  segmentIndex: number;
  distanceAlong: number;
  progress01: number;
  highestCheckpoint: number;
  lap: number; // 1-based current lap
  lapStartMs: number;
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
  finishOrder: number | null;
  position: number; // 1..4

  // Network sync helper
  lastPacketSeq: number;
  lastUpdatedAt: number;
}

export interface BoostPad {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  distanceAlong: number;
}

export interface ItemBoxState {
  id: string;
  x: number;
  y: number;
  z: number;
  active: boolean;
  respawnTimer: number;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  kind: 'bowling' | 'plunger';
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  ttl: number;
  bouncesLeft: number;
  targetId: string | null;
}

export interface LobbyRoom {
  id: string;
  code: string;
  name: string;
  host_id: string;
  track_id: TrackId;
  laps: number;
  max_players: number;
  ai_fill: boolean;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface LobbyPlayer {
  id: string;
  room_id: string;
  player_id: string;
  nickname: string;
  kart_id: KartId;
  seat_index: number;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface NetworkKartPacket {
  id: string;
  seq: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  speed: number;
  steerAngle: number;
  isDrifting: boolean;
  driftDir: number;
  driftTier: 0 | 1 | 2 | 3;
  boostTimer: number;
  heldItem: PowerupType | null;
  shieldTimer: number;
  spinTimer: number;
  lap: number;
  progress01: number;
  finished: boolean;
  finishTimeMs: number | null;
  bestLapMs: number | null;
}

export type MultiplayerBroadcast =
  | { type: 'race_start'; startAtEpochMs: number; trackId: TrackId; laps: number }
  | { type: 'kart_state'; packet: NetworkKartPacket }
  | { type: 'ai_batch'; packets: NetworkKartPacket[] }
  | { type: 'item_box_taken'; boxId: string }
  | { type: 'projectile_spawn'; projectile: ProjectileState }
  | { type: 'racer_hit'; targetId: string; attackerId: string; kind: PowerupType }
  | { type: 'race_finished'; standings: RaceStanding[] }
  | { type: 'lobby_nudge' };

export interface RaceStanding {
  playerId: string;
  nickname: string;
  kartId: KartId;
  isAi: boolean;
  position: number;
  totalTimeMs: number;
  bestLapMs: number | null;
}
