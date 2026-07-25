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
import type { EnvironmentSystem } from './environment-system';

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

type PowerUpType = 'shield' | 'rapid' | 'multi' | 'bomb';

interface PowerUp {
  mesh: Group;
  type: PowerUpType;
  vel: Vector3;
  active: boolean;
}

interface LeaderboardEntry {
  score: number;
  wave: number;
  mode: string;
  date: string;
}

interface Boss {
  group: Group;
  bodyMesh: Mesh;
  shieldMeshes: Mesh[];
  hp: number;
  maxHp: number;
  dir: number;
  speed: number;
  fireTimer: number;
  fireInterval: number;
  hitFlash: number;
  active: boolean;
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

const POWERUP_DROP_CHANCE = 0.12; // 12% per kill
const POWERUP_FALL_SPEED = 1.5;
const POWERUP_COLORS: Record<PowerUpType, number> = {
  shield: 0x00aaff,
  rapid: 0xffaa00,
  multi: 0xff00ff,
  bomb: 0xff4444,
};
const POWERUP_DURATIONS: Record<PowerUpType, number> = {
  shield: 4,
  rapid: 6,
  multi: 6,
  bomb: 0, // instant
};

// Wave color themes — cycle per wave
const WAVE_THEMES = [
  { name: 'Cyan', primary: 0x00ffff, secondary: 0xff00ff, ambient: 0x112244 },
  { name: 'Emerald', primary: 0x00ff88, secondary: 0xffaa00, ambient: 0x0a2214 },
  { name: 'Magenta', primary: 0xff00ff, secondary: 0x00ffff, ambient: 0x220a22 },
  { name: 'Gold', primary: 0xffaa00, secondary: 0x00ff88, ambient: 0x221a0a },
  { name: 'Crimson', primary: 0xff4466, secondary: 0x00ccff, ambient: 0x220a14 },
  { name: 'Violet', primary: 0xaa44ff, secondary: 0x44ffaa, ambient: 0x140a22 },
];

type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'results';
type GameMode = 'classic' | 'speed' | 'zen' | 'challenge' | 'endless';
type Difficulty = 'easy' | 'medium' | 'hard';

export class GameSystem extends createSystem({}) {
  private ui!: UISystem;
  private audio!: AudioSystem;
  private effects!: EffectsSystem;
  private env!: EnvironmentSystem;

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

  // Power-ups
  private powerUps: PowerUp[] = [];
  activePowerUp: PowerUpType | null = null;
  powerUpTimer = 0;
  private shieldFlashPhase = 0;
  powerUpsCollected = 0;

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

  // Leaderboard
  leaderboard: LeaderboardEntry[] = [];

  // Boss
  private boss: Boss | null = null;
  bossActive = false;
  bossHp = 0;
  bossMaxHp = 0;
  totalBossKills = 0;
  private bossKillsThisGame = 0;

  // Achievements
  achievements: string[] = [];
  private achievementQueue: string[] = [];

  // Color scheme
  colorScheme = 0;
  private readonly COLOR_SCHEMES = [
    { name: 'Cyan', accent: 0x00ffff, secondary: 0xff00ff, invTint: 0.0 },
    { name: 'Green', accent: 0x00ff88, secondary: 0xffaa00, invTint: 0.3 },
    { name: 'Magenta', accent: 0xff00ff, secondary: 0x00ffff, invTint: 0.6 },
    { name: 'Gold', accent: 0xffaa00, secondary: 0x00ff88, invTint: 0.9 },
  ];
  soundEnabled = true;

  // Invader animation
  private invaderPulsePhase = 0;
  private deathAnimations: { mesh: Mesh; timer: number; startScale: number }[] = [];

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
  private powerUpsThisGame = 0;
  private bombsUsedThisGame = 0;

