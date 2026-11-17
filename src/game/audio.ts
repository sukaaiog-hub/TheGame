export class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(muted ? 0 : 0.03, this.ctx.currentTime, 0.05);
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.engineOsc && this.ctx) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.value = 65;

      filter.type = 'lowpass';
      filter.frequency.value = 260;

      gain.gain.value = 0;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();

      this.engineOsc = osc;
      this.engineGain = gain;
    }
  }

  public updateEngine(speed: number, maxSpeed: number, boosting: boolean, active: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    if (this.muted || !active) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      return;
    }
    const ratio = Math.min(1.5, Math.abs(speed) / Math.max(1, maxSpeed));
    const targetFreq = 58 + ratio * 115 + (boosting ? 42 : 0);
    const targetGain = 0.025 + Math.min(0.045, ratio * 0.035);
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.06);
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'triangle', volume = 0.12, endFreq?: number): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public playCountdownBeep(isGo: boolean): void {
    this.unlock();
    if (isGo) {
      this.playTone(880, 0.38, 'square', 0.14, 1174);
    } else {
      this.playTone(440, 0.18, 'triangle', 0.12);
    }
  }

  public playBoost(): void {
    this.playTone(220, 0.34, 'sawtooth', 0.11, 740);
  }

  public playItemPickup(): void {
    this.playTone(523, 0.09, 'sine', 0.11);
    setTimeout(() => this.playTone(659, 0.12, 'sine', 0.11), 65);
    setTimeout(() => this.playTone(784, 0.16, 'sine', 0.12), 130);
  }

  public playProjectileFire(): void {
    this.playTone(380, 0.16, 'square', 0.1, 140);
  }

  public playHit(blocked: boolean): void {
    if (blocked) {
      this.playTone(620, 0.22, 'sine', 0.14, 920);
    } else {
      this.playTone(170, 0.35, 'sawtooth', 0.15, 55);
    }
  }

  public playLap(isFinalFinish: boolean): void {
    if (isFinalFinish) {
      [523, 659, 784, 1046].forEach((f, idx) => {
        setTimeout(() => this.playTone(f, 0.25, 'triangle', 0.14), idx * 95);
      });
    } else {
      this.playTone(587, 0.14, 'triangle', 0.12);
      setTimeout(() => this.playTone(880, 0.22, 'triangle', 0.13), 110);
    }
  }

  public dispose(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
      } catch {
        // ignore
      }
      this.engineOsc = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
