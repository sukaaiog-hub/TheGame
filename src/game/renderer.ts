import { getActiveWeapon } from './combat';
import { getOperatorDefinition } from './operators';
import { getBiomeTextureAtlas } from './textures';
import { RARITY_META, WEAPONS } from './weapons';
import { pointInRect } from './world';
import type {
  BuiltWorld,
  BulletEntity,
  DamageFloat,
  FighterState,
  GrenadeEntity,
  LootDrop,
  ParticleFx,
  ScorchDecal,
  ShellCasing,
  StormState,
  WeaponId,
} from './types';

export interface ArenaRenderFrameState {
  world: BuiltWorld;
  fighters: FighterState[];
  localFighterId: string;
  bullets: BulletEntity[];
  grenades: GrenadeEntity[];
  drops: LootDrop[];
  storm: StormState;
  particles: ParticleFx[];
  casings: ShellCasing[];
  floats: DamageFloat[];
  scorches: ScorchDecal[];
  mouseScreenX: number;
  mouseScreenY: number;
  hitmarkerUntilMs: number;
  nowMs: number;
}

export class TopDownArenaRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camX = 1400;
  private camY = 1400;
  private camInitialized = false;
  private shakeIntensity = 0;
  private width = 1280;
  private height = 720;
  private roofAlphas = new Map<string, number>();

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'crosshair';
    container.innerHTML = '';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize(container);
  }

  public resize(container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || window.innerWidth));
    const h = Math.max(240, Math.floor(rect.height || window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(20, this.shakeIntensity + amount);
  }

  public screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.camX - this.width / 2 + sx,
      y: this.camY - this.height / 2 + sy,
    };
  }

  public render(state: ArenaRenderFrameState, dt: number): void {
    const ctx = this.ctx;
    const { world, fighters, localFighterId, nowMs } = state;
    const atlas = getBiomeTextureAtlas(ctx, world.def.id);
    const local = fighters.find((f) => f.id === localFighterId) ?? fighters.find((f) => f.alive) ?? fighters[0];

    // Smooth camera follow + slight look-ahead toward mouse aim
    if (local) {
      const lookOffsetX = Math.max(-110, Math.min(110, (state.mouseScreenX - this.width / 2) * 0.16));
      const lookOffsetY = Math.max(-80, Math.min(80, (state.mouseScreenY - this.height / 2) * 0.16));
      const targetX = local.x + (local.alive ? lookOffsetX : 0);
      const targetY = local.y + (local.alive ? lookOffsetY : 0);
      if (!this.camInitialized) {
        this.camX = targetX;
        this.camY = targetY;
        this.camInitialized = true;
      } else {
        const a = Math.min(1, dt * 9.5);
        this.camX += (targetX - this.camX) * a;
        this.camY += (targetY - this.camY) * a;
      }
    }

    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 36);
    const shakeX = this.shakeIntensity > 0.2 ? (Math.random() - 0.5) * this.shakeIntensity : 0;
    const shakeY = this.shakeIntensity > 0.2 ? (Math.random() - 0.5) * this.shakeIntensity : 0;

    const viewLeft = this.camX - this.width / 2 + shakeX;
    const viewTop = this.camY - this.height / 2 + shakeY;

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(-viewLeft, -viewTop);

    // 1. Ocean / Island outer boundary texture
    if (atlas.waterPattern) {
      ctx.fillStyle = atlas.waterPattern;
    } else {
      ctx.fillStyle = world.def.waterColor;
    }
    ctx.fillRect(viewLeft - 50, viewTop - 50, this.width + 100, this.height + 100);

    // Sandy coastal rim around island
    const m = world.def.playMargin;
    const sz = world.def.worldSize;
    ctx.fillStyle = world.def.sandColor;
    ctx.fillRect(m - 42, m - 42, sz - (m - 42) * 2, sz - (m - 42) * 2);

    // 2. Main textured biome ground
    if (atlas.groundPattern) {
      ctx.fillStyle = atlas.groundPattern;
    } else {
      ctx.fillStyle = world.def.groundColor;
    }
    ctx.fillRect(m, m, sz - m * 2, sz - m * 2);

    // 3. Textured crossroads + highway lane lines
    for (const road of world.roads) {
      ctx.fillStyle = atlas.roadPattern ?? world.def.roadColor;
      ctx.fillRect(road.x, road.y, road.w, road.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 3;
      ctx.strokeRect(road.x, road.y, road.w, road.h);

      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.52)';
      ctx.lineWidth = 4;
      ctx.setLineDash([28, 22]);
      ctx.beginPath();
      if (road.orientation === 'h') {
        ctx.moveTo(road.x + 20, road.y + road.h / 2);
        ctx.lineTo(road.x + road.w - 20, road.y + road.h / 2);
      } else {
        ctx.moveTo(road.x + road.w / 2, road.y + 20);
        ctx.lineTo(road.x + road.w / 2, road.y + road.h - 20);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Grenade blast scorch decals & shell casings on ground
    for (const sc of state.scorches) {
      const age = (nowMs - sc.bornAtMs) / 15000;
      if (age >= 1) continue;
      ctx.fillStyle = `rgba(15, 15, 15, ${(1 - age) * 0.45})`;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of state.casings) {
      const age = (nowMs - c.bornAtMs) / 6000;
      if (age >= 1) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.globalAlpha = 1 - age * 0.8;
      ctx.fillStyle = c.color;
      ctx.fillRect(-3, -1.3, 6, 2.6);
      ctx.restore();
    }

    // 5. Building interior floors
    for (const b of world.buildings) {
      if (!this.rectVisible(b.x, b.y, b.w, b.h, viewLeft, viewTop)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      ctx.fillStyle = atlas.floors[b.floorKind] ?? '#574636';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    // 6. Ground Loot Drops with glowing rarity rings
    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.006);
    for (const drop of state.drops) {
      if (!this.circleVisible(drop.x, drop.y, 40, viewLeft, viewTop)) continue;
      const meta = RARITY_META[drop.rarity];
      const bob = Math.sin(nowMs * 0.005 + drop.x) * 2.5;

      // Rarity halo
      ctx.save();
      const grad = ctx.createRadialGradient(drop.x, drop.y, 2, drop.x, drop.y, 22 + pulse * 4);
      grad.addColorStop(0, meta.glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(drop.x, drop.y + bob);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-14, -14, 28, 28, 7);
      ctx.fill();
      ctx.stroke();

      // Icon per loot type
      ctx.fillStyle = meta.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 10px Inter, sans-serif';
      if (drop.kind === 'weapon' && drop.weaponId) {
        this.drawWeaponSilhouette(ctx, drop.weaponId, 0, 0, -0.35, 0.72, meta.color);
      } else if (drop.kind === 'medkit') {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      } else if (drop.kind === 'armor') {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(8, -5);
        ctx.lineTo(6, 7);
        ctx.lineTo(0, 10);
        ctx.lineTo(-6, 7);
        ctx.lineTo(-8, -5);
        ctx.closePath();
        ctx.fill();
      } else if (drop.kind === 'grenade') {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(0, 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-3, -7, 6, 4);
      } else {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-6, -4, 3, 9);
        ctx.fillRect(-1.5, -6, 3, 11);
        ctx.fillRect(3, -4, 3, 9);
      }
      ctx.restore();

      // Nearby pickup label for local player
      if (local && local.alive && Math.hypot(local.x - drop.x, local.y - drop.y) < 58) {
        const label =
          drop.kind === 'weapon' && drop.weaponId
            ? `[E] ${WEAPONS[drop.weaponId].shortName}`
            : drop.kind === 'armor'
              ? `[E] +${drop.armorValue} ARMOR`
              : drop.kind === 'medkit'
                ? '[E] MEDKIT'
                : drop.kind === 'grenade'
                  ? '[E] GRENADE'
                  : '[E] AMMO';
        this.drawPillLabel(ctx, drop.x, drop.y - 26, label, meta.color);
      }
    }

    // 7. Unopened Loot Crates
    for (const c of world.crates) {
      if (c.opened || !this.circleVisible(c.x, c.y, 48, viewLeft, viewTop)) continue;
      const sprite = atlas.crates[c.kind];
      const hw = sprite.width / 2;
      const hh = sprite.height / 2;

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(c.x - hw + 6, c.y - hh + 8, sprite.width - 4, sprite.height - 4);

      if (c.kind === 'supply_drop' || c.kind === 'military_case') {
        ctx.save();
        ctx.strokeStyle =
          c.kind === 'supply_drop'
            ? `rgba(245, 158, 11, ${0.45 + pulse * 0.4})`
            : `rgba(56, 189, 248, ${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, hw + 5 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.drawImage(sprite, c.x - hw, c.y - hh);

      if (nowMs < c.hitFlashUntilMs) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(c.x - hw + 4, c.y - hh + 4, sprite.width - 8, sprite.height - 8);
      }

      if (c.hp < c.maxHp) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(c.x - 18, c.y - hh - 10, 36, 5);
        ctx.fillStyle = c.kind === 'supply_drop' ? '#f59e0b' : '#22c55e';
        ctx.fillRect(c.x - 17, c.y - hh - 9, 34 * (c.hp / c.maxHp), 3);
      }

      if (local && local.alive && Math.hypot(local.x - c.x, local.y - c.y) < 68) {
        this.drawPillLabel(
          ctx,
          c.x,
          c.y - hh - 20,
          c.kind === 'supply_drop' ? '[E] OPEN AIRDROP' : '[E] OPEN CRATE',
          c.kind === 'supply_drop' ? '#fbbf24' : '#38bdf8'
        );
      }
    }

    // 8. Walls, Shipping Containers, Sandbags & Boulders
    for (const w of world.walls) {
      if (!this.rectVisible(w.x, w.y, w.w, w.h, viewLeft, viewTop)) continue;
      // Directional shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.fillRect(w.x + 7, w.y + 8, w.w, w.h);

      ctx.fillStyle = atlas.walls[w.kind] ?? '#475569';
      ctx.fillRect(w.x, w.y, w.w, w.h);

      // Subtle bevel edge
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    }

    // 9. Active Frag Grenades
    for (const g of state.grenades) {
      const timeLeft = Math.max(0, g.explodeAtMs - nowMs);
      const blink = Math.floor(timeLeft / 110) % 2 === 0;
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 175, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = blink ? '#ef4444' : '#1e293b';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();
      ctx.restore();
    }

    // 10. Tactical Laser Sightline for local player
    if (local && local.alive) {
      const wpn = getActiveWeapon(local);
      const wDef = wpn ? WEAPONS[wpn.weaponId] : WEAPONS.pistol;
      const sightLen = Math.min(wDef.range * 0.72, 460);
      const grad = ctx.createLinearGradient(
        local.x,
        local.y,
        local.x + Math.cos(local.aimAngle) * sightLen,
        local.y + Math.sin(local.aimAngle) * sightLen
      );
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(
        local.x + Math.cos(local.aimAngle) * wDef.barrelLength,
        local.y + Math.sin(local.aimAngle) * wDef.barrelLength
      );
      ctx.lineTo(
        local.x + Math.cos(local.aimAngle) * sightLen,
        local.y + Math.sin(local.aimAngle) * sightLen
      );
      ctx.stroke();
    }

    // 11. Tactical Operators (Fighters)
    for (const f of fighters) {
      if (!f.alive || !this.circleVisible(f.x, f.y, 60, viewLeft, viewTop)) continue;
      this.drawFighter(ctx, f, local?.id === f.id, local?.teamIndex === f.teamIndex, nowMs);
    }

    // 12. High-velocity Bullet Tracers
    for (const b of state.bullets) {
      ctx.save();
      const tailX = b.x - b.vx * 0.022;
      const tailY = b.y - b.vy * 0.022;
      const grad = ctx.createLinearGradient(tailX, tailY, b.x, b.y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.65, b.color);
      grad.addColorStop(1, '#ffffff');
      ctx.strokeStyle = grad;
      ctx.lineWidth = b.weaponId === 'sniper' ? 4.2 : b.weaponId === 'shotgun' ? 2.6 : 3.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    // 13. Cutaway Building Roofs (fade smooth alpha when local player walks inside!)
    for (const b of world.buildings) {
      if (!this.rectVisible(b.x, b.y, b.w, b.h, viewLeft, viewTop)) continue;
      const inside = local && local.alive && pointInRect(local.x, local.y, b.x, b.y, b.w, b.h);
      const targetAlpha = inside ? 0.1 : 0.94;
      const prevAlpha = this.roofAlphas.get(b.id) ?? 0.94;
      const nextAlpha = prevAlpha + (targetAlpha - prevAlpha) * Math.min(1, dt * 10);
      this.roofAlphas.set(b.id, nextAlpha);

      ctx.save();
      ctx.globalAlpha = nextAlpha;
      ctx.fillStyle = atlas.roofs[b.roofStyle] ?? '#475569';
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.lineWidth = 4;
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);

      // Ridge cap line
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x + 12, b.y + b.h / 2);
      ctx.lineTo(b.x + b.w - 12, b.y + b.h / 2);
      ctx.stroke();

      // Subtle POI name stencil on roof
      if (nextAlpha > 0.35) {
        ctx.fillStyle = 'rgba(248, 250, 252, 0.65)';
        ctx.font = '900 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 - 12);
      }
      ctx.restore();
    }

    // 14. Tree Trunks & Overhead Canopies (fade smoothly when player stands beneath!)
    for (const t of world.trees) {
      if (!this.circleVisible(t.x, t.y, t.canopyRadius + 20, viewLeft, viewTop)) continue;
      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.arc(t.x + 12, t.y + 14, t.canopyRadius * 0.92, 0, Math.PI * 2);
      ctx.fill();

      // Trunk
      ctx.fillStyle = '#5c3a21';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.trunkRadius, 0, Math.PI * 2);
      ctx.fill();

      const underTree =
        local && local.alive && Math.hypot(local.x - t.x, local.y - t.y) < t.canopyRadius + 10;
      const sprite = atlas.trees[t.variant];
      const drawSize = t.canopyRadius * 2.35;
      ctx.save();
      ctx.globalAlpha = underTree ? 0.28 : 0.92;
      ctx.drawImage(sprite, t.x - drawSize / 2, t.y - drawSize / 2, drawSize, drawSize);
      ctx.restore();
    }

    // 15. Particles (muzzle sparks, shield shatters, explosion rings, dust)
    for (const p of state.particles) {
      const life = (nowMs - p.bornAtMs) / p.lifeMs;
      if (life >= 1) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha * (1 - life));
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * (1 - life) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (0.25 + life * 0.95), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.radius * (1 - life * 0.4)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 16. Floating Damage / Pickup Numbers
    for (const fl of state.floats) {
      const age = (nowMs - fl.bornAtMs) / 900;
      if (age >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - age * age;
      ctx.font = '900 15px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
      const fy = fl.y - age * 28;
      ctx.strokeText(fl.text, fl.x, fy);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fy);
      ctx.restore();
    }

    // 17. Battle Royale Shrinking Storm Zone Overlay (even-odd outer fill)
    const { storm } = state;
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewLeft - 60, viewTop - 60, this.width + 120, this.height + 120);
    ctx.arc(storm.centerX, storm.centerY, Math.max(1, storm.currentRadius), 0, Math.PI * 2, true);
    ctx.fillStyle =
      world.def.id === 'rust_refinery'
        ? 'rgba(185, 28, 28, 0.34)'
        : 'rgba(109, 40, 217, 0.34)';
    ctx.fill('evenodd');

    // Pulsing storm plasma ring
    ctx.strokeStyle = world.def.stormColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(storm.centerX, storm.centerY, Math.max(1, storm.currentRadius), 0, Math.PI * 2);
    ctx.stroke();

    // Dotted preview of target safe ring while shrinking
    if (storm.targetRadius < storm.currentRadius - 8) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(storm.centerX, storm.centerY, storm.targetRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore(); // end world transform

    // 18. Screen-space Storm Edge Warning Vignette
    if (local && local.alive) {
      const dist = Math.hypot(local.x - storm.centerX, local.y - storm.centerY);
      if (dist > storm.currentRadius) {
        const vig = ctx.createRadialGradient(
          this.width / 2,
          this.height / 2,
          this.height * 0.3,
          this.width / 2,
          this.height / 2,
          this.width * 0.72
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(124, 58, 237, 0.48)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    // 19. Dynamic Aim Crosshair & Hitmarker X
    this.drawCrosshair(ctx, state.mouseScreenX, state.mouseScreenY, local, nowMs, state.hitmarkerUntilMs);
  }

  private drawFighter(
    ctx: CanvasRenderingContext2D,
    f: FighterState,
    isLocal: boolean,
    isTeammate: boolean,
    nowMs: number
  ): void {
    const op = getOperatorDefinition(f.operatorId);
    const wpn = getActiveWeapon(f);
    const wDef = wpn ? WEAPONS[wpn.weaponId] : WEAPONS.pistol;

    ctx.save();
    ctx.translate(f.x, f.y);

    // Subtle ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 19, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Teammate / Self selection ring
    if (isLocal || isTeammate) {
      ctx.strokeStyle = isLocal ? 'rgba(56, 189, 248, 0.75)' : 'rgba(34, 197, 94, 0.8)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotated upper body + boots + weapon
    ctx.save();
    ctx.rotate(f.aimAngle);

    // Animated boots stepping forward/back
    const stride = Math.sin(f.walkPhase) * 6;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(stride, -11, 6, 4.2, 0, 0, Math.PI * 2);
    ctx.ellipse(-stride, 11, 6, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tactical backpack
    ctx.fillStyle = op.vestColor;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-17, -10, 9, 20, 4);
    ctx.fill();
    ctx.stroke();

    // Armored torso / shoulders
    ctx.fillStyle = nowMs < f.hitFlashUntilMs ? '#ffffff' : op.suitColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Tactical chest vest
    ctx.fillStyle = op.vestColor;
    ctx.beginPath();
    ctx.ellipse(2, 0, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Weapon silhouette with recoil kickback
    const kick = f.recoilOffset;
    const rarityColor = wpn ? RARITY_META[wpn.rarity].color : '#94a3b8';
    this.drawWeaponSilhouette(ctx, wDef.id, 14 - kick, 6, 0, 1.0, rarityColor);

    // Muzzle flash radial glow
    if (nowMs < f.muzzleFlashUntilMs) {
      const mx = wDef.barrelLength + 4 - kick;
      const my = 6;
      const flashGrad = ctx.createRadialGradient(mx, my, 1, mx, my, 24);
      flashGrad.addColorStop(0, '#ffffff');
      flashGrad.addColorStop(0.35, wDef.tracerColor);
      flashGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = flashGrad;
      ctx.beginPath();
      ctx.arc(mx, my, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // Operator hands holding gun
    ctx.fillStyle = op.accentColor;
    ctx.beginPath();
    ctx.arc(10 - kick * 0.5, 7, 4.2, 0, Math.PI * 2);
    ctx.arc(16 - kick * 0.5, 4, 4.0, 0, Math.PI * 2);
    ctx.fill();

    // Tactical Helmet + Glowing Visor
    ctx.fillStyle = nowMs < f.hitFlashUntilMs ? '#ffffff' : op.suitColor;
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = op.visorColor;
    ctx.beginPath();
    ctx.arc(3.5, 0, 7.2, -0.78, 0.78);
    ctx.fill();

    ctx.restore(); // end rotation

    // Reload / Healing radial progress ring
    if (f.reloadingUntilMs > nowMs && wpn) {
      const total = WEAPONS[wpn.weaponId].reloadMs;
      const prog = 1 - (f.reloadingUntilMs - nowMs) / total;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, prog)));
      ctx.stroke();
    } else if (f.healingUntilMs > nowMs) {
      const prog = 1 - (f.healingUntilMs - nowMs) / 1600;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, prog)));
      ctx.stroke();
    }

    // Overhead name & HP/Armor bar for other fighters
    if (!isLocal) {
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.strokeText(f.nickname, 0, -34);
      ctx.fillStyle = isTeammate ? '#86efac' : '#f8fafc';
      ctx.fillText(f.nickname, 0, -34);

      // Health bar
      const bw = 38;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-bw / 2, -28, bw, 6);
      ctx.fillStyle = isTeammate ? '#22c55e' : '#ef4444';
      ctx.fillRect(-bw / 2 + 1, -27, (bw - 2) * (f.hp / f.maxHp), 4);
      if (f.armor > 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-bw / 2 + 1, -30, (bw - 2) * (f.armor / f.maxArmor), 2.5);
      }
    }

    ctx.restore();
  }

  private drawWeaponSilhouette(
    ctx: CanvasRenderingContext2D,
    weaponId: WeaponId,
    x: number,
    y: number,
    angle: number,
    scale: number,
    rarityColor: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 1.2;

    if (weaponId === 'pistol') {
      ctx.fillRect(-4, -2.5, 13, 5);
      ctx.strokeRect(-4, -2.5, 13, 5);
    } else if (weaponId === 'smg') {
      ctx.fillRect(-6, -3, 18, 6);
      ctx.fillStyle = rarityColor;
      ctx.fillRect(2, -1.5, 8, 3);
    } else if (weaponId === 'shotgun') {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-8, -3, 10, 6);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(2, -2.6, 18, 5.2);
      ctx.fillStyle = rarityColor;
      ctx.fillRect(6, -1.3, 9, 2.6);
    } else if (weaponId === 'rifle') {
      ctx.fillRect(-8, -3, 24, 6);
      ctx.fillRect(16, -1.8, 7, 3.6);
      ctx.fillStyle = rarityColor;
      ctx.fillRect(0, -1.5, 10, 3);
    } else if (weaponId === 'sniper') {
      ctx.fillRect(-10, -2.8, 30, 5.6);
      ctx.fillRect(20, -1.4, 12, 2.8);
      ctx.fillStyle = rarityColor;
      ctx.fillRect(-2, -3.5, 9, 7);
    } else {
      // Helios Plasma LMG
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-9, -4, 27, 8);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(2, -2, 16, 4);
    }

    ctx.restore();
  }

  private drawCrosshair(
    ctx: CanvasRenderingContext2D,
    mx: number,
    my: number,
    local: FighterState | undefined,
    nowMs: number,
    hitmarkerUntilMs: number
  ): void {
    const spreadGap = local ? 7 + local.recoilOffset * 1.4 : 8;
    ctx.save();
    ctx.translate(mx, my);

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-spreadGap - 7, 0);
    ctx.lineTo(-spreadGap, 0);
    ctx.moveTo(spreadGap, 0);
    ctx.lineTo(spreadGap + 7, 0);
    ctx.moveTo(0, -spreadGap - 7);
    ctx.lineTo(0, -spreadGap);
    ctx.moveTo(0, spreadGap);
    ctx.lineTo(0, spreadGap + 7);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    // Hitmarker X flash
    if (nowMs < hitmarkerUntilMs) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-9, -9);
      ctx.lineTo(-4, -4);
      ctx.moveTo(9, -9);
      ctx.lineTo(4, -4);
      ctx.moveTo(-9, 9);
      ctx.lineTo(-4, 4);
      ctx.moveTo(9, 9);
      ctx.lineTo(4, 4);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPillLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    accent: string
  ): void {
    ctx.save();
    ctx.font = '800 11px Inter, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 10, w, 20, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  private rectVisible(x: number, y: number, w: number, h: number, vl: number, vt: number): boolean {
    return x + w >= vl - 80 && x <= vl + this.width + 80 && y + h >= vt - 80 && y <= vt + this.height + 80;
  }

  private circleVisible(x: number, y: number, r: number, vl: number, vt: number): boolean {
    return (
      x + r >= vl - 80 &&
      x - r <= vl + this.width + 80 &&
      y + r >= vt - 80 &&
      y - r <= vt + this.height + 80
    );
  }
}
