import { PixelBuffer, seededRandom, hashString } from './PixelArt.js';

/**
 * Procedural 16x16 tile surface textures, keyed by name.
 *
 * To add a surface: add an entry to SURFACES with a `paint(px, rnd)` function
 * (and an optional `animate(tex, elapsed)`), then reference the name from a
 * tile type in world/Tiles.js.
 */
const SIZE = 16;
const cache = new Map();

function speckle(px, rnd, count, color) {
  for (let i = 0; i < count; i++) px.set((rnd() * SIZE) | 0, (rnd() * SIZE) | 0, color);
}

const SURFACES = {
  grass: {
    paint(px, rnd) {
      px.rect(0, 0, SIZE, SIZE, '#5fc84e');
      speckle(px, rnd, 26, '#7be066');
      speckle(px, rnd, 14, '#47a83a');
      for (let i = 0; i < 5; i++) {
        const x = (rnd() * SIZE) | 0;
        const y = (rnd() * (SIZE - 2)) | 0;
        px.set(x, y, '#3d9432');
        px.set(x, y + 1, '#3d9432');
      }
    },
  },
  dirt: {
    paint(px, rnd) {
      px.rect(0, 0, SIZE, SIZE, '#a86c3c');
      speckle(px, rnd, 24, '#8f5730');
      speckle(px, rnd, 12, '#c1834a');
    },
  },
  sand: {
    paint(px, rnd) {
      px.rect(0, 0, SIZE, SIZE, '#e8d48a');
      speckle(px, rnd, 20, '#f4e4a6');
      speckle(px, rnd, 10, '#cbb66e');
    },
  },
  stone: {
    paint(px, rnd) {
      px.rect(0, 0, SIZE, SIZE, '#9aa0ad');
      speckle(px, rnd, 20, '#b3b8c3');
      // brick seams
      px.rect(0, 7, SIZE, 1, '#7c8290');
      px.rect(7, 0, 1, 7, '#7c8290');
      px.rect(3, 8, 1, 8, '#7c8290');
      px.rect(12, 8, 1, 8, '#7c8290');
    },
  },
  water: {
    paint(px, rnd) {
      px.rect(0, 0, SIZE, SIZE, '#4aa3e8');
      for (let i = 0; i < 6; i++) {
        px.rect((rnd() * (SIZE - 4)) | 0, (rnd() * SIZE) | 0, 3, 1, '#8fd0ff');
      }
      for (let i = 0; i < 4; i++) {
        px.rect((rnd() * (SIZE - 3)) | 0, (rnd() * SIZE) | 0, 2, 1, '#2f7fc4');
      }
    },
    animate(tex, elapsed) {
      // Drift in whole texels so the water stays pixel-crisp.
      tex.offset.x = Math.floor(elapsed * 3) / SIZE;
    },
  },
};

/** Return the shared texture for a surface name (built on first use). */
export function getTileTexture(name) {
  if (cache.has(name)) return cache.get(name);
  const surface = SURFACES[name];
  if (!surface) throw new Error('Unknown tile texture: ' + name);
  const px = new PixelBuffer(SIZE, SIZE);
  surface.paint(px, seededRandom(hashString(name)));
  const tex = px.toTexture();
  cache.set(name, tex);
  return tex;
}

/** Advance any animated surfaces. Called once per frame by the level. */
export function updateTextures(elapsed) {
  for (const [name, tex] of cache) {
    const anim = SURFACES[name].animate;
    if (anim) anim(tex, elapsed);
  }
}
