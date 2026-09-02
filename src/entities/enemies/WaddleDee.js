import { Enemy } from '../Enemy.js';
import { getWaddleDeeSheet } from '../../gfx/sprites/EnemySprites.js';

/** The friendliest enemy in Dream Land. Wanders, blinks, bumps into Kirby. */
export class WaddleDee extends Enemy {
  static type = 'waddleDee';

  constructor(game, opts) {
    super(game, opts, getWaddleDeeSheet());
    this.hp = 1;
    this.speed = 1.3;
    this.blinkTimer = 1 + Math.random() * 3;
  }

  behave(dt) {
    this.stickToGround();
    this.wander(dt);
    if (!this.walking) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.setAnimation('blink', true);
        this.blinkTimer = 2 + Math.random() * 3;
      }
    }
  }

  onAnimationEnd(name) {
    if (name === 'blink') this.setAnimation('idle');
  }
}
