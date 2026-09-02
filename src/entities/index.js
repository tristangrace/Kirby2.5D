import { registerEntity } from './registry.js';
import { Player } from './Player.js';
import { Effect } from './Effect.js';
import { Projectile } from './Projectile.js';
import { WaddleDee } from './enemies/WaddleDee.js';
import { WaddleDoo } from './enemies/WaddleDoo.js';
import { BrontoBurt } from './enemies/BrontoBurt.js';
import { Cappy } from './enemies/Cappy.js';
import { Apple } from './enemies/Apple.js';
import { WhispyWoods } from './enemies/WhispyWoods.js';
import { MaximTomato } from './items/MaximTomato.js';

// Built-in entity types. Level data spawns these by their static `type`.
for (const E of [Player, Effect, Projectile, WaddleDee, WaddleDoo, BrontoBurt, Cappy, Apple, WhispyWoods, MaximTomato]) {
  registerEntity(E);
}

export { registerEntity, createEntity, listEntityTypes } from './registry.js';
