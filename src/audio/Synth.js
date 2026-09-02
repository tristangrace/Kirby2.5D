/**
 * Runtime synthesis toolkit.
 *
 * The project ships zero binary assets, so every sound the game makes is built
 * here out of oscillators, noise and procedurally rendered `AudioBuffer`s.
 * Nothing in this file touches the game -- it is a pure DSP construction kit
 * consumed by `Sfx.js`, `Music.js` and `AudioEngine.js`.
 */

/** Exponential ramps cannot reach zero; this is our practical silence. */
export const MIN_GAIN = 1e-4;

/** Equal-temperament MIDI note -> Hz. */
export function mtof(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** dB -> linear gain. */
export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

// xorshift32: variation on every one-shot must be cheap and allocation-free,
// and we never need cryptographic quality.
let _seed = 0x2f6e2b1;
export function rnd() {
  _seed ^= _seed << 13;
  _seed ^= _seed >>> 17;
  _seed ^= _seed << 5;
  return (_seed >>> 0) / 4294967296;
}
/** Uniform random in [a, b). */
export function rrange(a, b) {
  return a + rnd() * (b - a);
}
/** Random detune in cents, +/- `c`. */
export function jitterCents(c) {
  return rrange(-c, c);
}

// ---------------------------------------------------------------------------
// Procedural buffers
// ---------------------------------------------------------------------------

/**
 * Stereo noise bed: essentially white, with only a slight low tilt.
 *
 * It is tempting to bake a strong pink tilt in here -- raw white reads as thin
 * digital fizz on its own. But every recipe band-passes or low-passes this bed
 * anyway, so shaping belongs at the recipe, and a heavy tilt at the source is
 * actively harmful: at 10.6 dB it left so little energy above 6 kHz that the
 * high-passed transient layers on `land`, `enemyHit` and `swallow` were
 * inaudible no matter what gain they were given.
 */
export function createNoiseBuffer(ctx, seconds = 2.5, channels = 2) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      lp += (w - lp) * 0.14;
      const v = w * 0.92 + lp * 0.34;
      d[i] = v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    const k = peak > 0 ? 0.92 / peak : 1;
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  return buf;
}

/**
 * Procedural impulse response for the convolution reverb: a stereo noise burst
 * shaped by an exponential decay, with a short build-in so the head reads as
 * early reflections rather than a click, and progressive high-frequency damping
 * that models air absorption over the tail.
 *
 * `tone` is the one-pole coefficient the tail *starts* at and `floorTone` the
 * one it closes to, so together they set how bright the room is. They matter
 * more than they look: a reverb return is a large fraction of a sustained mix's
 * energy, so a dark tail caps the whole score's top end no matter how bright
 * the sources are. The music return runs far brighter than the SFX one for
 * exactly that reason.
 *
 * @param {AudioContext} ctx
 * @param {{seconds?:number, decay?:number, preDelay?:number, damp?:number,
 *          tone?:number, floorTone?:number}} o
 */
export function createImpulseResponse(ctx, o = {}) {
  const {
    seconds = 1.8, decay = 2.8, preDelay = 0.014, damp = 0.55,
    tone = 0.3, floorTone = 0.02,
  } = o;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const pre = Math.floor(sr * preDelay);
  const ir = ctx.createBuffer(2, len, sr);

  // This runs inside the unlock gesture, so it must not cost a visible frame.
  // `Math.pow` per sample over ~170k samples is the whole budget by itself;
  // a 2048-point curve with linear interpolation is inaudibly different.
  const LUT = 2048;
  const curve = new Float32Array(LUT + 1);
  for (let i = 0; i <= LUT; i++) curve[i] = Math.pow(1 - i / LUT, decay);
  // The build-in is a one-pole, so it can be a single multiply per sample.
  const buildK = Math.exp(-1 / (sr * 0.012));
  // Zero-mean the tail: the damping one-pole otherwise leaves a large DC and
  // infrasonic component that the convolver injects straight into both buses.
  const dcK = 1 - Math.exp(-2 * Math.PI * 60 / sr);

  let energy = 0;
  const span = len - pre;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    let dc = 0;
    let build = 1;
    for (let i = 0; i < len; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const n = i - pre;
      const t = n / span;
      build *= buildK;
      const f = t * LUT;
      const fi = f | 0;
      const tail = curve[fi] + (curve[fi + 1] - curve[fi]) * (f - fi);
      const env = tail * (1 - build);
      // A one-pole coefficient near 1 barely filters at all, which is why the
      // old tail measured as near-white (flatness 0.85, centroid 11.5 kHz) --
      // a noise burst, not a room. Starting well below 1 and closing further
      // over the tail gives the air absorption a real room has.
      const coef = Math.max(floorTone, tone * (1 - t * damp * 0.85));
      lp += ((rnd() * 2 - 1) - lp) * coef;
      dc += (lp - dc) * dcK;
      const v = (lp - dc) * env;
      d[i] = v;
      energy += v * v;
    }
  }
  // Normalise by *energy*, not peak. Convolution gain is set by the total
  // energy of the response, so a peak-normalised IR gives wildly different wet
  // levels for different decay times and makes the return gain meaningless --
  // this way a return gain of 0.3 really is about 30% wet.
  const k = energy > 0 ? Math.sqrt(2 / energy) : 1;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  return ir;
}

