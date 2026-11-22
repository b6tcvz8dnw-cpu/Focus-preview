// Ambient sound synthesis and lifecycle, independent from application state.
export function createAmbientSoundController({
  root = document,
  getAudioContextConstructor = () => globalThis.AudioContext || globalThis.webkitAudioContext,
  getVolume = () => 0.5,
  getLayerVolume = () => 0.5,
  getExistingAudioContext = () => null,
  onContextCreated = () => {},
  onUnsupported = () => {},
  random = Math.random
} = {}) {
  const layers = new Map();
  let context = null;
  let masterVolume = Math.max(0, Math.min(1, Number(getVolume()) || 0));
  const layerVolumes = {};
  const clampVolume = value => Math.max(0, Math.min(1, Number(value) || 0));
  const volumeFor = kind => (Object.hasOwn(layerVolumes, kind) ? layerVolumes[kind] : clampVolume(getLayerVolume(kind))) * masterVolume;
  const presets = {
    rainy: ['rain', 'noise'],
    breeze: ['wind'],
    quiet: ['noise'],
    off: []
  };
  function buttonFor(kind) {
    return root.querySelector?.('[data-sound="' + kind + '"]') || null;
  }
  function updateLayerButton(kind) {
    const button = buttonFor(kind);
    if (!button) return;
    const active = layers.has(kind);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
  function updatePresetButtons(activePreset = null) {
    root.querySelectorAll?.('[data-sound-preset]').forEach(button => {
      button.classList.toggle('selected', button.dataset.soundPreset === activePreset);
    });
  }
  function safeFadeAndStop(layer) {
    try {
      layer.gain.gain.setTargetAtTime(0, context.currentTime, 0.12);
      layer.source.stop(context.currentTime + 0.5);
    } catch {}
  }
  function stop() {
    for (const [kind, layer] of layers) {
      safeFadeAndStop(layer);
      updateLayerButton(kind);
    }
    layers.clear();
    root.querySelectorAll?.('[data-sound]').forEach(button => {
      button.classList.remove('selected');
      button.setAttribute('aria-pressed', 'false');
    });
    updatePresetButtons();
  }
  function setLayer(kind, enabled) {
    if (!['rain', 'wind', 'noise'].includes(kind)) return false;
    if (enabled && layers.has(kind)) return true;
    if (!enabled && layers.has(kind)) {
      safeFadeAndStop(layers.get(kind));
      layers.delete(kind);
      updateLayerButton(kind);
      updatePresetButtons();
      return true;
    }
    if (!enabled) return true;
    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      onUnsupported();
      return false;
    }
    try {
      if (!context) {
        context = getExistingAudioContext() || new AudioContextCtor();
        onContextCreated(context);
      }
      const resumed = context.resume?.();
      if (resumed?.catch) resumed.catch(() => {});
      const size = context.sampleRate * 4;
      const buffer = context.createBuffer(1, size, context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < size; i++) {
        const white = random() * 2 - 1;
        if (kind === 'wind') {
          last = 0.985 * last + 0.015 * white;
          data[i] = last * 3;
        } else if (kind === 'rain') data[i] = white * 0.34;
        else data[i] = white * 0.16;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = kind === 'rain' ? 'lowpass' : kind === 'wind' ? 'lowpass' : 'bandpass';
      filter.frequency.value = kind === 'rain' ? 1100 : kind === 'wind' ? 380 : 520;
      const gain = context.createGain();
      gain.gain.value = volumeFor(kind);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start();
      layers.set(kind, { source, gain });
      updateLayerButton(kind);
      return true;
    } catch {
      onUnsupported();
      return false;
    }
  }
  function toggle(kind) {
    if (kind === 'off') {
      stop();
      return;
    }
    setLayer(kind, !layers.has(kind));
    updatePresetButtons();
  }
  function setPreset(name) {
    stop();
    for (const kind of presets[name] || []) setLayer(kind, true);
    updatePresetButtons(Object.hasOwn(presets, name) ? name : null);
  }
  function setVolume(volume) {
    masterVolume = clampVolume(volume);
    for (const [kind, layer] of layers) {
      try { layer.gain.gain.setTargetAtTime(volumeFor(kind), context.currentTime, 0.08); } catch {}
    }
  }
  function setLayerVolume(kind, volume) {
    if (!['rain', 'wind', 'noise'].includes(kind)) return false;
    layerVolumes[kind] = clampVolume(volume);
    const layer = layers.get(kind);
    if (layer && context) {
      try { layer.gain.gain.setTargetAtTime(volumeFor(kind), context.currentTime, 0.08); } catch {}
    }
    return true;
  }
  return {
    toggle, setLayer, setPreset, setVolume, setLayerVolume, stop,
    getActiveLayers: () => [...layers.keys()],
    destroy() { stop(); }
  };
}
