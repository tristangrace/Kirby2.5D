/**
 * Sound-effect recipes.
 *
 * Each recipe is `(patch, t0, opts) => endTime` and is responsible only for
 * building nodes; routing, panning, volume, ducking and lifetime are handled by
 * `AudioEngine`. Every recipe randomises pitch and timing slightly so that a
 * player mashing jump never hears the same sample twice in a row -- the single
 * most audible difference between a toy and a shipped game.
 *
 * The design language throughout: short, bright, cartoon-physical. Attacks are
 * short (0.4-1.5 ms typical, never a click), bodies triangle/soft-square,
 * and almost everything has a small noise transient so it reads as an object
 * moving through air rather than a synthesiser being switched on.
 */
import {
  envAD, envADSR, sweep, fmVoice, noiseBurst, formantBank, mtof, rrange, jitterCents,
} from './Synth.js';
import { KEY_ROOT, scaleNote } from './Theory.js';

/**
 * Loudness target for each effect, in dB relative to the action music bed.
 *
 * This is the specification `MIX` is solved against, kept in the repo so the
 * solution is checkable rather than asserted. To re-derive a trim: render the
 * cue through the real graph, measure it by the convention below, and scale
 * `MIX[name]` by the shortfall.
 *
 * Force-scaled cues (`land`) are specified at FULL force; they are quieter at
 * lower force by design.
 */
export const MIX_TARGET_DB = {
  land: 2, jump: 1, enemyHit: 2, enemyDefeated: 1, damaged: 3, star: 3,
  spit: 1, swallow: 1, puff: -1, exhale: -2, enemyInhaled: 0, captured: -2,
  bossHealth: 2, abilityChanged: 2, abilityLost: 0, respawn: 1,
  menuConfirm: -3, menuCancel: -4, menuMove: -6, footstep: -9,
  fanfare: 4, gameOver: 3,
};

/**
 * Static mix trims, applied by `AudioEngine.play` on top of `opts.volume`.
 *
 * Solved, not guessed. Measurement convention, so the numbers below are
 * checkable rather than asserted:
 *
 *   - render the effect offline through the real graph, tapped at `sfxGuard`,
 *     the last node on the SFX bus and therefore what actually reaches the mix;
 *   - take RMS of the MONO SUM ((L+R)/2) over a 300 ms window from onset,
 *     median of five renders -- the recipes randomise, so one render is not
 *     repeatable, and a stereo-mean instead of a mono sum shifts every figure;
 *   - express it in dB relative to the action music bed's own RMS, measured
 *     the same way at `pauseGain`.
 *
 * The per-effect targets are `MIX_TARGET_DB` above -- broadly: primary action
 * cues +1 to +3, big moments +3 to +4 (they duck the music anyway), secondary
 * cues -2 to +2, UI -3 to -6, footsteps -9.
 *
 * Note the method's own noise floor: the recipes randomise their filter bands
 * and noise offsets, so a median of five carries roughly +/-0.4 dB of scatter.
 * Quoting a trim or a deviation to better than 0.1 dB is quoting noise.
 *
 * **Force-scaled cues are targeted at full force.** `land` runs -8.0 dB at
 * force 0.12, -2.5 at 0.5 and +2.0 at 1.0; quoting one number for it is
 * meaningless without saying which. A gentle touchdown is *supposed* to sit
 * under the music. The same applies to any cue whose recipe reads `opts.force`.
 *
 * **The reference is the music bed, so a change to the score re-solves this
 * whole table.** The shimmer pass added a celesta line, a shimmer pad and a
 * triangle, which raised the action bed roughly 0.3 dB at `pauseGain` while
 * leaving programme RMS at the destination unchanged -- the master limiter
 * absorbed the difference. Every one of the 22 trims was therefore measuring
 * that much under target, consistently and in the same direction, which is the
 * signature of a moved reference rather than of scatter. All of them were
 * scaled back up by the measured amount; `fanfare` took an extra trim because
 * its own first 300 ms genuinely got louder in the same pass.
 *
 * These are pure loudness targets. Two earlier attempts tried to make this
 * table enforce a peak ceiling as well, and both failed: matching by peak alone
 * left footsteps 24.7 dB under the music, and solving peak-with-a-loudness-cap
 * chased a moving target, because the recipes peak differently on every
 * trigger. The ceiling lives in the graph instead.
 */
export const MIX = {
  jump: 1.75, land: 2.31, puff: 2.33, exhale: 3.96, star: 1.84,
  enemyHit: 2.92, enemyDefeated: 2.45, enemyInhaled: 2.79, damaged: 1.05,
  abilityChanged: 1.30, bossHealth: 1.67, respawn: 1.37,
  menuMove: 3.61, menuConfirm: 2.43, menuCancel: 2.81, footstep: 2.85,
  abilityLost: 1.57, spit: 4.15, swallow: 4.22, captured: 2.97,
  fanfare: 1.16, gameOver: 1.42,
  // The inhale bed is sustained rather than a one-shot, so it is trimmed to sit
  // under the music instead of peaking with the impacts.
  inhale: 1.75,
};

/** How much the music ducks under each effect (0..1) and for how long. */
export const DUCK = {
  star: [0.28, 0.5],
  damaged: [0.55, 0.7],
  enemyDefeated: [0.22, 0.4],
  bossHealth: [0.4, 0.6],
  abilityChanged: [0.35, 0.65],
  abilityLost: [0.35, 0.6],
  exhale: [0.15, 0.3],
  spit: [0.2, 0.35],
  swallow: [0.3, 0.5],
  fanfare: [0.8, 2.0],
  gameOver: [0.85, 2.0],
};

/** Effects that should never stack more than a couple of instances. */
export const POLYPHONY = {
  jump: 4, land: 4, footstep: 5, enemyHit: 5, star: 8,
  fanfare: 1, gameOver: 1, abilityChanged: 2, abilityLost: 2, default: 8,
};

// ---------------------------------------------------------------------------

/**
 * Layer offsets, in seconds.
 *
 * Stacked layers whose envelopes all attack on the same sample sum coherently,
 * so a three-layer impact peaks at nearly the sum of its parts while sounding
 * no louder -- which forces the mix trim down and leaves the cue quiet. Pulling
 * the layers apart by a few milliseconds is far below the ~20 ms at which the
 * ear starts hearing two events, but it decorrelates the peaks and buys several
 * dB of headroom for free. These are deliberately not randomised: the point is
 * a predictable crest factor the mix can be solved against.
 */
const LAYER = { a: 0.0012, b: 0.0028, c: 0.0045, d: 0.0062 };

