import { PixelBuffer } from '../PixelArt.js';
import { buildSheet, lazySheet } from './sheet.js';

/** Projectiles, pickups and one-shot effects. */
const OUTLINE = '#1c1024';

// ---------------------------------------------------------------- projectiles
export const getStarSheet = lazySheet(() =>
  buildSheet({
    width: 14,
    height: 14,
    draw: ({ angle }) => {
      const px = new PixelBuffer(14, 14);
      px.star(7, 7.2, 6.4, 2.9, '#ffe14a', OUTLINE, angle);
      px.set(6, 5, '#fff8c0');
      return px;
    },
    animations: {
      idle: { fps: 16, loop: true, poses: [{ angle: -1.571 }, { angle: -1.257 }, { angle: -0.942 }, { angle: -0.628 }] },
    },
  }),
);

export const getPuffSheet = lazySheet(() =>
  buildSheet({
    width: 12,
    height: 12,
    draw: ({ grow = 0 }) => {
      const px = new PixelBuffer(12, 12);
      const o = '#7aaad0';
      px.ellipse(6, 6.5, 4.2 + grow, 3.2 + grow, '#eaf6ff', o);
      px.ellipse(3.2, 7, 2.2, 2.0, '#ffffff', o);
      px.ellipse(8.8, 7, 2.2, 2.0, '#ffffff', o);
      px.ellipse(6, 4 - grow, 2.6, 2.2, '#ffffff', o);
      return px;
    },
    animations: { idle: { fps: 10, loop: true, poses: [{ grow: 0 }, { grow: 0.6 }] } },
  }),
);

export const getSparkSheet = lazySheet(() =>
  buildSheet({
    width: 10,
    height: 10,
    draw: ({ diag }) => {
      const px = new PixelBuffer(10, 10);
      const pts = diag
        ? [[5, 0.5], [6.4, 3.6], [9.5, 5], [6.4, 6.4], [5, 9.5], [3.6, 6.4], [0.5, 5], [3.6, 3.6]]
        : [[5, 1.5], [6, 4], [8.5, 5], [6, 6], [5, 8.5], [4, 6], [1.5, 5], [4, 4]];
      px.polygon(pts, '#fff3a0', '#e0a020');
      px.set(5, 5, '#ffffff');
      px.set(4, 5, '#ffffff');
      return px;
    },
    animations: { idle: { fps: 12, loop: true, poses: [{ diag: 0 }, { diag: 1 }] } },
  }),
);

export const getAppleSheet = lazySheet(() =>
  buildSheet({
    width: 14,
    height: 14,
    draw: ({ tilt = 0 }) => {
      const px = new PixelBuffer(14, 14);
      const body = px.ellipse(7, 8.5, 5.4, 4.8, '#e8303c', OUTLINE);
      const lit = px.ellipseMask(6.2, 7.6, 4.6, 4.0);
      for (let i = 0; i < body.length; i++) if (body[i] && !lit[i]) px.px[i] = '#b81c2c';
      px.rect(4, 6, 2, 1, '#ff9aa0');
      px.set(4, 7, '#ff9aa0');
      px.rect(7 + tilt, 2, 1, 3, '#6b4224');
      px.ellipse(9 + tilt, 3, 1.8, 1.1, '#5cc251', OUTLINE);
      return px;
    },
    animations: {
      idle: { fps: 1, loop: true, poses: [{ tilt: 0 }] },
      roll: { fps: 8, loop: true, poses: [{ tilt: 0 }, { tilt: 1 }, { tilt: 0 }, { tilt: -1 }] },
      inhaled: { fps: 8, loop: true, poses: [{ tilt: 1 }, { tilt: -1 }] },
      hurt: { fps: 1, loop: true, poses: [{ tilt: 0 }] },
    },
  }),
);

