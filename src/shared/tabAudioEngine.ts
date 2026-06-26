export type EqFrequency = 32 | 64 | 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000 | 16000;

export const EQ_BANDS: readonly EqFrequency[] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export type EqSettings = Record<EqFrequency, number>;

export interface TabEffectsSettings {
  bassBoost: { enabled: boolean; amount: number; autoProtect: boolean; protection: number };
  volumeBoost: { amount: number };
  reverb: { enabled: boolean; mix: number };
  nightMode: { enabled: boolean; amount: number };
  slowedReverb: { enabled: boolean; amount: number };
  nightcore: { enabled: boolean; amount: number };
  speed: { enabled: boolean; rate: number };
  pitch: { enabled: boolean; semitones: number };
}

export interface AnalyzerSnapshot {
  rms: number;
  peak: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);

function createImpulseResponse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, decay);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
}

export class TabAudioEngine {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private bassFilter: BiquadFilterNode | null = null;
  private bassCompressor: DynamicsCompressorNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private softLimiter: DynamicsCompressorNode | null = null;
  private volumeGain: GainNode | null = null;
  private nightCompressor: DynamicsCompressorNode | null = null;
  private nightFilter: BiquadFilterNode | null = null;
  private nightLimiter: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private timeData: Uint8Array = new Uint8Array(0);

  async start(stream: MediaStream, eq: EqSettings, effects: TabEffectsSettings): Promise<void> {
    this.stop();

    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);