/** Quick upward bend on a soft square, with a breathy transient on top. */
function jump(p, t, o) {
  const v = o.volume ?? 1;
  const base = 300 * (o.rate ?? 1) * rrange(0.95, 1.06);
  const body = p.osc(p.waves.softSquare, base, jitterCents(18));
  sweep(body.frequency, t, base, base * 2.45, 0.11);
  const g = p.gain(0);
  envAD(g.gain, t, 0.24 * v, 0.006, 0.2);
  p.chain(body, g, p.out);
  p.start(body, t, t + 0.24);

  // Triangle an octave up thins out as it rises: cartoon "boing" shimmer.
  const tt = t + LAYER.a;
  const top = p.osc('triangle', base * 2, jitterCents(25));
  sweep(top.frequency, tt, base * 2, base * 4.6, 0.1);
  const tg = p.gain(0);
  envAD(tg.gain, tt, 0.12 * v, 0.004, 0.13);
  p.chain(top, tg, p.out);
  p.start(top, tt, tt + 0.18);

  // The whip of air is what stops the jump reading as a bare synth blip. It has
  // to be loud enough to survive next to the body -- at a third of the body's
  // level it contributed 0.02% of the effect's energy and was simply inaudible.
  const air = noiseBurst(p, {
    t0: t + LAYER.b, from: 4000, to: 9000, q: 0.5, type: 'bandpass',
    dur: 0.1, peak: 0.5 * v, attack: 0.003,
  });
  const airHi = noiseBurst(p, {
    t0: t + 0.008, from: 7500, to: 10500, q: 1.0, type: 'bandpass',
    dur: 0.1, peak: 0.42 * v, attack: 0.0015,
  });
  air.connect(p.out);
  airHi.connect(p.out);
  p.send(g, 0.25);
  return t + 0.26;
}

/** Low thump plus a filtered noise slap; `force` (0..1) drives weight. */
function land(p, t, o) {
  const v = o.volume ?? 1;
  const f = Math.min(1, Math.max(0.12, o.force ?? 0.5));
  const thumpTop = 190 * rrange(0.94, 1.07);
  const thump = p.osc('sine', thumpTop);
  sweep(thump.frequency, t, thumpTop, 52, 0.1 + f * 0.05);
  const g = p.gain(0);
  // A small, short thump. Kirby is light and rubbery, and this layer only has
  // to imply weight -- band-limited noise delivers a fraction of the RMS of a
  // sine at the same peak, so a "balanced-looking" thump buries the slap and
  // the tick completely and leaves the cue sitting under the bass line.
  envAD(g.gain, t, (0.03 + f * 0.08) * v, 0.004, 0.07 + f * 0.05);
  p.chain(thump, g, p.out);
  p.start(thump, t, t + 0.32);

  // The slap. Band-passed well above the body rather than low-passed into it:
  // as a low-pass this layer only reinforced the thump, leaving 86% of the
  // effect's A-weighted energy under 300 Hz and no sense of contact at all.
  const slap = noiseBurst(p, {
    t0: t + LAYER.c, from: 2400 + f * 2600, to: 1200, q: 0.8, type: 'bandpass',
    // Longer than an impact instinctively wants to be. The 300 ms window that
    // decides perceived loudness is mostly empty otherwise, so the trim has to
    // drive the cue into the bus ceiling to be heard -- length buys the same
    // loudness with none of the saturation.
    dur: 0.26 + f * 0.16, peak: (0.3 + f * 0.4) * v, attack: 0.0015,
  });
  slap.connect(p.out);

  // Kirby is rubber: a tiny rebound blip sells the squash.
  const blip = p.osc('triangle', 340 * rrange(0.95, 1.05));
  sweep(blip.frequency, t + 0.05, 340, 210, 0.09);
  const bg = p.gain(0);
  envAD(bg.gain, t + 0.05, 0.2 * v * f, 0.01, 0.13);
  p.chain(blip, bg, p.out);
  p.start(blip, t + 0.05, t + 0.2);

  // A brief bright tick on the very front. Without it the impact is all body
  // and reads as a drum in another room rather than a rubber character landing.
  // Band-passed, not high-passed: as a high-pass this layer ran to Nyquist and
  // turned the landing into a splash with no body at all.
  const tick = noiseBurst(p, {
    t0: t + LAYER.a, from: 7000, to: 3200, q: 1.1, type: 'bandpass',
    dur: 0.1, peak: (0.07 + f * 0.13) * v, attack: 0.0005,
  });
  tick.connect(p.out);

  p.send(slap, 0.3);
  // The slap runs to ~0.43 s at full force. Declaring less than the recipe
  // actually produces breaks the polyphony cap, which prunes on this value --
  // eight rapid calls all passed and left five 0.42 s noise slaps overlapping.
  return t + 0.47;
}

/**
 * The puff/float inflate: a breath that morphs from "oo" to "ee".
 *
 * Kirby inflating is a vocal sound, not wind, so this runs the noise through a
 * vowel formant bank rather than a plain band-pass. That single change is most
 * of the distance between "a filtered noise sweep" and "a character breathing".
 */
function puff(p, t, o) {
  const v = o.volume ?? 1;
  const n = Math.min(4, o.count ?? 1);
  // Each successive mid-air puff is a little higher and a little smaller: the
  // player hears they are running out of float.
  const lift = 1 + (n - 1) * 0.16;
  const air = p.noise(rrange(0.9, 1.12));
  const bank = formantBank(p, air, {
    t0: t + LAYER.b, from: 'u', to: 'i', time: 0.24,
    scale: lift * rrange(0.97, 1.05), q: 6,
  });
  // A little raw air over the top keeps it from sounding like a vocoder.
  const hiss = p.filter('bandpass', 4200, 0.8);
  const hissG = p.gain(0.35);
  air.connect(hiss);
  hiss.connect(hissG);
  const g = p.gain(0);
  envADSR(g.gain, t, 0.26 * v, { a: 0.035, d: 0.08, s: 0.55, hold: 0.05, r: 0.16 });
  bank.connect(g);
  hissG.connect(g);
  g.connect(p.out);
  p.start(air, t, t + 0.4);

  // Soft pitched breath underneath so it has a body, not just hiss.
  const tt = t + LAYER.d;
  const tone = p.osc('sine', 260 * lift);
  sweep(tone.frequency, tt, 260 * lift, 460 * lift, 0.2);
  const tg = p.gain(0);
  envAD(tg.gain, tt, 0.13 * v, 0.03, 0.24);
  p.chain(tone, tg, p.out);
  p.start(tone, tt, tt + 0.3);

  p.send(g, 0.18);
  return t + 0.42;
}

