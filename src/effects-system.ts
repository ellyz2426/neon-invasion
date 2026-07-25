import {
  createSystem,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Vector3,
  AdditiveBlending,
  Group,
} from '@iwsdk/core';

interface Particle {
  mesh: Mesh;
  vel: Vector3;
  life: number;
  maxLife: number;
}

export class EffectsSystem extends createSystem({}) {
  private particles: Particle[] = [];
  private group!: Group;
  private ambientOrbs: Mesh[] = [];

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
  }
}
