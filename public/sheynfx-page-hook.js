(() => {
  if (window.__SHEYNFX_PAGE_HOOK__) return;
  window.__SHEYNFX_PAGE_HOOK__ = true;

  const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const INTERNAL_NODES = new WeakSet();
  const CHAINS = new WeakMap();
  const ORIGINAL_CONNECT = AudioNode.prototype.connect;
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;

  let currentSettings = null;
  let capturedConnectionCount = 0;
  let lastError = '';

  const clamp = (value, min, max) => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);

  const makeFlatEq = () => Object.fromEntries(EQ_BANDS.map((frequency) => [frequency, 0]));

  const getSafeSettings = () => {
    const equalizer = currentSettings?.audio?.equalizer || makeFlatEq();
    const effects = currentSettings?.effects || {};

    return {
      enabled: Boolean(currentSettings?.enabled),
      audio: {
        masterGain: clamp(currentSettings?.audio?.masterGain ?? 1, 0, 1),
        equalizer
      },
      effects: {
        bassBoost: {
          enabled: Boolean(effects.bassBoost?.enabled),
          amount: clamp(effects.bassBoost?.amount ?? 0, 0, 1),
          frequency: clamp(effects.bassBoost?.frequency ?? 95, 45, 220)
        },
        reverb: {
          enabled: Boolean(effects.reverb?.enabled || effects.slowedReverb?.enabled),
          mix: clamp(
            Math.max(effects.reverb?.mix ?? 0, effects.slowedReverb?.enabled ? 0.28 + (effects.slowedReverb?.amount ?? 0.4) * 0.25 : 0),
            0,
            0.85
          ),
          decay: clamp(effects.reverb?.decay ?? 1.6, 0.3, 5),
          dampening: clamp(effects.reverb?.dampening ?? 0.35, 0, 1)
        }
      }
    };
  };

  const markInternal = (...nodes) => {
    nodes.forEach((node) => INTERNAL_NODES.add(node));
  };

  const createImpulse = (context, seconds, dampening) => {
    const rate = context.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = context.createBuffer(2, length, rate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        const envelope = Math.pow(1 - progress, 1.4 + dampening * 2.2);
        data[index] = (Math.random() * 2 - 1) * envelope;
      }
    }

    return impulse;
  };

  const createChain = (context) => {
    const input = context.createGain();
    const output = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const bass = context.createBiquadFilter();
    const convolver = context.createConvolver();
    const analyser = context.createAnalyser();
    const filters = EQ_BANDS.map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = Math.SQRT1_2;
      filter.gain.value = 0;
      return filter;
    });

    analyser.fftSize = 1024;
    bass.type = 'lowshelf';
    bass.frequency.value = 95;
    bass.gain.value = 0;
    dry.gain.value = 1;
    wet.gain.value = 0;
    output.gain.value = 1;
    convolver.buffer = createImpulse(context, 1.6, 0.35);

    markInternal(input, output, dry, wet, bass, convolver, analyser, ...filters);

    let cursor = input;
    filters.forEach((filter) => {
      ORIGINAL_CONNECT.call(cursor, filter);
      cursor = filter;
    });

    ORIGINAL_CONNECT.call(cursor, bass);
    ORIGINAL_CONNECT.call(bass, dry);
    ORIGINAL_CONNECT.call(dry, analyser);
    ORIGINAL_CONNECT.call(analyser, output);
    ORIGINAL_CONNECT.call(bass, convolver);
    ORIGINAL_CONNECT.call(convolver, wet);
    ORIGINAL_CONNECT.call(wet, analyser);
    ORIGINAL_CONNECT.call(output, context.destination);

    const chain = {
      context,
      input,
      output,
      dry,
      wet,
      bass,
      convolver,
      analyser,
      filters,
      disposed: false,
      update(settings) {
        const now = context.currentTime;
        const safe = settings || getSafeSettings();
        const enabled = safe.enabled;

        filters.forEach((filter, index) => {
          const frequency = EQ_BANDS[index];
          const gain = enabled ? clamp(safe.audio.equalizer[frequency] ?? 0, -12, 12) : 0;
          filter.gain.setTargetAtTime(gain, now, 0.015);
        });

        const bassAmount = enabled && safe.effects.bassBoost.enabled ? safe.effects.bassBoost.amount : 0;
        bass.frequency.setTargetAtTime(safe.effects.bassBoost.frequency, now, 0.015);
        bass.gain.setTargetAtTime(bassAmount * 12, now, 0.015);

        const reverbMix = enabled && safe.effects.reverb.enabled ? safe.effects.reverb.mix : 0;
        dry.gain.setTargetAtTime(1 - reverbMix * 0.45, now, 0.02);
        wet.gain.setTargetAtTime(reverbMix, now, 0.02);
        output.gain.setTargetAtTime(enabled ? safe.audio.masterGain : 1, now, 0.015);
      },
      frame() {
        const timeDomain = new Uint8Array(analyser.fftSize);
        const fft = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(timeDomain);
        analyser.getByteFrequencyData(fft);

        let sum = 0;
        let peak = 0;
        for (const value of timeDomain) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
          peak = Math.max(peak, Math.abs(normalized));
        }

        const rms = Math.sqrt(sum / timeDomain.length);
        const avg = (from, to) => {
          const start = Math.max(0, Math.floor((from / (context.sampleRate / 2)) * fft.length));
          const end = Math.min(fft.length, Math.max(start + 1, Math.ceil((to / (context.sampleRate / 2)) * fft.length)));
          let total = 0;
          for (let index = start; index < end; index += 1) total += fft[index];
          return total / (end - start) / 255;
        };

        return {
          fft: Array.from(fft.slice(0, 64)),
          timeDomain: Array.from(timeDomain.slice(0, 128)),
          rms,
          peak,
          bassEnergy: avg(20, 250),
          midEnergy: avg(250, 4000),
          trebleEnergy: avg(4000, 16000)
        };
      }
    };

    chain.update(getSafeSettings());
    return chain;
  };

  const getChain = (context) => {
    let chain = CHAINS.get(context);
    if (!chain) {
      chain = createChain(context);
      CHAINS.set(context, chain);
    }
    return chain;
  };

  AudioNode.prototype.connect = function patchedConnect(destination, ...args) {
    try {
      if (
        destination instanceof AudioDestinationNode &&
        !INTERNAL_NODES.has(this) &&
        this.context instanceof NativeAudioContext
      ) {
        const chain = getChain(this.context);
        capturedConnectionCount += 1;
        ORIGINAL_CONNECT.call(this, chain.input);
        chain.update(getSafeSettings());
        return destination;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    return ORIGINAL_CONNECT.call(this, destination, ...args);
  };

  const getStatus = () => {
    const chains = [];
    CHAINS.forEach?.(() => undefined);
    // WeakMap is not iterable, so store status by known global count and latest visible chain frame.
    let frame = {
      fft: Array.from({ length: 64 }, () => 0),
      timeDomain: Array.from({ length: 128 }, () => 128),
      rms: 0,
      peak: 0,
      bassEnergy: 0,
      midEnergy: 0,
      trebleEnergy: 0
    };

    // Keep a side channel by scanning known contexts is impossible with WeakMap; cache last chain through closure.
    if (window.__SHEYNFX_LAST_CHAIN__) {
      frame = window.__SHEYNFX_LAST_CHAIN__.frame();
    }

    return {
      source: 'sheynfx-page-hook',
      injected: true,
      capturedConnectionCount,
      contextCount: window.__SHEYNFX_CONTEXT_COUNT__ || 0,
      lastError,
      frame
    };
  };

  const originalGetChain = getChain;
  const getAndRememberChain = (context) => {
    const chain = originalGetChain(context);
    window.__SHEYNFX_LAST_CHAIN__ = chain;
    window.__SHEYNFX_CONTEXT_COUNT__ = (window.__SHEYNFX_CONTEXT_COUNT__ || 0) + (chain.__counted ? 0 : 1);
    chain.__counted = true;
    return chain;
  };

  AudioNode.prototype.connect = function patchedConnectWithRemember(destination, ...args) {
    try {
      if (
        destination instanceof AudioDestinationNode &&
        !INTERNAL_NODES.has(this) &&
        this.context instanceof NativeAudioContext
      ) {
        const chain = getAndRememberChain(this.context);
        capturedConnectionCount += 1;
        ORIGINAL_CONNECT.call(this, chain.input);
        chain.update(getSafeSettings());
        return destination;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    return ORIGINAL_CONNECT.call(this, destination, ...args);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'SHEYNFX_PAGE_SETTINGS') {
      currentSettings = event.data.settings || null;
      if (window.__SHEYNFX_LAST_CHAIN__) {
        window.__SHEYNFX_LAST_CHAIN__.update(getSafeSettings());
      }
      window.postMessage({ type: 'SHEYNFX_PAGE_STATUS', status: getStatus() }, '*');
    }

    if (event.data.type === 'SHEYNFX_PAGE_GET_STATUS') {
      window.postMessage({ type: 'SHEYNFX_PAGE_STATUS', status: getStatus() }, '*');
    }
  });

  window.postMessage({ type: 'SHEYNFX_PAGE_HOOK_READY', status: getStatus() }, '*');
})();
