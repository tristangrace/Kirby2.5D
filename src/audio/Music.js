/**
 * Procedural score.
 *
 * The music is sequenced bar-by-bar against `AudioContext.currentTime` with a
 * short lookahead. `pump()` is deliberately idempotent and cheap so it can be
 * driven from the render loop: the render loop decides *when we look*, the
 * audio clock decides *when things sound*. Bar times accumulate as doubles from
 * a single anchor, so tempo does not drift (measured: 0.45 nanoseconds over two
 * hours). A hitch longer than the lookahead costs only the notes that were due
 * while the main thread was away -- `pump` rejoins the bar in progress rather
 * than waiting for the next bar line.
 */
import {
  MELODY, PROGRESSION, BOSS_MELODY, BOSS_PROGRESSION,
  BASS_PATTERN, BASS_PATTERN_DRIVE, KEY_ROOT, scaleNote,
} from './Theory.js';
import {
  Patch, envAD, envADSR, sweep, mtof, rrange, jitterCents, cancelAndHold,
} from './Synth.js';

/**
 * Track definitions. `prog` and `melody` are always the same length so bar N of
 * the form always gets bar N of the tune -- the boss theme needs its own melody
 * rather than the exploration one, because a major-key tune re-pointed at minor
 * chords puts flat sixths and a tritone on downbeats.
 */
export const TRACKS = {
  main: {
    tempo: 132, root: KEY_ROOT, swing: 0.085,
    prog: PROGRESSION, melody: MELODY, intensity: null,
  },
  title: {
    tempo: 110, root: KEY_ROOT, swing: 0.12,
    prog: PROGRESSION.slice(0, 8), melody: MELODY.slice(0, 8), intensity: 0.1,
  },
  boss: {
    tempo: 154, root: KEY_ROOT, swing: 0.02,
    prog: BOSS_PROGRESSION, melody: BOSS_MELODY, intensity: 1,
  },
};

/** How far ahead of the audio clock we commit notes, in seconds. */
const LOOKAHEAD = 0.4;

/** Notes closer than this to "now" are already too late to sound cleanly. */
const SCHEDULE_MARGIN = 0.015;

/**
 * Pad/comp register, in scale indices where 0 is the key's D4.
 *
 * `PAD_FLOOR` is the hard constraint: the bass pattern's octave note occupies
 * indices -7..-2, so anything the pad places below 0 collides with it. The
 * pivot sits mid-window so voice leading has room to move both ways.
 */
const PAD_PIVOT = 2;
const PAD_FLOOR = 0;
const PAD_CEIL = 9;

/**
 * Counter-line figures, indices into the chord-tone pool; -1 is a rest. Cycling
 * through these by bar is what stops the sparkle layer from becoming wallpaper.
 */
const COUNTER_CONTOURS = [
  [0, 1, 2, 3, 2, 1],
  [4, 2, 0, 1, 3, 2],
  [0, 2, 4, -1, 3, 1],
  [2, 3, 4, 3, 1, 0],
  [1, -1, 2, 4, 3, -1],
];

/**
 * Celesta figures: one entry per eighth of the bar, indexing the chord-tone
 * pool, -1 a rest.
 *
 * This is the score's top line, two octaves above the pad. It is a cycled
 * contour over the bar's chord tones, not a written melody -- the same
 * construction as `COUNTER_CONTOURS` above, and it should be read as an
 * ostinato rather than as a counter-melody.
 *
 * What it is for: the previous sparkle layer was three or four notes a bar at a
 * garnish level, which is why the whole score measured under 1% of its energy
 * above 6 kHz however bright those notes were. At that duty cycle nothing up
 * there is sounding most of the time, and no amount of level fixes that.
 */
const CELESTE_FIGURES = [
  [0, 2, -1, 3, -1, 4, 3, -1],
  [4, -1, 3, -1, 1, 3, -1, -1],
  [-1, 1, 2, 3, -1, 4, -1, 1],
  [2, -1, -1, 4, 5, -1, 0, -1],
];

/**
 * Denser version for the busy layers.
 *
 * The relationship between these two is the point, and it used to be the wrong
 * way round. A layer system whose *calm* setting has the busiest top line reads
 * as backwards: exploration ends up as continuous tinkling wallpaper while the
 * boss fight, which should be the most brilliant thing in the game, is the
 * dullest layer in it. Measured before this change: 3.44% of A-weighted energy
 * above 6 kHz in exploration against 2.30% at the boss.
 */
const CELESTE_DRIVE = [
  [5, 2, 5, 4, 3, 3, 4, 5],
  [0, 4, 4, 3, 5, 5, 4, 3],
  [3, 1, 3, 3, 4, 5, 4, 2],
  [4, 5, 5, 2, 3, 3, 4, 4],
];

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/**
 * @param {boolean} [short] use a clipped percussive envelope. Passing tones have
 *   to be *silent* before the next downbeat, not merely quieter -- the sustain
 *   of a normal bass envelope runs 129 ms past the bar line at the approach
 *   note's position, which put the
 *   chromatic approach and the next bar's root together at full level, a minor
 *   second in the sub-bass doubled by both oscillators.
 */
function bassNote(p, t, midi, dur, vel, short) {
  const f = mtof(midi);
  const osc = p.osc(p.waves.bass, f, jitterCents(3));
  const lp = p.filter('lowpass', 340, 3.2);
  sweep(lp.frequency, t, 1500, 380, 0.09);
  const g = p.gain(0);
  const env = short
    ? { a: 0.003, d: 0.018, s: 0.5, hold: 0, r: 0.018 }
    : { a: 0.006, d: 0.05, s: 0.6, hold: dur * 0.55, r: 0.09 };
  envADSR(g.gain, t, 0.24 * vel, env);
  osc.connect(lp);
  // The sub octave is what gives the low end its weight, but on the lowest
  // notes it lands in the 30s of Hz where it is inaudible and only steals
  // headroom, so it drops out there rather than being filtered away later.
  // The sub octave is skipped entirely on passing tones: doubling a chromatic
  // neighbour an octave down is where sub-bass mud comes from.
  if (f / 2 >= 45 && !short) {
    const sub = p.osc('sine', f / 2);
    const subG = p.gain(0.5);
    sub.connect(subG);
    subG.connect(lp);
    p.start(sub, t, t + dur + 0.16);
  }
  p.chain(lp, g, p.out);
  p.start(osc, t, t + (short ? 0.06 : dur + 0.16));
}

