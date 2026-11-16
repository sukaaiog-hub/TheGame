import * as THREE from 'three';
import { getKartDefinition } from './karts';
import { BuiltTrack } from './tracks';
import type { ItemBoxState, KartId, ProjectileState, RacerState } from './types';

interface KartVisual {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheels: THREE.Mesh[];
  rearWheels: THREE.Mesh[];
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
  driftGlow: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  nameSprite: THREE.Sprite;
  lastTagText: string;
}

export class KartSceneRenderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private track: BuiltTrack;
  private kartVisuals = new Map<string, KartVisual>();
  private itemBoxMeshes = new Map<string, THREE.Group>();
  private projectileMeshes = new Map<string, THREE.Group>();
  private cameraWide = false;
  private camPos = new THREE.Vector3(0, 8, -14);
  private camLook = new THREE.Vector3(0, 1, 10);
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, track: BuiltTrack) {
    this.container = container;
    this.track = track;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(track.def.skyTopColor);
    this.scene.fog = new THREE.FogExp2(track.def.fogColor, 0.0021);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.5, 950);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.buildEnvironment();
    this.buildTrackMeshes();
    this.buildBoostPads();
    this.buildInitialItemBoxes();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  public toggleCameraMode(): boolean {
    this.cameraWide = !this.cameraWide;
    return this.cameraWide;
  }

  private handleResize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight('#e0f2fe', this.track.def.groundColor, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fffbeb', 1.45);
    sun.position.set(140, 220, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 650;
    const d = 280;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);
  }

  private buildEnvironment(): void {
    // Large terrain ground plane
    const groundGeo = new THREE.PlaneGeometry(1400, 1400);
    const groundMat = new THREE.MeshLambertMaterial({ color: this.track.def.groundColor });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Theme-specific outer horizon / hazard plane
    if (this.track.def.id === 'lighthouse_bay') {
      const seaGeo = new THREE.RingGeometry(245, 760, 48);
      const seaMat = new THREE.MeshBasicMaterial({ color: '#0284c7', side: THREE.DoubleSide });
      const sea = new THREE.Mesh(seaGeo, seaMat);
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(105, -0.7, 10);
      this.scene.add(sea);

      // Iconic Lighthouse landmark
      const tower = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 10, 46, 16),
        new THREE.MeshLambertMaterial({ color: '#f8fafc' })
      );
      base.position.y = 23;
      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(8.2, 8.9, 12, 16),
        new THREE.MeshLambertMaterial({ color: '#ef4444' })
      );
      stripe.position.y = 22;
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(5.5, 14, 14),
        new THREE.MeshBasicMaterial({ color: '#fde047' })
      );
      beacon.position.y = 48;
      tower.add(base, stripe, beacon);
      tower.position.set(108, 0, 15);
      this.scene.add(tower);
    } else if (this.track.def.id === 'magma_caldera') {
      const lavaGeo = new THREE.PlaneGeometry(1200, 1200);
      const lavaMat = new THREE.MeshBasicMaterial({ color: '#ea580c' });
      const lava = new THREE.Mesh(lavaGeo, lavaMat);
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = -2.2;
      this.scene.add(lava);
    }

    // Scenic props placed safely outside the track boundary
    const propCount = 46;
    const minDistFromTrack = this.track.wallHalfWidth + 10;
    for (let i = 0; i < propCount; i++) {
      const angle = (i / propCount) * Math.PI * 2;
      const radius = 110 + (i % 5) * 48;
      const centerX = this.track.def.id === 'frozen_tundra' ? -80 : 95;
      const px = centerX + Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      // Ensure prop is well clear of all road samples
      let tooClose = false;
      for (let s = 0; s < this.track.samples.length; s += 3) {
        const sp = this.track.samples[s];
        const dx = px - sp.x;
        const dz = pz - sp.z;
        if (dx * dx + dz * dz < minDistFromTrack * minDistFromTrack) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const prop = this.createSceneryProp(i);
      prop.position.set(px, -1.0, pz);
      this.scene.add(prop);
    }
  }

  private createSceneryProp(seed: number): THREE.Group {
    const group = new THREE.Group();
    const scale = 0.85 + (seed % 4) * 0.25;
    group.scale.setScalar(scale);

    if (this.track.def.id === 'lighthouse_bay') {
      // Palm tree
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 1.0, 11, 8),
        new THREE.MeshLambertMaterial({ color: '#92400e' })
      );
      trunk.position.y = 5.5;
      group.add(trunk);
      const leafMat = new THREE.MeshLambertMaterial({ color: '#16a34a' });
      for (let k = 0; k < 5; k++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6.5, 5), leafMat);
        frond.position.y = 11;
        frond.rotation.z = Math.PI * 0.36;
        frond.rotation.y = (k / 5) * Math.PI * 2;
        group.add(frond);
      }
    } else if (this.track.def.id === 'frozen_tundra') {
      // Snow-topped pine or ice crystal
      if (seed % 3 === 0) {
        const crystal = new THREE.Mesh(
          new THREE.ConeGeometry(3.2, 13, 6),
          new THREE.MeshLambertMaterial({ color: '#38bdf8', emissive: '#0c4a6e' })
        );
        crystal.position.y = 6.5;
        group.add(crystal);
      } else {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 1.0, 5, 6),
          new THREE.MeshLambertMaterial({ color: '#78350f' })
        );
        trunk.position.y = 2.5;
        const pine1 = new THREE.Mesh(
          new THREE.ConeGeometry(4.2, 8, 7),
          new THREE.MeshLambertMaterial({ color: '#0f766e' })
        );
        pine1.position.y = 7.5;
        const snowCap = new THREE.Mesh(
          new THREE.ConeGeometry(2.8, 5, 7),
          new THREE.MeshLambertMaterial({ color: '#f8fafc' })
        );
        snowCap.position.y = 11.5;
        group.add(trunk, pine1, snowCap);
      }
    } else {
      // Obsidian spire with ember top
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(4.2, 16, 6),
        new THREE.MeshLambertMaterial({ color: '#1c1917' })
      );
      spire.position.y = 8;
      const ember = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.8),
        new THREE.MeshBasicMaterial({ color: '#f97316' })
      );
      ember.position.y = 16.8;
      group.add(spire, ember);
    }

    return group;
  }

  private buildTrackMeshes(): void {
    const samples = this.track.samples;
    const n = samples.length;
    const halfRoad = this.track.roadWidth * 0.5;
    const curbOuter = halfRoad + 1.8;
    const wallOffset = this.track.wallHalfWidth + 0.8;

    const roadPositions: number[] = [];
    const roadColors: number[] = [];
    const curbPositions: number[] = [];
    const curbColors: number[] = [];
    const railLeftPositions: number[] = [];
    const railRightPositions: number[] = [];

    const roadBase = new THREE.Color(this.track.def.roadColor);
    const roadStripe = new THREE.Color('#475569').lerp(new THREE.Color('#ffffff'), 0.25);
    const curbA = new THREE.Color(this.track.def.curbColorA);
    const curbB = new THREE.Color(this.track.def.curbColorB);

    const pushTri = (arr: number[], a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
      arr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    };
    const pushColorTri = (arr: number[], col: THREE.Color) => {
      arr.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
    };

    for (let i = 0; i < n; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % n];

      const l0: [number, number, number] = [s0.x - s0.nx * halfRoad, s0.y + 0.03, s0.z - s0.nz * halfRoad];
      const r0: [number, number, number] = [s0.x + s0.nx * halfRoad, s0.y + 0.03, s0.z + s0.nz * halfRoad];
      const l1: [number, number, number] = [s1.x - s1.nx * halfRoad, s1.y + 0.03, s1.z - s1.nz * halfRoad];
      const r1: [number, number, number] = [s1.x + s1.nx * halfRoad, s1.y + 0.03, s1.z + s1.nz * halfRoad];

      pushTri(roadPositions, l0, r0, r1);
      pushTri(roadPositions, l0, r1, l1);
      const rc = i % 4 === 0 ? roadStripe : roadBase;
      pushColorTri(roadColors, rc);
      pushColorTri(roadColors, rc);

      // Left & right alternating curbs
      const clOut0: [number, number, number] = [s0.x - s0.nx * curbOuter, s0.y + 0.02, s0.z - s0.nz * curbOuter];
      const clOut1: [number, number, number] = [s1.x - s1.nx * curbOuter, s1.y + 0.02, s1.z - s1.nz * curbOuter];
      const crOut0: [number, number, number] = [s0.x + s0.nx * curbOuter, s0.y + 0.02, s0.z + s0.nz * curbOuter];
      const crOut1: [number, number, number] = [s1.x + s1.nx * curbOuter, s1.y + 0.02, s1.z + s1.nz * curbOuter];

      const cc = Math.floor(i / 2) % 2 === 0 ? curbA : curbB;
      pushTri(curbPositions, clOut0, l0, l1);
      pushTri(curbPositions, clOut0, l1, clOut1);
      pushColorTri(curbColors, cc);
      pushColorTri(curbColors, cc);

      pushTri(curbPositions, r0, crOut0, crOut1);
      pushTri(curbPositions, r0, crOut1, r1);
      pushColorTri(curbColors, cc);
      pushColorTri(curbColors, cc);

      // Guardrails
      const wl0b: [number, number, number] = [s0.x - s0.nx * wallOffset, s0.y, s0.z - s0.nz * wallOffset];
      const wl0t: [number, number, number] = [s0.x - s0.nx * wallOffset, s0.y + 1.5, s0.z - s0.nz * wallOffset];
      const wl1b: [number, number, number] = [s1.x - s1.nx * wallOffset, s1.y, s1.z - s1.nz * wallOffset];
      const wl1t: [number, number, number] = [s1.x - s1.nx * wallOffset, s1.y + 1.5, s1.z - s1.nz * wallOffset];
      pushTri(railLeftPositions, wl0b, wl0t, wl1t);
      pushTri(railLeftPositions, wl0b, wl1t, wl1b);

      const wr0b: [number, number, number] = [s0.x + s0.nx * wallOffset, s0.y, s0.z + s0.nz * wallOffset];
      const wr0t: [number, number, number] = [s0.x + s0.nx * wallOffset, s0.y + 1.5, s0.z + s0.nz * wallOffset];
      const wr1b: [number, number, number] = [s1.x + s1.nx * wallOffset, s1.y, s1.z + s1.nz * wallOffset];
      const wr1t: [number, number, number] = [s1.x + s1.nx * wallOffset, s1.y + 1.5, s1.z + s1.nz * wallOffset];
      pushTri(railRightPositions, wr0b, wr1t, wr0t);
      pushTri(railRightPositions, wr0b, wr1b, wr1t);
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
    roadGeo.computeVertexNormals();
    const roadMesh = new THREE.Mesh(
      roadGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
    curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
    curbGeo.computeVertexNormals();
    const curbMesh = new THREE.Mesh(
      curbGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    curbMesh.receiveShadow = true;
    this.scene.add(curbMesh);

    const railMat = new THREE.MeshLambertMaterial({
      color: this.track.def.accentColor,
      side: THREE.DoubleSide,
    });
    const railLGeo = new THREE.BufferGeometry();
    railLGeo.setAttribute('position', new THREE.Float32BufferAttribute(railLeftPositions, 3));
    railLGeo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(railLGeo, railMat));

    const railRGeo = new THREE.BufferGeometry();
    railRGeo.setAttribute('position', new THREE.Float32BufferAttribute(railRightPositions, 3));
    railRGeo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(railRGeo, railMat));

    // Checkered Start/Finish Gantry Arch at sample 0
    const start = samples[0];
    const gantry = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: '#f8fafc' });
    const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 10), postMat);
    leftPost.position.set(-halfRoad - 0.5, 4.5, 0);
    const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 10), postMat);
    rightPost.position.set(halfRoad + 0.5, 4.5, 0);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.track.roadWidth + 2, 2.2, 1.2),
      new THREE.MeshBasicMaterial({ map: this.createCheckerTexture() })
    );
    banner.position.set(0, 8.2, 0);

    const lineStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(this.track.roadWidth, 3.0),
      new THREE.MeshBasicMaterial({ map: this.createCheckerTexture(), side: THREE.DoubleSide })
    );
    lineStrip.rotation.x = -Math.PI / 2;
    lineStrip.position.y = 0.08;

    gantry.add(leftPost, rightPost, banner, lineStrip);
    gantry.position.set(start.x, start.y, start.z);
    gantry.rotation.y = start.yaw;
    this.scene.add(gantry);
  }

  private createCheckerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const cols = 16;
    const rows = 4;
    const cw = canvas.width / cols;
    const ch = canvas.height / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#0f172a' : '#f8fafc';
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private buildBoostPads(): void {
    const padGeo = new THREE.PlaneGeometry(4.2, 6.2);
    const padMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      side: THREE.DoubleSide,
    });
    const innerGeo = new THREE.PlaneGeometry(2.4, 4.4);
    const innerMat = new THREE.MeshBasicMaterial({
      color: '#facc15',
      side: THREE.DoubleSide,
    });

    for (const pad of this.track.boostPads) {
      const grp = new THREE.Group();
      const outer = new THREE.Mesh(padGeo, padMat);
      outer.rotation.x = -Math.PI / 2;
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.02;
      grp.add(outer, inner);
      grp.position.set(pad.x, pad.y, pad.z);
      grp.rotation.y = pad.yaw;
      this.scene.add(grp);
    }
  }

  private buildInitialItemBoxes(): void {
    const outerGeo = new THREE.BoxGeometry(1.9, 1.9, 1.9);
    const outerMat = new THREE.MeshPhongMaterial({
      color: '#facc15',
      emissive: '#d97706',
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.88,
    });
    const coreGeo = new THREE.OctahedronGeometry(0.75);
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ec4899' });

    for (const box of this.track.initialItemBoxes) {
      const grp = new THREE.Group();
      const outer = new THREE.Mesh(outerGeo, outerMat);
      const core = new THREE.Mesh(coreGeo, coreMat);
      grp.add(outer, core);
      grp.position.set(box.x, box.y, box.z);
      this.scene.add(grp);
      this.itemBoxMeshes.set(box.id, grp);
    }
  }

  private createNameSprite(label: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    this.drawTagCanvas(ctx, canvas.width, canvas.height, label);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4.5, 1.15, 1);
    sprite.position.set(0, 3.1, 0);
    return sprite;
  }

  private drawTagCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, label: string): void {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(12, 10, w - 24, h - 20, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 18), w / 2, h / 2 + 1);
  }

  private createKartVisual(racer: RacerState): KartVisual {
    const def = getKartDefinition(racer.kartId);
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    // Main kart chassis
    const primaryMat = new THREE.MeshLambertMaterial({ color: def.primaryColor });
    const secondaryMat = new THREE.MeshLambertMaterial({ color: def.secondaryColor });
    const accentMat = new THREE.MeshLambertMaterial({ color: def.accentColor });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#0f172a' });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 3.1), primaryMat);
    chassis.position.set(0, 0.58, 0);
    chassis.castShadow = true;
    bodyGroup.add(chassis);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.4, 0.9), secondaryMat);
    nose.position.set(0, 0.5, 1.65);
    nose.castShadow = true;
    bodyGroup.add(nose);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.55), accentMat);
    spoiler.position.set(0, 1.25, -1.4);
    bodyGroup.add(spoiler);

    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.25), darkMat);
    strutL.position.set(-0.65, 1.0, -1.35);
    const strutR = strutL.clone();
    strutR.position.x = 0.65;
    bodyGroup.add(strutL, strutR);

    // Character driver head + mascot detail
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), secondaryMat);
    head.position.set(0, 1.32, -0.15);
    head.castShadow = true;
    bodyGroup.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      primaryMat
    );
    helmet.position.set(0, 1.36, -0.15);
    bodyGroup.add(helmet);

    const mascotBadge = this.createCharacterDetail(racer.kartId, accentMat);
    mascotBadge.position.set(0, 1.32, 0.35);
    bodyGroup.add(mascotBadge);

    // 4 wheels
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.38, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const frontWheels: THREE.Mesh[] = [];
    const rearWheels: THREE.Mesh[] = [];

    const wheelPositions: Array<[number, number, number, boolean]> = [
      [-1.02, 0.45, 1.05, true],
      [1.02, 0.45, 1.05, true],
      [-1.08, 0.48, -1.05, false],
      [1.08, 0.48, -1.05, false],
    ];
    for (const [wx, wy, wz, isFront] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.rotation.order = 'YXZ';
      wheel.position.set(wx, wy, wz);
      wheel.castShadow = true;
      bodyGroup.add(wheel);
      if (isFront) frontWheels.push(wheel);
      else rearWheels.push(wheel);
    }

    // Twin boost flame cones
    const flameGeo = new THREE.ConeGeometry(0.24, 1.25, 8);
    flameGeo.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const flameLeft = new THREE.Mesh(flameGeo, flameMat);
    flameLeft.position.set(-0.45, 0.62, -2.05);
    flameLeft.visible = false;
    const flameRight = flameLeft.clone();
    flameRight.position.x = 0.45;
    bodyGroup.add(flameLeft, flameRight);

    // Drift sparks aura
    const driftGlow = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.1, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.75 })
    );
    driftGlow.rotation.x = Math.PI / 2;
    driftGlow.position.set(0, 0.25, -0.4);
    driftGlow.visible = false;
    bodyGroup.add(driftGlow);

    // Bubblegum Shield sphere
    const shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.15, 18, 16),
      new THREE.MeshBasicMaterial({
        color: '#c084fc',
        transparent: true,
        opacity: 0.34,
        wireframe: false,
      })
    );
    shieldMesh.position.y = 1.05;
    shieldMesh.visible = false;
    root.add(shieldMesh);

    const tagText = `#${racer.position} ${racer.nickname}`;
    const nameSprite = this.createNameSprite(tagText);
    root.add(nameSprite);

    this.scene.add(root);

    return {
      root,
      bodyGroup,
      frontWheels,
      rearWheels,
      flameLeft,
      flameRight,
      driftGlow,
      shieldMesh,
      nameSprite,
      lastTagText: tagText,
    };
  }

  private createCharacterDetail(kartId: KartId, accentMat: THREE.Material): THREE.Object3D {
    const grp = new THREE.Group();
    if (kartId === 'tux' || kartId === 'hexley') {
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 6), accentMat);
      beak.rotation.x = Math.PI / 2;
      grp.add(beak);
    } else if (kartId === 'konqi') {
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 6), accentMat);
      hornL.position.set(-0.26, 0.42, -0.35);
      const hornR = hornL.clone();
      hornR.position.x = 0.26;
      grp.add(hornL, hornR);
    } else if (kartId === 'wilber' || kartId === 'sara') {
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 5), accentMat);
      earL.position.set(-0.28, 0.44, -0.35);
      const earR = earL.clone();
      earR.position.x = 0.28;
      grp.add(earL, earR);
    } else {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.4), accentMat);
      fin.position.set(0, 0.45, -0.4);
      grp.add(fin);
    }
    return grp;
  }

  public renderFrame(
    racers: RacerState[],
    localRacerId: string,
    itemBoxes: ItemBoxState[],
    projectiles: ProjectileState[],
    nowSec: number,
    dt: number
  ): void {
    // Animate & toggle item boxes
    for (const box of itemBoxes) {
      const mesh = this.itemBoxMeshes.get(box.id);
      if (!mesh) continue;
      mesh.visible = box.active;
      if (box.active) {
        mesh.rotation.y = nowSec * 2.2;
        mesh.position.y = box.y + Math.sin(nowSec * 3.5 + box.x) * 0.22;
      }
    }

    // Sync projectile meshes
    const activeProjIds = new Set(projectiles.map((p) => p.id));
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeProjIds.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
    for (const p of projectiles) {
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Group();
        if (p.kind === 'bowling') {
          const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.85, 14, 12),
            new THREE.MeshPhongMaterial({ color: '#0f172a', emissive: '#f97316', emissiveIntensity: 0.4 })
          );
          mesh.add(ball);
        } else {
          const gum = new THREE.Mesh(
            new THREE.ConeGeometry(0.75, 1.5, 10),
            new THREE.MeshBasicMaterial({ color: '#ec4899' })
          );
          gum.rotation.x = Math.PI / 2;
          mesh.add(gum);
        }
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.y = p.yaw;
      mesh.rotation.x += dt * 10;
    }

    // Update karts
    let localRacer: RacerState | null = null;
    for (const racer of racers) {
      if (racer.id === localRacerId) localRacer = racer;

      let vis = this.kartVisuals.get(racer.id);
      if (!vis) {
        vis = this.createKartVisual(racer);
        this.kartVisuals.set(racer.id, vis);
      }

      vis.root.position.set(racer.x, racer.y, racer.z);
      vis.root.rotation.y = racer.yaw;

      // Subtle tilt into drift / cornering
      const leanAngle = racer.isDrifting ? racer.driftDir * 0.14 : racer.steerAngle * 0.12;
      vis.bodyGroup.rotation.z += (leanAngle - vis.bodyGroup.rotation.z) * Math.min(1, dt * 10);

      // Wheel rotation & front steer
      const wheelSpin = racer.speed * dt * 1.4;
      for (const fw of vis.frontWheels) {
        fw.rotation.y = -racer.steerAngle * 0.65;
        fw.rotation.x += wheelSpin;
      }
      for (const rw of vis.rearWheels) {
        rw.rotation.x += wheelSpin;
      }

      // Boost flame
      const boosting = racer.boostTimer > 0;
      vis.flameLeft.visible = boosting;
      vis.flameRight.visible = boosting;
      if (boosting) {
        const flicker = 0.85 + Math.sin(nowSec * 45) * 0.3;
        vis.flameLeft.scale.set(1, 1, flicker);
        vis.flameRight.scale.set(1, 1, flicker);
      }

      // Drift sparks ring color
      vis.driftGlow.visible = racer.isDrifting && racer.driftTier > 0;
      if (vis.driftGlow.visible) {
        const mat = vis.driftGlow.material as THREE.MeshBasicMaterial;
        mat.color.set(
          racer.driftTier === 3 ? '#c084fc' : racer.driftTier === 2 ? '#f97316' : '#38bdf8'
        );
      }

      // Shield bubble
      vis.shieldMesh.visible = racer.shieldTimer > 0;
      if (vis.shieldMesh.visible) {
        vis.shieldMesh.rotation.y += dt * 1.8;
      }

      // Update floating rank + nickname badge when changed
      const desiredTag = `#${racer.position} ${racer.nickname}`;
      if (vis.lastTagText !== desiredTag) {
        vis.lastTagText = desiredTag;
        const mat = vis.nameSprite.material as THREE.SpriteMaterial;
        const tex = mat.map as THREE.CanvasTexture | null;
        if (tex && tex.image instanceof HTMLCanvasElement) {
          const ctx = tex.image.getContext('2d');
          if (ctx) {
            this.drawTagCanvas(ctx, tex.image.width, tex.image.height, desiredTag);
            tex.needsUpdate = true;
          }
        }
      }
      // Hide local player's own overhead tag so camera view stays clear
      vis.nameSprite.visible = racer.id !== localRacerId;
    }

    // Smooth chase camera following local player (or leader)
    const camTarget = localRacer ?? racers[0];
    if (camTarget) {
      const fx = Math.sin(camTarget.yaw);
      const fz = Math.cos(camTarget.yaw);
      const dist = this.cameraWide ? 14.5 : 10.2;
      const height = this.cameraWide ? 7.2 : 4.8;

      const desiredPos = new THREE.Vector3(
        camTarget.x - fx * dist,
        camTarget.y + height,
        camTarget.z - fz * dist
      );
      const desiredLook = new THREE.Vector3(
        camTarget.x + fx * 10,
        camTarget.y + 1.5,
        camTarget.z + fz * 10
      );

      const camAlpha = Math.min(1, dt * 8.5);
      this.camPos.lerp(desiredPos, camAlpha);
      this.camLook.lerp(desiredLook, Math.min(1, dt * 12));

      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);

      const targetFov = camTarget.boostTimer > 0 ? 77 : this.cameraWide ? 70 : 64;
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 7);
        this.camera.updateProjectionMatrix();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.resizeObserver?.disconnect();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
  }
}