/**
 * Wavetable from an array of harmonic amplitudes (index 0 == fundamental).
 * Cheaper and far more controllable than stacking oscillators for the bright,
 * hollow timbres this soundtrack leans on.
 */
export function harmonicWave(ctx, partials) {
  const n = partials.length + 1;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 0; i < partials.length; i++) imag[i + 1] = partials[i];
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Named wavetables built once per context. */
export function createWaveSet(ctx) {
  return {
    // Softened square: odd harmonics with a steep rolloff. Reads as "toy horn".
    softSquare: harmonicWave(ctx, [1, 0, 0.42, 0, 0.2, 0, 0.1, 0, 0.05, 0, 0.02]),
    // Hollow pulse for the lead -- a touch of even harmonics keeps it sweet.
    toyLead: harmonicWave(ctx, [1, 0.28, 0.36, 0.1, 0.16, 0.05, 0.07, 0.03, 0.02]),
    // Plucked string-ish: dense but fast-rolling harmonics.
    pluck: harmonicWave(ctx, [1, 0.62, 0.4, 0.28, 0.19, 0.13, 0.09, 0.06, 0.04, 0.03, 0.02]),
    // Glassy bell partials (stretched, slightly inharmonic feel by omission).
    bell: harmonicWave(ctx, [1, 0, 0.5, 0, 0.24, 0, 0, 0.14, 0, 0, 0.07]),
    // Celesta/glockenspiel. Separate from `bell` because it has a different
    // job: `bell` is a mid-register counter-line voice, this is the top-octave
    // one, and a struck metal bar played two octaves above the tune has to
    // still put something in the 8-16 kHz band or the score has no air at all.
    // The series runs to the 19th partial with a deliberately uneven envelope
    // -- an evenly-decaying series reads as a filtered saw, and it is the gaps
    // that make metal sound struck.
    glass: harmonicWave(ctx, [
      1, 0.05, 0.44, 0.04, 0.31, 0.03, 0.05, 0.24, 0.03,
      0.03, 0.17, 0.02, 0.02, 0.03, 0.12, 0.02, 0.02, 0.02, 0.08,
    ]),
    // Round bass with a strong fundamental and a little bite.
    bass: harmonicWave(ctx, [1, 0.5, 0.22, 0.12, 0.06, 0.03]),
    // Pad with genuine upper partials. Two detuned triangles have almost
    // nothing above the fifth harmonic, which is most of why the exploration
    // bed measured 72% of its energy below 1 kHz however its filter was set.
    pad: harmonicWave(ctx, [
      1, 0.42, 0.3, 0.2, 0.15, 0.115, 0.09, 0.072, 0.058, 0.047,
      0.039, 0.032, 0.027, 0.022, 0.018, 0.015, 0.012, 0.01, 0.008, 0.007,
    ]),
  };
}

