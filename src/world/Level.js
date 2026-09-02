import * as THREE from 'three';
import { getTile, TILE_BASE_Y } from './Tiles.js';
import { getTileTexture, updateTextures } from '../gfx/Textures.js';

/**
 * A level built from a LevelData object (see world/levels/hello.js):
 *
 *   {
 *     id, name,
 *     legend: { '.': 'grass', '~': 'water', ' ': null },
 *     rows: ['....', '.~~.'],          // row index = z, column index = x
 *     spawn: { col, row },
 *     entities: [{ type, col, row, ...extra }],
 *   }
 *
 * Tile (col, row) occupies x in [col, col+1), z in [row, row+1). The level
 * owns the tile meshes and answers walkability / height queries for entities.
 */
export class Level {
  constructor(data) {
    this.data = data;
    this.depth = data.rows.length;
    this.width = Math.max(...data.rows.map((r) => r.length));
    this.cells = new Array(this.width * this.depth).fill(null);
    this.group = new THREE.Group();
    this.group.name = 'level:' + data.id;
    this._materials = [];
    this._geometry = null;

    for (let row = 0; row < this.depth; row++) {
      const line = data.rows[row];
      for (let col = 0; col < this.width; col++) {
        const ch = line[col] ?? ' ';
        if (!(ch in data.legend)) throw new Error('Level ' + data.id + ': no legend entry for "' + ch + '"');
        const name = data.legend[ch];
        this.cells[row * this.width + col] = name ? getTile(name) : null;
      }
    }
  }

  /** Tile definition at integer cell coords, or null for void / out of bounds. */
  tileAt(col, row) {
    if (col < 0 || row < 0 || col >= this.width || row >= this.depth) return null;
    return this.cells[row * this.width + col];
  }

  /** Tile definition under a world position. */
  tileAtWorld(x, z) {
    return this.tileAt(Math.floor(x), Math.floor(z));
  }

  /** Ground height under a world position, or null over void. */
  heightAt(x, z) {
    const tile = this.tileAtWorld(x, z);
    return tile ? tile.height : null;
  }

  /** Can something standing at `fromHeight` move onto the tile under (x, z)? */
  isWalkable(x, z, fromHeight, maxStep = 0.55) {
    const tile = this.tileAtWorld(x, z);
    if (!tile || !tile.walkable) return false;
    return Math.abs(tile.height - fromHeight) <= maxStep;
  }

  spawnPoint() {
    const { col, row } = this.data.spawn;
    return { x: col + 0.5, z: row + 0.5 };
  }

  /** Create one InstancedMesh per (top, side) surface pair and add it to the scene. */
  build(scene) {
    this._geometry = new THREE.BoxGeometry(1, 1, 1);
    const buckets = new Map();

    for (let row = 0; row < this.depth; row++) {
      for (let col = 0; col < this.width; col++) {
        const tile = this.tileAt(col, row);
        if (!tile) continue;
        const key = tile.top + '|' + tile.side;
        if (!buckets.has(key)) buckets.set(key, { tile, cells: [] });
        buckets.get(key).cells.push({ col, row, height: tile.height });
      }
    }

    const m = new THREE.Matrix4();
    for (const { tile, cells } of buckets.values()) {
      const top = new THREE.MeshLambertMaterial({ map: getTileTexture(tile.top) });
      const side = new THREE.MeshLambertMaterial({ map: getTileTexture(tile.side) });
      this._materials.push(top, side);
      // BoxGeometry face groups: +x, -x, +y, -y, +z, -z
      const mesh = new THREE.InstancedMesh(this._geometry, [side, side, top, side, side, side], cells.length);
      cells.forEach(({ col, row, height }, i) => {
        const h = height - TILE_BASE_Y;
        m.makeScale(1, h, 1);
        m.setPosition(col + 0.5, TILE_BASE_Y + h / 2, row + 0.5);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }

    scene.add(this.group);
  }

  update(dt, elapsed) {
    updateTextures(elapsed);
  }

  dispose(scene) {
    scene.remove(this.group);
    for (const child of this.group.children) child.dispose?.();
    for (const mat of this._materials) mat.dispose();
    this._geometry?.dispose();
    this.group.clear();
  }
}