/** Deflating exhale: the puff run backwards, falling instead of rising. */
function exhale(p, t, o) {
  const v = o.volume ?? 1;
  const air = p.noise(rrange(0.85, 1.05));
  // "ee" collapsing to "oo": the puff played backwards, vowel and all.
  const bank = formantBank(p, air, {
    t0: t + LAYER.a, from: 'i', to: 'o', time: 0.28, scale: rrange(0.95, 1.04), q: 5,
  });
  const hiss = p.filter('bandpass', 3400, 0.8);
  const hissG = p.gain(0.3);
  air.connect(hiss);
  hiss.connect(hissG);
  const g = p.gain(0);
  envAD(g.gain, t, 0.24 * v, 0.01, 0.33);
  bank.connect(g);
  hissG.connect(g);
  g.connect(p.out);
  p.start(air, t, t + 0.4);

  const tt = t + LAYER.c;
  const tone = p.osc('triangle', 520);
  sweep(tone.frequency, tt, 520, 180, 0.26);
  const tg = p.gain(0);
  envAD(tg.gain, tt, 0.09 * v, 0.008, 0.28);
  p.chain(tone, tg, p.out);
  p.start(tone, tt, tt + 0.34);
  p.send(g, 0.4);
  return t + 0.42;
}

/**
 * The inhale bed. Unlike the one-shots this is gated: it returns handles so the
 * engine can hold it open for as long as the button is down.
 */
function inhaleLoop(p, t, o) {
  const v = o.volume ?? 1;
  const air = p.noise(1);
  // A held "aw" vowel is the vortex's voice; the band-pass on top is the swirl.
  const bank = formantBank(p, air, { t0: t, from: 'o', to: 'o', time: 0, q: 4, gain: 0.8 });
  const band = p.filter('bandpass', 700, 3.2);
  const low = p.filter('lowpass', 3000, 0.6);
  const g = p.gain(0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.22 * v, t + 0.09);
  air.connect(band);
  p.chain(band, low);
  low.connect(g);
  bank.connect(g);
  g.connect(p.out);

  // Bright turbulence on top. Most of the bed's energy lives here rather than
  // in the rumble: weighted the other way it reads as a hum, not as air being
  // pulled through a mouth.
  const hiss = p.filter('bandpass', 4200, 1.6);
  const hg = p.gain(0);
  hg.gain.setValueAtTime(0.0001, t);
  hg.gain.linearRampToValueAtTime(0.1 * v, t + 0.1);
  air.connect(hiss);
  p.chain(hiss, hg, p.out);

  // Slow swirl on the band-pass gives the vortex its motion; the top layer is
  // swept the opposite way by the same LFO, which is what reads as rotation.
  const lfo = p.osc('sine', 1.15);
  const lfoGain = p.gain(420);
  p.chain(lfo, lfoGain);
  lfoGain.connect(band.frequency);
  const lfoHi = p.gain(-2200);
  lfo.connect(lfoHi);
  lfoHi.connect(hiss.frequency);

  // A touch of low rumble for mass -- but only a touch.
  const rumble = p.osc('sine', 78);
  const rg = p.gain(0);
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.linearRampToValueAtTime(0.014 * v, t + 0.12);
  p.chain(rumble, rg, p.out);

  p.send(g, 0.14);
  // Open-ended: `AudioEngine.stopInhale` is what actually ends this, and it
  // reschedules the stops. The cap only exists so a lost release event cannot
  // pin three oscillators for the rest of the session.
  const MAX = 120;
  p.start(air, t, t + MAX);
  p.start(lfo, t, t + MAX);
  p.start(rumble, t, t + MAX);
  // Every gain that feeds the output must be listed here: `stopInhale` fades
  // exactly this set, and anything omitted keeps sounding at full level until
  // the teardown timer hard-stops it 220 ms later. Leaving `hg` out meant the
  // release only dropped the bed 7 dB and then truncated a 4-6 kHz band --
  // an audible click on the most-triggered sustained sound in the game.
  return { patch: p, gains: [g, rg, hg], end: t + MAX };
}

/** Sparkly bell arpeggio for pickups. */
function star(p, t, o) {
  const v = o.volume ?? 1;
  // Three ascending chord tones, occasionally a fourth: same shape, different
  // starting degree each time so a row of stars plays a little run.
  const start = [7, 9, 11][Math.floor(rrange(0, 3))];
  const steps = [start, start + 2, start + 4];
  if (rrange(0, 1) > 0.6) steps.push(start + 7);
  let end = t;
  steps.forEach((idx, i) => {
    const t0 = t + i * (0.062 + rrange(-0.004, 0.004));
    const freq = mtof(scaleNote(idx, KEY_ROOT));
    const car = fmVoice(p, {
      t0, freq, ratio: 3.01, index: 2.6, indexDecay: 0.09,
      dur: 0.34, detune: jitterCents(6), wave: p.waves.bell,
    });
    const g = p.gain(0);
    envAD(g.gain, t0, (0.2 / (1 + i * 0.18)) * v, 0.004, 0.34);
    p.chain(car, g, p.out);
    p.start(car, t0, t0 + 0.38);
    p.send(g, 0.3);
    p.send(g, 0.16, 'delay');
    end = t0 + 0.4;
  });

  // Shimmer: a high, quiet noise sparkle riding the top of the arpeggio.
  const sp = noiseBurst(p, {
    t0: t, from: 5200, to: 9000, q: 1.4, type: 'bandpass',
    dur: 0.3, peak: 0.05 * v, attack: 0.01,
  });
  sp.connect(p.out);
  p.send(sp, 0.4);
  return end;
}

/** Punchy transient plus a short descending blip. */
function enemyHit(p, t, o) {
  const v = o.volume ?? 1;
  const hit = noiseBurst(p, {
    t0: t + LAYER.b, from: 1800, to: 600, q: 1.1, type: 'bandpass',
    dur: 0.075, peak: 0.24 * v, attack: 0.001,
  });
  hit.connect(p.out);
  // A bright crack on the front. Without it the hit is all mid-range and gets
  // buried the moment the drums come in.
  const crack = noiseBurst(p, {
    t0: t, from: 9500, to: 5000, q: 1.0, type: 'bandpass',
    dur: 0.075, peak: 0.4 * v, attack: 0.0004,
  });
  crack.connect(p.out);

  const f0 = 760 * rrange(0.94, 1.08);
  const tb = t + LAYER.a;
  const blip = p.osc(p.waves.softSquare, f0);
  sweep(blip.frequency, tb, f0, f0 * 0.42, 0.085);
  const g = p.gain(0);
  envAD(g.gain, tb, 0.2 * v, 0.003, 0.11);
  p.chain(blip, g, p.out);
  p.start(blip, tb, tb + 0.16);

  const tc = t + LAYER.c;
  const thump = p.osc('sine', 150);
  sweep(thump.frequency, tc, 150, 70, 0.08);
  const tg = p.gain(0);
  envAD(tg.gain, tc, 0.16 * v, 0.002, 0.09);
  p.chain(thump, tg, p.out);
  p.start(thump, tc, tc + 0.14);
  return t + 0.2;
}