/**
 * Soft-clip curve: rounds the approach to a ceiling. It shapes; it does not
 * bound. Anything that needs a real guarantee wants `createHardClipCurve`.
 *
 * Linear below `knee` and tanh-saturating above it. A plain normalised
 * `tanh(kx)/tanh(k)` would be tempting but it has a slope of k/tanh(k) at the
 * origin -- i.e. it quietly applies makeup gain to *everything*, which both
 * decouples the limiter threshold from the real output level and colours
 * material that was never near clipping.
 *
 * NOTE: a `WaveShaper` with oversampling does *not* respect this asymptote --
 * the up/downsample filters ring 12-54% past it depending on programme, which
 * is why every bus that needs an actual bound follows this with a hard clip at
 * `oversample: 'none'`.
 *
 * @param {number} knee    amplitude below which the curve is exactly unity
 * @param {number} ceiling the asymptote the curve tends to; the *shaped* value
 *   respects it, oversampled reconstruction may overshoot slightly
 */
export function createSoftClipCurve(knee = 0.7, ceiling = 1, n = 2048) {
  const curve = new Float32Array(n);
  const span = Math.max(1e-3, ceiling - knee);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

/**
 * Substitute `fallback` for anything Web Audio would reject.
 *
 * Every scheduling call in this file goes through here. A single NaN arriving
 * from gameplay -- a physics frame that divided by zero, a health value read
 * before it was set -- otherwise throws inside an `AudioParam` call, and the
 * sound is lost from a code path that had nothing to do with the bug.
 */
function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Hard clip at `ceiling`: identity below it, flat above.
 *
 * The last brick wall. Must be used with `oversample: 'none'` -- oversampling a
 * clipper reintroduces exactly the overshoot it exists to prevent, which is how
 * the soft-clipper downstream of the limiter was measuring 1.05 while its own
 * asymptote was 0.93.
 */
export function createHardClipCurve(ceiling = 0.98, n = 4096) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.max(-ceiling, Math.min(ceiling, x));
  }
  return curve;
}

/**
 * Cancel scheduled automation while holding the value the param has *right now*.
 *
 * `cancelScheduledValues(t)` alone is a trap: it deletes the in-flight ramp, and
 * for the sample at exactly `t` the param can fall back to an older event that
 * survived -- an audible tick. `cancelAndHoldAtTime` is the correct primitive;
 * Safari lacks it, so the fallback reads the computed value back first. Reading
 * `.value` is not equivalent on its own: it happens to work in Chrome only
 * because Chrome returns the last audio-thread value rather than recomputing
 * the post-cancel timeline, which is the exact dependency this removes.
 */
export function cancelAndHold(param, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
    return param.value;
  }
  const held = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(held, t);
  return held;
}

/**
 * Percussive attack/decay envelope. Returns the time at which the voice is
 * silent and may be stopped.
 */
export function envAD(param, t0, peak, attack, decay, linear = false) {
  const p = Math.max(MIN_GAIN * 2, num(peak, MIN_GAIN * 2));
  attack = Math.max(0, num(attack, 0.002));
  decay = Math.max(0.001, num(decay, 0.1));
  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  param.linearRampToValueAtTime(p, t0 + attack);
  if (linear) param.linearRampToValueAtTime(0, t0 + attack + decay);
  else param.exponentialRampToValueAtTime(MIN_GAIN, t0 + attack + decay);
  return t0 + attack + decay;
}

/**
 * Full ADSR with an explicit sustain length. Returns the release-end time.
 * @param {AudioParam} param
 * @param {number} t0
 * @param {number} peak
 * @param {{a:number,d:number,s:number,hold:number,r:number}} e
 */
export function envADSR(param, t0, peak, e) {
  const pk = num(peak, MIN_GAIN * 2);
  const p = Math.max(MIN_GAIN * 2, pk);
  const sus = Math.max(MIN_GAIN * 2, pk * num(e.s, 0.5));
  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  param.linearRampToValueAtTime(p, t0 + e.a);
  param.exponentialRampToValueAtTime(sus, t0 + e.a + e.d);
  const rStart = t0 + e.a + e.d + Math.max(0, e.hold);
  param.setValueAtTime(sus, rStart);
  param.exponentialRampToValueAtTime(MIN_GAIN, rStart + e.r);
  return rStart + e.r;
}

/**
 * Pitch (or filter cutoff) sweep. Exponential by default because frequency is
 * perceived logarithmically -- a linear ramp sounds like it stalls at the top.
 */
