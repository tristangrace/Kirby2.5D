/**
 * Tile type registry.
 *
 * A tile is a column of ground: `top` and `side` name surfaces from
 * gfx/Textures.js, `height` is the top of the column in world units (0 = the
 * default ground level) and `walkable` says whether entities may stand on it.
 * Whether an entity can *reach* a walkable tile is decided by comparing
 * heights (see Level.isWalkable), so a tall walkable tile behaves as a wall
 * from the ground and as a platform when Kirby flies up onto it.
 *
 * `liquid` tiles can be flown over but not stood on: landing in one dunks you.
 */
export const TILE_BASE_Y = -1.5; // bottom of every tile column

const tiles = new Map(
  Object.entries({
    grass: { top: 'grass', side: 'dirt', height: 0, walkable: true },
    flowers: { top: 'flowers', side: 'dirt', height: 0, walkable: true },
    dirt: { top: 'dirt', side: 'dirt', height: 0, walkable: true },
    sand: { top: 'sand', side: 'sand', height: -0.15, walkable: true },
    bridge: { top: 'wood', side: 'wood', height: 0, walkable: true },
    ledge: { top: 'grass', side: 'dirt', height: 0.5, walkable: true },
    stone: { top: 'stone', side: 'stone', height: 1, walkable: true },
    tallStone: { top: 'stone', side: 'stone', height: 1.5, walkable: true },
    wall: { top: 'stone', side: 'stone', height: 2, walkable: true },
    hedge: { top: 'leaf', side: 'leaf', height: 1, walkable: true },
    tree: { top: 'leaf', side: 'bark', height: 2.2, walkable: true },
    redTree: { top: 'redLeaf', side: 'bark', height: 2.2, walkable: true },
    water: { top: 'water', side: 'water', height: -0.4, walkable: false, liquid: true },
  }),
);

export function registerTile(name, def) {
  tiles.set(name, { walkable: true, height: 0, liquid: false, ...def, name });
}

export function getTile(name) {
  const def = tiles.get(name);
  if (!def) throw new Error('Unknown tile type: ' + name);
  return def;
}

for (const [name, def] of tiles) {
  def.name = name;
  def.liquid = !!def.liquid;
}