/** Short comping pluck; the chord bed in exploration. */
function pluckNote(p, t, midi, dur, vel) {
  const f = mtof(midi);
  const osc = p.osc(p.waves.pluck, f, jitterCents(5));
  // Opens to 7 kHz and only closes to 2.6 kHz. The comp is the most continuous
  // voice in the exploration layer, so where its filter lands decides whether
  // the whole bed sounds boxy -- and a few short ticks per bar cannot make up
  // for it, however loud, because their duty cycle is under 1%.
  const lp = p.filter('lowpass', 3000, 1.2);
  sweep(lp.frequency, t, 7000, 2600, dur * 0.8 + 0.05);
  const g = p.gain(0);
  envADSR(g.gain, t, 0.085 * vel, { a: 0.004, d: 0.07, s: 0.35, hold: dur * 0.5, r: 0.12 });
  p.chain(osc, lp, g, p.out);
  p.start(osc, t, t + dur + 0.2);
  p.send(g, 0.22);
}

/**
 * Sustained pad, used to glue the low-intensity layer together.
 *
 * Shelved at both ends rather than just filtered. The pad sits 200-1000 Hz --
 * the melody's own fundamental band -- and it was measured with 74% of its
 * energy there while running only 2.8 dB under the lead. That is a pad masking
 * the tune it exists to support, and it is most of why the bed read as boxy.
 * The low shelf hands the region under 260 Hz back to the bass, and the high
 * shelf gives the glue some air of its own instead of leaving the top octave
 * entirely to the percussion.
 */
function padNote(p, t, midi, dur, vel) {
  const f = mtof(midi);
  // A wavetable with real upper partials, not two triangles. The pad is the
  // most continuous voice in the calm layer, so its harmonic content -- not
  // just where its filter sits -- decides whether the bed sounds boxy.
  const a = p.osc(p.waves.pad, f, -6 + jitterCents(4));
  const b = p.osc(p.waves.pad, f, 7 + jitterCents(4));
  const lp = p.filter('lowpass', 9000, 0.8);
  const cut = p.filter('lowshelf', 260, 0.7);
  cut.gain.value = -7;
  // 4.8 kHz, not 3.2. At the lower corner this shelf was lifting the pad's
  // presence band rather than its air, which piled energy into the 2-5 kHz
  // region the mix is already crowded in without adding anything above 6 kHz.
  const air = p.filter('highshelf', 4800, 0.7);
  air.gain.value = 8;
  const g = p.gain(0);
  envADSR(g.gain, t, 0.046 * vel, { a: 0.18, d: 0.2, s: 0.7, hold: dur * 0.7, r: 0.4 });
  a.connect(lp); b.connect(lp);
  p.chain(lp, cut, air, g, p.out);
  p.start(a, t, t + dur + 0.7);
  p.start(b, t, t + dur + 0.7);
  p.send(g, 0.4);
}

/** The tune: hollow toy-lead with a delayed vibrato and an octave sparkle. */
function leadNote(p, t, midi, dur, vel, octave) {
  const f = mtof(midi);
  const osc = p.osc(p.waves.toyLead, f, jitterCents(6));
  // The filter opens with the arrangement, so the tune gets brighter as the
  // action does rather than just gaining more instruments around it. The floor
  // matters as much as the range: the lead is the loudest voice in the calm
  // layer, so where it closes largely decides how boxy that bed sounds.
  const lp = p.filter('lowpass', 3600 + 3600 * vel, 0.9);
  const g = p.gain(0);
  envADSR(g.gain, t, 0.15 * vel, { a: 0.012, d: 0.09, s: 0.72, hold: dur * 0.62, r: 0.11 });

  // Vibrato fades in rather than starting immediately -- an instantly wobbling
  // lead sounds seasick. `detune` is in CENTS: musical vibrato is 20-40 cents,
  // and anything under about 10 is inaudible.
  const vib = p.osc('sine', 5.4);
  const vibG = p.gain(0);
  vibG.gain.setValueAtTime(0.0001, t);
  vibG.gain.linearRampToValueAtTime(26, t + Math.min(0.4, dur * 0.8 + 0.08));
  p.chain(vib, vibG);
  vibG.connect(osc.detune);
  p.start(vib, t, t + dur + 0.2);

  p.chain(osc, lp, g, p.out);
  p.start(osc, t, t + dur + 0.2);
  p.send(g, 0.18);
  p.send(g, 0.14, 'delay');

  // A 4 ms chiff on the onset. Without it the lead blurs into the pad when
  // several notes fall inside one beat; with it every note has an edge you can
  // hear the rhythm on, which is most of why chip-era melodies read so clearly.
  const chiff = p.noise(1);
  const chiffF = p.filter('bandpass', Math.min(9000, f * 3), 1.4);
  const chiffG = p.gain(0);
  envAD(chiffG.gain, t, 0.02 * vel, 0.0008, 0.004);
  p.chain(chiff, chiffF, chiffG, p.out);
  p.start(chiff, t, t + 0.02);

  if (octave > 0) {
    const up = p.osc('sine', f * 2, jitterCents(6));
    const ug = p.gain(0);
    envADSR(ug.gain, t, 0.06 * octave * vel,
      { a: 0.012, d: 0.09, s: 0.6, hold: dur * 0.6, r: 0.1 });
    p.chain(up, ug, p.out);
    p.start(up, t, t + dur + 0.2);
  }

  // Two octaves up on the celesta wavetable, at every intensity.
  //
  // The octave layer above only arrives past intensity 0.5 and is a bare sine,
  // so in exploration the tune had no content of its own above its filter --
  // its highest audible partial sat around 4 kHz. This sheen puts the melody's
  // own line in the top octave (a D5 note reaches 14 kHz through the glass
  // partials) for about a tenth of the lead's level, which is the difference
  // between a tune behind a blanket and a tune with a bell doubling it.
  // On `softSquare`, deliberately not on the celesta's `glass` table. The lead
  // plays non-chord tones and the celesta plays chord tones only, in the same
  // octave -- give them the same timbre as well and the ear stops hearing two
  // lines and starts hearing one line with wrong notes in it. A different
  // partial structure is what lets a passing second up there read as motion.
  const sheen = p.osc(p.waves.softSquare, f * 4, jitterCents(8));
  const sheenLp = p.filter('lowpass', 14000, 0.7);
  const sg = p.gain(0);
  envADSR(sg.gain, t, 0.016 * vel,
    { a: 0.006, d: 0.11, s: 0.42, hold: dur * 0.5, r: 0.14 });
  p.chain(sheen, sheenLp, sg, p.out);
  p.start(sheen, t, t + dur + 0.2);
  p.send(sg, 0.26);
}