export function sweep(param, t0, from, to, time, linear = false) {
  const a = Math.max(MIN_GAIN, num(from, 440));
  const b = Math.max(MIN_GAIN, num(to, a));
  const d = Math.max(0.001, num(time, 0.1));
  param.cancelScheduledValues(t0);
  param.setValueAtTime(a, t0);
  if (linear) param.linearRampToValueAtTime(b, t0 + d);
  else param.exponentialRampToValueAtTime(b, t0 + d);
  return t0 + d;
}

// ---------------------------------------------------------------------------
// Patch: per-event node bookkeeping
// ---------------------------------------------------------------------------

/**
 * A single sounding event (one SFX hit, one music note).
 *
 * Every node a recipe creates is registered here, and the patch disconnects the
 * whole graph as soon as its last source fires `onended`. That is the only
 * reason this class exists: hand-rolled Web Audio one-shots leak nodes the
 * moment one code path forgets a `disconnect`, and a platformer fires hundreds
 * of them a minute.
 */
export class Patch {
  /**
   * @param {AudioContext} ctx
   * @param {{out:AudioNode, reverb?:AudioNode, delay?:AudioNode,
   *          noise:AudioBuffer, waves:object}} routes
   * @param {{onOpen?:Function, onClose?:Function}} [hooks]
   */
  constructor(ctx, routes, hooks = {}) {
    this.ctx = ctx;
    this.out = routes.out;
    this.reverbIn = routes.reverb ?? null;
    this.delayIn = routes.delay ?? null;
    this.noiseBuffer = routes.noise;
    this.waves = routes.waves;
    this._nodes = [];
    this._sources = [];
    this._live = 0;
    this._closed = false;
    this._hooks = hooks;
    hooks.onOpen?.(this);
  }

  _reg(node) { this._nodes.push(node); return node; }

  gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return this._reg(g);
  }

  /** @param {string|PeriodicWave} type */
  osc(type = 'sine', freq = 440, detune = 0) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    o.detune.value = detune;
    return this._reg(o);
  }

  /**
   * Looping noise source. Each one starts at a random point in the bed, which
   * is the difference between two overlapping hits summing coherently (+6 dB
   * and comb-filtered, because they are the same samples) and sounding like
   * two separate events.
   */
  noise(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    s.playbackRate.value = rate;
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = this.noiseBuffer.duration;
    s._startOffset = rnd() * this.noiseBuffer.duration;
    return this._reg(s);
  }

  filter(type = 'lowpass', freq = 1000, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return this._reg(f);
  }

  /** Connect a list of nodes head-to-tail; returns the tail. */
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  /**
   * Post-fader send to the shared reverb or delay bus.
   *
   * `amount` must be a bare constant. The node handed in already carries the
   * effect's mix trim in its own gain, so multiplying the coefficient by it too
   * makes the wet feed quadratic in the trim: at MIX 3.8 that put `spit` almost
   * 12 dB wetter than intended, and coupled the mix table to the reverb balance
   * so that any future trim change silently re-voiced the space.
   */
  send(node, amount, which = 'reverb') {
    const dest = which === 'delay' ? this.delayIn : this.reverbIn;
    if (!dest || amount <= 0) return null;
    const g = this.gain(amount);
    node.connect(g);
    g.connect(dest);
    return g;
  }

  /**
   * Start a source and schedule its stop. The patch tears itself down when the
   * last started source ends, so callers never manage lifetimes by hand.
   */
  start(src, t0, t1) {
    this._live++;
    this._sources.push(src);
    src.onended = () => this._ended();
    if (src._startOffset != null) src.start(t0, src._startOffset);
    else src.start(t0);
    // Guard against t1 <= t0 (a zero-length note would never fire onended).
    src.stop(Math.max(t1, t0 + 0.005));
    return src;
  }

  _ended() {
    if (--this._live > 0 || this._closed) return;
    this.close();
  }

  /**
   * Stop every source and disconnect every node. Safe to call twice.
   *
   * Stopping matters as much as disconnecting: a disconnected-but-running
   * `OscillatorNode` still occupies the audio thread and keeps its `onended`
   * closure alive until its scheduled stop, which for the gated inhale bed is
   * two minutes away.
   */
  close() {
    if (this._closed) return;
    this._closed = true;
    const now = this.ctx.currentTime;
    for (const s of this._sources) {
      try { s.stop(now); } catch { /* already stopped or never started */ }
      s.onended = null;
    }
    this._sources.length = 0;
    for (const n of this._nodes) {
      try { n.disconnect(); } catch { /* already detached */ }
    }
    this._nodes.length = 0;
    this._live = 0;
    this._hooks.onClose?.(this);
  }
}

