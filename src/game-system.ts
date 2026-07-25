import {
  createSystem,
  PanelUI,
  PanelDocument,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineSegments,
  EdgesGeometry,
  LineBasicMaterial,
  Vector3,
  Color,
  InputComponent,
  RayInteractable,
  AdditiveBlending,
} from '@iwsdk/core';
import type { UISystem } from './ui-system';
import type { AudioSystem } from './audio-system';
import type { EffectsSystem } from './effects-system';

// ========== TYPES ==========
interface Invader {
  mesh: Mesh;
  row: number;
  col: number;
  alive: boolean;
  type: number; // 0=top(30pts), 1=mid(20pts), 2=bot(10pts)
  edgeLines: LineSegments;
}

interface Bullet {
  mesh: Mesh;
  vel: Vector3;
  isPlayer: boolean;
}

interface ShieldBlock {
  mesh: Mesh;
  health: number;
  row: number;
  col: number;
}

interface Shield {
  blocks: ShieldBlock[];
  group: Group;
}

interface UFO {
  mesh: Mesh;
  edgeLines: LineSegments;
  active: boolean;
  dir: number;
  speed: number;
}

// ========== CONSTANTS ==========
const COLS = 11;
const ROWS = 5;
const INVADER_SPACING_X = 0.55;
const INVADER_SPACING_Y = 0.45;
const INVADER_SIZE = 0.3;
const GRID_LEFT = -(COLS - 1) * INVADER_SPACING_X * 0.5;
const GRID_TOP = 3.2;
const PLAYER_Y = 0.3;
const PLAYER_SPEED = 3.0;
const PLAYER_BULLET_SPEED = 5.0;
const ENEMY_BULLET_SPEED = 2.5;
const PLAY_BOUND_X = 3.5;
const SHIELD_Y = 0.9;
const UFO_Y = 3.7;
const UFO_SPEED = 1.8;
const DROP_AMOUNT = 0.3;

const INVADER_POINTS = [30, 20, 10];
const UFO_POINTS = [50, 100, 150, 300];
const ALIEN_COLORS = [0x00ffff, 0xff00ff, 0x00ff88];

type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'results';
type GameMode = 'classic' | 'speed' | 'zen' | 'challenge' | 'endless';
type Difficulty = 'easy' | 'medium' | 'hard';

export class GameSystem extends createSystem({}) {
  private ui!: UISystem;
  private audio!: AudioSystem;
  private effects!: EffectsSystem;

  // Game state
  state: GameState = 'menu';
  mode: GameMode = 'classic';
  difficulty: Difficulty = 'medium';
  score = 0;
  lives = 3;
  wave = 1;
  highScore = 0;
  speedTimer = 120;
  challengeLives = 1;

  // Invaders
  private invaders: Invader[] = [];
  private invaderGroup!: Group;
  private moveDir = 1;
  private moveTimer = 0;
  private moveInterval = 0.8;
  private stepSize = 0.15;
  private fireTimer = 0;
  private fireInterval = 1.5;
  private aliensAlive = 0;

  // Player
  private playerMesh!: Mesh;
  private playerEdge!: LineSegments;
  private playerGroup!: Group;
  private playerX = 0;
  private playerFireCooldown = 0;
  private playerFireRate = 0.3;

