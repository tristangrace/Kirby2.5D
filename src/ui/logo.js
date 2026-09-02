/**
 * The game's logotype, drawn as geometry rather than styled text.
 *
 * A title logo set in a system UI font is the single loudest "this is a web
 * page" signal there is, so every letter here is a hand-authored stroke path
 * on a 0..100 cap-height grid. Fat round caps and joins give the bubble-letter
 * mass; the same path is stroked four times at decreasing widths to build the
 * ink / gold / cream / body outline stack, exactly how a printed game
 * wordmark is constructed. Letters sit on a shallow arc with per-letter
 * rotation so the baseline is never mechanically flat.
 */

const INK = '#1b1640';

/**
 * Stroke-built capitals in a 0..70 x 0..100 box.
 *
 * At this outline weight a centreline stroke closes the counters of B and R
 * completely, so those letters carry explicit `holes`: ink-filled eyes punched
 * back in after the stroke passes. That is how chunky bubble-letter game logos
 * are drawn anyway -- the counter is the keyline colour, not the background.
 */
const GLYPHS = {
  K: { adv: 76, d: ['M16 6 V94', 'M64 6 L22 50 L64 94'] },
  I: { adv: 42, d: ['M33 6 V94'] },
  R: {
    adv: 76,
    d: ['M16 6 V94', 'M16 6 H40 A22 22 0 0 1 40 50 H16', 'M38 50 L64 94'],
    holes: [{ cx: 36, cy: 28, rx: 15, ry: 12}],
  },
  B: {
    adv: 76,
    d: ['M16 6 V94', 'M16 6 H38 A22 22 0 0 1 38 50 H16', 'M16 50 H42 A23 23 0 0 1 42 94 H16'],
    holes: [{ cx: 34, cy: 27, rx: 13.5, ry: 10.5},
      { cx: 36, cy: 72, rx: 14.5, ry: 11.5}],
  },
  Y: { adv: 72, d: ['M10 6 L35 46 L60 6', 'M35 46 V94'] },
};

// Gentle smile-shaped baseline: outer letters ride high and tilt outward.
const ARC = [
  { dy: 11, rot: -7 },
  { dy: 3, rot: -3.5 },
  { dy: -3, rot: 0 },
  { dy: 3, rot: 3.5 },
  { dy: 11, rot: 7 },
];

const TRACK = 40;

/** Four stroke passes, widest first, so the outlines nest without seams. */
const PASSES = [
  { w: 62, stroke: INK },
  { w: 48, stroke: '#ffc32e' },
  { w: 36, stroke: '#fffdf6' },
  { w: 27, body: true },
];

function letterGroups(word) {
  let x = 0;
  const out = [];
  for (let i = 0; i < word.length; i++) {
    const g = GLYPHS[word[i]];
    if (!g) continue;
    const a = ARC[i % ARC.length];
    out.push({ g, x, dy: a.dy, rot: a.rot });
    x += g.adv + TRACK;
  }
  return { groups: out, width: x - TRACK };
}

/** Build the full lockup: a kicker banner, the stroked wordmark and a subtitle. */
export function logotypeSvg({
  kicker = 'CLAUDE', word = 'KIRBY', subtitle = 'AND THE FORGOTTEN CODE',
  font = 'sans-serif',
} = {}) {
  const { groups, width } = letterGroups(word);
  const ox = (560 - width) / 2;

  const ramps = groups.map((gr, i) =>
    `<linearGradient id="kb-lg${i}" gradientUnits="userSpaceOnUse"
       x1="0" y1="${-gr.dy}" x2="0" y2="${100 - gr.dy}">
      <stop offset="0" stop-color="#fff6fa"/><stop offset="0.3" stop-color="#ffc2dc"/>
      <stop offset="0.56" stop-color="#ff7fb2"/><stop offset="1" stop-color="#ec2f7c"/>
    </linearGradient>`).join('');

  const passes = PASSES.map((p) => {
    const letters = groups.map(({ g, x, dy, rot }, i) => {
      const paths = g.d.map((d) => `<path d="${d}"/>`).join('');
      const stroke = p.body ? `url(#kb-lg${i})` : p.stroke;
      return `<g transform="translate(${x} ${dy}) rotate(${rot} 35 50)"
        stroke="${stroke}">${paths}</g>`;
    }).join('');
    return `<g stroke-width="${p.w}" fill="none"
      stroke-linecap="round" stroke-linejoin="round">${letters}</g>`;
  }).join('');

  // Counters, punched after the fill pass and rimmed so they read as eyes.
  const holes = groups.map(({ g, x, dy, rot }) => {
    if (!g.holes) return '';
    // Elliptical aperture drawn twice, so the counter carries the same
    // cream-inside-ink rim that the outside of the letter does.
    const eyes = g.holes.map((h) =>
      `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx + 6}" ry="${h.ry + 6}" fill="#fffdf6"/>`
      + `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${INK}"/>`).join('');
    return `<g transform="translate(${x} ${dy}) rotate(${rot} 35 50)">${eyes}</g>`;
  }).join('');

  return `<svg viewBox="0 0 560 210" aria-label="${kicker} ${word}: ${subtitle}">
  <defs>
    ${ramps}
    <filter id="kb-logo-glow" x="-25%" y="-35%" width="150%" height="180%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feColorMatrix in="b" type="matrix"
        values="1 0 0 0 0  0 .3 .55 0 0  0 0 .85 0 .2  0 0 0 .8 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <g transform="translate(280 22)">
    <rect x="-106" y="-20" width="212" height="40" rx="20"
          fill="${INK}" stroke="#fffdf6" stroke-width="6"/>
    <rect x="-110" y="-24" width="220" height="48" rx="24"
          fill="none" stroke="${INK}" stroke-width="5"/>
    <text x="0" y="8" text-anchor="middle" font-family="${font}" font-size="23"
          font-weight="900" letter-spacing="8" fill="#ffce4a"
          transform="translate(4 0)">${kicker}</text>
  </g>

  <g transform="translate(${ox} 60)" filter="url(#kb-logo-glow)">${passes}${holes}</g>

</svg>`;
}
