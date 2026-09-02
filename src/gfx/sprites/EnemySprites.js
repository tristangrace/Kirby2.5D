import { PixelBuffer } from '../PixelArt.js';
import { buildSheet, lazySheet } from './sheet.js';

/**
 * The Green Greens regulars, drawn the same way as Kirby: stacked ellipses
 * with hard outlines, authored facing RIGHT at 24px (20px for Bronto Burt).
 */
const OUTLINE = '#1c1024';

const FEET_24 = {
  idle: { back: [8.5, 19.6, 4.0, 2.3], front: [14.5, 20.6, 4.6, 2.6] },
  stepA: { back: [14.5, 19.6, 4.0, 2.3], front: [9.0, 20.6, 4.6, 2.6] },
  stepB: { back: [7.5, 19.6, 4.0, 2.3], front: [15.5, 20.6, 4.6, 2.6] },
  tuck: { back: [9.5, 19.0, 3.6, 2.1], front: [13.5, 19.6, 4.0, 2.3] },
};

/** Ellipse clipped to an existing mask (used for face patches that must stay inside the body). */
function clippedEllipse(px, clip, cx, cy, rx, ry, fill, outline) {
  const mask = px.ellipseMask(cx, cy, rx, ry);
  for (let i = 0; i < mask.length; i++) if (!clip[i]) mask[i] = 0;
  if (outline) {
    // outline drawn first, then fill on top, so it only shows where it does not overlap the fill
    const grown = px.ellipseMask(cx, cy, rx + 1, ry + 1);
    for (let i = 0; i < grown.length; i++) if (grown[i] && clip[i] && !mask[i]) px.px[i] = outline;
  }
  px.fillMask(mask, fill);
  return mask;
}

function shadeBody(px, bodyMask, cx, cy, rx, ry, shade) {
  const lit = px.ellipseMask(cx - 0.6, cy - 0.8, rx - 0.7, ry - 0.7);
  for (let i = 0; i < bodyMask.length; i++) if (bodyMask[i] && !lit[i]) px.px[i] = shade;
}

function winceEyes(px, x, y, color) {
  px.set(x, y, color);
  px.set(x + 1, y + 1, color);
  px.set(x + 1, y + 2, color);
  px.set(x, y + 3, color);
}

// ---------------------------------------------------------------- Waddle Dee
export const DEE_PALETTE = {
  body: '#f5924a',
  shade: '#d9702f',
  face: '#ffe9c9',
  foot: '#e0653a',
  footShade: '#b84a26',
  blush: '#f07060',
};

export function drawWaddleDee({ bob = 0, feet = 'idle', eyes = 'open', arms = 'normal' } = {}) {
  const P = DEE_PALETTE;
  const px = new PixelBuffer(24, 24);
  const cx = 11.5;
  const cy = 11 + bob;
  const pose = FEET_24[feet];

  px.ellipse(...pose.back, P.footShade, OUTLINE);
  if (arms === 'out') px.ellipse(4.0, 10.5 + bob, 2.5, 2.0, P.shade, OUTLINE);
  else px.ellipse(4.8, 13.5 + bob, 2.4, 2.2, P.shade, OUTLINE);

  const body = px.ellipse(cx, cy, 7.3, 6.9, P.body, OUTLINE);
  shadeBody(px, body, cx, cy, 7.3, 6.9, P.shade);
  clippedEllipse(px, body, 13.5, 12.6 + bob, 5.4, 4.6, P.face, P.shade);

  const ey = 9 + bob;
  if (eyes === 'wince') {
    winceEyes(px, 12, ey, OUTLINE);
    winceEyes(px, 15, ey, OUTLINE);
  } else if (eyes === 'blink') {
    px.rect(12, ey + 3, 2, 1, OUTLINE);
    px.rect(15, ey + 3, 2, 1, OUTLINE);
  } else {
    px.rect(12, ey, 2, 4, OUTLINE);
    px.rect(15, ey, 2, 4, OUTLINE);
  }
  px.rect(10, ey + 5, 2, 1, P.blush);
  px.rect(17, ey + 5, 2, 1, P.blush);

  if (arms === 'out') px.ellipse(19.5, 10.5 + bob, 2.5, 2.0, P.body, OUTLINE);
  else px.ellipse(19.2, 16.2 + bob, 2.3, 1.9, P.body, OUTLINE);
  px.ellipse(...pose.front, P.foot, OUTLINE);
  return px;
}

