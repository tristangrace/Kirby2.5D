import { SpriteEntity } from '../SpriteEntity.js';
import { getPointStarSheet } from '../../gfx/sprites/FxSprites.js';

/**
 * A point star: the shop's currency. Placed in levels or popped out of
 * defeated enemies (`pop: true` gives it a little arc), collected on touch.
 */
export class PointStar extends SpriteEntity {
  static type = 'pointStar';

  constructor(game, { pop = false, life = Infinity, ...opts } = {}) {
    super(game, opts, getPointStarSheet());
    this.team = 'neutral';
    this.radius = 0.24;
    this.height = 0.5;
    this.airborne = true;
    this.life = life;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.settled = !pop;
    if (pop) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 1.5;
      this.vx = Math.cos(a) * s;
      this.vz = Math.sin(a) * s;
      this.vy = 3.5 + Math.random() * 2;
      this.position.y = this.groundY + 0.3;
    }
  }

  update(dt) {
    if (!this.settled) {
      this.vy -= 14 * dt;
      this.tryMove(this.vx * dt, this.vz * dt);
      this.position.y += this.vy * dt;
      this.refreshGround();
      if (this.position.y <= this.groundY && this.vy < 0) {
        this.position.y = this.groundY;
        this.vy = -this.vy * 0.35;
        this.vx *= 0.5;
        this.vz *= 0.5;
        if (Math.abs(this.vy) < 0.6) {
          this.settled = true;
          this.vy = 0;
        }
      }
    } else {
      this.refreshGround();
      this.position.y = this.groundY;
    }

    if (this.life !== Infinity) {
      this.life -= dt;
      if (this.life <= 0) return this.destroy();
      this.visible = this.life > 2.5 || Math.floor(this.life * 8) % 2 === 0;
    }

    const p = this.game.player;
    if (p && p.alive && p.state !== 'dead' && this.overlaps(p)) {
      p.addStars(1);
      this.destroy();
      return;
    }
    super.update(dt);
  }
}
