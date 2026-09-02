import { SpriteEntity } from '../SpriteEntity.js';
import { getMaximTomatoSheet } from '../../gfx/sprites/FxSprites.js';

/** Full heal. Bobs gently until Kirby touches it. */
export class MaximTomato extends SpriteEntity {
  static type = 'maximTomato';

  constructor(game, opts) {
    super(game, opts, getMaximTomatoSheet());
    this.team = 'neutral';
    this.radius = 0.3;
    this.height = 0.7;
  }

  update(dt) {
    this.refreshGround();
    this.position.y = this.groundY;
    const p = this.game.player;
    if (p && p.alive && this.overlaps(p)) {
      p.heal(p.maxHp);
      this.game.spawn('effect', { kind: 'sparkle', x: this.position.x, y: this.position.y + 0.3, z: this.position.z, rise: 0.8 });
      this.game.events.emit('item:collected', this);
      this.destroy();
      return;
    }
    super.update(dt);
  }
}
