/**
 * Musical material for the score.
 *
 * Keeping the key, scale, harmony and melody in one place lets the UI sounds be
 * tuned to the same key as the music -- menu blips that land on a chord tone of
 * whatever is currently playing are a large part of why first-party Nintendo
 * audio feels "designed" rather than assembled.
 */

/** Major scale, semitone offsets from the tonic. */
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Tonic of the main theme: D4 (MIDI 62). Bright without being shrill. */
export const KEY_ROOT = 62;

/**
 * Scale index -> MIDI, where index 7 is the octave above index 0 and negative
 * indices walk down. Everything melodic in this file is written in this space
 * so the whole score can be transposed by changing one number.
 */
export function scaleNote(index, root = KEY_ROOT) {
  const oct = Math.floor(index / 7);
  const deg = index - oct * 7;
  return root + oct * 12 + MAJOR[deg];
}

/**
 * Diatonic chord: `degree` 0..6 (I..vii), built in thirds from the scale.
 * `size` 3 = triad, 4 = seventh. Returned as scale indices, not MIDI, so
 * voicing code can move them around freely.
 */
export function chordIndices(degree, size = 3) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(degree + i * 2);
  return out;
}

/**
 * 16-bar form, two eight-bar halves.
 *
 * A: I - vi - IV - V - I - vi - ii - V   (a plain, singable answer phrase)
 * B: IV - V - iii - vi - IV - V - I - V  (the "royal road" turn, the single
 *    most Japanese-pop progression there is and the reason the B section lifts)
 *
 * `sev` marks bars voiced as sevenths, which is what keeps the ii and V bars
 * from sounding like a nursery rhyme.
 */
export const PROGRESSION = [
  { deg: 0, sev: false }, { deg: 5, sev: false }, { deg: 3, sev: false }, { deg: 4, sev: false },
  { deg: 0, sev: false }, { deg: 5, sev: false }, { deg: 1, sev: true }, { deg: 4, sev: true },
  { deg: 3, sev: false }, { deg: 4, sev: false }, { deg: 2, sev: false }, { deg: 5, sev: false },
  { deg: 3, sev: false }, { deg: 4, sev: false }, { deg: 0, sev: false }, { deg: 4, sev: true },
];

/**
 * The tune. One array per bar; each note is `[scaleIndex, beat, durationBeats]`
 * with beats measured from the start of that bar in 4/4.
 *
 * Structure (this is a written melody, not a generator):
 *   bars 0-1  statement          bars 2-3  answer, cadencing on the V
 *   bars 4-5  statement repeated bars 6-7  variation + rising launch
 *   bars 8-11 B section, sits a sixth higher and holds longer notes
 *   bars 12-15 climb, resolve onto the tonic, then a turnaround back to bar 0
 */
export const MELODY = [
  // -- A: statement ---------------------------------------------------------
  [[4, 0, 0.5], [7, 0.5, 0.5], [9, 1, 1], [7, 2, 0.5], [4, 2.5, 0.5], [2, 3, 1]],
  [[5, 0, 0.5], [9, 0.5, 0.5], [7, 1, 1], [5, 2, 1], [4, 3, 1]],
  // -- A: answer ------------------------------------------------------------
  [[3, 0, 0.5], [5, 0.5, 0.5], [7, 1, 0.5], [9, 1.5, 0.5], [10, 2, 2]],
  [[9, 0, 0.5], [8, 0.5, 0.5], [6, 1, 0.5], [4, 1.5, 0.5], [6, 2, 1], [4, 3, 1]],
  // -- A: statement repeated ------------------------------------------------
  [[4, 0, 0.5], [7, 0.5, 0.5], [9, 1, 1], [7, 2, 0.5], [4, 2.5, 0.5], [2, 3, 1]],
  [[5, 0, 0.5], [9, 0.5, 0.5], [7, 1, 1], [5, 2, 1], [4, 3, 1]],
  // -- A: variation + launch ------------------------------------------------
  [[8, 0, 0.5], [10, 0.5, 0.5], [9, 1, 1], [8, 2, 0.5], [5, 2.5, 0.5], [4, 3, 1]],
  [[4, 0, 1], [6, 1, 1], [8, 2, 1], [9, 3, 1]],
  // -- B --------------------------------------------------------------------
  [[10, 0, 1], [9, 1, 0.5], [7, 1.5, 0.5], [9, 2, 1], [10, 3, 1]],
  [[11, 0, 1], [10, 1, 0.5], [9, 1.5, 0.5], [8, 2, 2]],
  [[9, 0, 0.5], [11, 0.5, 0.5], [13, 1, 1], [11, 2, 0.5], [9, 2.5, 0.5], [8, 3, 1]],
  [[12, 0, 1], [11, 1, 0.5], [9, 1.5, 0.5], [11, 2, 1], [9, 3, 1]],
  // -- B: climb and resolve -------------------------------------------------
  [[10, 0, 0.5], [12, 0.5, 0.5], [11, 1, 1], [9, 2, 0.5], [10, 2.5, 0.5], [11, 3, 1]],
  [[11, 0, 0.5], [10, 0.5, 0.5], [8, 1, 1], [6, 2, 0.5], [8, 2.5, 0.5], [9, 3, 1]],
  [[7, 0, 1], [9, 1, 1], [11, 2, 1], [9, 3, 0.5], [7, 3.5, 0.5]],
  [[8, 0, 0.5], [6, 0.5, 0.5], [4, 1, 1], [6, 2, 0.5], [8, 2.5, 0.5], [9, 3, 1]],
];