// ---------------------------------------------------------------------------
// Composite voices
// ---------------------------------------------------------------------------

/**
 * Two-operator FM voice. Returns the carrier oscillator (already started is
 * *not* implied -- the caller decides start/stop through `patch.start`).
 *
 * @param {Patch} p
 * @param {object} o
 * @param {number} o.freq       carrier frequency in Hz
 * @param {number} o.ratio      modulator : carrier frequency ratio
 * @param {number} o.index      peak modulation index (in multiples of `freq`)
 * @param {number} o.t0
 * @param {number} o.dur
 * @param {number} [o.indexDecay] seconds for the index to collapse (default dur)
 */
export function fmVoice(p, o) {
  const carrier = p.osc(o.wave ?? 'sine', o.freq, o.detune ?? 0);
  const mod = p.osc(o.modWave ?? 'sine', o.freq * o.ratio);
  const modGain = p.gain(o.freq * o.index);
  const decay = o.indexDecay ?? o.dur;
  // The index envelope is what makes an FM bell read as a bell: bright metallic
  // attack collapsing to a near-sine body.
  envAD(modGain.gain, o.t0, o.freq * o.index, 0.002, decay);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  p.start(mod, o.t0, o.t0 + o.dur + 0.02);
  return carrier;
}

/**
 * Vowel formant bank.
 *
 * Kirby's whole sound identity is vocalised air -- inhale, puff, exhale. Plain
 * band-passed noise reads as wind; noise through two or three vowel resonances
 * reads as a *creature* breathing, which is the difference this bank buys.
 * Values are the usual first three formants for each vowel.
 */
export const VOWELS = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [270, 2290, 3010],
  o: [570, 840, 2410],
  u: [300, 870, 2240],
};

/**
 * Route `src` through a vowel resonator and return the summed output.
 * `morph` blends from vowel `from` to vowel `to` across `time` seconds, which
 * is what makes a whoosh sound like it is being *said*.
 */
export function formantBank(p, src, o) {
  const from = VOWELS[o.from] ?? VOWELS.u;
  const to = VOWELS[o.to] ?? from;
  const scale = o.scale ?? 1;
  const out = p.gain(1);
  const weights = [1, 0.55, 0.28];
  for (let i = 0; i < 3; i++) {
    const f = p.filter('bandpass', from[i] * scale, o.q ?? 7);
    if (o.time > 0) sweep(f.frequency, o.t0, from[i] * scale, to[i] * scale, o.time);
    const g = p.gain(weights[i] * (o.gain ?? 1));
    src.connect(f);
    f.connect(g);
    g.connect(out);
  }
  return out;
}

/**
 * Band-limited noise burst -- the workhorse behind impacts, whooshes and hats.
 * Returns the envelope gain at the end of the chain, for the caller to route.
 *
 * Prefer `bandpass` for bright transient layers. A `highpass` at 9 kHz on this
 * near-white bed passes everything to Nyquist, which is how the impact cues
 * ended up with 89% of their energy above 2 kHz and 28% above 10 kHz -- a
 * landing that reads as a hi-hat splash rather than as a character hitting the
 * ground. Use `highpass` only when the layer is meant to be pure air.
 */
export function noiseBurst(p, o) {
  const src = p.noise(o.rate ?? 1);
  const f = p.filter(o.type ?? 'bandpass', o.from ?? 1200, o.q ?? 1);
  if (o.to != null) sweep(f.frequency, o.t0, o.from, o.to, o.sweepTime ?? o.dur);
  const g = p.gain(0);
  envAD(g.gain, o.t0, o.peak ?? 0.5, o.attack ?? 0.002, o.dur);
  src.connect(f);
  f.connect(g);
  p.start(src, o.t0, o.t0 + (o.attack ?? 0.002) + o.dur + 0.02);
  return g;
}