/** Comedic ascending pop when an enemy is defeated. */
function enemyDefeated(p, t, o) {
  const v = o.volume ?? 1;
  const pop = noiseBurst(p, {
    t0: t, from: 2600, to: 900, q: 0.8, type: 'bandpass',
    dur: 0.06, peak: 0.2 * v, attack: 0.001,
  });
  pop.connect(p.out);

  const f0 = 330 * rrange(0.96, 1.05);
  const tq = t + LAYER.b;
  const squeak = p.osc('triangle', f0);
  sweep(squeak.frequency, tq, f0, f0 * 3.6, 0.13);
  // Wobble on the way up reads as cartoon elasticity.
  const vib = p.osc('sine', 22);
  const vibG = p.gain(38);
  p.chain(vib, vibG);
  vibG.connect(squeak.frequency);
  const g = p.gain(0);
  envAD(g.gain, tq, 0.22 * v, 0.006, 0.2);
  p.chain(squeak, g, p.out);
  p.start(squeak, tq, tq + 0.26);
  p.start(vib, tq, tq + 0.26);

  // Confetti sparkle on the tail.
  const bell = fmVoice(p, {
    t0: t + 0.1, freq: mtof(scaleNote(11, KEY_ROOT)), ratio: 2.5, index: 2,
    indexDecay: 0.07, dur: 0.28, wave: p.waves.bell,
  });
  const bg = p.gain(0);
  envAD(bg.gain, t + 0.1, 0.11 * v, 0.004, 0.28);
  p.chain(bell, bg, p.out);
  p.start(bell, t + 0.1, t + 0.4);
  p.send(bg, 0.3);
  return t + 0.42;
}

/** Vacuum-suck whoosh when something gets pulled in. */
function enemyInhaled(p, t, o) {
  const v = o.volume ?? 1;
  const ta = t + LAYER.a;
  const air = p.noise(rrange(0.95, 1.08));
  const band = p.filter('bandpass', 6500, 3.0);
  sweep(band.frequency, ta, 6500, 320, 0.26);
  const g = p.gain(0);
  envAD(g.gain, ta, 0.2 * v, 0.02, 0.28);
  p.chain(air, band, g, p.out);
  p.start(air, ta, ta + 0.36);

  // A fixed bright layer alongside the sweep. With only the sweep, everything
  // above 6 kHz is gone within 40 ms and the rest of the cue is pure mud.
  const shimmer = noiseBurst(p, {
    t0: t, from: 8000, to: 5000, q: 1.0, type: 'bandpass',
    dur: 0.2, peak: 0.26 * v, attack: 0.008,
  });
  shimmer.connect(p.out);

  // A falling tone glued to the whoosh gives the swallow a pitch centre.
  const tt = t + LAYER.c;
  const tone = p.osc(p.waves.softSquare, 620);
  sweep(tone.frequency, tt, 620, 130, 0.24);
  const tg = p.gain(0);
  envAD(tg.gain, tt, 0.1 * v, 0.01, 0.26);
  p.chain(tone, tg, p.out);
  p.start(tone, tt, tt + 0.32);

  // Stops at 140 Hz rather than 95, and smaller. Following the pitch into the
  // basement made this tail 62% of the cue's energy and dragged the whole
  // whoosh under the bass line.
  const gulp = p.osc('sine', 210);
  sweep(gulp.frequency, t + 0.24, 210, 140, 0.07);
  const gg = p.gain(0);
  envAD(gg.gain, t + 0.24, 0.1 * v, 0.004, 0.09);
  p.chain(gulp, gg, p.out);
  p.start(gulp, t + 0.24, t + 0.38);
  return t + 0.4;
}

/**
 * Taking a hit: a bright comedic yelp.
 *
 * Kirby's damage cue is a cartoon squawk, not a horror sting. The previous
 * version ran the squeal through a vowel bank and then a low-pass, which left a
 * muffled 700 Hz buzz with no energy above 6 kHz at all. This one keeps the
 * squeal open, adds an FM squawk for the bite, and puts a real transient on the
 * front so the hit registers before the pitch does.
 */
function damaged(p, t, o) {
  const v = o.volume ?? 1;
  const f0 = 900 * rrange(0.94, 1.07);

  // Bright transient: this is what says "impact" before anything else lands.
  const crack = noiseBurst(p, {
    t0: t, from: 9500, to: 5500, q: 0.9, type: 'bandpass',
    dur: 0.08, peak: 0.7 * v, attack: 0.0005,
  });
  crack.connect(p.out);

  // The yelp: a fast fall with a wobble, kept open rather than filtered down.
  const ts = t + LAYER.b;
  const squeal = p.osc(p.waves.softSquare, f0, jitterCents(20));
  sweep(squeal.frequency, ts, f0 * 1.15, f0 * 0.4, 0.24);
  const wob = p.osc('sine', 30);
  const wobG = p.gain(55);
  p.chain(wob, wobG);
  wobG.connect(squeal.frequency);
  const vowel = formantBank(p, squeal, { t0: ts, from: 'a', to: 'e', time: 0.2, q: 3 });
  const sg = p.gain(0);
  envAD(sg.gain, ts, 0.34 * v, 0.003, 0.28);
  vowel.connect(sg);
  const direct = p.gain(0.8);          // keep the pitch clear through the bank
  squeal.connect(direct);
  direct.connect(sg);
  sg.connect(p.out);
  p.start(squeal, ts, ts + 0.34);
  p.start(wob, ts, ts + 0.34);

  // FM squawk an octave up: the metallic edge that makes it read as a yelp.
  const tq = t + LAYER.c;
  const squawk = fmVoice(p, {
    t0: tq, freq: f0 * 2, ratio: 1.87, index: 4, indexDecay: 0.08,
    dur: 0.16, wave: p.waves.bell,
  });
  const qg = p.gain(0);
  envAD(qg.gain, tq, 0.14 * v, 0.002, 0.16);
  p.chain(squawk, qg, p.out);
  p.start(squawk, tq, tq + 0.2);

  // A short dissonant stab underneath for weight, no longer the main event.
  const td = t + LAYER.d;
  const lp = p.filter('lowpass', 3400, 1.0);
  const bg = p.gain(0);
  envAD(bg.gain, td, 0.18 * v, 0.002, 0.18);
  p.chain(lp, bg, p.out);
  for (const [mult, det, amp] of [[1, -8, 1], [1.06, 11, 0.7]]) {
    const osc = p.osc('triangle', mtof(KEY_ROOT) * mult, det + jitterCents(8));
    const og = p.gain(amp * 0.6);
    p.chain(osc, og, lp);
    p.start(osc, td, td + 0.22);
  }
  p.send(sg, 0.22);
  return t + 0.4;
}

