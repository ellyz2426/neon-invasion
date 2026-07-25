import {
  createSystem,
  Mesh,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  Vector3,
  AdditiveBlending,
  Group,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  Color,
} from '@iwsdk/core';

interface Particle {
  mesh: Mesh;
  vel: Vector3;
  life: number;
  maxLife: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  speed: number;
  brightness: number;
}

export class EffectsSystem extends createSystem({}) {
  private particles: Particle[] = [];
  private group!: Group;
  private ambientOrbs: Mesh[] = [];

  // Starfield
  private stars: Star[] = [];
  private starGeometry!: BufferGeometry;
  private starPoints!: Points;
  private starPositions!: Float32Array;
  private starColors!: Float32Array;
  private readonly STAR_COUNT = 300;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;
  private originalCameraPos = new Vector3();
  private shaking = false;

  // Wave flash
  private waveFlashTimer = 0;
  private waveFlashColor = 0x00ffff;

  // Score popup floating indicators
  private scorePopups: { mesh: Mesh; timer: number; vel: Vector3 }[] = [];

  // Flash ring effects for power-up collection and boss kills
  private flashRings: { mesh: Mesh; timer: number; maxScale: number }[] = [];

  // Border warning flash for invader drops
  private borderFlashTimer = 0;
  private borderFlashMeshes: Mesh[] = [];

  init() {
    this.group = new Group();
    this.scene.add(this.group);

    // Ambient floating orbs
    for (let i = 0; i < 20; i++) {
      const geo = new SphereGeometry(0.02 + Math.random() * 0.03, 6, 4);
      const mat = new MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 10,
        Math.random() * 4,
        (Math.random() - 0.5) * 4 - 2
      );
      mesh.userData['baseY'] = mesh.position.y;
      mesh.userData['speed'] = 0.3 + Math.random() * 0.5;
      mesh.userData['phase'] = Math.random() * Math.PI * 2;
      this.scene.add(mesh);
      this.ambientOrbs.push(mesh);
    }

    // Create starfield
    this.createStarfield();