  setRefs(refs: { ui: UISystem; audio: AudioSystem; effects: EffectsSystem; env: EnvironmentSystem }) {
    this.ui = refs.ui;
    this.audio = refs.audio;
    this.effects = refs.effects;
    this.env = refs.env;
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
      this.leaderboard = d.leaderboard || [];
      this.totalBossKills = d.totalBossKills || 0;
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
        leaderboard: this.leaderboard,
        totalBossKills: this.totalBossKills,
      }));
    } catch { /* ignore */ }
  }

  private addToLeaderboard() {
    const entry: LeaderboardEntry = {
      score: this.score,
      wave: this.wavesCleared,
      mode: this.mode,
      date: new Date().toISOString().split('T')[0],
    };
    this.leaderboard.push(entry);
    this.leaderboard.sort((a, b) => b.score - a.score);
    if (this.leaderboard.length > 10) {
      this.leaderboard = this.leaderboard.slice(0, 10);
    }
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
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.powerUpsThisGame = 0;
    this.bombsUsedThisGame = 0;
    this.bossKillsThisGame = 0;
    this.bossActive = false;
    if (this.boss?.active) {
      this.boss.active = false;
      this.boss.group.visible = false;
    }
    this.gamesPlayed++;
    this.clearPowerUps();
    this.spawnWave();
    this.createShields();
    this.applyWaveTheme();
    this.env?.setTitleInvadersVisible(false);
    this.audio?.playSound('start');
  }

  private applyWaveTheme() {
    const themeIdx = (this.wave - 1) % WAVE_THEMES.length;
    const theme = WAVE_THEMES[themeIdx];
    this.env?.setWaveTheme(theme.primary, theme.secondary, theme.ambient);
    this.effects?.setAccentColor(this.COLOR_SCHEMES[this.colorScheme].accent);
  }

  getWaveThemeName(): string {
    const themeIdx = (this.wave - 1) % WAVE_THEMES.length;
    return WAVE_THEMES[themeIdx].name;
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

  private clearPowerUps() {
    for (const p of this.powerUps) {
      if (p.active) this.scene.remove(p.mesh);
    }
    this.powerUps = [];
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
    this.clearPowerUps();
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    if (this.ufo?.active) {
      this.ufo.active = false;
      this.ufo.mesh.visible = false;
    }
    if (this.boss?.active) {
      this.boss.active = false;
      this.boss.group.visible = false;
      this.bossActive = false;
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
    this.addToLeaderboard();
    this.checkAchievements();
    this.savePersistence();
    this.audio?.playSound(won ? 'victory' : 'defeat');
  }

  returnToMenu() {
    this.state = 'menu';
    this.clearBullets();
    this.clearPowerUps();
    this.activePowerUp = null;
    this.powerUpTimer = 0;
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
    if (this.boss?.active) {
      this.boss.active = false;
      this.boss.group.visible = false;
      this.bossActive = false;
    }
    // Reset environment to default theme
    this.env?.setWaveTheme(0x00ffff, 0xff00ff, 0x112244);
    this.env?.setTitleInvadersVisible(true);
  }

  // ========== POWER-UPS ==========
  private tryDropPowerUp(pos: Vector3) {
    if (Math.random() > POWERUP_DROP_CHANCE) return;

    const types: PowerUpType[] = ['shield', 'rapid', 'multi', 'bomb'];
    const type = types[Math.floor(Math.random() * types.length)];
    const color = POWERUP_COLORS[type];

    const group = new Group();

    // Outer glow sphere
    const glowGeo = new SphereGeometry(0.1, 8, 6);
    const glowMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
    });
    const glow = new Mesh(glowGeo, glowMat);
    group.add(glow);

    // Inner icon shape
    let iconMesh: Mesh;
    if (type === 'shield') {
      // Shield icon = flat diamond
      const geo = new BoxGeometry(0.08, 0.1, 0.02);
      const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      iconMesh = new Mesh(geo, mat);
      iconMesh.rotation.z = Math.PI / 4;
    } else if (type === 'rapid') {
      // Rapid = thin tall cylinder (lightning bolt vibe)
      const geo = new CylinderGeometry(0.02, 0.04, 0.12, 6);
      const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      iconMesh = new Mesh(geo, mat);
    } else if (type === 'multi') {
      // Multi = three small spheres
      const geo = new SphereGeometry(0.03, 6, 4);
      const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      iconMesh = new Mesh(geo, mat);
      const s2 = new Mesh(geo.clone(), mat.clone());
      s2.position.set(-0.05, 0, 0);
      group.add(s2);
      const s3 = new Mesh(geo.clone(), mat.clone());
      s3.position.set(0.05, 0, 0);
      group.add(s3);
    } else {
      // Bomb = box
      const geo = new BoxGeometry(0.08, 0.08, 0.08);
      const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      iconMesh = new Mesh(geo, mat);
    }
    group.add(iconMesh);

    group.position.copy(pos);
    this.scene.add(group);

    this.powerUps.push({
      mesh: group,
      type,
      vel: new Vector3(0, -POWERUP_FALL_SPEED, 0),
      active: true,
    });
  }

  private collectPowerUp(pu: PowerUp) {
    pu.active = false;
    this.scene.remove(pu.mesh);
    this.powerUpsCollected++;
    this.powerUpsThisGame++;

    if (pu.type === 'bomb') {
      // Instant: clear all enemy bullets + damage nearby invaders
      this.activateBomb();
    } else {
      this.activePowerUp = pu.type;
      this.powerUpTimer = POWERUP_DURATIONS[pu.type];
      if (pu.type === 'rapid') {
        this.playerFireRate = 0.1; // much faster
      }
    }

    // Flash ring effect at collection point
    this.effects?.flashRing(pu.mesh.position.clone(), POWERUP_COLORS[pu.type], 1.2);
    this.effects?.burst(pu.mesh.position.clone(), POWERUP_COLORS[pu.type], 15);
    this.audio?.playSound('powerup');
    this.ui?.showPowerUpNotify(pu.type);
  }

  private activateBomb() {
    // Clear all enemy bullets
    for (const b of this.enemyBullets) {
      this.effects?.burst(b.mesh.position.clone(), 0xff4444, 4);
      this.scene.remove(b.mesh);
    }
    this.enemyBullets = [];
    this.bombsUsedThisGame++;

    // Damage a few random alive invaders
    const alive = this.invaders.filter(i => i.alive);
    const damageCount = Math.min(5, alive.length);
    for (let i = 0; i < damageCount; i++) {
      const rIdx = Math.floor(Math.random() * alive.length);
      const inv = alive[rIdx];
      if (inv.alive) {
        inv.alive = false;
        this.aliensAlive--;
        this.score += INVADER_POINTS[inv.type];
        this.killsThisGame++;
        this.totalKills++;
        const worldPos = new Vector3();
        inv.mesh.getWorldPosition(worldPos);
        this.effects?.burst(worldPos, 0xff4444, 8);
        this.deathAnimations.push({ mesh: inv.mesh, timer: 0.25, startScale: 1 });
        alive.splice(rIdx, 1);
      }
    }

    // Big visual flash
    this.effects?.shake(0.08, 0.4);
    this.audio?.playSound('bomb');
  }

  private updatePowerUps(delta: number) {
    // Fall active power-ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      if (!pu.active) {
        this.powerUps.splice(i, 1);
        continue;
      }

      pu.mesh.position.y += pu.vel.y * delta;
      pu.mesh.rotation.y += delta * 2; // spin

      // Off-screen
      if (pu.mesh.position.y < -0.5) {
        pu.active = false;
        this.scene.remove(pu.mesh);
        this.powerUps.splice(i, 1);
        continue;
      }

      // Check player collection
      const dx = pu.mesh.position.x - this.playerX;
      const dy = pu.mesh.position.y - PLAYER_Y;
      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.25) {
        this.collectPowerUp(pu);
        this.powerUps.splice(i, 1);
      }
    }

    // Tick active power-up timer
    if (this.activePowerUp && this.powerUpTimer > 0) {
      this.powerUpTimer -= delta;
      if (this.powerUpTimer <= 0) {
        this.deactivatePowerUp();
      }
    }

    // Shield flash effect
    if (this.activePowerUp === 'shield') {
      this.shieldFlashPhase += delta * 6;
      const flash = 0.3 + Math.sin(this.shieldFlashPhase) * 0.2;
      const mat = this.playerMesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + flash;
    }
  }

  private deactivatePowerUp() {
    if (this.activePowerUp === 'rapid') {
      this.playerFireRate = 0.3; // reset
    }
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    // Reset player emissive
    const mat = this.playerMesh.material as MeshStandardMaterial;
    mat.emissiveIntensity = 0.4;
  }

  // ========== BOSS SYSTEM ==========
  private isBossWave(): boolean {
    return this.wave % 5 === 0;
  }

  private spawnBoss() {
    const tier = Math.floor(this.wave / 5);
    const hp = 15 + tier * 5;
    const speed = 0.8 + tier * 0.1;
    const fireInterval = 2.5 - tier * 0.15;

    if (!this.boss) {
      // Create boss geometry once
      const group = new Group();

      // Central body — large glowing sphere
      const bodyGeo = new SphereGeometry(0.5, 12, 8);
      const bodyMat = new MeshStandardMaterial({
        color: 0xff2200,
        emissive: 0xff2200,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9,
      });
      const bodyMesh = new Mesh(bodyGeo, bodyMat);
      const edgeGeo = new EdgesGeometry(bodyGeo);
      const edges = new LineSegments(edgeGeo, new LineBasicMaterial({ color: 0xff6600 }));
      bodyMesh.add(edges);
      group.add(bodyMesh);

      // Orbiting shield plates (3 rotating box shields)
      const shieldMeshes: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const shieldGeo = new BoxGeometry(0.25, 0.08, 0.1);
        const shieldMat = new MeshStandardMaterial({
          color: 0xff8800,
          emissive: 0xff8800,
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.85,
        });
        const shieldMesh = new Mesh(shieldGeo, shieldMat);
        const shieldEdges = new LineSegments(
          new EdgesGeometry(shieldGeo),
          new LineBasicMaterial({ color: 0xffaa44 })
        );
        shieldMesh.add(shieldEdges);
        group.add(shieldMesh);
        shieldMeshes.push(shieldMesh);
      }

      // Wing extensions
      const wingGeo = new BoxGeometry(0.6, 0.04, 0.2);
      const wingMat = new MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff4400,
        emissiveIntensity: 0.3,
      });
      const wingL = new Mesh(wingGeo, wingMat);
      wingL.position.set(-0.5, 0, 0);
      wingL.rotation.z = 0.2;
      group.add(wingL);
      const wingR = new Mesh(wingGeo.clone(), wingMat.clone());
      wingR.position.set(0.5, 0, 0);
      wingR.rotation.z = -0.2;
      group.add(wingR);

      group.position.set(0, 3.5, 0);
      this.scene.add(group);

      this.boss = {
        group,
        bodyMesh,
        shieldMeshes,
        hp,
        maxHp: hp,
        dir: 1,
        speed,
        fireTimer: 0,
        fireInterval: Math.max(0.8, fireInterval),
        hitFlash: 0,
        active: true,
      };
    } else {
      // Reuse existing boss
      this.boss.hp = hp;
      this.boss.maxHp = hp;
      this.boss.speed = speed;
      this.boss.fireInterval = Math.max(0.8, fireInterval);
      this.boss.fireTimer = 0;
      this.boss.hitFlash = 0;
      this.boss.dir = 1;
      this.boss.active = true;
      this.boss.group.position.set(0, 3.5, 0);
      this.boss.group.visible = true;
      // Reset visuals
      const mat = this.boss.bodyMesh.material as MeshStandardMaterial;
      mat.opacity = 0.9;
      mat.emissiveIntensity = 0.5;
      for (const sm of this.boss.shieldMeshes) {
        sm.visible = true;
        (sm.material as MeshStandardMaterial).opacity = 0.85;
      }
    }
    this.bossActive = true;
    this.bossHp = hp;
    this.bossMaxHp = hp;
    this.audio?.playSound('bossAppear');
  }

  private updateBoss(delta: number, time: number) {
    if (!this.boss || !this.boss.active) return;

    // Move side to side
    this.boss.group.position.x += this.boss.dir * this.boss.speed * delta;
    if (Math.abs(this.boss.group.position.x) > 3.0) {
      this.boss.dir *= -1;
      this.boss.group.position.x = Math.sign(this.boss.group.position.x) * 3.0;
    }

    // Rotate shield plates around body
    for (let i = 0; i < this.boss.shieldMeshes.length; i++) {
      const angle = time * 1.5 + (i * Math.PI * 2 / 3);
      const radius = 0.7;
      this.boss.shieldMeshes[i].position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.3,
        Math.sin(angle) * radius * 0.2
      );
      this.boss.shieldMeshes[i].rotation.z = angle;
    }

    // Boss body pulsing
    const pulse = 0.4 + Math.sin(time * 3) * 0.15;
    const mat = this.boss.bodyMesh.material as MeshStandardMaterial;
    if (this.boss.hitFlash > 0) {
      this.boss.hitFlash -= delta;
      mat.emissiveIntensity = 1.5;
      mat.color.setHex(0xffffff);
    } else {
      mat.emissiveIntensity = pulse;
      mat.color.setHex(0xff2200);
    }

    // Boss firing
    this.boss.fireTimer += delta;
    if (this.boss.fireTimer >= this.boss.fireInterval) {
      this.boss.fireTimer = 0;
      this.fireBossBullets();
    }

    // Remove shield visuals as HP drops
    const hpFrac = this.boss.hp / this.boss.maxHp;
    if (hpFrac < 0.33 && this.boss.shieldMeshes[2].visible) {
      this.boss.shieldMeshes[2].visible = false;
      this.effects?.burst(this.boss.group.position.clone(), 0xff8800, 10);
    }
    if (hpFrac < 0.66 && this.boss.shieldMeshes[1].visible) {
      this.boss.shieldMeshes[1].visible = false;
      this.effects?.burst(this.boss.group.position.clone(), 0xff8800, 10);
    }
  }

  private fireBossBullets() {
    if (!this.boss) return;
    const bossPos = this.boss.group.position;

    // Fire 3-way spread
    const angles = [-0.3, 0, 0.3];
    for (const angle of angles) {
      const geo = new BoxGeometry(0.06, 0.16, 0.06);
      const mat = new MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(bossPos.x, bossPos.y - 0.5, bossPos.z);
      this.scene.add(mesh);
      this.enemyBullets.push({
        mesh,
        vel: new Vector3(Math.sin(angle) * ENEMY_BULLET_SPEED, -ENEMY_BULLET_SPEED, 0),
        isPlayer: false,
      });
    }
    this.audio?.playSound('bossShoot');
  }

  private hitBoss() {
    if (!this.boss || !this.boss.active) return;
    this.boss.hp--;
    this.boss.hitFlash = 0.1;
    this.bossHp = this.boss.hp;
    this.effects?.burst(this.boss.group.position.clone(), 0xff6600, 6);
    this.effects?.shake(0.02, 0.1);
    this.audio?.playSound('hit');

    if (this.boss.hp <= 0) {
      this.killBoss();
    }
  }

  private killBoss() {
    if (!this.boss) return;
    this.boss.active = false;
    this.bossActive = false;

    // Big explosion
    this.effects?.bigExplosion(this.boss.group.position.clone(), 0xff4400);
    this.effects?.bigExplosion(
      this.boss.group.position.clone().add(new Vector3(0.3, 0.2, 0)),
      0xff8800
    );
    this.effects?.shake(0.1, 0.5);

    // Score
    const bossPoints = 500 + this.wave * 50;
    this.score += bossPoints;
    this.bossKillsThisGame++;
    this.totalBossKills++;

    // Guaranteed power-up drop
    const pos = this.boss.group.position.clone();
    this.boss.group.visible = false;

    // Force drop a power-up
    const types: PowerUpType[] = ['shield', 'rapid', 'multi', 'bomb'];
    const type = types[Math.floor(Math.random() * types.length)];
    const color = POWERUP_COLORS[type];
    const group = new Group();
    const glowGeo = new SphereGeometry(0.15, 8, 6);
    const glowMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
    });
    group.add(new Mesh(glowGeo, glowMat));
    const iconGeo = new SphereGeometry(0.06, 6, 4);
    const iconMat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 });
    group.add(new Mesh(iconGeo, iconMat));
    group.position.copy(pos);
    this.scene.add(group);
    this.powerUps.push({
      mesh: group,
      type,
      vel: new Vector3(0, -POWERUP_FALL_SPEED * 0.7, 0),
      active: true,
    });

    this.audio?.playSound('bossDefeat');

    // Flash ring effect for boss kill
    this.effects?.flashRing(pos, 0xff4400, 2.0);

    // Advance wave after boss kill
    this.wave++;
    this.effects?.waveFlash(this.COLOR_SCHEMES[this.colorScheme].accent);

    if (this.mode === 'classic' && this.wave > 10) {
      this.endGame(true);
    } else if (this.mode === 'challenge' && this.wave > 5) {
      this.endGame(true);
    } else {
      this.invaderGroup.position.set(0, 0, 0);
      this.spawnWave();
      this.createShields();
      this.clearPowerUps();
      this.applyWaveTheme();
    }
  }

  private firePlayerBullet() {
    if (this.playerFireCooldown > 0) return;

    const maxBullets = this.activePowerUp === 'multi' ? 6 : 2;
    if (this.playerBullets.length >= maxBullets) return;

    const accent = this.COLOR_SCHEMES[this.colorScheme].accent;

    if (this.activePowerUp === 'multi') {
      // Fire 3 bullets: center + left + right spread
      const offsets = [0, -0.12, 0.12];
      const angles = [0, -0.15, 0.15]; // slight spread angle
      for (let b = 0; b < 3; b++) {
        const geo = new BoxGeometry(0.04, 0.18, 0.04);
        const mat = new MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9 });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(this.playerX + offsets[b], PLAYER_Y + 0.25, 0);
        this.scene.add(mesh);
        this.playerBullets.push({
          mesh,
          vel: new Vector3(Math.sin(angles[b]) * PLAYER_BULLET_SPEED, Math.cos(angles[b]) * PLAYER_BULLET_SPEED, 0),
          isPlayer: true,
        });
      }
    } else {
      const geo = new BoxGeometry(0.04, 0.18, 0.04);
      const mat = new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(this.playerX, PLAYER_Y + 0.25, 0);
      this.scene.add(mesh);
      this.playerBullets.push({ mesh, vel: new Vector3(0, PLAYER_BULLET_SPEED, 0), isPlayer: true });
    }

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

    // Update power-ups
    this.updatePowerUps(delta);

    // Update boss
    this.updateBoss(delta, time);

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
      this.effects?.borderWarning();
      this.effects?.shake(0.02, 0.15);

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
      b.mesh.position.x += b.vel.x * delta;
      b.mesh.position.y += b.vel.y * delta;

      // Bullet trail particles (every few frames)
      if (Math.random() < 0.3) {
        const accent = this.COLOR_SCHEMES[this.colorScheme].accent;
        this.effects?.trail(b.mesh.position.clone(), accent, 1);
      }

      // Off screen
      if (b.mesh.position.y > 4.5 || Math.abs(b.mesh.position.x) > 5) {
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
          this.effects?.bigExplosion(this.ufo.mesh.position.clone(), 0xff8800);
          this.effects?.shake(0.04, 0.2);
          this.audio?.playSound('ufoHit');
          this.scene.remove(b.mesh);
          this.playerBullets.splice(i, 1);
          continue;
        }
      }

      // Check boss hit
      if (this.boss?.active) {
        const dx = b.mesh.position.x - this.boss.group.position.x;
        const dy = b.mesh.position.y - this.boss.group.position.y;
        if (Math.abs(dx) < 0.55 && Math.abs(dy) < 0.45) {
          this.shotsHit++;
          this.totalHits++;
          this.hitBoss();
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
          this.aliensAlive--;
          this.score += INVADER_POINTS[inv.type];
          this.shotsHit++;
          this.totalHits++;
          this.killsThisGame++;
          this.totalKills++;
          this.currentCombo++;
          this.comboTimer = 2;
          if (this.currentCombo > this.maxCombo) this.maxCombo = this.currentCombo;
          this.effects?.burst(worldPos, ALIEN_COLORS[inv.type], 12);
          this.effects?.scorePopup(worldPos.clone(), ALIEN_COLORS[inv.type]);
          // Death animation
          this.deathAnimations.push({ mesh: inv.mesh, timer: 0.25, startScale: 1 });
          const mat = inv.mesh.material as MeshStandardMaterial;
          mat.emissiveIntensity = 1.0;
          // Screen shake on kill
          this.effects?.shake(0.015, 0.1);
          this.audio?.playSound('hit');
          // Try drop power-up
          this.tryDropPowerUp(worldPos.clone());
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

          if (this.isBossWave() && !this.bossActive) {
            // Boss wave: spawn boss after clearing invaders
            this.spawnBoss();
            this.audio?.playSound('waveClear');
            this.effects?.shake(0.04, 0.3);
          } else if (!this.bossActive) {
            // Normal wave progression
            this.wave++;
            this.audio?.playSound('waveClear');
            this.effects?.shake(0.04, 0.3);
            this.effects?.waveFlash(this.COLOR_SCHEMES[this.colorScheme].accent);

            if (this.mode === 'classic' && this.wave > 10) {
              this.endGame(true);
            } else if (this.mode === 'challenge' && this.wave > 5) {
              this.endGame(true);
            } else {
              this.invaderGroup.position.set(0, 0, 0);
              this.spawnWave();
              this.createShields();
              this.clearPowerUps();
              this.applyWaveTheme();
            }
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
          const hitPos = new Vector3(bx, by, 0);
          this.effects?.shieldSpark(hitPos);
          if (block.health <= 0) {
            block.mesh.visible = false;
          } else {
            const mat = block.mesh.material as MeshStandardMaterial;
            mat.opacity = block.health / 3;
            const dmgFrac = 1 - block.health / 3;
            const r = dmgFrac;
            const g = 1 - dmgFrac * 0.3;
            mat.color.setRGB(r, g, 0.26);
            mat.emissive.setRGB(r, g, 0.26);
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
    if (this.mode === 'zen') return;

    // Shield power-up blocks damage
    if (this.activePowerUp === 'shield') {
      this.effects?.burst(this.playerGroup.position.clone(), 0x00aaff, 10);
      this.audio?.playSound('shieldBlock');
      return;
    }

    this.lives--;
    this.effects?.bigExplosion(this.playerGroup.position.clone(), 0xff0000);
    this.effects?.shake(0.06, 0.3);
    this.audio?.playSound('playerHit');

    if (this.lives <= 0) {
      this.endGame(false);
    }
  }

  private animateInvaders(time: number) {
    this.invaderPulsePhase += 0.03;

    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      // Rotation sway
      inv.mesh.rotation.y = Math.sin(time * 2 + inv.col * 0.5) * 0.2;
      // Pulsing glow
      const ratio = this.aliensAlive / (ROWS * COLS);
      const pulseSpeed = 2 + (1 - ratio) * 4;
      const pulseMin = 0.2 + (1 - ratio) * 0.2;
      const pulse = pulseMin + Math.sin(time * pulseSpeed + inv.row * 0.8 + inv.col * 0.3) * 0.15;
      const mat = inv.mesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = pulse;
      const breathe = 1.0 + Math.sin(time * 1.5 + inv.row + inv.col * 0.7) * 0.03;
      inv.mesh.scale.setScalar(breathe);
    }

    // Death animations
    for (let i = this.deathAnimations.length - 1; i >= 0; i--) {
      const da = this.deathAnimations[i];
      da.timer -= 1 / 60;
      if (da.timer <= 0) {
        da.mesh.visible = false;
        da.mesh.scale.setScalar(1);
        this.deathAnimations.splice(i, 1);
      } else {
        const progress = 1 - da.timer / 0.25;
        da.mesh.scale.setScalar(1 + progress * 0.8);
        const mat = da.mesh.material as MeshStandardMaterial;
        mat.opacity = 1 - progress;
      }
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
      // Power-up achievements
      ['Power Up!', this.powerUpsThisGame >= 1],
      ['Power Hoarder', this.powerUpsThisGame >= 5],
      ['Bomb Expert', this.bombsUsedThisGame >= 3],
      // Boss achievements
      ['Boss Slayer', this.bossKillsThisGame >= 1],
      ['Boss Hunter', this.totalBossKills >= 3],
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
    if (this.playerMesh.children[0]) {
      const turretMat = (this.playerMesh.children[0] as Mesh).material as MeshStandardMaterial;
      turretMat.color.setHex(accent);
      turretMat.emissive.setHex(accent);
    }
    this.effects?.setAccentColor(accent);
  }
}