// ---------------------------------------------------------------- pickups
export const getMaximTomatoSheet = lazySheet(() =>
  buildSheet({
    width: 16,
    height: 16,
    draw: ({ bob = 0 }) => {
      const px = new PixelBuffer(16, 16);
      const cy = 9.5 + bob;
      const body = px.ellipse(8, cy, 6.8, 5.6, '#e8303c', OUTLINE);
      const lit = px.ellipseMask(7.2, cy - 0.8, 6.0, 4.9);
      for (let i = 0; i < body.length; i++) if (body[i] && !lit[i]) px.px[i] = '#b81c2c';
      // calyx
      px.ellipse(8, cy - 5, 3.6, 1.6, '#3fa63a', OUTLINE);
      px.set(5, cy - 6, '#3fa63a');
      px.set(11, cy - 6, '#3fa63a');
      px.set(8, cy - 7, '#3fa63a');
      // the M
      const my = Math.round(cy - 2);
      px.rect(5, my, 1, 5, '#ffffff');
      px.rect(10, my, 1, 5, '#ffffff');
      px.set(6, my + 1, '#ffffff');
      px.set(7, my + 2, '#ffffff');
      px.set(8, my + 2, '#ffffff');
      px.set(9, my + 1, '#ffffff');
      return px;
    },
    animations: { idle: { fps: 2, loop: true, poses: [{ bob: 0 }, { bob: -1 }] } },
  }),
);

// ---------------------------------------------------------------- effects
function puffs(px, cx, cy, radius, size, count, fill, outline, phase = 0) {
  for (let i = 0; i < count; i++) {
    const a = phase + (i * Math.PI * 2) / count;
    px.ellipse(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * 0.7, size, size * 0.85, fill, outline);
  }
}

export const getPoofSheet = lazySheet(() =>
  buildSheet({
    width: 28,
    height: 28,
    draw: ({ step }) => {
      const px = new PixelBuffer(28, 28);
      if (step === 0) {
        px.ellipse(14, 15, 6, 5, '#ffffff', '#c8c8dc');
        puffs(px, 14, 15, 5, 3, 5, '#f4f4ff', '#c8c8dc', 0.3);
      } else if (step === 1) {
        puffs(px, 14, 15, 8, 3.2, 6, '#f4f4ff', '#c8c8dc', 0.8);
      } else {
        puffs(px, 14, 15, 11, 2.2, 6, '#ffffff', '#d8d8ea', 1.3);
        for (let i = 0; i < 4; i++) {
          const a = 0.4 + (i * Math.PI) / 2;
          px.star(14 + Math.cos(a) * 9, 15 + Math.sin(a) * 6.5, 2.6, 1.1, '#ffe14a', null);
        }
      }
      return px;
    },
    animations: { idle: { fps: 12, loop: false, poses: [{ step: 0 }, { step: 1 }, { step: 2 }] } },
  }),
);

export const getSplashSheet = lazySheet(() =>
  buildSheet({
    width: 28,
    height: 28,
    draw: ({ step }) => {
      const px = new PixelBuffer(28, 28);
      const fill = '#8fd0ff';
      const o = '#2f7fc4';
      const h = [22, 16, 10][step];
      px.ellipse(14, 25, 8 + step * 2, 2.2, fill, o);
      for (const [dx, dy] of [[-6, 2], [-2, -3], [3, -1], [7, 3]]) {
        px.ellipse(14 + dx * (1 + step * 0.3), h + dy, 1.6, 2.2, fill, o);
      }
      return px;
    },
    animations: { idle: { fps: 10, loop: false, poses: [{ step: 0 }, { step: 1 }, { step: 2 }] } },
  }),
);

export const getHitSheet = lazySheet(() =>
  buildSheet({
    width: 16,
    height: 16,
    draw: ({ step }) => {
      const px = new PixelBuffer(16, 16);
      if (step === 0) px.star(8, 8, 7, 3.2, '#ffffff', '#ffb040', 0.3);
      else px.star(8, 8, 7.5, 2.4, '#ffe14a', '#ff7a30', 0.9);
      return px;
    },
    animations: { idle: { fps: 14, loop: false, poses: [{ step: 0 }, { step: 1 }] } },
  }),
);

export const getSparkleSheet = lazySheet(() =>
  buildSheet({
    width: 20,
    height: 20,
    draw: ({ step }) => {
      const px = new PixelBuffer(20, 20);
      const r = 3 + step * 3;
      for (let i = 0; i < 5; i++) {
        const a = step * 0.5 + (i * Math.PI * 2) / 5;
        px.star(10 + Math.cos(a) * r, 10 + Math.sin(a) * r, 2.6, 1.1, '#ffe14a', '#e0a020');
      }
      return px;
    },
    animations: { idle: { fps: 10, loop: false, poses: [{ step: 0 }, { step: 1 }, { step: 2 }] } },
  }),
);