/** Rising four-note flourish when a copy ability is taken. */
function abilityChanged(p, t, o) {
  const v = o.volume ?? 1;
  const steps = [4, 7, 9, 11];
  let end = t;
  steps.forEach((idx, i) => {
    const t0 = t + i * 0.075;
    const freq = mtof(scaleNote(idx, KEY_ROOT));
    const car = fmVoice(p, {
      t0, freq, ratio: 2.0, index: 1.8, indexDecay: 0.12, dur: 0.4,
      wave: p.waves.bell, detune: jitterCents(5),
    });
    const g = p.gain(0);
    envAD(g.gain, t0, 0.17 * v, 0.005, 0.42);
    p.chain(car, g, p.out);
    p.start(car, t0, t0 + 0.46);
    p.send(g, 0.34);
    end = t0 + 0.48;
  });
  const sw = noiseBurst(p, {
    t0: t, from: 700, to: 6500, q: 1.1, type: 'bandpass',
    dur: 0.3, peak: 0.07 * v, attack: 0.05,
  });
  sw.connect(p.out);
  return end;
}

/**
 * Boss taking damage: a metallic clang with a comedic squash on the end.
 *
 * The previous version was three static sawtooths through a fixed low-pass --
 * a horror drone with nothing above 6 kHz. A boss in this franchise is still
 * funny, so the hit is an FM bell (bright, metallic, pitched) plus a pitched
 * body that drops and squashes, and it gets more strained as health falls.
 */
function bossHealth(p, t, o) {
  const v = o.volume ?? 1;
  const hp = Math.min(1, Math.max(0, o.health ?? 0.5));
  const tension = 1 - hp;
  const base = mtof(KEY_ROOT - 12) * (1 + tension * 0.1);

  // Metallic FM clang: the index envelope is what makes it read as struck metal.
  // The carrier sits two octaves above the body -- at the body's own octave the
  // sidebands never reach the top end and the whole cue reads as a drone.
  const tc = t + LAYER.b;
  const clang = fmVoice(p, {
    t0: tc, freq: base * 8, ratio: 2.73 + tension * 0.4, index: 7 + tension * 5,
    indexDecay: 0.18, dur: 0.7, wave: p.waves.bell,
  });
  const cg = p.gain(0);
  envAD(cg.gain, tc, 0.16 * v, 0.002, 0.55 + tension * 0.2);
  p.chain(clang, cg, p.out);
  p.start(clang, tc, tc + 0.8);
  p.send(cg, 0.36);

  // A shorter, brighter strike layer on top of it.
  const tsk = t + LAYER.a;
  const strike = fmVoice(p, {
    t0: tsk, freq: base * 16, ratio: 1.71, index: 6, indexDecay: 0.06,
    dur: 0.24, wave: p.waves.bell,
  });
  const sg = p.gain(0);
  envAD(sg.gain, tsk, 0.08 * v, 0.001, 0.22);
  p.chain(strike, sg, p.out);
  p.start(strike, tsk, tsk + 0.3);

  // Body: drops and squashes, so it lands rather than droning.
  const tb = t + LAYER.d;
  const lp = p.filter('lowpass', 1200 + tension * 3200, 2.2);
  sweep(lp.frequency, tb, 4000, 900 + tension * 1400, 0.2);
  const bg = p.gain(0);
  envAD(bg.gain, tb, 0.2 * v, 0.003, 0.4 + tension * 0.2);
  p.chain(lp, bg, p.out);
  for (const [mult, det] of [[1, 0], [1.5, -14], [2, 9]]) {
    const osc = p.osc(p.waves.softSquare, base * mult, det);
    sweep(osc.frequency, tb, base * mult, base * mult * 0.72, 0.22);
    const og = p.gain(mult === 1 ? 0.55 : 0.24);
    p.chain(osc, og, lp);
    p.start(osc, tb, tb + 0.6);
  }

  const imp = noiseBurst(p, {
    t0: t, from: 9000, to: 900, q: 0.6, type: 'bandpass',
    dur: 0.16, peak: 0.22 * v, attack: 0.001,
  });
  imp.connect(p.out);
  return t + 0.85;
}

/** Reappearing: a rising run with a struck sparkle on every step. */
function respawn(p, t, o) {
  const v = o.volume ?? 1;
  const steps = [0, 4, 7, 11, 14];
  let end = t;
  steps.forEach((idx, i) => {
    const t0 = t + i * 0.09;
    const freq = mtof(scaleNote(idx, KEY_ROOT));
    const osc = p.osc(p.waves.toyLead, freq, jitterCents(6));
    const g = p.gain(0);
    envAD(g.gain, t0, 0.16 * v, 0.01, 0.3);
    p.chain(osc, g, p.out);
    p.start(osc, t0, t0 + 0.34);
    p.send(g, 0.28);

    // An FM partial and a noise tick per step. A bare oscillator through an AD
    // envelope is a test tone, and five in a row is a test-tone scale.
    const tb = t0 + LAYER.b;
    const bell = fmVoice(p, {
      t0: tb, freq: freq * 2, ratio: 2.5, index: 2.2, indexDecay: 0.06,
      dur: 0.22, wave: p.waves.bell,
    });
    const bg = p.gain(0);
    envAD(bg.gain, tb, 0.07 * v, 0.003, 0.22);
    p.chain(bell, bg, p.out);
    p.start(bell, tb, tb + 0.26);

    const tick = noiseBurst(p, {
      t0, from: freq * 9, to: freq * 5, q: 0.8, type: 'bandpass',
      dur: 0.02, peak: 0.16 * v, attack: 0.0006,
    });
    tick.connect(p.out);
    end = t0 + 0.36;
  });
  // A rising shimmer tying the run together.
  const sh = noiseBurst(p, {
    t0: t, from: 4500, to: 9000, q: 1.0, type: 'bandpass',
    dur: 0.42, peak: 0.15 * v, attack: 0.04,
  });
  sh.connect(p.out);
  return end;
}

