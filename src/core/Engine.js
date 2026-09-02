import * as THREE from 'three';

/**
 * Owns the WebGL renderer, the low-resolution "pixel" canvas and the frame loop.
 *
 * The scene is rendered at (window size / pixelScale) and upscaled with CSS
 * `image-rendering: pixelated`, which is what gives everything the chunky
 * Game Boy look without any post-processing.
 *
 * pixelScale 'auto' picks a scale that keeps the render roughly
 * TARGET_RENDER_HEIGHT pixels tall, so a 1080p TV, a laptop and an iPad all
 * show a similar amount of world.
 */
const TARGET_RENDER_HEIGHT = 360;

export class Engine {
  constructor({ pixelScale = 'auto', maxDt = 1 / 20 } = {}) {
    this.pixelScale = pixelScale;
    this.maxDt = maxDt;
    this.width = 2;
    this.height = 2;
    this.elapsed = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;

    this._resizeListeners = new Set();
    this._onResize = () => this.resize();
    this._raf = 0;
    this._last = 0;
    window.addEventListener('resize', this._onResize);
  }

  mount(container) {
    container.appendChild(this.canvas);
    this.resize();
  }

  /** The scale actually in use this frame (resolves 'auto'). */
  get effectivePixelScale() {
    if (this.pixelScale === 'auto') return Math.max(1, Math.round(window.innerHeight / TARGET_RENDER_HEIGHT));
    return this.pixelScale;
  }

  resize() {
    const scale = this.effectivePixelScale;
    // Even dimensions keep the pixel grid aligned to the canvas centre.
    const w = Math.max(2, Math.floor(window.innerWidth / scale) & ~1);
    const h = Math.max(2, Math.floor(window.innerHeight / scale) & ~1);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false); // false: CSS keeps the canvas full-window
    for (const fn of this._resizeListeners) fn(w, h);
  }

  /** Subscribe to render-size changes. Fires immediately with the current size. */
  onResize(fn) {
    this._resizeListeners.add(fn);
    fn(this.width, this.height);
    return () => this._resizeListeners.delete(fn);
  }

  /** Start the frame loop; `update(dt, elapsed)` runs once per animation frame. */
  start(update) {
    this.stop();
    this._last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min((now - this._last) / 1000, this.maxDt);
      this._last = now;
      this.elapsed += dt;
      update(dt, this.elapsed);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