    // Create border flash indicators
    this.createBorderFlash();
  }

  private createStarfield() {
    this.stars = [];
    this.starPositions = new Float32Array(this.STAR_COUNT * 3);
    this.starColors = new Float32Array(this.STAR_COUNT * 3);

    for (let i = 0; i < this.STAR_COUNT; i++) {
      const star: Star = {
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 6,
        z: -4 - Math.random() * 12,
        speed: 0.02 + Math.random() * 0.08,
        brightness: 0.3 + Math.random() * 0.7,
      };
      this.stars.push(star);

      const i3 = i * 3;
      this.starPositions[i3] = star.x;
      this.starPositions[i3 + 1] = star.y;
      this.starPositions[i3 + 2] = star.z;

      // Vary star colors: white, cyan, blue tints
      const colorChoice = Math.random();
      if (colorChoice < 0.4) {
        this.starColors[i3] = star.brightness;
        this.starColors[i3 + 1] = star.brightness;
        this.starColors[i3 + 2] = star.brightness;
      } else if (colorChoice < 0.7) {
        this.starColors[i3] = star.brightness * 0.5;
        this.starColors[i3 + 1] = star.brightness;
        this.starColors[i3 + 2] = star.brightness;
      } else {
        this.starColors[i3] = star.brightness * 0.3;
        this.starColors[i3 + 1] = star.brightness * 0.5;
        this.starColors[i3 + 2] = star.brightness;
      }
    }

    this.starGeometry = new BufferGeometry();
    this.starGeometry.setAttribute('position', new Float32BufferAttribute(this.starPositions, 3));
    this.starGeometry.setAttribute('color', new Float32BufferAttribute(this.starColors, 3));

    const starMat = new PointsMaterial({
      size: 0.04,
      transparent: true,
      opacity: 0.8,
      vertexColors: true,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });

    this.starPoints = new Points(this.starGeometry, starMat);
    this.scene.add(this.starPoints);
  }

  burst(pos: Vector3, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const geo = new SphereGeometry(0.02, 4, 3);
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.copy(pos);
      this.group.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const vy = (Math.random() - 0.3) * 3;
      const vel = new Vector3(
        Math.cos(angle) * speed,
        vy,
        Math.sin(angle) * speed * 0.3
      );
      const life = 0.3 + Math.random() * 0.5;
      this.particles.push({ mesh, vel, life, maxLife: life });
    }
  }

  // Directional sparks for bullet trails
  trail(pos: Vector3, color: number, direction: number) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const geo = new BoxGeometry(0.01, 0.03, 0.01);
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.position.x += (Math.random() - 0.5) * 0.05;
      this.group.add(mesh);

      const vel = new Vector3(
        (Math.random() - 0.5) * 0.3,
        -direction * (0.5 + Math.random() * 0.5),
        0
      );
      const life = 0.15 + Math.random() * 0.1;
      this.particles.push({ mesh, vel, life, maxLife: life });
    }
  }

  // Shield damage sparks
  shieldSpark(pos: Vector3) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const geo = new BoxGeometry(0.015, 0.015, 0.015);
      const mat = new MeshBasicMaterial({
        color: 0x00ff44,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.copy(pos);
      this.group.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      const vel = new Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        (Math.random() - 0.5) * 0.3
      );
      const life = 0.2 + Math.random() * 0.3;
      this.particles.push({ mesh, vel, life, maxLife: life });
    }
  }

  // Big explosion for player death
  bigExplosion(pos: Vector3, color: number) {
    // Core burst
    this.burst(pos, color, 25);
    // Ring of particles
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const geo = new SphereGeometry(0.03, 4, 3);
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.copy(pos);
      this.group.add(mesh);

      const speed = 2 + Math.random() * 1.5;
      const vel = new Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed * 0.5 + 1,
        0
      );
      const life = 0.5 + Math.random() * 0.3;
      this.particles.push({ mesh, vel, life, maxLife: life });
    }
  }

  // Screen shake
  shake(intensity: number, duration: number) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
    this.shaking = true;
  }

  // Wave clear flash
  waveFlash(color: number) {
    this.waveFlashTimer = 0.5;
    this.waveFlashColor = color;
  }

  update(delta: number, time: number) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vel.x * delta;
      p.mesh.position.y += p.vel.y * delta;
      p.mesh.position.z += p.vel.z * delta;
      p.vel.y -= 3 * delta; // gravity
      const frac = p.life / p.maxLife;
      (p.mesh.material as MeshBasicMaterial).opacity = frac;
      p.mesh.scale.setScalar(frac);
    }

    // Ambient orbs
    for (const orb of this.ambientOrbs) {
      const base = orb.userData['baseY'] as number;
      const speed = orb.userData['speed'] as number;
      const phase = orb.userData['phase'] as number;
      orb.position.y = base + Math.sin(time * speed + phase) * 0.3;
    }

    // Update starfield - slow drift
    for (let i = 0; i < this.STAR_COUNT; i++) {
      const star = this.stars[i];
      const i3 = i * 3;

      // Stars drift slowly downward
      star.y -= star.speed * delta;
      if (star.y < -0.5) {
        star.y = 6;
        star.x = (Math.random() - 0.5) * 20;
      }

      this.starPositions[i3] = star.x;
      this.starPositions[i3 + 1] = star.y;
      this.starPositions[i3 + 2] = star.z;

      // Twinkle effect — just update positions; stars drift naturally
      star.brightness = 0.3 + Math.abs(Math.sin(time * (1 + star.speed * 10) + i)) * 0.7;
    }
    // Simplified twinkle — just update positions and let shader handle
    this.starGeometry.attributes['position'].needsUpdate = true;

    // Screen shake
    if (this.shaking && this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      const progress = this.shakeTimer / this.shakeDuration;
      const intensity = this.shakeIntensity * progress;
      const camera = this.scene.userData['camera'];
      if (camera) {
        camera.position.x += (Math.random() - 0.5) * intensity * 2;
        camera.position.y += (Math.random() - 0.5) * intensity;
      }
      if (this.shakeTimer <= 0) {
        this.shaking = false;
      }
    }

    // Wave flash
    if (this.waveFlashTimer > 0) {
      this.waveFlashTimer -= delta;
      const brightness = this.waveFlashTimer / 0.5;
      // Flash ambient orbs
      for (const orb of this.ambientOrbs) {
        const mat = orb.material as MeshBasicMaterial;
        mat.opacity = 0.3 + brightness * 0.5;
      }
    }

    // Border flash
    if (this.borderFlashTimer > 0) {
      this.borderFlashTimer -= delta;
      const intensity = Math.max(0, this.borderFlashTimer / 0.4);
      for (const mesh of this.borderFlashMeshes) {
        (mesh.material as MeshBasicMaterial).opacity = intensity * 0.6;
      }
    }

    // Score popups
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const sp = this.scorePopups[i];
      sp.timer -= delta;
      if (sp.timer <= 0) {
        this.group.remove(sp.mesh);
        this.scorePopups.splice(i, 1);
        continue;
      }
      sp.mesh.position.x += sp.vel.x * delta;
      sp.mesh.position.y += sp.vel.y * delta;
      const frac = sp.timer / 0.6;
      (sp.mesh.material as MeshBasicMaterial).opacity = frac * 0.9;
      sp.mesh.scale.setScalar(0.5 + frac * 0.5);
    }

    // Flash rings
    for (let i = this.flashRings.length - 1; i >= 0; i--) {
      const ring = this.flashRings[i];
      ring.timer -= delta;
      if (ring.timer <= 0) {
        this.scene.remove(ring.mesh);
        this.flashRings.splice(i, 1);
        continue;
      }
      const progress = 1 - ring.timer / 0.5;
      const scale = 0.1 + progress * ring.maxScale;
      ring.mesh.scale.setScalar(scale);
      (ring.mesh.material as MeshBasicMaterial).opacity = (1 - progress) * 0.9;
    }
  }

  // Border flash for invader drops
  private createBorderFlash() {
    const positions: [number, number, number, number, number, number][] = [
      // left bar
      [-4.2, 2, -0.5, 0.02, 4.5, 0.02],
      // right bar
      [4.2, 2, -0.5, 0.02, 4.5, 0.02],
    ];
    for (const [x, y, z, w, h, d] of positions) {
      const geo = new BoxGeometry(w, h, d);
      const mat = new MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.borderFlashMeshes.push(mesh);
    }
  }

  // Flash borders when invaders drop
  borderWarning() {
    this.borderFlashTimer = 0.4;
  }

  // Score popup at position
  scorePopup(pos: Vector3, color: number) {
    const geo = new SphereGeometry(0.06, 6, 4);
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.scorePopups.push({
      mesh,
      timer: 0.6,
      vel: new Vector3((Math.random() - 0.5) * 0.3, 1.5, 0),
    });
  }

  // Update orb colors based on color scheme
  setAccentColor(color: number) {
    const c = new Color(color);
    for (const orb of this.ambientOrbs) {
      const mat = orb.material as MeshBasicMaterial;
      mat.color.copy(c);
    }
  }

  // Expanding flash ring effect for power-up collection and boss kills
  flashRing(pos: Vector3, color: number, maxScale: number) {
    // Create a thin ring using a cylinder with inner radius ≈ outer
    const geo = new CylinderGeometry(0.5, 0.5, 0.02, 24, 1, true);
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      side: 2, // DoubleSide
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = Math.PI / 2; // lay flat facing camera
    mesh.scale.setScalar(0.1);
    this.scene.add(mesh);
    this.flashRings.push({ mesh, timer: 0.5, maxScale });
  }
}
