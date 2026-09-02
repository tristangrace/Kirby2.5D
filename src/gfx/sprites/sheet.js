/**
 * Sprite sheet builder shared by every character.
 *
 *   buildSheet({
 *     width, height,
 *     draw: (pose) => PixelBuffer,          // frames are authored facing RIGHT
 *     animations: { idle: { fps: 1, loop: true, poses: [{}] }, ... },
 *   })
 *
 * returns { width, height, animations: { name: { fps, loop, frames: [{ right, left }] } } },
 * the shape SpriteEntity expects. Identical poses share one texture.
 */
export function buildSheet({ width, height, draw, animations }) {
  const cache = new Map();
  const frame = (pose) => {
    const key = JSON.stringify(pose);
    if (cache.has(key)) return cache.get(key);
    const px = draw(pose);
    const f = { right: px.toTexture(), left: px.flippedX().toTexture() };
    cache.set(key, f);
    return f;
  };

  const out = {};
  for (const [name, anim] of Object.entries(animations)) {
    out[name] = { fps: anim.fps ?? 1, loop: anim.loop ?? true, frames: anim.poses.map(frame) };
  }
  return { width, height, animations: out };
}

/** Memoise a sheet factory so all entities of a type share textures. */
export function lazySheet(factory) {
  let sheet = null;
  return () => (sheet ??= factory());
}
