import { SpriteEntity } from './SpriteEntity.js';
import { getShopSheet } from '../gfx/sprites/FxSprites.js';

/**
 * A market stall. Walk up to it and press B to open the ability shop
 * (the player looks for `isShop` entities within reach).
 */
export class ShopStall extends SpriteEntity {
  static type = 'shop';

  constructor(game, opts) {
    super(game, opts, getShopSheet());
    this.team = 'neutral';
    this.isShop = true;
    this.radius = 0.7;
    this.height = 1.4;
  }

  update(dt) {
    this.refreshGround();
    this.position.y = this.groundY;
    super.update(dt);
  }
}