export const getWaddleDeeSheet = lazySheet(() =>
  buildSheet({
    width: 24,
    height: 24,
    draw: drawWaddleDee,
    animations: {
      idle: { fps: 1, loop: true, poses: [{}] },
      blink: { fps: 6, loop: false, poses: [{ eyes: 'blink' }] },
      walk: { fps: 8, loop: true, poses: [{ feet: 'stepA' }, { bob: -1 }, { feet: 'stepB' }, { bob: -1 }] },
      inhaled: { fps: 12, loop: true, poses: [{ feet: 'tuck', eyes: 'wince', arms: 'out', bob: -1 }, { feet: 'tuck', eyes: 'wince', arms: 'out', bob: -2 }] },
      hurt: { fps: 1, loop: true, poses: [{ eyes: 'wince', arms: 'out' }] },
    },
  }),
);

// ---------------------------------------------------------------- Waddle Doo
export function drawWaddleDoo({ bob = 0, feet = 'idle', eye = 'open', arms = 'normal' } = {}) {
  const P = DEE_PALETTE;
  const px = new PixelBuffer(24, 24);
  const cx = 11.5;
  const cy = 11 + bob;
  const pose = FEET_24[feet];

  px.ellipse(...pose.back, P.footShade, OUTLINE);
  if (arms === 'out') px.ellipse(4.0, 10.5 + bob, 2.5, 2.0, P.shade, OUTLINE);
  else px.ellipse(4.8, 13.5 + bob, 2.4, 2.2, P.shade, OUTLINE);

  const body = px.ellipse(cx, cy, 7.3, 6.9, P.body, OUTLINE);
  shadeBody(px, body, cx, cy, 7.3, 6.9, P.shade);

  // One big eye with three lashes.
  const eyeY = 10 + bob;
  if (eye === 'wince') {
    px.line(10, eyeY - 2, 15, eyeY + 1, OUTLINE);
    px.line(15, eyeY + 1, 10, eyeY + 4, OUTLINE);
  } else {
    px.ellipse(13.5, eyeY, 3.6, 4.2, '#ffffff', OUTLINE);
    const irisR = eye === 'charge' ? 2.6 : 1.9;
    px.ellipse(14.4, eyeY + 0.5, irisR, irisR + 0.8, OUTLINE, null);
    px.set(14, eyeY - 1, '#ffffff');
    if (eye === 'charge') {
      px.set(13, eyeY, '#ffe680');
      px.set(15, eyeY + 1, '#ffe680');
    }
  }
  const lashLen = eye === 'charge' ? 3 : 2;
  px.line(11, eyeY - 4, 10, eyeY - 4 - lashLen, OUTLINE);
  px.line(13, eyeY - 5, 13, eyeY - 5 - lashLen, OUTLINE);
  px.line(16, eyeY - 4, 17, eyeY - 4 - lashLen, OUTLINE);
  px.rect(8, eyeY + 6, 2, 1, P.blush);
  px.rect(17, eyeY + 6, 2, 1, P.blush);

  if (arms === 'out') px.ellipse(19.5, 10.5 + bob, 2.5, 2.0, P.body, OUTLINE);
  else px.ellipse(19.2, 16.2 + bob, 2.3, 1.9, P.body, OUTLINE);
  px.ellipse(...pose.front, P.foot, OUTLINE);
  return px;
}

export const getWaddleDooSheet = lazySheet(() =>
  buildSheet({
    width: 24,
    height: 24,
    draw: drawWaddleDoo,
    animations: {
      idle: { fps: 1, loop: true, poses: [{}] },
      walk: { fps: 8, loop: true, poses: [{ feet: 'stepA' }, { bob: -1 }, { feet: 'stepB' }, { bob: -1 }] },
      charge: { fps: 6, loop: true, poses: [{ eye: 'charge' }, { eye: 'charge', bob: -1 }] },
      inhaled: { fps: 12, loop: true, poses: [{ feet: 'tuck', eye: 'wince', arms: 'out', bob: -1 }, { feet: 'tuck', eye: 'wince', arms: 'out', bob: -2 }] },
      hurt: { fps: 1, loop: true, poses: [{ eye: 'wince', arms: 'out' }] },
    },
  }),
);

// ---------------------------------------------------------------- Bronto Burt
export const BURT_PALETTE = {
  body: '#f28ab0',
  shade: '#d06090',
  wing: '#f4f8ff',
  wingShade: '#c8d8f0',
  foot: '#8a3c5c',
  blush: '#ff5a8a',
};

