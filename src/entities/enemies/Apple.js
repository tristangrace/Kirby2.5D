import { Enemy } from '../Enemy.js';
import { getAppleSheet } from '../../gfx/sprites/FxSprites.js';

/**
 * An apple that has come to rest after Whispy Woods shook it loose. Harmless
 * on the ground; inhale it and spit it back as a star to hurt him.
 */
export class Apple extends Enemy {
  static type = 'apple';

  constructor(game, opts) {
    super(game, opts, getAppleSheet());
    this.hp = 1;
    this.contactDamage = 0;
    this.inhalable = true;
    this.radius = 0.26;
    this.height = 0.5;
    this.solid = false; // stars fly over resting apples instead of wasting themselves on them
    this.life = 14;
  }

  behave(dt) {
    this.stickToGround();
    this.life -= dt;
    if (this.life <= 0) this.die();
    this.setAnimation('idle');
  }
}
