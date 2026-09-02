/**
 * Inline SVG icon factory.
 *
 * No image files, no icon font, no emoji: every glyph is hand-authored
 * geometry in a shared 0..100 viewBox.
 *
 * ---------------------------------------------------------------------------
 * The drawing system. Every icon in this file obeys all of it; there is one
 * documented exception and it is called out at the bottom.
 *
 *  1. BOX       `viewBox="0 0 100 100"` everywhere, and every icon is placed
 *               through `sculpt()` with an optical `scale` so the *mass*
 *               matches across the set rather than the bounding box. Radial
 *               forms (stars, crystals) run smaller than blobby ones, which is
 *               how they end up looking the same size to the eye.
 *  2. KEYLINE   ONE weight, `KEY = 11`, for every icon including the ability
 *               glyphs. It is drawn as fill+stroke of the same geometry, so
 *               exactly `KEY/2` sits outside the form and the body fill paints
 *               back over the inside half. `sculpt()` divides the stroke by the
 *               optical scale so a scaled icon still lands on 11.
 *  3. CORNERS   One radius family via `roundedPath` (`R_SOFT`), plus round
 *               joins and caps on the keyline. Nothing here has a sharp corner.
 *  4. LIGHT     One direction, upper-left. The body ramp runs
 *               light -> saturated -> deep along (0.15,0) -> (0.85,1), the
 *               bevel is always up-left and the occlusion always down-right,
 *               and every `gloss()` rotation is locked to -34 +/- 6 degrees.
 *               The specular's PLACEMENT is held to the same light: measured as
 *               a bearing from each glyph's own ink centroid to the centroid of
 *               the pixels its highlight actually lifts, the five shipping
 *               abilities sit at 112-142 degrees against an ideal of 135. That
 *               is a maintained number -- placing a highlight by where a form
 *               happens to have room, rather than by where the light is, once
 *               spread it to 68 degrees and put three of the five under a lamp
 *               that was directly overhead.
 *  5. MODEL     A light bevel hugging the upper-left inner edge and an
 *               occlusion band hugging the lower-right one, both built as
 *               `shape MINUS offset shape` through masks so they follow any
 *               geometry, including unioned sub-paths. Both are eroded by
 *               `INSET` first, so nothing ever paints on the keyline and the
 *               outline holds one flat value all the way around. A bounce pool
 *               (centred, not offset) lifts the bottom edge -- kept under 7%
 *               so it never competes with the key as a second light.
 *  6. SPECULAR  Exactly one `gloss()` per icon -- a soft pool with a crisp core
 *               inside it. Interior detail is drawn as value steps in the
 *               icon's own hue family, never as a second white highlight.
 *               ONE specular is the rule; the specular being the icon's
 *               BRIGHTEST PIXEL is not, and the difference matters because
 *               reviewers keep reporting the second as a violation of the
 *               first. The bevel is white at `lite` laid over the ramp's
 *               lightest region -- it hugs the upper-left inner edge, which is
 *               where the body is palest -- so on any glyph whose specular
 *               cannot also sit up there, the bevel out-peaks the core by
 *               construction. Four of the five shipping abilities do peak on
 *               their specular; `ice` does not, and that is recorded at its own
 *               entry rather than treated as a defect to keep re-fixing.
 *  7. TIERS     Every icon factory takes an optional rendered size in CSS px
 *               and drops detail as that size falls, because a set authored at
 *               96 and shipped at 26 is mud:
 *                 FULL (>=48px)  everything above.
 *                 MID  (24-47px) bounce pool and the finer interior marks go;
 *                                bevel, occlusion and specular stay.
 *                 MIN  (<24px)   silhouette, the two LIGHTEST ramp stops so
 *                                the form separates from whatever it sits on,
 *                                ONE value step
 *                                (the occlusion band) and ONE specular core.
 *                                Only marks an icon cannot be identified
 *                                without -- Kirby's eyes, the sword's gold
 *                                hilt -- survive here.
 *               The keyline is also the one thing allowed to thicken as the
 *               icon shrinks (`KEY_TIER`), so it keeps landing above a device
 *               pixel instead of dissolving into the body.
 *
 * DOCUMENTED EXCEPTIONS. Every icon obeys all of the above except where it is
 * listed here; nothing else in the file gets to opt out silently.
 *
 *  a. `sparkleSvg` is emitted light rather than an object, so it skips the
 *     bevel and occlusion and is keyline -> body -> core. It does not skip the
 *     keyline: that is `INK` at `KEY` weight like everything else, because a
 *     rimless glyph dies on a blown-out sky.
 *  b. `kirbyFaceIcon` carries THREE white marks against rule 6's one -- the
 *     head gloss plus one catchlight in each eye. They are not a second light
 *     source: an eye is a wet sphere in its own right, and a Kirby with matte
 *     eyes reads as a skull, which is a misread this icon has been corrected
 *     for twice. All three obey rule 4 -- each sits up and LEFT of its OWN
 *     form's centre -- so the icon still has one light direction, and the head
 *     gloss is deliberately emitted BEFORE the face marks so it can never wash
 *     the eye it is supposed to sit beside. No other icon gets a second white.
 *  c. `crownIcon`'s gem and `buttonGlyph`'s accent ring carry their own stroke
 *     weights (4.5 / 4 / 14) rather than `KEY`. Both are outlines on interior
 *     DETAIL inside an icon that already owns exactly one keyline on its form,
 *     and both ship at ~14px, where a weight derived from the outer keyline and
 *     scaled down is under a device pixel. They are not second keylines.
 *  d. `sweep()`, which draws Beam's cap, closes its two ends without going
 *     through `roundedPath`. The tip cut is buried inside the pom, so it never
 *     reaches the silhouette at all. The hem does: it is a bowed arc meeting
 *     the two side edges at a shallow angle, and those two junctions are the
 *     only corners in the set not cut by the radius family. They are rounded in
 *     the render by the keyline's own round joins, which is why the hem still
 *     reads as one continuous curve -- but it is the outline doing it rather
 *     than the geometry, and that is the exception.
 *  e. `sword`'s specular reads at a 112-degree bearing from its own ink
 *     centroid where the other four sit at 132-142. This is a GEOMETRIC LIMIT,
 *     not a placement mistake, and it was measured rather than eyeballed: the
 *     blade is 24 units wide, so a pool placed on the true 135-degree line runs
 *     off its left edge, and `INSET` then erodes the overhang away. What
 *     survives is the pool's right half, and the surviving pixels' centroid is
 *     what the eye averages -- so the mark is pulled back toward the blade's
 *     axis no matter where the ellipse is nominally centred. Anything narrower
 *     than about 30 units has this problem; it is the price of a portrait
 *     silhouette, not something to keep re-placing.
 *
 * NOT DEFECTS. Two things in this file have now been reported as bugs by more
 * than one reviewer, so they are written down rather than re-argued:
 *
 *  * The two menu cursors are BOTH SOLID. `solidStarIcon` takes a fill and a
 *    stroke, and the menu ships two colourways through the same `sculpt` call:
 *    idle is cream with an `INK` keyline, selected is navy with a cream one. At
 *    row size the pale keyline around the dark selected cursor reads as an
 *    outline, and two separate reviewers have called it "hollow". It is not --
 *    it is the same solid geometry with its two colours swapped.
 *  * There is no per-hue keyline. Every icon strokes `INK` at `KEY`; the single
 *    override in the file is `solidStarIcon`'s `stroke` argument, which exists
 *    for the colourway above. A reviewer who reports that light icons get light
 *    keylines is describing a mechanism this file does not have.
 *
 * Gradient/mask ids are per-instance (`nid`) so several icons on screen never
 * cross-contaminate each other's paint servers.
 */

import { FONT_STACK } from './fonts.js';

let uid = 0;
const nid = (p) => `${p}${(uid++).toString(36)}`;

/** Matches `--kb-ink` in theme.js: one keyline colour across HUD and icons. */
const INK = '#1b1640';
const KEY = 11;
/** Keyline multiplier per tier: the outline is pinned toward a device-pixel
 *  floor rather than scaling linearly into nothing. */
const KEY_TIER = [1.22, 1.08, 1];
const R_SOFT = 7;

/** FULL = 2, MID = 1, MIN = 0. */
export function iconTier(px = 96) {
  return px >= 48 ? 2 : px >= 24 ? 1 : 0;
}
/** Bevel/occlusion offset. ~4.6% of the box holds a >=1px band down to 22px. */
const OFF = 4.6;
/** Modelling is eroded this far inside the form so the keyline stays flat. */
const INSET = 5;

// --- Geometry helpers ------------------------------------------------------

/**
 * Coordinate formatter, and this file's one guard rail.
 *
 * Every computed number that reaches a `d` attribute or a geometry attribute
 * goes through here, which makes it the single place a NaN can be caught before
 * it becomes a malformed path. It THROWS rather than substituting a fallback on
 * purpose: a coordinate quietly coerced to 0 draws a WRONG glyph, and a wrong
 * glyph is not reliably caught in review because a broken sub-path can sit
 * underneath another one and never be seen. Failing loudly at the moment the
 * geometry is built is strictly better than shipping a shape nobody drew.
 *
 * Throwing is safe here because nothing in this file is computed from user
 * data -- every coordinate comes from module constants and a pixel size -- so a
 * non-finite value is a programming error, not an input the HUD has to survive.
 * It also catches the one degenerate case `roundedPath` can hit on its own: two
 * coincident vertices divide by a zero edge length.
 */