/**
 * Crisp, tuned UI blip. `deg` picks the scale index.
 *
 * Three layers, because a single oscillator through an envelope is a chiptune
 * blip and first-party UI is not: an FM bell for the pitch, a soft mallet body
 * underneath it, and a noise tick on the very front for the "click".
 */
function uiBlip(p, t, o, deg, dur, amp) {
  const v = o.volume ?? 1;
  const freq = mtof(scaleNote(deg, KEY_ROOT + 12));
  const g = p.gain(0);
  envAD(g.gain, t, amp * v, 0.003, dur);
  g.connect(p.out);

  const tbl = t + LAYER.a;
  const bell = fmVoice(p, {
    t0: tbl, freq, ratio: 3.0, index: 1.6, indexDecay: dur * 0.4,
    dur: dur + 0.02, wave: p.waves.bell, detune: jitterCents(4),
  });
  const bg = p.gain(0.75);
  p.chain(bell, bg, g);
  p.start(bell, tbl, tbl + dur + 0.05);

  const tb = t + LAYER.b;
  const body = p.osc('triangle', freq / 2, jitterCents(4));
  const bodyG = p.gain(0);
  envAD(bodyG.gain, tb, 0.4, 0.002, dur * 0.6);
  p.chain(body, bodyG, g);
  p.start(body, tb, tb + dur + 0.03);

  // Floored in absolute terms, not just as a ratio: the lower menu cues sit
  // near 500 Hz, so a purely pitch-tracking tick left them with no top end.
  const tick = noiseBurst(p, {
    t0: t, from: Math.max(7000, freq * 7), to: Math.max(4000, freq * 4),
    q: 0.9, type: 'bandpass', dur: 0.014, peak: 0.8, attack: 0.0006,
  });
  tick.connect(g);

  p.send(g, 0.45);
  return { end: t + dur + 0.06, gain: g };
}

function menuMove(p, t, o) { return uiBlip(p, t, o, 4, 0.06, 0.16).end; }

function menuConfirm(p, t, o) {
  uiBlip(p, t, o, 4, 0.07, 0.16);
  const r = uiBlip(p, t + 0.062, o, 7, 0.16, 0.18);
  return r.end;
}

function menuCancel(p, t, o) {
  uiBlip(p, t, o, 2, 0.06, 0.14);
  const r = uiBlip(p, t + 0.055, o, -2, 0.14, 0.15);
  return r.end;
}

/** Losing a copy ability: the `abilityChanged` flourish, falling. */
function abilityLost(p, t, o) {
  const v = o.volume ?? 1;
  const steps = [9, 7, 4, 2];
  let end = t;
  steps.forEach((idx, i) => {
    const t0 = t + i * 0.07;
    const freq = mtof(scaleNote(idx, KEY_ROOT));
    const osc = p.osc(p.waves.toyLead, freq, jitterCents(6));
    // Opens rather than closes: a falling figure already reads as loss, and
    // filtering it down as well just makes it inaudible over the music.
    const lp = p.filter('lowpass', 6000, 0.8);
    const g = p.gain(0);
    envAD(g.gain, t0, 0.13 * v, 0.006, 0.26);
    p.chain(osc, lp, g, p.out);
    p.start(osc, t0, t0 + 0.3);
    p.send(g, 0.22);

    // Each step gets a struck partial and a breath of air, so the flourish has
    // a texture instead of being four filtered oscillators in a row.
    const tb = t0 + LAYER.b;
    const bell = fmVoice(p, {
      t0: tb, freq: freq * 2, ratio: 1.41, index: 3, indexDecay: 0.05,
      dur: 0.2, wave: p.waves.bell,
    });
    const bg = p.gain(0);
    envAD(bg.gain, tb, 0.05 * v, 0.003, 0.2);
    p.chain(bell, bg, p.out);
    p.start(bell, tb, tb + 0.24);

    const air = noiseBurst(p, {
      t0, from: 8000, to: 4500, q: 1.0, type: 'bandpass',
      dur: 0.05, peak: 0.13 * v, attack: 0.002,
    });
    air.connect(p.out);
    end = t0 + 0.32;
  });
  return end;
}

/** Spitting the held enemy out: a sharp air release plus a departing whoosh. */
function spit(p, t, o) {
  const v = o.volume ?? 1;
  // Bright from the first sample. Sweeping *up* to 5.2 kHz over 130 ms meant
  // the air only arrived once the envelope had already spent itself, so a cue
  // documented as "a sharp air release" measured 0.1% above 6 kHz on its onset.
  const burst = noiseBurst(p, {
    t0: t, from: 7000, to: 1600, q: 0.8, type: 'bandpass',
    dur: 0.16, peak: 0.26 * v, attack: 0.0008,
  });
  burst.connect(p.out);
  const hiss = noiseBurst(p, {
    t0: t + LAYER.a, from: 8000, to: 4000, q: 1.0, type: 'bandpass',
    dur: 0.09, peak: 0.24 * v, attack: 0.0005,
  });
  hiss.connect(p.out);
  // Starts higher and quieter than instinct suggests: at 240 Hz and full level
  // this body carried a fifth of the cue's energy below 300 Hz and buried the
  // air burst that the effect is actually named after.
  const f0 = 420 * rrange(0.95, 1.06);
  const tb = t + LAYER.c;
  const body = p.osc(p.waves.softSquare, f0);
  sweep(body.frequency, tb, f0, f0 * 2.6, 0.09);
  const g = p.gain(0);
  envAD(g.gain, tb, 0.12 * v, 0.003, 0.13);
  p.chain(body, g, p.out);
  p.start(body, tb, tb + 0.2);
  // Doppler-ish tail: the projectile leaving.
  const away = noiseBurst(p, {
    t0: t + 0.06, from: 3200, to: 900, q: 2.2, type: 'bandpass',
    dur: 0.22, peak: 0.09 * v, attack: 0.02,
  });
  away.connect(p.out);
  p.send(g, 0.4);
  return t + 0.32;
}

