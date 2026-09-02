import { PixelBuffer } from '../PixelArt.js';

/**
 * Kirby, drawn in the proportions of the Game Boy "Kirby's Dream Land" sprite
 * (round body, stubby arms, two big feet, tall oval eyes, hard black outline)
 * but in colour. Every frame is built from ellipses so new poses are cheap to
 * add: tweak the numbers, do not hand-edit pixel strings.
 *
 * Frames are authored facing RIGHT; the sheet also carries a mirrored copy.
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
};

export const KIRBY_SIZE = 24;

// [cx, cy, rx, ry] for the back and front foot in each pose.
const FEET = {
  idle: { back: [8.5, 19.6, 4.0, 2.3], front: [14.5, 20.6, 4.6, 2.6] },
  stepA: { back: [14.5, 19.6, 4.0, 2.3], front: [9.0, 20.6, 4.6, 2.6] },
  stepB: { back: [7.5, 19.6, 4.0, 2.3], front: [15.5, 20.6, 4.6, 2.6] },
};

/**
 * @param {object} pose
 * @param {number} [pose.bob] vertical offset of the body in pixels (negative = up)
 * @param {'idle'|'stepA'|'stepB'} [pose.feet]
 * @param {boolean} [pose.blink]
 */
export function drawKirby({ bob = 0, feet = 'idle', blink = false } = {}) {
  const P = KIRBY_PALETTE;
  const px = new PixelBuffer(KIRBY_SIZE, KIRBY_SIZE);
  const cx = 11.5;
  const cy = 11 + bob;
  const pose = FEET[feet];

  // Draw order = depth order: back foot, back arm, body, face, front arm, front foot.
  px.ellipse(...pose.back, P.footShade, P.outline);
  px.ellipse(4.8, 13.5 + bob, 2.4, 2.2, P.bodyShade, P.outline);

  const body = px.ellipse(cx, cy, 7.3, 6.9, P.body, P.outline);
  // Shaded crescent along the lower-right rim gives the ball some roundness.
  const lit = px.ellipseMask(cx - 0.6, cy - 0.8, 6.6, 6.2);
  for (let i = 0; i < body.length; i++) if (body[i] && !lit[i]) px.px[i] = P.bodyShade;
  // Specular gleam, upper-left.
  px.set(8, cy - 5, P.bodyLight);
  px.set(9, cy - 5, P.bodyLight);
  px.set(7, cy - 4, P.bodyLight);

  // Face (eyes sit toward the facing side).
  const ey = 6 + bob;
  if (blink) {
    px.rect(12, ey + 4, 2, 1, P.eye);
    px.rect(15, ey + 4, 2, 1, P.eye);
  } else {
    px.rect(12, ey, 2, 6, P.eye);
    px.rect(15, ey, 2, 6, P.eye);
    px.rect(12, ey, 1, 2, P.eyeShine);
    px.rect(15, ey, 1, 2, P.eyeShine);
  }
  px.rect(9, ey + 7, 2, 1, P.blush);
  px.rect(16, ey + 7, 2, 1, P.blush);
  px.set(13, ey + 8, P.mouth);
  px.set(15, ey + 8, P.mouth);
  px.set(14, ey + 9, P.mouth);

  px.ellipse(19.2, 16.2 + bob, 2.3, 1.9, P.body, P.outline);
  px.ellipse(...pose.front, P.foot, P.outline);

  return px;
}

let sheet = null;

/**
 * Lazily build the shared Kirby sprite sheet.
 * Shape: { width, height, animations: { name: { fps, loop, frames: [{ right, left }] } } }
 */
export function getKirbySpriteSheet() {
  if (sheet) return sheet;

  const frame = (pose) => {
    const px = drawKirby(pose);
    return { right: px.toTexture(), left: px.flippedX().toTexture() };
  };

  sheet = {
    width: KIRBY_SIZE,
    height: KIRBY_SIZE,
    animations: {
      idle: { fps: 1, loop: true, frames: [frame({ feet: 'idle' })] },
      blink: { fps: 8, loop: false, frames: [frame({ feet: 'idle', blink: true })] },
      walk: {
        fps: 10,
        loop: true,
        frames: [
          frame({ feet: 'stepA' }),
          frame({ feet: 'idle', bob: -1 }),
          frame({ feet: 'stepB' }),
          frame({ feet: 'idle', bob: -1 }),
        ],
      },
    },
  };
  return sheet;
}