const fixed = (v, dp) => {
  if (!Number.isFinite(v)) throw new RangeError(`icons.js: non-finite coordinate (${v})`);
  const m = 10 ** dp;
  return Math.round(v * m) / m;
};
const n2 = (v) => fixed(v, 2);
/** Mix a hex colour toward `INK` by `t`, for deriving a ramp from a flat fill. */
function shade(hex, t) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const k = [0x1b, 0x16, 0x40];
  return `#${c.map((v, i) => Math.round(v + (k[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
/** One decimal, for the many-sampled polylines `sweep` emits. */
const n1 = (v) => fixed(v, 1);

/**
 * Corner-rounded closed polygon. Each vertex is cut back along both incident
 * edges and bridged with a quadratic through the original corner, which is
 * what gives the whole set one radius family instead of per-icon guesses.
 * `r` may be an array to hold one corner tighter than the family default where
 * the form demands it -- a chevron's inner notch, a blade tip.
 */
function roundedPath(pts, r = R_SOFT) {
  const N = pts.length;
  const rad = (i) => (Array.isArray(r) ? r[i % r.length] : r);
  let d = '';
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(rad(i), da * 0.5);
    const rb = Math.min(rad(i), db * 0.5);
    const s1 = [p[0] + ((a[0] - p[0]) / da) * ra, p[1] + ((a[1] - p[1]) / da) * ra];
    const s2 = [p[0] + ((b[0] - p[0]) / db) * rb, p[1] + ((b[1] - p[1]) / db) * rb];
    d += `${i === 0 ? 'M' : 'L'}${n2(s1[0])} ${n2(s1[1])}Q${n2(p[0])} ${n2(p[1])} ${n2(s2[0])} ${n2(s2[1])}`;
  }
  return `${d}Z`;
}

/** Vertex ring for an n-pointed star, first point at `rot` degrees. */
function starPts(cx, cy, R, r, n = 5, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return pts;
}

/**
 * Sweep a tapering ribbon along a cubic Bezier and return it as one closed
 * path.
 *
 * A cone reads as a cone because it narrows the whole way. An outline authored
 * by hand as four Beziers does not guarantee that, and the cap this replaced
 * came out a CONSTANT-WIDTH TUBE -- reviewers named it a gooseneck tap, a chess
 * knight and a boot, never a hat. Deriving the outline from a spine and a width
 * function makes the taper a property of the construction instead of something
 * the drawing has to be trusted to preserve, and it makes the taper one number.
 *
 * The width ramp is `(1-t)^POW`, and the exponent is the whole trick. A linear
 * ramp spends its taper evenly in t, but t is not evenly spread over the form:
 * a cap whose spine LEANS carries its width change on the outer edge only, so
 * the inner edge stays put and comes out a plumb line. Measured on the linear
 * version, the inner edge moved 0.34 units of x over 15.5 units of y -- a dead
 * vertical wall down a fifth of the glyph -- and a shape with a wall down one
 * side is a boot or a mailbox, which is what two reviewers called it. A convex
 * ramp puts most of the narrowing into the bottom half, where the lean has not
 * yet started, so BOTH edges converge.
 *
 * `bow` bulges the base cut outward along the spine, so the hem is an arc
 * rather than a chord: a straight bottom edge under a curved form is a plinth.
 *
 * `k` selects a sub-ribbon hugging the OUTER (light-facing) edge: k=1 is the
 * whole form, k~0.35 is a lit plane running along its leading edge.
 */
function sweep(p, w0, w1, k = 1, steps = 15, pow = 1.6, bow = 0) {
  const at = (i, t) => {
    const u = 1 - t;
    return u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i];
  };
  const d1 = (i, t) => {
    const u = 1 - t;
    return 3 * u * u * (p[1][i] - p[0][i]) + 6 * u * t * (p[2][i] - p[1][i]) + 3 * t * t * (p[3][i] - p[2][i]);
  };
  // One decimal, not `n2`'s two, and 15 samples rather than 22. `sculpt` repeats
  // `geo` nine times -- keyline, body, and twice inside each of four masks -- so
  // every character in this path is paid for nine times over, and at 22 samples
  // and 2dp the cap's markup came to 14 KB against 4.4 KB for the next biggest
  // icon in the set. 0.1 of a unit is 0.016 of a device pixel on the shipping
  // chip, and 15 samples puts about 7 degrees between segments on a form whose
  // keyline already carries round joins.
  const lo = [], hi = [];
  let base = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dx = d1(0, t), dy = d1(1, t), m = Math.hypot(dx, dy) || 1;
    // Unit normal; the spine climbs, so -n is the outer (upper-left) side.
    const nx = -dy / m, ny = dx / m;
    const w = w1 + (w0 - w1) * (1 - t) ** pow;
    const ox = at(0, t) - nx * w, oy = at(1, t) - ny * w;
    if (i === 0) base = [at(0, t) - (dx / m) * bow, at(1, t) - (dy / m) * bow];
    lo.push(`${n1(ox)} ${n1(oy)}`);
    hi.push(`${n1(ox + nx * 2 * w * k)} ${n1(oy + ny * 2 * w * k)}`);
  }
  const close = bow ? `Q${n1(base[0])} ${n1(base[1])} ${lo[0]}` : '';
  return `M${lo.join('L')}L${hi.reverse().join('L')}${close}Z`;
}

/**
 * The one specular convention: soft pool + crisp core, upper-left.
 * `rot` is clamped to the set's single light direction.
 */
function gloss(cx, cy, rx, ry, rot = -34, soft = 0.28, hot = 0.62) {
  const a = Math.max(-40, Math.min(-28, rot));
  // Returned as [pool, core] so the MIN tier can keep the core and drop the
  // pool without any string surgery on finished markup.
  return [
    `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" transform="rotate(${a} ${cx} ${cy})" fill="#fff" opacity="${soft}"/>`,
    `<ellipse cx="${n2(cx - rx * 0.18)}" cy="${n2(cy - ry * 0.18)}" rx="${n2(rx * 0.5)}" ry="${n2(ry * 0.5)}" transform="rotate(${a} ${cx} ${cy})" fill="#fff" opacity="${hot}"/>`,
  ];
}

/**
 * Normalise `extra` into per-tier markup. A bare string survives FULL and MID
 * and is dropped at MIN; pass `{ full, mid, min }` when an icon needs a
 * different set of marks at each size -- `mid` falls back to `full`, `min`
 * defaults to nothing.
 */
function tierExtra(extra, tier) {
  if (!extra) return '';
  if (typeof extra === 'string') return tier > 0 ? extra : '';
  return (tier === 2 ? extra.full : tier === 1 ? extra.mid ?? extra.full : extra.min) ?? '';
}

/**
 * Turn flat geometry into a lit object.
 *
 * `geo` must be a string of bare shape elements (no fill/stroke attributes) --
 * it is reused verbatim for the keyline, the body, the erosion mask and the
 * two contour masks, which is exactly why every icon ends up modelled the same
 * way. `ramp` is a three-stop array, or a single colour string for a flat
 * caller-tinted icon.
 *
 * `scale` is the optical normaliser: the whole drawing is scaled about the box
 * centre, and the keyline and modelling offsets are pre-divided by it so they
 * still land on `KEY` and `OFF` in the final render.
 */