// ---------------------------------------------------------------- abilities and shop
export const getSlashSheet = lazySheet(() =>
  buildSheet({
    width: 22,
    height: 22,
    draw: ({ step }) => {
      const px = new PixelBuffer(22, 22);
      const outer = px.ellipseMask(11, 11, 10, 10);
      const inner = px.ellipseMask(7 - step, 11, 8.5, 9);
      for (let i = 0; i < outer.length; i++) if (inner[i]) outer[i] = 0;
      px.fillMask(outer, step ? '#dfeeff' : '#ffffff');
      px.outlineMask(outer, '#5f8fc4');
      return px;
    },
    animations: { idle: { fps: 12, loop: true, poses: [{ step: 0 }, { step: 1 }] } },
  }),
);

export const getFlameSheet = lazySheet(() =>
  buildSheet({
    width: 12,
    height: 12,
    draw: ({ flick }) => {
      const px = new PixelBuffer(12, 12);
      const o = '#b8300f';
      px.ellipse(6, 8, 4.2, 3.4, '#ff8a2a', o);
      px.ellipse(6 + flick, 4.5, 2.4, 3.6, '#ffb03a', o);
      px.ellipse(6, 8, 2, 2, '#fff1a8', null);
      return px;
    },
    animations: { idle: { fps: 14, loop: true, poses: [{ flick: -1 }, { flick: 1 }] } },
  }),
);

export const getPointStarSheet = lazySheet(() =>
  buildSheet({
    width: 10,
    height: 10,
    draw: ({ angle, bob }) => {
      const px = new PixelBuffer(10, 10);
      px.star(5, 5.3 + bob, 4.6, 2.0, '#ffe14a', OUTLINE, angle);
      px.set(4, 4 + bob, '#fff8c0');
      return px;
    },
    animations: { idle: { fps: 6, loop: true, poses: [{ angle: -1.571, bob: 0 }, { angle: -1.257, bob: -1 }, { angle: -0.942, bob: 0 }, { angle: -1.257, bob: -1 }] } },
  }),
);

export const getShopSheet = lazySheet(() =>
  buildSheet({
    width: 36,
    height: 36,
    draw: ({ flag }) => {
      const px = new PixelBuffer(36, 36);
      // posts
      px.rect(5, 12, 2, 20, '#8c5a2b');
      px.rect(29, 12, 2, 20, '#8c5a2b');
      px.rect(5, 12, 1, 20, '#6b4224');
      px.rect(29, 12, 1, 20, '#6b4224');
      // counter
      px.rect(3, 23, 30, 10, '#c98c4e');
      px.rect(3, 27, 30, 1, '#8c5a2b');
      px.rect(3, 31, 30, 1, '#8c5a2b');
      px.outlineMask(px.polygonMask([[3, 23], [33, 23], [33, 33], [3, 33]]), OUTLINE);
      // wares
      px.ellipse(11, 21.5, 2.4, 2.2, '#e8303c', OUTLINE);
      px.ellipse(18, 21, 2.6, 2.4, '#e8303c', OUTLINE);
      px.ellipse(18, 18.5, 2, 1, '#3fa63a', OUTLINE);
      px.star(26, 20.5, 3.2, 1.4, '#ffe14a', OUTLINE);
      // awning: striped trapezoid
      const awn = px.polygonMask([[1, 5], [35, 5], [32, 13], [4, 13]]);
      for (let i = 0; i < awn.length; i++) if (awn[i]) px.px[i] = ((i % 36) >> 2) % 2 ? '#ffffff' : '#e8303c';
      px.outlineMask(awn, OUTLINE);
      px.rect(3, 2, 30, 3, '#e8303c');
      px.outlineMask(px.polygonMask([[3, 2], [33, 2], [33, 5], [3, 5]]), OUTLINE);
      // little flag on top
      px.rect(18, 0, 1, 3, '#6b4224');
      px.rect(19, 0 + flag, 3, 2, '#ffcb2e');
      return px;
    },
    animations: { idle: { fps: 3, loop: true, poses: [{ flag: 0 }, { flag: 1 }] } },
  }),
);
