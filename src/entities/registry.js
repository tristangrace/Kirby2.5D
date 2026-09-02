/**
 * Entity type registry: maps the `type` string used in level data to a class.
 * Register enemies, items, etc. in entities/index.js.
 */
const registry = new Map();

export function registerEntity(EntityClass, type = EntityClass.type) {
  if (!type || type === 'entity') throw new Error('Entity class needs a static `type`');
  registry.set(type, EntityClass);
}

export function createEntity(type, game, opts = {}) {
  const EntityClass = registry.get(type);
  if (!EntityClass) throw new Error('Unknown entity type: ' + type);
  return new EntityClass(game, opts);
}

export function listEntityTypes() {
  return [...registry.keys()];
}