/**
 * Boss harmony, in the relative minor of the same key: vi - IV - V - vi twice,
 * with a ii substitution before the final dominant. Written as degrees of the
 * *major* scale so the whole system stays in one tonal space.
 */
export const BOSS_PROGRESSION = [
  { deg: 5, sev: false }, { deg: 3, sev: false }, { deg: 4, sev: false }, { deg: 5, sev: false },
  { deg: 5, sev: false }, { deg: 3, sev: false }, { deg: 1, sev: false }, { deg: 4, sev: true },
];

/**
 * Boss riff -- its own tune, not the exploration melody re-pointed at minor
 * chords. Re-using the main melody over vi-IV-V put a flat sixth on three
 * downbeats and a tritone on a fourth; this is written *against* the boss
 * chords, so every strong beat lands on a chord tone.
 *
 * Shape: a two-bar hammered motif, sequenced up through IV and V, a two-bar
 * climb, then the motif restated and turned around on the dominant.
 */
export const BOSS_MELODY = [
  [[12, 0, 0.5], [12, 0.5, 0.5], [14, 1, 0.5], [12, 1.5, 0.5], [9, 2, 1], [7, 3, 1]],
  [[10, 0, 0.5], [10, 0.5, 0.5], [12, 1, 0.5], [10, 1.5, 0.5], [7, 2, 1], [5, 3, 1]],
  [[11, 0, 0.5], [11, 0.5, 0.5], [13, 1, 0.5], [11, 1.5, 0.5], [8, 2, 1], [6, 3, 1]],
  [[12, 0, 1], [14, 1, 1], [12, 2, 1], [9, 3, 1]],
  [[12, 0, 0.5], [12, 0.5, 0.5], [14, 1, 0.5], [12, 1.5, 0.5], [9, 2, 1], [7, 3, 1]],
  [[10, 0, 0.5], [10, 0.5, 0.5], [12, 1, 0.5], [10, 1.5, 0.5], [7, 2, 1], [5, 3, 1]],
  [[8, 0, 0.5], [8, 0.5, 0.5], [10, 1, 0.5], [8, 1.5, 0.5], [12, 2, 1], [10, 3, 1]],
  [[11, 0, 0.5], [13, 0.5, 0.5], [11, 1, 0.5], [8, 1.5, 0.5], [6, 2, 1], [8, 3, 1]],
];

/**
 * Bass pattern as offsets *within the current chord*, expressed as scale-index
 * deltas from the chord root: 0 = root, 4 = fifth (two thirds up), 7 = octave.
 * `[delta, beat, dur, velocity]`. The skip up to the octave on the "and" of 1
 * is what makes the low end bounce instead of plod.
 */
export const BASS_PATTERN = [
  [0, 0, 0.5, 1.0],
  [7, 1.5, 0.35, 0.6],
  [4, 2, 0.5, 0.85],
  [0, 3, 0.35, 0.7],
  [7, 3.5, 0.35, 0.55],
];

/**
 * Denser eighth-note bass used from the action layer upward.
 *
 * The last note is deliberately short: at its original length its release ran
 * 32 ms past the bar line and sounded against the next chord's root a whole
 * tone away, down in the sub-bass where that reads purely as mud. The margin is
 * kept generous rather than marginal so a tempo change cannot silently
 * reintroduce the overlap.
 */
export const BASS_PATTERN_DRIVE = [
  [0, 0, 0.4, 1.0], [0, 0.5, 0.3, 0.5], [7, 1, 0.35, 0.7], [4, 1.5, 0.3, 0.55],
  [0, 2, 0.4, 0.95], [0, 2.5, 0.3, 0.7], [7, 3, 0.35, 0.7], [2, 3.5, 0.12, 0.6],
];
