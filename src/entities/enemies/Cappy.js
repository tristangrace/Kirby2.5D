import { Enemy } from '../Enemy.js';
import { getCappySheet } from '../../gfx/sprites/EnemySprites.js';

/** A walking mushroom. Dozes until Kirby wanders close, then toddles after him. */
export class Cappy extends Enemy {
  static type = 'cappy';

  constructor(game, opts) {
    super(game, opts, getCappySheet());
    this.hp = 2;
    this.speed = 0.9;
    this.radius = 0.36;
    this.height = 1.0;
    this.chaseSpeed = 1.7;
  }

  behave(dt) {
    this.stickToGround();
    const dist = this.distanceToPlayer();
    if (dist < 4.5 && dist > 0.6 && !this.player.flying) {
      const stuck = this.chase(dt, this.chaseSpeed);
      this.setAnimation(stuck ? 'idle' : 'walk');
    } else {
      this.wander(dt);
    }
  }
}
