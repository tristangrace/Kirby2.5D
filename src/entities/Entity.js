import * as THREE from 'three';

/**
 * Base class for everything that lives in a level: the player, enemies,
 * pickups, doors. Subclasses override the lifecycle hooks; Game drives them.
 */
export class Entity {
  /** Registry key. Subclasses set this so level data can spawn them by name. */
  static type = 'entity';

  constructor(game, { x = 0, z = 0 } = {}) {
    this.game = game;
    this.position = new THREE.Vector3(x, 0, z);
    this.groundY = 0;
    this.alive = true;
  }

  /** Add meshes to the scene. */
  onSpawn(scene) {}

  update(dt) {}

  /** Remove meshes and release GPU resources. */
  onDespawn(scene) {}

  /** Mark for removal; Game despawns it at the end of the frame. */
  destroy() {
    this.alive = false;
  }
}
