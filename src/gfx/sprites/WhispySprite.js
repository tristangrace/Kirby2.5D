import { PixelBuffer } from '../PixelArt.js';
import { buildSheet, lazySheet } from './sheet.js';

/**
 * Whispy Woods: a 48x64 tree with a face on the trunk. Authored facing RIGHT
 * like everything else; the boss flips it to face Kirby.
 */
const P = {
  outline: '#1c1024',
  leaf: '#4fb848',
  leafDark: '#3a9434',
  leafLight: '#7ad86a',
  bark: '#a0693c',
  barkDark: '#7c4a24',
  barkLight: '#c58a52',
  eye: '#1c1024',
  apple: '#e8303c',
  tear: '#6ec6ff',
  mouth: '#3a1020',
  tongue: '#c04060',
};

export const WHISPY_W = 48;
export const WHISPY_H = 64;

/**
 * @param {object} pose
 * @param {'idle'|'blow'|'hurt'|'defeated'|'shake'} [pose.face]
 * @param {number} [pose.sway] canopy x offset in px
 */
export function drawWhispy({ face = 'idle', sway = 0 } = {}) {
  const px = new PixelBuffer(WHISPY_W, WHISPY_H);
  const cx = 24;

  // Canopy: overlapping blobs. Drawn as one merged mask so the outline hugs the silhouette.
  const blobs = [
    [cx + sway, 17, 21, 13],
    [cx - 13 + sway, 15, 10, 9],
    [cx + 13 + sway, 15, 10, 9],
    [cx + sway, 8, 13, 8],
    [cx - 7 + sway, 6, 8, 6],
    [cx + 8 + sway, 5, 7, 5],
  ];
  const canopy = new Uint8Array(WHISPY_W * WHISPY_H);
  for (const [bx, by, rx, ry] of blobs) {
    const m = px.ellipseMask(bx, by, rx, ry);
    for (let i = 0; i < m.length; i++) if (m[i]) canopy[i] = 1;
  }
  px.fillMask(canopy, P.leaf);
  px.outlineMask(canopy, P.outline);
  // texture: dark patches low, light patches high
  for (const [bx, by, rx, ry] of [[cx - 10 + sway, 22, 6, 3], [cx + 9 + sway, 23, 7, 3], [cx + sway, 26, 8, 2.5]]) {
    const m = px.ellipseMask(bx, by, rx, ry);
    for (let i = 0; i < m.length; i++) if (m[i] && canopy[i]) px.px[i] = P.leafDark;
  }
  for (const [bx, by, rx, ry] of [[cx - 8 + sway, 9, 4, 2], [cx + 6 + sway, 6, 3, 1.5], [cx - 15 + sway, 14, 3, 1.5]]) {
    const m = px.ellipseMask(bx, by, rx, ry);
    for (let i = 0; i < m.length; i++) if (m[i] && canopy[i]) px.px[i] = P.leafLight;
  }
  // apples in the canopy
  for (const [ax, ay] of [[cx - 14 + sway, 20], [cx + 4 + sway, 11], [cx + 15 + sway, 21]]) {
    px.ellipse(ax, ay, 1.8, 1.8, P.apple, P.outline);
    px.set(Math.round(ax) - 1, Math.round(ay) - 1, '#ff9aa0');
  }

  // Trunk: a tapered polygon with roots.
  const top = 26;
  const bottom = 61;
  const trunk = px.polygon(
    [
      [cx - 8, top],
      [cx + 8, top],
      [cx + 11, bottom - 6],
      [cx + 18, bottom],
      [cx - 18, bottom],
      [cx - 11, bottom - 6],
    ],
    P.bark,
    P.outline,
  );
  // bark grain
  for (let y = top + 2; y < bottom - 2; y += 6) {
    for (const gx of [cx - 6, cx + 5]) if (trunk[y * WHISPY_W + gx]) px.rect(gx, y, 1, 3, P.barkDark);
  }
  for (let i = 0; i < trunk.length; i++) {
    const x = i % WHISPY_W;
    if (trunk[i] && x < cx - 6 && px.px[i] === P.bark) px.px[i] = P.barkLight;
  }
  // root bumps
  px.ellipse(cx - 15, bottom - 1, 4, 2.2, P.bark, P.outline);
  px.ellipse(cx + 15, bottom - 1, 4, 2.2, P.bark, P.outline);
  px.ellipse(cx, bottom, 6, 2.4, P.barkDark, P.outline);

  // Face on the trunk (right-facing: eyes and mouth lean to +x).
  const fy = 33;
  const ex1 = cx - 4;
  const ex2 = cx + 4;
  if (face === 'hurt' || face === 'defeated') {
    for (const ex of [ex1, ex2]) {
      px.line(ex, fy, ex + 2, fy + 2, P.eye);
      px.line(ex + 2, fy + 2, ex, fy + 4, P.eye);
    }
    // tears
    for (const ex of [ex1 - 1, ex2 + 3]) {
      px.rect(ex, fy + 6, 1, 3, P.tear);
      px.set(ex, fy + 10, P.tear);
    }
  } else if (face === 'shake') {
    for (const ex of [ex1, ex2]) {
      px.rect(ex, fy, 2, 6, P.eye);
      px.rect(ex, fy, 1, 1, '#ffffff');
    }
    px.rect(ex1 - 1, fy - 2, 4, 1, P.eye); // furrowed brows
    px.rect(ex2 - 1, fy - 2, 4, 1, P.eye);
  } else {
    for (const ex of [ex1, ex2]) {
      px.rect(ex, fy, 2, 6, P.eye);
      px.rect(ex, fy, 1, 2, '#ffffff');
    }
  }
  // nose bump
  px.ellipse(cx + 1.5, fy + 8.5, 2.6, 2.2, P.barkLight, P.outline);
  // mouth
  const my = fy + 14;
  if (face === 'blow') {
    px.ellipse(cx + 2, my + 1, 4.2, 3.4, P.mouth, P.outline);
    px.ellipse(cx + 2, my + 2, 2.2, 1.4, P.tongue, null);
  } else if (face === 'defeated') {
    px.line(cx - 4, my + 2, cx - 1, my, P.mouth);
    px.line(cx - 1, my, cx + 3, my, P.mouth);
    px.line(cx + 3, my, cx + 6, my + 2, P.mouth);
  } else if (face === 'hurt') {
    px.ellipse(cx + 1, my + 1, 3, 2.2, P.mouth, P.outline);
  } else {
    px.line(cx - 4, my, cx - 1, my + 2, P.mouth);
    px.line(cx - 1, my + 2, cx + 3, my + 2, P.mouth);
    px.line(cx + 3, my + 2, cx + 6, my, P.mouth);
  }
  return px;
}

export const getWhispySheet = lazySheet(() =>
  buildSheet({
    width: WHISPY_W,
    height: WHISPY_H,
    draw: drawWhispy,
    animations: {
      idle: { fps: 2, loop: true, poses: [{ face: 'idle', sway: 0 }, { face: 'idle', sway: 1 }] },
      blow: { fps: 4, loop: true, poses: [{ face: 'blow', sway: 0 }, { face: 'blow', sway: -1 }] },
      shake: { fps: 12, loop: true, poses: [{ face: 'shake', sway: -2 }, { face: 'shake', sway: 2 }] },
      hurt: { fps: 1, loop: true, poses: [{ face: 'hurt', sway: 0 }] },
      defeated: { fps: 1, loop: true, poses: [{ face: 'defeated', sway: 0 }] },
    },
  }),
);