/** Swallow: a comic descending gulp. */
function swallow(p, t, o) {
  const v = o.volume ?? 1;
  const f0 = 300 * rrange(0.95, 1.06);
  // The gulp sits at 450 -> 280 Hz and is barely there. Two earlier attempts
  // moved its floor around *inside* the sub-300 band, which by construction
  // cannot lift anything above 300 Hz -- the cue stayed 74-81% sub-300 either
  // way. The throat band-pass carries the character; this is a hint of pitch.
  const gulpHz = 400 * rrange(0.96, 1.05);
  const gulp = p.osc('sine', gulpHz);
  sweep(gulp.frequency, t, gulpHz, gulpHz * 0.6, 0.16);
  const g = p.gain(0);
  envAD(g.gain, t, 0.13 * v, 0.008, 0.15);
  p.chain(gulp, g, p.out);
  p.start(gulp, t, t + 0.26);
  // The throat noise stops in the mid band rather than following the pitch all
  // the way down -- chasing it down left the whole gulp under 300 Hz, where it
  // disappeared into the bass line.
  const throat = noiseBurst(p, {
    t0: t + LAYER.b, from: 5200, to: 900, q: 1.8, type: 'bandpass',
    dur: 0.44, peak: 0.26 * v, attack: 0.006,
  });
  throat.connect(p.out);
  // A swallow still needs a front edge, or it is only a descending tone.
  const edge = noiseBurst(p, {
    t0: t + LAYER.a, from: 6500, to: 2600, q: 1.1, type: 'bandpass',
    dur: 0.06, peak: 0.22 * v, attack: 0.0006,
  });
  edge.connect(p.out);

  // No sub-bass "pop" tail: at 150 -> 90 Hz it was pure sub-300 energy on a cue
  // that had no business being there.
  return t + 0.3;
}

/** Catching an enemy in the vortex: a bright snap. */
function captured(p, t, o) {
  const v = o.volume ?? 1;
  const snap = noiseBurst(p, {
    t0: t, from: 2600, to: 1100, q: 1.6, type: 'bandpass',
    dur: 0.05, peak: 0.18 * v, attack: 0.001,
  });
  snap.connect(p.out);
  const tb = t + LAYER.b;
  const car = fmVoice(p, {
    t0: tb, freq: mtof(scaleNote(9, KEY_ROOT)), ratio: 2.5, index: 2.2,
    indexDecay: 0.05, dur: 0.2, wave: p.waves.bell,
  });
  const g = p.gain(0);
  envAD(g.gain, tb, 0.14 * v, 0.003, 0.2);
  p.chain(car, g, p.out);
  p.start(car, tb, tb + 0.24);
  p.send(g, 0.28);
  return t + 0.26;
}

/**
 * Level-clear fanfare: a rising run into a IV - V - I cadence in the key of the
 * score, so it lands as the end of the tune rather than a separate jingle.
 */
function fanfare(p, t, o) {
  const v = o.volume ?? 1;
  const lead = (idx, t0, dur, amp) => {
    const osc = p.osc(p.waves.toyLead, mtof(scaleNote(idx, KEY_ROOT)), jitterCents(4));
    const g = p.gain(0);
    envADSR(g.gain, t0, amp * v, { a: 0.008, d: 0.06, s: 0.7, hold: dur, r: 0.16 });
    p.chain(osc, g, p.out);
    p.start(osc, t0, t0 + dur + 0.24);
    p.send(g, 0.3);
  };
  const stab = (base, t0, dur, amp) => {
    // The three voices of a chord are the most obviously stackable thing in the
    // file: struck together they triple the peak for no extra loudness.
    const spread = [0, LAYER.b, LAYER.d];
    [base, base + 2, base + 4].forEach((idx, i) => {
      const ts = t0 + spread[i];
      const car = fmVoice(p, {
        t0: ts, freq: mtof(scaleNote(idx, KEY_ROOT)), ratio: 2.0, index: 1.4,
        indexDecay: 0.1, dur, wave: p.waves.bell,
      });
      const g = p.gain(0);
      envADSR(g.gain, ts, amp * v, { a: 0.005, d: 0.08, s: 0.6, hold: dur * 0.5, r: 0.25 });
      p.chain(car, g, p.out);
      p.start(car, ts, ts + dur + 0.3);
      p.send(g, 0.34);
    });
  };
  /**
   * Glockenspiel, two octaves above the cadence.
   *
   * This is the level-clear reward and it measured 0.2% of its energy above
   * 6 kHz and *nothing* above 10 kHz -- the brightest moment in the game was
   * the dullest cue in the file. A bandpassed noise sweep cannot fix that on
   * its own; what makes a fanfare glitter is a struck metal line up where
   * nothing else in the mix ever plays.
   */
  const glint = (idx, t0, amp, ring = 0.7) => {
    const f = mtof(scaleNote(idx, KEY_ROOT));
    const osc = p.osc(p.waves.glass, f, jitterCents(6));
    const mod = p.osc('sine', f * 3.47);
    const modG = p.gain(0);
    envAD(modG.gain, t0, f * 0.8, 0.001, 0.05);
    mod.connect(modG);
    modG.connect(osc.frequency);
    const g = p.gain(0);
    envAD(g.gain, t0, amp * v, 0.002, ring);
    p.chain(osc, g, p.out);
    p.start(mod, t0, t0 + 0.09);
    p.start(osc, t0, t0 + ring + 0.06);
    p.send(g, 0.34);
  };

  [7, 9, 11, 12].forEach((idx, i) => lead(idx, t + i * 0.075, 0.07, 0.13));
  // The run is doubled two octaves up, one layer offset behind it: the same
  // notes, but they put 5-16 kHz content under the whole approach instead of
  // leaving the first third of the cue with no top at all.
  [7, 9, 11, 12].forEach((idx, i) => glint(idx + 14, t + i * 0.075 + LAYER.c, 0.12, 0.5));
  stab(3, t + 0.32, 0.14, 0.1);          // IV
  stab(4, t + 0.46, 0.14, 0.1);          // V
  stab(0, t + 0.60, 0.9, 0.12);          // I
  // Offset from the final stab: together they are the loudest instant in the
  // cue, and struck on the same sample they simply add peak.
  lead(14, t + 0.60 + LAYER.d, 0.85, 0.14);
  // Rising glockenspiel cascade over the tonic chord, then a held top note.
  // The cascade keeps climbing past the top of the chord: a level-clear jingle
  // that stops where the harmony stops sounds like a phrase ending, and this
  // one has to sound like a reward.
  // Scale index 16 is 1319 Hz and 28 is 4699 Hz. The first attempt started this
  // cascade at 14 -- 1109 Hz, the melody's own octave -- so the part described
  // as "two octaves above the cadence" was in fact doubling it, which is why
  // the cue still measured duller up top than the footstep sound.
  [16, 18, 21, 23, 25, 28].forEach((idx, i) => glint(idx, t + 0.60 + i * 0.05, 0.125, 0.9));
  glint(30, t + 0.60 + LAYER.b, 0.075, 1.2);

  // A cymbal-bell shimmer: discrete inharmonic partials in the top two octaves
  // over a long decay. Noise alone up here reads as a hiss; struck metal reads
  // as sparkle, and the difference is whether the content is discrete.
  //
  // This is what makes the cue the brightest thing in the game rather than
  // merely brighter than it was. Measured after the first attempt, `fanfare`
  // still had a *lower* share above 10 kHz than the exploration loop -- which
  // is exactly backwards for the moment the game rewards the player.
  const air = p.gain(0);
  envAD(air.gain, t + 0.56, 0.19 * v, 0.012, 1.4);
  [5900, 7810, 9640, 11900, 14200, 16400].forEach((hz, i) => {
    const o = p.osc('sine', hz * rrange(0.985, 1.015));
    const og = p.gain([1, 0.86, 0.74, 0.6, 0.44, 0.3][i]);
    p.chain(o, og, air);
    p.start(o, t + 0.56, t + 0.56 + 1.4);
  });
  air.connect(p.out);
  p.send(air, 0.4);

  // The noise sweep now runs into the top octave rather than stopping at
  // 9.5 kHz, so the cue actually has air above 10 kHz where it had none.
  const shimmer = noiseBurst(p, {
    t0: t + 0.58, from: 5000, to: 13500, q: 1.0, type: 'bandpass',
    dur: 0.8, peak: 0.09 * v, attack: 0.03,
  });
  shimmer.connect(p.out);
  // A second, purely-air sweep riding above it. Together with the partial bank
  // this is the only place in the game with sustained content past 12 kHz, and
  // that is deliberate: it is the sound of the level being cleared.
  const top = noiseBurst(p, {
    t0: t + 0.30, from: 9000, to: 15500, q: 0.9, type: 'bandpass',
    dur: 1.1, peak: 0.09 * v, attack: 0.05,
  });
  top.connect(p.out);
  return t + 2;
}

