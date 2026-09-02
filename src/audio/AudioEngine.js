/**
 * Game audio: mixer, spatialisation, synthesised SFX and the procedural score.
 *
 * Two rules shape the whole file:
 *
 * 1. **No `AudioContext` before a user gesture.** Browsers suspend contexts
 *    created outside a gesture, and a suspended context started at page load
 *    silently swallows the first few seconds of a session. Nothing here touches
 *    Web Audio until `_unlock` runs from a real pointerdown/keydown.
 * 2. **No audio files.** Every waveform, impulse response and noise bed is
 *    generated at runtime by `Synth.js`.
 */
import { Settings } from './Settings.js';
import {
  Patch, createNoiseBuffer, createImpulseResponse, createWaveSet,
  createSoftClipCurve, createHardClipCurve, cancelAndHold, rrange,
} from './Synth.js';
import { SFX, POLYPHONY, DUCK, MIX, inhaleLoop } from './Sfx.js';
import { MusicPlayer, TRACKS } from './Music.js';

/** Scheduling margin so an envelope is never clipped by the render quantum. */
const SCHEDULE_AHEAD = 0.012;

/** Minimum gap between two instances of the same sound, in seconds. */
const MIN_REPEAT = 0.022;

/**
 * Drive into the limiter.
 *
 * The mix was previously so conservative that the limiter never crossed its own
 * threshold -- so it did no limiting, protected nothing, and the fixed trim that
 * compensated its makeup gain became a straight 3.9 dB loss. The program landed
 * 12-14 dB under where a console game sits. This gain pushes the summed program
 * far enough in that the limiter actually works on transients (2-4 dB), which is
 * both what keeps peaks in check and what makes the makeup gain legitimate.
 *
 * Calibrated so the action bed lands at -14.6 dBFS RMS at shipped fader
 * defaults, with true peaks near -2.6 dBFS.
 */
const PROGRAM_DRIVE = 3.4;

/**
 * Asymptote for the SFX bus wave-shaper.
 *
 * Enforced in two stages: a soft shaper that rounds the approach to it, then a
 * non-oversampled hard clip that makes it an actual bound. The soft stage alone
 * is not one -- its oversampled reconstruction rings 12-54% past the asymptote,
 * which is why a "ceiling" of 0.62 was measuring 0.95 on hot broadband stacks.
 *
 * Loud single hits are still shaped by several dB on their peak (a full-force
 * `land` most of all); the aim is that the shaping is gradual and bounded, not
 * that it never happens.
 */
const SFX_CEILING = 0.62;

/** Absolute output bound, enforced by a non-oversampled hard clipper. */
const OUTPUT_CEILING = 0.98;

/** Positional rolloff, shared by the panners and the send taps. */
const REF_DISTANCE = 4;
const MAX_DISTANCE = 90;
const ROLLOFF = 1.1;

/** The Web Audio "inverse" distance model, so send levels track the panners. */
function distanceGain(d) {
  const c = Math.min(MAX_DISTANCE, Math.max(REF_DISTANCE, d));
  return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (c - REF_DISTANCE));
}

