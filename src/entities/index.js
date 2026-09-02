import { registerEntity } from './registry.js';
import { Player } from './Player.js';

// Built-in entity types. Add enemies / items here as they are written, e.g.
//   import { WaddleDee } from './enemies/WaddleDee.js';
//   registerEntity(WaddleDee);
registerEntity(Player);

export { registerEntity, createEntity, listEntityTypes } from './registry.js';
