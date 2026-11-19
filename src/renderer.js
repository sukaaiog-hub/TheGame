/**
 * Three.js WebGL2 Arena Renderer for Red Eclipse 2 Browser Edition.
 * Uses procedural canvas textures (zero external image downloads).
 */
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

function makeGridTexture(bgHex, lineHex, accentHex, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 248);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNameplateSprite(name, teamColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(10, 14, 23, 0.78)';
  ctx.fillRect(18, 8, 220, 44);
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 8, 220, 44);

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(name.slice(0, 16), 128, 35);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.52, 1);
  sprite.userData = { canvas, ctx, tex, teamColor, lastHp: -1 };
  return sprite;
}

export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(82, window.innerWidth / window.innerHeight, 0.1, 260);
    this.scene.add(this.camera);

    // Viewmodel attached to camera
    this.viewRoot = new THREE.Group();
    this.camera.add(this.viewRoot);
    this.weaponMesh = this._buildViewWeapon();
    this.viewRoot.add(this.weaponMesh);

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.actorsGroup = new THREE.Group();
    this.scene.add(this.actorsGroup);

    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);

    this.actorMeshes = new Map();
    this.pickupMeshes = new Map();
    this.padMeshes = [];
    this.beams = [];
    this.explosions = [];
    this.projMeshes = new Map();
    this.recoilOffset = 0;

    this._onResize = () => {
      if (!this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  _buildViewWeapon() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.13, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x222938, roughness: 0.35, metalness: 0.7 })
    );
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.38, 10),
      new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.25, metalness: 0.85 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.34);

    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.118, 0.032, 0.34),
      new THREE.MeshStandardMaterial({
        color: 0xd0d0d0,
        emissive: 0xd0d0d0,
        emissiveIntensity: 0.9,
        roughness: 0.2,
      })
    );
    accent.position.set(0, 0.06, -0.04);

    const swordBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.07, 0.68),
      new THREE.MeshStandardMaterial({
        color: 0x6060ff,
        emissive: 0x5050ff,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.88,
      })
    );
    swordBlade.position.set(0, 0.05, -0.44);
    swordBlade.visible = false;

    group.add(body, barrel, accent, swordBlade);
    group.position.set(0.24, -0.22, -0.38);
    group.userData = { accent, barrel, swordBlade };
    return group;
  }

  loadMap(map) {
    this.mapGroup.clear();
    this.pickupMeshes.clear();
    this.padMeshes = [];
    this.actorMeshes.clear();
    this.actorsGroup.clear();
    this.projMeshes.clear();
    this.fxGroup.clear();
    this.beams = [];
    this.explosions = [];

    this.scene.background = new THREE.Color(map.skyColor);
    this.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);

    // Lighting
    const hemi = new THREE.HemisphereLight(map.ambientColor, 0x111827, 1.15);
    this.mapGroup.add(hemi);

    const sun = new THREE.DirectionalLight(map.sunColor, 1.35);
    sun.position.set(22, 42, 18);
    this.mapGroup.add(sun);

    const accentLight = new THREE.PointLight(map.accentHex, 2.5, 65, 1.2);
    accentLight.position.set(0, 10, 0);
    this.mapGroup.add(accentLight);

    const mats = {
      floor: new THREE.MeshStandardMaterial({
        map: makeGridTexture('#161f30', '#25334a', map.accentHex, 14),
        roughness: 0.72,
        metalness: 0.25,
      }),
      wall: new THREE.MeshStandardMaterial({
        map: makeGridTexture('#1b2436', '#2c3952', '#334155', 4),
        roughness: 0.65,
        metalness: 0.35,
      }),
      panel: new THREE.MeshStandardMaterial({
        map: makeGridTexture('#232e42', '#3b4b68', map.accentHex, 2),
        roughness: 0.5,
        metalness: 0.45,
      }),
      pillar: new THREE.MeshStandardMaterial({
        map: makeGridTexture('#1f2937', '#374151', '#ef4444', 1),
        roughness: 0.45,
        metalness: 0.55,
      }),
      trim: new THREE.MeshStandardMaterial({
        color: 0x263247,
        emissive: map.accentHex,
        emissiveIntensity: 0.18,
        roughness: 0.4,
        metalness: 0.6,
      }),
    };

    for (const b of map.boxes) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, mats[b.mat] || mats.panel);
      mesh.position.set(b.x, b.y, b.z);
      this.mapGroup.add(mesh);
    }

    // Sloped ramps built as wedge prisms
    const rampMat = mats.panel;
    for (const r of map.ramps) {
      const mesh = this._buildRampMesh(r, rampMat);
      this.mapGroup.add(mesh);
    }

    // Jump pads
    for (const pad of map.jumpPads) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.radius, pad.radius * 1.12, 0.22, 24),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
      );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(pad.radius * 0.8, 0.12, 10, 28),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x38bdf8,
          emissiveIntensity: 1.4,
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.16;
      group.add(base, ring);
      group.position.set(pad.x, pad.y, pad.z);
      this.mapGroup.add(group);
      this.padMeshes.push(ring);
    }

    // Pickups
    for (const pk of map.pickups) {
      const col = pk.kind === 'health'
        ? 0x22c55e
        : pk.kind === 'impulse'
          ? 0x38bdf8
          : (WEAPONS[pk.weapon]?.color || 0xfef08a);

      const geo = pk.kind === 'health'
        ? new THREE.BoxGeometry(0.75, 0.75, 0.75)
        : pk.kind === 'impulse'
          ? new THREE.OctahedronGeometry(0.58)
          : new THREE.BoxGeometry(0.95, 0.42, 0.42);

      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.6,
        })
      );
      mesh.position.set(pk.x, pk.y, pk.z);
      this.mapGroup.add(mesh);
      this.pickupMeshes.set(pk.id, mesh);
    }
  }

  _buildRampMesh(r, material) {
    const hw = r.w / 2;
    const hd = r.d / 2;
    const h = r.h;
    let vertices;
    if (r.axis === 'z') {
      const yNeg = r.dir > 0 ? 0 : h;
      const yPos = r.dir > 0 ? h : 0;
      vertices = new Float32Array([
        // Top slope (two tris)
        -hw, yNeg, -hd,  hw, yNeg, -hd,  hw, yPos, hd,
        -hw, yNeg, -hd,  hw, yPos, hd,  -hw, yPos, hd,
        // Bottom
        -hw, 0, -hd,  hw, 0, hd,  hw, 0, -hd,
        -hw, 0, -hd,  -hw, 0, hd,  hw, 0, hd,
        // Left & Right sides
        -hw, 0, -hd,  -hw, yPos, hd,  -hw, 0, hd,
        -hw, 0, -hd,  -hw, yNeg, -hd,  -hw, yPos, hd,
        hw, 0, -hd,  hw, 0, hd,  hw, yPos, hd,
        hw, 0, -hd,  hw, yPos, hd,  hw, yNeg, -hd,
        // Back wall
        -hw, 0, hd,  -hw, yPos, hd,  hw, yPos, hd,
        -hw, 0, hd,  hw, yPos, hd,  hw, 0, hd,
        -hw, 0, -hd,  hw, yNeg, -hd,  -hw, yNeg, -hd,
        -hw, 0, -hd,  hw, 0, -hd,  hw, yNeg, -hd,
      ]);
    } else {
      const yNeg = r.dir > 0 ? 0 : h;
      const yPos = r.dir > 0 ? h : 0;
      vertices = new Float32Array([
        -hw, yNeg, -hd,  hw, yPos, -hd,  hw, yPos, hd,
        -hw, yNeg, -hd,  hw, yPos, hd,  -hw, yNeg, hd,
        -hw, 0, -hd,  hw, 0, hd,  hw, 0, -hd,
        -hw, 0, -hd,  -hw, 0, hd,  hw, 0, hd,
        -hw, 0, -hd,  -hw, yNeg, -hd,  hw, yPos, -hd,
        -hw, 0, -hd,  hw, yPos, -hd,  hw, 0, -hd,
        -hw, 0, hd,  hw, yPos, hd,  -hw, yNeg, hd,
        -hw, 0, hd,  hw, 0, hd,  hw, yPos, hd,
        hw, 0, -hd,  hw, yPos, -hd,  hw, yPos, hd,
        hw, 0, -hd,  hw, yPos, hd,  hw, 0, hd,
        -hw, 0, -hd,  -hw, yNeg, hd,  -hw, yNeg, -hd,
        -hw, 0, -hd,  -hw, 0, hd,  -hw, yNeg, hd,
      ]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(r.x, r.y, r.z);
    return mesh;
  }

  triggerRecoil(amount = 0.09) {
    this.recoilOffset = Math.min(0.2, this.recoilOffset + amount);
  }

  addBeam(start, end, hexColor, duration = 0.14) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: hexColor, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.fxGroup.add(line);
    this.beams.push({ line, life: duration, maxLife: duration });
  }

  addExplosion(pos, radius, hexColor) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 14, 10),
      new THREE.MeshBasicMaterial({ color: hexColor, transparent: true, opacity: 0.78, wireframe: false })
    );
    mesh.position.set(pos.x, pos.y, pos.z);
    this.fxGroup.add(mesh);
    this.explosions.push({ mesh, maxRadius: Math.max(1.5, radius), life: 0.28, maxLife: 0.28 });
  }

  _getOrCreateActorMesh(actor) {
    let group = this.actorMeshes.get(actor.id);
    if (group) return group;

    group = new THREE.Group();
    const isAlpha = actor.team === 'alpha';
    const bodyHex = actor.isRemote ? '#38bdf8' : isAlpha ? '#3b82f6' : '#ef4444';
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyHex,
      roughness: 0.35,
      metalness: 0.55,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.6,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.92, 0.44), bodyMat);
    torso.position.y = 0.95;

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.36), darkMat);
    legs.position.y = 0.29;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), darkMat);
    head.position.y = 1.62;

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: bodyHex, emissiveIntensity: 1.2 })
    );
    visor.position.set(0, 1.64, -0.2);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.25 })
    );
    gun.position.set(0.42, 1.1, -0.28);

    const label = makeNameplateSprite(actor.name, bodyHex);
    label.position.set(0, 2.25, 0);

    group.add(legs, torso, head, visor, gun, label);
    group.userData = { torso, visor, gun, label, bodyMat };
    this.actorsGroup.add(group);
    this.actorMeshes.set(actor.id, group);
    return group;
  }

  render({ localPlayer, actors, projectiles, pickupStates, timeSec, dt, scoped }) {
    // Camera transform
    const eyeHeight = localPlayer.crouching ? 1.05 : 1.56;
    this.camera.position.set(localPlayer.x, localPlayer.y + eyeHeight, localPlayer.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = localPlayer.yaw;
    this.camera.rotation.x = localPlayer.pitch;
    this.camera.rotation.z = localPlayer.tilt || 0;

    // FOV for scope & speed feel
    const speed = Math.hypot(localPlayer.vx, localPlayer.vz);
    const targetFov = scoped ? 34 : 82 + Math.min(10, Math.max(0, (speed - 14) * 0.7));
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 14 * dt);
      this.camera.updateProjectionMatrix();
    }

    // Viewmodel update
    const wSpec = WEAPONS[localPlayer.weaponId] || WEAPONS.pistol;
    this.weaponMesh.visible = !scoped && localPlayer.alive;
    this.weaponMesh.userData.accent.material.color.setHex(wSpec.color);
    this.weaponMesh.userData.accent.material.emissive.setHex(wSpec.color);
    this.weaponMesh.userData.swordBlade.visible = localPlayer.weaponId === 'sword';
    this.weaponMesh.userData.barrel.visible = localPlayer.weaponId !== 'sword';

    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.9);
    const bob = localPlayer.grounded && speed > 1.5 ? Math.sin(timeSec * 12) * 0.015 : 0;
    const reloadDip = localPlayer.reloadingUntil > timeSec ? -0.14 : 0;
    this.weaponMesh.position.set(0.24, -0.22 + bob + reloadDip, -0.38 + this.recoilOffset);
    this.weaponMesh.rotation.x = this.recoilOffset * 1.4;

    // Animate jump pads & pickups
    for (let i = 0; i < this.padMeshes.length; i++) {
      this.padMeshes[i].position.y = 0.16 + Math.sin(timeSec * 5 + i) * 0.05;
    }
    for (const [id, mesh] of this.pickupMeshes.entries()) {
      const active = pickupStates.get(id) ?? true;
      mesh.visible = active;
      if (active) {
        mesh.rotation.y = timeSec * 2.2;
        mesh.position.y += Math.sin(timeSec * 3.5) * 0.002;
      }
    }

    // Update actors
    const activeIds = new Set();
    for (const actor of actors) {
      if (actor.id === localPlayer.id) continue;
      activeIds.add(actor.id);
      const mesh = this._getOrCreateActorMesh(actor);
      mesh.visible = actor.alive;
      if (!actor.alive) continue;
      mesh.position.set(actor.x, actor.y, actor.z);
      mesh.rotation.y = actor.yaw;
      const wCol = WEAPONS[actor.weaponId]?.color ?? 0x9ca3af;
      mesh.userData.gun.material.color.setHex(wCol);
      mesh.userData.bodyMat.emissive.setHex(actor.hitFlash > 0 ? 0xffffff : actor.burnTimer > 0 ? 0xf97316 : actor.shockTimer > 0 ? 0xa855f7 : 0x000000);
      mesh.userData.bodyMat.emissiveIntensity = actor.hitFlash > 0 ? 0.8 : 0.35;
    }
    for (const [id, mesh] of this.actorMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.actorsGroup.remove(mesh);
        this.actorMeshes.delete(id);
      }
    }

    // Update projectiles
    const activeProj = new Set();
    for (const p of projectiles) {
      activeProj.add(p.id);
      let mesh = this.projMeshes.get(p.id);
      if (!mesh) {
        const size = p.weaponId === 'rocket' ? 0.22 : p.weaponId === 'grenade' ? 0.2 : 0.14;
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(size, 8, 8),
          new THREE.MeshBasicMaterial({ color: p.color })
        );
        this.fxGroup.add(mesh);
        this.projMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
    }
    for (const [id, mesh] of this.projMeshes.entries()) {
      if (!activeProj.has(id)) {
        this.fxGroup.remove(mesh);
        this.projMeshes.delete(id);
      }
    }

    // Fade beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.fxGroup.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.beams.splice(i, 1);
      } else {
        b.line.material.opacity = b.life / b.maxLife;
      }
    }

    // Expand explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.fxGroup.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.explosions.splice(i, 1);
      } else {
        const t = 1 - e.life / e.maxLife;
        const s = 1 + t * e.maxRadius * 1.4;
        e.mesh.scale.set(s, s, s);
        e.mesh.material.opacity = (1 - t) * 0.72;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
