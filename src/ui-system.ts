import {
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Entity,
} from '@iwsdk/core';
import type { GameSystem } from './game-system';
import type { AudioSystem } from './audio-system';

const getDoc = (e: Entity) => e.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
const setText = (e: Entity, id: string, text: string) =>
  (getDoc(e)?.getElementById(id) as UIKit.Text | undefined)?.setProperties({ text });

export class UISystem extends createSystem({
  menuQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/menu.json')] },
  hudQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  pauseQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  resultsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/results.json')] },
  achQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achpanel.json')] },
  settingsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  statsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  tutorialQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/tutorial.json')] },
  lbQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
}) {
  private game!: GameSystem;
  private audio!: AudioSystem;
  private panels: Record<string, any> = {};
  private positions: Record<string, [number, number, number]> = {};
  private activePanel = 'menu';
  private achPage = 0;
  private notifyTimer = 0;
  private powerUpNotifyTimer = 0;
  private waveTransitionTimer = 0;

  setRefs(refs: { game: GameSystem; audio: AudioSystem; panels: Record<string, any>; positions: Record<string, [number, number, number]> }) {
    this.game = refs.game;
    this.audio = refs.audio;
    this.panels = refs.panels;
    this.positions = refs.positions;
  }

  showPanel(name: string) {
    for (const [key, entity] of Object.entries(this.panels)) {
      if (!entity?.object3D) continue;
      if (key === 'hud') continue;
      if (key === name) {
        const pos = this.positions[key];
        entity.object3D.position.set(pos[0], pos[1], pos[2]);
      } else {
        entity.object3D.position.y = -50;
      }
    }
    this.activePanel = name;
  }

  showHUD(visible: boolean) {
    if (!this.panels.hud?.object3D) return;
    const pos = this.positions.hud;
    this.panels.hud.object3D.position.set(pos[0], visible ? pos[1] : -50, pos[2]);
  }

  init() {
    // Menu
    this.queries.menuQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const wire = (id: string, fn: () => void) => {
        const el = doc.getElementById(id) as UIKit.Text | undefined;
        el?.addEventListener('click', () => { fn(); this.audio?.playSound('click'); });
      };
      wire('btn-play', () => { this.game.startGame(); this.showPanel('hud'); this.showHUD(true); });
      wire('btn-settings', () => { this.updateSettings(); this.showPanel('settings'); });
      wire('btn-tutorial', () => this.showPanel('tutorial'));
      wire('btn-stats', () => { this.updateStats(); this.showPanel('stats'); });
      wire('btn-achievements', () => { this.updateAch(); this.showPanel('achpanel'); });
      wire('btn-leaderboard', () => { this.updateLeaderboard(); this.showPanel('leaderboard'); });
      this.updateMenu();
    });

    // Pause
    this.queries.pauseQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const wire = (id: string, fn: () => void) => {
        const el = doc.getElementById(id) as UIKit.Text | undefined;
        el?.addEventListener('click', () => { fn(); this.audio?.playSound('click'); });
      };
      wire('btn-resume', () => { this.game.resumeGame(); this.showPanel('hud'); this.showHUD(true); });
      wire('btn-quit', () => { this.game.returnToMenu(); this.showHUD(false); this.showPanel('menu'); });
    });

    // Results
    this.queries.resultsQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const wire = (id: string, fn: () => void) => {
        const el = doc.getElementById(id) as UIKit.Text | undefined;
        el?.addEventListener('click', () => { fn(); this.audio?.playSound('click'); });
      };
      wire('btn-play-again', () => { this.game.startGame(); this.showPanel('hud'); this.showHUD(true); });
      wire('btn-menu', () => { this.game.returnToMenu(); this.showHUD(false); this.showPanel('menu'); });
    });

    // Achievements
    this.queries.achQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const wire = (id: string, fn: () => void) => {
        const el = doc.getElementById(id) as UIKit.Text | undefined;
        el?.addEventListener('click', () => { fn(); this.audio?.playSound('click'); });
      };
      wire('btn-ach-prev', () => { this.achPage = Math.max(0, this.achPage - 1); this.updateAch(); });
      wire('btn-ach-next', () => { this.achPage = Math.min(3, this.achPage + 1); this.updateAch(); });
      wire('btn-ach-back', () => this.showPanel('menu'));
    });

    // Settings
    this.queries.settingsQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const wire = (id: string, fn: () => void) => {
        const el = doc.getElementById(id) as UIKit.Text | undefined;
        el?.addEventListener('click', () => { fn(); this.audio?.playSound('click'); });
      };
      wire('btn-color-prev', () => { this.game.colorScheme = (this.game.colorScheme + 3) % 4; this.game.updatePlayerColor(); this.game.savePersistence(); this.updateSettings(); });
      wire('btn-color-next', () => { this.game.colorScheme = (this.game.colorScheme + 1) % 4; this.game.updatePlayerColor(); this.game.savePersistence(); this.updateSettings(); });
      wire('btn-sound-toggle', () => { this.game.soundEnabled = !this.game.soundEnabled; this.game.savePersistence(); this.updateSettings(); });
      wire('btn-mode-prev', () => {
        const modes = ['classic', 'speed', 'zen', 'challenge', 'endless'] as const;
        const idx = modes.indexOf(this.game.mode);
        this.game.mode = modes[(idx + 4) % 5];
        this.game.savePersistence(); this.updateSettings();
      });
      wire('btn-mode-next', () => {
        const modes = ['classic', 'speed', 'zen', 'challenge', 'endless'] as const;
        const idx = modes.indexOf(this.game.mode);
        this.game.mode = modes[(idx + 1) % 5];
        this.game.savePersistence(); this.updateSettings();
      });
      wire('btn-diff-prev', () => {
        const diffs = ['easy', 'medium', 'hard'] as const;
        const idx = diffs.indexOf(this.game.difficulty);
        this.game.difficulty = diffs[(idx + 2) % 3];
        this.game.savePersistence(); this.updateSettings();
      });
      wire('btn-diff-next', () => {
        const diffs = ['easy', 'medium', 'hard'] as const;
        const idx = diffs.indexOf(this.game.difficulty);
        this.game.difficulty = diffs[(idx + 1) % 3];
        this.game.savePersistence(); this.updateSettings();
      });
      wire('btn-settings-back', () => { this.updateMenu(); this.showPanel('menu'); });
      this.updateSettings();
    });

    // Stats
    this.queries.statsQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const el = doc.getElementById('btn-stats-back') as UIKit.Text | undefined;
      el?.addEventListener('click', () => { this.showPanel('menu'); this.audio?.playSound('click'); });
    });

    // Tutorial
    this.queries.tutorialQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const el = doc.getElementById('btn-tutorial-back') as UIKit.Text | undefined;
      el?.addEventListener('click', () => { this.showPanel('menu'); this.audio?.playSound('click'); });
    });

    // Leaderboard
    this.queries.lbQ.subscribe('qualify', (entity: Entity) => {
      const doc = getDoc(entity);
      if (!doc) return;
      const el = doc.getElementById('btn-lb-back') as UIKit.Text | undefined;
      el?.addEventListener('click', () => { this.showPanel('menu'); this.audio?.playSound('click'); });
      this.updateLeaderboard();
    });
  }

  private set(panel: string, id: string, text: string) {
    const e = this.panels[panel];
    if (!e) return;
    setText(e, id, text);
  }

  updateHUD() {
    this.set('hud', 'score-val', `${this.game.score}`);
    this.set('hud', 'lives-val', `x${this.game.lives}`);
    this.set('hud', 'wave-val', `Wave ${this.game.wave}`);
    this.set('hud', 'high-val', `Best: ${this.game.highScore}`);
    if (this.game.mode === 'speed') {
      this.set('hud', 'timer-val', `${Math.ceil(this.game.speedTimer)}s`);
    } else {
      this.set('hud', 'timer-val', '');
    }
    if (this.game.currentCombo > 1) {
      const mul = this.game.comboMultiplier.toFixed(1);
      this.set('hud', 'combo-val', `x${this.game.currentCombo} (${mul}x)`);
    } else {
      this.set('hud', 'combo-val', '');
    }

    // Power-up indicator
    if (this.game.activePowerUp) {
      const names: Record<string, string> = { shield: 'SHIELD', rapid: 'RAPID', multi: 'MULTI' };
      const name = names[this.game.activePowerUp] || '';
      const secs = Math.ceil(this.game.powerUpTimer);
      this.set('hud', 'powerup-val', `${name} ${secs}s`);
    } else {
      this.set('hud', 'powerup-val', '');
    }

    // Boss HP indicator with variant name
    if (this.game.bossActive) {
      const filled = Math.ceil((this.game.bossHp / this.game.bossMaxHp) * 10);
      const bar = '|'.repeat(filled) + '.'.repeat(10 - filled);
      const variantName = this.game.getBossVariantName();
      this.set('hud', 'boss-val', `${variantName} [${bar}]`);
    } else {
      this.set('hud', 'boss-val', '');
    }
  }

  private updateMenu() {
    this.set('menu', 'high-score', `High Score: ${this.game.highScore}`);
    this.set('menu', 'mode-display', `Mode: ${this.game.mode.toUpperCase()}`);
  }

  private updateSettings() {
    this.set('settings', 'color-val', this.game.getColorName());
    this.set('settings', 'sound-val', this.game.soundEnabled ? 'ON' : 'OFF');
    this.set('settings', 'mode-val', this.game.mode.toUpperCase());
    this.set('settings', 'diff-val', this.game.difficulty.toUpperCase());
  }

  showResults() {
    const won = this.game.lives > 0;
    this.set('results', 'result-title', won ? 'VICTORY!' : 'GAME OVER');
    this.set('results', 'result-score', `Score: ${this.game.score}`);
    this.set('results', 'result-waves', `Waves: ${this.game.wavesCleared}`);
    this.set('results', 'result-accuracy', `Accuracy: ${this.game.getAccuracy()}%`);
    const stars = this.game.getStarRating();
    this.set('results', 'result-stars', '*'.repeat(stars) + '-'.repeat(3 - stars));
    this.set('results', 'result-time', `Time: ${Math.floor(this.game.gameTime)}s`);
    this.set('results', 'result-combo', `Best Combo: x${this.game.currentCombo > 0 ? this.game.currentCombo : 0}`);
    this.set('results', 'result-new-high', this.game.score >= this.game.highScore && this.game.score > 0 ? 'NEW HIGH SCORE!' : '');
    this.showHUD(false);
    this.showPanel('results');
  }

  private updateStats() {
    this.set('stats', 'stat-games', `Games Played: ${this.game.gamesPlayed}`);
    this.set('stats', 'stat-wins', `Games Won: ${this.game.totalGamesWon}`);
    this.set('stats', 'stat-high', `High Score: ${this.game.highScore}`);
    this.set('stats', 'stat-best-wave', `Best Wave: ${this.game.bestWave}`);
    this.set('stats', 'stat-kills', `Total Kills: ${this.game.totalKills}`);
    this.set('stats', 'stat-ufos', `UFOs Hit: ${this.game.totalUFOs}`);
    this.set('stats', 'stat-shots', `Total Shots: ${this.game.totalShots}`);
    this.set('stats', 'stat-accuracy', `Accuracy: ${this.game.totalShots > 0 ? Math.round(this.game.totalHits / this.game.totalShots * 100) : 0}%`);
    this.set('stats', 'stat-streak', `Best Streak: ${this.game.bestStreak}`);
    this.set('stats', 'stat-combo', `Best Combo: ${this.game.bestCombo}`);
    this.set('stats', 'stat-bosses', `Bosses Killed: ${this.game.totalBossKills}`);
    this.set('stats', 'stat-powerups', `Power-Ups: ${this.game.totalPowerUpsEver}`);
  }

  private updateAch() {
    const all = [
      'First Blood', 'Wave Rider', 'Sharpshooter', 'UFO Hunter',
      'Combo x5', 'Combo x10', 'Wave 5', 'Wave 10',
      'Score 1000', 'Score 5000', 'Score 10000', 'Perfect Wave',
      'UFO Master', 'Survivor', 'Speed Demon', 'Challenge Clear',
      'Marathon', '10 Games', 'Win Streak 3', 'Untouchable',
      'Power Up!', 'Power Hoarder', 'Bomb Expert', 'Boss Slayer', 'Boss Hunter',
      'Combo x15', 'Multiplier Max', 'Wave 15', 'Score 25000', 'Collector',
      'Striker Down', 'Bomber Down', 'Fortress Breaker', 'Boss Trio', 'Hard Mode',
    ];
    const totalPages = Math.ceil(all.length / 10);
    const perPage = 10;
    const start = this.achPage * perPage;
    const page = all.slice(start, start + perPage);
    for (let i = 0; i < perPage; i++) {
      const ach = page[i];
      const unlocked = ach ? this.game.achievements.includes(ach) : false;
      this.set('achpanel', `ach-${i}`, ach ? (unlocked ? `[*] ${ach}` : `[ ] ${ach}`) : '');
    }
    this.set('achpanel', 'ach-page', `${this.achPage + 1}/${totalPages}`);
    this.set('achpanel', 'ach-count', `${this.game.achievements.length}/${all.length}`);
  }

  private updateLeaderboard() {
    const lb = this.game.leaderboard;
    for (let i = 0; i < 5; i++) {
      if (i < lb.length) {
        const entry = lb[i];
        this.set('leaderboard', `score-${i}`, `${entry.score}`);
        this.set('leaderboard', `info-${i}`, `W${entry.wave} ${entry.mode.toUpperCase()} ${entry.date}`);
      } else {
        this.set('leaderboard', `score-${i}`, '---');
        this.set('leaderboard', `info-${i}`, '');
      }
    }
  }

  showAchievement(name: string) {
    this.set('hud', 'ach-notify', `Achievement: ${name}!`);
    this.notifyTimer = 3;
    this.audio?.playSound('achievement');
  }

  showPowerUpNotify(type: string) {
    const names: Record<string, string> = {
      shield: 'SHIELD ACTIVE!',
      rapid: 'RAPID FIRE!',
      multi: 'MULTI-SHOT!',
      bomb: 'BOMB!',
    };
    this.set('hud', 'ach-notify', names[type] || 'POWER-UP!');
    this.powerUpNotifyTimer = 2;
  }

  showWaveTransition(wave: number) {
    const theme = this.game.getWaveThemeName();
    this.set('hud', 'wave-announce', `WAVE ${wave}`);
    this.set('hud', 'wave-theme', `${theme} Zone`);
    this.waveTransitionTimer = 1.5;
    this.audio?.playSound('waveTransition');
  }

  update(delta: number) {
    if (this.notifyTimer > 0) {
      this.notifyTimer -= delta;
      if (this.notifyTimer <= 0) {
        this.set('hud', 'ach-notify', '');
      }
    }
    if (this.powerUpNotifyTimer > 0) {
      this.powerUpNotifyTimer -= delta;
      if (this.powerUpNotifyTimer <= 0 && this.notifyTimer <= 0) {
        this.set('hud', 'ach-notify', '');
      }
    }
    if (this.waveTransitionTimer > 0) {
      this.waveTransitionTimer -= delta;
      if (this.waveTransitionTimer <= 0) {
        this.set('hud', 'wave-announce', '');
        this.set('hud', 'wave-theme', '');
      }
    }
    if (this.game.state === 'results' && this.activePanel === 'hud') {
      this.showResults();
    }
  }
}
