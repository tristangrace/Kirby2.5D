import { PixelBuffer } from '../PixelArt.js';
import { buildSheet, lazySheet } from './sheet.js';

/**
 * Kirby, drawn in the proportions of the Game Boy "Kirby's Dream Land" sprite
 * (round body, stubby arms, two big feet, tall oval eyes, hard black outline)
 * but in colour. Every frame is built from ellipses so new poses are cheap to
 * add: tweak the numbers, do not hand-edit pixel strings.
 *
 * Frames are authored facing RIGHT; the sheet also carries a mirrored copy.
 * The canvas is 28px so the puffed-up and mouthful poses have room to grow.
 */
export const KIRBY_PALETTE = {
  outline: '#1c1024',
  body: '#ffa6c9',
  bodyShade: '#e8789f',
  bodyLight: '#ffd6e6',
  foot: '#e03a48',
  footShade: '#b02838',
  eye: '#1c1024',
  eyeShine: '#ffffff',
  blush: '#f06090',
  mouth: '#8a2040',
  mouthDark: '#3a1020',
  tongue: '#e05070',
};

export const KIRBY_SIZE = 28;

// [cx, cy, rx, ry] for the back and front foot in each pose.
const FEET = {
  idle: { back: [10.5, 23.6, 4.0, 2.3], front: [16.5, 24.6, 4.6, 2.6] },
  stepA: { back: [16.5, 23.6, 4.0, 2.3], front: [11.0, 24.6, 4.6, 2.6] },
  stepB: { back: [9.5, 23.6, 4.0, 2.3], front: [17.5, 24.6, 4.6, 2.6] },
  tuck: { back: [11.5, 22.8, 3.6, 2.2], front: [15.5, 23.4, 4.0, 2.4] },
  dangle: { back: [11.0, 24.4, 3.6, 2.1], front: [16.5, 24.9, 3.8, 2.3] },
};

const BODY = {
  normal: { rx: 7.3, ry: 6.9 },
  puff: { rx: 8.6, ry: 8.2 },
  full: { rx: 9.6, ry: 9.0 },
};

/**
 * @param {object} pose
 * @param {number} [pose.bob] vertical offset of the body in pixels (negative = up)
 * @param {keyof FEET} [pose.feet]
 * @param {'open'|'blink'|'squint'|'wince'|'happy'} [pose.eyes]
 * @param {'smile'|'o'|'wide'|'wider'|'closed'|'tiny'} [pose.mouth]
 * @param {'normal'|'puff'|'full'} [pose.body]
 * @param {'normal'|'up'|'out'} [pose.arms]
 */
export function drawKirby({ bob = 0, feet = 'idle', eyes = 'open', mouth = 'smile', body = 'normal', arms = 'normal' } = {}) {
  const P = KIRBY_PALETTE;
  const px = new PixelBuffer(KIRBY_SIZE, KIRBY_SIZE);
  const cx = 13.5;
  const cy = 15 + bob;
  const pose = FEET[feet];
  const { rx, ry } = BODY[body];

  // Draw order = depth order: back foot, back arm, body, face, front arm, front foot.
  px.ellipse(...pose.back, P.footShade, P.outline);
  if (arms === 'up') px.ellipse(cx - rx + 0.6, cy - ry + 1.2, 2.3, 2.1, P.bodyShade, P.outline);
  else if (arms === 'out') px.ellipse(cx - rx - 0.4, cy - 1.2, 2.6, 2.0, P.bodyShade, P.outline);
  else px.ellipse(cx - rx + 0.6, cy + 2.5, 2.4, 2.2, P.bodyShade, P.outline);

  const bodyMask = px.ellipse(cx, cy, rx, ry, P.body, P.outline);
  // Shaded crescent along the lower-right rim gives the ball some roundness.
  const lit = px.ellipseMask(cx - 0.6, cy - 0.8, rx - 0.7, ry - 0.7);
  for (let i = 0; i < bodyMask.length; i++) if (bodyMask[i] && !lit[i]) px.px[i] = P.bodyShade;
  // Specular gleam, upper-left.
  const gx = Math.round(cx - rx * 0.5);
  const gy = Math.round(cy - ry * 0.75);
  px.set(gx, gy, P.bodyLight);
  px.set(gx + 1, gy, P.bodyLight);
  px.set(gx - 1, gy + 1, P.bodyLight);

  // Face (eyes sit toward the facing side).
  const ey = cy - 5;
  const e1 = 14;
  const e2 = 17;
  switch (eyes) {
    case 'blink':
      px.rect(e1, ey + 4, 2, 1, P.eye);
      px.rect(e2, ey + 4, 2, 1, P.eye);
      break;
    case 'squint':
      px.rect(e1, ey + 2, 2, 3, P.eye);
      px.rect(e2, ey + 2, 2, 3, P.eye);
      break;
    case 'happy':
      for (const ex of [e1, e2]) {
        px.set(ex, ey + 3, P.eye);
        px.set(ex + 1, ey + 2, P.eye);
        px.set(ex + 2, ey + 3, P.eye);
      }
      break;
    case 'wince':
      for (const ex of [e1, e2]) {
        px.set(ex, ey + 1, P.eye);
        px.set(ex + 1, ey + 2, P.eye);
        px.set(ex + 1, ey + 3, P.eye);
        px.set(ex, ey + 4, P.eye);
      }
      break;
    default:
      px.rect(e1, ey, 2, 6, P.eye);
      px.rect(e2, ey, 2, 6, P.eye);
      px.rect(e1, ey, 1, 2, P.eyeShine);
      px.rect(e2, ey, 1, 2, P.eyeShine);
  }
  // Blush; bigger when puffed.
  const blushW = body === 'normal' ? 2 : 3;
  px.rect(e1 - 3, ey + 7, blushW, 1, P.blush);
  px.rect(e2 + 2, ey + 7, blushW, 1, P.blush);

  switch (mouth) {
    case 'o':
      px.ellipse(e2 + 0.5, ey + 8.5, 1.6, 1.4, P.mouthDark, P.outline);
      break;
    case 'wide':
      px.ellipse(e2 + 1.5, ey + 8.5, 3.4, 2.6, P.mouthDark, P.outline);
      px.rect(e2 + 1, ey + 10, 3, 1, P.tongue);
      break;
    case 'wider':
      px.ellipse(e2 + 2, ey + 8.5, 4.2, 3.2, P.mouthDark, P.outline);
      px.rect(e2 + 1, ey + 10, 4, 1, P.tongue);
      break;
    case 'closed':
      px.rect(e2 - 1, ey + 8, 3, 1, P.mouth);
      break;
    case 'tiny':
      px.set(e2, ey + 8, P.mouth);
      break;
    default:
      px.set(e2 - 1, ey + 8, P.mouth);
      px.set(e2 + 1, ey + 8, P.mouth);
      px.set(e2, ey + 9, P.mouth);
  }

  if (arms === 'up') px.ellipse(cx + rx - 0.8, cy - ry + 1.6, 2.3, 2.0, P.body, P.outline);
  else if (arms === 'out') px.ellipse(cx + rx + 0.4, cy - 1.0, 2.6, 2.0, P.body, P.outline);
  else px.ellipse(cx + rx + 0.4, cy + 5.2, 2.3, 1.9, P.body, P.outline);
  px.ellipse(...pose.front, P.foot, P.outline);

  return px;
}