function sculpt(geo, ramp, opts = {}) {
  const {
    scale = 1, spec = '', extra = '', flush = '', bounce = 0.06,
    lite = 0.46, dark = 0.34, ink = INK, px = 96, oy = 0,
  } = opts;
  const tier = iconTier(px);
  const key = (KEY * KEY_TIER[tier]) / scale;
  const off = OFF / scale;
  // The erosion is halved at MIN: at 19px a 5-unit inset all round eats a
  // 12-unit crossguard down to nothing, which is how an icon loses the one
  // interior mark that was supposed to survive to the smallest tier.
  const inset = (INSET * (tier === 0 ? 0.5 : 1)) / scale;
  const g = nid('g'), mi = nid('i'), ml = nid('l'), md = nid('d'), mn = nid('n');

  // Erode by `inset`: fill the form white, then knock its own outline out in
  // black. Everything painted through this mask stays clear of the keyline.
  const erode = `<g fill="#fff">${geo}</g>`
    + `<g fill="none" stroke="#000" stroke-width="${n2(inset * 2)}" stroke-linejoin="round" stroke-linecap="round">${geo}</g>`;
  const mask = (id, dx, dy) =>
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">${erode}`
    + (dx == null ? '' : `<g fill="#000" transform="translate(${n2(dx)} ${n2(dy)})">${geo}</g>`)
    + '</mask>';

  // A caller-supplied FLAT colour is expanded into a ramp in its own hue rather
  // than painted as one value. A flat body is fine on the dark HUD panel, where
  // the keyline carries the separation, and it is a disaster on the pale card:
  // a white cursor on #f6f1e4 measured 1.74:1 and a cream sparkle 1.02:1, i.e.
  // both were pure silhouette held by an 11-unit outline and nothing else. The
  // ramp costs the caller nothing -- it still gets the colour it asked for at
  // the top stop -- and it gives the lower right of every flat-tinted icon a
  // value that separates from a ground lighter than the icon itself.
  //
  // The SECOND stop is what does the work, and getting that wrong cost a round.
  // The obvious move is to deepen stop three, but MIN keeps only the two
  // lightest stops (see `stops` below), and the cursor and the sparkle ship at
  // ~14 and ~20px -- so a deep third stop is dropped at exactly the size the
  // legibility problem exists at. Stop two is therefore pulled a long way, 0.28
  // toward ink rather than a token 0.14.
  //
  // And it is worth being precise about what this buys, because the obvious
  // claim is wrong. Measured as the share of the mark clearing 3:1 against the
  // pale card, this is a few points, not a transformation. It cannot be more: a
  // body pulled dark enough to clear 3:1 against #f6f1e4 is no longer a WHITE
  // cursor, and white is what the caller asked for. On a ground lighter than
  // the icon, this class of glyph is carried by its keyline, and that is a fact
  // about the ground rather than a defect in the drawing. What the ramp really
  // fixes is a system inconsistency: these were the only flat-bodied icons in a
  // set where every other body is modelled.
  const ramp3 = typeof ramp === 'string' ? [ramp, shade(ramp, 0.28), shade(ramp, 0.52)] : ramp;
  const body = `<g fill="url(#${g})">${geo}</g>`;
  // MIN keeps the two LIGHTEST stops and throws the deep one away. At the
  // ~19px the ability chip actually ships at there is no keyline mass left to
  // separate a glyph from its plate, so the glyph has to win on value alone --
  // an orange flame whose lower half is orange on an orange plate is a smudge.
  // Value separation from the ground beats an icon's own internal value range.
  const stops = tier === 0
    ? `<stop offset="0" stop-color="${ramp3[0]}"/><stop offset="1" stop-color="${ramp3[1]}"/>`
    : `<stop offset="0" stop-color="${ramp3[0]}"/>`
      + `<stop offset="0.46" stop-color="${ramp3[1]}"/>`
      + `<stop offset="1" stop-color="${ramp3[2]}"/>`;
  const grad = `<linearGradient id="${g}" x1="0.15" y1="0" x2="0.85" y2="1">${stops}</linearGradient>`;

  const showBounce = tier === 2 && bounce;
  const showLite = tier > 0;
  const specMarkup = Array.isArray(spec) ? (tier === 0 ? spec[1] : spec.join('')) : spec;
  const inside = tierExtra(extra, tier) + specMarkup;
  // `flush` is for a sub-part that is a different MATERIAL rather than a mark on
  // the surface -- Kirby's slippers. Those own their share of the outline, so
  // their colour has to run all the way to the keyline; pushed through the
  // eroded mask like an interior mark, a red slipper 18 units tall came back as
  // a 2-unit sliver inside a pink one and the shoes disappeared at exactly the
  // sizes the HUD ships. It is painted UNDER the bevel and the occlusion, so it
  // is still modelled by the same light as everything else.
  const flushMarkup = tierExtra(flush, tier);

  const inner = `<defs>${grad}
      ${mask(mi, null, null)}
      ${flushMarkup ? `<mask id="${mn}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><g fill="#fff">${geo}</g></mask>` : ''}
      ${showLite ? mask(ml, off * 0.78, off) : ''}
      ${mask(md, -off * 0.78, -off)}
    </defs>
    <g fill="${ink}" stroke="${ink}" stroke-width="${n2(key)}" stroke-linejoin="round" stroke-linecap="round">${geo}</g>
    ${body}
    ${flushMarkup ? `<g mask="url(#${mn})">${flushMarkup}</g>` : ''}
    ${showBounce ? `<ellipse cx="50" cy="106" rx="54" ry="30" fill="#fff" opacity="${bounce}" mask="url(#${mi})"/>` : ''}
    ${showLite ? `<rect x="-20" y="-20" width="140" height="140" fill="#fff" opacity="${lite}" mask="url(#${ml})"/>` : ''}
    <rect x="-20" y="-20" width="140" height="140" fill="${ink}" opacity="${tier === 0 ? n2(dark * 1.25) : dark}" mask="url(#${md})"/>
    <g mask="url(#${mi})">${inside}</g>`;

  // `oy` rides the same transform as `scale`: it is the optical CENTRING knob,
  // and it exists because bounding-box centring is not what the eye uses. An
  // icon's apparent height in the disc is set by where its ink actually sits,
  // and measured on ink centroid the five shipping glyphs spanned 17 units --
  // ice riding 8 units high while fire sat 2 low, which at the 34px chip is
  // about 4 device pixels of visible misalignment between neighbouring discs.
  // Shifting the whole drawing, specular and interior marks included, is the
  // only correction that does not distort the artwork to move its mass.
  return scale === 1 && !oy ? inner
    : `<g transform="translate(50 ${n2(50 + oy)}) scale(${scale}) translate(-50 -50)">${inner}</g>`;
}

const svg = (cls, body) =>
  `<svg class="kb-ico ${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body}</svg>`;

// --- Core shapes -----------------------------------------------------------

/** Fat two-lobe heart with a deep cleft, so the notch survives 20px. */
const HEART_D = 'M50 88C25 68.5 10 55 10 37.5 10 23.5 20.5 13 33 13c8 0 14.4 4.6 17 12.2'
  + 'C52.6 17.6 59 13 67 13c12.5 0 23 10.5 23 24.5C90 55 75 68.5 50 88z';

/** Score star. Inner radius is a deliberate 0.52 of the outer -- a thinner
 *  ratio gives needle points that vanish at counter size. */
const STAR_D = roundedPath(starPts(50, 51, 42, 22, 5), 7);

/**
 * Menu cursor: a solid triangle. It ships at ~14px inside a menu row, a size at
 * which a star -- or a star with a tail -- is a smear. The notched arrowhead it
 * replaced had two problems: too little mass to hold the selected state, and
 * the same silhouette as a diagonal sword blade.
 */
// Notched, not equilateral: a plain triangle is a media play button, which is
// exactly how it read sitting inside a menu row's pill.
const CURSOR_D = roundedPath([[18, 11], [88, 50], [18, 89], [33, 50]], [10, 9, 10, 7]);

// Valleys deliberately shallow and the band deliberately tall: cut deeper, the
// three merlons separate at nameplate size and the crown reads as a sawtooth.
const CROWN_D = roundedPath([
  [14, 82], [14, 30], [32, 50], [50, 14], [68, 50], [86, 30], [86, 82],
], [6, 6, 4, 5, 4, 6, 6]);

/**
 * Full Kirby, with every limb dimension MEASURED off the shipping character
 * model rather than authored by eye. Rounds of hand-drawn proportions read as
 * an octopus, a crab and a skull, and all three misreads have one cause: a
 * round mass with appendages in the wrong places is a sea creature. The head
 * was never the problem, so the head is not what changed.
 *
 * The numbers come from walking the real geometry in `dev/kirby.html` at the
 * `front` pose -- the world-space bounding box of each foot and mitt mesh,
 * expressed relative to the body pivot and divided by `Kirby.R` (0.62). They
 * are reproduced here in body radii so the drawing carries the model's
 * proportions instead of a guess at them. Icon R = 34, body centre (50, 47).
 *
 *   body   a true circle. The model is 1.022 wide : 0.984 tall; a 4% ellipse
 *          only reads as a drawing error at HUD size.
 *   feet   measured x -0.02 .. 0.95 R, y -1.17 .. -0.61 R. Three facts, and
 *          the previous drawing broke all three:
 *            * the slipper is a 1.73:1 LOZENGE, not a near-circle;
 *            * it does NOT clear the body's outline sideways (0.95 R against
 *              the body's 1.02 R) -- feet splayed out past the flanks are the
 *              crab, and they were pushed to 1.25 R;
 *            * the pair MEETS at the midline (the right foot's inner edge is
 *              at -0.02 R, i.e. it crosses), so the two form ONE wide base
 *              under the belly rather than two claws with a gap between them.
 *          Drawn with a 5-unit gap rather than the model's overlap purely so
 *          the keyline bridges it in INK: the notch that separates the two
 *          slippers is then cut by the system, not added as a mark, and it is
 *          the only part of the pair that is allowed to read as two.
 *   mitts  measured tip at 1.35 R with the arm at its resting swing, attaching
 *          over a chord 0.76 R tall centred just below the equator. Drawn at
 *          1.24 R so the pair does not outrun the box.
 *
 *          They are back, and the reason they failed before was placement, not
 *          existence. A lobe at the four corners of a circle is a cephalopod;
 *          a bump on each FLANK at arm height, over a single wide base, is a
 *          standing figure. With the feet corrected the mitts stopped being
 *          two of four radial limbs and became the only thing in the drawing
 *          that says this body has arms.
 */
const KIRBY_R = 34;
const KIRBY_CY = 47;
const kb = (u) => n2(KIRBY_CY + u * KIRBY_R);
/** Body-radius offset from the vertical axis, as an x coordinate. */
const kbx = (u) => n2(50 + u * KIRBY_R);
// 0.60 R apart, not 0.53: at 0.53 the two slippers left a 7-unit channel, under
// two device pixels at the 26px the counter ships at, and the middle rows fused
// into one continuous 16px red bar -- one wide shoe with a crease rather than a
// pair of feet. The outer edge still lands at 1.06 R, which is the model's own
// foot against its own body.
// The channel between the slippers is sized against the KEYLINE, which is what
// two previous attempts at it did not do. The keyline is 14.13 units wide at the
// tier the counter ships in, so it grows 7.07 units INWARD from each slipper's
// inner edge: a 13-unit channel is 1.2 units of overlap, the two strokes meet,
// and at 26px exactly one row -- the widest row of the foot mass -- bridges
// solid. One welded row is enough to turn a pair of slippers into one wide
// skirt with a nick in it.
//
// So the channel is 17.2, which leaves ~3 units of daylight after both strokes
// have eaten their share. It is bought entirely out of slipper WIDTH (rx 12.7)
// rather than by splaying the pair, so the outer edge lands at 1.00 R -- the
// feet now sit exactly inside the head's own width instead of outrunning it,
// which is the other half of the crab.
//
// And the pair is TOED OUT by 7 degrees each, which is the part measuring the
// channel at the waist kept missing: two level ellipses are closest to each
// other at their vertical centres but their keylines meet LOWER, where the
// contours are curving back toward the midline, so a 17-unit channel still
// welded on one row -- and one welded row on the widest row of the foot mass is
// a single red block with a nick in it, which is the crab claw. Rotating each
// slipper's inner end upward opens the channel into a downward V, so the
// clearance grows exactly where the two strokes were meeting.
const KIRBY_FOOT = (dy = 0) => [-1, 1].map((s) => {
  const cx = kbx(s * 0.647), cy = kb(0.925 + dy / KIRBY_R);
  return `<ellipse cx="${cx}" cy="${cy}" rx="12" ry="9.2" transform="rotate(${s * 7} ${cx} ${cy})"/>`;
}).join('');
// And the channel is filled with INK. Everywhere else in the set a gap between
// two sub-paths is cut by the keyline, but this one is INTERIOR to the union --
// the belly closes over it -- so no keyline runs there and the separator came
// out as body pink at 8 luma steps from the slipper red beside it, which is not
// a separator at all. This is the notch the system cannot cut for itself.
// And it is an OPAQUE DARK RED, not ink at 55%. Ink over #c62449 composites to
// 72 luma against the slipper's own 73 -- a one-step hue shift, which is the
// exact mistake the cheeks were fixed for four comments up: value is the only
// channel that survives a box filter, and a notch that changes only hue leaves
// the upper two thirds of the pair as one continuous red bar at every size the
// counter ships at.
// A wedge, not a bar, because the channel it fills is now a wedge: it has to
// widen downward with the toed-out slippers or it stops covering them exactly
// where the two keylines were meeting.
// Starting at y=70, not 68. The slipper ellipses top out at 69.3, so a wedge
// beginning at 68 painted 1.3 units of dark red across the BELLY above both of
// them -- and a bar of slipper colour spanning the gap, above the gap, is a
// bridge welding the pair together. At 26px that overhang was a solid 4px red
// rail across the top of the channel, which is the single mark most likely to
// turn a pair of feet back into one shoe.
const KIRBY_NOTCH = '<path d="M43.4 70h13.2l3.2 14h-19.6z" fill="#6b0f2a"/>';
// Mitts as tilted ovals, not circles, and the right one a whisker lower than
// the left. Two identical circles at identical height over two identical
// ellipses is four symmetric lobes on a round mass, which is the crab diagram
// however well the face is drawn; a character is never a diagram. The tilt
// drops the OUTER end of each, so the pair hangs rather than sticking out.
// 0.77 R / rx 11.2, down from 0.88 / 12.8: the pair's outer tips come in from
// 1.26 R to 1.10 R. The silhouette is a disc with lobes on it and that cannot
// be helped -- Kirby has arms and feet -- but how far the lobes outrun the head
// is exactly what decides between a standing figure and a crab, and with the
// slippers now inside 1.00 R the arms were left as the only tier wider than the
// body. They are not pulled all the way in: a mitt that does not break the
// circle is not an arm, it is a shading error, and this drawing has already
// been through a round with no arms at all.
//
// Dropped to 0.24 R below centre too, so they hang at the bottom of the flank
// rather than sitting at the equator with the cheeks.
const KIRBY_MITT = (side, dy) => {
  const cx = kbx(side * 0.77), cy = kb(0.26 + dy);
  return `<ellipse cx="${cx}" cy="${cy}" rx="11.2" ry="10" transform="rotate(${side * 14} ${cx} ${cy})"/>`;
};
const KIRBY_D = `<circle cx="50" cy="${KIRBY_CY}" r="${KIRBY_R}"/>`
  // 0.015, not 0.035: the asymmetry is there so the pair is not a diagram, but
  // at 1.2 units it was landing the two mitts on different device ROWS at some
  // scales and rasterising visibly lopsided. Half a unit still breaks the mirror
  // and stays inside one pixel at every size the counter ships at.
  + KIRBY_MITT(-1, 0) + KIRBY_MITT(1, 0.015)
  + KIRBY_FOOT();

const CHEVRON_D = roundedPath([
  [41, 12], [86, 50], [41, 88], [26, 73], [49, 50], [26, 27],
], [5, 5, 5, 4, 3, 4]);
const CHEV_TX = {
  right: '', left: 'translate(100 0) scale(-1 1)',
  up: 'rotate(-90 50 50)', down: 'rotate(90 50 50)',
};

export function heartIcon(cls = '', px = 96) {
  return svg(cls, sculpt(`<path d="${HEART_D}"/>`, ['#ffb3d1', '#ff4f86', '#bf0f4c'], {
    px, scale: 1.0,
    spec: gloss(32, 32, 10.5, 7, -34, 0.26, 0.55),
  }));
}

export function starIcon(cls = '', px = 96) {
  return svg(cls, sculpt(`<path d="${STAR_D}"/>`, ['#fff6c2', '#ffcb2e', '#dd7208'], {
    px, scale: 0.96,
    // Concentric core: a value step in the star's own hue, not a second gloss.
    extra: `<path d="${roundedPath(starPts(50, 51, 25, 12.5, 5), 5)}" fill="#ffe9a0" opacity=".3"/>`,
    spec: gloss(36, 30, 9.5, 6, -34),
  }));
}

/**
 * Menu cursor. Colour is caller-controlled so the selected-row cursor can be
 * navy on gold and the idle one cream on indigo -- but it runs through the same
 * `sculpt()` as everything else, so it is a modelled object, not a flat decal.
 */
export function solidStarIcon(fill = '#ffffff', stroke = '#1b1640', cls = '', px = 96) {
  return svg(cls, sculpt(`<path d="${CURSOR_D}"/>`, fill, {
    // Held off the box edge so the cursor keeps an optical margin from the
    // selected row's pill rather than hugging its border.
    px, scale: 0.86, ink: stroke, lite: 0.3, dark: 0.24, bounce: 0.05,
    spec: gloss(36, 34, 9, 5, -34, 0.22, 0.45),
  }));
}

/**
 * Kirby -- used for the lives counter. Drawn to survive 34px: full body
 * silhouette, oversized eyes on a wide baseline, and a filled mouth wedge
 * (a stroked smile disappears below ~24px).
 */
export function kirbyFaceIcon(cls = '', px = 96) {
  // Feet in the model's own red-plum (PALETTE.foot / footBottom), painted
  // through `sculpt`'s FLUSH slot rather than its interior one. The slippers are
  // a different material carrying their own share of the outline, not a mark on
  // the belly: run through the eroded interior mask they lost 5 units all round
  // and the red went from 7.7% of the icon at 19px to 1.4% at 34px -- the shoes
  // vanished at both sizes the HUD actually ships, which is the identity mark
  // weighted backwards across the tiers.
  //
  // FULL gets the deep tone with the main tone offset 2 down over it, which
  // leaves a dark crescent along the top edge -- the ankle break. Below that the
  // crescent is under half a device pixel, so MID and MIN take one flat red and
  // spend the pixels on the colour instead.
  const feet = `<g fill="#8a2440">${KIRBY_FOOT(0)}</g><g fill="#c62449">${KIRBY_FOOT(2)}</g>${KIRBY_NOTCH}`;
  const feetFlat = `<g fill="#c62449">${KIRBY_FOOT(0)}</g>${KIRBY_NOTCH}`;
  // Toe caps: the slipper has a fat lifted toe, and one lighter plane on the
  // outer toe is what stops the pair reading as flat red lozenges. FULL only --
  // at MID they are two shiny beads competing with the head's own specular.
  const toes = `<ellipse cx="${kbx(-0.83)}" cy="${kb(0.88)}" rx="4.4" ry="3.2" fill="#f7a0b1" opacity=".5"/>`
    + `<ellipse cx="${kbx(0.83)}" cy="${kb(0.88)}" rx="4.4" ry="3.2" fill="#f7a0b1" opacity=".5"/>`;
  // The specular is emitted BEFORE the face marks rather than through
  // `sculpt`'s own slot, which paints it last: a head highlight big enough to
  // model a sphere also washes the top of the near eye, and a grey-topped eye
  // is most of why earlier rounds read as a skull. Still exactly one gloss.
  // Pulled up and left, and smaller. Sited where it was, the head's own
  // highlight ran into the near eye's column range and box-filtered into it: the
  // face immediately beside the eye came out BRIGHTER than the catchlight inside
  // it, and a specular below its own surface is an eyelid.
  const spec = gloss(kbx(-0.62), kb(-0.62), 10, 6.4, -34, 0.28, 0.46);
  // Cheeks, on the model's own blush uniform (0.21 R below centre) and sized to
  // hold two device pixels at the 26px the counter ships at. Two things were
  // wrong with them and only one was position: dropped to the chin they flanked
  // the mouth, but the real failure was that #ff6d76 at .85 is a HUE shift with
  // no value step -- 1.14:1 against the face -- and value is the only channel
  // that survives a box filter down to 26px. A deeper rose reads as a cheek at
  // 26px; a same-value coral reads as nothing at all.
  //
  // They are entirely inside the body circle (outermost point 29.5 against a
  // radius of 34), so they never touch the part of a mitt that is visible: the
  // mitts only add silhouette OUTSIDE the head, and inside it they are the same
  // fill as the face.
  const blushY = kb(0.19);
  // The two cheeks are NOT the same colour, on purpose. The right one sits under
  // the down-right occlusion, which is an INK overlay at alpha a: it multiplies
  // cheek and ground alike, so the step between them comes out as (1-a)(G-C) --
  // it SHRINKS. Compensating therefore means darkening the shadow-side cheek,
  // not lightening it; lightening it, which is what this first tried, closes
  // the very gap it was meant to reopen and the icon ships with one cheek. The
  // size of the correction is set by the band: at MID a = 0.28, so the right
  // cheek's pre-occlusion step has to be the left's divided by 0.72.
  const blush = `<ellipse cx="${kbx(-0.6)}" cy="${blushY}" rx="8.4" ry="5.2" transform="rotate(-12 ${kbx(-0.6)} ${blushY})" fill="#ec4f6e"/>`
    + `<ellipse cx="${kbx(0.6)}" cy="${blushY}" rx="8.4" ry="5.2" transform="rotate(12 ${kbx(0.6)} ${blushY})" fill="#dc3b62"/>`;
  // #dc3b62, not #d0325a. The correction above is the right SIGN -- the shadow
  // side does have to be darkened, not lightened -- but it was sized off the
  // occlusion's alpha as if the band covered the cheek. It does not: the
  // occlusion is a ~5-unit contour band hugging the lower-right OUTLINE, and
  // the cheek sits 13 units inboard of it. All that actually darkens the right
  // cheek's ground is the body ramp, which is a far smaller step, so a cheek
  // pitched for a 0.28 overlay went too dark and disappeared into it at 26px --
  // and a character shipping with one visible blush reads as a blemish, not a
  // pair of cheeks.
  // Eye placement is the model's PROJECTED face, not the face-UV uniforms: the
  // features wrap a sphere, so uEyeCenter's 0.35 R lands on screen at 0.27 R.
  // Drawn at 0.30 R -- between the two, because a flat icon of a round head
  // wants slightly more spread than the render to keep the eyes off the nose
  // line, and still nowhere near the wall-eyed 0.34 R this had before.
  const eye = (s) => `<ellipse cx="${kbx(s * 0.3)}" cy="${kb(-0.18)}" rx="6.6" ry="12.4"`;
  const eyes = `${eye(-1)} fill="${INK}"/>${eye(1)} fill="${INK}"/>`;
  // Hand-hinted for the 19px grid. At `scale: 0.95` the two eye centres land on
  // opposite sub-pixel phases, so the left eye rounded to one dark column and
  // the right to two -- and when the eyes ARE the face, a 2:1 width mismatch
  // between them is the whole read. Nudged onto matching phases and widened so
  // both resolve to two columns.
  // 10.53, not 10.5: at `scale: 0.95` that is exactly what puts the two centres
  // on device-pixel centres 7.5 and 11.5 at 19px. Half a unit out and the pair
  // straddles opposite sub-pixel phases -- one eye rounds to two dark columns
  // and the other to one, and when the eyes ARE the face a 2:1 width mismatch
  // between them reads as a lazy eye.
  const EMIN = 10.53;
  // ry 11.2, not 12.4: at 19px the eye's bottom edge and the mouth's top edge
  // landed on the same device row, and two eyes welded to a mouth is one dark U,
  // which is the skull.
  const eyeMin = (s) => `<ellipse cx="${n2(50 + s * EMIN)}" cy="${kb(-0.18)}" rx="6.9" ry="11.2"`;
  const eyesMin = `${eyeMin(-1)} fill="${INK}"/>${eyeMin(1)} fill="${INK}"/>`;
  const pupilsMin = `<ellipse cx="${n2(50 - EMIN)}" cy="${kb(-0.01)}" rx="4.4" ry="3.2" fill="#2a7fd0"/>`
    + `<ellipse cx="${n2(50 + EMIN)}" cy="${kb(-0.01)}" rx="4.4" ry="3.2" fill="#2a7fd0"/>`;
  // Navy over the top two thirds, cobalt in the bottom third, one small shine
  // near the top -- the shader's own eye, in three flat steps. The pupil ships
  // at MIN too: an all-navy oval with a big white cap on it is a socket, and a
  // socket is what read as a skull. The shine is deliberately small for the
  // same reason -- it is a glint, not the top half of the eye.
  const pupils = `<ellipse cx="${kbx(-0.3)}" cy="${kb(-0.01)}" rx="4.2" ry="3" fill="#2a7fd0"/>`
    + `<ellipse cx="${kbx(0.3)}" cy="${kb(-0.01)}" rx="4.2" ry="3" fill="#2a7fd0"/>`;
  // Both catchlights sit up and LEFT of their own eye centre. They were both
  // 1.4 units to the RIGHT of it, which is a mirror-consistent pair lit from the
  // wrong side -- the set has one light and it is upper-left, on a specular in a
  // 6-unit eye as much as on a 34-unit head.
  // Both catchlights sit 1.36 units up and LEFT of their OWN eye centre, which
  // is why the offset is applied to the centre rather than hard-coded: MIN
  // moves its eyes onto hinted positions, and a glint left behind at the FULL
  // coordinates lands 0.6 units off one eye and not the other.
  const glint = (r, ec, off = 1.36, cy = kb(-0.33)) => [-1, 1].map((s) =>
    `<ellipse cx="${n2(50 + s * ec - off)}" cy="${cy}" rx="${r[0]}" ry="${r[1]}" fill="#fff"/>`).join('');
  // Small, and sat at 0.37 R below centre -- the projected mouth on the render
  // is at 0.21 R, the face-UV uniform says 0.48 R, and the low end of that
  // range put the mouth into the top of the slippers.
  // Taller than it is wide across the thick part, and the lower edge is a real
  // arc. At 13 x 8 it box-filtered at 26px into a flat 4x2 dark bar -- legible,
  // but a horizontal slab is a neutral mouth, and a Kirby that does not smile at
  // the size it ships at is a Kirby that reads stern.
  // 21 wide by 10 tall -- 2.1:1. It was 15.2 by 13.0, which is 1.17:1, and a
  // mouth that is as tall as it is wide is not a smile, it is a hole: at 26px
  // it rasterised to a 2x2 dark block reading as a nostril, and its bottom edge
  // came within 1.2 units of the slipper notch above, so the two fused into one
  // dark column down the centreline. That column plus two eyes is the skull
  // read, arriving through the one mark specified to prevent it. Wider, shorter
  // and lifted clear of the notch.
  const mouth = `<path d="M39.5 53.5q10.5 7.5 21 0q-2.4 10-10.5 10t-10.5-10z" fill="${INK}"/>`;
  // At 19px the shaped mouth is a single grey pixel and the face collapses to
  // two dark holes -- which is the octopus/skull read, arriving through the one
  // mark that was supposed to prevent it. MIN gets a hand-hinted solid dash
  // instead: no tongue, no taper, wide enough to hold two pixels.
  // Cut to hold TWO device pixels at 19px, not one: at ry 2.8 it rasterised to
  // a single grey row, the face collapsed to two dark slots under white caps,
  // and the skull read came back through the one mark specified to stop it.
  // A rect, not an ellipse: an ellipse of the same nominal size box-filters to
  // one solid pixel with two grey partials either side, and a one-pixel mouth
  // leaves two dark slots and a tick, which is the skull read arriving through
  // the mark specified to prevent it.
  const mouthMin = `<rect x="42.5" y="56.2" width="15" height="11.1" rx="3.9" fill="${INK}"/>`;
  // Catchlight sizing is per tier, and small. At MIN a 2.5-unit glint rounds up
  // to a white cap on a dark slot, which is a socket, which is the skull; at
  // MID a 3-unit one covered two of the eye's three device columns and turned
  // the whole eye grey -- an eye that is 27 luma at 34px and 101 at 26px is
  // the same failure wearing the opposite mistake.
  return svg(cls, sculpt(KIRBY_D, ['#ffd3e6', '#ff8fbe', '#d33f7e'], {
    // The bevel runs at the system's own 0.46, not the 0.16 this used to carry.
    // The override was there to stop the bevel washing the eyes, which it never
    // could: `sculpt` paints the bevel UNDER the interior marks. All it bought
    // was the flattest, most outline-dependent icon in the HUD panel.
    // The occlusion is eased at MID. At 96px a 0.34 band is a terminator on a
    // sphere; at 26px it is a third of the ball's width in one flat step, and a
    // flat step across a circle reads as a dent rather than as a turn.
    px, scale: 0.95, bounce: 0.05, spec: '', dark: iconTier(px) === 1 ? 0.28 : 0.34,
    flush: { full: feet + toes, mid: feetFlat, min: feetFlat },
    extra: {
      full: spec.join('') + blush + eyes + pupils + glint([2.1, 2.5], 10.2) + mouth,
      // 4.0 across, not 2.6: at 26px -- the size the counter spends most of its
      // life at -- anything under two device pixels wide is at the mercy of
      // sub-pixel phase, and the measured catchlight swung from 168 to 255 and
      // back over four consecutive integer sizes. A player dragging the window
      // edge would watch one eye-shine blink on and off, because `--kb-u` is a
      // vw clamp. At 4.0 the glint always contains one fully covered pixel, and
      // it still sits in the eye's upper-left third with the ink and the cobalt
      // below and outboard of it.
      // ry 3.4 and pulled down to 0.27 R above centre, from 4.2 at 0.33. The
      // 4.0 WIDTH stays -- that is what stops the glint flickering across the
      // `vw` clamp and it is not up for negotiation -- but the height was
      // reaching the eye's top rim, and at 26px the eye is only five device rows
      // tall: a catchlight touching the rim takes the top row with it and leaves
      // a dark slot with a bite out of it, which is the socket, which is the
      // skull. Moved inboard it sits on the pupil with ink above and below.
      // rx 3.4 and only 1.2 units outboard, not rx 4.0 at 2.2. The eye's LEFT
      // rim sits at x=33.26 and the old catchlight's left edge at x=33.60 --
      // 0.34 of a unit, which is 0.09 of a device pixel at 26px, so the white
      // ran straight off the eye into the face. Two consequences, and the
      // second is the bad one: the eye lost its dark rim on the light side, and
      // because the clearance was sub-pixel the two eyes fell on opposite
      // sub-pixel phases and rasterised DIFFERENTLY -- 25% more white in the
      // left eye at 34px. The pair looked mismatched even though the vector is
      // a mirror. It now clears its own rim by 2.0 units either side, and it
      // still holds a full device pixel of width at 26px, which is what the
      // 4.0 was protecting in the first place.
      mid: spec.join('') + blush + eyes + pupils + glint([3.4, 2.9], 10.2, 1.2, kb(-0.23)) + mouth,
      // The pupil ships at MIN as the comment above says it must: dropped, the
      // eye is an all-navy oval under a white cap, which is a socket.
      min: spec[1] + blush + eyesMin + pupilsMin + glint([2, 2.2], EMIN) + mouthMin,
    },
  }));
}

/** Boss crest for the name plate: a chunky crown, on-brand where a skull is not. */
export function crownIcon(cls = '', px = 96) {
  // The band is modelled geometry with its own bevel, not a clipped bar.
  const band = '<rect x="8" y="56" width="84" height="30" rx="8" fill="#c47f10"/>';
  return svg(cls, sculpt(`<path d="${CROWN_D}"/>`, ['#fff2c0', '#ffc32e', '#c06c06'], {
    px, scale: 1.04,
    extra: {
      full: band
        + '<rect x="8" y="56" width="84" height="7" rx="3.5" fill="#ffdb7a" opacity=".6"/>'
        + '<rect x="8" y="79" width="84" height="7" rx="3" fill="#8a4d05" opacity=".5"/>'
        // One gem, not three: at the boss nameplate's ~14px three of them
        // merged with the merlon tips into a single yellow ripple.
        + `<circle cx="50" cy="71" r="9" fill="#ff8fae" stroke="${INK}" stroke-width="4.5"/>`
        + '<circle cx="47.2" cy="68.2" r="3.2" fill="#fff0f4" opacity=".9"/>',
      // At the nameplate's real size the gem's own keyline is a third of a
      // pixel; the band alone still says "crown".
      mid: band + `<circle cx="50" cy="71" r="8" fill="#ff8fae" stroke="${INK}" stroke-width="4"/>`,
      min: band,
    },
    spec: gloss(31, 38, 8, 5.5, -34),
  }));
}

/**
 * Directional chevron for list cursors and option cyclers. The *geometry* is
 * mirrored/rotated, never the finished drawing, so a left and a right chevron
 * are a lit pair rather than two objects lit from opposite sides.
 */
export function chevronIcon(dir = 'right', cls = '', px = 96) {
  const tx = CHEV_TX[dir] ?? '';
  const geo = `<path d="${CHEVRON_D}"${tx ? ` transform="${tx}"` : ''}/>`;
  return svg(cls, sculpt(geo, ['#fffaf0', '#ffd98a', '#b9791f'], {
    px, scale: 1.0,
    spec: gloss(40, 28, 7.5, 5, -34),
  }));
}

// --- Copy ability glyphs ---------------------------------------------------
// `body` is fill-only geometry so every ability goes through the same
// `sculpt()` pipeline, at the same keyline weight, as the core icons.
// Silhouettes are deliberately different masses -- block / blob / gem / zigzag
// / wand / cross -- so they separate before colour does.
//
// `acc` is the hue the HUD disc, ring and label all inherit. Two rules:
//   * It is SATURATED and mid-dark, and the glyph above it runs near-white.
//     The chip ships at ~26px: a plate and a glyph in the same hue at the same
//     value is a coloured dot, and merely darkening the plate makes it muddy.
//     The rule is a large luminance gap with the chroma left intact.
//   * The five that actually ship are spread across the wheel -- fire 12,
//     spark 45, beam 154, ice 206, sword 272 -- so the plates alone separate
//     in peripheral vision before any silhouette is resolved. The six that
//     never reach a player fill the gaps, with bomb and stone at near-zero
//     chroma where hue would only crowd the shipping five.

// The notch on the left shoulder is cut deliberately deep -- 24 units, nearly a
// quarter of the box. It is the only thing separating a flame from a water
// droplet, it is the first detail to disappear at counter size, and at MIN the
// keyline is 13 units wide and closes any notch narrower than itself. Cut to
// half that depth, as it was, the glyph rasterises at the chip's 16px into a
// smooth symmetric orange bead, which is a droplet whatever colour it is.
const FLAME_D = 'M56 8C60 24 70 32 76 44c6 12 5 23 0 32-6 10-15 15-26 15S28 85 23 74c-5-11-4-21 3-30'
  + 'c5-7 8-15 8-24 3 12 8 20 14 24 4-11 7-22 8-36z';

const BOLT_D = roundedPath([[64, 9], [24, 54], [45, 54], [36, 91], [76, 45], [55, 45]], 5);
/**
 * Ice is a fringe of icicles hanging off a crust. Three things it must NOT be:
 * a faceted gem (the universal collectible-currency shape, an active misread in
 * a game with pickups), a flat-topped comb of even spikes (a paintbrush
 * ferrule), and -- the one it kept failing as -- a DOME with points under it,
 * which is a tooth or a jellyfish.
 *
 * The top edge is therefore a nearly straight, slightly tilted ceiling: an
 * icicle hangs from a flat overhang, and the moment that edge arcs the whole
 * form turns organic. The notch apexes sit high, at y=27 against a ceiling at
 * ~20, so that at MIN -- where the keyline is 13 units wide and closes any gap
 * narrower than itself -- the crust welds into one mass but the three spikes
 * below it stay separate, which is the read that has to survive.
 */
// Spike lengths AND spacings are deliberately unequal now. They used to be
// three spikes on equal centres (20 / 50 / 80) hung from a ruler-straight bar,
// and equal spacing plus a straight bar is a letterform: at the chip's size the
// glyph rasterised to "W", and at the peripheral strip's 30px it read as the
// letter pi. Ice does not grow on a grid. The cluster is also lifted 3 units --
// it had the lowest top edge and the lowest optical centre in the set, so it
// hung low in the disc with dead space above it.
// And the ceiling itself is broken. It was one straight 84-unit edge, which is
// the other half of the letterform: a ruler-drawn bar with teeth under it is a
// comb whatever the teeth do. Two extra vertices give it a shallow rise and
// fall, so it reads as the underside of an ice shelf. The overhang must still
// be near-horizontal overall -- the moment that edge ARCS the whole form turns
// organic and becomes a tooth or a jellyfish, which is the misread this
// silhouette was built to avoid.
const CRYSTAL_D = roundedPath([
  [8, 30], [33, 23], [57, 29], [92, 20], [88, 38], [77, 67], [62, 33], [50, 87], [34, 31], [17, 62], [10, 41],
], [6, 7, 7, 6, 4, 2.5, 3, 2.5, 3, 2.5, 4]);
/** Normal is Kirby's star block: a rounded square is the one silhouette the
 *  HUD does not already spend on a star. */
const BLOCK_D = '<rect x="10" y="10" width="80" height="80" rx="20"/>';
const BLOCK_STAR_D = roundedPath(starPts(50, 52, 30, 15.5, 5), 5);
/**
 * Beam's cap.
 *
 * Eight "object emitting energy" concepts were drawn before this and all failed
 * the same way: a nozzle with a shaft composes into a pen, and reviewers named
 * it a highlighter, a toothbrush and a paintbrush. The failure was the
 * silhouette CLASS, not the rendering -- a straight shaft with a tip *is* a pen
 * -- so that whole family is closed.
 *
 * This drops the object and draws the character's hat instead. Beam Kirby wears
 * a jester cap: franchise-canonical, already modelled in
 * `gameplay/Abilities.js buildHat` as cone + brim torus + bobble, and a
 * silhouette no pen can occupy. Sword is already an object rather than an
 * element, so an object here does not break the family.
 *
 * Three drawings of that cap were then rejected, all for the same reason, and
 * the reason is worth keeping because it is not obvious: a cone that BENDS FAR
 * ENOUGH to look like cloth also looks like a head with a snout. The reads were
 * "gooseneck tap / chess knight / boot", then "duck head with a gold beak",
 * then "bird's head on a plinth". Three critics, three animals. What was wrong
 * each time:
 *
 *   v1  the two long edges ran parallel, so the "cone" was a constant-width
 *       tube -- and a tube plus a terminal ball plus a full-length near-white
 *       streak down its outer edge is how you draw chrome plumbing.
 *   v2  the spine arched over and dived back down, which opened a deep concave
 *       crook between the upright of the cone and the ball on the end of it.
 *       A rounded mass, a notch, and a protruding blob past the notch is a face
 *       whatever it is made of.
 *   v3  the taper was linear in the curve parameter, which is not the same as
 *       linear along the form: on a spine that LEANS, all the width change
 *       lands on the outer edge and the inner edge comes out a plumb line. At
 *       the chip's 17px that rasterised to a rectangle with one rounded corner.
 *
 * So the current drawing is pinned by four rules, in the order they matter:
 *
 *   TAPER  the outline is swept (`sweep`) with a CONVEX width ramp, 60 units of
 *          hem falling to 8 at the tip with most of the narrowing spent in the
 *          bottom half -- before the lean starts, so both edges converge and
 *          the hem is the widest row in the icon. 17 pixels does not forgive a
 *          subtle taper; the cone has to be obviously a cone.
 *   BEND   the turn is capped near 110 degrees. The top third folds right and
 *          stops; the tangent at the tip runs about 22 degrees below horizontal
 *          and never comes back down past the crown, so the concave side stays
 *          shallow and no enclosed crook can form. The fold is still what says
 *          "cloth" -- it just no longer folds far enough to draw a face.
 *   CUFF   the gold is painted INSIDE the cap's own silhouette, through FLUSH,
 *          whose mask is the un-eroded outline. It is not geometry at all and
 *          does not appear in `BEAM_D`. Two earlier versions put a closed
 *          ellipse under the cone and both overhung it; a closed disc wider
 *          than the form standing on it is the universal grammar for a base,
 *          and no amount of shading argues a viewer out of it. Painted this way
 *          the band's left and right ends ARE the cap's edges, and its curve
 *          and the bowed hem keep a straight horizontal out of an all-curve
 *          icon -- a ruler-drawn bottom edge is the other half of "plinth".
 *   POM    it hangs off the bent tip, and it is sized against the EROSION as
 *          much as against the eye. `sculpt` builds its modelling masks by
 *          stroking `geo`, and `geo` is a union of sub-paths, so the cap's
 *          buried tip cut knocks its own INSET-wide band out of the bevel and
 *          the occlusion. If that band reaches past the pom's outline it shows
 *          up as a pale chisel wedge on the pom's lower left -- which is
 *          precisely the mark one reviewer read as a beak. The tip cut's
 *          corners sit 6.0 units from the pom's centre, so the pom's MINOR
 *          radius has to clear 6.0 + INSET.
 */
const BEAM_SPINE = [[43, 86], [41, 52], [52, 12], [72, 22]];
const BEAM_CAP = sweep(BEAM_SPINE, 30, 4, 1, 22, 1.6, 5);
// Deliberately not a perfect circle -- an exact ball on a stalk is a pearl or a
// bulb, and wool has a broken edge. But the lobe COUNT is what decides whether
// it reads as wool or as hardware, and this has now been wrong twice in the
// same direction. Six lobes gave scallops long enough that `roundedPath`'s
// corner radius clamped against the edge length and the pom came back a
// flat-sided hex nut; seven at a 1.10 ratio was still read as "a hex nut at
// 96px and a gold cube at 25px". Ten lobes at 1.07 puts the segment length
// under the corner radius everywhere, so no straight run can survive -- the
// edge is broken by curvature rather than by facets.
//
// The minor radius still has to clear 6.0 + INSET so the buried tip cut's
// erosion band cannot reach past the outline (see POM above), which is why it
// is 11.0 rather than something daintier.
const BEAM_POM_D = roundedPath(starPts(76, 24, 11.8, 11, 10, -100), 3);
const BEAM_POM = `<path d="${BEAM_POM_D}"/>`;
/**
 * One band of the cuff: a full-width slab whose top edge is a shallow curve,
 * clipped to the cap by the FLUSH mask. Stacked at different `dy` for the lit
 * lip, the body and the shadow under the roll.
 *
 * The edge is TILTED, about 3 degrees down to the left, which is the hem's own
 * slope. It used to be level, and a level band under a cone that leans is the
 * geometry of a plinth however far inside the silhouette it is painted -- the
 * band has to belong to the same tilted cylinder as the cloth above it or the
 * eye separates them into two objects. Together with the bow, that is what
 * makes it the far rim of a tube rather than a shelf the hat is standing on.
 */
const BEAM_CUFF = (dy, fill, op = 1) =>
  `<path d="M-8 112 L-8 ${n2(70 + dy)} Q41 ${n2(75 + dy)} 108 ${n2(64 + dy)} L108 112 Z"`
  + ` fill="${fill}"${op === 1 ? '' : ` opacity="${op}"`}/>`;
const BEAM_D = `<path d="${BEAM_CAP}"/>${BEAM_POM}`;
// Angular on purpose: a rounded blob and a bomb are the same grey circle once
// the interior is gone.
const STONE_D = roundedPath([
  [12, 48], [34, 16], [64, 13], [88, 38], [82, 70], [52, 88], [22, 76],
], 5);
// The flutes are cut into the OUTLINE, not painted on the face: a spiral has
// to change the silhouette or it reads as a scuff.
const DRILL_D = roundedPath([
  [50, 94], [40, 72], [30, 70], [37, 58], [28, 44],
  [72, 44], [63, 58], [70, 70], [60, 72],
], 3);
/** Hex shank: six real facets, so the top of the bit is machined, not domed. */
const HEX_D = roundedPath([[36, 8], [64, 8], [72, 16], [64, 24], [36, 24], [28, 16]], 3);
/**
 * Sword sits on the diagonal so the blade fills the box instead of the narrow
 * vertical channel that turned it into a chess pawn at 19px. Blade, guard,
 * grip and pommel are four unioned sub-paths, so each keeps its own corner
 * radius under one outer keyline -- and the pommel is what stops the whole
 * thing reading as a trowel.
 */
// -22 rather than -45: at 30px a blade crossed by a guard at 45 degrees stops
// reading as a sword and starts reading as an X.
// Upright, not diagonal -- on the diagonal a blade crossed by a guard resolves
// to an X at 32px and to a bare arrowhead at 19px. But upright is only safe if
// the two arms are UNEQUAL: a guard at mid-height with arms of matching length
// and value is a medical plus sign, which is a reserved HUD symbol. So the
// guard sits at 62% down, the blade above it is twice the length of everything
// below, and the guard is gold where the blade is white.
const SWORD_BLADE = roundedPath([[50, 8], [62, 28], [62, 60], [38, 60], [38, 28]], [3, 5, 5, 5, 5]);
const SWORD_GUARD = '<rect x="26" y="56" width="48" height="18" rx="6"/>';
const SWORD_GRIP = '<rect x="42" y="72" width="16" height="13" rx="5"/>';
const SWORD_POMMEL = '<circle cx="50" cy="87" r="8.5"/>';
const SWORD_D = `<path d="${SWORD_BLADE}"/>${SWORD_GUARD}${SWORD_GRIP}${SWORD_POMMEL}`;

const ABILITY = {
  none: {
    label: 'Normal', hue: ['#f6f4ff', '#c3bce6', '#7a6fae'], acc: '#4f4780', ring: '#a79ede',
    body: BLOCK_D, scale: 0.98,
    // The embossed star is a value step, not a second outlined object -- an
    // inner keyline is a second keyline weight inside one icon.
    extra: `<path d="${BLOCK_STAR_D}" fill="#e04d93" opacity=".55"/>`
      + `<path d="${roundedPath(starPts(50, 50, 30, 15.5, 5), 5)}" fill="#ffe0f0" opacity=".85"/>`,
    spec: gloss(28, 28, 11, 6.5, -34),
  },
  fire: {
    label: 'Fire', hue: ['#fff6d8', '#ff9a1c', '#e0430c'], acc: '#c22f08', ring: '#ff9440',
    body: `<path d="${FLAME_D}"/>`, scale: 1.0, oy: -2,
    // Hot core as a value step in the flame's own hue -- not a white blob.
    extra: {
      full: '<path d="M52 42c5 10 13 15 13 25a15 15 0 0 1-30 0c0-9 10-14 17-25z" fill="#ffa326" opacity=".6"/>'
        + '<path d="M51 58c2 5 7 8 7 13a7.6 7.6 0 0 1-15 0c0-5 6-8 8-13z" fill="#ffd97a" opacity=".55"/>',
      mid: '<path d="M52 42c5 10 13 15 13 25a15 15 0 0 1-30 0c0-9 10-14 17-25z" fill="#ffa326" opacity=".6"/>',
    },
    spec: gloss(40.17, 43.67, 8, 5.04, -34),
  },
  ice: {
    // The mid stop is a real blue, not a tint: MIN renders from the two
    // lightest stops, so a glyph whose second stop is near-white has no colour
    // identity at all the moment it is seen off its plate.
    label: 'Ice', hue: ['#c9e9ff', '#4fb4ee', '#1560a8'], acc: '#106bb0', ring: '#6ec8ff',
    // KNOWN, MEASURED, AND NOT FIXED HERE: ice is the one glyph whose brightest
    // pixel is its BEVEL rather than its specular -- L=0.839 against the core's
    // 0.776. This is structural, not a placement mistake. The bevel is white at
    // `lite` laid over whatever the body ramp is doing underneath it, and it
    // hugs the upper-left inner edge, which is exactly where the ramp is
    // lightest; so bevel-over-lightest-stop beats core-over-midtone whenever the
    // specular cannot also sit up there. The other four escape it because their
    // speculars do. Ice cannot: its upper-left edge is a thin icicle, and
    // `INSET` erodes any pool placed on it back inboard onto mid-blue.
    //
    // Easing `lite` to 0.34 was tried and rejected -- it moved the peak by 0.017
    // and bought nothing, while flattening the modelling on the one icon in the
    // set with the least internal value range to spare. Darkening the ramp's top
    // stop far enough to win would cost more contrast against the plate than the
    // 3:1 floor has to give. Rule 6 requires ONE specular, which this has; it
    // does not require the specular to be the peak, and on this silhouette those
    // two things cannot both be true.
    body: `<path d="${CRYSTAL_D}"/>`, scale: 0.98, oy: 8,
    // Frost lip and spike highlights: value steps along the icicles, not facets.
    // In the ramp's own lightest ICE BLUE, not `#ffffff`. Rule 6 puts interior
    // detail in the icon's hue family and reserves white for the one specular.
    //
    // The recolour alone did NOT fix the value hierarchy, and an earlier version
    // of this comment wrongly claimed it had. Measured on the rendered pixels,
    // `#e8f8ff` at 0.72 still peaked above the specular core, so the crust bar
    // -- an order of magnitude larger in area -- was what read as the lit
    // surface and the highlight read as a smudge on it. Hue was never the
    // problem; opacity was. Dropped until the core measurably outranks it.
    extra: {
      full: '<path d="M8 30l25-7 24 6 35-9-2 8-33 8-24-5-25 6z" fill="#e8f8ff" opacity=".46"/>'
        + '<path d="M46 41h4l3 40z" fill="#e8f8ff" opacity=".42"/>'
        + '<path d="M25 41h3l-4 14z" fill="#e8f8ff" opacity=".36"/>'
        + `<path d="M65 38l10-3 6 20z" fill="${INK}" opacity=".22"/>`,
      // The lit upper crust is what holds the cluster together at counter size.
      mid: '<path d="M8 30l25-7 24 6 35-9-2 8-33 8-24-5-25 6z" fill="#e8f8ff" opacity=".42"/>'
        + `<path d="M65 30l10-3 6 22z" fill="${INK}" opacity=".22"/>`,
    },
    spec: gloss(38.5, 39.5, 10, 6.3, -34),
  },
  sword: {
    label: 'Sword', hue: ['#dde7f7', '#b3c3e4', '#7a89b4'], acc: '#5b34a8', ring: '#a98fff',
    body: SWORD_D, scale: 1.0, oy: -1.5,
    // Warm gold hilt on a cool blade over a cool plate: the chip needs a colour
    // signature at 26px, and steel-on-slate gave it none.
    // The gold hilt is this ability's entire colour signature and the dark bar
    // across the blade is what stops it reading as a dagger, so both survive
    // to MIN -- a bare pale blade on a violet plate is just "no ability".
    extra: (() => {
      const hilt = '<rect x="26" y="56" width="48" height="18" rx="6" fill="#f09a10"/>'
        + '<rect x="42" y="72" width="16" height="13" rx="5" fill="#9a6614"/>'
        + '<circle cx="50" cy="87" r="8.5" fill="#ffc95e"/>';
      return {
        // The white fuller stroke that used to run down the blade is gone. It
        // was a SECOND white highlight on an icon that already has a `gloss`,
        // which rule 6 forbids outright; the lit edge of a blade is the
        // specular's job. The gold lip across the guard stays -- that is a
        // value step in the hilt's own hue, which the rule allows.
        full: hilt
          + '<rect x="26" y="56" width="48" height="5" rx="2.5" fill="#ffe8b0" opacity=".85"/>',
        mid: hilt,
        min: hilt,
      };
    })(),
    // Placed by solving for the light, not for where the blade has room -- see
    // rule 4. Landscape, like every other pool in the set: at rx 5.5 / ry 11
    // this was once elongated ALONG its form instead of across the light, which
    // reads as a different hand however well it models the blade.
    spec: gloss(42.67, 46.67, 8, 5.04, -34),
  },
  bomb: {
    label: 'Bomb', hue: ['#dbe3f5', '#97a2c0', '#4d5674'], acc: '#191d2e', ring: '#8f9ab8',
    body: '<circle cx="44" cy="62" r="28"/>'
      + '<rect x="54" y="28" width="30" height="13" rx="6.5" transform="rotate(-42 69 34.5)"/>'
      + `<path d="${roundedPath(starPts(80, 20, 14, 5, 4, -90), 3)}"/>`, scale: 0.98,
    extra: `<path d="${roundedPath(starPts(80, 20, 15, 5.5, 4, -90), 3)}" fill="#ffd75e"/>`
      + `<path d="${roundedPath(starPts(80, 20, 9, 3.2, 4, -90), 2)}" fill="#fffbe8"/>`,
    spec: gloss(31, 48, 9, 6, -34, 0.24, 0.5),
  },
  spark: {
    label: 'Spark', hue: ['#fff8c8', '#ffd21c', '#e08a00'], acc: '#8a5c00', ring: '#ffd84a',
    // 1.06: on optical area this was the smallest object of the shipping five
    // by a wide margin, and in the disc row it sat as a thin mark on a large
    // plate next to a fire glyph packed to its edge.
    body: `<path d="${BOLT_D}"/>`, scale: 1.06, oy: 2,
    extra: { full: '<path d="M60 22L36 50h10z" fill="#fff0a0" opacity=".5"/>' },
    // On a form this thin it is the EROSION, not the outline, that decides how
    // much of a highlight survives: a pool centred on the bolt's left edge lost
    // over half its area to `INSET` and this once shipped with no visible
    // specular at all. Placed by solving for the light -- see rule 4.
    spec: gloss(40.67, 42.67, 7, 4.41, -34),
  },
  beam: {
    // Jade pulled toward cyan so the cap holds against grass, on a plate that
    // sits with fire and sword rather than in the basement.
    label: 'Beam', hue: ['#eafff8', '#37d9c2', '#0b8158'], acc: '#0a6b52', ring: '#3fe8c4',
    // 0.96, and the spine moved 2 units right. Measured on ink AREA rather than
    // bounding box this was the heaviest of the shipping five -- 60% more ink
    // than spark and 32% more than sword -- and the only one whose ink centroid
    // was off the vertical axis, which in a row of adjacent discs reads as one
    // chip blooming and hanging left.
    body: BEAM_D, scale: 0.96,
    // The pom and the cuff are different *materials*, not marks on the cap, so
    // they go through FLUSH -- painted under the bevel through an un-eroded
    // mask. A previous version put the accent in `extra` as a bare string,
    // which `tierExtra` drops at MIN, so it rendered zero warm pixels on every
    // viewport under ~1159 CSS px. That is every phone, and it is why three
    // reviewers named the accent-less glyph a stick.
    flush: (() => {
      // Gold, not the near-white this used to be. The pom was the lightest
      // value in the icon and it sits at the far upper right, so the perceived
      // key direction on this one glyph was the mirror of every other icon's.
      // Mid-value gold puts the brightest pixel back on the cap's upper-left.
      const pom = BEAM_POM.replace('/>', ' fill="#f0b02a"/>');
      const lip = BEAM_CUFF(0, '#ffd977');
      const band = BEAM_CUFF(4, '#f0b02a');
      return {
        // The dark under-band is FULL only. At the chip's 17px it is a 0.8px
        // line that fuses with the 11.9-unit keyline into one thick black sole,
        // which is the last thing a hem that has twice been called a plinth
        // needs.
        full: pom + lip + band + BEAM_CUFF(11, '#c07f14', 0.45),
        mid: pom + lip + band,
        // MIN keeps the gold but not its roll: at 17px the lit lip is under a
        // device pixel and only muddies the hem.
        min: pom + BEAM_CUFF(2, '#f0b02a'),
      };
    })(),
    // No `extra` at all, and that is the point. The pom used to carry its own
    // lit crescent as a value step -- legal on paper -- but measured as
    // near-peak luminance it came out TEN TIMES the area of the cap's actual
    // specular, so the pom read as the lit object and the whole cap as its
    // shadow. Rule 6 says one highlight per icon; the icon had two and the
    // smaller one was the sanctioned one. The pom is modelled by the same bevel
    // and occlusion as everything else, which is enough.
    extra: '',
    // Upper-left, on the cap's own upper-left flank, like the rest of the set.
    // This was the one icon whose specular sat off that quadrant, and the cause
    // was the geometry rather than the placement: the old glyph was a narrow
    // vertical with no upper-left mass to put a pool on. The leaning cone has
    // one, so the exception is gone rather than documented.
    spec: gloss(41.17, 45.17, 6, 3.78, -34),
  },
  stone: {
    label: 'Stone', hue: ['#faf9f7', '#c8c6c2', '#6a6b72'], acc: '#46474f', ring: '#b4b2ae',
    body: `<path d="${STONE_D}"/>`, scale: 1.0,
    // One bright plane facing the key, one dark plane facing away, big enough
    // to survive 20px as a value split rather than as texture.
    extra: '<path d="M8 50L34 14l32 26-30 16z" fill="#fbfaf8" opacity=".5"/>'
      + `<path d="M36 56l30-16 26 0-40 52z" fill="${INK}" opacity=".3"/>`,
    spec: gloss(33, 34, 9, 6, -34, 0.24, 0.5),
  },
  sleep: {
    label: 'Sleep', hue: ['#fbf8ff', '#d6c6ff', '#9b82ee'], acc: '#4a2ea0', ring: '#bda6ff',
    // Crescent: the one silhouette in the set with a concave bite out of it.
    // Centred on the crescent's mass, not its bounding box: the outer arc is
    // pushed right so the horns straddle the middle of the tile.
    body: '<path d="M70 10A40 40 0 1 0 70 90A56 56 0 0 1 70 10Z"/>', scale: 1.02,
    extra: '<circle cx="40" cy="30" r="7" fill="#e8dfff" opacity=".3"/>'
      + '<circle cx="33" cy="58" r="5" fill="#e8dfff" opacity=".18"/>',
    spec: gloss(38, 30, 8, 5, -34, 0.22, 0.4),
  },
  ranger: {
    label: 'Ranger', hue: ['#ffeef7', '#eaa8d0', '#a8508a'], acc: '#7a1f4a', ring: '#f08ac0',
    body: '<rect x="16" y="32" width="46" height="22" rx="7"/>'
      + '<rect x="58" y="36" width="30" height="14" rx="4"/>'
      + '<rect x="28" y="22" width="16" height="11" rx="3"/>'
      + '<rect x="24" y="52" width="19" height="30" rx="5"/>'
      + '<path d="M43 54h20v6H49v14h-6z"/>', scale: 1.0,
    // Receiver, barrel and grip each get their own value so the assembly is
    // three parts, not one extruded rectangle.
    extra: '<rect x="58" y="36" width="30" height="14" rx="4" fill="#8f62c4"/>'
      + `<rect x="80" y="35" width="8" height="16" rx="3" fill="${INK}" opacity=".5"/>`
      + '<rect x="24" y="52" width="19" height="30" rx="5" fill="#5f3391"/>'
      + '<rect x="16" y="32" width="46" height="6" rx="3" fill="#efe0ff" opacity=".5"/>',
    spec: gloss(30, 40, 8.5, 5, -34),
  },
  drill: {
    label: 'Drill', hue: ['#f8fbff', '#c2cce4', '#6a7492'], acc: '#0e6a60', ring: '#4fd0c4',
    body: `<path d="${DRILL_D}"/><rect x="24" y="24" width="52" height="22" rx="3"/>`
      + `<path d="${HEX_D}"/>`, scale: 1.02,
    extra: '<rect x="24" y="24" width="52" height="22" rx="3" fill="#2c8f88"/>'
      + '<rect x="24" y="24" width="52" height="6" rx="2.5" fill="#7fd6cf" opacity=".65"/>'
      + `<path d="${HEX_D}" fill="#25776f"/>`
      + `<path d="M50 46v46" stroke="${INK}" stroke-width="4.5" opacity=".2"/>`,
    spec: gloss(38, 32, 8, 4.5, -34),
  },
};

export function abilityLabel(name) { return (ABILITY[name] ?? ABILITY.none).label; }

/**
 * Plate colour: the saturated mid-dark tone the ability disc is filled with.
 * Deliberately much darker than the glyph that sits on it.
 */
export function abilityColor(name) {
  const a = ABILITY[name] ?? ABILITY.none;
  return a.acc ?? a.hue[1];
}

/**
 * Ring/label colour, split out from the plate on purpose: the disc wants a
 * deep tone so the glyph reads, but the swap-flash ring and the label sit on
 * the dark HUD panel and want a bright one. One property driving both meant
 * every plate darkening dimmed the ring flash with it.
 */
export function abilityRingColor(name) {
  const a = ABILITY[name] ?? ABILITY.none;
  return a.ring ?? a.hue[1];
}
export function abilityNames() { return Object.keys(ABILITY); }

export function abilityIcon(name, cls = '', px = 96) {
  const a = ABILITY[name] ?? ABILITY.none;
  return svg(cls, sculpt(a.body, a.hue, {
    px, scale: a.scale ?? 1, spec: a.spec ?? '', extra: a.extra ?? '',
    flush: a.flush ?? '', oy: a.oy ?? 0,
  }));
}

// --- Face buttons ----------------------------------------------------------
// Drawn as geometry, not text: a live <text> node hints differently on every
// platform and would be the one glyph in the set with no controlled weight.

// Counters are cut wide on purpose: an A whose triangle is 6 units across
// fills in below 24px and the badge reads as a solid delta.
const LETTER = {
  A: 'M50 18 76 82H62.5L58 70H42L37.5 82H24Z M50 39 42.6 58.5H57.4Z',
  B: 'M28 18H58a16.5 16.5 0 0 1 10 29.5A17 17 0 0 1 60 82H28Z'
    + ' M43 29V43H57a7 7 0 0 0 0-14Z M43 56V71H58.5a7.5 7.5 0 0 0 0-15Z',
};

/**
 * Face-button badge for menu footers, so hints read as console prompts. The
 * cap runs through `sculpt()` like every other icon, so its keyline weight,
 * bevel and specular are the set's, not a hand-rolled ring.
 */
export function buttonGlyph(letter = 'A', fill = '#5ed67f', px = 96) {
  const d = LETTER[letter.toUpperCase()];
  const glyph = d
    ? `<path d="${d}" fill="#ffffff" fill-rule="evenodd"/>`
    : `<text x="50" y="70" text-anchor="middle" font-size="56" font-weight="900"
          font-family="${FONT_STACK}" fill="#ffffff">${letter}</text>`;
  // The letter is knocked out of a filled cap rather than floated inside a
  // ring: at the footer's ~13px a stroked ring outweighs the letter and both
  // badges read as two coloured rings with nothing in them.
  // Dark cap, near-white letter, the accent carried by a ring. A letter drawn
  // in a second tone of the cap's own hue is a blob at the footer's ~13px, and
  // a fully coloured cap reads as the wrong console besides.
  return `<svg class="kb-ico kb-btn-glyph" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    ${sculpt('<circle cx="50" cy="50" r="44"/>', ['#3d3778', '#221c52', '#100c2b'], {
    // A softer cap than the rest of the set: at the footer's ~14px a strong
    // bevel and occlusion eat the pixels the letter needs.
    px, scale: 0.98, lite: 0.22, dark: 0.2, bounce: 0.06,
    // The letter IS the icon, so it is the mark that survives every tier.
    extra: (() => {
      // Thick enough to read as a colour, not a hairline: at 14px a 7-unit
      // ring is sub-pixel and the two badges become identical dark discs.
      const ring = `<circle cx="50" cy="50" r="34" fill="none" stroke="${fill}" stroke-width="14"/>`;
      return { full: ring + glyph, mid: ring + glyph, min: ring + glyph };
    })(),
    spec: gloss(30, 26, 11, 6.5, -34, 0.2, 0.34),
  })}
  </svg>`;
}

/**
 * Small four-point sparkle for pickup bursts and title-screen dust.
 *
 * The set's one deliberate exception on lighting: this is emitted light, so it
 * is keyline -> body -> core and carries no bevel or occlusion. It does not get
 * to skip the keyline or to invent its own keyline colour -- it is `INK` at
 * `KEY` weight like everything else, which is what holds its edge on a
 * blown-out sky where a rimless glyph disappears.
 */
export function sparkleSvg(color = '#fff6c4', px = 96) {
  const tier = iconTier(px);
  const outer = 'M50 12c3.2 26.4 12.4 35.6 38.6 38.8C62.4 54 53.2 63.2 50 89.6 46.8 63.2 37.6 54 11.4 50.8'
    + 'C37.6 47.6 46.8 38.4 50 12z';
  const core = '<path d="M50 30c2 13.2 7 18.2 20.2 20.2C57 52.2 52 57.2 50 70.4 48 57.2 43 52.2 29.8 50.2'
    + ' 43 48.2 48 43.2 50 30z" fill="#fffdf2" opacity=".85"/>';
  // The body is a RAMP in the caller's own colour, not the flat fill it used to
  // be. Emitted light or not, a cream star painted at one value on a pale card
  // measured 1.02:1 against the ground -- the glyph existed only as a keyline,
  // and this is the icon most likely to be asked to sit on a blown-out sky. The
  // ramp runs on the set's own light axis, so the burst still reads as lit from
  // upper-left rather than as a flat decal.
  const g = nid('s');
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${g}" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="0.5" stop-color="${shade(color, 0.1)}"/>
      <stop offset="1" stop-color="${shade(color, 0.34)}"/>
    </linearGradient></defs>
    <path d="${outer}" fill="${INK}" stroke="${INK}" stroke-width="${n2(KEY * KEY_TIER[tier])}" stroke-linejoin="round"/>
    <path d="${outer}" fill="url(#${g})"/>
    ${tier > 0 ? core : ''}
  </svg>`;
}