/**
 * Shimmer pad: the chord, three octaves up, held.
 *
 * The score's problem was never that its bright events were too quiet, it was
 * that nothing was sounding above 6 kHz most of the time -- ticks and stabs
 * cannot move an energy balance at a 1% duty cycle. This voice is the fix in
 * its plainest form: a sustained one at 2.3-4.7 kHz whose glass partials reach
 * 14 kHz, held for the whole bar at about a quarter of the pad's level.
 *
 * The two oscillators are detuned by 15 cents deliberately. At this register
 * that is a beat of roughly 3 Hz, which is what stops a sustained high tone
 * from reading as test equipment: it breathes.
 */
function shimmerPad(p, t, midi, dur, vel) {
  const f = mtof(midi);
  const a = p.osc(p.waves.glass, f, -15 + jitterCents(6));
  const b = p.osc(p.waves.glass, f, 15 + jitterCents(6));
  // Nothing below the fundamental belongs here: this voice must not add to the
  // band the pad and the tune are already fighting over.
  const hp = p.filter('highpass', 1600, 0.7);
  // Tilted so the *partials* carry it rather than the fundamentals. Without
  // this the voice is a sustained 2.3-3.1 kHz wash, which is the band the ear
  // is most sensitive to and where held energy reads as fatigue rather than as
  // air; with it the same note puts its weight at 7-15 kHz instead, which is
  // the register the score was missing in the first place.
  const tilt = p.filter('highshelf', 5200, 0.7);
  tilt.gain.value = 8;
  const g = p.gain(0);
  // The envelope has to fit inside the bar. At `a 0.5 + d 0.35 + hold 0.45*dur
  // + r 0.7` it totalled 2.37 s against a 1.82 s bar, so every chord was still
  // sounding 550 ms into the next one -- a held major second at 3 kHz, on every
  // bar line, in the register where the ear resolves pitch most sharply. These
  // numbers sum to `dur` with a small margin, and the oscillators are stopped
  // just past the release rather than a second after it.
  const rel = 0.32;
  const hold = Math.max(0.05, dur - 0.34 - 0.22 - rel);
  envADSR(g.gain, t, 0.02 * vel, { a: 0.34, d: 0.22, s: 0.72, hold, r: rel });
  a.connect(hp); b.connect(hp);
  p.chain(hp, tilt, g, p.out);
  p.start(a, t, t + dur + 0.06);
  p.start(b, t, t + dur + 0.06);
  p.send(g, 0.4);
}

/**
 * Celesta / glockenspiel. The score's top-octave voice.
 *
 * Distinct from `bellNote`, which is a mid-register counter-line: this is
 * pitched two octaves above the tune, rings for most of a bar, and carries most
 * of the shimmer the arrangement is built around. Three parts, and all three
 * matter: the struck FM onset (metal, not a sine), the sustained glass body
 * whose partials reach the top octave, and a 4 ms mallet contact at 11 kHz.
 *
 * @param {number} until absolute time by which the ring must be silent. The
 *   caller passes the bar line: this voice is the top octave, and a tail that
 *   crosses a bar line is the previous chord sounding over the current one
 *   where a wrong note is most exposed.
 */
function celesteNote(p, t, midi, dur, vel, until) {
  const f = mtof(midi);
  const car = p.osc(p.waves.glass, f, jitterCents(5));
  const mod = p.osc('sine', f * 3.47);
  const modG = p.gain(0);
  envAD(modG.gain, t, f * 0.85, 0.001, 0.05);
  mod.connect(modG);
  modG.connect(car.frequency);
  const g = p.gain(0);
  // The ring is clamped to the bar line, not merely shortened.
  //
  // Shortening it alone was not enough, and the arithmetic is worth writing
  // down because the first attempt got it wrong: `envAD` takes a *decay*, so
  // `dur + 0.38` is a 0.38 s tail on top of the note length, not a 0.38 s
  // ring -- 0.61 s at 132 bpm. Every one of the drive figures plays on the
  // last eighth of the bar, which the swing warp puts 0.19 s before the bar
  // line, so that note rang 0.42 s into the next chord on every single loop.
  // Clamping against the caller-supplied bar line fixes it for every grid
  // position at once, which moving one note in one figure would not.
  const ATTACK = 0.003;
  const room = until != null ? until - t - ATTACK : Infinity;
  const ring = Math.max(0.04, Math.min(dur + 0.38, room));
  envAD(g.gain, t, 0.062 * vel, ATTACK, ring);
  p.chain(car, g, p.out);
  p.start(mod, t, t + 0.09);
  p.start(car, t, t + ATTACK + ring + 0.02);
  p.send(g, 0.3);
  p.send(g, 0.1, 'delay');

  // Mallet contact. Bounded by a bandpass rather than a highpass so it is a
  // wooden tap and not a splash of white noise up to Nyquist, and kept well
  // under the tone: the struck partials are what should read as metal.
  const tap = p.noise(rrange(0.95, 1.08));
  const bp = p.filter('bandpass', rrange(10000, 12000), 0.8);
  const tg = p.gain(0);
  envAD(tg.gain, t, 0.04 * vel, 0.0004, 0.0035);
  p.chain(tap, bp, tg, p.out);
  p.start(tap, t, t + 0.02);
}

/**
 * Triangle.
 *
 * The one voice in the kit whose entire job is air: six inharmonic partials
 * spanning 5-15 kHz over a slow decay, so it puts sustained -- not transient --
 * energy in the top octave. Tuned partials rather than filtered noise, because
 * a second of broadband noise up there is hiss, while a second of struck metal
 * is shimmer, and the difference is entirely whether the content is discrete.
 *
 * The partials are at fixed absolute frequencies rather than derived from a
 * fundamental, which is correct for this instrument: a real triangle has no
 * definite pitch, and the ratios below are deliberately irrational so no two of
 * them fuse into one perceived tone.
 */