    const filters = EQ_BANDS.map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = clamp(eq[frequency] ?? 0, -12, 12);
      return filter;
    });

    const bassFilter = context.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 95;
    bassFilter.gain.value = 0;

    const bassCompressor = context.createDynamicsCompressor();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const convolver = context.createConvolver();
    const softLimiter = context.createDynamicsCompressor();
    const volumeGain = context.createGain();
    const nightCompressor = context.createDynamicsCompressor();
    const nightFilter = context.createBiquadFilter();
    const nightLimiter = context.createDynamicsCompressor();
    const outputGain = context.createGain();
    const analyzer = context.createAnalyser();

    analyzer.fftSize = 1024;
    analyzer.smoothingTimeConstant = 0.82;
    convolver.buffer = createImpulseResponse(context, 2.1, 2.4);
    bassCompressor.threshold.value = -18;
    bassCompressor.knee.value = 18;
    bassCompressor.ratio.value = 2.6;
    bassCompressor.attack.value = 0.006;
    bassCompressor.release.value = 0.16;
    softLimiter.threshold.value = -1.2;
    softLimiter.knee.value = 9;
    softLimiter.ratio.value = 16;
    softLimiter.attack.value = 0.002;
    softLimiter.release.value = 0.1;
    nightCompressor.threshold.value = -20;
    nightCompressor.knee.value = 22;
    nightCompressor.ratio.value = 2.4;
    nightCompressor.attack.value = 0.006;
    nightCompressor.release.value = 0.24;
    nightFilter.type = 'highshelf';
    nightFilter.frequency.value = 5200;
    nightFilter.gain.value = 0;
    nightLimiter.threshold.value = -4;
    nightLimiter.knee.value = 8;
    nightLimiter.ratio.value = 10;
    nightLimiter.attack.value = 0.003;
    nightLimiter.release.value = 0.12;

    source.connect(filters[0]);
    filters.forEach((filter, index) => {
      const next = filters[index + 1] ?? bassFilter;
      filter.connect(next);
    });

    bassFilter.connect(bassCompressor);
    bassCompressor.connect(dryGain);
    bassCompressor.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(volumeGain);
    wetGain.connect(volumeGain);
    volumeGain.connect(nightCompressor);
    nightCompressor.connect(nightFilter);
    nightFilter.connect(nightLimiter);
    nightLimiter.connect(softLimiter);
    softLimiter.connect(outputGain);
    outputGain.connect(analyzer);
    analyzer.connect(context.destination);

    this.stream = stream;
    this.context = context;
    this.source = source;
    this.filters = filters;
    this.bassFilter = bassFilter;
    this.bassCompressor = bassCompressor;
    this.dryGain = dryGain;
    this.wetGain = wetGain;
    this.convolver = convolver;
    this.softLimiter = softLimiter;
    this.volumeGain = volumeGain;
    this.nightCompressor = nightCompressor;
    this.nightFilter = nightFilter;
    this.nightLimiter = nightLimiter;
    this.outputGain = outputGain;
    this.analyzer = analyzer;
    this.timeData = new Uint8Array(analyzer.fftSize);

    this.applyEffects(effects);
    await context.resume();
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.filters.forEach((filter) => filter.disconnect());
    this.bassFilter?.disconnect();
    this.bassCompressor?.disconnect();
    this.dryGain?.disconnect();
    this.wetGain?.disconnect();
    this.convolver?.disconnect();
    this.softLimiter?.disconnect();
    this.volumeGain?.disconnect();
    this.nightCompressor?.disconnect();
    this.nightFilter?.disconnect();
    this.nightLimiter?.disconnect();
    this.outputGain?.disconnect();
    this.analyzer?.disconnect();
    void this.context?.close();

    this.stream = null;
    this.context = null;
    this.source = null;
    this.filters = [];
    this.bassFilter = null;
    this.bassCompressor = null;
    this.dryGain = null;
    this.wetGain = null;
    this.convolver = null;
    this.softLimiter = null;
    this.volumeGain = null;
    this.nightCompressor = null;
    this.nightFilter = null;
    this.nightLimiter = null;
    this.outputGain = null;
    this.analyzer = null;
    this.timeData = new Uint8Array(0);
  }

  isRunning(): boolean {
    return Boolean(this.stream && this.context && this.context.state !== 'closed');
  }

  applyEq(eq: EqSettings): void {
    const now = this.context?.currentTime ?? 0;
    this.filters.forEach((filter, index) => {
      const frequency = EQ_BANDS[index];
      filter.gain.setTargetAtTime(clamp(eq[frequency] ?? 0, -12, 12), now, 0.015);
    });
  }

  applyEffects(effects: TabEffectsSettings): void {
    if (
      !this.context ||
      !this.bassFilter ||
      !this.bassCompressor ||
      !this.dryGain ||
      !this.wetGain ||
      !this.softLimiter ||
      !this.volumeGain ||
      !this.nightCompressor ||
      !this.nightFilter ||
      !this.nightLimiter ||
      !this.outputGain
    ) {
      return;
    }

    const now = this.context.currentTime;
    const bassAmount = effects.bassBoost.enabled ? clamp(effects.bassBoost.amount, 0, 1) : 0;
    const protectionAmount = effects.bassBoost.autoProtect ? clamp(effects.bassBoost.protection, 0, 1) : 0;
    const bassEnergyProxy = Math.max(0, bassAmount - 0.35) * protectionAmount;
    const protectedBassAmount = bassAmount * (1 - bassAmount * 0.16 * protectionAmount) * (1 - bassEnergyProxy * 0.28);
    const bassGain = protectedBassAmount * 12;
    const slowedReverbMix = effects.slowedReverb.enabled ? 0.18 + effects.slowedReverb.amount * 0.42 : 0;
    const reverbMix = effects.reverb.enabled ? effects.reverb.mix : 0;
    const wet = clamp(Math.max(reverbMix, slowedReverbMix), 0, 0.72);
    const nightAmount = effects.nightMode.enabled ? clamp(effects.nightMode.amount, 0, 1) : 0;
    const volumeGain = clamp(effects.volumeBoost.amount, 0, 2);
    const makeupGain = 0.92 + bassAmount * 0.06 + nightAmount * 0.08 - wet * 0.05 - Math.max(0, volumeGain - 1) * 0.08;

    this.bassFilter.gain.setTargetAtTime(bassGain, now, 0.015);
    this.bassCompressor.threshold.setTargetAtTime(-13 - bassAmount * (6 + protectionAmount * 10), now, 0.035);
    this.bassCompressor.ratio.setTargetAtTime(1.5 + bassAmount * (1.6 + protectionAmount * 3.1), now, 0.035);
    this.bassCompressor.attack.setTargetAtTime(0.01 - protectionAmount * 0.005, now, 0.035);
    this.bassCompressor.release.setTargetAtTime(0.2 + protectionAmount * 0.16, now, 0.035);
    this.dryGain.gain.setTargetAtTime(1 - wet * 0.42, now, 0.02);
    this.wetGain.gain.setTargetAtTime(wet, now, 0.02);
    this.softLimiter.threshold.setTargetAtTime(-1.1 - bassAmount * 1.5 - Math.max(0, volumeGain - 1) * 3, now, 0.025);
    this.softLimiter.release.setTargetAtTime(0.08 + Math.max(0, volumeGain - 1) * 0.08, now, 0.025);
    this.volumeGain.gain.setTargetAtTime(volumeGain, now, 0.02);
    this.nightCompressor.threshold.setTargetAtTime(-18 - nightAmount * 12, now, 0.02);
    this.nightCompressor.ratio.setTargetAtTime(1.2 + nightAmount * 2.3, now, 0.02);
    this.nightFilter.gain.setTargetAtTime(-nightAmount * 5.5, now, 0.02);
    this.nightLimiter.threshold.setTargetAtTime(-2.5 - nightAmount * 4, now, 0.02);
    this.outputGain.gain.setTargetAtTime(clamp(makeupGain, 0.82, 1.08), now, 0.02);
  }

  captureLevel(): AnalyzerSnapshot {
    if (!this.analyzer || this.timeData.length === 0) {
      return { rms: 0, peak: 0 };
    }

    const buffer = new ArrayBuffer(this.timeData.length);
    const view = new Uint8Array(buffer);
    view.set(this.timeData);
    this.analyzer.getByteTimeDomainData(view);
    this.timeData.set(view);
    let peak = 0;
    let sumSquares = 0;
    for (const value of this.timeData) {
      const normalized = (value - 128) / 128;
      const absolute = Math.abs(normalized);
      peak = Math.max(peak, absolute);
      sumSquares += normalized * normalized;
    }

    return {
      rms: Math.sqrt(sumSquares / this.timeData.length),
      peak
    };
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
