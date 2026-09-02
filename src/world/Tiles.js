/**
 * Tile type registry.
 *
 * A tile is a column of ground: `top` and `side` name surfaces from
 * gfx/Textures.js, `height` is the top of the column in world units (0 = the
 * default ground level) and `walkable` says whether entities may stand on it.
 * Whether an entity can *reach* a walkable tile is decided by comparing
 * heights (see Level.isWalkable), so a tall walkable tile behaves as a wall
 * from the ground and as a platform from a ledge.
 */
export const TILE_BASE_Y = -1.5; // bottom of every tile column

const tiles = new Map(
  Object.entries({
    grass: { top: 'grass', side: 'dirt', height: 0, walkable: true },
    dirt: { top: 'dirt', side: 'dirt', height: 0, walkable: true },
    sand: { top: 'sand', side: 'sand', height: -0.15, walkable: true },
    ledge: { top: 'grass', side: 'dirt', height: 0.5, walkable: true },
    stone: { top: 'stone', side: 'stone', height: 1, walkable: true },
    wall: { top: 'stone', side: 'stone', height: 2, walkable: false },
    water: { top: 'water', side: 'water', height: -0.4, walkable: false },
  }),
);

export function registerTile(name, def) {
  tiles.set(name, { walkable: true, height: 0, ...def, name });
}

export function getTile(name) {
  const def = tiles.get(name);
  if (!def) throw new Error('Unknown tile type: ' + name);
  return def;
}

for (const [name, def] of tiles) def.name = name;