/** Finite-or-fallback, for values arriving from gameplay code. */
function fin(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Detach every node of a finished voice's output chain. */
function disconnectAll(out) {
  for (const n of [out.head, out.tail, ...out.extra]) {
    try { n.disconnect(); } catch { /* already detached */ }
  }
}

/**
 * @typedef {{position?:{x:number,y:number,z:number}, volume?:number,
 *            rate?:number, detune?:number, force?:number, count?:number,
 *            health?:number}} PlayOptions
 */

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.unlocked = false;
    this.engine = null;
    this.music = new MusicPlayer(this);

    this.waves = null;
    this.noiseBuffer = null;

    this._offs = [];
    this._gestureCleanup = null;
    this._pendingMusic = null;
    this._pendingIntensity = null;
    this._voices = 0;
    this._pending = new Map();     // sfx name -> scheduled end times
    this._lastPlay = new Map();    // sfx name -> last start time
    this._inhale = null;
    this._inhaleFades = new Map();
    this._sfxPatches = new Set();
    this._analysers = null;
    this._disposed = false;
    this._listenerPos = { x: 0, y: 0, z: 0 };
    this._listenerPrev = null;
    this._bossHealth = new Map();
    this._paused = false;
    this._duckTarget = 1;
    this._duckEnd = 0;
    this._initialised = false;
    this._irTimer = null;

    this._smoothed = { master: -1, music: -1, sfx: -1 };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Subscribes to gameplay events and arms the one-shot gesture listener.
   * Deliberately does *not* create an `AudioContext`.
   */
  init(engine) {
    // Registering twice would double every sound and orphan the first set of
    // gesture listeners.
    if (this._initialised) return;
    this._initialised = true;
    this._disposed = false;
    this.engine = engine;
    const bus = engine?.bus;
    if (bus) this._subscribe(bus);

    const unlock = () => this._unlock();
    const opts = { passive: true };
    const targets = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
    for (const t of targets) window.addEventListener(t, unlock, opts);
    this._gestureCleanup = () => {
      for (const t of targets) window.removeEventListener(t, unlock, opts);
      this._gestureCleanup = null;
    };
  }

  /** Create the context and graph. Runs exactly once, inside a user gesture. */
  _unlock() {
    if (this.unlocked || this._disposed) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.unlocked = true;
    this._gestureCleanup?.();

    const ctx = new AC({ latencyHint: 'interactive' });
    // Chrome can still hand back a suspended context inside a gesture.
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    this.attachContext(ctx);
  }

  /**
   * Build the mixer on a supplied context.
   *
   * Split out from `_unlock` so the dev lab can render the exact same graph
   * into an `OfflineAudioContext` and measure it sample-accurately -- a live
   * `AnalyserNode` only sees whatever the render loop happened to catch.
   *
   * @param {BaseAudioContext} ctx
   */
  attachContext(ctx) {
    this.ctx = ctx;
    this.unlocked = true;

    // A short bed is generated inline so the first sounds of the session have
    // noise to read from; the full-length one replaces it on the next tick.
    // Generating 2.5 s of stereo noise here costs 24 ms inside the gesture.
    this.noiseBuffer = createNoiseBuffer(ctx, 0.6, 2);
    this.waves = createWaveSet(ctx);

    // --- Master chain ------------------------------------------------------
    this.masterBus = ctx.createGain();
    this.masterBus.gain.value = 1;

    // Everything below ~38 Hz is inaudible on the speakers this will actually
    // be played through, but it still eats limiter headroom and makes woofers
    // work for nothing. `bassNote` already gates its sub-oscillator at 45 Hz,
    // so this is a backstop for the rest of the graph rather than the bass.
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'highpass';
    this.rumbleFilter.frequency.value = 38;
    this.rumbleFilter.Q.value = 0.7;

    // Wide-ratio limiter to catch transient stacks (five stars in one frame),
    // followed by a soft-clipper that rounds the approach to full scale. Note
    // that neither of them *bounds* the signal -- the compressor has a finite
    // ratio and the clipper is oversampled. The bound is `brickwall`, below.
    this.limiter = ctx.createDynamicsCompressor();
    // -4 rather than -6: at the lower threshold the limiter was catching the
    // quiet exploration bed as hard as the boss theme, squashing the intensity
    // escalation the arrangement works to produce. It now measures 3.3 dB from
    // exploration to boss, against 2.9 at the lower threshold.
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 12;
    // 0.5 ms rather than 3 ms so the attack constant is at least shorter than
    // the transients it is meant to catch (kick click and hats ~1 ms, SFX
    // attacks 0.4-1.5 ms). Worth only about 0.3 dB in practice: Blink's
    // `DynamicsCompressor` carries a ~6 ms internal pre-delay, so the attack
    // time is not what decides whether a 1 ms transient gets through. It is the
    // brick wall downstream that actually bounds the output.
    this.limiter.attack.value = 0.0005;
    this.limiter.release.value = 0.15;

    // Drive stage, ahead of the limiter. See `PROGRAM_DRIVE`.
    this.programGain = ctx.createGain();
    this.programGain.gain.value = PROGRAM_DRIVE;

    this.softClip = ctx.createWaveShaper();
    this.softClip.curve = createSoftClipCurve(0.72);
    this.softClip.oversample = '2x';

    this.masterOut = ctx.createGain();
    this.masterOut.gain.value = 0;   // ramped up below; avoids a boot click

    // The actual brick wall, after the fader.
    //
    // Nothing upstream is a real bound: the limiter is a compressor with a
    // finite ratio, and the soft-clipper is oversampled, so its reconstruction
    // rings 12-54% past its own asymptote depending on programme. With
    // `masterVolume` at 1.0 -- which the settings slider can reach -- that put
    // hard-clipped samples at +0.5 dBFS on the destination. `oversample: 'none'`
    // is essential here: an oversampled clipper reintroduces exactly the
    // overshoot it exists to prevent.
    this.brickwall = ctx.createWaveShaper();
    this.brickwall.curve = createHardClipCurve(OUTPUT_CEILING);
    this.brickwall.oversample = 'none';

    this.masterBus.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.programGain);
    this.programGain.connect(this.limiter);
    this.limiter.connect(this.softClip);
    this.softClip.connect(this.masterOut);
    this.masterOut.connect(this.brickwall);
    this.brickwall.connect(ctx.destination);

    // --- Buses -------------------------------------------------------------
    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    // Separate from the SFX duck so a pause cannot be undone by an effect's
    // duck recovery ramp, and vice versa.
    this.pauseGain = ctx.createGain();
    this.pauseGain.gain.value = this._paused ? 0.22 : 1;
    this.musicBus.connect(this.musicDuck);
    this.musicDuck.connect(this.pauseGain);
    this.pauseGain.connect(this.masterBus);

    this.sfxBus = ctx.createGain();

    // A soft ceiling on the SFX bus: unity below 0.45, asymptotic to 0.62.
    //
    // The recipes randomise filter bands and noise start offsets, so their peak
    // varies run to run -- trying to enforce a ceiling by measuring a few
    // renders and solving the trims is chasing a moving target, and it was
    // letting single effects reach full scale and pump the whole score through
    // the master limiter. This makes the ceiling a property of the graph rather
    // than of a calibration table: mix trims can then be solved purely for
    // loudness, which is the thing that actually needs to be right.
    this.sfxClip = ctx.createWaveShaper();
    this.sfxClip.curve = createSoftClipCurve(0.45, SFX_CEILING);
    this.sfxClip.oversample = '4x';

    // The soft shaper's asymptote is not a bound: 4x oversampled reconstruction
    // rings 12-54% past it, so stacks were reaching the master ~2 dB hotter than
    // the mix table assumes. This non-oversampled clipper is what actually makes
    // `SFX_CEILING` true.
    this.sfxGuard = ctx.createWaveShaper();
    this.sfxGuard.curve = createHardClipCurve(SFX_CEILING);
    this.sfxGuard.oversample = 'none';

    // No air-limiting filter here. One was tried at 14 kHz on the theory that
    // it would save peak headroom; measured against a paired A/B it *raised*
    // peak on every cue (land +0.45 dB, spit +0.49) while removing under 0.2
    // percentage points of energy. A single biquad is far too gentle for the
    // job -- and note Web Audio reads `Q` in dB for a lowpass, so the 0.707 it
    // was given is +0.7 dB of resonance rather than Butterworth. The recipes'
    // own band-passes bound the air, at the source where it belongs.
    this.sfxBus.connect(this.sfxClip);
    this.sfxClip.connect(this.sfxGuard);
    this.sfxGuard.connect(this.masterBus);

    // --- Sends -------------------------------------------------------------
    // Music and SFX get their own returns so the volume sliders stay honest:
    // a shared return would put music reverb under the SFX fader.
    const mkReverb = (dest, level) => {
      const send = ctx.createGain();
      send.gain.value = 1;
      const conv = ctx.createConvolver();
      conv.normalize = false;
      const ret = ctx.createGain();
      ret.gain.value = level;
      send.connect(conv);
      conv.connect(ret);
      ret.connect(dest);
      return { send, conv, ret };
    };
    const mkDelay = (dest, level, time, fb, dampHz = 2600) => {
      const send = ctx.createGain();
      send.gain.value = 1;
      const d = ctx.createDelay(1.5);
      d.delayTime.value = time;
      const feedback = ctx.createGain();
      feedback.gain.value = fb;
      // Darken each repeat so the echoes recede instead of piling up.
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = dampHz;
      const ret = ctx.createGain();
      ret.gain.value = level;
      send.connect(d);
      d.connect(damp);
      damp.connect(feedback);
      feedback.connect(d);
      d.connect(ret);
      ret.connect(dest);
      return { send, delay: d, feedback, ret };
    };

    // Return levels are wet fractions: the IR is energy-normalised, so these
    // read as "how much of the source comes back as space".
    this._sfxVerb = mkReverb(this.sfxBus, 0.32);
    this._musicVerb = mkReverb(this.musicBus, 0.26);
    this._sfxDelay = mkDelay(this.sfxBus, 0.42, 0.19, 0.3);
    // The music delay was rolling every repeat off at 2.6 kHz, so the one voice
    // that feeds it -- the lead, plus the new sparkle line -- came back with its
    // top two octaves removed. An echo that dark is a smear in the mid band,
    // which is where this score was already crowded. 6.5 kHz still recedes
    // (each repeat loses the same amount again) but the repeats keep their air.
    this._musicDelay = mkDelay(this.musicBus, 0.4, 0.26, 0.34, 6500);

    this.reverbIn = this._sfxVerb.send;
    this.delayIn = this._sfxDelay.send;
    this.musicReverbIn = this._musicVerb.send;
    this.musicDelayIn = this._musicDelay.send;

    // Rendering the impulse response is by far the most expensive part of this
    // build, and all of it runs inside the click that unlocks audio -- dropping
    // frames on the first input of the session is exactly the wrong first
    // impression. A convolver with a null buffer simply passes nothing, so the
    // IR can land a tick later; the only cost is a dry first ~30 ms.
    const buildIR = () => {
      if (this._disposed || this.ctx !== ctx) return;
      const ir = createImpulseResponse(ctx, { seconds: 1.8, decay: 2.9, damp: 0.6 });
      this._sfxVerb.conv.buffer = ir;
      // Music gets its own, much brighter room. The two buses shared one IR
      // whose tail was a 2.7 kHz one-pole closing to 150 Hz: with a 26% wet
      // return that made the reverb a low-mid wash, and it capped the score's
      // top end regardless of how bright the instruments were. The SFX return
      // keeps the dark room -- the impact cues are already solved against it,
      // and a bright tail on `land` and `footstep` would read as splash.
      this._musicVerb.conv.buffer = createImpulseResponse(ctx, {
        seconds: 1.9, decay: 2.6, damp: 0.5, tone: 0.7, floorTone: 0.14,
      });
      // Swap in the long noise bed too. Existing voices keep the short one --
      // they hold their own reference and will finish on it harmlessly.
      this.noiseBuffer = createNoiseBuffer(ctx, 2.5, 2);
    };
    // An OfflineAudioContext never returns to the task loop, so build inline.
    if (ctx.startRendering) buildIR();
    else this._irTimer = setTimeout(buildIR, 0);

    this._applyVolumes(true);
    this.masterOut.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.masterOut.gain.linearRampToValueAtTime(
      Settings.masterVolume, ctx.currentTime + 0.12,
    );

    if (this._pendingIntensity != null) {
      this.music.setIntensity(this._pendingIntensity);
      this._pendingIntensity = null;
    }
    if (this._pendingMusic) {
      const t = this._pendingMusic;
      this._pendingMusic = null;
      this.music.start(t);
    }
  }

  /**
   * Wire up to the gameplay event bus.
   *
   * Payload shapes here mirror what the gameplay systems actually emit (see
   * `EnemyManager`, `Inhale`, `PlayerState`, `Menus`), not a wish-list: e.g.
   * `player:damaged` carries `source` rather than `position`, and `boss:health`
   * reports absolute health plus a max, so it has to be normalised here.
   */
  _subscribe(bus) {
    const on = (type, fn) => this._offs.push(bus.on(type, fn));

    // --- Player ------------------------------------------------------------
    on('kirby:jump', (e) => this.play('jump', { position: e?.position }));
    on('kirby:land', (e) => this.play('land', { position: e?.position, force: e?.force ?? 0.5 }));
    on('kirby:puff', (e) => this.play('puff', { position: e?.position, count: e?.count ?? 1 }));
    on('kirby:exhale', (e) => this.play('exhale', { position: e?.position }));
    on('kirby:footstep', (e) => this.play('footstep', { position: e?.position }));
    on('kirby:respawn', () => this.play('respawn'));

    // --- Inhale / mouthful -------------------------------------------------
    // Two vocabularies are live in the codebase: `Inhale` emits
    // `inhale:start|active|stop`, while `VFX` listens for a single
    // `kirby:inhale { active }`. Support both so neither goes silent.
    on('inhale:start', (e) => this.startInhale(e?.position));
    on('inhale:stop', () => this.stopInhale());
    on('inhale:captured', () => this.play('captured'));
    on('inhale:cleared', () => this.stopInhale());
    on('kirby:inhale', (e) => {
      if (e?.active) this.startInhale(e?.position); else this.stopInhale();
    });
    on('kirby:spit', (e) => this.play('spit', { position: e?.position }));
    on('kirby:swallow', () => this.play('swallow'));
    on('mouthful:attack', (e) => this.play('spit', { position: e?.position }));

    // --- Pickups and combat ------------------------------------------------
    on('star:collected', (e) => this.play('star', { position: e?.position }));
    on('enemy:hit', (e) => this.play('enemyHit', { position: e?.position }));
    on('enemy:defeated', (e) => this.play('enemyDefeated', { position: e?.position }));
    on('enemy:inhaled', (e) => this.play('enemyInhaled', { position: e?.position }));
    on('player:damaged', (e) => this.play('damaged', { position: e?.source ?? e?.position }));
    on('ability:changed', (e) => {
      // The same event announces gaining and losing an ability; a rising
      // flourish on a loss would read as a reward.
      this.play(e?.ability ? 'abilityChanged' : 'abilityLost');
    });

    // --- Boss --------------------------------------------------------------
    on('boss:health', (e) => {
      const max = e?.max > 0 ? e.max : 1;
      const frac = Math.min(1, Math.max(0, (e?.health ?? max) / max));
      const active = e?.active !== false;
      const key = e?.name ?? e?.type ?? 'boss';
      const prev = this._bossHealth.get(key);
      // `_announce` fires on spawn and on phase changes too, so only the
      // transitions that actually took health off the bar get a hit.
      if (prev != null && frac < prev - 1e-4) this.play('bossHealth', { health: frac });
      if (active) this._bossHealth.set(key, frac); else this._bossHealth.delete(key);

      if (active && this.music.trackName !== 'boss') {
        this.startMusic('boss');
      } else if (!active && this.music.trackName === 'boss') {
        this.startMusic('main');
        this.setMusicIntensity(0.3);   // otherwise exploration inherits boss density
      }
      // Boss fights tighten as the health bar empties.
      // Only while the boss theme is the thing playing: a stray `boss:health`
      // otherwise pins the exploration loop at full density for the session.
      if (active && this.music.trackName === 'boss') {
        this.setMusicIntensity(0.78 + (1 - frac) * 0.22);
      }
    });

    // --- Flow / UI ---------------------------------------------------------
    on('level:complete', () => { this.play('fanfare'); this.stopMusic({ fadeOut: 0.6 }); });
    on('game:over', () => { this.play('gameOver'); this.stopMusic({ fadeOut: 0.8 }); });
    on('game:started', () => { this.setMusicIntensity(0.28); this.startMusic('main'); });
    on('game:resumed', () => this.setPaused(false));
    on('game:paused', () => this.setPaused(true));
    on('menu:show', (e) => {
      if (e?.name === 'title') { this.setPaused(false); this.startMusic('title'); }
    });
    on('ui:move', () => this.play('menuMove'));
    on('ui:confirm', () => this.play('menuConfirm'));
    on('ui:cancel', () => this.play('menuCancel'));
    on('ui:start', () => this.play('menuConfirm'));
    on('ui:continue', () => this.play('menuConfirm'));
    on('ui:restart', () => this.play('menuConfirm'));
    on('ui:quit', () => this.play('menuCancel'));
  }

  /**
   * Pull the music back behind a pause menu without stopping the sequencer, so
   * resuming does not restart the phrase.
   */
  setPaused(paused) {
    this._paused = !!paused;
    if (!this.ctx || !this.pauseGain) return;
    const t = this.ctx.currentTime;
    this.pauseGain.gain.cancelScheduledValues(t);
    this.pauseGain.gain.setTargetAtTime(paused ? 0.22 : 1, t, 0.08);
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  update(dt, engine) {
    if (!this.ctx) return;
    this._applyVolumes(false);
    if (engine?.camera) this.setListenerFromCamera(engine.camera);
    this.music.pump();
  }

  /**
   * Push `Settings` into the mixer. Called every frame so the options menu is
   * live, but only writes a param when the value actually moved -- redundant
   * `setTargetAtTime` calls on every param every frame are not free.
   */
  _applyVolumes(immediate) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const set = (param, key, value) => {
      if (Math.abs(this._smoothed[key] - value) < 1e-4) return;
      this._smoothed[key] = value;
      if (immediate) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, 0.03);
    };
    // Master sits post-limiter: the fader changes playback level without
    // changing how hard the mix is being limited. The bound on what leaves the
    // graph is the brick wall *after* this node, not anything upstream of it.
    set(this.masterOut.gain, 'master', clamp01(fin(Settings.masterVolume, 1)));
    set(this.musicBus.gain, 'music', clamp01(fin(Settings.musicVolume, 1)));
    set(this.sfxBus.gain, 'sfx', clamp01(fin(Settings.sfxVolume, 1)));
  }

  /**
   * Drive the Web Audio listener from a Three.js camera. Reads `matrixWorld`
   * directly so this module carries no Three.js dependency.
   */
  setListenerFromCamera(camera) {
    const ctx = this.ctx;
    if (!ctx || !camera) return;
    camera.updateMatrixWorld?.();
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    // Column 2 is the camera's +Z; a camera looks down -Z.
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    if (!(Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)
      && Number.isFinite(fx) && Number.isFinite(fy) && Number.isFinite(fz)
      && Number.isFinite(ux) && Number.isFinite(uy) && Number.isFinite(uz))) return;

    this._listenerPos.x = px;
    this._listenerPos.y = py;
    this._listenerPos.z = pz;

    // Writing nine AudioParams every frame piles up automation events for no
    // benefit while the camera is parked. Only push a genuine change.
    const prev = this._listenerPrev;
    if (prev
      && Math.abs(prev[0] - px) < 1e-3 && Math.abs(prev[1] - py) < 1e-3
      && Math.abs(prev[2] - pz) < 1e-3 && Math.abs(prev[3] - fx) < 1e-3
      && Math.abs(prev[4] - fy) < 1e-3 && Math.abs(prev[5] - fz) < 1e-3
      && Math.abs(prev[6] - ux) < 1e-3 && Math.abs(prev[7] - uy) < 1e-3
      && Math.abs(prev[8] - uz) < 1e-3) return;
    this._listenerPrev = [px, py, pz, fx, fy, fz, ux, uy, uz];

    const l = ctx.listener;
    const t = ctx.currentTime;
    if (l.positionX) {
      // Small smoothing constant: instant jumps produce audible zipper noise on
      // the panner, but too much lag makes the mix swim behind the camera.
      const k = 0.02;
      l.positionX.setTargetAtTime(px, t, k);
      l.positionY.setTargetAtTime(py, t, k);
      l.positionZ.setTargetAtTime(pz, t, k);
      l.forwardX.setTargetAtTime(fx, t, k);
      l.forwardY.setTargetAtTime(fy, t, k);
      l.forwardZ.setTargetAtTime(fz, t, k);
      l.upX.setTargetAtTime(ux, t, k);
      l.upY.setTargetAtTime(uy, t, k);
      l.upZ.setTargetAtTime(uz, t, k);
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // -------------------------------------------------------------------------
  // SFX
  // -------------------------------------------------------------------------

  _voiceOpen() { this._voices++; }
  _voiceClose() { this._voices = Math.max(0, this._voices - 1); }

  /** Number of live synthesis events. Used by the dev lab to hunt leaks. */
  get voiceCount() { return this._voices; }

  /**
   * Per-event output chain: gain -> [panner] -> sfxBus, plus per-event send
   * taps into the shared reverb and delay.
   *
   * The sends have to be per-event because a recipe's `p.send()` calls tap
   * nodes *inside* the voice, upstream of the panner. Feeding the global bus
   * directly would leave a sound 80 m away with a full-level reverb tail. The
   * taps are distance-attenuated but not panned: a reverb tail is a diffuse
   * field, so it belongs in the centre however far off the source is.
   */
  _sfxOut(opts) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 1;
    const extra = [];
    let tail = g;

    let atten = 1;
    const p = opts.position;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      const panner = ctx.createPanner();
      // Equal-power rather than HRTF: this is a third-person game where the
      // camera is the listener, and HRTF costs far more per voice than the
      // extra localisation is worth here. The trade-off is no front/back cue.
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = REF_DISTANCE;
      panner.maxDistance = MAX_DISTANCE;
      panner.rolloffFactor = ROLLOFF;
      const t = ctx.currentTime;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(p.x, t);
        panner.positionY.setValueAtTime(p.y, t);
        panner.positionZ.setValueAtTime(p.z, t);
      } else {
        panner.setPosition(p.x, p.y, p.z);
      }
      g.connect(panner);
      tail = panner;

      const l = this._listenerPos;
      const d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
      const dry = distanceGain(d);
      // Wet falls off more slowly than dry, which is what makes distance read
      // as distance rather than as somebody turning a fader down.
      atten = Math.pow(dry, 0.6);
    }
    tail.connect(this.sfxBus);

    const tap = (dest) => {
      const s = ctx.createGain();
      s.gain.value = atten;
      s.connect(dest);
      extra.push(s);
      return s;
    };
    return { head: g, tail, extra, reverb: tap(this.reverbIn), delay: tap(this.delayIn) };
  }

  /**
   * Play a one-shot.
   * @param {string} name key of the `SFX` registry
   * @param {PlayOptions} [opts]
   * @returns {boolean} whether a voice was actually started
   */
  play(name, opts = {}) {
    const ctx = this.ctx;
    const recipe = SFX[name];
    if (!ctx || !recipe || ctx.state === 'closed') return false;

    const now = ctx.currentTime;
    const last = this._lastPlay.get(name) ?? -1;
    if (now - last < MIN_REPEAT) return false;      // stops comb-filtered stacks

    // Polyphony is gated on the *audio* clock, not on `onended`. Node teardown
    // is a main-thread callback, so during a frame hitch it lags arbitrarily --
    // gating on it would silently drop sounds exactly when the game is busiest.
    let live = this._pending.get(name);
    if (!live) this._pending.set(name, (live = []));
    for (let i = live.length - 1; i >= 0; i--) if (live[i] <= now) live.splice(i, 1);
    if (live.length >= (POLYPHONY[name] ?? POLYPHONY.default)) return false;
    this._lastPlay.set(name, now);

    const out = this._sfxOut(opts);
    const patch = new Patch(ctx, {
      out: out.head,
      reverb: out.reverb,
      delay: out.delay,
      noise: this.noiseBuffer,
      waves: this.waves,
    }, {
      onOpen: (q) => { this._sfxPatches.add(q); this._voiceOpen(); },
      onClose: (q) => {
        this._sfxPatches.delete(q);
        this._voiceClose();
        disconnectAll(out);
      },
    });

    // Sub-frame timing jitter keeps rapid repeats from phase-locking.
    const t0 = now + SCHEDULE_AHEAD + rrange(0, 0.006);
    // Gameplay payloads are not trusted to be finite: `force`, `health` and
    // friends come from physics and combat code, and one NaN would otherwise
    // propagate into an AudioParam call and throw.
    const args = {
      ...opts,
      volume: fin(opts.volume, 1) * (MIX[name] ?? 1),
      force: clamp01(fin(opts.force, 0.5)),
      health: clamp01(fin(opts.health, 0.5)),
      count: Math.max(1, Math.min(8, Math.round(fin(opts.count, 1)))),
      rate: Math.max(0.05, Math.min(8, fin(opts.rate, 1))),
      detune: fin(opts.detune, 0),
    };
    let end;
    try {
      end = recipe(patch, t0, args);
    } catch (err) {
      patch.close();
      throw err;
    }
    live.push(Number.isFinite(end) ? end : t0 + 0.5);
    // A patch tears itself down when its last source ends, so a recipe that
    // somehow started none would pin its nodes and its slot forever.
    if (patch._live === 0) patch.close();
    const duck = DUCK[name];
    if (duck) this.duck(duck[0], duck[1]);
    return true;
  }

  /** Start the gated inhale bed. No-op if it is already running. */
  startInhale(position) {
    const ctx = this.ctx;
    if (!ctx || this._inhale) return;
    // Any bed still fading from a previous release is torn down now rather than
    // left to its timer. Tap-inhaling faster than the 220 ms fade is the normal
    // way players use this, and a shared timer handle meant each new press
    // cancelled the previous patch's pending close and orphaned it forever.
    this._flushInhaleFades();
    const out = this._sfxOut({ position });
    const patch = new Patch(ctx, {
      out: out.head, reverb: out.reverb, delay: out.delay,
      noise: this.noiseBuffer, waves: this.waves,
    }, {
      onOpen: (q) => { this._sfxPatches.add(q); this._voiceOpen(); },
      onClose: (q) => {
        this._sfxPatches.delete(q);
        this._voiceClose();
        disconnectAll(out);
      },
    });
    this._inhale = inhaleLoop(patch, ctx.currentTime + SCHEDULE_AHEAD,
      { volume: MIX.inhale ?? 1 });
  }

  /**
   * Release the inhale bed with a short fade so it does not click off.
   * @param {boolean} [immediate] tear down now, skipping the fade (used by
   *   `dispose`, which must leave nothing running behind it)
   */
  stopInhale(immediate = false) {
    // The flush comes first and unconditionally: returning early when no bed is
    // currently open would leave beds still mid-fade alive through a `dispose`,
    // which is the exact shape of the leak this pair of methods exists to stop.
    if (immediate) this._flushInhaleFades();
    const h = this._inhale;
    if (!h || !this.ctx) return;
    this._inhale = null;
    if (immediate) { h.patch.close(); return; }
    const t = this.ctx.currentTime;
    for (const g of h.gains) {
      const held = Math.max(1e-4, cancelAndHold(g.gain, t));
      g.gain.setValueAtTime(held, t);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 0.13);
    }
    // One timer *per fading bed*, tracked so nothing can cancel someone else's
    // teardown and so `dispose` can pre-empt all of them at once.
    const timer = setTimeout(() => {
      this._inhaleFades.delete(timer);
      h.patch.close();
    }, 220);
    this._inhaleFades.set(timer, h);
  }

  /** Close every inhale bed still mid-fade, now. */
  _flushInhaleFades() {
    for (const [timer, h] of this._inhaleFades) {
      clearTimeout(timer);
      h.patch.close();
    }
    this._inhaleFades.clear();
  }

  /**
   * Dip the music so an important effect reads through the mix.
   *
   * Ducking is a single envelope with a remembered depth and deadline, not one
   * envelope per event. Re-triggering the 30 ms attack on every effect turns a
   * row of collectibles into a 5 Hz tremolo on the score, and lets a later
   * shallow duck cut a deeper one's recovery short.
   *
   * @param {number} depth 0..1
   * @param {number} time seconds to recover
   */
  duck(depth, time = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.musicDuck) return;
    const now = ctx.currentTime;
    if (now >= this._duckEnd) this._duckTarget = 1;

    const target = 1 - Math.min(0.85, Math.max(0, depth));
    const dip = Math.min(target, this._duckTarget);
    const end = now + 0.03 + time;
    const deeper = dip < this._duckTarget - 1e-3;
    const longer = end > this._duckEnd + 1e-3;
    if (!deeper && !longer) return;             // already covered; leave it alone

    this._duckTarget = dip;
    this._duckEnd = Math.max(end, this._duckEnd);
    const g = this.musicDuck.gain;
    const current = Math.max(1e-4, cancelAndHold(g, now));
    g.setValueAtTime(current, now);
    if (deeper) {
      // A genuinely deeper duck re-attacks and holds at the new floor.
      const hold = this._duckEnd - time * 0.35;
      g.linearRampToValueAtTime(Math.max(1e-4, dip), now + 0.03);
      if (hold > now + 0.05) g.setValueAtTime(Math.max(1e-4, dip), hold);
    }
    // A shallower request only ever extends the release. Re-asserting the
    // remembered floor with `setValueAtTime` would jump the gain back *down*
    // to it with no ramp -- take damage, then swallow half a second later, and
    // the music bus clicks by nearly 4 dB.
    g.linearRampToValueAtTime(1, this._duckEnd);
  }

  // -------------------------------------------------------------------------
  // Music
  // -------------------------------------------------------------------------

  /** @param {string} [track] one of `TRACKS` */
  startMusic(track = 'main') {
    if (!this.ctx) { this._pendingMusic = track; return; }
    this.music.start(track);
  }

  /** @param {{fadeOut?:number}} [o] */
  stopMusic(o = {}) {
    this._pendingMusic = null;
    this.music.stop(o);
  }

  /** @param {number} v 0 (exploration) .. 1 (boss) */
  setMusicIntensity(v) {
    if (!this.ctx) { this._pendingIntensity = v; return; }
    this.music.setIntensity(v);
  }

  get musicIntensity() { return this.music.intensity; }
  get trackNames() { return Object.keys(TRACKS); }
  get sfxNames() { return Object.keys(SFX); }

  // -------------------------------------------------------------------------
  // Diagnostics (used by dev/audio.html)
  // -------------------------------------------------------------------------

  /** Attach analysers to the three buses. Off by default; the game never calls it. */
  enableAnalysers() {
    if (!this.ctx || this._analysers) return this._analysers;
    const mk = (node) => {
      const a = this.ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0.6;
      node.connect(a);
      return a;
    };
    this._analysers = {
      master: mk(this.brickwall),
      music: mk(this.pauseGain),
      sfx: mk(this.sfxGuard),
    };
    return this._analysers;
  }

  get analysers() { return this._analysers; }

  /** Peak/RMS in dBFS per bus plus voice bookkeeping. */
  metrics() {
    const now = this.ctx?.currentTime ?? 0;
    const out = {
      state: this.ctx?.state ?? 'none',
      time: this.ctx?.currentTime ?? 0,
      voices: this._voices,
      music: this.music.playing ? this.music.trackName : null,
      intensity: this.music.intensity,
      bars: this.music._bar,
      duck: this.musicDuck ? this.musicDuck.gain.value : 1,
      // Pruned here as well as in `play`: without it this reports every name
      // ever triggered, which makes the lab's own leak diagnostic show
      // phantom voices long after everything has decayed.
      pending: [...this._pending]
        .map(([k, v]) => [k, v.filter((end) => end > now).length])
        .filter(([, n]) => n > 0),
      musicPatches: this.music._patches.size,
      sfxPatches: this._sfxPatches.size,
      nan: false,
      buses: {},
    };
    if (!this._analysers) return out;
    for (const [name, a] of Object.entries(this._analysers)) {
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      let peak = 0, sum = 0, nan = false;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        if (!Number.isFinite(v)) { nan = true; continue; }
        const abs = v < 0 ? -v : v;
        if (abs > peak) peak = abs;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      out.nan = out.nan || nan;
      out.buses[name] = {
        peak, rms,
        peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
        rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
      };
    }
    return out;
  }

  // -------------------------------------------------------------------------

  dispose() {
    this._disposed = true;
    clearTimeout(this._irTimer);
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._gestureCleanup?.();
    this.stopInhale(true);
    this.music.dispose();
    // One-shots still ringing have to go too: their oscillators are scheduled
    // well past `now`, and `ctx.close()` alone would leave them counted.
    for (const q of [...this._sfxPatches]) q.close();
    this._sfxPatches.clear();
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      // Closing the context tears down every node with it, so the deferred
      // teardown timers left by stopInhale/stopMusic become harmless no-ops.
      // `OfflineAudioContext` has no `close`, and the dev lab attaches one.
      ctx.close?.()?.catch?.(() => {});
    }
    this._pending.clear();
    this._lastPlay.clear();
    this._bossHealth.clear();
    this._listenerPrev = null;
    this._analysers = null;
    this._duckTarget = 1;
    this._duckEnd = 0;
    // `_applyVolumes` skips params whose value has not moved; without this a
    // second `attachContext` starts from fresh 1.0 gains that the cache still
    // believes are already correct, and the user's settings are ignored.
    this._smoothed.master = -1;
    this._smoothed.music = -1;
    this._smoothed.sfx = -1;
    this.unlocked = false;
    // A disposed engine can be initialised again; leaving `_disposed` set would
    // make `_unlock` bail forever.
    this._disposed = false;
    this._initialised = false;
  }
}

export default AudioEngine;