function triangleHit(p, t, vel, dur = 1.15) {
  const parts = [5240, 7390, 9160, 11750, 13900, 15600];
  const amps = [1, 0.72, 0.5, 0.34, 0.22, 0.14];
  const out = p.gain(0);
  envAD(out.gain, t, 0.05 * vel, 0.002, dur);
  for (let i = 0; i < parts.length; i++) {
    const o = p.osc('sine', parts[i] * rrange(0.985, 1.015));
    const og = p.gain(amps[i]);
    p.chain(o, og, out);
    p.start(o, t, t + dur + 0.06);
  }
  // A short strike so the shimmer has a beginning; without it the partials
  // fade in as a tone rather than reading as a beater on metal.
  const n = p.noise(1);
  const bp = p.filter('bandpass', 9500, 0.7);
  const ng = p.gain(0);
  envAD(ng.gain, t, 0.05 * vel, 0.0006, 0.02);
  p.chain(n, bp, ng, out);
  p.start(n, t, t + 0.04);
  out.connect(p.out);
  p.send(out, 0.42);
}

/**
 * Glassy struck tone. Serves two jobs: the sixteenth-note counter-line from the
 * action layer upward, and the sparse celeste figure in the calm layer.
 */
function bellNote(p, t, midi, dur, vel) {
  const f = mtof(midi);
  const car = p.osc(p.waves.bell, f, jitterCents(4));
  const mod = p.osc('sine', f * 2.01);
  const modG = p.gain(0);
  envAD(modG.gain, t, f * 1.4, 0.002, 0.1);
  mod.connect(modG);
  modG.connect(car.frequency);
  const g = p.gain(0);
  envAD(g.gain, t, 0.055 * vel, 0.004, dur + 0.1);
  p.chain(car, g, p.out);
  p.start(mod, t, t + dur + 0.14);
  p.start(car, t, t + dur + 0.14);
  p.send(g, 0.3);
}

function kick(p, t, vel) {
  const osc = p.osc('sine', 130);
  sweep(osc.frequency, t, 130, 44, 0.07);
  const g = p.gain(0);
  envAD(g.gain, t, 0.34 * vel, 0.002, 0.22);
  p.chain(osc, g, p.out);
  p.start(osc, t, t + 0.28);
  const click = p.noise(1);
  const hp = p.filter('highpass', 1800, 0.7);
  const cg = p.gain(0);
  envAD(cg.gain, t, 0.05 * vel, 0.001, 0.012);
  p.chain(click, hp, cg, p.out);
  p.start(click, t, t + 0.04);
}

function snare(p, t, vel) {
  const n = p.noise(rrange(0.95, 1.05));
  const bp = p.filter('bandpass', 1900, 0.8);
  const g = p.gain(0);
  envAD(g.gain, t, 0.14 * vel, 0.001, 0.13);
  p.chain(n, bp, g, p.out);
  p.start(n, t, t + 0.18);
  for (const f of [185, 245]) {
    const o = p.osc('triangle', f);
    const og = p.gain(0);
    envAD(og.gain, t, 0.06 * vel, 0.001, 0.07);
    p.chain(o, og, p.out);
    p.start(o, t, t + 0.11);
  }
  p.send(g, 0.16);
}

function hat(p, t, vel, open) {
  const n = p.noise(rrange(0.98, 1.06));
  // 5.5 kHz rather than 7.2. The hats carry most of the action layer's top end,
  // and pushing them that high had left the whole score at 0.1% of its energy
  // above 6 kHz -- every bright SFX layer fighting for the crowded mid band
  // while the top octave sat empty. The shaker, the celeste and the comp's
  // filter now share that job; this is no longer the only voice up there.
  const hp = p.filter('highpass', 5500, 0.9);
  // A shelf rather than a higher corner. Moving the corner up thins the hat
  // into a hiss; tilting the band it already has puts the energy in the top
  // octave while the 5.5-9 kHz body that makes it sound like a cymbal stays.
  const air = p.filter('highshelf', 9000, 0.7);
  air.gain.value = 5;
  const g = p.gain(0);
  const d = open ? 0.28 : 0.055;
  envAD(g.gain, t, 0.4 * vel, 0.001, d);
  p.chain(n, hp, air, g, p.out);
  p.start(n, t, t + d + 0.03);
  if (open) p.send(g, 0.18);

  // A separate 3 ms transient a major sixth above the body's corner (9 kHz over
  // 5.5 kHz). Before this and
  // the other
  // brightening work the score measured 0.1% of its A-weighted energy above
  // 6 kHz over a 72%-below-1 kHz bed -- boxy, which is the opposite of this
  // franchise. Body alone does not fix that: the stick is what puts a hi-hat on
  // the record, and it has to be short enough not to hiss.
  const tick = p.noise(rrange(0.98, 1.06));
  const tickHp = p.filter('bandpass', rrange(9500, 11000), 0.8);
  const tg = p.gain(0);
  // Under the body, for the same reason the shaker's stick is: three separate
  // 4 ms broadband bursts per eighth (hat, shaker, celesta mallet) are what
  // turned the score's top two octaves into a noise bed with a 0.65 spectral
  // flatness. The tuned voices carry the air; these only mark the attack.
  envAD(tg.gain, t, 0.16 * vel, 0.0004, 0.0035);
  p.chain(tick, tickHp, tg, p.out);
  p.start(tick, t, t + 0.02);
}

/**
 * Shaker, used instead of hats in the calmest layer.
 *
 * Hats do not play below intensity 0.3, so this and the celeste figure are the
 * only bright voices in exploration.
 *
 * The call site passes velocities of 2.5 and 1.4 rather than the ~1.0 the rest
 * of the kit uses, because at kit level the percussion sat well under the bass,
 * melody and harmony -- present on a meter, inaudible in the mix. The lift is
 * applied here rather than to the section gain deliberately: raising the whole
 * percussion patch would take the kick with it and put the low end straight
 * back, which is the thing the lift exists to counteract.
 */
