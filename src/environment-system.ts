import {
  createSystem,
  Mesh,
  Group,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineSegments,
  EdgesGeometry,
  LineBasicMaterial,
  AmbientLight,
  PointLight,
  Fog,
  Color,
  AdditiveBlending,
} from '@iwsdk/core';

interface Comet {
  mesh: Mesh;
  trail: Mesh;
  vel: { x: number; y: number };
  life: number;
  maxLife: number;
}

export class EnvironmentSystem extends createSystem({}) {
  private pillars: Group[] = [];
  private ceilingLights: Mesh[] = [];
  private pillarTrims: Mesh[] = [];
  private mainLight!: PointLight;
  private accentLight!: PointLight;
  private ambient!: AmbientLight;

  // Comets
  private comets: Comet[] = [];
  private cometTimer = 0;
  private cometInterval = 3;

  // Wave theme
  private currentPrimary = new Color(0x00ffff);
  private currentSecondary = new Color(0xff00ff);
  private targetPrimary = new Color(0x00ffff);
  private targetSecondary = new Color(0xff00ff);
  private themeLerp = 1;

  init() {
    // Fog
    this.scene.fog = new Fog(0x000811, 8, 30);
    this.scene.background = new Color(0x000811);

    // Lights
    this.ambient = new AmbientLight(0x112244, 0.4);
    this.scene.add(this.ambient);

    this.mainLight = new PointLight(0x00ffff, 1.5, 20);
    this.mainLight.position.set(0, 5, 2);
    this.scene.add(this.mainLight);

    this.accentLight = new PointLight(0xff00ff, 0.6, 15);
    this.accentLight.position.set(-3, 3, -2);
    this.scene.add(this.accentLight);

    const accentLight2 = new PointLight(0x00ff88, 0.4, 12);
    accentLight2.position.set(3, 2, -1);
    this.scene.add(accentLight2);

    // Floor
    this.createFloor();

    // Pillars
    this.createPillars();

    // Ceiling
    this.createCeiling();

    // Grid lines
    this.createGridLines();
  }

  setWaveTheme(primary: number, secondary: number, ambient: number) {
    this.targetPrimary.setHex(primary);
    this.targetSecondary.setHex(secondary);
    this.themeLerp = 0;
    this.ambient.color.setHex(ambient);
  }

  private createFloor() {
    const floorGeo = new BoxGeometry(12, 0.02, 8);
    const floorMat = new MeshStandardMaterial({
      color: 0x001122,
      emissive: 0x001122,
      emissiveIntensity: 0.2,
    });
    const floor = new Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.01, 0);
    this.scene.add(floor);