export function drawBrontoBurt({ bob = 0, wings = 'up', eyes = 'open' } = {}) {
  const P = BURT_PALETTE;
  const px = new PixelBuffer(20, 20);
  const cx = 9.5;
  const cy = 11 + bob;

  // Wings behind the body.
  const wy = wings === 'up' ? 4.5 + bob : 9 + bob;
  const wry = wings === 'up' ? 3.2 : 2.2;
  px.ellipse(3.5, wy, 3.6, wry, P.wing, P.wingShade);
  px.ellipse(15.5, wy, 3.6, wry, P.wing, P.wingShade);

  px.ellipse(6.5, 17 + bob, 2.2, 1.5, P.foot, OUTLINE);
  px.ellipse(12, 17.4 + bob, 2.4, 1.6, P.foot, OUTLINE);

  const body = px.ellipse(cx, cy, 5.9, 5.5, P.body, OUTLINE);
  shadeBody(px, body, cx, cy, 5.9, 5.5, P.shade);

  const ey = 8 + bob;
  if (eyes === 'wince') {
    winceEyes(px, 8, ey, OUTLINE);
    winceEyes(px, 11, ey, OUTLINE);
  } else {
    px.rect(8, ey, 2, 5, OUTLINE);
    px.rect(11, ey, 2, 5, OUTLINE);
    px.set(8, ey, '#ffffff');
    px.set(11, ey, '#ffffff');
  }
  px.rect(6, ey + 6, 2, 1, P.blush);
  px.rect(13, ey + 6, 2, 1, P.blush);
  px.set(10, ey + 7, '#8a2040');
  return px;
}

export const getBrontoBurtSheet = lazySheet(() =>
  buildSheet({
    width: 20,
    height: 20,
    draw: drawBrontoBurt,
    animations: {
      idle: { fps: 10, loop: true, poses: [{ wings: 'up' }, { wings: 'down', bob: 1 }] },
      fly: { fps: 10, loop: true, poses: [{ wings: 'up' }, { wings: 'down', bob: 1 }] },
      inhaled: { fps: 12, loop: true, poses: [{ wings: 'up', eyes: 'wince' }, { wings: 'down', eyes: 'wince' }] },
      hurt: { fps: 1, loop: true, poses: [{ wings: 'down', eyes: 'wince' }] },
    },
  }),
);

// ---------------------------------------------------------------- Cappy
export const CAPPY_PALETTE = {
  cap: '#c8663a',
  capShade: '#9c4a26',
  spot: '#f6dfb8',
  body: '#f3e0b0',
  bodyShade: '#d8bc84',
  foot: '#b8863c',
  footShade: '#8c6428',
};

export function drawCappy({ bob = 0, feet = 'idle', eyes = 'open', cap = true } = {}) {
  const P = CAPPY_PALETTE;
  const px = new PixelBuffer(24, 24);
  const pose = FEET_24[feet];

  px.ellipse(...pose.back, P.footShade, OUTLINE);
  const cy = 15 + bob;
  const body = px.ellipse(11.5, cy, 5.8, 5.4, P.body, OUTLINE);
  shadeBody(px, body, 11.5, cy, 5.8, 5.4, P.bodyShade);

  const ey = cy - 2;
  if (eyes === 'wince') {
    winceEyes(px, 11, ey, OUTLINE);
    winceEyes(px, 14, ey, OUTLINE);
  } else {
    px.rect(11, ey, 2, 4, OUTLINE);
    px.rect(14, ey, 2, 4, OUTLINE);
  }
  px.set(13, ey + 5, '#8a5040');

  if (cap) {
    const capMask = px.ellipse(11.5, 8 + bob, 9.6, 4.9, P.cap, OUTLINE);
    const under = px.ellipseMask(11.5, 10.5 + bob, 9.6, 2.4);
    for (let i = 0; i < capMask.length; i++) if (capMask[i] && under[i]) px.px[i] = P.capShade;
    clippedEllipse(px, capMask, 6.5, 6.5 + bob, 1.8, 1.4, P.spot, null);
    clippedEllipse(px, capMask, 13, 5.5 + bob, 2.2, 1.6, P.spot, null);
    clippedEllipse(px, capMask, 17.5, 7.5 + bob, 1.6, 1.2, P.spot, null);
  }
  px.ellipse(...pose.front, P.foot, OUTLINE);
  return px;
}

export const getCappySheet = lazySheet(() =>
  buildSheet({
    width: 24,
    height: 24,
    draw: drawCappy,
    animations: {
      idle: { fps: 1, loop: true, poses: [{}] },
      walk: { fps: 7, loop: true, poses: [{ feet: 'stepA' }, { bob: -1 }, { feet: 'stepB' }, { bob: -1 }] },
      inhaled: { fps: 12, loop: true, poses: [{ feet: 'tuck', eyes: 'wince', bob: -1 }, { feet: 'tuck', eyes: 'wince', bob: -2 }] },
      hurt: { fps: 1, loop: true, poses: [{ eyes: 'wince' }] },
    },
  }),
);
