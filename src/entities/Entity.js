import * as THREE from 'three';

/**
 * Base class for everything that lives in a level: the player, enemies,
 * pickups, doors. Subclasses override the lifecycle hooks; Game drives them.
 *
 * Every entity has a cylinder hitbox (radius around its position on the
 * ground plane, `height` upward from position.y) and a `team` so projectiles
 * and contact checks know who hurts whom.
 */
export class Entity {
  /** Registry key. Subclasses set this so level data can spawn them by name. */
  static type = 'entity';

  constructor(game, { x = 0, z = 0 } = {}) {
    this.game = game;
    this.position = new THREE.Vector3(x, 0, z);
    this.groundY = 0;
    this.alive = true;
    this.radius = 0.3;
    this.height = 0.8;
    this.team = 'neutral'; // 'player' | 'enemy' | 'neutral'
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

  /** Horizontal (ground-plane) distance to another entity. */
  distanceXZ(other) {
    return Math.hypot(other.position.x - this.position.x, other.position.z - this.position.z);
  }

  /** Cylinder-vs-cylinder overlap test. */
  overlaps(other) {
    if (this.distanceXZ(other) > this.radius + other.radius) return false;
    const a0 = this.position.y;
    const a1 = a0 + this.height;
    const b0 = other.position.y;
    const b1 = b0 + other.height;
    return a0 < b1 && b0 < a1;
  }
}