function shaker(p, t, vel) {
  // A bandpass at Q 1.2 passes about a third of an octave, so the old "shaker"
  // was a single thin band at 6.5 kHz -- audible on a meter, not identifiable
  // as beads. A real shaker is broadband from about 4 kHz to past 12, which is
  // both what makes it read as an instrument and what puts the calm layer's
  // energy in the top octave. The 55 ms decay is what keeps that from being
  // hiss: broadband up there is only ever a problem when it is sustained.
  const n = p.noise(rrange(0.9, 1.1));
  const hp = p.filter('highpass', 4200, 0.6);
  const air = p.filter('peaking', 9600, 1.0);
  air.gain.value = 5;
  const g = p.gain(0);
  envAD(g.gain, t, 0.135 * vel, 0.005, 0.055);
  p.chain(n, hp, air, g, p.out);
  p.start(n, t, t + 0.09);
  p.send(g, 0.16);

  // The stick, and it is deliberately *under* the body now.
  //
  // At 0.3 against a body of 0.115, with the call site passing velocities up to
  // 3.0, this was a 0.62-amplitude 5 ms burst of 10 kHz noise on every downbeat
  // eighth -- 16 dB over the melody's peak, and the loudest single event in the
  // exploration layer. That is a click track, not beads, and it is also most of
  // why the top two octaves measured as noise rather than as struck metal: it
  // is broadband, it fires eight times a bar, and the shaker body's reverb send
  // spreads it. A stick is an accent on a body, not a replacement for one.
  const tick = p.noise(rrange(0.95, 1.08));
  const bp = p.filter('bandpass', rrange(9500, 11500), 0.8);
  const tg = p.gain(0);
  envAD(tg.gain, t, 0.085 * vel, 0.0004, 0.004);
  p.chain(tick, bp, tg, p.out);
  p.start(tick, t, t + 0.02);
}

function tom(p, t, freq, vel) {
  const o = p.osc('sine', freq);
  sweep(o.frequency, t, freq, freq * 0.6, 0.12);
  const g = p.gain(0);
  envAD(g.gain, t, 0.16 * vel, 0.002, 0.16);
  p.chain(o, g, p.out);
  p.start(o, t, t + 0.22);
  const n = p.noise(1);
  const bp = p.filter('bandpass', freq * 3, 1.2);
  const ng = p.gain(0);
  envAD(ng.gain, t, 0.04 * vel, 0.001, 0.06);
  p.chain(n, bp, ng, p.out);
  p.start(n, t, t + 0.1);
}

function crash(p, t, vel) {
  const n = p.noise(rrange(0.95, 1.05));
  const hp = p.filter('highpass', 3600, 0.6);
  const g = p.gain(0);
  envAD(g.gain, t, 0.16 * vel, 0.004, 1.1);
  p.chain(n, hp, g, p.out);
  p.start(n, t, t + 1.2);
  p.send(g, 0.5);
}

// ---------------------------------------------------------------------------

/**
 * Bar-accurate sequencer for the procedural score.
 */