/**
 * Lazily build the shared Kirby sprite sheet.
 * Shape: { width, height, animations: { name: { fps, loop, frames: [{ right, left }] } } }
 */
export const getKirbySpriteSheet = lazySheet(() =>
  buildSheet({
    width: KIRBY_SIZE,
    height: KIRBY_SIZE,
    draw: drawKirby,
    animations: {
      idle: { fps: 1, loop: true, poses: [{ feet: 'idle' }] },
      blink: { fps: 8, loop: false, poses: [{ feet: 'idle', eyes: 'blink' }] },
      walk: {
        fps: 10,
        loop: true,
        poses: [{ feet: 'stepA' }, { feet: 'idle', bob: -1 }, { feet: 'stepB' }, { feet: 'idle', bob: -1 }],
      },
      jump: { fps: 1, loop: true, poses: [{ feet: 'tuck', bob: -1, eyes: 'open' }] },
      fall: { fps: 1, loop: true, poses: [{ feet: 'idle', arms: 'out' }] },
      float: {
        fps: 3,
        loop: true,
        poses: [
          { feet: 'dangle', body: 'puff', mouth: 'closed', bob: -1 },
          { feet: 'dangle', body: 'puff', mouth: 'closed', bob: -2 },
        ],
      },
      flap: { fps: 8, loop: false, poses: [{ feet: 'dangle', body: 'puff', mouth: 'closed', arms: 'up', bob: -2 }] },
      inhale: {
        fps: 8,
        loop: true,
        poses: [
          { feet: 'idle', mouth: 'wide', eyes: 'open' },
          { feet: 'idle', mouth: 'wider', eyes: 'squint' },
        ],
      },
      full: { fps: 1, loop: true, poses: [{ feet: 'idle', body: 'full', eyes: 'squint', mouth: 'tiny' }] },
      fullWalk: {
        fps: 8,
        loop: true,
        poses: [
          { feet: 'stepA', body: 'full', eyes: 'squint', mouth: 'tiny' },
          { feet: 'stepB', body: 'full', eyes: 'squint', mouth: 'tiny' },
        ],
      },
      fullJump: { fps: 1, loop: true, poses: [{ feet: 'tuck', body: 'full', eyes: 'squint', mouth: 'tiny', bob: -1 }] },
      spit: { fps: 6, loop: false, poses: [{ feet: 'idle', mouth: 'wide', eyes: 'squint', arms: 'out' }] },
      exhale: { fps: 6, loop: false, poses: [{ feet: 'dangle', mouth: 'o', eyes: 'squint', bob: -1 }] },
      hurt: { fps: 1, loop: true, poses: [{ feet: 'idle', eyes: 'wince', mouth: 'o', arms: 'out', bob: -1 }] },
      victory: { fps: 4, loop: true, poses: [{ feet: 'tuck', eyes: 'happy', arms: 'up', bob: -3 }, { feet: 'idle', eyes: 'happy', arms: 'up' }] },
    },
  }),
);
