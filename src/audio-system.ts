import { createSystem } from '@iwsdk/core';

export class AudioSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private pitchIdx = 0;
  private readonly pitchVariants = [1.0, 1.05, 0.95, 1.02];

  init() {
    try { this.ctx = new AudioContext(); } catch { /* no audio */ }
  }

  setEnabled(e: boolean) { this.enabled = e; }

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
      // New power-up sounds
      case 'powerup': this.playMelody([660, 880, 1100], 0.08, 'sine', 0.2); this.tone(440, 0.15, 'triangle', 0.1, 0.2); break;
      case 'bomb': this.noise(0.4, 0.35); this.tone(100, 0.5, 'sawtooth', 0.2); this.tone(60, 0.6, 'sawtooth', 0.15, 0.2); break;
      case 'shieldBlock': this.tone(1200 * pitch, 0.08, 'sine', 0.15); this.tone(900, 0.12, 'sine', 0.1, 0.05); break;
      // Boss sounds
      case 'bossAppear': this.noise(0.15, 0.1); this.playMelody([200, 250, 300, 350], 0.15, 'sawtooth', 0.2); break;
      case 'bossShoot': this.tone(200 * pitch, 0.12, 'sawtooth', 0.12); this.tone(150, 0.15, 'square', 0.08, 0.05); break;
      case 'bossDefeat': this.noise(0.5, 0.3); this.playMelody([400, 500, 600, 800, 1000], 0.12, 'square', 0.2); break;
      // Wave transition
      case 'waveTransition': this.playMelody([392, 523, 659], 0.1, 'triangle', 0.18); break;
      // Combo sounds
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
