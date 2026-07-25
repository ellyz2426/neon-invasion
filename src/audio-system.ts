import { createSystem } from '@iwsdk/core';

export class AudioSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private pitchIdx = 0;
  private readonly pitchVariants = [1.0, 1.05, 0.95, 1.02];

  // Ambient music system
  private musicEnabled = true;
  private musicPlaying = false;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private arpTimer = 0;
  private arpInterval = 0.45;
  private arpNoteIdx = 0;
  private musicGainNode: GainNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain2: GainNode | null = null;
  private musicIntensity = 0.5; // 0-1, scales with gameplay intensity

  // Base arpeggio scales — minor pentatonic feel
  private readonly ARP_SCALES: Record<string, number[]> = {
    Cyan:    [130.81, 155.56, 174.61, 196.00, 233.08, 261.63, 311.13, 349.23],
    Emerald: [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 349.23, 392.00],
    Magenta: [155.56, 185.00, 207.65, 233.08, 277.18, 311.13, 369.99, 415.30],
    Gold:    [164.81, 196.00, 220.00, 246.94, 293.66, 329.63, 392.00, 440.00],
    Crimson: [138.59, 164.81, 185.00, 207.65, 246.94, 277.18, 329.63, 369.99],
    Violet:  [123.47, 146.83, 164.81, 185.00, 220.00, 246.94, 293.66, 329.63],
  };
  private currentScale = 'Cyan';

  init() {
    try { this.ctx = new AudioContext(); } catch { /* no audio */ }
  }

  setEnabled(e: boolean) {
    this.enabled = e;
    if (!e) this.stopMusic();
  }

  setMusicEnabled(e: boolean) {
    this.musicEnabled = e;
    if (!e) this.stopMusic();
  }

  isMusicEnabled(): boolean { return this.musicEnabled; }

  setMusicTheme(themeName: string) {
    this.currentScale = themeName;
  }

  setMusicIntensity(intensity: number) {
    this.musicIntensity = Math.max(0, Math.min(1, intensity));
    // Adjust arp speed: faster at higher intensity
    this.arpInterval = 0.6 - intensity * 0.35; // 0.6s at 0, 0.25s at 1
  }

  startMusic() {
    if (!this.ctx || !this.enabled || !this.musicEnabled || this.musicPlaying) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.musicPlaying = true;

    // Master music gain
    this.musicGainNode = this.ctx.createGain();
    this.musicGainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    this.musicGainNode.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 2);
    this.musicGainNode.connect(this.ctx.destination);

    // Drone 1 — low fundamental
    this.droneOsc = this.ctx.createOscillator();
    this.droneGain = this.ctx.createGain();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2
    this.droneGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.droneOsc.connect(this.droneGain).connect(this.musicGainNode);
    this.droneOsc.start();

    // Drone 2 — fifth above, detuned slightly for width
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneGain2 = this.ctx.createGain();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.setValueAtTime(98.0, this.ctx.currentTime); // G2
    this.droneOsc2.detune.setValueAtTime(5, this.ctx.currentTime); // slight detune
    this.droneGain2.gain.setValueAtTime(0.2, this.ctx.currentTime);
    this.droneOsc2.connect(this.droneGain2).connect(this.musicGainNode);
    this.droneOsc2.start();
  }

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;

    const now = this.ctx?.currentTime || 0;
    if (this.musicGainNode) {
      try {
        this.musicGainNode.gain.linearRampToValueAtTime(0, now + 1);
      } catch { /* ignore */ }
    }

    // Schedule cleanup
    setTimeout(() => {
      try { this.droneOsc?.stop(); } catch { /* ignore */ }
      try { this.droneOsc2?.stop(); } catch { /* ignore */ }
      this.droneOsc = null;
      this.droneOsc2 = null;
      this.droneGain = null;
      this.droneGain2 = null;
      this.musicGainNode = null;
    }, 1200);
  }

  // Call each frame from game-system to tick arpeggio
  updateMusic(delta: number) {
    if (!this.musicPlaying || !this.ctx || !this.musicGainNode) return;

    // Modulate drone volume based on intensity
    const droneVol = 0.04 + this.musicIntensity * 0.04;
    try {
      this.musicGainNode.gain.setTargetAtTime(droneVol, this.ctx.currentTime, 0.3);
    } catch { /* ignore */ }

    // Arpeggio ticks
    this.arpTimer += delta;
    if (this.arpTimer >= this.arpInterval) {
      this.arpTimer = 0;
      this.playArpNote();
    }
  }

  private playArpNote() {
    if (!this.ctx || !this.musicGainNode) return;

    const scale = this.ARP_SCALES[this.currentScale] || this.ARP_SCALES['Cyan'];
    const noteIdx = this.arpNoteIdx % scale.length;
    this.arpNoteIdx++;

    // Pattern: ascending with occasional skip for interest
    const freq = scale[noteIdx];
    const vol = 0.08 + this.musicIntensity * 0.06;
    const dur = this.arpInterval * 0.7;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.setValueAtTime(vol * 0.8, t + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain).connect(this.musicGainNode);
    osc.start(t);
    osc.stop(t + dur + 0.01);

    // Every 4th note, add a subtle high harmonic
    if (noteIdx % 4 === 0 && this.musicIntensity > 0.3) {
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, t);
      gain2.gain.setValueAtTime(vol * 0.3, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
      osc2.connect(gain2).connect(this.musicGainNode);
      osc2.start(t);
      osc2.stop(t + dur * 0.6 + 0.01);
    }
  }

  playSound(name: string) {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const pitch = this.pitchVariants[this.pitchIdx % this.pitchVariants.length];
    this.pitchIdx++;

    switch (name) {
      case 'shoot': this.tone(880 * pitch, 0.06, 'square', 0.15); break;
      case 'hit': this.tone(440 * pitch, 0.1, 'square', 0.2); this.tone(660 * pitch, 0.08, 'sine', 0.12, 0.05); break;
      case 'playerHit': this.noise(0.2, 0.25); this.tone(200, 0.3, 'sawtooth', 0.15); break;
      case 'enemyShoot': this.tone(300 * pitch, 0.08, 'sawtooth', 0.08); break;
      case 'step': this.tone(120 * pitch, 0.04, 'square', 0.04); break;
      case 'drop': this.tone(80, 0.15, 'sawtooth', 0.1); this.tone(60, 0.2, 'square', 0.08, 0.1); break;
      case 'ufo': this.tone(600, 0.3, 'sine', 0.1); this.tone(620, 0.3, 'sine', 0.08, 0.1); this.tone(580, 0.3, 'sine', 0.06, 0.2); break;
      case 'ufoHit': this.tone(1200, 0.15, 'square', 0.2); this.tone(800, 0.15, 'square', 0.15, 0.1); break;
      case 'waveClear': this.playMelody([523, 659, 784, 1047], 0.12, 'sine', 0.15); break;
      case 'victory': this.playMelody([523, 659, 784, 1047, 1319], 0.15, 'sine', 0.2); break;
      case 'defeat': this.playMelody([440, 392, 349, 330], 0.2, 'sine', 0.15); break;
      case 'click': this.tone(1000 * pitch, 0.03, 'square', 0.1); break;
      case 'start': this.playMelody([262, 330, 392, 523], 0.1, 'square', 0.15); break;
      case 'achievement': this.playMelody([784, 988, 1175], 0.1, 'sine', 0.2); break;
      case 'powerup': this.playMelody([660, 880, 1100], 0.08, 'sine', 0.2); this.tone(440, 0.15, 'triangle', 0.1, 0.2); break;
      case 'bomb': this.noise(0.4, 0.35); this.tone(100, 0.5, 'sawtooth', 0.2); this.tone(60, 0.6, 'sawtooth', 0.15, 0.2); break;
      case 'shieldBlock': this.tone(1200 * pitch, 0.08, 'sine', 0.15); this.tone(900, 0.12, 'sine', 0.1, 0.05); break;
      case 'bossAppear': this.noise(0.15, 0.1); this.playMelody([200, 250, 300, 350], 0.15, 'sawtooth', 0.2); break;
      case 'bossShoot': this.tone(200 * pitch, 0.12, 'sawtooth', 0.12); this.tone(150, 0.15, 'square', 0.08, 0.05); break;
      case 'bossDefeat': this.noise(0.5, 0.3); this.playMelody([400, 500, 600, 800, 1000], 0.12, 'square', 0.2); break;
      case 'waveTransition': this.playMelody([392, 523, 659], 0.1, 'triangle', 0.18); break;
      case 'comboUp': this.tone(1200 * pitch, 0.05, 'sine', 0.12); this.tone(1600 * pitch, 0.04, 'sine', 0.1, 0.03); break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private noise(dur: number, vol: number) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * vol;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    source.connect(gain).connect(this.ctx.destination);
    source.start();
  }

  private playMelody(notes: number[], noteDur: number, type: OscillatorType, vol: number) {
    for (let i = 0; i < notes.length; i++) {
      this.tone(notes[i], noteDur, type, vol, i * noteDur * 0.9);
    }
  }
}