export class MusicPlayer {
  /** @param {import('./AudioEngine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    this.playing = false;
    this.track = null;
    this.trackName = null;
    this.intensity = 0.25;
    this._targetIntensity = 0.25;
    this._trackGain = null;
    this._bar = 0;
    this._nextBarTime = 0;
    this._patches = new Set();
    this._lastVoicing = null;
    this._fadeTimers = new Map();
    this._stopAt = 0;
  }

  get ctx() { return this.audio.ctx; }
  get beatDur() { return 60 / this.track.tempo; }
  get barDur() { return this.beatDur * 4; }

  /** @param {string} name key of `TRACKS` */
  start(name = 'main') {
    // Resolve first: storing the *requested* name means an unknown key plays
    // `main` but reports itself as something else, and the next legitimate
    // `start('main')` then restarts the music that was already playing.
    const key = TRACKS[name] ? name : 'main';
    const track = TRACKS[key];
    if (this.playing && this.trackName === key) return;
    if (this.playing) this.stop({ fadeOut: 0.35 });
    const ctx = this.ctx;
    if (!ctx) return;
    this.track = track;
    this.trackName = key;
    this.playing = true;
    this._bar = 0;
    this._lastVoicing = null;
    if (track.intensity != null) {
      this.intensity = track.intensity;
      this._targetIntensity = track.intensity;
    }
    this._trackGain = ctx.createGain();
    this._trackGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this._trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.25);
    this._trackGain.connect(this.audio.musicBus);
    this._nextBarTime = ctx.currentTime + 0.12;
    this.pump();
  }

  /** @param {{fadeOut?:number}} [o] */
  stop(o = {}) {
    if (!this.playing) return;
    const fade = Math.max(0.02, o.fadeOut ?? 1.2);
    const ctx = this.ctx;
    const g = this._trackGain;
    this.playing = false;
    this.track = null;
    this.trackName = null;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    const held = Math.max(1e-4, cancelAndHold(g.gain, now));
    g.gain.setValueAtTime(held, now);
    g.gain.exponentialRampToValueAtTime(1e-4, now + fade);
    this._stopAt = now + fade;
    const patches = this._patches;
    this._patches = new Set();
    this._trackGain = null;
    // Voices scheduled inside the fade window keep sounding through it, then
    // get torn down together so nothing survives the transition. The handle is
    // kept so `dispose` can pre-empt it -- otherwise teardown lands after the
    // context has already been closed.
    const finish = () => {
      this._fadeTimers.delete(timer);
      for (const p of patches) p.close();
      try { g.disconnect(); } catch { /* already gone */ }
    };
    const timer = setTimeout(finish, fade * 1000 + 120);
    this._fadeTimers.set(timer, finish);
  }

  /**
   * Target arrangement density, 0 (exploration) .. 1 (boss). The change is
   * applied at the next bar line so layers never enter mid-phrase.
   */
  setIntensity(v) {
    // A NaN target compares false against everything, so the layer system would
    // silently stop responding for the rest of the session.
    this._targetIntensity = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.3;
  }

  /**
   * Schedule every bar that starts inside the lookahead window.
   *
   * After a stall (a shader compile, a GC, a backgrounded tab) the scheduler is
   * behind. Bars that finished while we were away are skipped wholesale, but
   * the bar that is *currently sounding* is still scheduled -- with its
   * already-past events dropped -- so the score joins back in on the beat
   * instead of going silent until the next bar line. Rounding the catch-up up
   * to a whole bar instead costs a full bar of dead air after any hitch longer
   * than the lookahead.
   */
  pump() {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this._nextBarTime < now) {
      const missed = Math.floor((now - this._nextBarTime) / this.barDur);
      if (missed > 0) {
        this._bar += missed;
        this._nextBarTime += missed * this.barDur;
      }
    }
    let guard = 8;
    while (this._nextBarTime < now + LOOKAHEAD && guard-- > 0) {
      // Only a bar that has *already started* drops events. A bar still in the
      // future keeps all of them even if its downbeat is only milliseconds
      // away, because gating those would silently swallow the kick and the
      // crash on the very bar we just caught up to.
      const notBefore = this._nextBarTime < now ? now + SCHEDULE_MARGIN : 0;
      this._scheduleBar(this._bar, this._nextBarTime, notBefore);
      this._bar++;
      this._nextBarTime += this.barDur;
    }
  }

  _patch() {
    const a = this.audio;
    const p = new Patch(this.ctx, {
      out: this._trackGain,
      reverb: a.musicReverbIn,
      delay: a.musicDelayIn,
      noise: a.noiseBuffer,
      waves: a.waves,
    }, {
      onOpen: (q) => { this._patches.add(q); a._voiceOpen(); },
      onClose: (q) => { this._patches.delete(q); a._voiceClose(); },
    });
    return p;
  }

  /**
   * Absolute time of `beat` within a bar starting at `t0`, with shuffle.
   *
   * Swing is applied as a *warp* of the eighth-note grid rather than a fixed
   * push on off-beats: the first eighth of each pair is stretched and the
   * second compressed, and anything in between is interpolated. A fixed push
   * only works for exact eighths -- it drops the 16th-note counter-line into
   * the gaps at the wrong place and the arpeggio fights the hats.
   */
  _t(t0, beat) {
    const eighths = beat * 2;
    const e = Math.floor(eighths + 1e-9);
    const frac = eighths - e;
    const off = (e % 2) === 1;
    const swing = this.track.swing;
    const start = e * 0.5 + (off ? swing : 0);
    const len = 0.5 + (off ? -swing : swing);
    return t0 + (start + frac * len) * this.beatDur;
  }

  /**
   * Voice `chord` inside the pad register, led from `prev`.
   *
   * Three passes, each fixing something the previous one cannot:
   *
   * 1. **Register.** Fold the chord tones into one octave at `PAD_PIVOT` so the
   *    bed cannot drift up the keyboard across the progression.
   * 2. **Voice leading.** Let each tone pick the octave placement nearest an
   *    existing voice, bounded by `PAD_FLOOR`/`PAD_CEIL`. This holds common
   *    tones still and moves the rest by step. The floor is what keeps the pad
   *    clear of the bass pattern's octave note, which sits in the seven scale
   *    steps directly below it -- overlapping there produced an exact unison on
   *    every bar of both tracks.
   * 3. **Parallel repair.** Nearest-tone selection still lets two voices slide
   *    by the same interval and arrive at another perfect fifth or octave. Those
   *    are the intervals that fuse into one voice when they move in parallel, so
   *    any pair that does it gets one of its voices re-placed.
   *
   * @param {{deg:number, sev:boolean}} chord
   * @param {number[]} [prev] the previous bar's voicing, in scale indices
   * @returns {number[]} scale indices, low to high
   */
  _voice(chord, prev) {
    const size = chord.sev ? 4 : 3;
    const base = ((PAD_PIVOT % 7) + 7) % 7;
    const home = [];
    for (let i = 0; i < size; i++) {
      const deg = (((chord.deg + i * 2) % 7) + 7) % 7;
      home.push(PAD_PIVOT + ((((deg - base) % 7) + 7) % 7));
    }
    if (!prev || !prev.length) return home.sort((a, b) => a - b);

    const inRange = (v) => v >= PAD_FLOOR && v <= PAD_CEIL;
    let picked = home.map((h) => {
      let best = null;
      let bestDist = Infinity;
      for (const shift of [-7, 0, 7]) {
        const cand = h + shift;
        if (!inRange(cand)) continue;
        for (const pv of prev) {
          const d = Math.abs(cand - pv);
          if (d < bestDist) { bestDist = d; best = cand; }
        }
      }
      return best ?? h;
    });

    // Nearest-voice selection can land two tones on the same pitch.
    const seen = new Set();
    picked = picked.sort((a, b) => a - b).map((v) => {
      let x = v;
      while (seen.has(x)) x += 7;
      seen.add(x);
      return x;
    });

    const isPerfect = (iv) => iv === 4 || iv === 7;
    const before = prev.slice().sort((a, b) => a - b);
    for (let i = 0; i < picked.length - 1; i++) {
      for (let j = i + 1; j < picked.length; j++) {
        if (i >= before.length || j >= before.length) continue;
        const was = before[j] - before[i];
        const now = picked[j] - picked[i];
        const moved = picked[i] !== before[i] && picked[j] !== before[j];
        if (!moved || was !== now || !isPerfect(now)) continue;
        // Re-place the upper voice an octave away if that keeps it in range and
        // does not collide with a voice already there.
        for (const shift of [7, -7]) {
          const cand = picked[j] + shift;
          if (!inRange(cand) || picked.includes(cand)) continue;
          picked[j] = cand;
          break;
        }
      }
    }
    return picked.sort((a, b) => a - b);
  }

  /**
   * Commit one bar.
   *
   * @param {number} bar        absolute bar counter; drives across-loop variation
   * @param {number} t0         absolute audio time of the bar line
   * @param {number} notBefore  drop events earlier than this (joining a bar late)
   */
  _scheduleBar(bar, t0, notBefore = 0) {
    const track = this.track;
    const bars = track.prog.length;
    const form = ((bar % bars) + bars) % bars;
    const chord = track.prog[form];
    const next = track.prog[(form + 1) % bars];
    const root = track.root;

    // Layer changes land on the bar line.
    const prev = this.intensity;
    if (Math.abs(this._targetIntensity - prev) > 0.001) this.intensity = this._targetIntensity;
    const inten = this.intensity;
    // A generous threshold: a crash on every small nudge (a settings slider
    // being dragged, or a boss health bar ticking down) would be a car alarm.
    const rising = inten > prev + 0.18;

    const drums = inten >= 0.3;
    const drive = inten >= 0.62;
    const boss = inten >= 0.85;
    const beat = this.beatDur;

    // The arrangement has to get *louder*, not just busier. Layering more
    // instruments at fixed gains changes the texture but leaves the loudness
    // flat, and a player reads that as "same music, more notes".
    const push = 0.6 + inten * 0.6;

    // One patch per section rather than per bar: a section's nodes are released
    // when that section stops sounding, instead of a bar's worth of percussion
    // staying connected until the crash cymbal has finished decaying.
    const pH = this._patch();
    const pB = this._patch();
    const pM = this._patch();
    const pP = this._patch();
    const gate = (t) => t >= notBefore;

    // Deterministic per-pass variation: the same bar of the form is arranged
    // differently each time round the loop, so a 29-second theme does not
    // announce its own loop point.
    const pass = Math.floor(bar / bars);
    const variant = (pass * 5 + form) % 4;

    // -- Harmony ------------------------------------------------------------
    // Register plan, in scale indices (ranges measured, not intended):
    //   bass    -14..-2  D2-B3   (the pattern's octave jump reaches the top)
    //   pad       0..7   D4-D5   (window is 0..9; measured occupancy 0..7)
    //   lead      2..14  F#4-D6
    //   bell      7..21  D5-D7   (the counter-line; its pool floor overlaps
    //                             the lead, it is not clear of it)
    //   celesta  14..28  D6-D8   (1.2-4.7 kHz fundamentals)
    //   shimmer  21..25  D7-F#7  (2.3-3.1 kHz, sustained)
    // The last two are the score's top octave and the only voices above the
    // counter-line. The pad used to sit at -7..-2, which put its root voice in
    // exact unison with the bass pattern's octave note on every single bar.
    const tones = this._voice(chord, this._lastVoicing);
    this._lastVoicing = tones;

    if (inten < 0.55) {
      // Drop the pad on one bar in eight so the texture breathes.
      const rest = variant === 3 && (form % 4) === 2;
      if (!rest && gate(t0)) {
        for (const idx of tones) {
          padNote(pH, t0, scaleNote(idx, root), this.barDur, (0.9 - inten * 0.4) * push);
        }
      }
    }
    // -- Celesta ------------------------------------------------------------
    // The top line, at every intensity. It used to exist only below 0.55 and
    // only as three or four notes a bar, which meant the action and boss layers
    // had no top octave at all and exploration had one for about a tenth of the
    // time. The pool reaches a ninth above the pad and everything is offset two
    // octaves up, putting the fundamentals at 1.2-4.7 kHz and the glass
    // partials into the top octave where this franchise lives.
    const cPool = [...tones, tones[0] + 7, tones[1] + 7, tones[2] + 7];
    // 20 ms of margin, the same discipline the chromatic approach note uses:
    // the tail has to be *silent* before the next chord, not merely quieter.
    const celesteUntil = t0 + this.barDur - 0.02;
    const figure = drive
      ? CELESTE_DRIVE[(pass + form) % CELESTE_DRIVE.length]
      : CELESTE_FIGURES[(pass + form) % CELESTE_FIGURES.length];
    for (let e = 0; e < 8; e++) {
      const step = figure[e];
      if (step < 0) continue;
      const t = this._t(t0, e * 0.5);
      if (!gate(t)) continue;
      const idx = cPool[step % cPool.length] + 14;
      // Level rises with the arrangement for the same reason the density does.
      celesteNote(pH, t, scaleNote(idx, root), beat * 0.5,
        (1.0 + inten * 0.6) * push, celesteUntil);
    }

    // The shimmer pad holds the same chord three octaves up. It is the only
    // continuously sounding voice the score has above 2 kHz, and it is what
    // makes the difference between "bright notes happen" and "the record has
    // air on it".
    //
    // Voiced from the two *lowest* chord tones. Off the top two it reached a
    // sustained 4.7 kHz fundamental, which is the middle of the band the ear is
    // most sensitive to and where a held tone stops being air and starts being
    // fatigue; from the bottom two it sits at 2.3-3.1 kHz and its glass
    // partials do the work in the top octave instead.
    if (gate(t0)) {
      for (const idx of tones.slice(0, 2)) {
        shimmerPad(pH, t0, scaleNote(idx + 21, root), this.barDur, (0.85 + inten * 0.7) * push);
      }
    }

    // A triangle on the phrase line. Its 1.2 s decay is the only sustained
    // content the score has above 5 kHz, so it is what makes the space between
    // phrases sound like air rather than like silence.
    const tri = (0.8 + inten * 0.5) * push;
    if ((form % 2) === 0 && gate(t0)) {
      triangleHit(pH, t0, ((form % 4) === 0 ? 0.95 : 0.6) * tri);
    }
    if ((form % 4) === 3) {
      const t = this._t(t0, 2.5);
      if (gate(t)) triangleHit(pH, t, 0.6 * tri, 0.9);
    }
    // A roll on the phrase line once the arrangement is driving: four strikes
    // inside a beat is the one gesture that reads unambiguously as "this is
    // the big moment", and the boss layer had nothing of the kind up top.
    if (drive && (form % 4) === 3) {
      for (let i = 0; i < 4; i++) {
        const t = this._t(t0, 3 + i * 0.25);
        if (gate(t)) triangleHit(pH, t, (0.3 + i * 0.13) * tri, 0.5);
      }
    }

    // Off-beat comping stabs are the bounce in the middle of the mix.
    const compBeats = drive
      ? (variant % 2 ? [0.5, 1.5, 2.5, 3.5] : [0.5, 1.5, 2.5, 3, 3.5])
      : (variant % 2 ? [1.5, 3.5] : [1.5, 2.5, 3.5]);
    for (const b of compBeats) {
      const t = this._t(t0, b) + rrange(-0.003, 0.003);
      if (!gate(t)) continue;
      for (const idx of tones) {
        pluckNote(pH, t, scaleNote(idx, root), beat * 0.45, (0.9 + (drive ? 0.25 : 0)) * push);
      }
    }

    // -- Bass ---------------------------------------------------------------
    const bassRoot = chord.deg - 14;
    const pattern = drive ? BASS_PATTERN_DRIVE : BASS_PATTERN;
    // The approach note owns the last sixteenth, so the pattern's own note on
    // the "and" of 4 is dropped when it fires. Overlapping them put a minor
    // second in the sub-bass -- doubled by both sub-oscillators -- for 127 ms
    // of every bar, which is exactly where low end turns to mud.
    const approaching = drive && variant !== 1;
    for (const [delta, b, dur, vel] of pattern) {
      if (approaching && b >= 3.5) continue;
      const t = this._t(t0, b);
      if (!gate(t)) continue;
      bassNote(pB, t, scaleNote(bassRoot + delta, root), dur * beat, vel * push);
    }
    // Chromatic approach into the next bar's root -- the one place a half-step
    // outside the key is unconditionally safe, because it is brief, low, and on
    // the last offbeat where nothing else is sounding.
    if (approaching) {
      // Beat 3.875, not 3.75: with the short envelope this leaves the approach
      // decayed to silence ~8 ms before the bar line instead of sustaining
      // across it into the next chord's root.
      const t = this._t(t0, 3.875);
      const target = scaleNote(next.deg - 14, root);
      const here = scaleNote(bassRoot, root);
      // An octave above the bass register. Down at 78-117 Hz the 39 ms this
      // note lasts is only 3-4 cycles, which is below where pitch registers --
      // it read as a rhythmic ghost rather than as a lead-in to the next chord.
      const approach = target + (target >= here ? -1 : 1) + 12;
      if (gate(t)) bassNote(pB, t, approach, beat * 0.12, 0.42 * push, true);
    }

    // -- Melody -------------------------------------------------------------
    // Octave doubling arrives gradually through the action layer rather than
    // snapping on at the boss threshold.
    const octave = Math.max(0, Math.min(1, (inten - 0.5) / 0.45));
    for (const [idx, b, dur] of track.melody[form % track.melody.length]) {
      const t = this._t(t0, b) + rrange(-0.004, 0.004);
      if (!gate(t)) continue;
      leadNote(pM, t, scaleNote(idx, root), dur * beat, 0.55 + inten * 0.5, octave);
    }

    // -- Counter-line -------------------------------------------------------
    if (drive) {
      // Genuine sixteenths, an octave above the comp. The contour is five
      // patterns deep and advances with the bar, because a four-pitch figure
      // repeating identically every bar is an ostinato, not a counter-line --
      // it is the first thing that gives a generated loop away.
      const pool = [...tones, tones[0] + 7, tones[1] + 7];
      const contour = COUNTER_CONTOURS[(pass + form) % COUNTER_CONTOURS.length];
      let n = 0;
      for (let sx = 0; sx < 16; sx++) {
        if (sx % 4 === 0) continue;             // leave the beats to the melody
        const step = contour[n++ % contour.length];
        if (step < 0) continue;                 // a rest in the figure
        const idx = pool[step % pool.length] + 7;
        const t = this._t(t0, sx * 0.25);
        if (!gate(t)) continue;
        // Deliberately still the bell wavetable, not the celesta's glass one.
        // Moving it onto glass bought a little top end and cost more than it
        // was worth: the counter-line and the celesta overlap across scale
        // indices 14-21, and two independent sixteenth-note lines in the same
        // register *and* the same timbre stop reading as two instruments. The
        // celesta carries the top octave; this line carries the motion.
        bellNote(pM, t, scaleNote(idx, root), beat * 0.18, (boss ? 0.95 : 0.65) * push);
      }
    }

    // -- Percussion ---------------------------------------------------------
    // The fill owns beat 4, so the pattern gets out of its way there.
    const fill = boss && (form % 4) === 3;
    const hit = (fn, b, ...rest) => {
      const t = this._t(t0, b);
      if (gate(t)) fn(pP, t, ...rest);
    };
    if (drums) {
      hit(kick, 0, push);
      hit(kick, 2, 0.85 * push);
      if (drive) hit(kick, 2.5, 0.6 * push);
      if (boss && !fill) hit(kick, 3.5, 0.7 * push);
      hit(snare, 1, 0.95 * push);
      if (!fill) hit(snare, 3, push);
      // A ghost note ahead of the backbeat adds shuffle without moving it.
      if (drive && variant % 2 === 0) hit(snare, 2.75, 0.28 * push);
      for (let e = 0; e < 8; e++) {
        if (fill && e >= 6) continue;
        const open = drive && (e === 3 || e === 7);
        hit(hat, e * 0.5, (e % 2 === 0 ? 1 : 0.6) * push, open);
      }
    } else {
      // Downbeat-accented, matching the hats that replace this layer above
      // intensity 0.3. Accenting the offbeats here instead inverted the groove
      // by ~9 dB the instant the action layer engaged, and back-beated the
      // shaker against a downbeat kick.
      for (let e = 0; e < 8; e++) hit(shaker, e * 0.5, (e % 2 ? 1.15 : 1.9) * push);
      // Lighter than it was. The calm layer's kick was putting more energy
      // under 130 Hz than the whole score had above 6 kHz, and this layer is
      // the one that is supposed to sound like air rather than like a drum kit.
      if (inten > 0.12) {
        hit(kick, 0, 0.58 * push);
        hit(kick, 2, 0.44 * push);
      }
    }

    // Phrase-end tom fill, and a crash whenever the arrangement steps up.
    if (fill) {
      const toms = [220, 185, 150, 120];
      for (let i = 0; i < 4; i++) hit(tom, 3 + i * 0.25, toms[i], 0.9 * push);
    }
    if ((rising || (drums && form === 0)) && gate(t0)) {
      crash(pP, t0, (rising ? 1 : 0.6) * push);
    }

    // A section that scheduled nothing this bar would otherwise pin its nodes.
    for (const q of [pH, pB, pM, pP]) if (q._live === 0) q.close();
  }

  /** Synchronous teardown: nothing may outlive the caller's `ctx.close()`. */
  dispose() {
    this.stop({ fadeOut: 0.02 });
    // `stop` hands the live patches to a timer; run those closures now instead
    // of letting them fire after the context is gone.
    for (const [timer, finish] of this._fadeTimers) { clearTimeout(timer); finish(); }
    this._fadeTimers.clear();
    for (const p of this._patches) p.close();
    this._patches.clear();
    this.playing = false;
  }
}
