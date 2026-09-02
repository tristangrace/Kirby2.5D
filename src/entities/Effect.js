import { SpriteEntity } from './SpriteEntity.js';
import { getPoofSheet, getSplashSheet, getHitSheet, getSparkleSheet } from '../gfx/sprites/FxSprites.js';

const SHEETS = {
  poof: getPoofSheet,
  splash: getSplashSheet,
  hit: getHitSheet,
  sparkle: getSparkleSheet,
};

/**
 * A one-shot animated billboard (puff of smoke, splash, hit flash). Removes
 * itself when its animation ends. Spawn with:
 *   game.spawn('effect', { kind: 'poof', x, y, z })
 */
export class Effect extends SpriteEntity {
  static type = 'effect';

  constructor(game, { kind = 'poof', y = null, rise = 0, ...opts } = {}) {
    const factory = SHEETS[kind];
    if (!factory) throw new Error('Unknown effect: ' + kind);
    super(game, opts, factory());
    this.kind = kind;
    this.rise = rise;
    this.team = 'neutral';
    this.shadow.visible = false;
    if (y != null) this.position.y = y;
  }

  onAnimationEnd() {
    this.destroy();
  }

  updateVisual() {
    super.updateVisual();
    this.shadow.visible = false;
  }

  update(dt) {
    this.position.y += this.rise * dt;
    super.update(dt);
  }
}