  // Bullets
  private playerBullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];

  // Shields
  private shields: Shield[] = [];
  private shieldGroup!: Group;

  // UFO
  private ufo: UFO | null = null;
  private ufoTimer = 0;
  private ufoInterval = 15;

  // Stats
  totalShots = 0;
  totalHits = 0;
  totalKills = 0;
  totalWaves = 0;
  totalUFOs = 0;
  gameTime = 0;
  bestWave = 0;
  gamesPlayed = 0;
  totalGamesWon = 0;
  winStreak = 0;
  bestStreak = 0;

  // Achievements
  achievements: string[] = [];
  private achievementQueue: string[] = [];

  // Color scheme
  colorScheme = 0;
  private readonly COLOR_SCHEMES = [
    { name: 'Cyan', accent: 0x00ffff, secondary: 0xff00ff },
    { name: 'Green', accent: 0x00ff88, secondary: 0xffaa00 },
    { name: 'Magenta', accent: 0xff00ff, secondary: 0x00ffff },
    { name: 'Gold', accent: 0xffaa00, secondary: 0x00ff88 },
  ];
  soundEnabled = true;

  // Per-game tracking
  private shotsFired = 0;
  private shotsHit = 0;
  private killsThisGame = 0;
  private ufosHitThisGame = 0;
  wavesCleared = 0;
  private shieldsRemaining = 0;
  private maxCombo = 0;
  currentCombo = 0;
  private comboTimer = 0;
  private gameStartTime = 0;

  setRefs(refs: { ui: UISystem; audio: AudioSystem; effects: EffectsSystem }) {
    this.ui = refs.ui;
    this.audio = refs.audio;
    this.effects = refs.effects;
  }

  init() {
    this.loadPersistence();
    this.createPlayer();
    this.invaderGroup = new Group();
    this.scene.add(this.invaderGroup);
    this.shieldGroup = new Group();
    this.scene.add(this.shieldGroup);
  }

  private loadPersistence() {
    try {
      const d = JSON.parse(localStorage.getItem('neon-invasion-data') || '{}');
      this.highScore = d.highScore || 0;
      this.colorScheme = d.colorScheme || 0;
      this.soundEnabled = d.soundEnabled !== false;
      this.difficulty = d.difficulty || 'medium';
      this.mode = d.mode || 'classic';
      this.gamesPlayed = d.gamesPlayed || 0;
      this.totalGamesWon = d.totalGamesWon || 0;
      this.bestWave = d.bestWave || 0;
      this.bestStreak = d.bestStreak || 0;
      this.winStreak = d.winStreak || 0;
      this.achievements = d.achievements || [];
    } catch { /* ignore */ }
  }

  savePersistence() {
    try {
      localStorage.setItem('neon-invasion-data', JSON.stringify({
        highScore: this.highScore,
        colorScheme: this.colorScheme,
        soundEnabled: this.soundEnabled,
        difficulty: this.difficulty,
        mode: this.mode,
        gamesPlayed: this.gamesPlayed,
        totalGamesWon: this.totalGamesWon,
        bestWave: this.bestWave,
        bestStreak: this.bestStreak,
        winStreak: this.winStreak,
        achievements: this.achievements,
      }));
    } catch { /* ignore */ }
  }

  private createPlayer() {
    this.playerGroup = new Group();
    this.playerGroup.position.set(0, PLAYER_Y, 0);

    const bodyGeo = new BoxGeometry(0.4, 0.15, 0.3);
    const mat = new MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.4 });
    this.playerMesh = new Mesh(bodyGeo, mat);

    const turretGeo = new CylinderGeometry(0.03, 0.03, 0.2, 8);
    const turretMat = new MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.6 });
    const turret = new Mesh(turretGeo, turretMat);
    turret.position.set(0, 0.17, 0);
    this.playerMesh.add(turret);

    const edgeGeo = new EdgesGeometry(bodyGeo);
    this.playerEdge = new LineSegments(edgeGeo, new LineBasicMaterial({ color: 0x00ffff }));
    this.playerMesh.add(this.playerEdge);

    this.playerGroup.add(this.playerMesh);
    this.scene.add(this.playerGroup);
    this.playerGroup.visible = false;
  }

  startGame() {
    this.state = 'playing';
    this.score = 0;
    this.wave = 1;
    this.lives = this.mode === 'challenge' ? 1 : 3;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.killsThisGame = 0;
    this.ufosHitThisGame = 0;
    this.wavesCleared = 0;
    this.maxCombo = 0;
    this.currentCombo = 0;
    this.comboTimer = 0;
    this.speedTimer = 120;
    this.gameStartTime = 0;
    this.gameTime = 0;
    this.playerX = 0;
    this.playerGroup.visible = true;
    this.playerGroup.position.x = 0;
    this.gamesPlayed++;
    this.spawnWave();
    this.createShields();
    this.audio?.playSound('start');
  }

  private spawnWave() {
    // Clear old invaders
    while (this.invaderGroup.children.length > 0) {
      this.invaderGroup.remove(this.invaderGroup.children[0]);
    }
    this.invaders = [];
    this.moveDir = 1;
    this.moveTimer = 0;

    const diffMul = this.difficulty === 'easy' ? 1.2 : this.difficulty === 'hard' ? 0.7 : 1.0;
    this.moveInterval = Math.max(0.15, (0.8 - (this.wave - 1) * 0.05) * diffMul);
    this.fireInterval = Math.max(0.3, (1.5 - (this.wave - 1) * 0.08) * diffMul);

    for (let r = 0; r < ROWS; r++) {
      const type = r === 0 ? 0 : r < 3 ? 1 : 2;
      const color = ALIEN_COLORS[type];
      for (let c = 0; c < COLS; c++) {
        const x = GRID_LEFT + c * INVADER_SPACING_X;
        const y = GRID_TOP - r * INVADER_SPACING_Y;
        const mesh = this.createInvaderMesh(type, color);
        mesh.position.set(x, y, 0);
        const edgeGeo = new EdgesGeometry(mesh.geometry);
        const edgeLines = new LineSegments(edgeGeo, new LineBasicMaterial({ color }));
        mesh.add(edgeLines);
        this.invaderGroup.add(mesh);
        this.invaders.push({ mesh, row: r, col: c, alive: true, type, edgeLines });
      }
    }
    this.aliensAlive = ROWS * COLS;
  }

  private createInvaderMesh(type: number, color: number): Mesh {
    let geo;
    if (type === 0) {
      geo = new SphereGeometry(INVADER_SIZE * 0.45, 6, 4);
    } else if (type === 1) {
      geo = new BoxGeometry(INVADER_SIZE, INVADER_SIZE * 0.6, INVADER_SIZE * 0.4);
    } else {
      geo = new CylinderGeometry(0, INVADER_SIZE * 0.5, INVADER_SIZE * 0.7, 5);
    }
    const mat = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.85,
    });
    return new Mesh(geo, mat);
  }

  private createShields() {
    // Clear old shields
    while (this.shieldGroup.children.length > 0) {
      this.shieldGroup.remove(this.shieldGroup.children[0]);
    }
    this.shields = [];

    const shieldPositions = [-2.4, -0.8, 0.8, 2.4];
    const blockSize = 0.08;
    const shieldShape = [
      [0,0,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,1,0,0,0,0,1,1,1],
      [1,1,0,0,0,0,0,0,1,1],
    ];

    for (const sx of shieldPositions) {
      const group = new Group();
      group.position.set(sx, SHIELD_Y, 0);
      const blocks: ShieldBlock[] = [];

      for (let r = 0; r < shieldShape.length; r++) {
        for (let c = 0; c < shieldShape[r].length; c++) {
          if (!shieldShape[r][c]) continue;
          const geo = new BoxGeometry(blockSize, blockSize, blockSize);
          const mat = new MeshStandardMaterial({
            color: 0x00ff44,
            emissive: 0x00ff44,
            emissiveIntensity: 0.3,
            transparent: true,
          });
          const mesh = new Mesh(geo, mat);
          const ox = (c - 4.5) * blockSize;
          const oy = (3 - r) * blockSize;
          mesh.position.set(ox, oy, 0);
          group.add(mesh);
          blocks.push({ mesh, health: 3, row: r, col: c });
        }
      }

      this.shieldGroup.add(group);
      this.shields.push({ blocks, group });
    }
  }

  private clearBullets() {
    for (const b of this.playerBullets) this.scene.remove(b.mesh);
    for (const b of this.enemyBullets) this.scene.remove(b.mesh);
    this.playerBullets = [];
    this.enemyBullets = [];
  }

  pauseGame() {
    if (this.state === 'playing') {
      this.state = 'paused';
    }
  }

  resumeGame() {
    if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  endGame(won: boolean) {
    this.state = 'results';
    this.clearBullets();
    if (this.ufo?.active) {
      this.ufo.active = false;
      this.ufo.mesh.visible = false;
    }

    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
    if (this.wavesCleared > this.bestWave) {
      this.bestWave = this.wavesCleared;
    }
    if (won) {
      this.totalGamesWon++;
      this.winStreak++;
      if (this.winStreak > this.bestStreak) this.bestStreak = this.winStreak;
    } else {
      this.winStreak = 0;
    }
    this.checkAchievements();
    this.savePersistence();
    this.audio?.playSound(won ? 'victory' : 'defeat');
  }

  returnToMenu() {
    this.state = 'menu';
    this.clearBullets();
    this.playerGroup.visible = false;
    while (this.invaderGroup.children.length > 0) {
      this.invaderGroup.remove(this.invaderGroup.children[0]);
    }
    this.invaders = [];
    while (this.shieldGroup.children.length > 0) {
      this.shieldGroup.remove(this.shieldGroup.children[0]);
    }
    this.shields = [];
    if (this.ufo?.active) {
      this.ufo.active = false;
      this.ufo.mesh.visible = false;
    }
  }

  private firePlayerBullet() {
    if (this.playerFireCooldown > 0) return;
    if (this.playerBullets.length >= 2) return; // max 2 on screen

    const geo = new BoxGeometry(0.04, 0.18, 0.04);
    const accent = this.COLOR_SCHEMES[this.colorScheme].accent;
    const mat = new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(this.playerX, PLAYER_Y + 0.25, 0);
    this.scene.add(mesh);
    this.playerBullets.push({ mesh, vel: new Vector3(0, PLAYER_BULLET_SPEED, 0), isPlayer: true });
    this.playerFireCooldown = this.playerFireRate;
    this.shotsFired++;
    this.totalShots++;
    this.audio?.playSound('shoot');
  }

  private fireEnemyBullet() {
    const alive = this.invaders.filter(i => i.alive);
    if (alive.length === 0) return;

    // Pick from bottom-most alive in each column
    const bottomPerCol: Invader[] = [];
    for (let c = 0; c < COLS; c++) {
      const col = alive.filter(i => i.col === c);
      if (col.length > 0) {
        col.sort((a, b) => a.mesh.position.y - b.mesh.position.y);
        bottomPerCol.push(col[0]);
      }
    }
    if (bottomPerCol.length === 0) return;

    const shooter = bottomPerCol[Math.floor(Math.random() * bottomPerCol.length)];
    const worldPos = new Vector3();
    shooter.mesh.getWorldPosition(worldPos);

    const geo = new BoxGeometry(0.04, 0.14, 0.04);
    const mat = new MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9 });
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(worldPos);
    mesh.position.y -= 0.2;
    this.scene.add(mesh);
    this.enemyBullets.push({ mesh, vel: new Vector3(0, -ENEMY_BULLET_SPEED, 0), isPlayer: false });
    this.audio?.playSound('enemyShoot');
  }

  private spawnUFO() {
    if (this.ufo && this.ufo.active) return;

    const dir = Math.random() > 0.5 ? 1 : -1;
    const startX = -dir * 5;

    if (!this.ufo) {
      const geo = new SphereGeometry(0.2, 8, 4);
      const mat = new MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xff8800,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new Mesh(geo, mat);
      mesh.scale.set(1, 0.4, 1);
      const edgeGeo = new EdgesGeometry(geo);
      const edgeLines = new LineSegments(edgeGeo, new LineBasicMaterial({ color: 0xff8800 }));
      mesh.add(edgeLines);
      this.scene.add(mesh);
      this.ufo = { mesh, edgeLines, active: false, dir, speed: UFO_SPEED };
    }

    this.ufo.mesh.position.set(startX, UFO_Y, 0);
    this.ufo.dir = dir;
    this.ufo.active = true;
    this.ufo.mesh.visible = true;
    this.audio?.playSound('ufo');
  }

  update(delta: number, time: number) {
    if (this.state !== 'playing') return;

    this.gameTime += delta;
    this.gameStartTime += delta;

    // Speed mode timer
    if (this.mode === 'speed') {
      this.speedTimer -= delta;
      if (this.speedTimer <= 0) {
        this.endGame(false);
        return;
      }
    }

    // Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.currentCombo = 0;
      }
    }

    // Player input
    this.handleInput(delta);

    // Player fire cooldown
    if (this.playerFireCooldown > 0) this.playerFireCooldown -= delta;

    // Move invaders
    this.moveTimer += delta;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      this.moveInvaders();
    }

    // Enemy fire
    this.fireTimer += delta;
    if (this.fireTimer >= this.fireInterval) {
      this.fireTimer = 0;
      this.fireEnemyBullet();
    }

    // UFO
    this.ufoTimer += delta;
    if (this.ufoTimer >= this.ufoInterval) {
      this.ufoTimer = 0;
      this.spawnUFO();
    }
    if (this.ufo?.active) {
      this.ufo.mesh.position.x += this.ufo.dir * this.ufo.speed * delta;
      if (Math.abs(this.ufo.mesh.position.x) > 5) {
        this.ufo.active = false;
        this.ufo.mesh.visible = false;
      }
    }

    // Update bullets
    this.updateBullets(delta);

    // Animate invaders
    this.animateInvaders(time);

    // Update HUD
    this.ui?.updateHUD();

    // Check achievement queue
    if (this.achievementQueue.length > 0) {
      const ach = this.achievementQueue.shift()!;
      this.ui?.showAchievement(ach);
    }
  }

  private handleInput(delta: number) {
    let moveX = 0;

    // Keyboard
    if (this.input.keyboard.getKeyPressed('ArrowLeft') || this.input.keyboard.getKeyPressed('KeyA')) {
      moveX = -1;
    }
    if (this.input.keyboard.getKeyPressed('ArrowRight') || this.input.keyboard.getKeyPressed('KeyD')) {
      moveX = 1;
    }
    if (this.input.keyboard.getKeyDown('Space') || this.input.keyboard.getKeyDown('KeyW') || this.input.keyboard.getKeyDown('ArrowUp')) {
      this.firePlayerBullet();
    }
    if (this.input.keyboard.getKeyDown('Escape') || this.input.keyboard.getKeyDown('KeyP')) {
      this.pauseGame();
      this.ui?.showPanel('pause');
      return;
    }

    // XR controllers
    const right = this.input.xr.gamepads.right;
    if (right) {
      if (right.getButtonDown(InputComponent.Trigger)) {
        this.firePlayerBullet();
      }
      const stick = right.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.15) {
        moveX = stick.x;
      }
      if (right.getButtonDown(InputComponent.B_Button)) {
        this.pauseGame();
        this.ui?.showPanel('pause');
        return;
      }
    }
    const left = this.input.xr.gamepads.left;
    if (left) {
      const stick = left.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.15) {
        moveX = stick.x;
      }
      if (left.getButtonDown(InputComponent.Y_Button)) {
        this.pauseGame();
        this.ui?.showPanel('pause');
        return;
      }
    }

    // Apply movement
    this.playerX += moveX * PLAYER_SPEED * delta;
    this.playerX = Math.max(-PLAY_BOUND_X, Math.min(PLAY_BOUND_X, this.playerX));
    this.playerGroup.position.x = this.playerX;
  }

  private moveInvaders() {
    let needDrop = false;
    const alive = this.invaders.filter(i => i.alive);

    // Check if any alive invader is at boundary
    for (const inv of alive) {
      const worldPos = new Vector3();
      inv.mesh.getWorldPosition(worldPos);
      if ((this.moveDir > 0 && worldPos.x > PLAY_BOUND_X - 0.2) ||
          (this.moveDir < 0 && worldPos.x < -PLAY_BOUND_X + 0.2)) {
        needDrop = true;
        break;
      }
    }

    if (needDrop) {
      // Drop and reverse
      this.invaderGroup.position.y -= DROP_AMOUNT;
      this.moveDir *= -1;
      // Speed up slightly
      this.moveInterval *= 0.95;
      this.audio?.playSound('drop');

      // Check if any invader reached player level
      for (const inv of alive) {
        const worldPos = new Vector3();
        inv.mesh.getWorldPosition(worldPos);
        if (worldPos.y <= PLAYER_Y + 0.3) {
          this.endGame(false);
          return;
        }
      }
    } else {
      this.invaderGroup.position.x += this.moveDir * this.stepSize;
    }

    // Speed up as fewer alive
    const ratio = this.aliensAlive / (ROWS * COLS);
    if (ratio < 0.2) {
      this.moveInterval = Math.max(0.08, this.moveInterval);
    }

    this.audio?.playSound('step');
  }

  private updateBullets(delta: number) {
    // Player bullets
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.mesh.position.y += b.vel.y * delta;

      // Off screen
      if (b.mesh.position.y > 4.5) {
        this.scene.remove(b.mesh);
        this.playerBullets.splice(i, 1);
        continue;
      }

      // Check UFO hit
      if (this.ufo?.active) {
        const dx = b.mesh.position.x - this.ufo.mesh.position.x;
        const dy = b.mesh.position.y - this.ufo.mesh.position.y;
        if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.15) {
          const pts = UFO_POINTS[Math.floor(Math.random() * UFO_POINTS.length)];
          this.score += pts;
          this.ufosHitThisGame++;
          this.totalUFOs++;
          this.ufo.active = false;
          this.ufo.mesh.visible = false;
          this.effects?.burst(this.ufo.mesh.position.clone(), 0xff8800, 15);
          this.audio?.playSound('ufoHit');
          this.scene.remove(b.mesh);
          this.playerBullets.splice(i, 1);
          continue;
        }
      }

      // Check invader hit
      let hit = false;
      for (const inv of this.invaders) {
        if (!inv.alive) continue;
        const worldPos = new Vector3();
        inv.mesh.getWorldPosition(worldPos);
        const dx = b.mesh.position.x - worldPos.x;
        const dy = b.mesh.position.y - worldPos.y;
        if (Math.abs(dx) < INVADER_SIZE * 0.5 && Math.abs(dy) < INVADER_SIZE * 0.5) {
          inv.alive = false;
          inv.mesh.visible = false;
          this.aliensAlive--;
          this.score += INVADER_POINTS[inv.type];
          this.shotsHit++;
          this.totalHits++;
          this.killsThisGame++;
          this.totalKills++;
          this.currentCombo++;
          this.comboTimer = 2;
          if (this.currentCombo > this.maxCombo) this.maxCombo = this.currentCombo;
          this.effects?.burst(worldPos, ALIEN_COLORS[inv.type], 10);
          this.audio?.playSound('hit');
          hit = true;
          break;
        }
      }
      if (hit) {
        this.scene.remove(b.mesh);
        this.playerBullets.splice(i, 1);

        // Check wave clear
        if (this.aliensAlive <= 0) {
          this.wavesCleared++;
          this.totalWaves++;
          this.wave++;
          this.audio?.playSound('waveClear');

          if (this.mode === 'classic' && this.wave > 10) {
            this.endGame(true);
          } else if (this.mode === 'challenge' && this.wave > 5) {
            this.endGame(true);
          } else {
            this.invaderGroup.position.set(0, 0, 0);
            this.spawnWave();
            this.createShields();
            this.clearBullets();
          }
        }
        continue;
      }

      // Check shield hit
      if (this.checkBulletShieldHit(b, i, true)) continue;
    }

    // Enemy bullets
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.mesh.position.y += b.vel.y * delta;

      // Off screen
      if (b.mesh.position.y < -0.5) {
        this.scene.remove(b.mesh);
        this.enemyBullets.splice(i, 1);
        continue;
      }

      // Check player hit
      const dx = b.mesh.position.x - this.playerX;
      const dy = b.mesh.position.y - PLAYER_Y;
      if (Math.abs(dx) < 0.22 && Math.abs(dy) < 0.15) {
        this.scene.remove(b.mesh);
        this.enemyBullets.splice(i, 1);
        this.playerHit();
        continue;
      }

      // Check shield hit
      if (this.checkBulletShieldHit(b, i, false)) continue;
    }
  }

  private checkBulletShieldHit(b: Bullet, idx: number, isPlayer: boolean): boolean {
    for (const shield of this.shields) {
      const shieldPos = shield.group.position;
      for (let j = shield.blocks.length - 1; j >= 0; j--) {
        const block = shield.blocks[j];
        if (block.health <= 0) continue;
        const bx = shieldPos.x + block.mesh.position.x;
        const by = shieldPos.y + block.mesh.position.y;
        const dx = b.mesh.position.x - bx;
        const dy = b.mesh.position.y - by;
        if (Math.abs(dx) < 0.06 && Math.abs(dy) < 0.06) {
          block.health--;
          if (block.health <= 0) {
            block.mesh.visible = false;
          } else {
            const mat = block.mesh.material as MeshStandardMaterial;
            mat.opacity = block.health / 3;
          }
          this.scene.remove(b.mesh);
          if (isPlayer) {
            this.playerBullets.splice(idx, 1);
          } else {
            this.enemyBullets.splice(idx, 1);
          }
          return true;
        }
      }
    }
    return false;
  }

  private playerHit() {
    if (this.mode === 'zen') return; // zen = no damage

    this.lives--;
    this.effects?.burst(this.playerGroup.position.clone(), 0xff0000, 15);
    this.audio?.playSound('playerHit');

    if (this.lives <= 0) {
      this.endGame(false);
    }
  }

  private animateInvaders(time: number) {
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      inv.mesh.rotation.y = Math.sin(time * 2 + inv.col * 0.5) * 0.2;
    }
  }

  getAccuracy(): number {
    return this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
  }

  getStarRating(): number {
    const acc = this.getAccuracy();
    if (acc >= 70 && this.wavesCleared >= 3) return 3;
    if (acc >= 50 && this.wavesCleared >= 2) return 2;
    return 1;
  }

  getColorAccent(): number {
    return this.COLOR_SCHEMES[this.colorScheme].accent;
  }

  getColorName(): string {
    return this.COLOR_SCHEMES[this.colorScheme].name;
  }

  private checkAchievements() {
    const checks: [string, boolean][] = [
      ['First Blood', this.killsThisGame >= 1],
      ['Wave Rider', this.wavesCleared >= 1],
      ['Sharpshooter', this.getAccuracy() >= 80],
      ['UFO Hunter', this.ufosHitThisGame >= 1],
      ['Combo x5', this.maxCombo >= 5],
      ['Combo x10', this.maxCombo >= 10],
      ['Wave 5', this.wavesCleared >= 5],
      ['Wave 10', this.wavesCleared >= 10],
      ['Score 1000', this.score >= 1000],
      ['Score 5000', this.score >= 5000],
      ['Score 10000', this.score >= 10000],
      ['Perfect Wave', this.aliensAlive === 0 && this.lives >= 3],
      ['UFO Master', this.ufosHitThisGame >= 3],
      ['Survivor', this.wavesCleared >= 3 && this.lives === 1],
      ['Speed Demon', this.mode === 'speed' && this.wavesCleared >= 3],
      ['Challenge Clear', this.mode === 'challenge' && this.wavesCleared >= 5],
      ['Marathon', this.gameStartTime >= 300],
      ['10 Games', this.gamesPlayed >= 10],
      ['Win Streak 3', this.winStreak >= 3],
      ['Untouchable', this.wavesCleared >= 2 && this.shotsFired === this.shotsHit],
    ];

    for (const [name, cond] of checks) {
      if (cond && !this.achievements.includes(name)) {
        this.achievements.push(name);
        this.achievementQueue.push(name);
      }
    }
  }

  updatePlayerColor() {
    const accent = this.COLOR_SCHEMES[this.colorScheme].accent;
    const mat = this.playerMesh.material as MeshStandardMaterial;
    mat.color.setHex(accent);
    mat.emissive.setHex(accent);
    (this.playerEdge.material as LineBasicMaterial).color.setHex(accent);
    // Update turret
    if (this.playerMesh.children[0]) {
      const turretMat = (this.playerMesh.children[0] as Mesh).material as MeshStandardMaterial;
      turretMat.color.setHex(accent);
      turretMat.emissive.setHex(accent);
    }
  }
}