    for (let x = -5; x <= 5; x++) {
      const geo = new BoxGeometry(0.005, 0.005, 8);
      const mat = new MeshBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.3 });
      const line = new Mesh(geo, mat);
      line.position.set(x, 0.01, 0);
      this.scene.add(line);
    }
    for (let z = -4; z <= 4; z++) {
      const geo = new BoxGeometry(12, 0.005, 0.005);
      const mat = new MeshBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.3 });
      const line = new Mesh(geo, mat);
      line.position.set(0, 0.01, z);
      this.scene.add(line);
    }
  }

  private createPillars() {
    const pillarPositions = [
      [-5, 0, -3], [5, 0, -3],
      [-5, 0, 3], [5, 0, 3],
      [-5, 0, 0], [5, 0, 0],
    ];

    for (const [px, py, pz] of pillarPositions) {
      const group = new Group();
      group.position.set(px, py, pz);

      const bodyGeo = new CylinderGeometry(0.08, 0.08, 5, 8);
      const bodyMat = new MeshStandardMaterial({
        color: 0x112233,
        emissive: 0x001122,
        emissiveIntensity: 0.3,
      });
      const body = new Mesh(bodyGeo, bodyMat);
      body.position.y = 2.5;
      group.add(body);

      const trimGeo = new CylinderGeometry(0.1, 0.1, 0.05, 8);
      const trimMat = new MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.6,
      });

      const trimYs = [0.5, 2.5, 4.5];
      for (const ty of trimYs) {
        const trim = new Mesh(trimGeo.clone(), trimMat.clone());
        trim.position.y = ty;
        group.add(trim);
        this.pillarTrims.push(trim);
      }

      const capGeo = new SphereGeometry(0.12, 8, 6);
      const capMat = new MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
      });
      const cap = new Mesh(capGeo, capMat);
      cap.position.y = 5;
      group.add(cap);

      this.scene.add(group);
      this.pillars.push(group);
    }
  }

  private createCeiling() {
    const ceilGeo = new BoxGeometry(12, 0.02, 8);
    const ceilMat = new MeshStandardMaterial({
      color: 0x001122,
      emissive: 0x001122,
      emissiveIntensity: 0.1,
    });
    const ceiling = new Mesh(ceilGeo, ceilMat);
    ceiling.position.set(0, 5, 0);
    this.scene.add(ceiling);

    const lightColors = [0x00ffff, 0xff00ff, 0x00ff88, 0xffaa00];
    for (let i = 0; i < 4; i++) {
      const stripGeo = new BoxGeometry(10, 0.02, 0.1);
      const stripMat = new MeshBasicMaterial({
        color: lightColors[i],
        transparent: true,
        opacity: 0.4,
        blending: AdditiveBlending,
      });
      const strip = new Mesh(stripGeo, stripMat);
      strip.position.set(0, 4.98, -2 + i * 1.3);
      this.scene.add(strip);
      this.ceilingLights.push(strip);
    }
  }

  private createGridLines() {
    for (let y = 0; y <= 5; y += 0.5) {
      const geo = new BoxGeometry(10, 0.003, 0.003);
      const mat = new MeshBasicMaterial({ color: 0x002244, transparent: true, opacity: 0.2 });
      const line = new Mesh(geo, mat);
      line.position.set(0, y, -3.5);
      this.scene.add(line);
    }
    for (let x = -5; x <= 5; x += 0.5) {
      const geo = new BoxGeometry(0.003, 5, 0.003);
      const mat = new MeshBasicMaterial({ color: 0x002244, transparent: true, opacity: 0.2 });
      const line = new Mesh(geo, mat);
      line.position.set(x, 2.5, -3.5);
      this.scene.add(line);
    }
  }

  private spawnComet() {
    // Random start position at top/side
    const startSide = Math.random() > 0.5;
    let x: number, y: number, vx: number, vy: number;

    if (startSide) {
      // From side
      const fromLeft = Math.random() > 0.5;
      x = fromLeft ? -8 : 8;
      y = 3 + Math.random() * 2;
      vx = fromLeft ? 3 + Math.random() * 2 : -(3 + Math.random() * 2);
      vy = -(1 + Math.random() * 1.5);
    } else {
      // From top
      x = (Math.random() - 0.5) * 12;
      y = 6;
      vx = (Math.random() - 0.5) * 2;
      vy = -(2 + Math.random() * 2);
    }

    // Comet head
    const headGeo = new SphereGeometry(0.04, 6, 4);
    const cometColor = Math.random() > 0.6 ? 0x00ffff : Math.random() > 0.5 ? 0xff88ff : 0xffaa44;
    const headMat = new MeshBasicMaterial({
      color: cometColor,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
    });
    const head = new Mesh(headGeo, headMat);
    head.position.set(x, y, -5 - Math.random() * 6);

    // Trail — elongated box
    const trailGeo = new BoxGeometry(0.02, 0.3, 0.02);
    const trailMat = new MeshBasicMaterial({
      color: cometColor,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
    });
    const trail = new Mesh(trailGeo, trailMat);
    // Orient trail opposite to velocity
    const angle = Math.atan2(vx, vy);
    trail.rotation.z = -angle;
    head.add(trail);
    trail.position.set(0, 0.15, 0);

    this.scene.add(head);

    const life = 2 + Math.random() * 2;
    this.comets.push({
      mesh: head,
      trail,
      vel: { x: vx, y: vy },
      life,
      maxLife: life,
    });
  }

  update(delta: number, time: number) {
    // Pulse ceiling lights
    for (let i = 0; i < this.ceilingLights.length; i++) {
      const mat = this.ceilingLights[i].material as MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(time * 0.5 + i * 1.5) * 0.1;
    }

    // Pillar trim pulsing with theme color
    for (let i = 0; i < this.pillarTrims.length; i++) {
      const trim = this.pillarTrims[i];
      const mat = trim.material as MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(time * 0.8 + i * 0.7) * 0.2;
      mat.color.copy(this.currentPrimary);
      mat.emissive.copy(this.currentPrimary);
    }

    // Lerp theme colors
    if (this.themeLerp < 1) {
      this.themeLerp = Math.min(1, this.themeLerp + delta * 0.8);
      this.currentPrimary.lerp(this.targetPrimary, this.themeLerp);
      this.currentSecondary.lerp(this.targetSecondary, this.themeLerp);
      this.mainLight.color.copy(this.currentPrimary);
      this.accentLight.color.copy(this.currentSecondary);
    }

    // Comets
    this.cometTimer += delta;
    if (this.cometTimer >= this.cometInterval) {
      this.cometTimer = 0;
      this.cometInterval = 2 + Math.random() * 4;
      this.spawnComet();
    }

    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.life -= delta;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.comets.splice(i, 1);
        continue;
      }
      c.mesh.position.x += c.vel.x * delta;
      c.mesh.position.y += c.vel.y * delta;
      const frac = c.life / c.maxLife;
      (c.mesh.material as MeshBasicMaterial).opacity = frac * 0.9;
      (c.trail.material as MeshBasicMaterial).opacity = frac * 0.4;
    }
  }
}
