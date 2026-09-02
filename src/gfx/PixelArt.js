import * as THREE from 'three';

/**
 * Tiny pixel-art toolkit. Every sprite and tile texture in the game is drawn
 * with this at authoring time (no image files), then uploaded as a
 * nearest-filtered CanvasTexture.
 */
export class PixelBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.px = new Array(width * height).fill(null);
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.px[y * this.width + x] : null;
  }

  set(x, y, color) {
    if (this.inBounds(x, y)) this.px[y * this.width + x] = color;
  }

  rect(x, y, w, h, color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, color);
  }

  /** Boolean mask of pixels whose centre lies inside the ellipse. */
  ellipseMask(cx, cy, rx, ry) {
    const mask = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) mask[y * this.width + x] = 1;
      }
    }
    return mask;
  }

  /** Boolean mask of pixels whose centre lies inside a polygon ([x, y] pairs, any winding). */
  polygonMask(points) {
    const mask = new Uint8Array(this.width * this.height);
    const n = points.length;
    for (let y = 0; y < this.height; y++) {
      const py = y + 0.5;
      for (let x = 0; x < this.width; x++) {
        const px = x + 0.5;
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, yi] = points[i];
          const [xj, yj] = points[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) mask[y * this.width + x] = 1;
      }
    }
    return mask;
  }

  /** Filled + outlined polygon. Returns the fill mask. */
  polygon(points, fill, outline) {
    const mask = this.polygonMask(points);
    this.fillMask(mask, fill);
    if (outline) this.outlineMask(mask, outline);
    return mask;
  }

  /** Five-pointed star centred on (cx, cy). `angle` rotates it (radians). */
  star(cx, cy, outer, inner, fill, outline, angle = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = angle + (i * Math.PI) / 5;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return this.polygon(pts, fill, outline);
  }

  /** 1px Bresenham line. */
  line(x0, y0, x1, y1, color) {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  fillMask(mask, color) {
    for (let i = 0; i < mask.length; i++) if (mask[i]) this.px[i] = color;
  }

  /**
   * Draw a 1px outline around a mask. Outline pixels overwrite whatever is
   * there already, which is how separate body parts stay visually distinct
   * (the Game Boy sprites had hard black outlines between every part).
   */
  outlineMask(mask, color) {
    const { width, height } = this;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) continue;
        const near =
          (x > 0 && mask[y * width + x - 1]) ||
          (x < width - 1 && mask[y * width + x + 1]) ||
          (y > 0 && mask[(y - 1) * width + x]) ||
          (y < height - 1 && mask[(y + 1) * width + x]);
        if (near) this.px[y * width + x] = color;
      }
    }
  }

  /** Filled + outlined ellipse in one go. Returns the fill mask. */
  ellipse(cx, cy, rx, ry, fill, outline) {
    const mask = this.ellipseMask(cx, cy, rx, ry);
    this.fillMask(mask, fill);
    if (outline) this.outlineMask(mask, outline);
    return mask;
  }

  flippedX() {
    const out = new PixelBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) out.set(this.width - 1 - x, y, this.get(x, y));
    }
    return out;
  }

  toCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }

  toTexture() {
    return makeTexture(this.toCanvas());
  }
}

/** Wrap a canvas as a crisp, non-mipmapped texture. */
export function makeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic PRNG (mulberry32) so procedural textures are stable run to run. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small string hash for seeding. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