/** Game over: a slow descending swell that gives up. */
function gameOver(p, t, o) {
  const v = o.volume ?? 1;
  const steps = [7, 4, 2, -1];
  let end = t;
  steps.forEach((idx, i) => {
    const t0 = t + i * 0.24;
    const f = mtof(scaleNote(idx, KEY_ROOT));
    // The swell itself is the instrument, not the tap on top of it: twelve
    // detuned triangles with a sub-octave underneath put 85% of this cue
    // between 300 Hz and 1 kHz whatever the transient does. The sub-octave is
    // gone and the body is a wavetable with real upper partials.
    const spread = [0, LAYER.c];
    [[1, 0, 1], [1, -12, 0.7]].forEach(([mult, det, amp], i) => {
      const ts = t0 + spread[i];
      const osc = p.osc(p.waves.toyLead, f * mult, det);
      const g = p.gain(0);
      envADSR(g.gain, ts, 0.1 * amp * v, { a: 0.03, d: 0.12, s: 0.6, hold: 0.16, r: 0.35 });
      p.chain(osc, g, p.out);
      p.start(osc, ts, ts + 0.7);
      if (i === 0) p.send(g, 0.4);
    });
    // A struck partial and a soft mallet tap on each step: detuned triangles
    // alone have almost nothing above the fundamental and read as a test tone.
    const tb = t0 + LAYER.a;
    const bell = fmVoice(p, {
      t0: tb, freq: f * 4, ratio: 1.41, index: 3, indexDecay: 0.14,
      dur: 0.5, wave: p.waves.bell,
    });
    const bg = p.gain(0);
    envAD(bg.gain, tb, 0.09 * v, 0.004, 0.5);
    p.chain(bell, bg, p.out);
    p.start(bell, tb, tb + 0.58);
    // Sweeping 9 k -> 2.5 k across the burst's whole 70 ms left it bright for
    // about 15 ms and dull for the rest; holding the band open is what makes
    // the cue read as a struck sound rather than a hum.
    const tap = noiseBurst(p, {
      t0: t0 + LAYER.b, from: 7000, to: 4500, q: 1.0, type: 'bandpass',
      dur: 0.14, peak: 0.3 * v, attack: 0.0012,
    });
    tap.connect(p.out);
    end = t0 + 0.72;
  });
  return end;
}

/**
 * Footstep scuff.
 *
 * The most frequently heard sound in the game, so it has to be audible over the
 * score without ever competing with it. The way to do that is spectral, not
 * level: the body is deliberately small and sits above the kick's band rather
 * than inside it, and most of the energy lives in the scuff and grit layers
 * where nothing else in the mix is playing.
 */
function footstep(p, t, o) {
  const v = o.volume ?? 1;
  // Just enough body to imply weight -- any more and it fights the bass.
  // Sits at 230 Hz rather than 190, and small. Lower than this it lands in the
  // kick's own band (130 -> 44 Hz) and stops reading as a footfall at all; at
  // its previous level it was the single largest band in the cue.
  // The randomised pitch has to be the sweep's `from`, not the oscillator's
  // constructor argument: `sweep` opens with `setValueAtTime`, which lands on
  // the first sounding sample and discards whatever the node was built with.
  // Every footstep in the game had an identical body pitch.
  const bodyHz = rrange(230, 285);
  const b = p.osc('sine', bodyHz);
  sweep(b.frequency, t, bodyHz, bodyHz * 0.88, 0.05);
  const g = p.gain(0);
  envAD(g.gain, t, 0.045 * v, 0.001, 0.06);
  p.chain(b, g, p.out);
  p.start(b, t, t + 0.07);

  // Scuff: the mid layer that carries the rhythm of a run cycle.
  const scuff = noiseBurst(p, {
    t0: t + LAYER.b, from: rrange(1600, 2600), to: rrange(700, 1100), q: 0.9,
    type: 'bandpass', dur: 0.07, peak: 0.56 * v, attack: 0.0008,
  });
  scuff.connect(p.out);

  // Grit: the top layer, and the one that actually cuts through the mix.
  const grit = noiseBurst(p, {
    t0: t + LAYER.a, from: rrange(5000, 7000), to: 3000, q: 1.2, type: 'bandpass',
    dur: 0.035, peak: 0.26 * v, attack: 0.0005,
  });
  grit.connect(p.out);
  return t + 0.1;
}

/**
 * The registry. Keys are the names accepted by `AudioEngine.play`.
 * @type {Record<string, (p:import('./Synth.js').Patch, t:number, o:object)=>number>}
 */
export const SFX = {
  jump,
  land,
  puff,
  exhale,
  star,
  enemyHit,
  enemyDefeated,
  enemyInhaled,
  damaged,
  abilityChanged,
  bossHealth,
  respawn,
  menuMove,
  menuConfirm,
  menuCancel,
  footstep,
  abilityLost,
  spit,
  swallow,
  captured,
  fanfare,
  gameOver,
};

export { inhaleLoop };
