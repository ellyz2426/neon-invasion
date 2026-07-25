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

export class EnvironmentSystem extends createSystem({}) {
  private pillars: Group[] = [];
  private ceilingLights: Mesh[] = [];

  init() {
    // Fog
    this.scene.fog = new Fog(0x000811, 8, 30);
    this.scene.background = new Color(0x000811);

    // Lights
    const ambient = new AmbientLight(0x112244, 0.4);
    this.scene.add(ambient);

    const mainLight = new PointLight(0x00ffff, 1.5, 20);
    mainLight.position.set(0, 5, 2);
    this.scene.add(mainLight);

    const accentLight = new PointLight(0xff00ff, 0.6, 15);
    accentLight.position.set(-3, 3, -2);
    this.scene.add(accentLight);

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

  private createFloor() {
    // Main floor
    const floorGeo = new BoxGeometry(12, 0.02, 8);
    const floorMat = new MeshStandardMaterial({
      color: 0x001122,
      emissive: 0x001122,
      emissiveIntensity: 0.2,
    });
    const floor = new Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.01, 0);
    this.scene.add(floor);

    // Grid lines on floor
    const gridMat = new LineBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.3 });
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

      // Main pillar body
      const bodyGeo = new CylinderGeometry(0.08, 0.08, 5, 8);
      const bodyMat = new MeshStandardMaterial({
        color: 0x112233,
        emissive: 0x001122,
        emissiveIntensity: 0.3,
      });
      const body = new Mesh(bodyGeo, bodyMat);
      body.position.y = 2.5;
      group.add(body);

      // Neon trim
      const trimGeo = new CylinderGeometry(0.1, 0.1, 0.05, 8);
      const trimMat = new MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.6,
      });
      const trim1 = new Mesh(trimGeo, trimMat);
      trim1.position.y = 0.5;
      group.add(trim1);

      const trim2 = new Mesh(trimGeo.clone(), trimMat.clone());
      trim2.position.y = 2.5;
      group.add(trim2);

      const trim3 = new Mesh(trimGeo.clone(), trimMat.clone());
      trim3.position.y = 4.5;
      group.add(trim3);

      // Cap glow
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
    // Ceiling frame
    const ceilGeo = new BoxGeometry(12, 0.02, 8);
    const ceilMat = new MeshStandardMaterial({
      color: 0x001122,
      emissive: 0x001122,
      emissiveIntensity: 0.1,
    });
    const ceiling = new Mesh(ceilGeo, ceilMat);
    ceiling.position.set(0, 5, 0);
    this.scene.add(ceiling);

    // Ceiling light strips
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
    // Back wall grid
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

  update(delta: number, time: number) {
    // Pulse ceiling lights
    for (let i = 0; i < this.ceilingLights.length; i++) {
      const mat = this.ceilingLights[i].material as MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(time * 0.5 + i * 1.5) * 0.1;
    }

    // Subtle pillar trim pulsing
    for (const pillar of this.pillars) {
      for (let ci = 1; ci < pillar.children.length - 1; ci++) {
        const child = pillar.children[ci] as Mesh;
        if (child.material && 'emissiveIntensity' in child.material) {
          (child.material as MeshStandardMaterial).emissiveIntensity =
            0.4 + Math.sin(time * 0.8 + ci * 2) * 0.2;
        }
      }
    }
  }
}
